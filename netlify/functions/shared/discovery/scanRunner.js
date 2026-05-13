'use strict';

// Discovery Engine — shared pipeline used by:
//   - netlify/functions/scan.js  (Netlify Scheduled Function — requires Pro)
//   - scripts/run-scan.js        (standalone Node CLI, used by GitHub Actions cron)
//
// Pipeline:
//   1. Load scan universe (S&P 500 + foreign ADRs + popular non-S&P US names)
//   2. Fast filter via cheap Yahoo quote/quoteSummary calls (parallel batches)
//   3. Compute full indicators on candidates
//   4. Run Graham + Market engines (with Reality Check) in parallel batches
//   5. Score, rank, mark top 7 as featured
//   6. Replace yesterday's situations in Supabase

const YahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

const { fetchFundamentals } = require('../fetch/fetcher');
const { computeIndicators } = require('../analysis/indicators');
const { buildPayload, runAboutSummary } = require('../ai/aiPrompt');
const { runStoryteller } = require('../ai/storyteller');
const { runEngines } = require('../engines/engines');
const { computeFindings, enforceHardBlockers } = require('../reality/realityCheck');
const {
  deriveAlignment,
  deriveSetupType,
  deriveInsight,
  derivePrimaryFinding,
  deriveInterestingScore,
  deriveGrahamLedAction,
  deriveCTALabel,
  deriveCTASub,
} = require('../alignment/alignment');
const { scoreSetup, detectSituationType } = require('./discoveryScoring');
const { passesDryScreen } = require('./dryScreen');
const { SCAN_UNIVERSE } = require('./universe');

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

const FAST_BATCH = 20;
const FAST_BATCH_DELAY_MS = 200;
const AI_BATCH = 4;
const AI_BATCH_DELAY_MS = 600;
const FEATURED_LIMIT = 7;
const TTL_HOURS = 24;

// --- Incremental scan thresholds -------------------------------------------
// A cached situation is reused (no AI re-analysis) when ALL of these hold:
//   - it was last scanned within STALE_DAYS,
//   - the live price has moved less than PRICE_DELTA_PCT since the cache,
//   - earnings were not released within the last EARNINGS_LOOKBACK_DAYS.
// Otherwise we re-run the full Graham + Market + Storyteller + About pipeline.
// On a typical day ~80-90% of tickers qualify for refresh-only, cutting AI
// cost from ~$9/scan to ~$1/scan while still capturing material changes.
const STALE_DAYS = 14;
const PRICE_DELTA_PCT = 7;
const EARNINGS_LOOKBACK_DAYS = 7;

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'raw' in v && typeof v.raw === 'number') return v.raw;
  return null;
}

// --- Watchlist composition --------------------------------------------------
// Nightly scans process only the "watchlist" -- a focused subset of the full
// universe consisting of:
//   1. The top N tickers by interestingScore from the most recent scan
//      (high-quality opportunities we want to keep monitoring).
//   2. Any ticker analyzed within the last RECENT_DAYS window (so manually
//      searched tickers stay fresh and do not silently drop off).
// A weekly full scan rotates the composition by re-evaluating the entire
// universe, so new opportunities can break into the watchlist.
//
// Cost / speed math (vs full universe of ~683 tickers):
//   - Full scan:    ~10-20 min, ~30 reanalyzed at AI = ~$0.30
//   - Watchlist:    ~3-6 min,  ~25 reanalyzed at AI = ~$0.25
// The win is mainly speed and bounded blast radius on volatile days.
const WATCHLIST_TOP_N = 150;
const WATCHLIST_RECENT_DAYS = 7;
const WATCHLIST_MIN_VIABLE = 30; // bootstrap fallback threshold

