'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;

const KEY_INDICATORS = [
  'A1_revenueGrowth',
  'A2_epsGrowth',
  'A3_fcfConversion',
  'A4_ownerEarnings',
  'B1_grossMargin',
  'B2_operatingMargin',
  'B3_netMargin',
  'B4_roic',
  'B5_roe',
  'C1_debtEquity',
  'C2_currentRatio',
  'C3_interestCoverage',
  'C4_netDebtEbitda',
  'D1_pe',
  'D2_forwardPE',
  'D3_peg',
  'D4_fcfYield',
  'D5_evEbitda',
  'D6_priceSales',
  'D7_marginOfSafety',
  'D8_dividendYield',
  'D9_payoutRatio',
  'D10_dividendStreak',
  'E1_grossMarginStability',
  'E2_roicMoat',
  'F1_roicTrend',
  'F2_fcfConversionTrend',
  'F3_insiderSignal',
];

function isSeries(ind) {
  return ind && Array.isArray(ind.values);
}

function round(v, digits = 3) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function buildPayload({
  ticker,
  companyName,
  businessSummary,
  currentPrice,
  currency,
  indicators,
  intrinsicValue,
}) {
  // Slim per-indicator payload: only latest figure + tier + position.
  const slim = {};
  for (const key of KEY_INDICATORS) {
    const ind = indicators[key];
    if (!ind) continue;
    if (isSeries(ind)) {
      slim[key] = {
        v: round(ind.latestValue, 4),
        tier: ind.latestTier,
        pos: round(ind.latestPosition, 2),
      };
    } else {
      slim[key] = {
        v: round(ind.value, 4),
        tier: ind.tier,
        pos: round(ind.position, 2),
      };
    }
  }
  return {
    ticker,
    companyName,
    businessSummary: typeof businessSummary === 'string' ? businessSummary.slice(0, 2000) : null,
    currentPrice: round(currentPrice, 2),
    currency,
    intrinsicValue: intrinsicValue
      ? {
          graham: round(intrinsicValue.graham, 2),
          dcf: round(intrinsicValue.dcf, 2),
        }
      : null,
    indicators: slim,
  };
}

