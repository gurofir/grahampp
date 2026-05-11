'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;
const { streamWithDeadline, tryParseJson, langInstruction } = require('../ai/aiPrompt');

const DECISIONS = ['BUY', 'WAIT', 'AVOID'];
const CONFIDENCE = ['Low', 'Medium', 'High'];

const GRAHAM_PROMPT = `You are Graham++, an integrated rigorous skeptic inspired by Benjamin Graham and Warren Buffett.

Your job is BOTH the value analysis AND the reality check. You synthesize:
1. The quantitative indicators (A growth, B profitability, C balance, D valuation, E moat, F management).
2. A pre-computed list of FRAGILITY FINDINGS (cyclicality, peak earnings, leverage stress, narrative dependence, etc.) that you MUST take into account before deciding.

You are not a naive value calculator — you are the analyst who already noticed every trap before recommending action.

Rules:
- You MUST take a clear position: BUY / WAIT / AVOID — no hedging or neutrality.
- HEADWIND findings with severity "severe" in dimensions liquidity_or_solvency or accounting_quality MUST move BUY → WAIT. Tailwinds NEVER override these.
- Multiple "warn" headwinds must lower confidence (Medium → Low). Several severe ones must lower BUY → WAIT.
- TAILWIND findings (positive context the static numbers may hide — cyclical_bottom, de_leveraging, margin_inflection, etc.) may justify upgrading WAIT → BUY ONLY IF the underlying numbers are at least "acceptable" (FCF not deeply negative for 2+ years, no severe headwind blocker).
- Tailwinds may also strengthen confidence in an existing BUY, but cannot push AVOID → BUY.
- A counter-thesis is REQUIRED unless the case is overwhelmingly safe. Build the strongest argument against your own decision.
- Ignore hype, narratives, and momentum.
- Prioritize downside protection over upside.
- BE EXTREMELY CONCISE. The UI is a small mobile card — long text breaks layout.

DECISION CRITERIA (Graham-Buffett practical hybrid — not academic Graham):

You are evaluating like Graham AND late-Buffett: cheap-and-mediocre is OK, great-and-fair is OK, only "expensive AND fragile" is a real AVOID. Use this matrix:

ABSOLUTE PREREQUISITES (must hold for any BUY):
- No severe headwind in liquidity_or_solvency or accounting_quality dimensions.
- C4_netDebtEbitda < 5 AND C3_interestCoverage > 2 (a sound enough balance sheet).
- FCF positive in at least 2 of the last 3 years (one bad year is allowed).

If the prerequisites hold, classify as BUY when ANY ONE of these three "pillars" is solidly true:

PILLAR 1 — Quality at a fair price (Buffett-style):
  B4_roic > 12% (or clearly improving trend) AND D1_pe < 22 (or D2_forwardPE < 18).
  → A wonderful business at a non-stretched price is a BUY even without deep margin of safety.

PILLAR 2 — Margin of safety (classic Graham):
  D7_marginOfSafety > 10% (price meaningfully below estimated intrinsic) AND B4_roic > 6%.
  → Statistical bargain with at least decent profitability.

PILLAR 3 — Value with quality signal:
  D1_pe between 8 and 18, AND (B1_grossMargin > 35% OR B4_roic > 8%), AND no severe negative trend in F1_roicTrend.
  → Reasonably priced business with real, persistent profitability.

OTHERWISE → WAIT.

AVOID when ANY of these fire:
- Severe headwind in liquidity_or_solvency or accounting_quality (always).
- C4_netDebtEbitda > 6 OR C3_interestCoverage < 1.5 (balance sheet stress).
- FCF negative for 3+ consecutive years AND no clear inflection.
- D1_pe > 40 with declining margins / decelerating growth (speculative without backing).
- F1_roicTrend strongly negative for 3+ years (structural decline).

Confidence guidance (be willing to use Medium/High):
- If two or more pillars are true → confidence = High.
- If one pillar is solidly true and prerequisites comfortable → confidence = Medium.
- If a pillar is true but barely, or warn-level headwinds present → confidence = Low.

You should be issuing BUY for a meaningful share of fundamentally sound, reasonably-priced companies — not just deep-distressed bargains. WAIT is appropriate when a pillar is borderline or a severe blocker exists. AVOID is reserved for active red flags, not for "not exciting enough".

FRAGILITY BAND (your own self-assessment after reviewing both headwinds AND tailwinds):
- "robust": few low-severity headwinds, possibly offset by tailwinds; decision rests on multiple independent factors.
- "moderate": real but manageable concerns; thesis still holds but caveats matter.
- "fragile": one major risk dimension dominates; small shock breaks the thesis.
- "unstable": multiple severe headwinds or a known blocker — decision should default to WAIT/AVOID.

LENGTH LIMITS (HARD — stay well under):
- thesis: ONE short sentence, max 18 words, must contain at least one number.
- why: 3 bullets, each max 12 words, each contains a specific number.
- risks: 2 bullets, each max 12 words. May reference findings.
- trigger: ONE short clause, max 12 words, measurable.
- entryZone: 1-3 words / a price range (e.g. "$58–60" or "מכפיל רווח <12"). null when decision != BUY.
- counter.summary: ONE sentence, max 22 words. The strongest case AGAINST your decision.
- counter.ifThen: ONE sentence in the form "If <event> within <horizon>, then <consequence>", max 22 words.
- counter.killSwitches: 1-3 short measurable clauses, each max 14 words.

Return ONLY valid JSON (no markdown fences, no prose):
{
  "decision": "BUY | WAIT | AVOID",
  "confidence": "Low | Medium | High",
  "fragilityBand": "robust | moderate | fragile | unstable",
  "thesis": "<= 18 words, one sentence, with a number",
  "why": ["bullet ≤12w", "bullet ≤12w", "bullet ≤12w"],
  "risks": ["bullet ≤12w", "bullet ≤12w"],
  "trigger": "<= 12 words, measurable",
  "entryZone": "<= 3 words or null",
  "counter": {
    "summary": "<= 22 words, strongest case against your decision",
    "ifThen": "If X within Y, then Z (<= 22 words)",
    "killSwitches": ["measurable clause", "measurable clause"]
  }
}

HEBREW LANGUAGE RULES (CRITICAL when target language = Hebrew):
You are writing for an Israeli analyst. The Hebrew must read like a native, fluent Hebrew analyst's text. Mistakes break trust.

REQUIRED translations (NEVER use the English version mid-Hebrew sentence):
- EPS → "רווח למניה"
- FCF → "תזרים מזומנים חופשי"
- FCF Yield → "תשואת תזרים מזומנים חופשי"
- ROIC → "תשואה על ההון המושקע"
- ROE → "תשואה על ההון העצמי"
- P/E → "מכפיל רווח"
- PEG → "מכפיל צמיחה"
- Current Ratio → "יחס שוטף"
- Gross Margin → "מרווח גולמי"
- Operating Margin → "מרווח תפעולי"
- Net Margin → "מרווח נקי"
- D/E → "יחס חוב להון"
- Net Debt/EBITDA → "חוב נטו ל-EBITDA"
- Interest Coverage → "כיסוי ריבית"
- Margin of Safety → "מרווח ביטחון"
- Moat → "יתרון תחרותי"
- Catalyst → "טריגר"
- Multiple → "מכפיל"

GRAMMAR (NEVER make these mistakes):
- "יעלה לעל X" ❌ → "יעלה מעל X" ✓
- "יפול ל-X" ❌ → "יירד אל מתחת ל-X" ✓
- "עמוק ערך" ❌ → "ערך משמעותי" / "מרווח ביטחון רחב" ✓
- "ללא רבעון או ירידה" ❌ → "ירידה ברבעון העוקב" ✓
- Use natural Hebrew word order. NEVER translate English syntax word-for-word.
- Numbers stay LTR inline ($68.45, 11.4%, 7.2×, 2.1×).

EXAMPLES of GOOD Hebrew (study these):
- thesis: "ערך עם מרווח ביטחון 48%, כיסוי ריבית 7× ויחס חוב נטו ל-EBITDA של 2.1×."
- why bullet: "מכפיל רווח 11× עם תשואה על ההון המושקע של 14%."
- trigger: "ירידה של תשואה על ההון המושקע מתחת ל-10% ברבעון הבא."

EXAMPLES of BAD Hebrew (NEVER do this):
- "EPS צומח 45% עם מכפיל רווח 10x" ❌  (EPS באנגלית באמצע משפט עברי)
- "FCF נמצא בעלייה" ❌  ("FCF" באנגלית — חייב "תזרים מזומנים חופשי")
- "אם יחס שוטף יפול לעל 0.35" ❌  (שגוי לחלוטין)

GLOBAL RULES:
- "BUY" / "WAIT" / "AVOID" are analytical positions, not investment advice.
- Avoid judgment words like חזק/חלש/מסוכן in the body — describe numbers and tensions.
- entryZone must be null unless decision = BUY.`;

