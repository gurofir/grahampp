'use strict';

// Discovery Engine — shared pipeline used by:
//   - netlify/functions/scan.js  (Netlify Scheduled Function — requires Pro)
//   - scripts/run-scan.js        (standalone Node CLI, used by GitHub Actions cron)
//
// Pipeline:
//   1. Load S&P500 universe
//   2. Fast filter via cheap Yahoo quote/quoteSummary calls (parallel batches)
//   3. Compute full indicators on candidates
//   4. Run Graham + Market engines (with Reality Check) in parallel batches
//   5. Score, rank, mark top 7 as featured
//   6. Replace yesterday's situations in Supabase

const YahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

const { fetchFundamentals } = require('./fetcher');
const { computeIndicators } = require('./indicators');
const { buildPayload } = require('./aiPrompt');
const { runEngines } = require('./engines');
const { computeFindings, enforceHardBlockers } = require('./realityCheck');
const {
  deriveAlignment,
  deriveSetupType,
  deriveInsight,
  deriveGrahamLedAction,
  deriveCTALabel,
  deriveCTASub,
} = require('./alignment');
const { scoreSetup, detectSituationType } = require('./discoveryScoring');
const { SP500_TICKERS } = require('./universe');

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

const FAST_BATCH = 20;
const FAST_BATCH_DELAY_MS = 200;
const AI_BATCH = 5;
const AI_BATCH_DELAY_MS = 500;
const FEATURED_LIMIT = 7;
const TTL_HOURS = 24;

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'raw' in v && typeof v.raw === 'number') return v.raw;
  return null;
}

async function quickFetch(ticker) {
  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance
        .quoteSummary(ticker, {
          modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
        })
        .catch(() => ({})),
    ]);
    const sd = summary.summaryDetail || {};
    const fd = summary.financialData || {};
    const fcf = num(fd.freeCashflow);
    const mc = num(sd.marketCap);
    return {
      ticker,
      currentPrice: num(quote.regularMarketPrice),
      peRatio: num(sd.trailingPE),
      marketCap: mc,
      debtEquity: num(sd.debtToEquity),
      low52: num(sd.fiftyTwoWeekLow) ?? num(quote.fiftyTwoWeekLow),
      high52: num(sd.fiftyTwoWeekHigh) ?? num(quote.fiftyTwoWeekHigh),
      grossMargin: num(fd.grossMargins),
      fcfYield: fcf && mc ? (fcf / mc) * 100 : null,
    };
  } catch {
    return null;
  }
}

