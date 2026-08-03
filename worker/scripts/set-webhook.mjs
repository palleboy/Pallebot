const webhookUrl = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!webhookUrl || !token || !secret) {
  throw new Error(
    "Brug: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/set-webhook.mjs https://din-worker.workers.dev/telegram",
  );
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
  }),
});

const result = await response.json();
if (!result.ok) {
  throw new Error(`Telegram afviste webhook: ${result.description ?? "ukendt fejl"}`);
}

console.log("Telegram-webhook er sat.");
