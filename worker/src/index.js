const TIME_ZONE = "Europe/Copenhagen";

const HELP_TEXT = [
  "🤖 PalleBot hjælper med noter, indkøb og påmindelser.",
  "",
  "Eksempler:",
  "• Gem note ring til lægen",
  "• Tilføj mælk",
  "• Vis indkøbslisten",
  "• Husk mig på at købe mælk",
  "• Annuller",
].join("\n");

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
  },
};

export async function handleTelegramUpdate(update, env, now = new Date()) {
  const message = update.message;
  if (!message?.text || !message.from || !message.chat) {
    return;
  }

  const userId = String(message.from.id);
  if (env.OWNER_USER_ID && userId !== String(env.OWNER_USER_ID)) {
    await sendTelegramMessage(env, message.chat.id, "Denne bot er privat.");
    return;
  }

  const response = await processMessage(
    env.DB,
    {
      userId,
      chatId: String(message.chat.id),
      text: message.text,
    },
    now,
  );
  await sendTelegramMessage(env, message.chat.id, response);
}

export async function processMessage(db, request, now = new Date()) {
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

  if (isCancellation(normalized)) {
    return "Der er ingen igangværende handling at annullere.";
  }

  if (normalized === "/start" || normalized === "/help" || normalized === "hjælp") {
    return HELP_TEXT;
  }

  if (matches(normalized, ["vis noter", "mine noter", "📝 noter"])) {
    return listNotes(db, request.userId);
  }

  if (matches(normalized, ["vis mine påmindelser", "mine påmindelser", "📋 påmindelser"])) {
    return listReminders(db, request.userId);
  }

  if (matches(normalized, ["vis indkøbslisten", "vis indkøbsliste", "indkøbsliste", "min indkøbsliste", "🛒 indkøb"])) {
    return listShopping(db, request.userId);
  }

  const deleteNote = numberedCommand(normalized, "slet note");
  if (deleteNote) {
    return deleteByPosition(db, "notes", request.userId, deleteNote, "Noten", "note");
  }

  const deleteReminder = numberedCommand(normalized, "slet påmindelse");
  if (deleteReminder) {
    return deleteByPosition(db, "reminders", request.userId, deleteReminder, "Påmindelsen", "påmindelse", true);
  }

  const deleteItem = numberedCommand(normalized, "slet vare") ?? numberedCommand(normalized, "fjern vare");
  if (deleteItem) {
    return deleteByPosition(db, "shopping_items", request.userId, deleteItem, "Varen", "vare");
  }

  const checkItem = numberedCommand(normalized, "købt") ?? numberedCommand(normalized, "færdig");
  if (checkItem) {
    const item = await itemAtPosition(db, "shopping_items", request.userId, checkItem, false);
    if (!item) return "❌ Jeg kunne ikke finde varen.";
    await db.prepare("UPDATE shopping_items SET done = 1 WHERE id = ?").bind(item.id).run();
    return "✅ Varen er markeret som købt.";
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

  return `🤔 Det forstod jeg ikke endnu.\n\n${HELP_TEXT}`;
}

async function listNotes(db, userId) {
  const { results } = await db.prepare("SELECT text FROM notes WHERE user_id = ? ORDER BY id")
    .bind(userId).all();
  if (!results.length) return "📝 Du har ingen noter endnu.";
  return ["📝 Dine noter:", "", ...results.map((note, index) => `${index + 1}. ${note.text}`)].join("\n");
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

async function deleteByPosition(db, table, userId, position, successName, itemName, activeOnly = false) {
  const item = await itemAtPosition(db, table, userId, position, activeOnly);
  if (!item) return `❌ Jeg kunne ikke finde den ${itemName}.`;
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(item.id).run();
  return `🗑️ ${successName} blev slettet.`;
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

async function sendTelegramMessage(env, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage fejlede med HTTP ${response.status}.`);
  }
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

function numberedCommand(text, prefix) {
  const match = text.match(new RegExp(`^${prefix}\\s+(\\d+)$`, "u"));
  return match ? Number(match[1]) : null;
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