async function pickWatchlistTickers(supabase, log) {
  const set = new Set();

  // 1. Top scorers from the latest scan (excludes AVOIDs to avoid wasting
  // compute on tickers we have already concluded are uninvestable).
  try {
    const { data: top, error: topErr } = await supabase
      .from('situations')
      .select('ticker, score, graham_decision')
      .neq('graham_decision', 'AVOID')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(WATCHLIST_TOP_N);
    if (topErr) throw topErr;
    for (const row of top || []) {
      if (row?.ticker) set.add(row.ticker);
    }
    log(`[watchlist] top_by_score=${top?.length || 0}`);
  } catch (err) {
    log(`[watchlist] top-by-score query failed: ${String(err?.message || err)}`);
  }

  // 2. Recently analyzed tickers (manual searches + recent re-analyses).
  // Keeps the user's recently-viewed names refreshed even if they slipped
  // out of the top-N list.
  try {
    const sinceIso = new Date(
      Date.now() - WATCHLIST_RECENT_DAYS * 86400_000,
    ).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from('situations')
      .select('ticker, scanned_at')
      .gte('scanned_at', sinceIso)
      .limit(300);
    if (recentErr) throw recentErr;
    let added = 0;
    for (const row of recent || []) {
      if (row?.ticker && !set.has(row.ticker)) {
        set.add(row.ticker);
        added += 1;
      }
    }
    log(`[watchlist] recent_added=${added}`);
  } catch (err) {
    log(`[watchlist] recent query failed: ${String(err?.message || err)}`);
  }

  return [...set];
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
      dailyChangePct: num(quote.regularMarketChangePercent),
      peRatio: num(sd.trailingPE),
      marketCap: mc,
      debtEquity: num(sd.debtToEquity),
      low52: num(sd.fiftyTwoWeekLow) ?? num(quote.fiftyTwoWeekLow),
      high52: num(sd.fiftyTwoWeekHigh) ?? num(quote.fiftyTwoWeekHigh),
      grossMargin: num(fd.grossMargins),
      fcfYield: fcf && mc ? (fcf / mc) * 100 : null,
      // Yahoo doesn't expose true ROIC cheaply; ROA is the closest non-API
      // proxy we get from financialData and is sufficient for filter quality.
      roic: num(fd.returnOnAssets) ?? num(fd.returnOnEquity),
    };
  } catch {
    return null;
  }
}

// Data-sanity prefilter only. Pre-judging "value" or "quality" is Graham's
// job, not the scanner's -- the previous filters were dropping ~673/683
// tickers before Graham ever saw them. We now reject only data we cannot
// run an analysis on:
//   - Missing or non-positive price (delisted / Yahoo error).
//   - Catastrophic balance-sheet noise that almost certainly means stale or
//     broken data (debt/equity > 10).
//   - Speculative meme-tier P/E (> 200) where indicators won't be meaningful.
// Anything else -- including high P/E growth names, loss-making companies,
// and missing-margin ADRs -- goes to Graham, who decides BUY/WAIT/AVOID.
function passesFilter(q) {
  if (!q || !q.currentPrice || q.currentPrice <= 0) return false;
  if (q.debtEquity != null && q.debtEquity > 10) return false;
  if (q.peRatio != null && q.peRatio > 200) return false;
  return true;
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Decide whether the cached row for a ticker is still fresh enough to skip
// the AI re-analysis. Returns the reason string ('new', 'stale', 'price',
// 'earnings') when re-analysis is required, or null when refresh-only is OK.
function reanalyzeReason(item, existing) {
  if (!existing || !existing.full_analysis) return 'new';
  const scannedAt = existing.scanned_at ? new Date(existing.scanned_at).getTime() : 0;
  const ageDays = (Date.now() - scannedAt) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > STALE_DAYS) return 'stale';

  const oldPrice = Number(existing.current_price);
  const newPrice = Number(item.raw?.currentPrice);
  if (oldPrice > 0 && newPrice > 0) {
    const deltaPct = (Math.abs(newPrice - oldPrice) / oldPrice) * 100;
    if (deltaPct > PRICE_DELTA_PCT) return 'price';
  }

  // Earnings can land between scans; recompute if the last earnings event is
  // within the lookback window. Check both old and new copies to be safe.
  const earningsCandidates = [
    existing.full_analysis?.earningsDate,
    item.raw?.earningsDate,
  ].filter(Boolean);
  for (const e of earningsCandidates) {
    const t = new Date(e).getTime();
    if (!Number.isFinite(t)) continue;
    const daysAgo = (Date.now() - t) / 86_400_000;
    if (daysAgo >= 0 && daysAgo <= EARNINGS_LOOKBACK_DAYS) return 'earnings';
  }

  // Schema drift: rows cached BEFORE we shipped the storyteller / Phase A
  // insight rewrite are missing critical UI fields (plainSummary used by the
  // "In plain words" panel; primaryFinding chip; per-ticker thesis-based
  // insight). The price/stale heuristics never trip for stable top scorers,
  // so without this trigger they keep their pre-storyteller cache for up to
  // STALE_DAYS. Force one re-analysis so each ticker gets the modern shape;
  // afterwards this trigger never fires again for that ticker.
  const graham = existing.full_analysis?.dualEngine?.graham;
  if (!graham?.plainSummary) return 'schema';

  return null;
}

