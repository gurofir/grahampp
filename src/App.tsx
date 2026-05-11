import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from './features/home/LanguageToggle'
import SearchBar from './features/home/SearchBar'
import LoadingScreen from './features/home/LoadingScreen'
import AnalysisResult from './features/analysis/AnalysisResult'
import ThesisList from './features/watchlist/ThesisList'
import { useTheses, type Thesis } from './features/watchlist/hooks/useTheses'
import { useDiscovery, type SituationRow } from './features/discovery/hooks/useDiscovery'
import DiscoveryFeed from './features/discovery/DiscoveryFeed'
import type { Analysis } from './shared/lib/types'

type View = 'home' | 'loading' | 'result'
export type AiStatus = 'idle' | 'loading' | 'done' | 'unavailable' | 'error'

// A cached row counts as "complete" only when every AI layer ran successfully
// during the last scan. If anything is missing (older pre-Storyteller row,
// failed About summary, partial scan, etc.) the loader will fall through to
// /interpret to fill in the gaps instead of rendering a half-empty card.
function isAnalysisComplete(a: Analysis | null | undefined): boolean {
  if (!a) return false
  if (!a.dualEngine || !a.dualEngine.graham || !a.dualEngine.market) return false
  if (!a.dualEngine.graham.plainSummary) return false
  if (!a.ai || !a.ai.businessDescription) return false
  return true
}

export default function App() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'he'
  const {
    theses,
    saveThesis,
    removeThesis,
    updateThesisText,
    updateLatestSnapshot,
  } = useTheses()

  const [view, setView] = useState<View>('home')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedTicker, setSavedTicker] = useState<string | null>(null)
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
        setSavedTicker(null)
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
          setView('home')
          return
        }
        const next = data as Analysis
        setAnalysis(next)
        setView('result')
        // Update the saved thesis snapshot (price + tiers) for tier-change alerts.
        updateLatestSnapshot(next)
        // Cache hit AND every AI layer is present → render straight from cache,
        // skip /interpret entirely. If any layer is missing (old row, partial
        // scan, storyteller/about failure), fall through to /interpret so the
        // user always sees a complete card.
        if (next.fromCache && isAnalysisComplete(next)) {
          setAiStatus('done')
          return
        }
        void fetchInterpretation(next.ticker, i18n.language)
      } catch {
        setError(t('errors.networkError'))
        setView('home')
      }
    },
    [i18n.language, t, fetchInterpretation, updateLatestSnapshot],
  )

  const handleSituationTap = useCallback(
    (situation: SituationRow) => {
      // Open the pre-computed analysis directly from the Discovery feed —
      // no API call needed for the indicators/engines. But if any AI layer is
      // missing on the cached row (older pre-Storyteller scan, partial scan,
      // failed About summary), kick off /interpret to fill in the gaps so the
      // user still sees a complete card with plainSummary + about.
      setError(null)
      setSavedTicker(null)
      const fullAnalysis: Analysis = {
        ...situation.full_analysis,
        fromCache: true,
        cachedAt: situation.scanned_at,
      }
      setAnalysis(fullAnalysis)
      setView('result')
      updateLatestSnapshot(fullAnalysis)
      if (isAnalysisComplete(fullAnalysis)) {
        setAiStatus('done')
        return
      }
      void fetchInterpretation(fullAnalysis.ticker, i18n.language)
    },
    [updateLatestSnapshot, fetchInterpretation, i18n.language],
  )

  const handleViewThesis = useCallback(
    (thesis: Thesis) => {
      setError(null)
      setSavedTicker(null)
      if (thesis.analysis && isAnalysisComplete(thesis.analysis)) {
        // Snapshot is fully populated — render straight from local storage.
        setAnalysis(thesis.analysis)
        setAiStatus('done')
        setView('result')
        return
      }
      // No snapshot, or snapshot is missing AI layers — go through the normal
      // analyze flow which will hit Supabase cache first and only run a full
      // analysis if that's also incomplete.
      void handleAnalyze(thesis.ticker)
    },
    [handleAnalyze],
  )

  const handleBack = useCallback(() => {
    setAnalysis(null)
    setSavedTicker(null)
    setAiStatus('idle')
    setView('home')
  }, [])

  const handleSave = useCallback(() => {
    if (!analysis) return
    saveThesis(analysis)
    setSavedTicker(analysis.ticker)
  }, [analysis, saveThesis])

  const handleRefresh = useCallback(async () => {
    if (!analysis || refreshing) return
    setRefreshing(true)
    try {
      await handleAnalyze(analysis.ticker, { fresh: true })
    } finally {
      setRefreshing(false)
    }
  }, [analysis, refreshing, handleAnalyze])

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
          onSave={handleSave}
          onRefresh={analysis.fromCache ? handleRefresh : undefined}
          refreshing={refreshing}
          saved={savedTicker === analysis.ticker}
        />
      ) : (
        <div className="p-4 space-y-6">
          <header className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold" dir="ltr">
                {t('app.title')}
              </h1>
              <p className="text-xs text-gray-500">{t('app.subtitle')}</p>
            </div>
            <LanguageToggle />
          </header>

          {discovery || discoveryLoading ? (
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
            />
          ) : null}

          <div>
            <p className="text-[12px] text-gray-500 mb-2 text-center">
              {t('discovery.search')}
            </p>
            <SearchBar onSubmit={handleAnalyze} />
          </div>

          {error ? (
            <div
              role="alert"
              className="text-sm p-3 rounded-xl bg-[#FCEBEB] text-[#A32D2D] border border-[#F7C1C1]"
            >
              {error}
            </div>
          ) : null}

          <ThesisList
            theses={theses}
            onRemove={removeThesis}
            onView={handleViewThesis}
            onUpdate={handleAnalyze}
            onUpdateThesisText={updateThesisText}
          />
        </div>
      )}
    </div>
  )
}
