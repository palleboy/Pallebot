import * as XLSX from "xlsx";

const TIME_ZONE = "Europe/Copenhagen";

const HELP_TEXT = [
  "🤖 PalleBot hjælper med noter, indkøb og påmindelser.",
  "",
  "Eksempler:",
  "• Gem note ring til lægen",
  "• Tilføj mælk",
  "• Vis indkøbslisten",
  "• Husk mig på at købe mælk",
  "• Send et billede af en kvittering",
  "• Kvitteringsoversigt marts",
  "• Annuller",
].join("\n");

const MAIN_MENU = {
  keyboard: [
    ["📝 Noter", "🛒 Indkøb"],
    ["⏰ Påmindelser", "🧾 Kvitteringer"],
    ["💰 Budget", "📎 Excel-eksport"],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await request.json();
    await handleTelegramUpdate(update, env);
    return new Response("OK");
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(sendDueReminders(env));
    ctx.waitUntil(sendBudgetAlerts(env));
  },
};

export async function handleTelegramUpdate(update, env, now = new Date()) {
  const message = update.message;
  if (!message?.from || !message.chat) {
    return;
  }

  const userId = String(message.from.id);
  if (env.OWNER_USER_ID && userId !== String(env.OWNER_USER_ID)) {
    await sendTelegramMessage(env, message.chat.id, "Denne bot er privat.");
    return;
  }

  if (message.photo?.length || isReceiptDocument(message.document)) {
    const response = await saveReceiptFromTelegram(env, message, now);
    await sendTelegramMessage(env, message.chat.id, response);
    return;
  }

  if (!message.text) return;

  const response = await processMessage(
    env.DB,
    {
      userId,
      chatId: String(message.chat.id),
      text: message.text,
    },
    now,
    env,
  );
  await sendTelegramMessage(env, message.chat.id, response);
}

