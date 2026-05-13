import { useTranslation } from 'react-i18next'
import type { Archetype, EngineResult, FragilityBand } from '../../shared/lib/types'

export interface ConvictionSummaryProps {
  convictionKey: string  // e.g. "patientCompounder" -> conviction.<key> in i18n
  archetype: Archetype
  graham: EngineResult
}

// The compound conviction line, displayed as a calm summary block at the
// bottom of the constitutional stock-detail page (Constitution §15).
//
// Mirrors the pill on the SituationCard but here it gets its own panel
// with a small explanation derived from decision + fragility -- no big
// numbers, no buy/sell labels, no charts. Just the label and a sentence.
export default function ConvictionSummary({
  convictionKey,
  archetype,
  graham,
}: ConvictionSummaryProps) {
  const { t } = useTranslation()

  const fragility = graham.fragilityBand as FragilityBand | undefined
  const fragilityText = fragility
    ? t(`reality.fragility.${fragility}`)
    : null

  return (
    <section
      className="rounded-2xl"
      style={{
        backgroundColor: '#1F2937',
        color: '#FFFFFF',
        padding: '18px 16px',
      }}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {t(`archetype.${archetype}`)}
      </div>
      <div
        className="mt-2 text-[16px] font-semibold leading-snug"
        dir="auto"
      >
        {t(`conviction.${convictionKey}`)}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] opacity-80">
        <span>
          {t('dualEngine.decision.' + graham.decision)} ·{' '}
          {t(`dualEngine.confidence.${graham.confidence}`)}
        </span>
        {fragilityText ? (
          <span className="opacity-70">· {fragilityText}</span>
        ) : null}
      </div>
    </section>
  )
}
