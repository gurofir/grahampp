# Graham++

Mobile-first, bilingual (Hebrew/English, RTL-aware) web app that runs a
Graham-Buffett style fundamental analysis on a stock ticker.

- Fetches fundamentals from Yahoo Finance via a Netlify Function
- Runs a 5-filter Graham++ screen + Forward-P/E and DCF fair value
- Uses Anthropic Claude for the qualitative verdict rationale and moat call
- Saves theses locally (localStorage) and refreshes prices on demand

## Tech stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- react-i18next (English + Hebrew, automatic RTL/LTR)
- Netlify Functions (`analyze`, `price`)
- `yahoo-finance2` and `@anthropic-ai/sdk`

## Setup

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY
```

Local development (recommended): `npm run dev` — Vite runs the Netlify
Functions in-process through a dev middleware, so `/.netlify/functions/*`
calls work with no extra setup. `.env` values (e.g. `ANTHROPIC_API_KEY`)
are loaded automatically for the function handlers.

Alternatively, with the real Netlify CLI runtime:

```bash
npm run dev:netlify
```

### Running behind a corporate TLS proxy (e.g. inside Payoneer VPN)

Node does not trust the corporate MITM CA by default, so calls to
`yahoo-finance2` / `api.anthropic.com` may fail with
`SELF_SIGNED_CERT_IN_CHAIN`. Point Node at the corporate CA bundle
**before** starting the dev server (do not disable TLS verification):

PowerShell:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\corporate-ca.pem"
npm run dev
```

bash:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
npm run dev
```

Node requires version 20 minimum; `yahoo-finance2` v3 prefers Node 22+.

## Deploy

- Push to a Netlify-connected repo; `netlify.toml` configures the build.
- Set `ANTHROPIC_API_KEY` in Site settings → Environment variables.

## Project structure

```
netlify/functions/
  analyze.js            Yahoo + Graham + Claude orchestrator
  price.js              Price refresh for saved theses
  shared/graham.js      Shared Graham analysis logic (CJS)
src/
  components/           UI (VerdictCard, Filters, Growth, Valuation, Timeline...)
  hooks/useTheses.ts    localStorage-backed thesis tracking
  i18n/                 en.json, he.json, i18next config
  lib/graham.ts         TypeScript types + UI helpers
  App.tsx, main.tsx
```