const MARKET_PROMPT = `You are a market-oriented investor focused on growth, narratives, and capital flows.

Evaluate this company based on:
- Revenue acceleration and momentum
- Market narratives and tailwinds
- Multiple expansion potential
- Investor sentiment and positioning

Rules:
- You MUST take a clear position: BUY / WAIT / AVOID — no hedging or neutrality.
- High valuations are acceptable if growth justifies them.
- Focus on opportunity and upside.
- Consider what the market is already pricing in.
- BE EXTREMELY CONCISE. The UI is a small mobile card — long text breaks layout.

DECISION CRITERIA (Market lens):
- BUY when: revenue/earnings momentum is strong (A1_revenueGrowth > 10% OR A2_epsGrowth > 15%), forward outlook is improving, and there is a tangible narrative or catalyst pricing in further upside (D2_forwardPE meaningfully below trailing P/E, peg < 1.5, multiple expansion plausible).
- AVOID when: growth is decelerating sharply, valuation is speculative without growth backing (D5_evEbitda > 25 with declining margins), or sentiment is rolling over.
- WAIT for the in-between.

LENGTH LIMITS (HARD):
- thesis: ONE short sentence, max 18 words, must contain at least one number.
- why: 3 bullets, each max 12 words, each contains a specific number.
- risks: 2 bullets, each max 12 words.
- trigger: ONE short clause, max 12 words, measurable.

Return ONLY valid JSON (no markdown fences, no prose):
{
  "decision": "BUY | WAIT | AVOID",
  "confidence": "Low | Medium | High",
  "thesis": "<= 18 words, one sentence, with a number",
  "why": ["bullet ≤12w", "bullet ≤12w", "bullet ≤12w"],
  "risks": ["bullet ≤12w", "bullet ≤12w"],
  "trigger": "<= 12 words, measurable"
}

HEBREW LANGUAGE RULES (CRITICAL when target language = Hebrew):
You are writing for an Israeli analyst. The Hebrew must read like a native, fluent Hebrew analyst's text. Mistakes break trust.

REQUIRED translations (NEVER use the English version mid-Hebrew sentence):
- EPS → "רווח למניה"
- FCF → "תזרים מזומנים חופשי"
- FCF Yield → "תשואת תזרים מזומנים חופשי"
- ROIC → "תשואה על ההון המושקע"
- ROE → "תשואה על ההון העצמי"
- P/E → "מכפיל רווח"
- PEG → "מכפיל צמיחה"
- Multiple → "מכפיל"
- Forward P/E → "מכפיל רווח עתידי"
- Tailwind → "רוח גבית"
- Sentiment → "סנטימנט"
- Momentum → "מומנטום"

GRAMMAR (NEVER make these mistakes):
- "יעלה לעל X" ❌ → "יעלה מעל X" ✓
- "יפול ל-X" ❌ → "יירד אל מתחת ל-X" ✓
- "ללא רבעון" ❌ → "ברבעון הבא" ✓
- Use natural Hebrew word order. NEVER translate English syntax word-for-word.
- Numbers stay LTR inline ($68.45, 11.4%, 7.2×).

EXAMPLES of GOOD Hebrew:
- thesis: "צמיחת הכנסות 18% עם הרחבת מכפיל רווח עתידי לרמת 16× — סנטימנט חיובי."
- why bullet: "צמיחת רווח למניה 24% מעבירה את מכפיל הרווח לרמת 14×."
- trigger: "האטה של צמיחת ההכנסות מתחת ל-8% בשני רבעונים רצופים."

EXAMPLES of BAD Hebrew (NEVER do this):
- "EPS צומח 45%" ❌ (EPS חייב להיות "רווח למניה")
- "FCF Yield במגמה חיובית" ❌ (חייב "תשואת תזרים מזומנים חופשי")

GLOBAL RULES:
- "BUY" / "WAIT" / "AVOID" are analytical positions, not investment advice.
- Avoid generic judgment words; describe numbers, growth rates, and momentum.`;