export async function processMessage(db, request, now = new Date(), env) {
  const text = request.text.trim();
  const normalized = normalize(text);
  const session = await getSession(db, request.userId);

  if (session?.state === "waiting_for_time") {
    if (isCancellation(normalized)) {
      await clearSession(db, request.userId);
      return "✅ Påmindelsen blev annulleret.";
    }

    const dueAt = parseReminderDate(text, now);
    if (!dueAt) {
      return [
        "❌ Jeg kunne ikke forstå tidspunktet.",
        "",
        "Prøv f.eks.",
        "• Om 10 minutter",
        "• I morgen klokken 14",
        "• På fredag klokken 09",
        "• Annuller",
      ].join("\n");
    }

    await db
      .prepare(
        "INSERT INTO reminders (user_id, chat_id, text, due_at, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(request.userId, request.chatId, session.data.text, dueAt.toISOString(), now.toISOString())
      .run();
    await clearSession(db, request.userId);
    return `✅ Påmindelse gemt!\n\n📝 ${session.data.text}\n⏰ ${formatDate(dueAt)}`;
  }

  if (session?.state === "confirming_receipt") {
    return confirmReceipt(db, request, session, normalized, text, now);
  }

  if (isCancellation(normalized)) {
    return "Der er ingen igangværende handling at annullere.";
  }

  if (normalized === "/start" || normalized === "/help" || normalized === "hjælp") {
    return HELP_TEXT;
  }

  if (normalized === "⏰ påmindelser") return "⏰ Skriv fx: Husk mig på at købe mælk.\n\nDu kan også skrive: Vis mine påmindelser eller Slet påmindelse 1.";
  if (normalized === "🧾 kvitteringer") return "🧾 Send et billede af en kvittering. Jeg viser varelinjerne først, og du kan skrive ja for at gemme dem.";
  if (normalized === "💰 budget") return "💰 Skriv fx: Sæt budget mad 2500\n\nSkriv budgetstatus for at se dit forbrug.";
  if (normalized === "📎 excel-eksport") return "📎 Skriv: Eksporter kvitteringsoversigt\n\nEller: Eksporter kvitteringsoversigt marts";

  if (matches(normalized, ["vis noter", "mine noter", "📝 noter"])) {
    return listNotes(db, request.userId);
  }

  if (matches(normalized, ["vis mine påmindelser", "mine påmindelser", "📋 påmindelser"])) {
    return listReminders(db, request.userId);
  }

  if (matches(normalized, ["vis indkøbslisten", "vis indkøbsliste", "indkøbsliste", "min indkøbsliste", "🛒 indkøb"])) {
    return listShopping(db, request.userId);
  }

  if (normalized === "budgetstatus") return budgetStatus(db, request.userId, now);

  if (normalized.startsWith("kvitteringsoversigt") || normalized.startsWith("budget") || normalized.startsWith("vis kvitteringer")) {
    return receiptSummary(db, request.userId, text, now);
  }

  const budgetLimit = text.match(/^sæt budget\s+(mad|snacks|drikke|grill|husholdning|andet)\s+(\d+(?:[,.]\d+)?)\s*(?:kr)?$/iu);
  if (budgetLimit) {
    const category = budgetLimit[1][0].toUpperCase() + budgetLimit[1].slice(1).toLowerCase();
    const limit = Number(budgetLimit[2].replace(",", "."));
    if (!Number.isFinite(limit) || limit <= 0) return "❌ Budgettet skal være større end 0 kr.";
    const monthKey = copenhagenDate(now).slice(0, 7);
    await db.prepare("INSERT INTO budget_limits (user_id, chat_id, category, monthly_limit, month_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, category, month_key) DO UPDATE SET monthly_limit = excluded.monthly_limit, chat_id = excluded.chat_id, alerted_80 = 0, alerted_100 = 0")
      .bind(request.userId, request.chatId, category, limit, monthKey).run();
    return `✅ Budget for ${category} i ${monthKey} er sat til ${formatMoney(limit)}.`;
  }


  if (normalized.startsWith("eksporter kvitteringsoversigt") || normalized.startsWith("eksporter budget")) {
    return exportReceiptExcel(db, request, text, now, env);
  }

  const deleteNotes = numberedCommands(normalized, ["slet note", "fjern note"]);
  if (deleteNotes.length) {
    return deleteByPositions(db, "notes", request.userId, deleteNotes, "note");
  }

  const deleteReminders = numberedCommands(normalized, ["slet påmindelse", "fjern påmindelse"]);
  if (deleteReminders.length) {
    return deleteByPositions(db, "reminders", request.userId, deleteReminders, "påmindelse", true);
  }

  const deleteItems = numberedCommands(normalized, ["slet vare", "fjern vare", "slet indkøb", "fjern indkøb"]);
  if (deleteItems.length) {
    return deleteByPositions(db, "shopping_items", request.userId, deleteItems, "vare");
  }

  const checkedItems = numberedCommands(normalized, ["købt", "færdig", "marker købt"]);
  if (checkedItems.length) {
    const items = await Promise.all(checkedItems.map((position) => itemAtPosition(db, "shopping_items", request.userId, position, false)));
    const found = items.filter(Boolean);
    if (!found.length) return "❌ Jeg kunne ikke finde varerne.";
    await db.batch(found.map((item) => db.prepare("UPDATE shopping_items SET done = 1 WHERE id = ?").bind(item.id)));
    return `✅ ${found.length} ${found.length === 1 ? "vare er" : "varer er"} markeret som købt.`;
  }

  const reminderText = extractAfterPrefix(text, normalized, [
    "husk mig på at",
    "husk mig",
    "husk",
    "mind mig om at",
    "mind mig om",
    "påmind mig om",
  ]);
  if (reminderText) {
    await saveSession(db, request.userId, "waiting_for_time", { text: reminderText }, now);
    return "⏰ Hvornår skal jeg minde dig om det?";
  }

  const noteText = extractAfterPrefix(text, normalized, [
    "gem note",
    "gem",
    "notér at",
    "notér",
    "noter at",
    "noter",
    "skriv ned at",
    "skriv ned",
  ]);
  if (noteText) {
    await db.prepare("INSERT INTO notes (user_id, text, created_at) VALUES (?, ?, ?)")
      .bind(request.userId, noteText, now.toISOString()).run();
    return `✅ Note gemt:\n\n📝 ${noteText}`;
  }

  const itemText = extractAfterPrefix(text, normalized, ["tilføj", "køb", "købe", "jeg mangler"]);
  if (itemText) {
    const cleanText = itemText
      .replace(/til indkøbslisten/iu, "")
      .replace(/på indkøbslisten/iu, "")
      .trim();
    if (!cleanText) return "❌ Hvilken vare vil du tilføje?";
    await db.prepare("INSERT INTO shopping_items (user_id, text, created_at) VALUES (?, ?, ?)")
      .bind(request.userId, cleanText, now.toISOString()).run();
    return `🛒 Tilføjet:\n\n${cleanText}`;
  }

  return chatWithAi(db, request.userId, text, now, env);
}

async function listNotes(db, userId) {
  const { results } = await db.prepare("SELECT text FROM notes WHERE user_id = ? ORDER BY id")
    .bind(userId).all();
  if (!results.length) return "📝 Du har ingen noter endnu.";
  return ["📝 Dine noter:", "", ...results.map((note, index) => `${index + 1}. ${note.text}`)].join("\n");
}

const RECEIPT_CATEGORIES = ["Mad", "Snacks", "Drikke", "Grill", "Husholdning", "Andet"];

async function saveReceiptFromTelegram(env, message, now) {
  try {
    const fileId = message.photo?.at(-1)?.file_id ?? message.document?.file_id;
    const file = await telegramFile(env, fileId);
    const image = `data:${file.contentType};base64,${toBase64(file.bytes)}`;
    const analysis = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
      messages: [{
        role: "user",
        content: `Læs denne danske butikskvittering. Returnér KUN JSON: {"store":"navn eller tom", "date":"YYYY-MM-DD eller tom", "items":[{"name":"kort, almindeligt varenavn", "category":"Mad|Snacks|Drikke|Grill|Husholdning|Andet", "line_total":12.50}]}. Medtag kun købte varer. line_total er hele beløbet for linjen, inklusiv antal. Normalisér samme produkt konsekvent, men hold forskellige varianter adskilt.`,
      }],
      image,
      max_tokens: 900,
    });
    const receipt = parseAiJson(analysis.response ?? analysis.result ?? analysis);
    const items = Array.isArray(receipt.items) ? receipt.items
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        category: RECEIPT_CATEGORIES.includes(item.category) ? item.category : "Andet",
        lineTotal: Number(item.line_total),
      }))
      .filter((item) => item.name && Number.isFinite(item.lineTotal) && item.lineTotal >= 0) : [];
    if (!items.length) return "❌ Jeg kunne ikke læse varelinjerne. Send gerne et skarpere foto af hele kvitteringen.";

    const date = /^\d{4}-\d{2}-\d{2}$/.test(receipt.date ?? "") ? receipt.date : copenhagenDate(now);
    await saveSession(env.DB, String(message.from.id), "confirming_receipt", { store: String(receipt.store ?? "").slice(0, 120), date, items }, now);
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return [
      `🧾 Kvittering fundet${receipt.store ? ` fra ${receipt.store}` : ""}.`,
      ...items.map((item) => `• ${item.name}: ${formatMoney(item.lineTotal)}`),
      "",
      `I alt: ${formatMoney(total)}`,
      "Skriv “ja” for at gemme, “ret 2 til 18” for at ændre en pris eller “annuller”.",
    ].join("\n");
  } catch (error) {
    console.error("Receipt analysis failed", error);
    return "❌ Kvitteringen kunne ikke behandles lige nu. Prøv igen om lidt.";
  }
}

