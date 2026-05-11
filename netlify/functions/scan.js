'use strict';

// Discovery Engine — nightly scan endpoint.
//
// Usage:
//   GET /.netlify/functions/scan?token=$DISCOVERY_SCAN_TOKEN
//
// The cron mechanism (GitHub Actions, Netlify Pro schedule, or `netlify
// functions:invoke scan`) calls this endpoint. The shared bearer token
// prevents random callers from triggering an expensive scan. If
// DISCOVERY_SCAN_TOKEN is unset, the endpoint is open (use only locally).
//
// To enable Netlify Scheduled Function (requires Pro plan), uncomment:
//   exports.config = { schedule: '0 3 * * *' };
// and set the schedule under [functions.scan] in netlify.toml.

const { runScan } = require('./shared/discovery/scanRunner');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

function timingSafeEqual(a, b) {
  // Constant-time string comparison to avoid token-leakage timing attacks.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return require('crypto').timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  const expected = process.env.DISCOVERY_SCAN_TOKEN;
  if (expected) {
    const provided =
      event.queryStringParameters?.token ||
      (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!timingSafeEqual(provided, expected)) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: false, error: 'unauthorized' }),
      };
    }
  }

  try {
    const result = await runScan({
      log: (msg) => console.log(msg),
    });
    const status = result.ok ? 200 : 500;
    return {
      statusCode: status,
      headers: JSON_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('[scan] uncaught error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: 'scan_exception',
        detail: String(err?.message || err).slice(0, 240),
      }),
    };
  }
};
