import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadingScreen from './features/home/LoadingScreen'
import AnalysisResult from './features/analysis/AnalysisResult'
import { useDiscovery, type SituationRow } from './features/discovery/hooks/useDiscovery'
import DiscoveryFeed from './features/discovery/DiscoveryFeed'
import WatchingPage from './features/watching/WatchingPage'
import AppShell from './AppShell'
import type { Analysis, WatchedItem } from './shared/lib/types'
import type { TabId } from './shared/ui/BottomTabBar'
import { useWatchlist } from './shared/hooks/useWatchlist'

type View = 'list' | 'loading' | 'result'
export type AiStatus = 'idle' | 'loading' | 'done' | 'unavailable' | 'error'

// A cached row is "renderable from cache" as long as the dual engine ran.
// Optional AI layers (plainSummary, businessDescription) are best-effort and
// gracefully degrade in the components -- we never burn a fresh /interpret
// call on a Discovery click just because storyteller or about happened to
// fail during the scan.
function hasEngineData(a: Analysis | null | undefined): boolean {
  if (!a) return false
  if (!a.dualEngine) return false
  if (!a.dualEngine.graham || !a.dualEngine.market) return false
  return true
}

export default function App() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'he'
  const watch = useWatchlist()

  const [view, setView] = useState<View>('list')
  const [tab, setTab] = useState<TabId>('situations')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { data: discovery, loading: discoveryLoading } = useDiscovery()

  const fetchInterpretation = useCallback(
    async (ticker: string, lang: string) => {
      setAiStatus('loading')
      try {
        const res = await fetch(
          `/.netlify/functions/interpret?ticker=${encodeURIComponent(ticker)}&lang=${lang}`,
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setAiStatus('error')
          return
        }
        setAnalysis((prev) => {
          if (!prev || prev.ticker !== ticker) return prev
          return {
            ...prev,
            ai: data.ai ?? null,
            dualEngine: data.dualEngine ?? null,
          }
        })
        setAiStatus(data.ai || data.dualEngine ? 'done' : 'unavailable')
      } catch {
        setAiStatus('error')
      }
    },
    [],
  )

  const handleAnalyze = useCallback(
    async (ticker: string, opts?: { fresh?: boolean }) => {
      const fresh = !!opts?.fresh
      setError(null)
      if (!fresh) {
        setAnalysis(null)
      }
      setAiStatus('idle')
      if (!fresh) setView('loading')
      try {
        const url = `/.netlify/functions/analyze?ticker=${encodeURIComponent(ticker)}&lang=${i18n.language}${fresh ? '&fresh=1' : ''}`
        const res = await fetch(url)
        const data = await res.json()
        if (!res.ok) {
          const key = data?.error || 'generic'
          setError(t(`errors.${key}`, t('errors.generic')))
          setView('list')
          return
        }
        const next = data as Analysis
        setAnalysis(next)
        setView('result')
        if (next.fromCache && hasEngineData(next)) {
          setAiStatus('done')
          return
        }
        void fetchInterpretation(next.ticker, i18n.language)
      } catch {
        setError(t('errors.networkError'))
        setView('list')
      }
    },
    [i18n.language, t, fetchInterpretation],
  )

  const handleSituationTap = useCallback((situation: SituationRow) => {
    setError(null)
    const fullAnalysis: Analysis = {
      ...situation.full_analysis,
      fromCache: true,
      cachedAt: situation.scanned_at,
    }
    setAnalysis(fullAnalysis)
    setAiStatus(hasEngineData(fullAnalysis) ? 'done' : 'unavailable')
    setView('result')
  }, [])

  // Watching tap: prefer live row when present (fresher data), otherwise
  // fall back to a stub Analysis built from the snapshot. If the snapshot
  // has no engine data either, fire /analyze fresh.
  const handleWatchingTap = useCallback(
    (watched: WatchedItem, liveRow: SituationRow | null) => {
      if (liveRow) {
        handleSituationTap(liveRow)
        return
      }
      void handleAnalyze(watched.ticker)
    },
    [handleAnalyze, handleSituationTap],
  )

  const handleBack = useCallback(() => {
    setAnalysis(null)
    setAiStatus('idle')
    setView('list')
  }, [])

  const handleRefresh = useCallback(async () => {
    if (!analysis || refreshing) return
    setRefreshing(true)
    try {
      await handleAnalyze(analysis.ticker, { fresh: true })
    } finally {
      setRefreshing(false)
    }
  }, [analysis, refreshing, handleAnalyze])

  const watchingCount = watch.items.length

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={i18n.language}
      className="max-w-sm mx-auto min-h-screen bg-white text-gray-900"
    >
      {view === 'loading' ? (
        <LoadingScreen />
      ) : view === 'result' && analysis ? (
        <AnalysisResult
          analysis={analysis}
          aiStatus={aiStatus}
          onBack={handleBack}
          onRefresh={analysis.fromCache ? handleRefresh : undefined}
          refreshing={refreshing}
        />
      ) : (
        <AppShell
          activeTab={tab}
          onTabChange={setTab}
          watchingCount={watchingCount}
        >
          {error ? (
            <div
              role="alert"
              className="mb-4 text-sm p-3 rounded-xl bg-[#FCEBEB] text-[#A32D2D] border border-[#F7C1C1]"
            >
              {error}
            </div>
          ) : null}

          {tab === 'situations' ? (
            <DiscoveryFeed
              data={discovery ?? {
                situations: [],
                totalCount: 0,
                featuredCount: 0,
                universeSize: 0,
                scannedAt: null,
              }}
              loading={discoveryLoading}
              onSituationTap={handleSituationTap}
              onSwitchToWatching={() => setTab('watching')}
            />
          ) : (
            <WatchingPage
              discovery={discovery}
              onItemTap={handleWatchingTap}
            />
          )}
        </AppShell>
      )}
    </div>
  )
}
