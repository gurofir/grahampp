'use strict';

function deriveAlignment(grahamDecision, marketDecision) {
  if (grahamDecision === marketDecision) {
    if (grahamDecision === 'BUY') return 'aligned_bullish';
    if (grahamDecision === 'AVOID') return 'aligned_bearish';
    return 'aligned_neutral';
  }
  return 'conflict';
}

function deriveSetupType(grahamDecision, marketDecision) {
  if (grahamDecision === 'BUY' && marketDecision !== 'BUY') return 'rare_value';
  if (grahamDecision === 'BUY' && marketDecision === 'BUY') return 'consensus_buy';
  if (grahamDecision !== 'BUY' && marketDecision === 'BUY') return 'market_leading';
  if (grahamDecision === 'AVOID' && marketDecision === 'AVOID') return 'consensus_avoid';
  return 'neutral';
}

const INSIGHTS = {
  he: {
    rare_value: 'גרהם מזהה ערך — השוק עדיין לא מסכים. מצב נדיר: ערך לפני נרטיב.',
    consensus_buy: 'גרהם והשוק מסכימים — שני הצדדים רואים הזדמנות.',
    market_leading: 'השוק מוביל — גרהם מחכה לאישור יסודי לפני הכניסה.',
    consensus_avoid: 'גרהם והשוק מסכימים — שניהם רואים סיכון עולה על התשואה.',
    neutral: 'תמונה מעורבת — שני המנועים לא מגיעים להסכמה ברורה.',
  },
  en: {
    rare_value: 'Graham sees value — the market does not agree yet. A rare setup: value before narrative.',
    consensus_buy: 'Graham and the market agree — both sides see an opportunity.',
    market_leading: 'The market is leading — Graham is waiting for fundamental confirmation.',
    consensus_avoid: 'Graham and the market agree — both see risk outweighing reward.',
    neutral: 'Mixed picture — the two engines do not reach a clear agreement.',
  },
};

const ACTIONS = {
  he: {
    rare_value: { text: 'כניסה חלקית — יתרון לגרהם, ללא אישור שוק', sub: 'פוזיציה מוקדמת · הגדל לאחר אישור טריגר' },
    consensus_buy: { text: 'כניסה מלאה — שני המנועים תומכים', sub: 'קונצנזוס חיובי · נהל סיכון רגיל' },
    market_leading: { text: 'המתן לאישור יסודי לפני כניסה', sub: 'השוק מוביל · גרהם עדיין לא מאושר' },
    consensus_avoid: { text: 'הימנע — שני המנועים רואים סיכון', sub: 'אין יתרון ברור בשלב זה' },
    neutral: { text: 'עקוב — תמונה לא חד-משמעית', sub: 'הוסף ל-Watchlist וחזור לאחר הדוח הבא' },
  },
  en: {
    rare_value: { text: 'Partial entry — Graham edge, no market confirmation', sub: 'Early position · scale up after trigger confirms' },
    consensus_buy: { text: 'Full entry — both engines support', sub: 'Positive consensus · standard risk management' },
    market_leading: { text: 'Wait for fundamental confirmation', sub: 'Market leads · Graham not confirmed yet' },
    consensus_avoid: { text: 'Avoid — both engines see risk', sub: 'No clear edge at this stage' },
    neutral: { text: 'Monitor — picture is unclear', sub: 'Add to watchlist and revisit after next report' },
  },
};

const CTA_LABELS = {
  he: {
    rare_value: 'כניסה מוקדמת לפני אישור שוק',
    consensus_buy: 'הוסף לפוזיציה',
    market_leading: 'הוסף ל-Watchlist',
    consensus_avoid: 'הוסף ל-Watchlist',
    neutral: 'הוסף ל-Watchlist',
  },
  en: {
    rare_value: 'Early entry before market confirms',
    consensus_buy: 'Add to position',
    market_leading: 'Add to watchlist',
    consensus_avoid: 'Add to watchlist',
    neutral: 'Add to watchlist',
  },
};

const CTA_SUBS = {
  he: {
    rare_value: 'פוזיציה חלקית בלבד · סיכון גבוה יותר',
    consensus_buy: 'קונצנזוס חיובי · שני המנועים מסכימים',
    market_leading: 'ממתין לאישור גרהם',
    consensus_avoid: 'שני המנועים זהירים',
    neutral: 'מעקב ובדיקה עתידית',
  },
  en: {
    rare_value: 'Partial position only · higher risk',
    consensus_buy: 'Positive consensus · both engines agree',
    market_leading: 'Waiting for Graham confirmation',
    consensus_avoid: 'Both engines cautious',
    neutral: 'Monitor and revisit',
  },
};

