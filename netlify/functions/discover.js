'use strict';

// Discovery Engine — public read endpoint used by the frontend feed.
//
// GET /.netlify/functions/discover           → top featured situations
// GET /.netlify/functions/discover?all=1     → up to 50 situations
//
// Always returns 200 with a payload. If Supabase is not configured or the
// read fails, returns an empty list with `error` set so the UI can degrade
// gracefully (Discovery Feed simply hides itself).

const { createClient } = require('@supabase/supabase-js');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  // Browsers/CDN may cache for 5 minutes; scan only runs nightly.
  'Cache-Control': 'public, max-age=300, s-maxage=300',
};

const SELECT_FIELDS = [
  'id',
  'ticker',
  'company_name',
  'sector',
  'country',
  'current_price',
  'daily_change_pct',
  'low52',
  'high52',
  'setup_type',
  'graham_decision',
  'market_decision',
  'graham_confidence',
  'market_confidence',
  'graham_thesis',
  'market_thesis',
  'insight',
  'score',
  'situation_type',
  'scanned_at',
  'is_featured',
  'full_analysis',
].join(', ');

function emptyPayload(extra = {}) {
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      situations: [],
      totalCount: 0,
      featuredCount: 0,
      universeSize: 0,
      scannedAt: null,
      ...extra,
    }),
  };
}

exports.handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return emptyPayload({ error: 'supabase_not_configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const showAll = event.queryStringParameters?.all === '1';
  const limit = showAll ? 50 : 7;

  try {
    const nowIso = new Date().toISOString();
    const { data: situations, error } = await supabase
      .from('situations')
      .select(SELECT_FIELDS)
      .gte('expires_at', nowIso)
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[discover] situations query error:', error.message);
      return emptyPayload({ error: 'db_error' });
    }

    const { data: latestRun } = await supabase
      .from('scan_runs')
      .select('started_at, universe_size, featured_count, after_ai')
      .eq('status', 'done')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        situations: situations ?? [],
        totalCount: latestRun?.after_ai ?? situations?.length ?? 0,
        featuredCount:
          latestRun?.featured_count ?? Math.min(7, situations?.length ?? 0),
        universeSize: latestRun?.universe_size ?? 0,
        scannedAt: latestRun?.started_at ?? null,
      }),
    };
  } catch (err) {
    console.error('[discover] uncaught error:', err);
    return emptyPayload({ error: 'exception' });
  }
};
