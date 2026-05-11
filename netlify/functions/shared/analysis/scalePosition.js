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

// Sector-relative tier overlays. Only defined for the four indicators where
// the global table produces meaningfully wrong classifications:
//   * D1_pe / D2_forwardPE -- Tech "median" of 25x reads as "speculative";
//     Energy "median" of 11x reads as "deep_value". Both are wrong.
//   * B4_roic -- banks routinely run 8-10% ROIC because of their huge
//     invested-capital base; the global "weak" cutoff is wrong for them.
//   * C1_debtEquity -- utilities, REITs, and financials carry 1.5-2.5x
//     by structural design, not as a stress signal.
//
// All other indicators (margins, growth, FCF conversion) are universally
// meaningful at their absolute levels and intentionally use the global
// table -- a sector overlay there would just hide real differences.
//
// Each overlay is a full tiers array with the same shape as the global
// definition. We deliberately keep the same five tier names per indicator
// (e.g. PE always: deep_value -> attractive -> acceptable -> expensive ->
// speculative) so downstream code that maps tier name -> color / label
// keeps working without changes.
const SECTOR_OVERLAYS = {
  D1_pe: {
    Technology: [
      { tier: 'speculative', min: 45, max: POS_INF, normMin: 45, normMax: 80 },
      { tier: 'expensive',   min: 30, max: 45,     normMin: 30, normMax: 45 },
      { tier: 'acceptable',  min: 18, max: 30,     normMin: 18, normMax: 30 },
      { tier: 'attractive',  min: 12, max: 18,     normMin: 12, normMax: 18 },
      { tier: 'deep_value',  min: NEG_INF, max: 12, normMin: 0, normMax: 12 },
    ],
    'Communication Services': [
      { tier: 'speculative', min: 35, max: POS_INF, normMin: 35, normMax: 60 },
      { tier: 'expensive',   min: 22, max: 35,     normMin: 22, normMax: 35 },
      { tier: 'acceptable',  min: 14, max: 22,     normMin: 14, normMax: 22 },
      { tier: 'attractive',  min: 9,  max: 14,     normMin: 9,  normMax: 14 },
      { tier: 'deep_value',  min: NEG_INF, max: 9, normMin: 0,  normMax: 9 },
    ],
    Healthcare: [
      { tier: 'speculative', min: 40, max: POS_INF, normMin: 40, normMax: 70 },
      { tier: 'expensive',   min: 26, max: 40,     normMin: 26, normMax: 40 },
      { tier: 'acceptable',  min: 16, max: 26,     normMin: 16, normMax: 26 },
      { tier: 'attractive',  min: 11, max: 16,     normMin: 11, normMax: 16 },
      { tier: 'deep_value',  min: NEG_INF, max: 11, normMin: 0, normMax: 11 },
    ],
    'Consumer Defensive': [
      { tier: 'speculative', min: 35, max: POS_INF, normMin: 35, normMax: 60 },
      { tier: 'expensive',   min: 24, max: 35,     normMin: 24, normMax: 35 },
      { tier: 'acceptable',  min: 16, max: 24,     normMin: 16, normMax: 24 },
      { tier: 'attractive',  min: 11, max: 16,     normMin: 11, normMax: 16 },
      { tier: 'deep_value',  min: NEG_INF, max: 11, normMin: 0, normMax: 11 },
    ],
    'Consumer Cyclical': [
      { tier: 'speculative', min: 30, max: POS_INF, normMin: 30, normMax: 60 },
      { tier: 'expensive',   min: 20, max: 30,     normMin: 20, normMax: 30 },
      { tier: 'acceptable',  min: 13, max: 20,     normMin: 13, normMax: 20 },
      { tier: 'attractive',  min: 8,  max: 13,     normMin: 8,  normMax: 13 },
      { tier: 'deep_value',  min: NEG_INF, max: 8, normMin: 0,  normMax: 8 },
    ],
    Industrials: [
      { tier: 'speculative', min: 32, max: POS_INF, normMin: 32, normMax: 60 },
      { tier: 'expensive',   min: 22, max: 32,     normMin: 22, normMax: 32 },
      { tier: 'acceptable',  min: 14, max: 22,     normMin: 14, normMax: 22 },
      { tier: 'attractive',  min: 9,  max: 14,     normMin: 9,  normMax: 14 },
      { tier: 'deep_value',  min: NEG_INF, max: 9, normMin: 0,  normMax: 9 },
    ],
    'Financial Services': [
      { tier: 'speculative', min: 22, max: POS_INF, normMin: 22, normMax: 40 },
      { tier: 'expensive',   min: 15, max: 22,     normMin: 15, normMax: 22 },
      { tier: 'acceptable',  min: 9,  max: 15,     normMin: 9,  normMax: 15 },
      { tier: 'attractive',  min: 6,  max: 9,      normMin: 6,  normMax: 9 },
      { tier: 'deep_value',  min: NEG_INF, max: 6, normMin: 0,  normMax: 6 },
    ],
    Utilities: [
      { tier: 'speculative', min: 28, max: POS_INF, normMin: 28, normMax: 50 },
      { tier: 'expensive',   min: 20, max: 28,     normMin: 20, normMax: 28 },
      { tier: 'acceptable',  min: 13, max: 20,     normMin: 13, normMax: 20 },
      { tier: 'attractive',  min: 9,  max: 13,     normMin: 9,  normMax: 13 },
      { tier: 'deep_value',  min: NEG_INF, max: 9, normMin: 0,  normMax: 9 },
    ],
    'Real Estate': [
      { tier: 'speculative', min: 45, max: POS_INF, normMin: 45, normMax: 80 },
      { tier: 'expensive',   min: 30, max: 45,     normMin: 30, normMax: 45 },
      { tier: 'acceptable',  min: 18, max: 30,     normMin: 18, normMax: 30 },
      { tier: 'attractive',  min: 12, max: 18,     normMin: 12, normMax: 18 },
      { tier: 'deep_value',  min: NEG_INF, max: 12, normMin: 0, normMax: 12 },
    ],
    Energy: [
      { tier: 'speculative', min: 22, max: POS_INF, normMin: 22, normMax: 40 },
      { tier: 'expensive',   min: 15, max: 22,     normMin: 15, normMax: 22 },
      { tier: 'acceptable',  min: 9,  max: 15,     normMin: 9,  normMax: 15 },
      { tier: 'attractive',  min: 5,  max: 9,      normMin: 5,  normMax: 9 },
      { tier: 'deep_value',  min: NEG_INF, max: 5, normMin: 0,  normMax: 5 },
    ],
    'Basic Materials': [
      { tier: 'speculative', min: 25, max: POS_INF, normMin: 25, normMax: 45 },
      { tier: 'expensive',   min: 17, max: 25,     normMin: 17, normMax: 25 },
      { tier: 'acceptable',  min: 10, max: 17,     normMin: 10, normMax: 17 },
      { tier: 'attractive',  min: 6,  max: 10,     normMin: 6,  normMax: 10 },
      { tier: 'deep_value',  min: NEG_INF, max: 6, normMin: 0,  normMax: 6 },
    ],
  },

  // Forward P/E uses the same shape as trailing P/E with a slight haircut
  // (forward expectations price in growth, so cutoffs tighten ~15-20%).
  D2_forwardPE: {
    Technology: [
      { tier: 'speculative', min: 38, max: POS_INF, normMin: 38, normMax: 65 },
      { tier: 'expensive',   min: 26, max: 38,     normMin: 26, normMax: 38 },
      { tier: 'acceptable',  min: 16, max: 26,     normMin: 16, normMax: 26 },
      { tier: 'attractive',  min: 11, max: 16,     normMin: 11, normMax: 16 },
      { tier: 'deep_value',  min: NEG_INF, max: 11, normMin: 0, normMax: 11 },
    ],
    'Communication Services': [
      { tier: 'speculative', min: 30, max: POS_INF, normMin: 30, normMax: 50 },
      { tier: 'expensive',   min: 19, max: 30,     normMin: 19, normMax: 30 },
      { tier: 'acceptable',  min: 12, max: 19,     normMin: 12, normMax: 19 },
      { tier: 'attractive',  min: 8,  max: 12,     normMin: 8,  normMax: 12 },
      { tier: 'deep_value',  min: NEG_INF, max: 8, normMin: 0,  normMax: 8 },
    ],
    Healthcare: [
      { tier: 'speculative', min: 33, max: POS_INF, normMin: 33, normMax: 55 },
      { tier: 'expensive',   min: 22, max: 33,     normMin: 22, normMax: 33 },
      { tier: 'acceptable',  min: 14, max: 22,     normMin: 14, normMax: 22 },
      { tier: 'attractive',  min: 10, max: 14,     normMin: 10, normMax: 14 },
      { tier: 'deep_value',  min: NEG_INF, max: 10, normMin: 0, normMax: 10 },
    ],
    'Consumer Defensive': [
      { tier: 'speculative', min: 30, max: POS_INF, normMin: 30, normMax: 50 },
      { tier: 'expensive',   min: 21, max: 30,     normMin: 21, normMax: 30 },
      { tier: 'acceptable',  min: 14, max: 21,     normMin: 14, normMax: 21 },
      { tier: 'attractive',  min: 10, max: 14,     normMin: 10, normMax: 14 },
      { tier: 'deep_value',  min: NEG_INF, max: 10, normMin: 0, normMax: 10 },
    ],
    'Consumer Cyclical': [
      { tier: 'speculative', min: 26, max: POS_INF, normMin: 26, normMax: 50 },
      { tier: 'expensive',   min: 17, max: 26,     normMin: 17, normMax: 26 },
      { tier: 'acceptable',  min: 11, max: 17,     normMin: 11, normMax: 17 },
      { tier: 'attractive',  min: 7,  max: 11,     normMin: 7,  normMax: 11 },
      { tier: 'deep_value',  min: NEG_INF, max: 7, normMin: 0,  normMax: 7 },
    ],
    Industrials: [
      { tier: 'speculative', min: 28, max: POS_INF, normMin: 28, normMax: 50 },
      { tier: 'expensive',   min: 19, max: 28,     normMin: 19, normMax: 28 },
      { tier: 'acceptable',  min: 12, max: 19,     normMin: 12, normMax: 19 },
      { tier: 'attractive',  min: 8,  max: 12,     normMin: 8,  normMax: 12 },
      { tier: 'deep_value',  min: NEG_INF, max: 8, normMin: 0,  normMax: 8 },
    ],
    'Financial Services': [
      { tier: 'speculative', min: 19, max: POS_INF, normMin: 19, normMax: 35 },
      { tier: 'expensive',   min: 13, max: 19,     normMin: 13, normMax: 19 },
      { tier: 'acceptable',  min: 8,  max: 13,     normMin: 8,  normMax: 13 },
      { tier: 'attractive',  min: 5,  max: 8,      normMin: 5,  normMax: 8 },
      { tier: 'deep_value',  min: NEG_INF, max: 5, normMin: 0,  normMax: 5 },
    ],
    Utilities: [
      { tier: 'speculative', min: 24, max: POS_INF, normMin: 24, normMax: 45 },
      { tier: 'expensive',   min: 17, max: 24,     normMin: 17, normMax: 24 },
      { tier: 'acceptable',  min: 11, max: 17,     normMin: 11, normMax: 17 },
      { tier: 'attractive',  min: 8,  max: 11,     normMin: 8,  normMax: 11 },
      { tier: 'deep_value',  min: NEG_INF, max: 8, normMin: 0,  normMax: 8 },
    ],
    'Real Estate': [
      { tier: 'speculative', min: 38, max: POS_INF, normMin: 38, normMax: 70 },
      { tier: 'expensive',   min: 26, max: 38,     normMin: 26, normMax: 38 },
      { tier: 'acceptable',  min: 16, max: 26,     normMin: 16, normMax: 26 },
      { tier: 'attractive',  min: 11, max: 16,     normMin: 11, normMax: 16 },
      { tier: 'deep_value',  min: NEG_INF, max: 11, normMin: 0, normMax: 11 },
    ],
    Energy: [
      { tier: 'speculative', min: 19, max: POS_INF, normMin: 19, normMax: 35 },
      { tier: 'expensive',   min: 13, max: 19,     normMin: 13, normMax: 19 },
      { tier: 'acceptable',  min: 8,  max: 13,     normMin: 8,  normMax: 13 },
      { tier: 'attractive',  min: 4,  max: 8,      normMin: 4,  normMax: 8 },
      { tier: 'deep_value',  min: NEG_INF, max: 4, normMin: 0,  normMax: 4 },
    ],
    'Basic Materials': [
      { tier: 'speculative', min: 22, max: POS_INF, normMin: 22, normMax: 40 },
      { tier: 'expensive',   min: 15, max: 22,     normMin: 15, normMax: 22 },
      { tier: 'acceptable',  min: 9,  max: 15,     normMin: 9,  normMax: 15 },
      { tier: 'attractive',  min: 5,  max: 9,      normMin: 5,  normMax: 9 },
      { tier: 'deep_value',  min: NEG_INF, max: 5, normMin: 0,  normMax: 5 },
    ],
  },

  // ROIC: banks/REITs/utilities operate on a much larger invested-capital
  // base, so their "good" ROIC is structurally lower. Tech/Healthcare with
  // intangible-heavy moats can sustain 25%+ ROIC at scale.
  B4_roic: {
    Technology: [
      { tier: 'danger',      min: NEG_INF, max: 8,  normMin: -10, normMax: 8 },
      { tier: 'weak',        min: 8,  max: 14,     normMin: 8,   normMax: 14 },
      { tier: 'acceptable',  min: 14, max: 22,     normMin: 14,  normMax: 22 },
      { tier: 'strong',      min: 22, max: 35,     normMin: 22,  normMax: 35 },
      { tier: 'exceptional', min: 35, max: POS_INF, normMin: 35, normMax: 70 },
    ],
    'Communication Services': [
      { tier: 'danger',      min: NEG_INF, max: 6,  normMin: -10, normMax: 6 },
      { tier: 'weak',        min: 6,  max: 12,     normMin: 6,   normMax: 12 },
      { tier: 'acceptable',  min: 12, max: 18,     normMin: 12,  normMax: 18 },
      { tier: 'strong',      min: 18, max: 28,     normMin: 18,  normMax: 28 },
      { tier: 'exceptional', min: 28, max: POS_INF, normMin: 28, normMax: 60 },
    ],
    Healthcare: [
      { tier: 'danger',      min: NEG_INF, max: 6,  normMin: -10, normMax: 6 },
      { tier: 'weak',        min: 6,  max: 12,     normMin: 6,   normMax: 12 },
      { tier: 'acceptable',  min: 12, max: 20,     normMin: 12,  normMax: 20 },
      { tier: 'strong',      min: 20, max: 30,     normMin: 20,  normMax: 30 },
      { tier: 'exceptional', min: 30, max: POS_INF, normMin: 30, normMax: 60 },
    ],
    'Consumer Defensive': [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -10, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,     normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 16,     normMin: 10,  normMax: 16 },
      { tier: 'strong',      min: 16, max: 25,     normMin: 16,  normMax: 25 },
      { tier: 'exceptional', min: 25, max: POS_INF, normMin: 25, normMax: 50 },
    ],
    'Consumer Cyclical': [
      { tier: 'danger',      min: NEG_INF, max: 4,  normMin: -10, normMax: 4 },
      { tier: 'weak',        min: 4,  max: 9,      normMin: 4,   normMax: 9 },
      { tier: 'acceptable',  min: 9,  max: 15,     normMin: 9,   normMax: 15 },
      { tier: 'strong',      min: 15, max: 22,     normMin: 15,  normMax: 22 },
      { tier: 'exceptional', min: 22, max: POS_INF, normMin: 22, normMax: 45 },
    ],
    Industrials: [
      { tier: 'danger',      min: NEG_INF, max: 5,  normMin: -10, normMax: 5 },
      { tier: 'weak',        min: 5,  max: 10,     normMin: 5,   normMax: 10 },
      { tier: 'acceptable',  min: 10, max: 16,     normMin: 10,  normMax: 16 },
      { tier: 'strong',      min: 16, max: 24,     normMin: 16,  normMax: 24 },
      { tier: 'exceptional', min: 24, max: POS_INF, normMin: 24, normMax: 45 },
    ],
    // Banks / insurers: ROIC is structurally low because invested capital
    // = entire balance sheet. ROE is the more meaningful gauge for them
    // (covered by B5_roe), but even on ROIC, 6-10% is normal not weak.
    'Financial Services': [
      { tier: 'danger',      min: NEG_INF, max: 3,  normMin: -10, normMax: 3 },
      { tier: 'weak',        min: 3,  max: 6,      normMin: 3,   normMax: 6 },
      { tier: 'acceptable',  min: 6,  max: 10,     normMin: 6,   normMax: 10 },
      { tier: 'strong',      min: 10, max: 15,     normMin: 10,  normMax: 15 },
      { tier: 'exceptional', min: 15, max: POS_INF, normMin: 15, normMax: 30 },
    ],
    Utilities: [
      { tier: 'danger',      min: NEG_INF, max: 3,  normMin: -10, normMax: 3 },
      { tier: 'weak',        min: 3,  max: 6,      normMin: 3,   normMax: 6 },
      { tier: 'acceptable',  min: 6,  max: 9,      normMin: 6,   normMax: 9 },
      { tier: 'strong',      min: 9,  max: 13,     normMin: 9,   normMax: 13 },
      { tier: 'exceptional', min: 13, max: POS_INF, normMin: 13, normMax: 25 },
    ],
    'Real Estate': [
      { tier: 'danger',      min: NEG_INF, max: 2,  normMin: -10, normMax: 2 },
      { tier: 'weak',        min: 2,  max: 5,      normMin: 2,   normMax: 5 },
      { tier: 'acceptable',  min: 5,  max: 9,      normMin: 5,   normMax: 9 },
      { tier: 'strong',      min: 9,  max: 14,     normMin: 9,   normMax: 14 },
      { tier: 'exceptional', min: 14, max: POS_INF, normMin: 14, normMax: 25 },
    ],
    Energy: [
      { tier: 'danger',      min: NEG_INF, max: 4,  normMin: -10, normMax: 4 },
      { tier: 'weak',        min: 4,  max: 8,      normMin: 4,   normMax: 8 },
      { tier: 'acceptable',  min: 8,  max: 14,     normMin: 8,   normMax: 14 },
      { tier: 'strong',      min: 14, max: 22,     normMin: 14,  normMax: 22 },
      { tier: 'exceptional', min: 22, max: POS_INF, normMin: 22, normMax: 45 },
    ],
    'Basic Materials': [
      { tier: 'danger',      min: NEG_INF, max: 4,  normMin: -10, normMax: 4 },
      { tier: 'weak',        min: 4,  max: 8,      normMin: 4,   normMax: 8 },
      { tier: 'acceptable',  min: 8,  max: 13,     normMin: 8,   normMax: 13 },
      { tier: 'strong',      min: 13, max: 20,     normMin: 13,  normMax: 20 },
      { tier: 'exceptional', min: 20, max: POS_INF, normMin: 20, normMax: 40 },
    ],
  },

  // Debt/Equity: utilities and REITs run at 1.5-2.5x by design; financials
  // even higher (their entire business IS leverage). The global "low debt
  // = good" reading is wrong for them.
  C1_debtEquity: {
    Utilities: [
      { tier: 'speculative', min: 3.0, max: POS_INF, normMin: 3.0, normMax: 6.0 },
      { tier: 'expensive',   min: 2.2, max: 3.0,    normMin: 2.2, normMax: 3.0 },
      { tier: 'acceptable',  min: 1.4, max: 2.2,    normMin: 1.4, normMax: 2.2 },
      { tier: 'attractive',  min: 0.8, max: 1.4,    normMin: 0.8, normMax: 1.4 },
      { tier: 'deep_value',  min: NEG_INF, max: 0.8, normMin: 0,  normMax: 0.8 },
    ],
    'Real Estate': [
      { tier: 'speculative', min: 3.0, max: POS_INF, normMin: 3.0, normMax: 6.0 },
      { tier: 'expensive',   min: 2.2, max: 3.0,    normMin: 2.2, normMax: 3.0 },
      { tier: 'acceptable',  min: 1.4, max: 2.2,    normMin: 1.4, normMax: 2.2 },
      { tier: 'attractive',  min: 0.8, max: 1.4,    normMin: 0.8, normMax: 1.4 },
      { tier: 'deep_value',  min: NEG_INF, max: 0.8, normMin: 0,  normMax: 0.8 },
    ],
    'Financial Services': [
      // Banks: D/E is meaningless (the whole balance sheet is leverage).
      // We keep tier names so the UI doesn't break, but flatten everything
      // to "acceptable" so the indicator does not pollute the dryScreen
      // or the AI prompt with a false "high leverage" warning.
      { tier: 'speculative', min: 50, max: POS_INF, normMin: 50, normMax: 100 },
      { tier: 'expensive',   min: 30, max: 50,     normMin: 30, normMax: 50 },
      { tier: 'acceptable',  min: 0,  max: 30,     normMin: 0,  normMax: 30 },
      { tier: 'attractive',  min: -1, max: 0,      normMin: -1, normMax: 0 },
      { tier: 'deep_value',  min: NEG_INF, max: -1, normMin: -1, normMax: 0 },
    ],
    // Capital-intensive cyclicals carry more debt than the global table
    // assumes, but not as much as utilities/REITs.
    Energy: [
      { tier: 'speculative', min: 1.8, max: POS_INF, normMin: 1.8, normMax: 4.0 },
      { tier: 'expensive',   min: 1.2, max: 1.8,    normMin: 1.2, normMax: 1.8 },
      { tier: 'acceptable',  min: 0.6, max: 1.2,    normMin: 0.6, normMax: 1.2 },
      { tier: 'attractive',  min: 0.3, max: 0.6,    normMin: 0.3, normMax: 0.6 },
      { tier: 'deep_value',  min: NEG_INF, max: 0.3, normMin: 0,  normMax: 0.3 },
    ],
    'Basic Materials': [
      { tier: 'speculative', min: 1.8, max: POS_INF, normMin: 1.8, normMax: 4.0 },
      { tier: 'expensive',   min: 1.2, max: 1.8,    normMin: 1.2, normMax: 1.8 },
      { tier: 'acceptable',  min: 0.6, max: 1.2,    normMin: 0.6, normMax: 1.2 },
      { tier: 'attractive',  min: 0.3, max: 0.6,    normMin: 0.3, normMax: 0.6 },
      { tier: 'deep_value',  min: NEG_INF, max: 0.3, normMin: 0,  normMax: 0.3 },
    ],
    Industrials: [
      { tier: 'speculative', min: 1.8, max: POS_INF, normMin: 1.8, normMax: 4.0 },
      { tier: 'expensive',   min: 1.2, max: 1.8,    normMin: 1.2, normMax: 1.8 },
      { tier: 'acceptable',  min: 0.6, max: 1.2,    normMin: 0.6, normMax: 1.2 },
      { tier: 'attractive',  min: 0.3, max: 0.6,    normMin: 0.3, normMax: 0.6 },
      { tier: 'deep_value',  min: NEG_INF, max: 0.3, normMin: 0,  normMax: 0.3 },
    ],
  },
};

// Look up the sector-overlay tier definition, falling back to the global
// table if there is no overlay for the (key, sector) combination.
function definitionFor(key, sector) {
  const baseDef = INDICATORS[key];
  if (!baseDef) return null;
  if (!sector) return baseDef;
  const overlay = SECTOR_OVERLAYS[key]?.[sector];
  if (!overlay) return baseDef;
  return { direction: baseDef.direction, tiers: overlay };
}

function computeTierAndPosition(key, value, sector) {
  const def = definitionFor(key, sector);
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
