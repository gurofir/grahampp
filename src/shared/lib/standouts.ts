// Standout-indicator picker for the Discovery list.
//
// Walks the per-ticker indicator table, ranks each scalar indicator by how
// far its tier sits from "average", and returns the top N most extreme
// signals. The Discovery card uses these to render small chips that
// answer the question "why is this stock interesting in one glance?"
//
// Pure derivation -- no backend changes; everything keys off the same
// `indicators` payload that already lives on every cached Analysis.

import type {
  Analysis,
  Decision,
  IndicatorEntry,
  IndicatorTier,
} from './types'
import { isSeries } from './types'
import { formatIndicatorValue } from './format'

// Direction of the signal a tier conveys for the *holder* of the stock.
//   positive = "this is good" (strong margins, deep value, etc.)
//   negative = "this is bad" (danger leverage, premium valuation, etc.)
//   neutral  = ambivalent (acceptable / fair / moderate)
//   missing  = no data
export type StandoutDirection = 'positive' | 'negative' | 'neutral' | 'missing'

// Magnitude per tier (positive = bullish strength, negative = bearish risk).
// These deliberately mirror the canonical 5-tier collapse in format.ts but
// expand to keep deep_value/attractive distinguishable from generic strong.
const TIER_MAGNITUDE: Record<IndicatorTier, number> = {
  exceptional: +3,
  deep_value:  +3,
  attractive:  +3,
  strong:      +2,
  undervalued: +2,
  acceptable:  +1,
  fair:        +1,
  moderate:     0,
  minimal:      0,
  weak:        -2,
  premium:     -1,
  expensive:   -2,
  speculative: -3,
  danger:      -3,
  none:         0,
}

export interface StandoutIndicator {
  key: string                // e.g. 'D1_pe' -- caller resolves label via i18n
  tier: IndicatorTier
  value: number | null       // for series, the latest value
  formatted: string          // human-readable, ready to render
  magnitude: number          // -3..+3, sign carries direction
  direction: StandoutDirection
}

// Order indicators are considered for selection. We bias toward signals
// that experienced investors react to first (valuation, balance-sheet
// quality, profitability moats) and demote the noisier or more derivative
// ones (forward PE, PEG which rely on consensus inputs).
//
// The picker still considers every indicator in `analysis.indicators`;
// this list only breaks ties when magnitudes are equal.
const PRIORITY_ORDER: string[] = [
  'D7_marginOfSafety',
  'D1_pe',
  'D5_evEbitda',
  'D4_fcfYield',
  'B4_roic',
  'B5_roe',
  'C3_interestCoverage',
  'C4_netDebtEbitda',
  'D10_dividendStreak',
  'F3_insiderSignal',
  'B1_grossMargin',
  'B2_operatingMargin',
  'B3_netMargin',
  'A1_revenueGrowth',
  'A2_epsGrowth',
  'A3_fcfConversion',
  'C1_debtEquity',
  'C2_currentRatio',
  'D2_forwardPE',
  'D3_peg',
  'D6_priceSales',
  'D8_dividendYield',
  'D9_payoutRatio',
  'E1_grossMarginStability',
  'E2_roicMoat',
  'F1_roicTrend',
  'F2_fcfConversionTrend',
  'A4_ownerEarnings',
]

function priorityIndex(key: string): number {
  const idx = PRIORITY_ORDER.indexOf(key)
  return idx === -1 ? PRIORITY_ORDER.length : idx
}

function entryToCandidate(entry: IndicatorEntry): StandoutIndicator | null {
  const tier = isSeries(entry) ? entry.latestTier : entry.tier
  const value = isSeries(entry) ? entry.latestValue : entry.value
  if (!tier) return null
  const magnitude = TIER_MAGNITUDE[tier] ?? 0
  // Skip neutral signals -- they have nothing to say in a "what stands out"
  // chip. The rest of the analysis (accordion / detail page) still shows
  // them; this is purely for the at-a-glance chip row.
  if (magnitude === 0) return null
  const direction: StandoutDirection =
    magnitude > 0 ? 'positive' : 'negative'
  return {
    key: entry.key,
    tier,
    value: typeof value === 'number' ? value : null,
    formatted: entry.formatted ?? formatIndicatorValue(entry.key, value),
    magnitude,
    direction,
  }
}

// Public API: return the top `max` standout indicators for the given
// analysis, biased toward the engine's decision (positive standouts for
// BUY, negative for AVOID, mixed for WAIT).
export function topStandoutIndicators(
  analysis: Analysis | null | undefined,
  decision: Decision,
  max = 3,
): StandoutIndicator[] {
  if (!analysis?.indicators) return []
  const candidates: StandoutIndicator[] = []
  for (const entry of Object.values(analysis.indicators)) {
    const c = entryToCandidate(entry)
    if (c) candidates.push(c)
  }

  // Direction filter:
  //   BUY   -> we want to surface why it looks attractive  (positive bias)
  //   AVOID -> we want to surface why it looks risky       (negative bias)
  //   WAIT  -> show the most extreme of either; tells the user what's
  //            keeping the case unresolved
  let pool: StandoutIndicator[]
  if (decision === 'BUY') {
    pool = candidates.filter((c) => c.magnitude > 0)
    // If a BUY has zero positive standouts (rare but possible -- weak
    // tailwinds, edge-case fundamentals), fall back to anything we have.
    if (pool.length === 0) pool = candidates
  } else if (decision === 'AVOID') {
    pool = candidates.filter((c) => c.magnitude < 0)
    if (pool.length === 0) pool = candidates
  } else {
    pool = candidates
  }

  pool.sort((a, b) => {
    // Primary: absolute magnitude desc (most extreme first)
    const magDiff = Math.abs(b.magnitude) - Math.abs(a.magnitude)
    if (magDiff !== 0) return magDiff
    // Secondary: priority order (valuation/quality first)
    return priorityIndex(a.key) - priorityIndex(b.key)
  })

  return pool.slice(0, max)
}

// Calm chip palette per direction. Mirrors the rest of the app
// (green = positive, clay = negative, neutral = warm gray).
export const STANDOUT_PALETTE: Record<
  Exclude<StandoutDirection, 'missing'>,
  { bg: string; fg: string; ring: string }
> = {
  positive: { bg: '#E5EFE0', fg: '#3A6526', ring: '#3A6526' },
  negative: { bg: '#EFD8D8', fg: '#7E2727', ring: '#7E2727' },
  neutral:  { bg: '#F2EBD9', fg: '#6F5A1F', ring: '#6F5A1F' },
}
