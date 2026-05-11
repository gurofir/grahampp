import { useState, useEffect, useCallback, useRef } from 'react'
import type { Analysis, IndicatorEntry } from '../../../shared/lib/types'
import { isSeries } from '../../../shared/lib/types'

const STORAGE_KEY = 'graham_theses_v2'

export interface ThesisHistoryEntry {
  date: string
  price: number
  note: string
}

export interface Thesis {
  ticker: string
  companyName: string
  sector: string | null
  priceAtAnalysis: number
  currentPrice: number
  currency: string
  analyzedAt: string
  thesisText: string
  earningsDateAtAnalysis: string | null
  lastEarningsDate: string | null
  indicatorSnapshot: Record<string, string>
  latestIndicatorSnapshot: Record<string, string>
  analysis: Analysis | null
  history: ThesisHistoryEntry[]
}

interface RawThesis extends Partial<Thesis> {
  savedPrice?: number
  savedAt?: string
  earningsDate?: string | null
}

function snapshotTiers(indicators: Record<string, IndicatorEntry>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, ind] of Object.entries(indicators)) {
    if (!ind) continue
    const tier = isSeries(ind) ? ind.latestTier : ind.tier
    if (typeof tier === 'string' && tier) out[key] = tier
  }
  return out
}

function migrate(raw: RawThesis): Thesis | null {
  if (!raw || typeof raw !== 'object' || !raw.ticker) return null
  const priceAtAnalysis =
    typeof raw.priceAtAnalysis === 'number'
      ? raw.priceAtAnalysis
      : typeof raw.savedPrice === 'number'
        ? raw.savedPrice
        : typeof raw.currentPrice === 'number'
          ? raw.currentPrice
          : 0
  return {
    ticker: raw.ticker,
    companyName: raw.companyName ?? raw.ticker,
    sector: raw.sector ?? null,
    priceAtAnalysis,
    currentPrice: typeof raw.currentPrice === 'number' ? raw.currentPrice : priceAtAnalysis,
    currency: raw.currency ?? 'USD',
    analyzedAt: raw.analyzedAt ?? raw.savedAt ?? new Date().toISOString(),
    thesisText: typeof raw.thesisText === 'string' ? raw.thesisText : '',
    earningsDateAtAnalysis:
      raw.earningsDateAtAnalysis ?? raw.earningsDate ?? null,
    lastEarningsDate: raw.lastEarningsDate ?? raw.earningsDate ?? null,
    indicatorSnapshot:
      raw.indicatorSnapshot && typeof raw.indicatorSnapshot === 'object'
        ? raw.indicatorSnapshot
        : {},
    latestIndicatorSnapshot:
      raw.latestIndicatorSnapshot && typeof raw.latestIndicatorSnapshot === 'object'
        ? raw.latestIndicatorSnapshot
        : raw.indicatorSnapshot && typeof raw.indicatorSnapshot === 'object'
          ? raw.indicatorSnapshot
          : {},
    analysis: raw.analysis && typeof raw.analysis === 'object' ? (raw.analysis as Analysis) : null,
    history: Array.isArray(raw.history) ? raw.history : [],
  }
}

function readFromStorage(): Thesis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((r: RawThesis) => migrate(r))
      .filter((t): t is Thesis => !!t)
  } catch {
    return []
  }
}

export function useTheses() {
  const [theses, setTheses] = useState<Thesis[]>(() => readFromStorage())
  const refreshedRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theses))
    } catch {
      /* ignore quota errors */
    }
  }, [theses])

  const saveThesis = useCallback((analysis: Analysis) => {
    setTheses((prev) => {
      const existingIdx = prev.findIndex((t) => t.ticker === analysis.ticker)
      const historyEntry: ThesisHistoryEntry = {
        date: new Date().toISOString(),
        price: analysis.currentPrice,
        note: 'analysis',
      }
      const tiers = snapshotTiers(analysis.indicators)
      if (existingIdx >= 0) {
        const existing = prev[existingIdx]
        const updated = [...prev]
        updated[existingIdx] = {
          ...existing,
          companyName: analysis.companyName,
          sector: analysis.sector ?? existing.sector,
          priceAtAnalysis: analysis.currentPrice,
          currentPrice: analysis.currentPrice,
          currency: analysis.currency,
          analyzedAt: new Date().toISOString(),
          earningsDateAtAnalysis: analysis.earningsDate ?? null,
          lastEarningsDate: analysis.earningsDate ?? null,
          indicatorSnapshot: tiers,
          latestIndicatorSnapshot: tiers,
          analysis,
          history: [...existing.history, historyEntry],
        }
        return updated
      }
      const entry: Thesis = {
        ticker: analysis.ticker,
        companyName: analysis.companyName,
        sector: analysis.sector ?? null,
        priceAtAnalysis: analysis.currentPrice,
        currentPrice: analysis.currentPrice,
        currency: analysis.currency,
        analyzedAt: new Date().toISOString(),
        thesisText: '',
        earningsDateAtAnalysis: analysis.earningsDate ?? null,
        lastEarningsDate: analysis.earningsDate ?? null,
        indicatorSnapshot: tiers,
        latestIndicatorSnapshot: tiers,
        analysis,
        history: [historyEntry],
      }
      return [entry, ...prev]
    })
  }, [])

  const updateLatestSnapshot = useCallback((analysis: Analysis) => {
    setTheses((prev) => {
      const idx = prev.findIndex((t) => t.ticker === analysis.ticker)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        latestIndicatorSnapshot: snapshotTiers(analysis.indicators),
        currentPrice: analysis.currentPrice,
        lastEarningsDate: analysis.earningsDate ?? next[idx].lastEarningsDate,
      }
      return next
    })
  }, [])

  const refreshPrices = useCallback(async () => {
    const current = readFromStorage()
    if (current.length === 0) {
      setTheses([])
      return
    }
    const updated = await Promise.all(
      current.map(async (t) => {
        try {
          const res = await fetch(
            `/.netlify/functions/price?ticker=${encodeURIComponent(t.ticker)}`,
          )
          if (!res.ok) return t
          const data = await res.json()
          return {
            ...t,
            currentPrice:
              typeof data.price === 'number' ? data.price : t.currentPrice,
            lastEarningsDate:
              typeof data.earningsDate === 'string'
                ? data.earningsDate
                : t.lastEarningsDate,
          }
        } catch {
          return t
        }
      }),
    )
    setTheses(updated)
  }, [])

  const removeThesis = useCallback((ticker: string) => {
    setTheses((prev) => prev.filter((t) => t.ticker !== ticker))
  }, [])

  const updateThesisText = useCallback((ticker: string, text: string) => {
    setTheses((prev) =>
      prev.map((t) => (t.ticker === ticker ? { ...t, thesisText: text } : t)),
    )
  }, [])

  // Auto-refresh on first mount.
  useEffect(() => {
    if (refreshedRef.current) return
    refreshedRef.current = true
    void refreshPrices()
  }, [refreshPrices])

  return {
    theses,
    saveThesis,
    refreshPrices,
    removeThesis,
    updateThesisText,
    updateLatestSnapshot,
  }
}