const SECTION_PROMPT = `You are a financial data interpreter. You receive structured financial data for a public company.
Your job is to present the data clearly and objectively — no recommendations, no verdicts, no buy/sell signals.

Produce a JSON object with exactly these fields:

{
  "businessDescription": "Leave this as an empty string \"\". A separate prompt handles this field.",

  "grahamNarrative": "3-5 sentences. Describe what the numbers collectively reveal — tensions, contradictions, patterns. Use only factual language. Never use words like: strong, weak, good, bad, concerning, impressive, healthy, dangerous, critical. Instead describe relationships between numbers. Example: 'Revenue declined 2.8% while EPS grew 44.8% — a gap that indicates either cost reduction, mix shift, or share buybacks rather than top-line growth.' Surface the most interesting analytical tensions in the data.",

  "positiveSignals": [
    "one COMPLETE sentence: subject + verb + number + plain-language context — no judgment words",
    "..."
  ],

  "challengingSignals": [
    "one COMPLETE sentence: subject + verb + number + plain-language context — no judgment words",
    "..."
  ],

  "questions": ["A specific, analytical question the data raises — ending with ?", "..."],

  "moatType": "SwitchingCosts | NetworkEffects | CostAdvantage | Intangibles | Scale | None",
  "moatRating": "Wide | Narrow | None",

  "problemClassification": "Temporary | Structural | Mixed | None",
  "problemExplanation": "1 plain-language sentence describing the company's current situation/problem (or 'אין בעיה בולטת בנתונים' / 'No notable issue in the data' if classification=None). No judgment words.",

  "catalystPresent": true,
  "catalystDescription": "1 sentence describing a tangible upcoming catalyst (or null if none).",
  "catalystTimeline": "short timeline string like '6-12 חודשים' or '6-12 months' (or null if none)"
}

SIGNAL FORMAT (CRITICAL):
- Every signal must include a NUMBER (the actual indicator value, percentage, or ratio).
- Every signal must include plain-language context that explains what the number means — not whether it is "good" or "bad".
- Format template: "[indicator name] של [value] — [one-sentence plain explanation]" (or English equivalent).
- Examples of CORRECT signals:
  • "EPS גדל 44.8% בעוד הכנסות ירדו 2.8% — הרווח לכל מניה מאיץ ללא צמיחת טופ-ליין"
  • "P/E של 7.2× — נמוך ממחצית ממוצע הענף של 14×"
  • "Current Ratio של 0.39 — התחייבויות שוטפות גבוהות פי 2.5 מהנכסים השוטפים"
  • "FCF Yield של 11.4% — כל $100 מושקעים מייצרים $11.4 מזומן שנתי"
- Examples of INCORRECT signals (do NOT produce these):
  • "FCF חזק מאוד" — no number, judgment word
  • "ROIC וROE חלשים" — no number, judgment word
  • "שוליים חלשים אך ROE חזק" — judgment words

SIGNAL SELECTION:
- positiveSignals (3-4 items): pick indicators whose latest position is > 0.6 (high end of their tier).
- challengingSignals (3-4 items): pick indicators whose latest position is < 0.4 (low end of their tier).

QUESTIONS:
- 3-4 questions, each specific to THIS company's actual numbers — not generic. Pure analytical curiosity, no directional bias.

MOAT / PROBLEM / CATALYST:
- moatType: pick the single most fitting type from the enum, or "None" if no clear moat.
- moatRating: "Wide" only if ROIC consistently > 15% AND barriers to entry are clear; "Narrow" if some advantage but limited; "None" otherwise.
- problemClassification: "Temporary" = cyclical or one-off issue; "Structural" = lasting business-model challenge; "Mixed" = both; "None" = no notable issue.
- catalystPresent: true only if a tangible upcoming catalyst is visible in the data (earnings inflection, product launch, refinancing window, regulatory event, margin expansion path). Otherwise false.
- catalystDescription / catalystTimeline must be null when catalystPresent=false.

GLOBAL CRITICAL RULES:
- Never use these judgment words anywhere: strong, weak, good, bad, healthy, dangerous, critical, impressive, concerning, excellent, poor, solid, robust, חזק, חלש, מסוכן, בעייתי, גבוה מדי, נמוך מדי.
- Never recommend buying, selling, or holding.
- Never say "this suggests you should" or "investors may want to".
- Describe numbers and their relationships only.

Respond ONLY with valid JSON. No markdown fences. No prose outside the JSON.`;

const INSIGHTS_PROMPT = `You are a financial data interpreter. You receive structured financial data with each indicator's value, tier, and position (0.0 = bottom of tier, 1.0 = top of tier).

For EVERY indicator key in the input "indicators" object, write ONE concise sentence (max ~18 words) describing what THAT indicator's value means for THIS company — purely factually.

Respond ONLY with this JSON (no markdown fences, no prose):

{
  "indicatorInsights": {
    "A1_revenueGrowth": "one sentence...",
    "B4_roic": "one sentence...",
    "...": "one entry per indicator key from the input (use EXACT same keys)."
  }
}

CRITICAL RULES:
- Include EVERY indicator key from the input in indicatorInsights.
- Exactly ONE sentence per indicator; do not exceed ~18 words.
- Never use these judgment words: strong, weak, good, bad, healthy, dangerous, critical, impressive, concerning, excellent, poor, solid, robust.
- Never recommend buying, selling, or holding. Describe numbers only.`;

