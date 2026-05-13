import { useTranslation } from 'react-i18next'
import type { Decision, DualEngine } from '../../shared/lib/types'

export interface DisagreementPanelProps {
  dual: DualEngine
}

// Color palette for the decision badges. Mirrors the rest of the app
// (BUY = forest green, AVOID = clay red, WAIT = warm amber).
const DECISION_BADGE: Record<
  Decision,
  { bg: string; fg: string; ring: string }
> = {
  BUY: { bg: '#DEF0E2', fg: '#1F6F2A', ring: '#1F8A4D' },
  WAIT: { bg: '#FBEAC9', fg: '#7D5400', ring: '#C68910' },
  AVOID: { bg: '#FAD8D8', fg: '#9A2A2A', ring: '#C24747' },
}

// Two-column "disagreement" panel (Constitution §11). Side by side: what
// Graham++ sees vs what the market is pricing in. The visible gap between
// the two columns IS the alpha.
//
// Layout intent:
//   - Graham++ ALWAYS sits on the LEFT (in both LTR and RTL), because it
//     is the framework's voice of record. The container forces dir="ltr"
//     so the column order never flips by language; individual text spans
//     keep dir="auto" so Hebrew copy still flows right-to-left within
//     its column.
//   - Graham gets a dark, tactile slab; Market is rendered as a quieter
//     companion column. The visual contrast IS the message.
//
// Hidden when both engines agree exactly (no disagreement to surface).
export default function DisagreementPanel({ dual }: DisagreementPanelProps) {
  const { t } = useTranslation()

  const market = dual.market
  const graham = dual.graham
  const sameDecision = market.decision === graham.decision
  if (sameDecision && market.thesis?.trim() === graham.thesis?.trim()) {
    return null
  }

  const grahamBadge = DECISION_BADGE[graham.decision] ?? DECISION_BADGE.WAIT
  const marketBadge = DECISION_BADGE[market.decision] ?? DECISION_BADGE.WAIT

  return (
    <section
      className="overflow-hidden"
      style={{
        borderRadius: 16,
        border: '0.5px solid #E0DFDB',
        backgroundColor: '#FFFFFF',
      }}
    >
      <div
        className="flex items-center justify-center gap-2"
        style={{
          padding: '10px 14px',
          backgroundColor: '#FAF9F5',
          borderBottom: '0.5px solid #ECEAE3',
        }}
      >
        <span
          className="text-[10px] uppercase tracking-wider font-semibold text-[#7B7B79]"
          dir="auto"
        >
          {t('disagreement.header')}
        </span>
      </div>

      {/* dir="ltr" forces Graham (first child) to render on the left in
          Hebrew too. Inner text uses dir="auto" to keep Hebrew RTL inside
          each column. */}
      <div
        className="grid grid-cols-2 relative"
        style={{ direction: 'ltr' }}
      >
        <Column
          variant="primary"
          label={t('disagreement.grahamSees')}
          decision={graham.decision}
          thesis={graham.thesis}
          badge={grahamBadge}
        />
        <Column
          variant="secondary"
          label={t('disagreement.marketBelieves')}
          decision={market.decision}
          thesis={market.thesis}
          badge={marketBadge}
        />

        {/* Subtle vs. divider in the gutter. Centered glyph reinforces the
            "two opposing views" frame without being shouty. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: 0,
            bottom: 0,
            transform: 'translateX(-50%)',
            width: 1,
            backgroundColor: '#ECEAE3',
          }}
        />
        <div
          aria-hidden
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: '50%',
            top: 16,
            transform: 'translateX(-50%)',
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #ECEAE3',
            color: '#9A9A95',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          VS
        </div>
      </div>
    </section>
  )
}

function Column({
  variant,
  label,
  decision,
  thesis,
  badge,
}: {
  variant: 'primary' | 'secondary'
  label: string
  decision: Decision
  thesis: string
  badge: { bg: string; fg: string; ring: string }
}) {
  const { t } = useTranslation()
  const isPrimary = variant === 'primary'

  // Primary (Graham) gets a darker label and a fuller decision treatment;
  // secondary (Market) is muted so the visual weight skews toward Graham.
  const labelColor = isPrimary ? '#1F2937' : '#9A9A95'
  const labelWeight = isPrimary ? 700 : 600
  const thesisColor = isPrimary ? '#1F2937' : '#5F5E5A'
  const bg = isPrimary ? '#FFFFFF' : '#FAF9F5'

  return (
    <div
      className="min-w-0"
      style={{
        padding: '20px 14px 16px',
        backgroundColor: bg,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: labelColor, fontWeight: labelWeight }}
        dir="auto"
      >
        {label}
      </div>

      <div
        className="mt-2 inline-flex items-center"
        style={{
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          backgroundColor: badge.bg,
          color: badge.fg,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
        dir="ltr"
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: badge.ring,
          }}
        />
        {t(`dualEngine.decision.${decision}`, decision)}
      </div>

      {thesis ? (
        <p
          className="mt-3 text-[13px] leading-relaxed"
          style={{
            color: thesisColor,
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          dir="auto"
        >
          {thesis}
        </p>
      ) : null}
    </div>
  )
}
