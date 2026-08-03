# PalleBot Worker

Denne mappe er den serverless version af PalleBot. Telegram sender beskeder til en Cloudflare Worker, som kun kører, når der er en besked eller et planlagt påmindelsestjek. Noter, indkøb, påmindelser og samtalestatus gemmes i Cloudflare D1.

Det betyder, at PalleBot kan bruges fra Telegram på mobilen uden en tændt privat computer.

## Gratis drift

Løsningen bruger Cloudflare Workers Free og D1 Free. Den er designet til PalleBots lave, personlige trafik. Hvis Cloudflares gratisgrænser overskrides, stopper databasen med at svare indtil næste dags reset; der oprettes aldrig automatisk betaling.

Telegram-bottens token er stadig nødvendig, men den er gratis. Den må aldrig gemmes i GitHub eller i `wrangler.jsonc`.

## Funktioner

- Telegram-webhook på `POST /telegram`
- Sundhedstjek på `GET /health`
- Brugeropdelte noter, indkøb, påmindelser og samtaler
- `Annuller` eller `/cancel` afbryder en igangværende påmindelse
- Påmindelser afsendes via et cron-job hvert minut
- Datoer som `om 10 minutter`, `i morgen klokken 14` og `på fredag klokken 09`

## Første opsætning

1. Opret en gratis Cloudflare-konto, og installer Node.js på den computer, du bruger til opsætningen.
2. Åbn en terminal i denne mappe og kør `npm install` efterfulgt af `npx wrangler login`.
3. Opret databasen med `npx wrangler d1 create pallebot`.
4. Kopiér det returnerede database-id ind i `wrangler.jsonc` i feltet `database_id`.
5. Opret tabellerne:

   ```powershell
   npx wrangler d1 execute pallebot --remote --file=schema.sql
   ```

6. Gem de tre hemmeligheder. Indtast værdierne, når Wrangler spørger:

   ```powershell
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put OWNER_USER_ID
   ```

   `TELEGRAM_WEBHOOK_SECRET` skal være en lang tilfældig tekst. `OWNER_USER_ID` er dit Telegram-bruger-id og gør botten privat.

7. Deploy Worker'en:

   ```powershell
   npx wrangler deploy
   ```

8. Sæt Telegram-webhook'en til den URL, Wrangler viser, med `/telegram` til sidst. I PowerShell kan du midlertidigt sætte de to miljøvariabler og køre scriptet:

   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "din-token"
   $env:TELEGRAM_WEBHOOK_SECRET = "din-hemmelighed"
   node scripts/set-webhook.mjs https://din-worker.workers.dev/telegram
   ```

Når det virker, skal de to midlertidige PowerShell-variabler fjernes ved at lukke terminalen.

## Flytning af nuværende data

Den eksisterende Python-bot beholder sine data i `data/`. Når D1-tabellerne er oprettet, kan du generere en privat SQL-importfil:

```powershell
node scripts/generate-import-sql.mjs > data-import.sql
npx wrangler d1 execute pallebot --remote --file=data-import.sql
```

`data-import.sql` er ignoreret af Git og må ikke deles, da den indeholder dine noter og påmindelser.

## GitHub-deploy

Workflowet i `.github/workflows/deploy-worker.yml` deployer automatisk ved ændringer i `worker/` på `main`.

Tilføj kun `CLOUDFLARE_API_TOKEN` som GitHub Actions-secret. Telegram-hemmelighederne bliver i Cloudflare og skal ikke oprettes som GitHub-secrets.

## Lokal test

```powershell
npm test
```