const VERDICT_PROMPT = `You are a Graham–Buffett value-investing analyst. You receive structured financial data with each indicator's value, tier, and position (0.0 = bottom of tier, 1.0 = top of tier).

Decide a single verdict for this company AT THIS PRICE and explain it with concrete numbers from the data.

Respond ONLY with this JSON (no markdown fences, no prose):

{
  "verdict": "interesting | waiting | pass",
  "verdictReasoning": "3-5 complete sentences. Must reference AT LEAST 3 specific indicator values (numbers, percentages, ratios) drawn from the input. Structure: [what the data collectively shows] → [the key tension or risk] → [why this verdict]. Direct and concrete — no hedging, no 'it depends'. Plain text only.",
  "missingFactors": ["1-2 short strings — ONLY when verdict=waiting; otherwise null"]
}

VERDICT CRITERIA:
- "interesting" — ALL of:
  * at least 3 of 4 valuation indicators (D1_pe, D3_peg, D4_fcfYield, D5_evEbitda) in undervalued/attractive tier OR position > 0.6
  * FCF positive AND A3_fcfConversion > 0.5
  * problemClassification = Temporary AND catalystPresent = true
  * C4_netDebtEbitda < 4.0
  * B4_roic > 8% OR F1_roicTrend clearly improving
- "pass" — ANY of:
  * FCF negative for 2+ consecutive years
  * C4_netDebtEbitda > 5.0
  * C3_interestCoverage < 1.5
  * problemClassification = Structural
  * all 4 valuation indicators in expensive/speculative tier
- "waiting" — anything in between (default): some criteria met but not all, key data missing, catalyst unclear or > 24 months, mixed problem classification.

HEBREW LANGUAGE RULES (apply only when target language is Hebrew):
- Use Hebrew financial terms inline. Do NOT use English acronyms in Hebrew sentences.
- Translation table:
  ROIC → תשואה על ההון המושקע · FCF Yield → תשואת תזרים מזומנים חופשי · FCF → תזרים מזומנים חופשי · P/E → מכפיל רווח · PEG → מכפיל צמיחה · EPS → רווח למניה · Current Ratio → יחס שוטף · Gross Margin → מרווח גולמי · Operating Margin → מרווח תפעולי · Net Margin → מרווח נקי · D/E → יחס חוב להון · EV/EBITDA → מכפיל ערך עסקי · Moat → יתרון תחרותי · Catalyst → טריגר.
- Numbers and percentages appear inline (e.g., "תשואה על ההון המושקע של 22.4%").

GLOBAL RULES:
- Never recommend buying/selling/holding. "interesting" means worth further research; "pass" means does not meet Graham–Buffett criteria at this price.
- Avoid judgment words: strong, weak, good, bad, healthy, dangerous, critical, חזק, חלש, מסוכן, בעייתי. Describe numbers and tensions only.
- missingFactors must be null when verdict is "interesting" or "pass".`;

// Generates a tight, plain-English summary of the company's official Yahoo
// Finance "longBusinessSummary" for the About accordion at the top of the
// analysis screen. Output language is always English regardless of the UI
// language — Hebrew users still see HE labels around English content.
const ABOUT_PROMPT = `You write short, plain-English company summaries for retail investors.

Given the company's official long description, write a 2-3 sentence summary in plain English that explains:
1. What the company actually does (its product or service).
2. How it makes money (revenue model, key markets it serves).
3. (Optional, only if the source clearly states it) Its market position or what makes it distinctive.

HARD RULES:
- 2 to 3 sentences total. Strictly under 60 words.
- Plain English only. Never use financial acronyms (no FCF, EBITDA, ARR, SaaS, EPS, ROIC).
- No numbers, no percentages, no financial metrics, no stock-price language.
- No buy/sell hints, no opinions, no superlatives ("leading", "premier", "best", "top") UNLESS the source explicitly states the company is the largest in its market.
- Do not start with the company name; start with what it does (e.g. "Sells supplemental insurance...", "Operates the world's largest container shipping fleet...").
- If the input is empty or unintelligible, return an empty string.

Respond ONLY with this JSON (no markdown fences, no prose):
{
  "businessDescription": "your 2-3 sentence summary"
}`;