// Build a Supabase insert row from a cached `existing` row plus fresh quote
// data, without spending any AI tokens. Updates current price, daily change,
// and 52-week band; everything else (decisions, indicators, plainSummary,
// about) is reused from the prior scan's full_analysis.
function buildRefreshedRow(item, existing) {
  const fa = existing.full_analysis ? { ...existing.full_analysis } : {};
  const newPrice = item.raw?.currentPrice ?? existing.current_price;
  const newChange =
    item.raw?.dailyChangePct != null
      ? item.raw.dailyChangePct
      : existing.daily_change_pct;
  const newLow = item.raw?.low52 ?? existing.low52;
  const newHigh = item.raw?.high52 ?? existing.high52;

  fa.currentPrice = newPrice;
  fa.dailyChangePct = newChange;
  fa.low52 = newLow;
  fa.high52 = newHigh;

  return {
    ticker: item.ticker,
    company_name: existing.company_name ?? fa.companyName ?? null,
    sector: existing.sector ?? fa.sector ?? null,
    country: existing.country ?? fa.country ?? null,
    current_price: newPrice,
    daily_change_pct: newChange,
    low52: newLow,
    high52: newHigh,
    setup_type: existing.setup_type,
    graham_decision: existing.graham_decision,
    market_decision: existing.market_decision,
    graham_confidence: existing.graham_confidence,
    market_confidence: existing.market_confidence,
    graham_thesis: existing.graham_thesis,
    market_thesis: existing.market_thesis,
    insight: existing.insight,
    score: existing.score,
    situation_type: existing.situation_type,
    indicators: fa.indicators ?? existing.indicators ?? null,
    full_analysis: fa,
    expires_at: new Date(Date.now() + TTL_HOURS * 3600_000).toISOString(),
  };
}

