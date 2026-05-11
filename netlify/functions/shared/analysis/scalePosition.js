'use strict';

const NEG_INF = Number.NEGATIVE_INFINITY;
const POS_INF = Number.POSITIVE_INFINITY;

function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Tier definition shape:
 *   { tier: string, min: number, max: number, normMin: number, normMax: number }
 *
 * Indicator definition:
 *   {
 *     direction: 'higher_better' | 'lower_better',
 *     tiers: ordered worst→best (for matching), each with [min, max) range.
 *   }
 *
 * For higher_better: tiers are listed in ascending value order (danger → exceptional).
 * For lower_better: tiers are listed in DESCENDING value order (speculative → deep_value),
 *   so highest tier (worst) is first, best (lowest values) is last.
 *
 * Tier matching uses [min, max). The lowest defined tier has min = -Infinity,
 * the highest defined tier has max = +Infinity.
 *
 * normMin/normMax replace infinities with soft caps used for the within-tier
 * scalePosition calculation: (value - normMin) / (normMax - normMin), clamped [0,1].
 *
 * For lower_better indicators, scalePosition is then flipped: position = 1 - raw,
 * so that a higher position always means "better quality within the tier".
 */

const INDICATORS = {
  // ── A. Growth ────────────────────────────────────────────────────────────
  A1_revenueGrowth: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0,  normMin: -50, normMax: 0 },
      { tier: 'weak',        min: 0,  max: 5,       normMin: 0,   normMax: 5 },
      { tier: 'acceptable',  min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'strong',      min: 10, max: 20,      normMin: 10,  normMax: 20 },
      { tier: 'exceptional', min: 20, max: POS_INF, normMin: 20,  normMax: 40 },
    ],
  },
  A2_epsGrowth: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0,  normMin: -50, normMax: 0 },
      { tier: 'weak',        min: 0,  max: 5,       normMin: 0,   normMax: 5 },
      { tier: 'acceptable',  min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'strong',      min: 10, max: 20,      normMin: 10,  normMax: 20 },
      { tier: 'exceptional', min: 20, max: POS_INF, normMin: 20,  normMax: 40 },
    ],
  },
  // FCF conversion (FCF / NetIncome)
  A3_fcfConversion: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0,    normMin: -1.0, normMax: 0 },
      { tier: 'weak',        min: 0,    max: 0.5,     normMin: 0,    normMax: 0.5 },
      { tier: 'acceptable',  min: 0.5,  max: 0.8,     normMin: 0.5,  normMax: 0.8 },
      { tier: 'strong',      min: 0.8,  max: 1.0,     normMin: 0.8,  normMax: 1.0 },
      { tier: 'exceptional', min: 1.0,  max: POS_INF, normMin: 1.0,  normMax: 2.0 },
    ],
  },
  // OwnerEarnings / NetIncome
  A4_ownerEarnings: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0.3,  normMin: -1.0, normMax: 0.3 },
      { tier: 'weak',        min: 0.3,  max: 0.6,     normMin: 0.3,  normMax: 0.6 },
      { tier: 'acceptable',  min: 0.6,  max: 0.8,     normMin: 0.6,  normMax: 0.8 },
      { tier: 'strong',      min: 0.8,  max: 1.0,     normMin: 0.8,  normMax: 1.0 },
      { tier: 'exceptional', min: 1.0,  max: POS_INF, normMin: 1.0,  normMax: 2.0 },
    ],
  },

  // ── B. Profitability ────────────────────────────────────────────────────
  B1_grossMargin: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 15, normMin: -20, normMax: 15 },
      { tier: 'weak',        min: 15, max: 25,      normMin: 15,  normMax: 25 },
      { tier: 'acceptable',  min: 25, max: 40,      normMin: 25,  normMax: 40 },
      { tier: 'strong',      min: 40, max: 50,      normMin: 40,  normMax: 50 },
      { tier: 'exceptional', min: 50, max: POS_INF, normMin: 50,  normMax: 80 },
    ],
  },
  B2_operatingMargin: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -20, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 15,      normMin: 10,  normMax: 15 },
      { tier: 'strong',      min: 15, max: 25,      normMin: 15,  normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25,  normMax: 45 },
    ],
  },
  B3_netMargin: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0,  normMin: -20, normMax: 0 },
      { tier: 'weak',        min: 0,  max: 5,       normMin: 0,   normMax: 5 },
      { tier: 'acceptable',  min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'strong',      min: 10, max: 20,      normMin: 10,  normMax: 20 },
      { tier: 'exceptional', min: 20, max: POS_INF, normMin: 20,  normMax: 40 },
    ],
  },
  B4_roic: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -10, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 15,      normMin: 10,  normMax: 15 },
      { tier: 'strong',      min: 15, max: 25,      normMin: 15,  normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25,  normMax: 50 },
    ],
  },
  B5_roe: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -10, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 15,      normMin: 10,  normMax: 15 },
      { tier: 'strong',      min: 15, max: 25,      normMin: 15,  normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25,  normMax: 50 },
    ],
  },

  // ── C. Financial Health ──────────────────────────────────────────────────
  // Lower is better — listed worst→best (highest D/E first).
  C1_debtEquity: {
    direction: 'lower_better',
    tiers: [
      { tier: 'danger',      min: 3.0,    max: POS_INF, normMin: 3.0, normMax: 6.0 },
      { tier: 'weak',        min: 2.0,    max: 3.0,     normMin: 2.0, normMax: 3.0 },
      { tier: 'acceptable',  min: 1.0,    max: 2.0,     normMin: 1.0, normMax: 2.0 },
      { tier: 'strong',      min: 0.3,    max: 1.0,     normMin: 0.3, normMax: 1.0 },
      { tier: 'exceptional', min: NEG_INF, max: 0.3,    normMin: 0,   normMax: 0.3 },
    ],
  },
  C2_currentRatio: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0.8, normMin: 0,   normMax: 0.8 },
      { tier: 'weak',        min: 0.8, max: 1.0,     normMin: 0.8, normMax: 1.0 },
      { tier: 'acceptable',  min: 1.0, max: 1.5,     normMin: 1.0, normMax: 1.5 },
      { tier: 'strong',      min: 1.5, max: 2.5,     normMin: 1.5, normMax: 2.5 },
      { tier: 'exceptional', min: 2.5, max: POS_INF, normMin: 2.5, normMax: 5.0 },
    ],
  },
  C3_interestCoverage: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 1.5, normMin: -5,  normMax: 1.5 },
      { tier: 'weak',        min: 1.5, max: 3.0,     normMin: 1.5, normMax: 3.0 },
      { tier: 'acceptable',  min: 3.0, max: 5.0,     normMin: 3.0, normMax: 5.0 },
      { tier: 'strong',      min: 5.0, max: 10.0,    normMin: 5.0, normMax: 10.0 },
      { tier: 'exceptional', min: 10,  max: POS_INF, normMin: 10,  normMax: 30 },
    ],
  },
  // Lower is better. Net cash (negative) is exceptional.
  C4_netDebtEbitda: {
    direction: 'lower_better',
    tiers: [
      { tier: 'danger',      min: 4.0,     max: POS_INF, normMin: 4.0, normMax: 10 },
      { tier: 'weak',        min: 2.5,     max: 4.0,     normMin: 2.5, normMax: 4.0 },
      { tier: 'acceptable',  min: 1.5,     max: 2.5,     normMin: 1.5, normMax: 2.5 },
      { tier: 'strong',      min: 0.5,     max: 1.5,     normMin: 0.5, normMax: 1.5 },
      { tier: 'exceptional', min: NEG_INF, max: 0.5,     normMin: -3,  normMax: 0.5 },
    ],
  },

  // ── D. Valuation ─────────────────────────────────────────────────────────
  D1_pe: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 40,      max: POS_INF, normMin: 40, normMax: 100 },
      { tier: 'premium',     min: 25,      max: 40,      normMin: 25, normMax: 40 },
      { tier: 'fair',        min: 15,      max: 25,      normMin: 15, normMax: 25 },
      { tier: 'undervalued', min: 10,      max: 15,      normMin: 10, normMax: 15 },
      { tier: 'deep_value',  min: NEG_INF, max: 10,      normMin: 0,  normMax: 10 },
    ],
  },
  D2_forwardPE: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 40,      max: POS_INF, normMin: 40, normMax: 100 },
      { tier: 'premium',     min: 25,      max: 40,      normMin: 25, normMax: 40 },
      { tier: 'fair',        min: 15,      max: 25,      normMin: 15, normMax: 25 },
      { tier: 'undervalued', min: 10,      max: 15,      normMin: 10, normMax: 15 },
      { tier: 'deep_value',  min: NEG_INF, max: 10,      normMin: 0,  normMax: 10 },
    ],
  },
  D3_peg: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 2.0,     max: POS_INF, normMin: 2.0, normMax: 5.0 },
      { tier: 'expensive',   min: 1.5,     max: 2.0,     normMin: 1.5, normMax: 2.0 },
      { tier: 'fair',        min: 1.0,     max: 1.5,     normMin: 1.0, normMax: 1.5 },
      { tier: 'undervalued', min: 0.5,     max: 1.0,     normMin: 0.5, normMax: 1.0 },
      { tier: 'exceptional', min: NEG_INF, max: 0.5,     normMin: 0,   normMax: 0.5 },
    ],
  },
  D4_fcfYield: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 2,  normMin: -10, normMax: 2 },
      { tier: 'weak',        min: 2,  max: 4,       normMin: 2,   normMax: 4 },
      { tier: 'acceptable',  min: 4,  max: 7,       normMin: 4,   normMax: 7 },
      { tier: 'strong',      min: 7,  max: 10,      normMin: 7,   normMax: 10 },
      { tier: 'exceptional', min: 10, max: POS_INF, normMin: 10,  normMax: 20 },
    ],
  },
  D5_evEbitda: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 20,      max: POS_INF, normMin: 20, normMax: 50 },
      { tier: 'premium',     min: 15,      max: 20,      normMin: 15, normMax: 20 },
      { tier: 'fair',        min: 10,      max: 15,      normMin: 10, normMax: 15 },
      { tier: 'attractive',  min: 6,       max: 10,      normMin: 6,  normMax: 10 },
      { tier: 'deep_value',  min: NEG_INF, max: 6,       normMin: 0,  normMax: 6 },
    ],
  },
  D6_priceSales: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 10,      max: POS_INF, normMin: 10, normMax: 30 },
      { tier: 'expensive',   min: 5,       max: 10,      normMin: 5,  normMax: 10 },
      { tier: 'acceptable',  min: 2,       max: 5,       normMin: 2,  normMax: 5 },
      { tier: 'attractive',  min: 1,       max: 2,       normMin: 1,  normMax: 2 },
      { tier: 'deep_value',  min: NEG_INF, max: 1,       normMin: 0,  normMax: 1 },
    ],
  },
  D7_marginOfSafety: {
    direction: 'higher_better',
    tiers: [
      { tier: 'none',        min: NEG_INF, max: 0,  normMin: -50, normMax: 0 },
      { tier: 'minimal',     min: 0,  max: 10,      normMin: 0,   normMax: 10 },
      { tier: 'moderate',    min: 10, max: 20,      normMin: 10,  normMax: 20 },
      { tier: 'strong',      min: 20, max: 40,      normMin: 20,  normMax: 40 },
      { tier: 'exceptional', min: 40, max: POS_INF, normMin: 40,  normMax: 80 },
    ],
  },
  // Dividend yield (%). 0% = non-payer (not a danger, just no signal), 2-4%
  // = healthy income payer, 4-6% = high yield, >6% = often a stress signal
  // (price collapsed faster than dividend can be cut) so we flag it.
  D8_dividendYield: {
    direction: 'higher_better',
    tiers: [
      { tier: 'none',        min: NEG_INF, max: 0.5, normMin: 0,   normMax: 0.5 },
      { tier: 'minimal',     min: 0.5, max: 2,      normMin: 0.5, normMax: 2 },
      { tier: 'moderate',    min: 2,   max: 4,      normMin: 2,   normMax: 4 },
      { tier: 'strong',      min: 4,   max: 6,      normMin: 4,   normMax: 6 },
      // >6% becomes "exceptional" but flagged via Reality Check as potential
      // distress (yield trap). The position score reflects "high".
      { tier: 'exceptional', min: 6,   max: POS_INF, normMin: 6,  normMax: 12 },
    ],
  },
  // Payout ratio (%). <30% = lots of room, 30-60% = sustainable, 60-80% =
  // tight, >80% = unsustainable (cut likely). >100% = paying with debt.
  D9_payoutRatio: {
    direction: 'lower_better',
    tiers: [
      { tier: 'speculative', min: 100, max: POS_INF, normMin: 100, normMax: 200 },
      { tier: 'expensive',   min: 80,  max: 100,    normMin: 80,  normMax: 100 },
      { tier: 'acceptable',  min: 60,  max: 80,     normMin: 60,  normMax: 80 },
      { tier: 'attractive',  min: 30,  max: 60,     normMin: 30,  normMax: 60 },
      { tier: 'deep_value',  min: NEG_INF, max: 30, normMin: 0,   normMax: 30 },
    ],
  },
  // Years of consecutive non-decreasing annual dividends. 0 = non-payer
  // (no signal, neither good nor bad), 5+ = reliable payer, 25+ = aristocrat.
  D10_dividendStreak: {
    direction: 'higher_better',
    tiers: [
      { tier: 'none',        min: NEG_INF, max: 1,  normMin: 0,  normMax: 1 },
      { tier: 'minimal',     min: 1,  max: 5,       normMin: 1,  normMax: 5 },
      { tier: 'moderate',    min: 5,  max: 10,      normMin: 5,  normMax: 10 },
      { tier: 'strong',      min: 10, max: 25,      normMin: 10, normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25, normMax: 50 },
    ],
  },

  // ── E. Moat ──────────────────────────────────────────────────────────────
  // Lower stdDev = more stable = better.
  E1_grossMarginStability: {
    direction: 'lower_better',
    tiers: [
      { tier: 'danger',      min: 8.0,     max: POS_INF, normMin: 8,  normMax: 20 },
      { tier: 'weak',        min: 5.0,     max: 8.0,     normMin: 5,  normMax: 8 },
      { tier: 'acceptable',  min: 3.0,     max: 5.0,     normMin: 3,  normMax: 5 },
      { tier: 'strong',      min: 1.0,     max: 3.0,     normMin: 1,  normMax: 3 },
      { tier: 'exceptional', min: NEG_INF, max: 1.0,     normMin: 0,  normMax: 1 },
    ],
  },
  // E2 reuses ROIC scale.
  E2_roicMoat: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -10, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,      normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 15,      normMin: 10,  normMax: 15 },
      { tier: 'strong',      min: 15, max: 25,      normMin: 15,  normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25,  normMax: 50 },
    ],
  },

  // ── F. Management ────────────────────────────────────────────────────────
  // ROIC trend in percentage points per year (latest minus 3yr ago, divided by 3).
  F1_roicTrend: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: -2, normMin: -10, normMax: -2 },
      { tier: 'weak',        min: -2, max: 0,      normMin: -2, normMax: 0 },
      { tier: 'acceptable',  min: 0,  max: 1,      normMin: 0,  normMax: 1 },
      { tier: 'strong',      min: 1,  max: 3,      normMin: 1,  normMax: 3 },
      { tier: 'exceptional', min: 3,  max: POS_INF, normMin: 3, normMax: 8 },
    ],
  },
  // FCF conversion average over last 3 years (ratio of FCF/NI).
  F2_fcfConversionTrend: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: 0,    normMin: -1, normMax: 0 },
      { tier: 'weak',        min: 0,    max: 0.5,     normMin: 0,    normMax: 0.5 },
      { tier: 'acceptable',  min: 0.5,  max: 0.8,     normMin: 0.5,  normMax: 0.8 },
      { tier: 'strong',      min: 0.8,  max: 1.0,     normMin: 0.8,  normMax: 1.0 },
      { tier: 'exceptional', min: 1.0,  max: POS_INF, normMin: 1.0,  normMax: 2.0 },
    ],
  },
  // Insider net buying as a percent of market cap over the last 6 months
  // (negative = net selling). 0.01% of a large cap = millions of $ -- the
  // bands here are deliberately tight because insider trades are large-$
  // signals at any company size.
  F3_insiderSignal: {
    direction: 'higher_better',
    tiers: [
      { tier: 'danger',      min: NEG_INF, max: -0.05, normMin: -0.5, normMax: -0.05 },
      { tier: 'weak',        min: -0.05, max: 0,      normMin: -0.05, normMax: 0 },
      { tier: 'acceptable',  min: 0,    max: 0.01,    normMin: 0,    normMax: 0.01 },
      { tier: 'strong',      min: 0.01, max: 0.05,    normMin: 0.01, normMax: 0.05 },
      { tier: 'exceptional', min: 0.05, max: POS_INF, normMin: 0.05, normMax: 0.5 },
    ],
  },
};

function findTier(definition, value) {
  for (const t of definition.tiers) {
    if (value >= t.min && value < t.max) return t;
  }
  // Handle exact-edge cases: if value === highest max, return the top tier.
  return definition.tiers[definition.tiers.length - 1];
}

function computeTierAndPosition(key, value) {
  const def = INDICATORS[key];
  if (!def || value == null || !Number.isFinite(value)) {
    return { tier: null, position: null };
  }
  const t = findTier(def, value);
  if (!t) return { tier: null, position: null };
  const span = t.normMax - t.normMin;
  let raw = span === 0 ? 0.5 : (value - t.normMin) / span;
  raw = clamp(raw, 0, 1);
  const position = def.direction === 'lower_better' ? 1 - raw : raw;
  return { tier: t.tier, position };
}

function getDirection(key) {
  return INDICATORS[key]?.direction || 'higher_better';
}

module.exports = {
  INDICATORS,
  computeTierAndPosition,
  getDirection,
};
