import { useState, useEffect, useCallback } from 'react'
import type { Analysis, Decision, Confidence, SetupType } from '../lib/types'

// Discovery situation as returned by /.netlify/functions/discover. Field
// names mirror the Supabase columns (snake_case → exact JSON shape).
export interface SituationRow {
  id: string
  ticker: string
  company_name: string | null
  sector: string | null
  country?: string | null
  current_price: number | null
  daily_change_pct: number | null
  low52: number | null
  high52: number | null
  setup_type: SetupType
  graham_decision: Decision
  market_decision: Decision
  graham_confidence: Confidence
  market_confidence: Confidence
  graham_thesis: string
  market_thesis: string
  insight: string
  score: number
  situation_type: string
  scanned_at: string
  is_featured: boolean
  full_analysis: Analysis
}

export interface DiscoveryData {
  situations: SituationRow[]
  totalCount: number
  featuredCount: number
  universeSize: number
  scannedAt: string | null
  error?: string
}

interface UseDiscoveryReturn {
  data: DiscoveryData | null
  loading: boolean
  reload: () => void
}

const ENDPOINT = '/.netlify/functions/discover'

export function useDiscovery(): UseDiscoveryReturn {
  const [data, setData] = useState<DiscoveryData | null>(null)
  const [loading, setLoading] = useState(true)
  // bumped to force a refetch on demand (e.g. after a manual scan).
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (!d) {
          setData(null)
          return
        }
        // The API already sorts by score desc; we sort defensively in case
        // the client receives an older/stale payload from the CDN.
        const situations = Array.isArray(d.situations)
          ? [...d.situations].sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))
          : []
        setData({
          situations,
          totalCount: typeof d.totalCount === 'number' ? d.totalCount : situations.length,
          featuredCount:
            typeof d.featuredCount === 'number' ? d.featuredCount : 0,
          universeSize:
            typeof d.universeSize === 'number' ? d.universeSize : 0,
          scannedAt: typeof d.scannedAt === 'string' ? d.scannedAt : null,
          error: typeof d.error === 'string' ? d.error : undefined,
        })
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const reload = useCallback(() => setReloadTick((n) => n + 1), [])

  return { data, loading, reload }
}
