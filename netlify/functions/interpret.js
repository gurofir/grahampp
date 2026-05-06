'use strict';

const YahooFinance = require('yahoo-finance2').default;
const { computeIndicators } = require('./shared/indicators');
const { buildPayload, runAiInterpretation } = require('./shared/aiPrompt');
const { runEngines } = require('./shared/engines');
const { computeFindings, enforceHardBlockers } = require('./shared/realityCheck');
const { runStoryteller } = require('./shared/storyteller');
const {
  deriveAlignment,
  deriveSetupType,
  deriveInsight,
  deriveGrahamLedAction,
  deriveCTALabel,
  deriveCTASub,
} = require('./shared/alignment');

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

const errorResponse = (statusCode, messageKey) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify({ error: messageKey }),
});

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'raw' in v && typeof v.raw === 'number') return v.raw;
  return null;
}

function pctFromGrowth(g) {
  return typeof g === 'number' && Number.isFinite(g) ? g * 100 : null;
}

async function fetchFundamentals(ticker) {
  const quoteSummaryModules = [
    'price',
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'calendarEvents',
    'assetProfile',
  ];

  const periodStart = new Date();
  periodStart.setFullYear(periodStart.getFullYear() - 5);
  const period1 = periodStart.toISOString().split('T')[0];

  const [quote, summary, fts] = await Promise.all([
    yahooFinance.quote(ticker),
    yahooFinance.quoteSummary(ticker, { modules: quoteSummaryModules }),
    yahooFinance
      .fundamentalsTimeSeries(ticker, { period1, module: 'all', type: 'annual' })
      .catch(() => []),
  ]);

  const price = summary.price || {};
  const summaryDetail = summary.summaryDetail || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const financial = summary.financialData || {};
  const calendar = summary.calendarEvents || {};
  const profile = summary.assetProfile || {};

  const rows = (Array.isArray(fts) ? fts : [])
    .filter((r) => num(r?.totalRevenue) != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const revenues = rows.map((r) => num(r.totalRevenue) ?? 0);
  const operatingIncomes = rows.map((r) => num(r.operatingIncome) ?? 0);
  const netIncomes = rows.map((r) => num(r.netIncome) ?? 0);
  const ebits = rows.map((r) => num(r.EBIT) ?? num(r.operatingIncome) ?? 0);
  const interestExpenses = rows.map((r) => num(r.interestExpense) ?? 0);
  const operatingCashFlows = rows.map((r) => num(r.operatingCashFlow) ?? 0);
  const capexArr = rows.map((r) => num(r.capitalExpenditure) ?? 0);
  const grossProfits = rows.map((r) => {
    const direct = num(r.grossProfit);
    if (direct != null) return direct;
    const cogs = num(r.costOfRevenue);
    const rev = num(r.totalRevenue);
    if (rev != null && cogs != null) return rev - cogs;
    return 0;
  });
  const depreciationAmortization = rows.map(
    (r) =>
      num(r.reconciledDepreciation) ??
      num(r.depreciationAndAmortization) ??
      num(r.depreciation) ??
      0,
  );

  const latestRow = rows[rows.length - 1] || {};
  const totalDebt = num(financial.totalDebt) ?? num(latestRow.totalDebt) ?? 0;
  const totalEquity =
    num(financial.totalStockholderEquity) ??
    num(latestRow.stockholdersEquity) ??
    num(latestRow.totalEquityGrossMinorityInterest) ??
    0;
  const cash =
    num(financial.totalCash) ??
    num(latestRow.cashCashEquivalentsAndShortTermInvestments) ??
    num(latestRow.cashAndCashEquivalents) ??
    0;
  const currentAssets = num(latestRow.currentAssets) ?? num(financial.totalCurrentAssets) ?? 0;
  const currentLiabilities =
    num(latestRow.currentLiabilities) ?? num(financial.totalCurrentLiabilities) ?? 0;
  const ebitda = num(financial.ebitda) ?? num(keyStats.ebitda) ?? null;

  const earningsDateRaw =
    calendar.earnings?.earningsDate?.[0] || calendar.earningsDate?.[0] || null;
  const earningsDate = earningsDateRaw
    ? earningsDateRaw instanceof Date
      ? earningsDateRaw.toISOString()
      : new Date(earningsDateRaw).toISOString()
    : null;

  const longTermGrowthRate =
    pctFromGrowth(financial.earningsGrowth) ??
    pctFromGrowth(financial.revenueGrowth) ??
    null;

  return {
    ticker: ticker.toUpperCase(),
    companyName: price.longName || price.shortName || ticker.toUpperCase(),
    currency: quote.currency || price.currency || 'USD',
    currentPrice:
      num(quote.regularMarketPrice) ?? num(price.regularMarketPrice) ?? 0,
    businessSummary: profile.longBusinessSummary || null,
    marketCap:
      num(summaryDetail.marketCap) ??
      num(price.marketCap) ??
      num(keyStats.marketCap) ??
      null,
    sharesOutstanding: num(keyStats.sharesOutstanding) ?? null,
    peRatio: num(summaryDetail.trailingPE),
    forwardPE: num(summaryDetail.forwardPE) ?? num(keyStats.forwardPE),
    pegRatio: num(keyStats.pegRatio),
    priceSales: num(summaryDetail.priceToSalesTrailing12Months),
    forwardEPS: num(keyStats.forwardEps),
    longTermGrowthRate,
    revenues,
    operatingIncomes,
    netIncomes,
    ebits,
    interestExpenses,
    operatingCashFlows,
    capexArr,
    grossProfits,
    depreciationAmortization,
    totalDebt,
    totalEquity,
    cash,
    currentAssets,
    currentLiabilities,
    ebitda,
    earningsDate,
    sector: profile.sector || null,
    country: profile.country || null,
  };
}

exports.handler = async (event) => {
  const rawTicker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();
  const langParam = event.queryStringParameters?.lang;
  const lang = langParam === 'en' ? 'en' : 'he';

  if (!TICKER_RE.test(rawTicker)) {
    return errorResponse(400, 'tickerNotFound');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ai: null, aiDiagnostic: 'missing_api_key' }),
    };
  }

  try {
    const raw = await fetchFundamentals(rawTicker);
    if (!raw.currentPrice || !raw.revenues.length) {
      return errorResponse(404, 'tickerNotFound');
    }

    const { indicators, intrinsicValue } = computeIndicators(raw);

    const payload = buildPayload({
      ticker: raw.ticker,
      companyName: raw.companyName,
      businessSummary: raw.businessSummary,
      currentPrice: raw.currentPrice,
      currency: raw.currency,
      indicators,
      intrinsicValue,
    });

    // ----- Reality Check Stage 1: structural findings BEFORE Graham --------
    // Graham++ is the integrated skeptic: feed the deterministic risk findings
    // into Graham's prompt so its decision/confidence/counter-thesis already
    // incorporate them in a single synthesis. Market does NOT receive these —
    // it must remain the pure consensus-narrative voice.
    const realityInputBase = {
      ticker: raw.ticker,
      asOf: new Date().toISOString(),
      indicators,
      payload,
      context: {
        sector: raw.sector,
        country: raw.country,
        earningsDate: raw.earningsDate,
      },
    };
    const structuralFindings = computeFindings({ ...realityInputBase, engines: {} });

    let aiResult;
    let enginesResult;
    let aiDiagnostic;
    try {
      [aiResult, enginesResult] = await Promise.all([
        runAiInterpretation({ apiKey, model, payload, lang }),
        runEngines({ apiKey, model, payload, lang, findings: structuralFindings })
          .catch((err) => {
            console.error('[interpret] engines failed:', err && err.message);
            return { graham: null, market: null, parts: null };
          }),
      ]);
      const status = aiResult.stoppedEarly ? 'truncated' : 'complete';
      const parts = aiResult.parts
        ? `section[${aiResult.parts.section.len}c/${aiResult.parts.section.ms}ms${aiResult.parts.section.stoppedEarly ? ',cut' : ''}], insights[${aiResult.parts.insights.count}/${aiResult.parts.insights.ms}ms${aiResult.parts.insights.stoppedEarly ? ',cut' : ''}], verdict[${aiResult.parts.verdict.len}c/${aiResult.parts.verdict.ms}ms${aiResult.parts.verdict.stoppedEarly ? ',cut' : ''}${aiResult.parts.verdict.ok ? '' : ',fail'}]${aiResult.parts.translation ? `, translate[${aiResult.parts.translation.len}c/${aiResult.parts.translation.ms}ms${aiResult.parts.translation.stoppedEarly ? ',cut' : ''}${aiResult.parts.translation.ok ? '' : ',fail'}]` : ''}`
        : '';
      const enginesParts = enginesResult.parts
        ? `, graham[${enginesResult.parts.graham.len}c/${enginesResult.parts.graham.ms}ms${enginesResult.parts.graham.stoppedEarly ? ',cut' : ''}${enginesResult.parts.graham.ok ? '' : ',fail'}], market[${enginesResult.parts.market.len}c/${enginesResult.parts.market.ms}ms${enginesResult.parts.market.stoppedEarly ? ',cut' : ''}${enginesResult.parts.market.ok ? '' : ',fail'}]`
        : ', engines[fail]';
      aiDiagnostic = aiResult.ai
        ? `${status} (model=${model}, ${parts}${enginesParts})`
        : `parse_failed (${status}, model=${model}, ${parts}${enginesParts})`;
    } catch (aiErr) {
      const status = aiErr?.status ?? aiErr?.statusCode ?? null;
      const code = aiErr?.error?.error?.type ?? aiErr?.error?.type ?? aiErr?.code ?? null;
      const msg = aiErr && aiErr.message ? String(aiErr.message) : String(aiErr);
      console.error('[interpret] AI call failed:', { status, code, msg });
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ai: null,
          dualEngine: null,
          aiDiagnostic: `exception: status=${status} code=${code} msg=${msg.slice(0, 240)}`,
        }),
      };
    }

    let dualEngine = null;
    let realityDiagnostic = '';
    if (enginesResult.graham && enginesResult.market) {
      // ----- Reality Check Stage 2: post-engine evidence + hard blockers ----
      // Re-run the heuristic registry now that both engines have spoken — this
      // surfaces engine-text-dependent findings (one_factor_thesis,
      // narrative_dependence) and ensures hard blockers (severe leverage,
      // accounting) cannot be overridden by the LLM.
      const allFindings = computeFindings({
        ...realityInputBase,
        engines: { graham: enginesResult.graham, market: enginesResult.market },
      });
      const grahamFindings = allFindings.filter(
        (f) => f.dimension !== 'narrative_dependence',
      );
      const grahamFinal = enforceHardBlockers(enginesResult.graham, grahamFindings);
      const marketFinal = enginesResult.market; // Market stays pure.

      // ----- Storyteller -------------------------------------------------
      // Translate Graham's analytical output into plain language for the
      // hero card. Non-fatal: hero gracefully falls back to analytical text.
      let storyResult = null;
      try {
        storyResult = await runStoryteller({
          apiKey,
          model,
          graham: grahamFinal,
          lang,
          deadlineMs: 12000,
        });
      } catch (stErr) {
        console.error('[interpret] storyteller failed:', stErr && stErr.message);
        storyResult = null;
      }
      if (storyResult && storyResult.summary) {
        grahamFinal.plainSummary = storyResult.summary;
      }

      const grahamDecision = grahamFinal.decision;
      const marketDecision = marketFinal.decision;
      const setupType = deriveSetupType(grahamDecision, marketDecision);
      const alignment = deriveAlignment(grahamDecision, marketDecision);
      dualEngine = {
        graham: grahamFinal,
        market: marketFinal,
        alignment,
        setupType,
        insight: deriveInsight(setupType, lang),
        suggestedAction: deriveGrahamLedAction(grahamFinal, marketFinal, lang),
        ctaLabel: deriveCTALabel(setupType, lang),
        ctaSub: deriveCTASub(setupType, lang),
      };

      const blocked = grahamFinal.blocked ? 1 : 0;
      const band = grahamFinal.fragilityBand || 'na';
      const tailwindCount = allFindings.filter(
        (f) => f.severity === 'tailwind' || f.severity === 'strong_tailwind',
      ).length;
      const headwindCount = allFindings.length - tailwindCount;
      const storyTag = storyResult
        ? `, story[${storyResult.len}c/${storyResult.elapsedMs}ms${storyResult.stoppedEarly ? ',cut' : ''}${storyResult.summary ? '' : ',fail'}]`
        : ', story[skip]';
      realityDiagnostic = `, reality[pre=${structuralFindings.length}f, post=${headwindCount}h+${tailwindCount}t, band=${band}${blocked ? ', blocked' : ''}]${storyTag}`;
    }
    if (typeof aiDiagnostic === 'string' && realityDiagnostic) {
      aiDiagnostic = `${aiDiagnostic}${realityDiagnostic}`;
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ai: aiResult.ai,
        dualEngine,
        aiDiagnostic,
      }),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[interpret] error:', err);
    }
    const message = err && err.message ? String(err.message) : '';
    if (/not found|No data/i.test(message)) {
      return errorResponse(404, 'tickerNotFound');
    }
    return errorResponse(500, 'generic');
  }
};
