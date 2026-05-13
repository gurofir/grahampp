// Pure data layer for the new constitutional Watching feature.
//
// The watchlist persists to localStorage as a flat list of { ticker,
// addedAt, addedPrice, snapshot }. We never persist the full Analysis blob
// (it can be ~80kb per row); instead we store the smallest possible
// "thesis fingerprint" needed to:
//   - render a card when the situation is no longer in the latest scan
//   - compute "since-add" price delta without re-fetching the old analysis
//   - detect when killSwitches that existed at add-time start firing
//
// Live data (counter, fragilityBand, current price) always comes from the
// latest /discover payload when the ticker is still being scanned.

import type {
  Analysis,
  Archetype,
  Confidence,
  Decision,
  FragilityBand,
  WatchedItem,
  WatchedSnapshot,
} from './types'
import { classifyArchetype, situationTitleKey } from './archetype'
import type { SituationRow } from '../../features/discovery/hooks/useDiscovery'

export const WATCHLIST_STORAGE_KEY = 'graham_watchlist_v1'

// ---------- Snapshot building ----------

function buildSnapshotFromAnalysis(
  analysis: Analysis,
  archetype: Archetype,
): WatchedSnapshot {
  const graham = analysis.dualEngine?.graham
  const counter = graham?.counter ?? null
  return {
    archetype,
    fragilityBand: (graham?.fragilityBand as FragilityBand | undefined) ?? null,
    fragilityScore:
      typeof graham?.fragilityScore === 'number' ? graham.fragilityScore : null,
    killSwitches: counter?.killSwitches ?? [],
    decision: graham?.decision ?? 'WAIT',
    confidence: graham?.confidence ?? 'Medium',
    situationTitle: situationTitleKey(archetype),
    companyName: analysis.companyName ?? null,
    sector: analysis.sector ?? null,
    currency: analysis.currency ?? 'USD',
  }
}

// Build a WatchedItem from either:
//   - the full Analysis (when the user adds from the stock-detail page), or
//   - a SituationRow from the discovery feed (when adding inline from a card).
// Both code paths converge here.
export function buildWatchedItem(
  source:
    | { kind: 'analysis'; analysis: Analysis; archetype: Archetype }
    | { kind: 'situation'; row: SituationRow },
): WatchedItem | null {
  if (source.kind === 'analysis') {
    const a = source.analysis
    if (!a?.ticker) return null
    return {
      ticker: a.ticker,
      addedAt: new Date().toISOString(),
      addedPrice: typeof a.currentPrice === 'number' ? a.currentPrice : 0,
      snapshot: buildSnapshotFromAnalysis(a, source.archetype),
    }
  }

  const row = source.row
  if (!row?.ticker || !row.full_analysis) return null
  const archetype = classifyArchetype(row)
  return {
    ticker: row.ticker,
    addedAt: new Date().toISOString(),
    addedPrice:
      typeof row.current_price === 'number' ? row.current_price : 0,
    snapshot: buildSnapshotFromAnalysis(row.full_analysis, archetype),
  }
}

// ---------- Storage ----------

function isValidItem(raw: unknown): raw is WatchedItem {
  if (!raw || typeof raw !== 'object') return false
  const obj = raw as Partial<WatchedItem>
  if (typeof obj.ticker !== 'string' || !obj.ticker) return false
  if (typeof obj.addedAt !== 'string') return false
  if (typeof obj.addedPrice !== 'number') return false
  if (!obj.snapshot || typeof obj.snapshot !== 'object') return false
  return true
}

export function readWatchlist(): WatchedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidItem)
  } catch {
    return []
  }
}

export function writeWatchlist(items: WatchedItem[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* quota errors are non-fatal */
  }
}

// ---------- Pure helpers ----------

export function isWatched(items: WatchedItem[], ticker: string): boolean {
  return items.some((w) => w.ticker === ticker)
}

export function findWatched(
  items: WatchedItem[],
  ticker: string,
): WatchedItem | undefined {
  return items.find((w) => w.ticker === ticker)
}

// Pure add/remove -- callers (the hook) are responsible for persisting.
export function addToWatchlist(
  items: WatchedItem[],
  next: WatchedItem,
): WatchedItem[] {
  const filtered = items.filter((w) => w.ticker !== next.ticker)
  return [next, ...filtered]
}

export function removeFromWatchlist(
  items: WatchedItem[],
  ticker: string,
): WatchedItem[] {
  return items.filter((w) => w.ticker !== ticker)
}

// Re-exported for places that just need decision/confidence on a snapshot.
export type { Decision, Confidence }
