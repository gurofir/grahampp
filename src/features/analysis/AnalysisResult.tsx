import { useTranslation } from 'react-i18next'
import type { Analysis } from '../../shared/lib/types'
import type { AiStatus } from '../../App'
import Accordion, { type AccordionItemDef } from '../../shared/ui/Accordion'
import { ColorStrip, IndicatorRows } from './AccordionContent'
import AboutAccordion from './AboutAccordion'
import DualEngineCard from './DualEngineCard'
import ReasonsAccordion from './ReasonsAccordion'
import { INDICATORS_BY_SECTION, SECTION_ORDER } from '../../shared/lib/format'

interface AnalysisResultProps {
  analysis: Analysis
  aiStatus: AiStatus
  onBack: () => void
  onSave: () => void
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

export default function AnalysisResult({
  analysis,
  aiStatus,
  onBack,
  onSave,
  onRefresh,
  refreshing,
  saved,
}: AnalysisResultProps) {
  const { t } = useTranslation()
  const indicatorInsights = analysis.ai?.indicatorInsights ?? {}

  const aiReady = !!analysis.ai
  const aiLoading = !aiReady && (aiStatus === 'idle' || aiStatus === 'loading')
  const aiUnavailable =
    !aiReady && (aiStatus === 'unavailable' || aiStatus === 'error')

  const aiStatusLabel = aiLoading
    ? t('aiSection.loading', 'טוען...')
    : aiUnavailable
      ? t('aiSection.unavailableShort', 'אינו זמין')
      : ''

  const indicatorSections = SECTION_ORDER.map((section) => ({
    id: section,
    rows: INDICATORS_BY_SECTION[section]
      .map((k) => analysis.indicators[k])
      .filter((ind): ind is NonNullable<typeof ind> => !!ind && !!ind.key),
  })).filter((s) => s.rows.length > 0)

  const dataSubItems: AccordionItemDef[] = indicatorSections.map((section) => ({
    id: section.id,
    title: t(`sections.${section.id}`),
    subtitle: t(`sectionDesc.${section.id}`, ''),
    headerExtra: <ColorStrip indicators={section.rows} />,
    body: <IndicatorRows indicators={section.rows} insights={indicatorInsights} />,
  }))

  const items: AccordionItemDef[] = []

  if (analysis.dualEngine) {
    items.push({
      id: 'reasons',
      title: t('accordion.reasons'),
      body: (
        <ReasonsAccordion
          graham={analysis.dualEngine.graham}
          market={analysis.dualEngine.market}
        />
      ),
    })
  } else {
    items.push({
      id: 'reasons',
      title: t('accordion.reasons'),
      disabled: true,
      statusLabel: aiStatusLabel,
      body: null,
    })
  }

  items.push({
    id: 'data',
    title: t('accordion.data'),
    disabled: dataSubItems.length === 0,
    statusLabel:
      dataSubItems.length === 0
        ? t('aiSection.unavailableShort', 'אינו זמין')
        : '',
    body:
      dataSubItems.length > 0 ? (
        <Accordion items={dataSubItems} variant="flat" />
      ) : null,
  })

  const headerInfo = {
    ticker: analysis.ticker,
    companyName: analysis.companyName,
    sector: analysis.sector,
    country: analysis.country,
    currentPrice: analysis.currentPrice,
    currency: analysis.currency,
    dailyChangePct: analysis.dailyChangePct,
    low52: analysis.low52,
    high52: analysis.high52,
  }

  const dualEngineMissing =
    !analysis.dualEngine && (aiUnavailable || aiStatus === 'done' || aiStatus === 'error')

  return (
    <div className="p-4 space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        ← {t('actions.back')}
      </button>

      {analysis.fromCache && analysis.cachedAt ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
          <span className="text-[11px] text-gray-500 truncate">
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

      <DualEngineCard
        data={analysis.dualEngine}
        header={headerInfo}
        loading={aiLoading}
        unavailable={dualEngineMissing}
        ctaTaken={!!saved}
        onCtaClick={onSave}
      />

      <Accordion items={items} />

      {dualEngineMissing ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="w-full text-white text-[15px] font-medium disabled:opacity-50 transition-opacity"
          style={{
            backgroundColor: saved ? '#5F5E5A' : '#185FA5',
            padding: '14px',
            borderRadius: 8,
          }}
        >
          {saved ? t('actions.saved') : t('actions.saveThesis')}
        </button>
      ) : null}
    </div>
  )
}