async function runScan(opts = {}) {
  const log = opts.log || (() => {});
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const model =
    opts.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  // Discovery analyses are produced in English by default. The app's "official"
  // language for stored content is English; users who toggle the UI to Hebrew
  // see HE labels around English thesis text. Pass lang='he' explicitly to
  // override (e.g. via SCAN_LANG=he).
  const lang = opts.lang === 'he' ? 'he' : 'en';
  const supabaseUrl = opts.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = opts.supabaseKey || process.env.SUPABASE_SERVICE_KEY;
  // Scan mode -- 'nightly' processes the watchlist (top scorers + recent
  // searches), 'full' processes the entire universe. The cron defaults to
  // nightly; the weekly job and manual triggers can request 'full'. An
  // explicit `opts.universe` array always wins (e.g. for ad-hoc CLI runs).
  const requestedMode = opts.mode === 'full' ? 'full' : 'nightly';

  if (!apiKey) {
    return { ok: false, error: 'missing_anthropic_key' };
  }
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, error: 'missing_supabase_credentials' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  // --- Resolve scan universe based on mode -----------------------------------
  let universe;
  let mode = requestedMode;
  if (Array.isArray(opts.universe) && opts.universe.length) {
    universe = opts.universe;
    mode = 'custom';
  } else if (requestedMode === 'full') {
    universe = SCAN_UNIVERSE;
  } else {
    const watchlist = await pickWatchlistTickers(supabase, log);
    if (watchlist.length >= WATCHLIST_MIN_VIABLE) {
      universe = watchlist;
      log(`[scan] mode=nightly watchlist_size=${watchlist.length}`);
    } else {
      // Bootstrap: empty Supabase or a wipe -- promote to full so the next
      // nightly has a healthy watchlist to work from.
      log(
        `[scan] watchlist=${watchlist.length} < ${WATCHLIST_MIN_VIABLE}, ` +
          `bootstrapping with full universe`,
      );
      universe = SCAN_UNIVERSE;
      mode = 'full';
    }
  }

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
    log(`[scan] run_id=${runId} mode=${mode} universe=${universe.length}`);
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
      const { indicators, intrinsicValue, fcfArr, insider } = computeIndicators(raw);
      withIndicators.push({ ticker, raw, indicators, intrinsicValue, fcfArr, insider });
    } catch {
      // Skip ticker if Yahoo errored or data is incomplete.
    }
  }
  log(`[scan] after_detection=${withIndicators.length}`);

  // --- Step 3.3: Deterministic dry screen (no AI) --------------------------
  // Apply Graham's own BUY criteria as deterministic code BEFORE spending
  // any AI tokens. A ticker that fails prerequisites or fails ALL three
  // pillars cannot become a Graham BUY -- the AI call would just return
  // WAIT/AVOID. Drop them here. Typically narrows ~580 -> ~80-150.
  const dryRejectReasons = {};
  const screened = [];
  for (const item of withIndicators) {
    const result = passesDryScreen(item.indicators, item.fcfArr);
    if (result.pass) {
      screened.push(item);
    } else {
      const r = result.reason || 'unknown';
      dryRejectReasons[r] = (dryRejectReasons[r] || 0) + 1;
    }
  }
  const dryRejectSummary = Object.entries(dryRejectReasons)
    .map(([r, n]) => `${r}=${n}`)
    .join(' ');
  log(
    `[scan] after_dry_screen=${screened.length} ` +
      `(rejected=${withIndicators.length - screened.length} · ${dryRejectSummary || 'none'})`,
  );

  // --- Step 3.5: Load cached situations for incremental decision -----------
  // Pull every column we need to rebuild a refresh-only insert row without
  // touching AI. Failure here just means we fall back to a full scan -- no
  // cached row will be found in the map and every ticker will reanalyze.
  const existingByTicker = new Map();
  try {
    const { data: existing } = await supabase
      .from('situations')
      .select(
        [
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
          'indicators',
          'scanned_at',
          'full_analysis',
        ].join(', '),
      );
    if (Array.isArray(existing)) {
      for (const row of existing) {
        if (row?.ticker) existingByTicker.set(row.ticker, row);
      }
    }
  } catch (err) {
    log(`[scan] existing-fetch failed: ${String(err?.message || err)}`);
  }
  log(`[scan] existing_rows=${existingByTicker.size}`);

  // Partition: anything stale / price-shocked / freshly-reported goes to AI;
  // everything else just gets a price refresh from the existing row. Only
  // dry-screen survivors are eligible -- everything else was already dropped
  // because it could not become a Graham BUY.
  const toReanalyze = [];
  const toRefresh = [];
  const reasonCounts = { new: 0, stale: 0, price: 0, earnings: 0, schema: 0 };
  for (const item of screened) {
    const existing = existingByTicker.get(item.ticker);
    const reason = reanalyzeReason(item, existing);
    if (reason) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      toReanalyze.push(item);
    } else {
      toRefresh.push({ item, existing });
    }
  }
  log(
    `[scan] incremental: reanalyze=${toReanalyze.length} ` +
      `refresh=${toRefresh.length} ` +
      `(new=${reasonCounts.new} stale=${reasonCounts.stale} ` +
      `price=${reasonCounts.price} earnings=${reasonCounts.earnings} ` +
      `schema=${reasonCounts.schema})`,
  );

  // --- Step 4: Deep AI -------------------------------------------------------
  // Only the reanalyze set spends AI tokens. Refreshed tickers reuse their
  // cached Graham/Market/Storyteller/About output.
  const aiCandidates = toReanalyze;
  log(`[scan] ai_candidates=${aiCandidates.length}`);
  const situations = [];
  for (let i = 0; i < aiCandidates.length; i += AI_BATCH) {
    const batch = aiCandidates.slice(i, i + AI_BATCH);
    const results = await Promise.all(
      batch.map((item) => analyzeOne(item, { apiKey, model, lang })),
    );
    for (const r of results) if (r) situations.push(r);
    if (i + AI_BATCH < aiCandidates.length) await pause(AI_BATCH_DELAY_MS);
    if (i % 40 === 0) log(`[scan] ai_progress=${i + batch.length}/${aiCandidates.length}`);
  }
  log(`[scan] after_ai=${situations.length}`);

  // Rebuild cheap refresh rows for the skip set (no AI cost).
  const refreshedRows = [];
  for (const { item, existing } of toRefresh) {
    try {
      refreshedRows.push(buildRefreshedRow(item, existing));
    } catch (err) {
      log(`[scan] refresh-build failed for ${item.ticker}: ${String(err?.message || err)}`);
    }
  }
  log(`[scan] after_refresh=${refreshedRows.length}`);

  // --- Step 5: Score + rank + flag featured ----------------------------------
  // Merge freshly-analyzed situations with the cheap refresh-only rows. Both
  // shapes already contain the columns the situations table expects.
  const merged = [...situations, ...refreshedRows];
  merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const toInsert = merged.map((s, i) => ({
    ...s,
    is_featured: i < FEATURED_LIMIT,
    scan_run_id: runId,
  }));

  // --- Step 6: Replace the entire situations table with today's snapshot ----
  // We delete everything (not just expired rows) so re-running the scan does
  // not accumulate stale duplicates from prior runs. neq('id', UUID_NIL) is
  // a "delete all rows" trick PostgREST requires (it forbids unconstrained
  // deletes by default).
  const UUID_NIL = '00000000-0000-0000-0000-000000000000';
  try {
    await supabase.from('situations').delete().neq('id', UUID_NIL);
  } catch (err) {
    log(`[scan] table-clear failed: ${String(err?.message || err)}`);
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
  // after_ai is the user-visible "size of the feed" -- count both fresh AI
  // analyses and reused refresh rows so the dashboard doesn't shrink to ~10%
  // on incremental days.
  const totalSituations = situations.length + refreshedRows.length;
  await supabase
    .from('scan_runs')
    .update({
      finished_at: new Date().toISOString(),
      universe_size: universe.length,
      after_filter: candidates.length,
      after_detection: withIndicators.length,
      after_ai: totalSituations,
      featured_count: Math.min(FEATURED_LIMIT, totalSituations),
      duration_ms: durationMs,
      status: 'done',
    })
    .eq('id', runId);

  log(
    `[scan] done in ${durationMs}ms · reanalyzed=${situations.length} ` +
      `refreshed=${refreshedRows.length}`,
  );
  return {
    ok: true,
    runId,
    mode,
    universeSize: universe.length,
    candidates: candidates.length,
    withIndicators: withIndicators.length,
    reanalyzed: situations.length,
    refreshed: refreshedRows.length,
    situations: totalSituations,
    featured: Math.min(FEATURED_LIMIT, totalSituations),
    durationMs,
  };
}

