import { useTranslation } from 'react-i18next'
import type {
  Analysis,
  DualEngine,
  IndicatorEntry,
} from '../../shared/lib/types'
import Accordion, { type AccordionItemDef } from '../../shared/ui/Accordion'
import ReasonsAccordion from './ReasonsAccordion'
import EarningsSection from './EarningsSection'
import { ColorStrip, IndicatorRows } from './AccordionContent'
import { INDICATORS_BY_SECTION, SECTION_ORDER } from '../../shared/lib/format'

export interface FragilityEvidenceAccordionProps {
  analysis: Analysis
  dual: DualEngine
}

// Collapsible "evidence" section (Constitution §13: numbers exist to support
// the narrative, not to replace it). Two sub-accordions, both closed by
// default:
//
//   1. FRAGILITY EVIDENCE   -> the dual-engine reasoning + reality findings
//   2. FINANCIAL INDICATORS -> the per-section indicator tables
//
// Tucking these behind taps keeps the main view calm and narrative-led.
export default function FragilityEvidenceAccordion({
  analysis,
  dual,
}: FragilityEvidenceAccordionProps) {
  const { t } = useTranslation()
  const indicatorInsights = analysis.ai?.indicatorInsights ?? {}

  const indicatorSections = SECTION_ORDER.map((section) => ({
    id: section,
    rows: INDICATORS_BY_SECTION[section]
      .map((k) => analysis.indicators[k])
      .filter((ind): ind is IndicatorEntry => !!ind && !!ind.key),
  })).filter((s) => s.rows.length > 0)

  const dataSubItems: AccordionItemDef[] = indicatorSections.map((section) => ({
    id: section.id,
    title: t(`sections.${section.id}`),
    subtitle: t(`sectionDesc.${section.id}`, ''),
    headerExtra: <ColorStrip indicators={section.rows} />,
    body: (
      <IndicatorRows
        indicators={section.rows}
        insights={indicatorInsights}
      />
    ),
  }))

  const items: AccordionItemDef[] = [
    {
      id: 'fragility',
      title: t('accordion.fragility'),
      body: <ReasonsAccordion graham={dual.graham} market={dual.market} />,
    },
  ]

  // Earnings sits between Fragility and Indicators per Constitution screen 2:
  // last reported quarter (EPS actual vs estimate, surprise %, sentiment chip)
  // + 4-quarter mini track record + next earnings date when known.
  //
  // Always rendered. When the cached row pre-dates the earningsHistory
  // field (or Yahoo returned no calendar date), the body shows a calm
  // "Refresh to load latest quarterly results" message instead of being
  // hidden -- so the user can always discover that the data is available.
  const hasEarnings = (analysis.earningsHistory?.length ?? 0) > 0
  items.push({
    id: 'earnings',
    title: t('accordion.earnings'),
    subtitle: hasEarnings ? t('accordion.earningsSubtitle', '') : undefined,
    body: <EarningsSection analysis={analysis} />,
  })

  if (dataSubItems.length > 0) {
    items.push({
      id: 'data',
      title: t('accordion.indicators'),
      body: <Accordion items={dataSubItems} variant="flat" />,
    })
  }

  return <Accordion items={items} />
}
