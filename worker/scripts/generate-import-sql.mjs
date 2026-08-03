import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataDirectory = new URL("../../data/", import.meta.url);
const generatedAt = new Date().toISOString();

const files = {
  notes: await readCollection("notes"),
  shopping: await readCollection("shopping"),
  reminders: await readCollection("reminders"),
};

const statements = [];

for (const [userId, notes] of Object.entries(files.notes)) {
  for (const note of notes) {
    statements.push(
      `INSERT INTO notes (user_id, text, created_at) VALUES (${quote(userId)}, ${quote(note.text)}, ${quote(generatedAt)});`,
    );
  }
}

for (const [userId, items] of Object.entries(files.shopping)) {
  for (const item of items) {
    statements.push(
      `INSERT INTO shopping_items (user_id, text, done, created_at) VALUES (${quote(userId)}, ${quote(item.text)}, ${item.done ? 1 : 0}, ${quote(generatedAt)});`,
    );
  }
}

for (const [userId, reminders] of Object.entries(files.reminders)) {
  for (const reminder of reminders) {
    statements.push(
      `INSERT INTO reminders (user_id, chat_id, text, due_at, done, created_at) VALUES (${quote(userId)}, ${quote(reminder.chat_id)}, ${quote(reminder.text)}, ${quote(reminder.datetime)}, ${reminder.done ? 1 : 0}, ${quote(generatedAt)});`,
    );
  }
}

const output = `${statements.join("\n")}\n`;
const outputArgument = process.argv.indexOf("--output");

if (outputArgument !== -1) {
  const outputPath = process.argv[outputArgument + 1];
  if (!outputPath) throw new Error("--output kræver en filsti.");
  await writeFile(outputPath, output, "utf8");
} else {
  process.stdout.write(output);
}

async function readCollection(name) {
  const file = new URL(`${name}.json`, dataDirectory);
  const value = JSON.parse(await readFile(fileURLToPath(file), "utf8"));

  if (value.version === 2 && value.users) {
    return value.users;
  }

  throw new Error(`${name}.json skal være migreret til storage-version 2 først.`);
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
