import { Fragment } from 'react'
import type { IndicatorEntry } from '../lib/types'
import { isSeries } from '../lib/types'
import { canonicalTier, type CanonicalTier } from '../lib/format'
import IndicatorRow from './IndicatorRow'

const STRIP_COLORS: Record<CanonicalTier, { color: string; opacity: number }> = {
  exceptional: { color: '#3B6D11', opacity: 0.7 },
  strong: { color: '#185FA5', opacity: 0.7 },
  acceptable: { color: '#BA7517', opacity: 0.7 },
  weak: { color: '#E07B39', opacity: 0.7 },
  danger: { color: '#A32D2D', opacity: 0.7 },
  na: { color: '#D1D5DB', opacity: 0.5 },
}

export function ColorStrip({ indicators }: { indicators: IndicatorEntry[] }) {
  return (
    <div className="flex gap-[2px]" aria-hidden>
      {indicators.map((ind) => {
        const tier = isSeries(ind) ? ind.latestTier : ind.tier
        const c = canonicalTier(tier)
        const cfg = STRIP_COLORS[c]
        return (
          <span
            key={ind.key}
            style={{
              width: 22,
              height: 4,
              borderRadius: 2,
              backgroundColor: cfg.color,
              opacity: cfg.opacity,
              display: 'inline-block',
            }}
          />
        )
      })}
    </div>
  )
}

export function IndicatorRows({
  indicators,
  insights,
}: {
  indicators: IndicatorEntry[]
  insights: Record<string, string>
}) {
  if (indicators.length === 0) return null
  return (
    <div>
      {indicators.map((ind, idx) => (
        <Fragment key={ind.key}>
          <div
            style={{
              borderBottom:
                idx < indicators.length - 1 ? '0.5px solid #F1F1F1' : 'none',
            }}
          >
            <IndicatorRow
              indicator={ind}
              aiInsight={insights[ind.key] ?? null}
            />
          </div>
        </Fragment>
      ))}
    </div>
  )
}