async function telegramFile(env, fileId) {
  const metadata = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = await metadata.json();
  if (!json.ok || !json.result?.file_path) throw new Error("Telegram file unavailable");
  const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${json.result.file_path}`);
  if (!response.ok) throw new Error("Telegram file download failed");
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "image/jpeg" };
}

async function confirmReceipt(db, request, session, normalized, text, now) {
  if (isCancellation(normalized)) { await clearSession(db, request.userId); return "✅ Kvitteringen blev ikke gemt."; }
  if (["ja", "gem", "godkend"].includes(normalized)) {
    const data = session.data;
    const total = data.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const created = await db.prepare("INSERT INTO receipts (user_id, chat_id, store, receipt_date, total, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(request.userId, request.chatId, data.store, data.date, total, now.toISOString()).run();
    await db.batch(data.items.map((item) => db.prepare("INSERT INTO receipt_items (receipt_id, user_id, name, normalized_name, category, line_total) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(created.meta.last_row_id, request.userId, item.name, normalizeItemName(item.name), item.category, item.lineTotal)));
    await clearSession(db, request.userId);
    return `✅ Kvittering gemt. I alt: ${formatMoney(total)}.`;
  }
  const correction = text.match(/^ret\s+(\d+)\s+til\s+(\d+(?:[,.]\d+)?)\s*(?:kr)?$/iu);
  if (correction) {
    const item = session.data.items[Number(correction[1]) - 1];
    if (!item) return "❌ Jeg kunne ikke finde den varelinje.";
    item.lineTotal = Number(correction[2].replace(",", "."));
    await saveSession(db, request.userId, "confirming_receipt", session.data, now);
    return `✅ ${item.name} er rettet til ${formatMoney(item.lineTotal)}. Skriv “ja” for at gemme.`;
  }
  return "Skriv “ja” for at gemme, “ret 2 til 18” eller “annuller”.";
}

async function receiptSummary(db, userId, text, now) {
  const month = receiptMonth(text, now);
  const results = await receiptTotals(db, userId, month);
  if (!results.length) return `🧾 Ingen kvitteringsvarer i ${month.label}.`;
  const sections = RECEIPT_CATEGORIES.map((category) => {
    const items = results.filter((item) => item.category === category);
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + Number(item.total), 0);
    return [`${category}:`, ...items.map((item) => `• ${item.name}: ${formatMoney(item.total)}`), `I alt ${category}: ${formatMoney(total)}`].join("\n");
  }).filter(Boolean);
  const total = results.reduce((sum, item) => sum + Number(item.total), 0);
  return [`🧾 Kvitteringsoversigt — ${month.label}`, "", ...sections, "", `TOTAL: ${formatMoney(total)}`].join("\n\n");
}

async function exportReceiptExcel(db, request, text, now, env) {
  const month = receiptMonth(text, now);
  const results = await receiptTotals(db, request.userId, month);
  if (!results.length) return `🧾 Ingen kvitteringsvarer i ${month.label} at eksportere.`;
  const rows = [["Kategori", "Varenavn", "Beløb"]];
  for (const category of RECEIPT_CATEGORIES) {
    for (const item of results.filter((entry) => entry.category === category)) rows.push([category, item.name, Number(item.total)]);
  }
  rows.push(["", "TOTAL", results.reduce((sum, item) => sum + Number(item.total), 0)]);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[`Kvitteringsoversigt — ${month.label}`], [], ...rows]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 32 }, { wch: 14 }];
  for (let row = 4; row < rows.length + 3; row += 1) sheet[`C${row}`].z = '#,##0.00 "kr"';
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  await sendTelegramDocument(env, request.chatId, bytes, `kvitteringsoversigt-${month.start.slice(0, 7)}.xlsx`);
  return `📎 Excel-arket for ${month.label} er sendt.`;
}

async function receiptTotals(db, userId, month) {
  const { results } = await db.prepare(
    "SELECT category, MIN(name) AS name, SUM(line_total) AS total FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id WHERE ri.user_id = ? AND r.receipt_date >= ? AND r.receipt_date < ? GROUP BY category, normalized_name ORDER BY category, name",
  ).bind(userId, month.start, month.end).all();
  return results;
}

async function budgetStatus(db, userId, now) {
  const monthKey = copenhagenDate(now).slice(0, 7);
  const window = monthWindow(monthKey);
  const { results } = await db.prepare("SELECT category, monthly_limit FROM budget_limits WHERE user_id = ? AND month_key = ? ORDER BY category").bind(userId, monthKey).all();
  if (!results.length) return "Du har ikke sat et budget endnu. Prøv: sæt budget mad 2500";
  const lines = await Promise.all(results.map(async (limit) => {
    const used = await db.prepare("SELECT COALESCE(SUM(ri.line_total), 0) AS total FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id WHERE ri.user_id = ? AND ri.category = ? AND r.receipt_date >= ? AND r.receipt_date < ?")
      .bind(userId, limit.category, window.start, window.end).first();
    return `• ${limit.category}: ${formatMoney(used.total)} / ${formatMoney(limit.monthly_limit)}`;
  }));
  return ["💰 Budgetstatus", ...lines].join("\n");
}

async function chatWithAi(db, userId, text, now, env) {
  if (!env?.AI) return "🤖 Chat-AI er ikke aktiveret endnu.";
  try {
    const { results } = await db.prepare(
      "SELECT role, text FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 10",
    ).bind(userId).all();
    const messages = [
      { role: "system", content: "Du er PalleBot, en hjælpsom, kortfattet dansk personlig assistent. Svar på dansk. Du må ikke opfinde personlige data eller påstå at have udført handlinger, du ikke har udført." },
      ...results.reverse().map((message) => ({ role: message.role, content: message.text })),
      { role: "user", content: text },
    ];
    const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages, max_tokens: 350 });
    const answer = String(result.response ?? result.result ?? "Jeg kunne ikke formulere et svar.").trim();
    await db.batch([
      db.prepare("INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (?, 'user', ?, ?)").bind(userId, text, now.toISOString()),
      db.prepare("INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(userId, answer, now.toISOString()),
    ]);
    return answer;
  } catch (error) {
    console.error("AI chat failed", error);
    return "❌ Chat-AI er midlertidigt utilgængelig. Prøv igen om lidt.";
  }
}

function isReceiptDocument(document) {
  return Boolean(document?.mime_type?.startsWith("image/"));
}

function parseAiJson(value) {
  const text = String(value).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function toBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function normalizeItemName(value) {
  return value.toLocaleLowerCase("da-DK").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function copenhagenDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function receiptMonth(text, now) {
  const names = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
  const found = names.findIndex((name) => normalize(text).includes(name));
  const local = copenhagenParts(now);
  const month = found >= 0 ? found + 1 : local.month;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : local.year;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, end, label: `${names[month - 1]} ${year}` };
}

function monthWindow(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: `${monthKey}-01`,
    end: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(Number(value));
}

async function listShopping(db, userId) {
  const { results } = await db.prepare("SELECT text, done FROM shopping_items WHERE user_id = ? ORDER BY id")
    .bind(userId).all();
  if (!results.length) return "🛒 Din indkøbsliste er tom.";
  return ["🛒 Indkøbsliste:", "", ...results.map((item, index) => `${index + 1}. ${item.done ? "✅" : "⬜"} ${item.text}`)].join("\n");
}

async function listReminders(db, userId) {
  const { results } = await db.prepare(
    "SELECT text, due_at FROM reminders WHERE user_id = ? AND done = 0 ORDER BY due_at, id",
  ).bind(userId).all();
  if (!results.length) return "📭 Du har ingen aktive påmindelser.";
  return [
    "📋 Dine påmindelser:",
    "",
    ...results.map((reminder, index) => `${index + 1}. ${reminder.text}\n⏰ ${formatDate(new Date(reminder.due_at))}`),
  ].join("\n\n");
}

async function deleteByPositions(db, table, userId, positions, itemName, activeOnly = false) {
  const items = await Promise.all([...positions].sort((a, b) => b - a).map((position) => itemAtPosition(db, table, userId, position, activeOnly)));
  const found = items.filter(Boolean);
  if (!found.length) return `❌ Jeg kunne ikke finde de valgte ${itemName}r.`;
  await db.batch(found.map((item) => db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(item.id)));
  return `🗑️ ${found.length} ${found.length === 1 ? itemName : `${itemName}r`} blev slettet.`;
}

async function itemAtPosition(db, table, userId, position, activeOnly) {
  const activeFilter = activeOnly ? " AND done = 0" : "";
  const { results } = await db.prepare(
    `SELECT id FROM ${table} WHERE user_id = ?${activeFilter} ORDER BY id LIMIT 1 OFFSET ?`,
  ).bind(userId, position - 1).all();
  return results[0];
}

async function getSession(db, userId) {
  const row = await db.prepare("SELECT state, data FROM sessions WHERE user_id = ?")
    .bind(userId).first();
  return row ? { state: row.state, data: JSON.parse(row.data) } : null;
}

async function saveSession(db, userId, state, data, now) {
  await db.prepare(
    "INSERT INTO sessions (user_id, state, data, updated_at) VALUES (?, ?, ?, ?) "
      + "ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at",
  ).bind(userId, state, JSON.stringify(data), now.toISOString()).run();
}

async function clearSession(db, userId) {
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

export async function sendDueReminders(env, now = new Date()) {
  const { results } = await env.DB.prepare(
    "SELECT id, chat_id, text FROM reminders WHERE done = 0 AND due_at <= ? ORDER BY due_at",
  ).bind(now.toISOString()).all();

  for (const reminder of results) {
    await sendTelegramMessage(env, reminder.chat_id, `🔔 Påmindelse\n\n${reminder.text}`);
    await env.DB.prepare("UPDATE reminders SET done = 1 WHERE id = ? AND done = 0")
      .bind(reminder.id).run();
  }
}

async function sendBudgetAlerts(env, now = new Date()) {
  const monthKey = copenhagenDate(now).slice(0, 7);
  const window = monthWindow(monthKey);
  const { results } = await env.DB.prepare("SELECT * FROM budget_limits WHERE month_key = ?").bind(monthKey).all();
  for (const budget of results) {
    const used = await env.DB.prepare("SELECT COALESCE(SUM(ri.line_total), 0) AS total FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id WHERE ri.user_id = ? AND ri.category = ? AND r.receipt_date >= ? AND r.receipt_date < ?")
      .bind(budget.user_id, budget.category, window.start, window.end).first();
    const ratio = Number(used.total) / Number(budget.monthly_limit);
    const field = ratio >= 1 ? "alerted_100" : ratio >= 0.8 ? "alerted_80" : null;
    if (field && !budget[field]) {
      await sendTelegramMessage(env, budget.chat_id, `💰 Budgetalarm: ${budget.category} er på ${Math.round(ratio * 100)} % (${formatMoney(used.total)} af ${formatMoney(budget.monthly_limit)}).`);
      await env.DB.prepare(`UPDATE budget_limits SET ${field} = 1 WHERE id = ?`).bind(budget.id).run();
    }
  }
}

async function sendTelegramMessage(env, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: MAIN_MENU }),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage fejlede med HTTP ${response.status}.`);
  }
}