function langInstruction(lang) {
  return lang === 'en' ? 'Language: ENGLISH.' : 'Language: HEBREW (כל הטקסט בעברית).';
}

function buildAboutPrompt({ text }) {
  return `${ABOUT_PROMPT}

INPUT (raw company description):
${JSON.stringify({ text: typeof text === 'string' ? text.slice(0, 2500) : '' })}`;
}

function buildSectionPrompt({ payload, lang }) {
  return `${SECTION_PROMPT}

${langInstruction(lang)}

INPUT:
${JSON.stringify(payload)}`;
}

function buildInsightsPrompt({ payload, lang }) {
  return `${INSIGHTS_PROMPT}

${langInstruction(lang)}

INPUT:
${JSON.stringify(payload)}`;
}

function buildVerdictPrompt({ payload, lang }) {
  return `${VERDICT_PROMPT}

${langInstruction(lang)}

INPUT:
${JSON.stringify(payload)}`;
}

function tryParseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* try to extract */
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* try repairing */
    }
  }
  return repairTruncatedJson(trimmed);
}

function repairTruncatedJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let body = text.slice(start);

  const lastQuote = body.lastIndexOf('"');
  const beforeLastQuote = body.lastIndexOf('"', lastQuote - 1);
  let inString = false;
  let escape = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (inString) {
    body = body.slice(0, beforeLastQuote >= 0 ? beforeLastQuote : lastQuote);
  }

  body = body.replace(/[\s,:]+$/, '');
  const lastComma = body.lastIndexOf(',');
  const lastBrace = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (lastComma > lastBrace) body = body.slice(0, lastComma);

  let openBraces = 0;
  let openBrackets = 0;
  inString = false; escape = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }
  while (openBrackets > 0) { body += ']'; openBrackets--; }
  while (openBraces > 0) { body += '}'; openBraces--; }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const MOAT_TYPES = ['SwitchingCosts', 'NetworkEffects', 'CostAdvantage', 'Intangibles', 'Scale', 'None'];
const MOAT_RATINGS = ['Wide', 'Narrow', 'None'];
const PROBLEM_CLASSES = ['Temporary', 'Structural', 'Mixed', 'None'];
const VERDICTS = ['interesting', 'waiting', 'pass'];

function normalizeSection(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    businessDescription: typeof parsed.businessDescription === 'string'
      ? parsed.businessDescription.trim()
      : '',
    grahamNarrative: typeof parsed.grahamNarrative === 'string'
      ? parsed.grahamNarrative.trim()
      : '',
    positiveSignals: Array.isArray(parsed.positiveSignals)
      ? parsed.positiveSignals.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [],
    challengingSignals: Array.isArray(parsed.challengingSignals)
      ? parsed.challengingSignals.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [],
    questions: Array.isArray(parsed.questions)
      ? parsed.questions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [],
    moatType: MOAT_TYPES.includes(parsed.moatType) ? parsed.moatType : 'None',
    moatRating: MOAT_RATINGS.includes(parsed.moatRating) ? parsed.moatRating : 'None',
    problemClassification: PROBLEM_CLASSES.includes(parsed.problemClassification)
      ? parsed.problemClassification
      : 'None',
    problemExplanation: typeof parsed.problemExplanation === 'string'
      ? parsed.problemExplanation.trim()
      : '',
    catalystPresent: !!parsed.catalystPresent,
    catalystDescription: typeof parsed.catalystDescription === 'string' && parsed.catalystDescription.trim()
      ? parsed.catalystDescription.trim()
      : null,
    catalystTimeline: typeof parsed.catalystTimeline === 'string' && parsed.catalystTimeline.trim()
      ? parsed.catalystTimeline.trim()
      : null,
  };
}

function normalizeVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const verdict = VERDICTS.includes(parsed.verdict) ? parsed.verdict : null;
  const reasoning = typeof parsed.verdictReasoning === 'string' ? parsed.verdictReasoning.trim() : '';
  if (!verdict || !reasoning) return null;
  const missingFactors = Array.isArray(parsed.missingFactors)
    ? parsed.missingFactors
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim())
        .slice(0, 2)
    : null;
  return {
    verdict,
    verdictReasoning: reasoning,
    missingFactors: verdict === 'waiting' && missingFactors && missingFactors.length ? missingFactors : null,
  };
}

function normalizeInsights(parsed, indicators) {
  const insights = {};
  const source = parsed && typeof parsed === 'object'
    ? (parsed.indicatorInsights && typeof parsed.indicatorInsights === 'object'
        ? parsed.indicatorInsights
        : parsed)
    : null;
  if (!source) return insights;
  for (const key of Object.keys(indicators)) {
    const v = source[key];
    if (typeof v === 'string' && v.trim()) insights[key] = v.trim();
  }
  return insights;
}

async function streamWithDeadline({ client, model, prompt, maxTokens, deadlineMs }) {
  const start = Date.now();
  let collected = '';
  let stoppedEarly = false;
  const stream = client.messages.stream({
    model: model || 'claude-haiku-4-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const deadlinePromise = new Promise((resolve) => setTimeout(resolve, deadlineMs));
  try {
    const mainPromise = (async () => {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          collected += event.delta.text;
        }
        if (Date.now() - start >= deadlineMs) {
          stoppedEarly = true;
          break;
        }
      }
    })();
    await Promise.race([mainPromise, deadlinePromise]);
    if (Date.now() - start >= deadlineMs) {
      stoppedEarly = true;
      try { stream.controller?.abort(); } catch { /* ignore */ }
    }
  } catch (err) {
    if (!collected) throw err;
  }
  return { text: collected.trim(), stoppedEarly, elapsedMs: Date.now() - start };
}

function normalizeAbout(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const v = parsed.businessDescription;
  return typeof v === 'string' ? v.trim() : '';
}

