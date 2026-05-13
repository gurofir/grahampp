import { useMemo } from 'react'
import type { WatchedItem, WatchStatus } from '../../../shared/lib/types'
import {
  WATCH_STATUS_ORDER,
  classifyWatchStatus,
} from '../../../shared/lib/watchStatus'
import type { SituationRow } from '../../discovery/hooks/useDiscovery'

// One row on the Watching dashboard: the persisted snapshot (added price,
// kill-switches at add-time) PLUS the latest live row from the discovery
// scan (when it's still being scanned).
export interface WatchingRow {
  watched: WatchedItem
  liveRow: SituationRow | null
  status: WatchStatus
}

export interface WatchingSection {
  status: WatchStatus
  rows: WatchingRow[]
}

export interface UseWatchingData {
  sections: WatchingSection[]    // ordered: under_pressure, awaiting, confirming
  totalCount: number
}

// Joins watchlist (localStorage) with the latest /discover scan and
// classifies every row into one of the three status buckets.
//
// We DON'T fetch /interpret per ticker -- the watchlist is meant to be
// glanceable and free, so we rely entirely on cached scan data plus the
// snapshot taken at add-time.
export function useWatchingData(
  watched: WatchedItem[],
  liveRows: SituationRow[],
  search: string,
): UseWatchingData {
  return useMemo(() => {
    const liveByTicker = new Map<string, SituationRow>()
    for (const r of liveRows) liveByTicker.set(r.ticker, r)

    const needle = search.trim().toLowerCase()

    const rows: WatchingRow[] = watched
      .map((w) => {
        const liveRow = liveByTicker.get(w.ticker) ?? null
        const status = classifyWatchStatus({ watched: w, liveRow })
        return { watched: w, liveRow, status }
      })
      .filter(({ watched: w, liveRow }) => {
        if (!needle) return true
        const company = liveRow?.company_name ?? w.snapshot.companyName ?? ''
        return (
          w.ticker.toLowerCase().includes(needle) ||
          company.toLowerCase().includes(needle) ||
          (w.snapshot.sector ?? '').toLowerCase().includes(needle)
        )
      })

    const sections: WatchingSection[] = WATCH_STATUS_ORDER.map((status) => ({
      status,
      rows: rows.filter((r) => r.status === status),
    }))

    return { sections, totalCount: rows.length }
  }, [watched, liveRows, search])
}