function passesFilter(q) {
  if (!q || !q.currentPrice) return false;
  const { peRatio: pe, fcfYield: fcf, debtEquity: de } = q;
  if (de != null && de > 4) return false;
  if (q.currentPrice <= 0) return false;
  const valueSignal =
    (pe != null && pe > 0 && pe < 20) || (fcf != null && fcf > 5);
  const qualitySignal = q.grossMargin != null && q.grossMargin > 0.35;
  const drawdownSignal = (() => {
    const { currentPrice, low52, high52 } = q;
    if (!currentPrice || !low52 || !high52 || high52 <= low52) return false;
    return (currentPrice - low52) / (high52 - low52) < 0.35;
  })();
  return valueSignal || qualitySignal || drawdownSignal;
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScan(opts = {}) {
  const log = opts.log || (() => {});
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const model =
    opts.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const lang = opts.lang === 'en' ? 'en' : 'he';
  const supabaseUrl = opts.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = opts.supabaseKey || process.env.SUPABASE_SERVICE_KEY;
  const universe = Array.isArray(opts.universe) && opts.universe.length
    ? opts.universe
    : SP500_TICKERS;

  if (!apiKey) {
    return { ok: false, error: 'missing_anthropic_key' };
  }
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, error: 'missing_supabase_credentials' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  // --- Create scan run row ----------------------------------------------------
  let runId = null;
  try {
    const { data: runRow, error: runErr } = await supabase
      .from('scan_runs')
      .insert({ universe_size: universe.length })
      .select('id, started_at')
      .single();
    if (runErr) throw runErr;
    runId = runRow.id;
    log(`[scan] run_id=${runId} universe=${universe.length}`);
  } catch (err) {
    return { ok: false, error: 'scan_run_insert_failed', detail: String(err?.message || err) };
  }

  // --- Step 1+2: Fast filter --------------------------------------------------
  const candidates = [];
  for (let i = 0; i < universe.length; i += FAST_BATCH) {
    const batch = universe.slice(i, i + FAST_BATCH);
    const results = await Promise.all(batch.map(quickFetch));
    for (const r of results) {
      if (r && passesFilter(r)) candidates.push(r.ticker);
    }
    if (i + FAST_BATCH < universe.length) await pause(FAST_BATCH_DELAY_MS);
  }
  log(`[scan] after_filter=${candidates.length}`);

  // --- Step 3: Compute full indicators ---------------------------------------
  const withIndicators = [];
  for (const ticker of candidates) {
    try {
      const raw = await fetchFundamentals(ticker);
      if (!raw?.currentPrice || !raw?.revenues?.length) continue;
      const { indicators, intrinsicValue } = computeIndicators(raw);
      withIndicators.push({ ticker, raw, indicators, intrinsicValue });
    } catch {
      // Skip ticker if Yahoo errored or data is incomplete.
    }
  }
  log(`[scan] after_detection=${withIndicators.length}`);

  // --- Step 4: Deep AI -------------------------------------------------------
  const situations = [];
  for (let i = 0; i < withIndicators.length; i += AI_BATCH) {
    const batch = withIndicators.slice(i, i + AI_BATCH);
    const results = await Promise.all(
      batch.map((item) => analyzeOne(item, { apiKey, model, lang })),
    );
    for (const r of results) if (r) situations.push(r);
    if (i + AI_BATCH < withIndicators.length) await pause(AI_BATCH_DELAY_MS);
  }
  log(`[scan] after_ai=${situations.length}`);

  // --- Step 5: Score + rank + flag featured ----------------------------------
  situations.sort((a, b) => b.score - a.score);
  const toInsert = situations.map((s, i) => ({
    ...s,
    is_featured: i < FEATURED_LIMIT,
    scan_run_id: runId,
  }));

  // --- Step 6: Replace expired situations + insert today's set ---------------
  try {
    await supabase
      .from('situations')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch (err) {
    log(`[scan] expired-delete failed: ${String(err?.message || err)}`);
  }
  if (toInsert.length > 0) {
    // Insert in chunks of 50 to stay under PostgREST payload limits.
    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { error } = await supabase.from('situations').insert(chunk);
      if (error) log(`[scan] insert chunk failed: ${error.message}`);
    }
  }

  const durationMs = Date.now() - startTime;
  await supabase
    .from('scan_runs')
    .update({
      finished_at: new Date().toISOString(),
      universe_size: universe.length,
      after_filter: candidates.length,
      after_detection: withIndicators.length,
      after_ai: situations.length,
      featured_count: Math.min(FEATURED_LIMIT, situations.length),
      duration_ms: durationMs,
      status: 'done',
    })
    .eq('id', runId);

  log(`[scan] done in ${durationMs}ms`);
  return {
    ok: true,
    runId,
    universeSize: universe.length,
    candidates: candidates.length,
    withIndicators: withIndicators.length,
    situations: situations.length,
    featured: Math.min(FEATURED_LIMIT, situations.length),
    durationMs,
  };
}

async function analyzeOne({ ticker, raw, indicators, intrinsicValue }, ctx) {
  const { apiKey, model, lang } = ctx;
  try {
    const payload = buildPayload({
      ticker,
      companyName: raw.companyName,
      businessSummary: raw.businessSummary,
      currentPrice: raw.currentPrice,
      currency: raw.currency,
      indicators,
      intrinsicValue,
    });

    const realityInputBase = {
      ticker,
      asOf: new Date().toISOString(),
      indicators,
      payload,
      context: {
        sector: raw.sector,
        country: raw.country,
        earningsDate: raw.earningsDate,
      },
    };
    const structuralFindings = computeFindings({
      ...realityInputBase,
      engines: {},
    });

    const enginesResult = await runEngines({
      apiKey,
      model,
      payload,
      lang,
      findings: structuralFindings,
    });
    if (!enginesResult.graham || !enginesResult.market) return null;

    const allFindings = computeFindings({
      ...realityInputBase,
      engines: { graham: enginesResult.graham, market: enginesResult.market },
    });
    const grahamFindings = allFindings.filter(
      (f) => f.dimension !== 'narrative_dependence',
    );
    const grahamFinal = enforceHardBlockers(enginesResult.graham, grahamFindings);
    const marketFinal = enginesResult.market;

    const setupType = deriveSetupType(grahamFinal.decision, marketFinal.decision);
    const alignment = deriveAlignment(grahamFinal.decision, marketFinal.decision);
    const insight = deriveInsight(setupType, lang);
    const suggestedAction = deriveGrahamLedAction(grahamFinal, marketFinal, lang);
    const ctaLabel = deriveCTALabel(setupType, lang);
    const ctaSub = deriveCTASub(setupType, lang);
    const score = scoreSetup(setupType, grahamFinal.confidence, marketFinal.confidence);
    const situationType = detectSituationType(indicators);
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000).toISOString();
    const fcfYieldInd = indicators.D4_fcfYield;
    const fcfYield =
      fcfYieldInd && typeof fcfYieldInd.value === 'number'
        ? fcfYieldInd.value
        : null;
    const latestRevenue = raw.revenues?.length
      ? raw.revenues[raw.revenues.length - 1]
      : null;

    const fullAnalysis = {
      ticker,
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
      dualEngine: {
        graham: grahamFinal,
        market: marketFinal,
        alignment,
        setupType,
        insight,
        suggestedAction,
        ctaLabel,
        ctaSub,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      ticker,
      company_name: raw.companyName,
      sector: raw.sector,
      country: raw.country,
      current_price: raw.currentPrice,
      daily_change_pct: raw.dailyChangePct,
      low52: raw.low52,
      high52: raw.high52,
      setup_type: setupType,
      graham_decision: grahamFinal.decision,
      market_decision: marketFinal.decision,
      graham_confidence: grahamFinal.confidence,
      market_confidence: marketFinal.confidence,
      graham_thesis: grahamFinal.thesis,
      market_thesis: marketFinal.thesis,
      insight,
      score,
      situation_type: situationType,
      indicators,
      full_analysis: fullAnalysis,
      expires_at: expiresAt,
    };
  } catch {
    return null;
  }
}

module.exports = { runScan };