const TAILWIND_SEVERITIES = new Set(['tailwind', 'strong_tailwind']);

function buildEnginePrompt(basePrompt, payload, lang, extras) {
  const header =
    lang === 'he'
      ? `TARGET LANGUAGE: HEBREW. כל הטקסט בעברית רהוטה ותקנית. אסור להשתמש באקרונימים אנגליים (EPS, FCF, ROIC, P/E, PEG וכו') באמצע משפט עברי — חייב להשתמש במונחים העבריים בלבד. שגיאות תחביר חמורות פוסלות את התשובה.`
      : `TARGET LANGUAGE: ENGLISH.`;

  // Optional extras (used by Graham synthesis prompt — fragility findings).
  // Split into headwinds (downside) and tailwinds (positive context).
  const findings = Array.isArray(extras?.findings) ? extras.findings : [];
  const headwinds = findings.filter((f) => !TAILWIND_SEVERITIES.has(f.severity));
  const tailwinds = findings.filter((f) => TAILWIND_SEVERITIES.has(f.severity));

  const headwindsBlock = headwinds.length
    ? `\n\nHEADWIND FINDINGS (deterministic risks — you MUST take these into account; severe in protected dimensions BLOCK BUY):\n${headwinds
        .map(
          (f, i) =>
            `  ${i + 1}. [${(f.severity || 'warn').toUpperCase()} · ${f.dimension}] ${f.evidence}`,
        )
        .join('\n')}`
    : '';

  const tailwindsBlock = tailwinds.length
    ? `\n\nTAILWIND FINDINGS (positive context the static numbers may hide; may upgrade WAIT → BUY only when underlying numbers are acceptable):\n${tailwinds
        .map(
          (f, i) =>
            `  ${i + 1}. [${(f.severity || 'tailwind').toUpperCase()} · ${f.dimension}] ${f.evidence}`,
        )
        .join('\n')}`
    : '';

  return `${header}

${basePrompt}

${langInstruction(lang)}${headwindsBlock}${tailwindsBlock}

INPUT:
${JSON.stringify(payload)}`;
}

