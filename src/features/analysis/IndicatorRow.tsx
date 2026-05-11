import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IndicatorEntry } from '../../shared/lib/types'
import { isSeries } from '../../shared/lib/types'
import {
  canonicalTier,
  formatIndicatorValue,
  TIER_BADGE,
  TIER_COLORS,
  TIER_INDEX,
} from '../../shared/lib/format'

interface IndicatorRowProps {
  indicator: IndicatorEntry
  aiInsight?: string | null
}

const SCALE_TIERS = ['danger', 'weak', 'acceptable', 'strong', 'exceptional'] as const

export default function IndicatorRow({ indicator, aiInsight }: IndicatorRowProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const series = isSeries(indicator)
  const value = series ? indicator.latestValue : indicator.value
  const tier = series ? indicator.latestTier : indicator.tier
  const position = series ? indicator.latestPosition : indicator.position

  const cTier = canonicalTier(tier)
  const badge = TIER_BADGE[cTier]

  const dotPct =
    cTier === 'na' || typeof position !== 'number' || !Number.isFinite(position)
      ? null
      : (() => {
          const seg = 20
          const tIdx = TIER_INDEX[cTier]
          const clampedPos = Math.max(0, Math.min(1, position))
          const raw = tIdx * seg + clampedPos * seg
          return Math.max(1, Math.min(99, raw))
        })()

  const canExpand = !!aiInsight && aiInsight.trim().length > 0

  return (
    <div
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      onClick={() => canExpand && setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (!canExpand) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded((v) => !v)
        }
      }}
      className={`px-4 py-3 ${canExpand ? 'cursor-pointer select-none' : ''}`}
      style={{ minHeight: 44 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-gray-900">
            {t(`indicators.${indicator.key}`, indicator.key)}
          </div>
          <div className="text-[11px] text-gray-500 mt-[2px] leading-snug">
            {t(`indicatorDesc.${indicator.key}`, '')}
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="text-[15px] font-medium text-gray-900" dir="ltr">
            {formatIndicatorValue(indicator.key, value)}
          </div>
          <span
            className="inline-block text-[11px] font-medium mt-[3px]"
            style={{
              padding: '2px 8px',
              borderRadius: 20,
              backgroundColor: badge.bg,
              color: badge.fg,
            }}
          >
            {t(`scaleLabels.${cTier === 'na' ? 'danger' : cTier}`, cTier === 'na' ? '—' : cTier)}
          </span>
        </div>
      </div>

      <ScaleBar dotPct={dotPct} />

      {canExpand ? (
        <>
          <div className="text-[11px] text-gray-500 mt-2">
            {expanded ? t('indicatorRow.collapse') : t('indicatorRow.expand')}
          </div>
          <div
            className="grid transition-all duration-200 ease-out"
            style={{
              gridTemplateRows: expanded ? '1fr' : '0fr',
              marginTop: expanded ? 8 : 0,
            }}
          >
            <div className="overflow-hidden">
              <div
                className="rounded-md px-3 py-2.5 bg-gray-50 text-[12px] leading-[1.6] text-gray-900"
                style={{ borderInlineEnd: '3px solid #185FA5' }}
              >
                {aiInsight}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function ScaleBar({ dotPct }: { dotPct: number | null }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3" dir="ltr">
      <div
        className="relative w-full overflow-hidden"
        style={{ height: 3, borderRadius: 2 }}
      >
        <div className="absolute inset-0 flex">
          {SCALE_TIERS.map((tier) => (
            <div
              key={tier}
              className="h-full"
              style={{
                width: '20%',
                backgroundColor: TIER_COLORS[tier],
                opacity: 0.25,
              }}
            />
          ))}
        </div>
        {dotPct != null ? (
          <div
            aria-hidden
            className="absolute"
            style={{
              top: '50%',
              left: `${dotPct}%`,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#1A1A1A',
              border: '1.5px solid #FFFFFF',
              marginLeft: -4,
              marginTop: -4,
            }}
          />
        ) : null}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
        {SCALE_TIERS.map((tier) => (
          <span key={tier}>{t(`scaleLabels.${tier}`)}</span>
        ))}
      </div>
    </div>
  )
}