function pick(map, lang, key) {
  const dict = map[lang] || map.he;
  return dict[key] || dict.neutral;
}

// Truncate a string at the nearest word boundary so insights never look
// chopped mid-word in the list.
function softTruncate(text, maxChars) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const head = trimmed.slice(0, maxChars);
  const lastSpace = head.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? head.slice(0, lastSpace) : head).replace(/[\s.,;:]+$/, '') + '…';
}

// The list-row insight should be the actual analytical thesis, not a
// boilerplate sentence keyed off setup type. Priority order:
//   1. Graham's thesis -- always one sentence with at least one number.
//   2. Graham's counter-thesis summary -- the "what could break this"
//      framing; useful when the thesis itself was missing.
//   3. Generic per-setup-type fallback (legacy behaviour) so we never
//      end up with an empty string.
function deriveInsight(setupType, lang, grahamFinal) {
  const thesis = softTruncate(grahamFinal?.thesis, 140);
  if (thesis) return thesis;
  const counterSummary = softTruncate(grahamFinal?.counter?.summary, 140);
  if (counterSummary) return counterSummary;
  return pick(INSIGHTS, lang, setupType);
}

// Surface ONE primary finding (tailwind for BUYs, headwind for WAIT/AVOID)
// so the list row can show a single sharp chip ("insider cluster buy",
// "leverage warning", etc.) instead of forcing the user to tap through
// to read the full panel.
//
// The finding object format matches realityCheck output:
//   { dimension, severity, evidence, scoreDelta, source }
const TAILWIND_SEVERITIES = new Set(['tailwind', 'strong_tailwind']);

function derivePrimaryFinding(grahamFinal) {
  const findings = Array.isArray(grahamFinal?.findings) ? grahamFinal.findings : [];
  if (findings.length === 0) return null;
  const decision = grahamFinal?.decision;
  const wantTailwind = decision === 'BUY';
  const matching = findings.filter((f) =>
    wantTailwind ? TAILWIND_SEVERITIES.has(f.severity) : !TAILWIND_SEVERITIES.has(f.severity),
  );
  // If no matching-direction finding exists, fall back to whichever exists
  // -- a BUY with only mild headwinds is still informative for triage.
  const pool = matching.length > 0 ? matching : findings;
  // findings[] is already severity-sorted by realityCheck.enforceHardBlockers,
  // so the first element is the most material.
  const top = pool[0];
  if (!top) return null;
  return {
    dimension: top.dimension,
    severity: top.severity,
    isTailwind: TAILWIND_SEVERITIES.has(top.severity),
  };
}

// "Interesting situation" score: a single 0..130 number used to sort the
// Discovery list. Replaces the older crude 0..200 scoreSetup that only
// looked at decision + confidence and treated every BUY equally.
//
// Composition:
//   decisionWeight  -- BUY:100, WAIT:40, AVOID:0  (AVOID is excluded
//                      upstream but kept here so the function is total).
//   confidenceMul   -- High:1.0, Medium:0.7, Low:0.4
//   fragilityMul    -- robust:1.0, moderate:0.85, fragile:0.5,
//                      unstable:0.2  (unstable also filtered upstream).
//   tailwindBonus   -- +5 per tailwind, capped at +20.
//   alignmentBonus  -- +10 if Graham and Market agree on the direction.
//   blockedFactor   -- 0.0 when graham.blocked === true (hard blocker
//                      override active). This forces blocked items to
//                      the bottom even if everything else looks fine.
const DECISION_WEIGHT = { BUY: 100, WAIT: 40, AVOID: 0 };
const CONFIDENCE_MUL = { High: 1.0, Medium: 0.7, Low: 0.4 };
const FRAGILITY_MUL = { robust: 1.0, moderate: 0.85, fragile: 0.5, unstable: 0.2 };

