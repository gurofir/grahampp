import { useTranslation } from 'react-i18next'
import type { DualEngine } from '../../shared/lib/types'

export interface DisagreementPanelProps {
  dual: DualEngine
}

// Two-column "disagreement" panel (Constitution §11). Side by side: what
// the market is pricing in vs what Graham++ sees. The visible gap between
// the two columns IS the alpha.
//
// Hidden when both engines agree exactly (no disagreement to surface).
export default function DisagreementPanel({ dual }: DisagreementPanelProps) {
  const { t } = useTranslation()

  const market = dual.market
  const graham = dual.graham
  const sameDecision = market.decision === graham.decision
  // If decisions match AND theses are similar, hide. We keep the panel
  // visible when decisions disagree even if theses look similar -- the
  // delta is itself the story.
  if (sameDecision && market.thesis?.trim() === graham.thesis?.trim()) {
    return null
  }

  return (
    <section
      className="rounded-2xl"
      style={{
        backgroundColor: '#FAF9F5',
        border: '0.5px solid #E0DFDB',
        padding: '14px 14px 16px',
      }}
    >
      <h2 className="text-[11px] uppercase tracking-wider text-[#7B7B79] font-semibold">
        {t('disagreement.header')}
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Column
          label={t('disagreement.marketBelieves')}
          decision={market.decision}
          thesis={market.thesis}
          accent="#7B7B79"
        />
        <Column
          label={t('disagreement.grahamSees')}
          decision={graham.decision}
          thesis={graham.thesis}
          accent="#1F2937"
        />
      </div>
    </section>
  )
}

function Column({
  label,
  decision,
  thesis,
  accent,
}: {
  label: string
  decision: string
  thesis: string
  accent: string
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 min-w-0">
      <div
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div
        className="text-[12px] font-semibold"
        style={{ color: accent }}
        dir="ltr"
      >
        {t(`dualEngine.decision.${decision}`, decision)}
      </div>
      {thesis ? (
        <p
          className="text-[12px] text-[#3F3F3D] leading-snug"
          dir="auto"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {thesis}
        </p>
      ) : null}
    </div>
  )
}