function clamp(s, max = 600) {
  if (typeof s !== 'string') return '';
  const trimmed = s.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// Replace English financial acronyms that may slip into Hebrew output.
// Only triggered when lang=he. Word-boundary-safe replacements.
const HE_ACRONYM_REPLACEMENTS = [
  // Multi-letter & punctuated forms first (longer matches first)
  [/\bFCF\s*Yield\b/gi, 'תשואת תזרים מזומנים חופשי'],
  [/\bFree\s*Cash\s*Flow\b/gi, 'תזרים מזומנים חופשי'],
  [/\bForward\s*P\/?E\b/gi, 'מכפיל רווח עתידי'],
  [/\bP\/E\s*Ratio\b/gi, 'מכפיל רווח'],
  [/\bP\/E\b/gi, 'מכפיל רווח'],
  [/\bD\/E\b/gi, 'יחס חוב להון'],
  [/\bNet\s*Debt\s*\/\s*EBITDA\b/gi, 'חוב נטו ל-EBITDA'],
  [/\bInterest\s*Coverage\b/gi, 'כיסוי ריבית'],
  [/\bCurrent\s*Ratio\b/gi, 'יחס שוטף'],
  [/\bGross\s*Margin\b/gi, 'מרווח גולמי'],
  [/\bOperating\s*Margin\b/gi, 'מרווח תפעולי'],
  [/\bNet\s*Margin\b/gi, 'מרווח נקי'],
  [/\bMargin\s*of\s*Safety\b/gi, 'מרווח ביטחון'],
  // Single acronyms
  [/\bROIC\b/g, 'תשואה על ההון המושקע'],
  [/\bROE\b/g, 'תשואה על ההון העצמי'],
  [/\bROA\b/g, 'תשואה על הנכסים'],
  [/\bPEG\b/g, 'מכפיל צמיחה'],
  [/\bEPS\b/g, 'רווח למניה'],
  [/\bFCF\b/g, 'תזרים מזומנים חופשי'],
  // Common ungrammatical patterns
  [/\bיעלה\s+לעל\b/g, 'יעלה מעל'],
  [/\bירד\s+ללעל\b/g, 'יירד מעל'],
  [/\bעמוק\s+ערך\b/g, 'ערך משמעותי'],
];

function cleanHebrew(s) {
  if (typeof s !== 'string' || !s) return s;
  let out = s;
  for (const [re, rep] of HE_ACRONYM_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  // Collapse double spaces from replacements.
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out;
}

function normalizeBullets(arr, max = 5, maxLen = 110, transform) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => clamp(transform ? transform(s) : s, maxLen))
    .slice(0, max);
}

const FRAGILITY_BANDS = ['robust', 'moderate', 'fragile', 'unstable'];