function deriveInterestingScore(grahamFinal, marketFinal) {
  const dec = grahamFinal?.decision || 'WAIT';
  const conf = grahamFinal?.confidence || 'Low';
  const frag = grahamFinal?.fragilityBand || 'moderate';
  const blocked = grahamFinal?.blocked === true;

  const base = (DECISION_WEIGHT[dec] ?? 40)
    * (CONFIDENCE_MUL[conf] ?? 0.4)
    * (FRAGILITY_MUL[frag] ?? 0.85);

  const findings = Array.isArray(grahamFinal?.findings) ? grahamFinal.findings : [];
  const tailwindCount = findings.filter((f) => TAILWIND_SEVERITIES.has(f.severity)).length;
  const tailwindBonus = Math.min(20, tailwindCount * 5);

  const alignmentBonus =
    grahamFinal?.decision && marketFinal?.decision && grahamFinal.decision === marketFinal.decision
      ? 10
      : 0;

  const score = (base + tailwindBonus + alignmentBonus) * (blocked ? 0 : 1);
  return Math.round(score);
}

function deriveSuggestedAction(setupType, lang) {
  return pick(ACTIONS, lang, setupType);
}

function deriveCTALabel(setupType, lang) {
  return pick(CTA_LABELS, lang, setupType);
}

function deriveCTASub(setupType, lang) {
  return pick(CTA_SUBS, lang, setupType);
}

// ---------------------------------------------------------------------------
// Graham-led recommendation. The hero card's "suggested action" line should
// speak in Graham's voice (the integrated skeptic) and only NOTE whether
// Market agrees or disagrees. This replaces the older setup-type-only text
// when Graham produced a decision.
// ---------------------------------------------------------------------------

const GRAHAM_LED_DECISION = {
  he: {
    BUY:   { text: 'Graham++ ממליץ להיכנס',         sub: 'התזה עברה את בדיקת המציאות' },
    WAIT:  { text: 'Graham++ ממליץ להמתין',        sub: 'התזה לא בשלה — סיכונים פתוחים' },
    AVOID: { text: 'Graham++ ממליץ להימנע',         sub: 'הסיכון עולה על הפוטנציאל' },
  },
  en: {
    BUY:   { text: 'Graham++ recommends entering',  sub: 'Thesis cleared the reality check' },
    WAIT:  { text: 'Graham++ recommends waiting',   sub: 'Thesis not ready — open risks' },
    AVOID: { text: 'Graham++ recommends avoiding',  sub: 'Risk outweighs the upside' },
  },
};

const MARKET_AGREEMENT_NOTE = {
  he: {
    aligned:    'השוק מסכים',
    contrast:   'השוק חולק — מצב נדיר',
    different:  'השוק רואה תמונה אחרת',
  },
  en: {
    aligned:    'Market agrees',
    contrast:   'Market disagrees — rare setup',
    different:  'Market sees a different picture',
  },
};

const FRAGILITY_NOTE = {
  he: {
    robust:   'יציב',
    moderate: 'עם הסתייגויות',
    fragile:  'שברירי',
    unstable: 'לא יציב',
  },
  en: {
    robust:   'Robust',
    moderate: 'With caveats',
    fragile:  'Fragile',
    unstable: 'Unstable',
  },
};

function deriveGrahamLedAction(graham, market, lang) {
  const dict = GRAHAM_LED_DECISION[lang] || GRAHAM_LED_DECISION.he;
  const base = dict[graham.decision] || dict.WAIT;
  const subParts = [];
  if (graham.fragilityBand) {
    const fragDict = FRAGILITY_NOTE[lang] || FRAGILITY_NOTE.he;
    const frag = fragDict[graham.fragilityBand];
    if (frag) subParts.push(frag);
  }
  const noteDict = MARKET_AGREEMENT_NOTE[lang] || MARKET_AGREEMENT_NOTE.he;
  if (graham.decision === market.decision) {
    subParts.push(noteDict.aligned);
  } else if (
    (graham.decision === 'BUY' && market.decision === 'AVOID') ||
    (graham.decision === 'AVOID' && market.decision === 'BUY')
  ) {
    subParts.push(noteDict.contrast);
  } else {
    subParts.push(noteDict.different);
  }
  return {
    text: base.text,
    sub: subParts.join(' · ') || base.sub,
  };
}

module.exports = {
  deriveAlignment,
  deriveSetupType,
  deriveInsight,
  derivePrimaryFinding,
  deriveInterestingScore,
  deriveSuggestedAction,
  deriveGrahamLedAction,
  deriveCTALabel,
  deriveCTASub,
};
