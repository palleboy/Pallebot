# PalleBot

PalleBot er en personlig, modulær assistent med noter, indkøbsliste og påmindelser.

Den aktive, serverless Telegram-version ligger i [`worker/`](worker/). Den modtager Telegram-webhooks gennem Cloudflare Workers og gemmer data i Cloudflare D1, så den kan bruges fra Telegram uden en tændt privat computer.

## Projektstruktur

- `worker/` – den deploybare Cloudflare Worker og dens D1-database.
- `app/` – den Python-baserede kerne og Telegram-adapter, som bevares som lokal reference og udviklingsgrundlag.
- `tests/` – tests for Python-kernen.

## Cloudflare-deploy

Opsætning, hemmeligheder, dataimport og lokal test er beskrevet i [worker/README.md](worker/README.md).

Pushes til `main`, der ændrer `worker/`, deployes gennem GitHub Actions-workflowet i `.github/workflows/deploy-worker.yml`.

## Sikkerhed

`.env`, `data/*.json`, `.dev.vars`, Cloudflare Secrets og `node_modules` må ikke committes. Telegram-token og Cloudflare-adgangstokens gemmes kun som secrets.
