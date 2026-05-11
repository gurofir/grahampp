'use strict';

const { computeIndicators } = require('./shared/analysis/indicators');
const { buildPayload, runAiInterpretation } = require('./shared/ai/aiPrompt');
const { runEngines } = require('./shared/engines/engines');
const { computeFindings, enforceHardBlockers } = require('./shared/reality/realityCheck');
const { runStoryteller } = require('./shared/ai/storyteller');
const { fetchFundamentals } = require('./shared/fetch/fetcher');
const {
  deriveAlignment,
  deriveSetupType,
  deriveInsight,
  deriveGrahamLedAction,
  deriveCTALabel,
  deriveCTASub,
} = require('./shared/alignment/alignment');

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

    const { indicators, intrinsicValue, insider } = computeIndicators(raw);

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
        insider,
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
