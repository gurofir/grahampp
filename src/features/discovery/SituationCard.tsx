import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SituationRow } from './hooks/useDiscovery'
import {
  classifyArchetype,
  compoundConvictionLabel,
  computeSentiment,
  situationTitleKey,
  situationTitleFallback,
} from '../../shared/lib/archetype'
import {
  STANDOUT_PALETTE,
  topStandoutIndicators,
  type StandoutIndicator,
} from '../../shared/lib/standouts'
import { currencySymbol } from '../../shared/lib/format'
import ArchetypeBadge from '../../shared/ui/ArchetypeBadge'
import SentimentSpectrum from '../../shared/ui/SentimentSpectrum'
import WatchButton from '../../shared/ui/WatchButton'

export interface SituationCardProps {
  situation: SituationRow
  isWatched: boolean
  onTap: () => void
  onToggleWatch: () => void
}

// One row in the Discovery list. Constitutional layout, top to bottom:
//
//   [ARCHETYPE PILL]                                 [+ watch]
//   TICKER · COMPANY                       $price  +-X.XX%
//   sector
//
//   Question-form situation title (1-2 lines)
//
//   Standout chips: [P/E 13×]  [Coverage 21×]  [ROIC 18%]
//   (top 2-3 most extreme indicators, color-coded by direction)
//
//   FEAR ←—●—→ GREED   sentiment label
//
//   Plain-language story (Storyteller LLM, 2-3 sentences)
//
//   [compound conviction phrase]
//
// The chips and the story together explain WHY this stock is in the list
// without forcing the user to tap through. The chips give concrete
// numbers; the story gives the human translation.
export default function SituationCard({
  situation,
  isWatched,
  onTap,
  onToggleWatch,
}: SituationCardProps) {
  const { t, i18n } = useTranslation()
  const archetype = classifyArchetype(situation)
  const sentiment = computeSentiment(situation)
  const conviction = compoundConvictionLabel(situation)
  const sym = currencySymbol(situation.full_analysis?.currency || 'USD')

  // Title: prefer per-archetype template; for the generic fallback variants
  // we prefer the storyteller's per-ticker headline (more specific).
  const titleFromArchetype = t(situationTitleKey(archetype))
  const titleFallback = situationTitleFallback(situation)
  const isFallbackArchetype = archetype.startsWith('unclassified')
  const title =
    isFallbackArchetype && titleFallback
      ? titleFallback
      : titleFromArchetype

  const grahamFinal = situation.full_analysis?.dualEngine?.graham
  const plainStory = grahamFinal?.plainSummary?.story?.trim() || null

  // Standout chips -- top 2-3 most extreme indicators biased by decision.
  const standouts = useMemo<StandoutIndicator[]>(
    () =>
      topStandoutIndicators(
        situation.full_analysis,
        situation.graham_decision,
        3,
      ),
    [situation.full_analysis, situation.graham_decision],
  )

  // When no plain story exists (older cached rows pre-Storyteller), fall
  // back to a Graham-vs-Market disagreement summary so the card never has
  // a blank explanation slot.
  const fallbackBlurb = plainStory ? null : composeDisagreement(situation, t)

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '0.5px solid #E0DFDB',
    borderRadius: 16,
  }

  return (
    <article style={cardStyle}>
      <button
        type="button"
        onClick={onTap}
        className="w-full text-start group"
        style={{ padding: '14px 14px 16px', cursor: 'pointer' }}
      >
        <div className="flex items-center justify-between gap-3">
          <ArchetypeBadge archetype={archetype} />
          <WatchButton isWatched={isWatched} onToggle={onToggleWatch} />
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[18px] font-semibold text-gray-900 tracking-tight"
                dir="ltr"
              >
                {situation.ticker}
              </span>
              <span
                className="text-[12px] text-[#7B7B79] truncate"
                dir="ltr"
              >
                {situation.company_name || situation.ticker}
              </span>
            </div>
            {situation.sector ? (
              <div className="mt-0.5 text-[11px] text-[#9A9A95]" dir="ltr">
                {situation.sector}
              </div>
            ) : null}
          </div>
          {situation.current_price != null ? (
            <div className="text-end shrink-0">
              <div
                className="text-[16px] font-semibold text-gray-900 tabular-nums"
                dir="ltr"
              >
                {sym}
                {situation.current_price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              {typeof situation.daily_change_pct === 'number' &&
              Number.isFinite(situation.daily_change_pct) ? (
                <div
                  className="text-[12px] mt-0.5 tabular-nums font-medium"
                  style={{
                    color:
                      situation.daily_change_pct >= 0 ? '#1F8A4D' : '#A32D2D',
                  }}
                  dir="ltr"
                >
                  {situation.daily_change_pct >= 0 ? '+' : ''}
                  {situation.daily_change_pct.toFixed(2)}%
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <h3
          className="mt-3 text-[15px] font-semibold text-gray-900 leading-snug"
          dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
        >
          {title}
        </h3>

        {standouts.length > 0 ? (
          <StandoutChips standouts={standouts} />
        ) : null}

        <div className="mt-3">
          <SentimentSpectrum sentiment={sentiment} />
        </div>

        {plainStory ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-[#9A9A95] font-semibold mb-1">
              {t('plain.header')}
            </div>
            <p
              className="text-[13px] text-[#3F3F3D] leading-snug"
              dir="auto"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {plainStory}
            </p>
          </div>
        ) : fallbackBlurb ? (
          <p
            className="mt-3 text-[13px] text-[#3F3F3D] leading-snug"
            dir="auto"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {fallbackBlurb}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center text-[11px] font-medium text-[#3F3F3D]"
            style={{
              backgroundColor: '#F0EFEA',
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid #E0DFDB',
            }}
          >
            {t(`conviction.${conviction}`)}
          </span>
        </div>
      </button>
    </article>
  )
}

// Horizontal row of small color-coded chips, each showing one standout
// indicator (e.g. "P/E 13×" with a green tint when it's deep value).
// Wraps onto a second line when there's no horizontal room.
function StandoutChips({ standouts }: { standouts: StandoutIndicator[] }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" dir="ltr">
      {standouts.map((s) => {
        const palette =
          s.direction === 'positive' || s.direction === 'negative'
            ? STANDOUT_PALETTE[s.direction]
            : STANDOUT_PALETTE.neutral
        const label = t(`indicators.${s.key}`, { defaultValue: s.key })
        return (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium"
            style={{
              backgroundColor: palette.bg,
              color: palette.fg,
              padding: '3px 9px',
              borderRadius: 999,
              border: `0.5px solid ${palette.bg}`,
              lineHeight: 1.3,
            }}
            title={`${label}: ${s.formatted}`}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: palette.ring,
              }}
            />
            <span>{label}</span>
            <span className="tabular-nums font-semibold">{s.formatted}</span>
          </span>
        )
      })}
    </div>
  )
}

// Build the inline "Market believes X · Graham++ sees Y" line. Used only
// as a fallback when the storyteller didn't produce a plain-language
// summary for this ticker (older cached rows).
function composeDisagreement(
  s: SituationRow,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string | null {
  const market = (s.market_thesis || '').trim()
  const grahamFinal = s.full_analysis?.dualEngine?.graham
  const graham =
    (s.graham_decision === 'BUY'
      ? grahamFinal?.thesis
      : grahamFinal?.counter?.summary || grahamFinal?.thesis) || ''
  const grahamTrim = graham.trim()

  if (market && grahamTrim) {
    return `${t('disagreement.marketBelieves')}: ${market} · ${t('disagreement.grahamSees')}: ${grahamTrim}`
  }
  if (grahamTrim) return grahamTrim
  if (market) return market
  return s.insight?.trim() || null
}