async function analyzeOne({ ticker, raw, indicators, intrinsicValue, insider }, ctx) {
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
        insider,
      },
    };
    const structuralFindings = computeFindings({
      ...realityInputBase,
      engines: {},
    });

    // Run engines and the lightweight About summary in parallel so the
    // wall-clock cost is unchanged. About is best-effort: if it fails or times
    // out we still ship the situation without an AI summary.
    const [enginesResult, businessDescription] = await Promise.all([
      runEngines({
        apiKey,
        model,
        payload,
        lang,
        findings: structuralFindings,
      }),
      runAboutSummary({
        apiKey,
        model,
        text: raw.businessSummary,
        deadlineMs: 18000,
      }).catch(() => ''),
    ]);
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

    // Storyteller: plain-language hero summary. Non-fatal — falls back to
    // analytical text on the card if missing. Keep it short so a 40-ticker
    // batch stays within scan budget.
    try {
      const storyResult = await runStoryteller({
        apiKey,
        model,
        graham: grahamFinal,
        lang,
        deadlineMs: 12000,
      });
      if (storyResult && storyResult.summary) {
        grahamFinal.plainSummary = storyResult.summary;
      }
    } catch (stErr) {
      console.error(`[scan] storyteller failed for ${ticker}:`, stErr && stErr.message);
    }

    const setupType = deriveSetupType(grahamFinal.decision, marketFinal.decision);
    const alignment = deriveAlignment(grahamFinal.decision, marketFinal.decision);
    // Insight now uses the actual Graham thesis (1 sentence with numbers)
    // instead of a generic per-setup-type sentence. Falls back to setup
    // template only when Graham produced no thesis.
    const insight = deriveInsight(setupType, lang, grahamFinal);
    // Primary finding (top tailwind for BUYs, top headwind otherwise) is
    // surfaced as a chip on the list row. May be null when Reality Check
    // produced no notable findings -- a clean BUY is informative on its own.
    const primaryFinding = derivePrimaryFinding(grahamFinal);
    const suggestedAction = deriveGrahamLedAction(grahamFinal, marketFinal, lang);
    const ctaLabel = deriveCTALabel(setupType, lang);
    const ctaSub = deriveCTASub(setupType, lang);
    // interestingScore replaces the older crude scoreSetup (which only
    // looked at decision + confidence). It now factors in fragility,
    // tailwind count, alignment, and zeros-out hard-blocked items.
    const score = deriveInterestingScore(grahamFinal, marketFinal);
    // Keep the legacy score on the row too, for backward compatibility
    // with any consumer that depended on the 0..200 range.
    const legacyScore = scoreSetup(setupType, grahamFinal.confidence, marketFinal.confidence);
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
      earningsHistory: raw.earningsHistory ?? null,
      intrinsicValue,
      indicators,
      // Minimal AI payload — only the About summary is generated during scan;
      // everything else is left empty so the frontend's optional-chaining reads
      // (analysis.ai?.indicatorInsights, etc.) gracefully resolve to defaults.
      ai: businessDescription
        ? {
            businessDescription,
            grahamNarrative: '',
            positiveSignals: [],
            challengingSignals: [],
            questions: [],
            moatType: 'None',
            moatRating: 'None',
            problemClassification: 'None',
            problemExplanation: '',
            catalystPresent: false,
            catalystDescription: null,
            catalystTimeline: null,
            verdict: 'waiting',
            verdictReasoning: '',
            missingFactors: null,
            indicatorInsights: {},
          }
        : null,
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
