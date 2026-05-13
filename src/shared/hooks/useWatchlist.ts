// Thin React layer over watchlist.ts.
//
// Cross-tab sync is handled via the standard `storage` event so that opening
// the app in two tabs doesn't lead to one overwriting the other. We hold the
// list in component state and flush every mutation back to localStorage.

import { useCallback, useEffect, useState } from 'react'
import {
  WATCHLIST_STORAGE_KEY,
  addToWatchlist,
  buildWatchedItem,
  findWatched,
  isWatched,
  readWatchlist,
  removeFromWatchlist,
  writeWatchlist,
} from '../lib/watchlist'
import type { Analysis, Archetype, WatchedItem } from '../lib/types'
import type { SituationRow } from '../../features/discovery/hooks/useDiscovery'

export interface UseWatchlist {
  items: WatchedItem[]
  isWatched: (ticker: string) => boolean
  get: (ticker: string) => WatchedItem | undefined
  watchAnalysis: (analysis: Analysis, archetype: Archetype) => void
  watchSituation: (row: SituationRow) => void
  unwatch: (ticker: string) => void
  toggleAnalysis: (analysis: Analysis, archetype: Archetype) => void
  toggleSituation: (row: SituationRow) => void
}

export function useWatchlist(): UseWatchlist {
  const [items, setItems] = useState<WatchedItem[]>(() => readWatchlist())

  // Persist on every change.
  useEffect(() => {
    writeWatchlist(items)
  }, [items])

  // Cross-tab sync: when another tab updates the watchlist, mirror the
  // change here so the UI stays consistent.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== WATCHLIST_STORAGE_KEY) return
      setItems(readWatchlist())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const watchAnalysis = useCallback(
    (analysis: Analysis, archetype: Archetype) => {
      const item = buildWatchedItem({ kind: 'analysis', analysis, archetype })
      if (!item) return
      setItems((prev) => addToWatchlist(prev, item))
    },
    [],
  )

  const watchSituation = useCallback((row: SituationRow) => {
    const item = buildWatchedItem({ kind: 'situation', row })
    if (!item) return
    setItems((prev) => addToWatchlist(prev, item))
  }, [])

  const unwatch = useCallback((ticker: string) => {
    setItems((prev) => removeFromWatchlist(prev, ticker))
  }, [])

  const toggleAnalysis = useCallback(
    (analysis: Analysis, archetype: Archetype) => {
      setItems((prev) => {
        if (isWatched(prev, analysis.ticker)) {
          return removeFromWatchlist(prev, analysis.ticker)
        }
        const item = buildWatchedItem({ kind: 'analysis', analysis, archetype })
        return item ? addToWatchlist(prev, item) : prev
      })
    },
    [],
  )

  const toggleSituation = useCallback((row: SituationRow) => {
    setItems((prev) => {
      if (isWatched(prev, row.ticker)) {
        return removeFromWatchlist(prev, row.ticker)
      }
      const item = buildWatchedItem({ kind: 'situation', row })
      return item ? addToWatchlist(prev, item) : prev
    })
  }, [])

  const isWatchedFn = useCallback(
    (ticker: string) => isWatched(items, ticker),
    [items],
  )
  const getFn = useCallback(
    (ticker: string) => findWatched(items, ticker),
    [items],
  )

  return {
    items,
    isWatched: isWatchedFn,
    get: getFn,
    watchAnalysis,
    watchSituation,
    unwatch,
    toggleAnalysis,
    toggleSituation,
  }
}