async function sendTelegramDocument(env, chatId, bytes, filename) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("document", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Telegram sendDocument fejlede med HTTP ${response.status}.`);
}

export function parseReminderDate(input, now = new Date()) {
  const text = normalize(input);
  if (text.includes("klokken") && !extractTime(text)) {
    return null;
  }
  const relative = text.match(/^om\s+(\d+)\s*(minut(?:ter)?|time(?:r)?|dag(?:e)?)$/u);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const milliseconds = unit.startsWith("minut") ? amount * 60_000
      : unit.startsWith("time") ? amount * 3_600_000
        : amount * 86_400_000;
    return new Date(now.getTime() + milliseconds);
  }

  const time = extractTime(text) ?? { hour: 9, minute: 0 };
  if (text.startsWith("i morgen")) {
    const today = copenhagenParts(now);
    return copenhagenToUtc(today.year, today.month, today.day + 1, time.hour, time.minute);
  }

  const weekdayMatch = text.match(/^på\s+(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:\s+klokken\s+\d{1,2}(?::\d{2})?)?$/u);
  if (weekdayMatch) {
    const days = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, søndag: 0 };
    const today = copenhagenParts(now);
    const current = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const delta = (days[weekdayMatch[1]] - current + 7) % 7 || 7;
    return copenhagenToUtc(today.year, today.month, today.day + delta, time.hour, time.minute);
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(?:klokken\s+)?(\d{1,2})(?::(\d{2}))?)?$/u);
  if (isoMatch) {
    return copenhagenToUtc(
      Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]),
      Number(isoMatch[4] ?? 9), Number(isoMatch[5] ?? 0),
    );
  }

  return null;
}

function extractTime(text) {
  const match = text.match(/klokken\s+(\d{1,2})(?::(\d{2}))?/u);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

function copenhagenParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function copenhagenToUtc(year, month, day, hour, minute) {
  const approximate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(approximate).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const offset = offsetName.match(/^GMT([+-])(\d{2}):(\d{2})$/u);
  if (!offset) return approximate;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
  return new Date(approximate.getTime() - minutes * 60_000);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function extractAfterPrefix(original, normalized, prefixes) {
  const prefix = prefixes.find((candidate) => normalized.startsWith(candidate));
  if (!prefix) return null;
  const value = original.slice(prefix.length).trim();
  return value || null;
}

function numberedCommands(text, prefixes) {
  const prefix = prefixes.find((candidate) => text.startsWith(`${candidate} `));
  if (!prefix) return [];
  const values = text.slice(prefix.length).trim();
  if (!/^\d+(?:\s*(?:,|og|&|også)\s*\d+)*$/u.test(values)) return [];
  return [...new Set((values.match(/\d+/g) ?? []).map(Number).filter((number) => number > 0))];
}

function matches(text, values) {
  return values.includes(text);
}

function isCancellation(text) {
  return ["annuller", "aflys", "/cancel"].includes(text);
}

function normalize(text) {
  return text.trim().toLocaleLowerCase("da-DK");
}
