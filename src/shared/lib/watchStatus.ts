// Watching dashboard status classifier (Constitution §14).
//
// Each watched ticker lands in one of three buckets, in this order of
// priority:
//   1. thesis_under_pressure  (urgent — show first)
//   2. awaiting_confirmation  (default — most cards live here)
//   3. thesis_confirming      (good news — show last)
//
// We always defer to LIVE data from the latest scan when available; the
// `WatchedSnapshot` is the fall-back for tickers that have rolled out of
// the discovery feed since the user added them.

import type { WatchStatus, WatchedItem } from './types'
import type { SituationRow } from '../../features/discovery/hooks/useDiscovery'

// What we need to evaluate a watch's status. Either a live row from the
// latest /discover scan, or null when the ticker has dropped out of the
// scan since add-time.
export interface WatchStatusInputs {
  watched: WatchedItem
  liveRow: SituationRow | null
}

// Public: classify a single watched item.
export function classifyWatchStatus(inputs: WatchStatusInputs): WatchStatus {
  const { watched, liveRow } = inputs

  // No live data: stale snapshot only. We default to the cautious bucket.
  if (!liveRow) {
    return 'awaiting_confirmation'
  }

  const live = liveRow.full_analysis
  const grahamLive = live?.dualEngine?.graham
  const findings = grahamLive?.findings ?? []
  const fragility = grahamLive?.fragilityBand
  const liveDecision = grahamLive?.decision ?? watched.snapshot.decision

  const priceDelta = computePriceDelta(watched.addedPrice, liveRow.current_price)

  // ---- Pressure signals (any one trips us into the urgent bucket) ----

  // 1. The original Graham decision flipped to AVOID since we added.
  if (liveDecision === 'AVOID' && watched.snapshot.decision !== 'AVOID') {
    return 'thesis_under_pressure'
  }

  // 2. Fragility worsened to fragile/unstable from a calmer band.
  const wasCalm =
    watched.snapshot.fragilityBand === 'robust' ||
    watched.snapshot.fragilityBand === 'moderate' ||
    watched.snapshot.fragilityBand === null
  if ((fragility === 'fragile' || fragility === 'unstable') && wasCalm) {
    return 'thesis_under_pressure'
  }

  // 3. Price has dropped >= 12% since add (threshold mirrors the
  // "alerts.price" rule in useTheses, slightly tighter at 12% vs 15%
  // because watchlist users want earlier signal).
  if (priceDelta !== null && priceDelta <= -0.12) {
    return 'thesis_under_pressure'
  }

  // 4. A severe finding has appeared since add. Severe = the Reality Check
  // layer flagged a hard headwind that wasn't there before.
  const severeAtAdd = (watched.snapshot.killSwitches?.length ?? 0) > 0
  const severeNow = findings.some((f) => f.severity === 'severe')
  if (severeNow && !severeAtAdd) {
    return 'thesis_under_pressure'
  }

  // ---- Confirming signals ----

  const tailwindNow = findings.some(
    (f) => f.severity === 'tailwind' || f.severity === 'strong_tailwind',
  )

  // Confirming = thesis is playing out.
  //   - At least one tailwind finding present, AND
  //   - either the price moved in our favour OR the decision is BUY at high confidence.
  if (tailwindNow) {
    if (priceDelta !== null && priceDelta >= 0.05) {
      return 'thesis_confirming'
    }
    if (
      grahamLive?.decision === 'BUY' &&
      grahamLive?.confidence === 'High'
    ) {
      return 'thesis_confirming'
    }
  }

  return 'awaiting_confirmation'
}

// Returns (currentPrice / addedPrice) - 1, or null if either side is bogus.
export function computePriceDelta(
  addedPrice: number,
  currentPrice: number | null | undefined,
): number | null {
  if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) {
    return null
  }
  if (!Number.isFinite(addedPrice) || addedPrice <= 0) return null
  return currentPrice / addedPrice - 1
}

// Stable section ordering used by WatchingPage.
export const WATCH_STATUS_ORDER: WatchStatus[] = [
  'thesis_under_pressure',
  'awaiting_confirmation',
  'thesis_confirming',
]

// Visual accents per status (matches the dot/border colors in the mockup).
export const WATCH_STATUS_ACCENT: Record<
  WatchStatus,
  { dot: string; border: string; bg: string }
> = {
  thesis_under_pressure: {
    dot: '#A32D2D',
    border: '#E8B8B8',
    bg: '#FBEDED',
  },
  awaiting_confirmation: {
    dot: '#7B7B79',
    border: '#E0DFDB',
    bg: '#F5F4EF',
  },
  thesis_confirming: {
    dot: '#1F8A4D',
    border: '#BCDFC8',
    bg: '#ECF6EF',
  },
}
