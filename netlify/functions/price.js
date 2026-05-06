const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function pickEarningsDate(summary) {
  const cal = summary && summary.calendarEvents && summary.calendarEvents.earnings;
  if (!cal) return null;
  const dates = Array.isArray(cal.earningsDate) ? cal.earningsDate : [];
  if (dates.length === 0) return null;
  const first = dates[0];
  if (!first) return null;
  if (first instanceof Date) return first.toISOString();
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && typeof first.raw === 'number') {
    return new Date(first.raw * 1000).toISOString();
  }
  return null;
}

exports.handler = async (event) => {
  const rawTicker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();

  if (!TICKER_RE.test(rawTicker)) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid ticker' }),
    };
  }

  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(rawTicker),
      yahooFinance
        .quoteSummary(rawTicker, { modules: ['calendarEvents'] })
        .catch(() => null),
    ]);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        ticker: rawTicker,
        price: quote.regularMarketPrice ?? null,
        change: quote.regularMarketChangePercent ?? null,
        currency: quote.currency ?? 'USD',
        earningsDate: pickEarningsDate(summary),
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[price] error:', err);
      const code = err && err.cause && err.cause.code;
      if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
        console.error(
          '[price] TLS chain rejected. If you are behind a corporate proxy, set NODE_EXTRA_CA_CERTS to your corporate CA bundle before starting the dev server.',
        );
      }
    }
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to fetch price' }),
    };
  }
};
