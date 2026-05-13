import { useTranslation } from 'react-i18next'
import type { Sentiment } from '../lib/types'
import { sentimentDotColor } from '../lib/archetype'

export interface SentimentSpectrumProps {
  sentiment: Sentiment
  showLabel?: boolean
  compact?: boolean
}

// Horizontal FEAR ↔ GREED bar with a colored dot at `sentiment.score`.
// The dot's color comes from sentimentDotColor() so the visual reinforces
// the label.
export default function SentimentSpectrum({
  sentiment,
  showLabel = true,
  compact = false,
}: SentimentSpectrumProps) {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'he'
  const dotColor = sentimentDotColor(sentiment.label)
  const trackHeight = compact ? 4 : 5
  // In RTL, "fear" stays on the left visually but we mirror the dot
  // position so it still represents the same sentiment value.
  const dotLeft = isRTL ? 100 - sentiment.score : sentiment.score

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#A32D2D] font-semibold">
          {t('spectrum.fear')}
        </span>
        <div
          className="relative flex-1 rounded-full"
          style={{ height: trackHeight, backgroundColor: '#EBE9E2' }}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(${dotLeft}% - 5px)`,
              width: 10,
              height: 10,
              backgroundColor: dotColor,
              boxShadow: '0 0 0 2px white',
            }}
          />
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#1F8A4D] font-semibold">
          {t('spectrum.greed')}
        </span>
      </div>
      {showLabel ? (
        <span className="text-[11px] text-[#5F5E5A]">
          {t(`sentiment.${sentiment.label}`)}
        </span>
      ) : null}
    </div>
  )
}