function normalizeCounter(parsed, transform) {
  if (!parsed || typeof parsed !== 'object') return null;
  const summaryRaw = transform && typeof parsed.summary === 'string' ? transform(parsed.summary) : parsed.summary;
  const ifThenRaw = transform && typeof parsed.ifThen === 'string' ? transform(parsed.ifThen) : parsed.ifThen;
  const summary = clamp(summaryRaw, 200);
  const ifThen = clamp(ifThenRaw, 220);
  if (!summary && !ifThen) return null;
  const killSwitches = Array.isArray(parsed.killSwitches)
    ? parsed.killSwitches
        .filter((s) => typeof s === 'string' && s.trim())
        .slice(0, 3)
        .map((s) => clamp(transform ? transform(s) : s, 130))
    : [];
  return { summary, ifThen, killSwitches };
}

function normalizeEngine(parsed, { allowEntryZone, allowSynthesis, lang }) {
  if (!parsed || typeof parsed !== 'object') return null;
  const decision = DECISIONS.includes(parsed.decision) ? parsed.decision : null;
  if (!decision) return null;
  const confidence = CONFIDENCE.includes(parsed.confidence) ? parsed.confidence : 'Medium';
  const transform = lang === 'he' ? cleanHebrew : null;
  const thesisRaw = transform && typeof parsed.thesis === 'string' ? transform(parsed.thesis) : parsed.thesis;
  const thesis = clamp(thesisRaw, 180);
  if (!thesis) return null;
  const why = normalizeBullets(parsed.why, 3, 110, transform);
  const risks = normalizeBullets(parsed.risks, 2, 110, transform);
  const triggerRaw = transform && typeof parsed.trigger === 'string' ? transform(parsed.trigger) : parsed.trigger;
  const trigger = typeof triggerRaw === 'string' ? clamp(triggerRaw, 110) : '';
  const result = { decision, confidence, thesis, why, risks, trigger };
  if (allowEntryZone) {
    const entryZoneRaw = transform && typeof parsed.entryZone === 'string' ? transform(parsed.entryZone) : parsed.entryZone;
    const entryZone = typeof entryZoneRaw === 'string' ? clamp(entryZoneRaw, 40) : '';
    result.entryZone = decision === 'BUY' && entryZone ? entryZone : null;
  }
  if (allowSynthesis) {
    const fragilityBand = FRAGILITY_BANDS.includes(parsed.fragilityBand)
      ? parsed.fragilityBand
      : null;
    if (fragilityBand) result.fragilityBand = fragilityBand;
    const counter = normalizeCounter(parsed.counter, transform);
    if (counter) result.counter = counter;
  }
  return result;
}

async function runEngines({ apiKey, model, payload, lang, deadlineMs = 21000, findings = [] }) {
  const client = new Anthropic({ apiKey, timeout: deadlineMs + 1000, maxRetries: 0 });
  // Graham gets the deterministic findings injected — Market remains pure.
  const grahamPrompt = buildEnginePrompt(GRAHAM_PROMPT, payload, lang, { findings });
  const marketPrompt = buildEnginePrompt(MARKET_PROMPT, payload, lang);

  const [grahamResult, marketResult] = await Promise.all([
    streamWithDeadline({ client, model, prompt: grahamPrompt, maxTokens: 2000, deadlineMs })
      .catch((err) => ({ text: '', stoppedEarly: true, elapsedMs: 0, error: err && err.message })),
    streamWithDeadline({ client, model, prompt: marketPrompt, maxTokens: 1500, deadlineMs })
      .catch((err) => ({ text: '', stoppedEarly: true, elapsedMs: 0, error: err && err.message })),
  ]);

  const graham = normalizeEngine(tryParseJson(grahamResult.text), {
    allowEntryZone: true,
    allowSynthesis: true,
    lang,
  });
  const market = normalizeEngine(tryParseJson(marketResult.text), {
    allowEntryZone: false,
    allowSynthesis: false,
    lang,
  });

  return {
    graham,
    market,
    parts: {
      graham: {
        len: grahamResult.text.length,
        ms: grahamResult.elapsedMs,
        stoppedEarly: grahamResult.stoppedEarly,
        ok: !!graham,
      },
      market: {
        len: marketResult.text.length,
        ms: marketResult.elapsedMs,
        stoppedEarly: marketResult.stoppedEarly,
        ok: !!market,
      },
    },
  };
}

module.exports = {
  runEngines,
  DECISIONS,
  CONFIDENCE,
};