async function runAiInterpretation({ apiKey, model, payload, lang, deadlineMs = 21000 }) {
  const client = new Anthropic({ apiKey, timeout: deadlineMs + 1000, maxRetries: 0 });
  const sectionPrompt = buildSectionPrompt({ payload, lang });
  const insightsPrompt = buildInsightsPrompt({ payload, lang });
  const verdictPrompt = buildVerdictPrompt({ payload, lang });
  const hasBusinessText = typeof payload.businessSummary === 'string' && payload.businessSummary.trim();

  // Run all 4 calls in parallel. The About summary uses runAboutSummary so it
  // gets the built-in single retry on transient Anthropic failures (529, parse
  // errors, deadline). Other calls keep their existing single-shot behaviour.
  const [sectionResult, insightsResult, verdictResult, aboutDescription] = await Promise.all([
    streamWithDeadline({ client, model, prompt: sectionPrompt, maxTokens: 2000, deadlineMs })
      .catch((err) => ({ text: '', stoppedEarly: true, elapsedMs: 0, error: err && err.message })),
    streamWithDeadline({ client, model, prompt: insightsPrompt, maxTokens: 2000, deadlineMs })
      .catch((err) => ({ text: '', stoppedEarly: true, elapsedMs: 0, error: err && err.message })),
    streamWithDeadline({ client, model, prompt: verdictPrompt, maxTokens: 1200, deadlineMs })
      .catch((err) => ({ text: '', stoppedEarly: true, elapsedMs: 0, error: err && err.message })),
    hasBusinessText
      ? runAboutSummary({ apiKey, model, text: payload.businessSummary, deadlineMs: Math.min(deadlineMs, 18000) })
          .catch(() => '')
      : Promise.resolve(''),
  ]);

  const section = normalizeSection(tryParseJson(sectionResult.text));
  const indicatorInsights = normalizeInsights(tryParseJson(insightsResult.text), payload.indicators);
  const verdictData = normalizeVerdict(tryParseJson(verdictResult.text));

  const totalLen =
    sectionResult.text.length +
    insightsResult.text.length +
    verdictResult.text.length +
    (aboutDescription ? aboutDescription.length : 0);
  const anyEarly =
    sectionResult.stoppedEarly ||
    insightsResult.stoppedEarly ||
    verdictResult.stoppedEarly;
  const maxMs = Math.max(
    sectionResult.elapsedMs,
    insightsResult.elapsedMs,
    verdictResult.elapsedMs,
  );

  if (!section && Object.keys(indicatorInsights).length === 0 && !verdictData && !aboutDescription) {
    return { ai: null, rawTextLength: totalLen, stoppedEarly: anyEarly, elapsedMs: maxMs };
  }

  const ai = {
    businessDescription: aboutDescription || section?.businessDescription || '',
    grahamNarrative: section?.grahamNarrative || '',
    positiveSignals: section?.positiveSignals || [],
    challengingSignals: section?.challengingSignals || [],
    questions: section?.questions || [],
    moatType: section?.moatType || 'None',
    moatRating: section?.moatRating || 'None',
    problemClassification: section?.problemClassification || 'None',
    problemExplanation: section?.problemExplanation || '',
    catalystPresent: !!section?.catalystPresent,
    catalystDescription: section?.catalystDescription || null,
    catalystTimeline: section?.catalystTimeline || null,
    verdict: verdictData?.verdict || 'waiting',
    verdictReasoning: verdictData?.verdictReasoning || '',
    missingFactors: verdictData?.missingFactors || null,
    indicatorInsights,
  };

  return {
    ai,
    rawTextLength: totalLen,
    stoppedEarly: anyEarly,
    elapsedMs: maxMs,
    parts: {
      section: { len: sectionResult.text.length, stoppedEarly: sectionResult.stoppedEarly, ms: sectionResult.elapsedMs },
      insights: { len: insightsResult.text.length, stoppedEarly: insightsResult.stoppedEarly, ms: insightsResult.elapsedMs, count: Object.keys(indicatorInsights).length },
      verdict: { len: verdictResult.text.length, stoppedEarly: verdictResult.stoppedEarly, ms: verdictResult.elapsedMs, ok: !!verdictData },
      about: { ok: !!aboutDescription, len: aboutDescription ? aboutDescription.length : 0 },
    },
  };
}

// Standalone helper for the Discovery scan pipeline: generates ONLY the
// 2-3 sentence "About" summary so cached scan results can show it without
// running the full 3-prompt interpretation chain.
//
// Retries once on transient failures (Anthropic 529 overloaded, malformed
// JSON, deadline exceeded). One retry roughly doubles success rate during
// a parallel batch (5 tickers × 2 calls = 10 concurrent requests) without
// meaningfully increasing cost (~$0.001 per retry).
async function runAboutSummary({ apiKey, model, text, deadlineMs = 18000 }) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const client = new Anthropic({ apiKey, timeout: deadlineMs + 1000, maxRetries: 0 });
  const prompt = buildAboutPrompt({ text });

  const attempt = async () => {
    const result = await streamWithDeadline({
      client,
      model,
      prompt,
      maxTokens: 400,
      deadlineMs,
    });
    return normalizeAbout(tryParseJson(result.text));
  };

  try {
    const first = await attempt();
    if (first) return first;
  } catch {
    /* fall through to retry */
  }

  // Brief backoff to let any rate-limit / overload spike clear.
  await new Promise((r) => setTimeout(r, 600));

  try {
    return await attempt();
  } catch {
    return '';
  }
}

module.exports = {
  buildPayload,
  buildSectionPrompt,
  buildInsightsPrompt,
  buildVerdictPrompt,
  runAiInterpretation,
  runAboutSummary,
  KEY_INDICATORS,
  streamWithDeadline,
  tryParseJson,
  langInstruction,
};
