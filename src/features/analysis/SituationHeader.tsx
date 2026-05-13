import { useTranslation } from 'react-i18next'
import type { Analysis, Archetype, Sentiment } from '../../shared/lib/types'
import { currencySymbol } from '../../shared/lib/format'
import ArchetypeBadge from '../../shared/ui/ArchetypeBadge'
import SentimentSpectrum from '../../shared/ui/SentimentSpectrum'
import WatchButton from '../../shared/ui/WatchButton'

export interface SituationHeaderProps {
  analysis: Analysis
  archetype: Archetype
  sentiment: Sentiment
  situationTitle: string
  isWatched: boolean
  onToggleWatch: () => void
  onBack: () => void
}

// Constitutional stock-detail header. Mirrors the SituationCard but at full
// page scale and with a back-link, so the user always knows what archetype
// brought them here and what question is being investigated.
export default function SituationHeader({
  analysis,
  archetype,
  sentiment,
  situationTitle,
  isWatched,
  onToggleWatch,
  onBack,
}: SituationHeaderProps) {
  const { t, i18n } = useTranslation()
  const sym = currencySymbol(analysis.currency || 'USD')
  const change = analysis.dailyChangePct
  const changeColor =
    typeof change === 'number'
      ? change >= 0
        ? '#1F8A4D'
        : '#A32D2D'
      : '#5F5E5A'

  return (
    <header className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-[12px] text-[#7B7B79] hover:text-gray-900 transition-colors"
      >
        ← {t('stockDetail.back')}
      </button>

      <div className="flex items-center justify-between gap-3">
        <ArchetypeBadge archetype={archetype} size="md" />
        <WatchButton
          isWatched={isWatched}
          onToggle={onToggleWatch}
          size="md"
          stopPropagation={false}
        />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[22px] font-semibold text-gray-900 tracking-tight"
              dir="ltr"
            >
              {analysis.ticker}
            </span>
            <span className="text-[13px] text-[#7B7B79] truncate" dir="ltr">
              {analysis.companyName}
            </span>
          </div>
          {analysis.sector ? (
            <div className="mt-0.5 text-[11px] text-[#9A9A95]" dir="ltr">
              {analysis.sector}
              {analysis.country ? ` · ${analysis.country}` : ''}
            </div>
          ) : null}
        </div>
        <div className="text-end shrink-0">
          <div
            className="text-[22px] font-semibold text-gray-900 tabular-nums leading-none"
            dir="ltr"
          >
            {sym}
            {Number.isFinite(analysis.currentPrice)
              ? analysis.currentPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'}
          </div>
          {typeof change === 'number' && Number.isFinite(change) ? (
            <div
              className="text-[12px] mt-1 tabular-nums font-medium"
              style={{ color: changeColor }}
              dir="ltr"
            >
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}% {t('header.todaySuffix')}
            </div>
          ) : null}
        </div>
      </div>

      <h1
        className="text-[18px] font-semibold text-gray-900 leading-snug"
        dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
      >
        {situationTitle}
      </h1>

      <SentimentSpectrum sentiment={sentiment} />
    </header>
  )
}
