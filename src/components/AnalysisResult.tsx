import { useTranslation } from 'react-i18next'
import type { Analysis } from '../lib/types'
import type { AiStatus } from '../App'
import Accordion, { type AccordionItemDef } from './Accordion'
import { ColorStrip, IndicatorRows } from './AccordionContent'
import DualEngineCard from './DualEngineCard'
import ReasonsAccordion from './ReasonsAccordion'
import { INDICATORS_BY_SECTION, SECTION_ORDER } from '../lib/format'

interface AnalysisResultProps {
  analysis: Analysis
  aiStatus: AiStatus
  onBack: () => void
  onSave: () => void
  saved?: boolean
}

export default function AnalysisResult({
  analysis,
  aiStatus,
  onBack,
  onSave,
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
