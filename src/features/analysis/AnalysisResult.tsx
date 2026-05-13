import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Analysis } from '../../shared/lib/types'
import type { AiStatus } from '../../App'
import {
  classifyArchetypeFromAnalysis,
  computeSentimentFromAnalysis,
  compoundConvictionLabelFromAnalysis,
  situationTitleFallback,
  situationTitleKey,
  analysisToSituationRow,
} from '../../shared/lib/archetype'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import SituationHeader from './SituationHeader'
import PlainSummaryBlock from './PlainSummaryBlock'
import DisagreementPanel from './DisagreementPanel'
import ThesisFlowPanel from './ThesisFlowPanel'
import ConvictionSummary from './ConvictionSummary'
import FragilityEvidenceAccordion from './FragilityEvidenceAccordion'
import AboutAccordion from './AboutAccordion'
import { DualEngineCardSkeleton } from './DualEngineCard'

interface AnalysisResultProps {
  analysis: Analysis
  aiStatus: AiStatus
  onBack: () => void
  // Kept for back-compat with the legacy "Save analysis" CTA, but the
  // constitutional UI uses the WatchButton in the header instead. App.tsx
  // can stop calling onSave once we remove the legacy thesis list.
  onSave?: () => void
  onRefresh?: () => void
  refreshing?: boolean
  saved?: boolean
}

function formatCacheAge(
  t: ReturnType<typeof useTranslation>['t'],
  iso: string | null | undefined,
): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return t('discovery.fromCacheJustNow')
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('discovery.fromCacheJustNow')
  if (minutes < 60) return t('discovery.fromCacheMinutes', { minutes })
  const hours = Math.floor(minutes / 60)
  return t('discovery.fromCacheHours', { hours })
}

// Constitutional stock-detail page (Constitution §13, §15, mockup screen 2).
//
// Render order, top to bottom:
//   1. SituationHeader  (back, archetype, ticker/price, question, sentiment, watch)
//   2. About company    (collapsible)
//   3. PlainSummaryBlock ("In plain words" hero)
//   4. DisagreementPanel (Market believes / Graham++ sees)
//   5. ThesisFlowPanel  (Thesis / Counter / Breaks / Confirms)
//   6. ConvictionSummary (compound conviction band, dark calm tile)
//   7. FragilityEvidenceAccordion (raw indicators + reasoning, hidden by default)
//
// We never render the old DualEngineCard hero in this layout -- the new
// header + plain-summary + disagreement triumvirate replaces it. Skeleton
// is still used while the AI engines are loading.
export default function AnalysisResult({
  analysis,
  aiStatus,
  onBack,
  onRefresh,
  refreshing,
}: AnalysisResultProps) {
  const { t } = useTranslation()
  const watch = useWatchlist()

  const archetype = useMemo(
    () => classifyArchetypeFromAnalysis(analysis),
    [analysis],
  )
  const sentiment = useMemo(
    () => computeSentimentFromAnalysis(analysis),
    [analysis],
  )
  const convictionKey = useMemo(
    () => compoundConvictionLabelFromAnalysis(analysis),
    [analysis],
  )

  const titleFallback = situationTitleFallback(
    analysisToSituationRow(analysis),
  )
  const situationTitle =
    archetype === 'unclassified' && titleFallback
      ? titleFallback
      : t(situationTitleKey(archetype))

  const dual = analysis.dualEngine
  const aiLoading =
    !dual && (aiStatus === 'idle' || aiStatus === 'loading')
  const aiUnavailable =
    !dual && (aiStatus === 'unavailable' || aiStatus === 'error')

  const isWatched = watch.isWatched(analysis.ticker)

  return (
    <div className="p-4 space-y-5">
      <SituationHeader
        analysis={analysis}
        archetype={archetype}
        sentiment={sentiment}
        situationTitle={situationTitle}
        isWatched={isWatched}
        onToggleWatch={() => watch.toggleAnalysis(analysis, archetype)}
        onBack={onBack}
      />

      {analysis.fromCache && analysis.cachedAt ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E0DFDB] bg-[#FAF9F5] px-3 py-2">
          <span className="text-[11px] text-[#7B7B79] truncate">
            {formatCacheAge(t, analysis.cachedAt)}
          </span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="text-[11px] font-medium text-[#185FA5] hover:underline disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {refreshing ? t('discovery.refreshing') : t('discovery.refresh')}
            </button>
          ) : null}
        </div>
      ) : null}

      <AboutAccordion
        companyName={analysis.companyName}
        sector={analysis.sector}
        country={analysis.country}
        businessDescription={analysis.ai?.businessDescription}
        longBusinessSummary={analysis.businessSummary}
      />

      {dual?.graham?.plainSummary ? (
        <section
          className="rounded-2xl bg-white"
          style={{
            border: '0.5px solid #E0DFDB',
            padding: '14px',
          }}
        >
          <PlainSummaryBlock
            summary={dual.graham.plainSummary}
            decision={dual.graham.decision}
          />
        </section>
      ) : null}

      {dual ? (
        <>
          <DisagreementPanel dual={dual} />
          <ThesisFlowPanel graham={dual.graham} />
          <ConvictionSummary
            convictionKey={convictionKey}
            archetype={archetype}
            graham={dual.graham}
          />
          <FragilityEvidenceAccordion analysis={analysis} dual={dual} />
        </>
      ) : aiLoading ? (
        <DualEngineCardSkeleton
          header={{
            ticker: analysis.ticker,
            companyName: analysis.companyName,
            sector: analysis.sector,
            country: analysis.country,
            currentPrice: analysis.currentPrice,
            currency: analysis.currency,
            dailyChangePct: analysis.dailyChangePct,
            low52: analysis.low52,
            high52: analysis.high52,
          }}
        />
      ) : aiUnavailable ? (
        <div className="rounded-2xl border border-[#E0DFDB] bg-white p-4 text-[13px] text-[#A32D2D] text-center">
          {t('aiSection.unavailable')}
        </div>
      ) : null}
    </div>
  )
}
