'use strict';

const { computeIndicators } = require('./shared/indicators');
const { fetchFundamentals } = require('./shared/fetcher');

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

const CACHE_TTL_HOURS = 6;

const errorResponse = (statusCode, messageKey) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify({ error: messageKey }),
});

// Lazy-load supabase client so the function still works without env vars set.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key);
  } catch {
    return null;
  }
}

async function readCache(ticker) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const threshold = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
  try {
    const { data } = await supabase
      .from('situations')
      .select('full_analysis, scanned_at')
      .eq('ticker', ticker)
      .gte('scanned_at', threshold)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch (err) {
    console.error('[analyze] cache read failed:', err && err.message);
    return null;
  }
}

exports.handler = async (event) => {
  const rawTicker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();

  if (!TICKER_RE.test(rawTicker)) {
    return errorResponse(400, 'tickerNotFound');
  }

  // Cache fast-path: if we ran this ticker in the last 6h, serve the stored
  // full analysis (includes dualEngine + plainSummary). The frontend should
  // then skip the /interpret call entirely. ?fresh=1 forces a re-analysis.
  const skipCache = event.queryStringParameters?.fresh === '1';
  const cached = skipCache ? null : await readCache(rawTicker);
  if (cached?.full_analysis) {
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'X-Cache': 'HIT' },
      body: JSON.stringify({
        ...cached.full_analysis,
        fromCache: true,
        cachedAt: cached.scanned_at,
      }),
    };
  }

  try {
    const raw = await fetchFundamentals(rawTicker);

    if (!raw.currentPrice || !raw.revenues.length) {
      return errorResponse(404, 'tickerNotFound');
    }

    // Layer 2: indicators + scale positions. AI runs in /interpret.
    const { indicators, intrinsicValue } = computeIndicators(raw);

    const latestRevenue = raw.revenues.length
      ? raw.revenues[raw.revenues.length - 1]
      : null;

    const fcfYieldInd = indicators.D4_fcfYield;
    const fcfYield = fcfYieldInd && typeof fcfYieldInd.value === 'number'
      ? fcfYieldInd.value
      : null;

    const analysis = {
      ticker: raw.ticker,
      companyName: raw.companyName,
      currency: raw.currency,
      currentPrice: raw.currentPrice,
      dailyChangePct: raw.dailyChangePct,
      low52: raw.low52,
      high52: raw.high52,
      sector: raw.sector,
      country: raw.country,
      businessSummary: raw.businessSummary,
      revenue: latestRevenue,
      marketCap: raw.marketCap,
      sharesOutstanding: raw.sharesOutstanding,
      peRatio: raw.peRatio,
      fcfYield,
      earningsDate: raw.earningsDate,
      intrinsicValue,
      indicators,
      ai: null,
      dualEngine: null,
      generatedAt: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(analysis),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[analyze] error:', err);
      const code = err && err.cause && err.cause.code;
      if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
        console.error(
          '[analyze] TLS chain rejected. If you are behind a corporate proxy, set NODE_EXTRA_CA_CERTS to your corporate CA bundle before starting the dev server.',
        );
      }
    }
    const message = err && err.message ? String(err.message) : '';
    if (/not found|No data/i.test(message)) {
      return errorResponse(404, 'tickerNotFound');
    }
    return errorResponse(500, 'generic');
  }
};
