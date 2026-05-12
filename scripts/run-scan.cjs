#!/usr/bin/env node
'use strict';

// Standalone Discovery Engine scan runner — invoked from GitHub Actions
// (or any Node-capable cron). Reads credentials from environment variables
// and writes the resulting situations directly to Supabase.
//
// Required env vars:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//
// Optional:
//   ANTHROPIC_MODEL    (default: claude-haiku-4-5)
//   SCAN_LANG          (he | en, default: he)
//   SCAN_MODE          (nightly | full, default: nightly)
//                      - nightly: scan the watchlist (top-N by score + recent
//                        searches). Fast and cheap; runs every day.
//                      - full: scan the entire SCAN_UNIVERSE. Slower; runs
//                        weekly to rotate the watchlist composition.
//
// Local dev (bypasses corporate TLS proxies via win-ca):
//   $env:NODE_EXTRA_CA_CERTS = ".\node_modules\win-ca\pem\roots.pem"
//   node scripts/run-scan.cjs
//
// Note: .cjs extension is required because the root package.json declares
// `"type": "module"`, which would otherwise force this file to be parsed as
// ESM and break the CommonJS `require()` calls below.

const path = require('path');
const { runScan } = require(
  path.join(__dirname, '..', 'netlify', 'functions', 'shared', 'discovery', 'scanRunner.js'),
);

(async () => {
  const start = Date.now();
  const mode = process.env.SCAN_MODE === 'full' ? 'full' : 'nightly';
  console.log(`[scan] requested mode=${mode}`);
  const result = await runScan({
    mode,
    log: (msg) => console.log(msg),
    lang: process.env.SCAN_LANG === 'en' ? 'en' : 'he',
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(`[scan] total elapsed: ${Date.now() - start}ms`);
  if (!result.ok) process.exit(1);
})().catch((err) => {
  console.error('[scan] uncaught error:', err);
  process.exit(1);
});
