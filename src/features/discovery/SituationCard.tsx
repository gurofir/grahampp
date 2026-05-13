import { useTranslation } from 'react-i18next'
import type { SituationRow } from './hooks/useDiscovery'
import {
  classifyArchetype,
  compoundConvictionLabel,
  computeSentiment,
  situationTitleKey,
  situationTitleFallback,
} from '../../shared/lib/archetype'
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

// One row in the Discovery list. Constitutional layout:
//
//   [ARCHETYPE PILL]                                 [+ watch]
//   TICKER · COMPANY                       $price  +-X.XX%
//
//   Question-form situation title (1-2 lines)
//
//   FEAR ←—●—→ GREED
//   sentiment label
//
//   The disagreement: market believes X / Graham++ sees Y  (1-2 lines)
//
//   [compound conviction phrase]
//
// All raw metrics (PE, FCF, fragility band etc.) are deliberately hidden
// here -- they live behind accordions on the stock-detail page. The card
// is for narrative recognition, not analysis.
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

  // Title: prefer the per-archetype question template; fall back to the
  // Storyteller's plain-language headline; final fallback is the templated
  // insight string.
  const titleFromArchetype = t(situationTitleKey(archetype))
  const titleFallback = situationTitleFallback(situation)
  const title =
    archetype === 'unclassified' && titleFallback
      ? titleFallback
      : titleFromArchetype

  // Disagreement line: brief market vs Graham summary. We compose this
  // client-side from the existing graham_thesis / market_thesis fields.
  const disagreement = composeDisagreement(situation, t)

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

        <div className="mt-3">
          <SentimentSpectrum sentiment={sentiment} />
        </div>

        {disagreement ? (
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
            {disagreement}
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

// Build the inline "Market believes X · Graham++ sees Y" line. Skips the
// dual structure when one side is missing and falls back to a single
// thesis sentence.
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
