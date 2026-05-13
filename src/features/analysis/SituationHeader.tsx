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

  // Position of currentPrice within the 52w range, 0..100. Null when any
  // input is missing or the band collapses (low >= high).
  const rangePct: number | null = (() => {
    const { currentPrice, low52, high52 } = analysis
    if (
      typeof currentPrice !== 'number' ||
      typeof low52 !== 'number' ||
      typeof high52 !== 'number' ||
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(low52) ||
      !Number.isFinite(high52) ||
      high52 <= low52
    ) {
      return null
    }
    const raw = ((currentPrice - low52) / (high52 - low52)) * 100
    return Math.min(100, Math.max(0, raw))
  })()

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

      {rangePct !== null ? (
        <Range52w
          symbol={sym}
          low52={analysis.low52 as number}
          high52={analysis.high52 as number}
          rangePct={rangePct}
        />
      ) : null}

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

// Slim 52-week price-range bar. Shows a horizontal track between the
// 52w low and high with a dot at the current price, plus the labelled
// endpoints. Helps anchor "where in the band is this stock?" -- a key
// piece of context the constitutional UI was missing.
function Range52w({
  symbol,
  low52,
  high52,
  rangePct,
}: {
  symbol: string
  low52: number
  high52: number
  rangePct: number
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5" dir="ltr">
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: '#9A9A95' }}
        dir="auto"
      >
        {t('header.range52w')}
      </div>
      <div
        className="relative"
        style={{ height: 4, backgroundColor: '#ECEAE3', borderRadius: 2 }}
      >
        <div
          aria-hidden
          className="absolute"
          style={{
            top: '50%',
            left: `${rangePct}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#1F2937',
            border: '2px solid #FFFFFF',
            boxShadow: '0 0 0 1px #ECEAE3',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
      <div className="flex justify-between tabular-nums">
        <span className="text-[11px] text-[#7B7B79]">
          {symbol}
          {low52.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </span>
        <span className="text-[11px] text-[#7B7B79]">
          {symbol}
          {high52.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  )
}
