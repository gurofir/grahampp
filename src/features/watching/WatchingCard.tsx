import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WatchStatus, WatchedItem } from '../../shared/lib/types'
import type { SituationRow } from '../discovery/hooks/useDiscovery'
import { currencySymbol } from '../../shared/lib/format'
import {
  WATCH_STATUS_ACCENT,
  computePriceDelta,
} from '../../shared/lib/watchStatus'
import { classifyArchetype } from '../../shared/lib/archetype'
import ArchetypeBadge from '../../shared/ui/ArchetypeBadge'

export interface WatchingCardProps {
  watched: WatchedItem
  liveRow: SituationRow | null
  status: WatchStatus
  onTap: () => void
  onUnwatch: () => void
}

// Single card on the Watching dashboard. Shows:
//   - status dot + badge
//   - archetype (from snapshot OR re-classified live)
//   - ticker + company
//   - "since analysis" price delta (uses addedPrice as anchor)
//   - per-archetype action line ("Watching for cycle-trough confirmation...")
//   - small unwatch action
export default function WatchingCard({
  watched,
  liveRow,
  status,
  onTap,
  onUnwatch,
}: WatchingCardProps) {
  const { t, i18n } = useTranslation()
  const accent = WATCH_STATUS_ACCENT[status]

  // Re-classify against live data if available so the archetype stays
  // current (e.g. cyclical_panic -> temporary_damage as price recovers).
  const archetype = useMemo(() => {
    if (liveRow) return classifyArchetype(liveRow)
    return watched.snapshot.archetype
  }, [liveRow, watched.snapshot.archetype])

  const company =
    liveRow?.company_name ??
    watched.snapshot.companyName ??
    watched.ticker
  const sector = liveRow?.sector ?? watched.snapshot.sector ?? null
  const currency =
    liveRow?.full_analysis?.currency ?? watched.snapshot.currency ?? 'USD'
  const sym = currencySymbol(currency)
  const currentPrice = liveRow?.current_price ?? null
  const delta = computePriceDelta(watched.addedPrice, currentPrice)
  const deltaPct = delta == null ? null : delta * 100
  const deltaColor =
    deltaPct == null
      ? '#5F5E5A'
      : deltaPct >= 0
        ? '#1F8A4D'
        : '#A32D2D'

  const actionLineKey = `archetype.actionLine.${archetype}`

  return (
    <article
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${accent.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onTap}
        className="w-full text-start"
        style={{
          padding: '14px',
          backgroundColor: accent.bg,
          cursor: 'pointer',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="shrink-0"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: accent.dot,
              }}
            />
            <span
              className="text-[10px] uppercase tracking-wider font-semibold truncate"
              style={{ color: accent.dot }}
            >
              {t(`watching.statusBadge.${status}`)}
            </span>
          </div>
          <ArchetypeBadge archetype={archetype} />
        </div>
      </button>

      <div style={{ padding: '14px' }}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[16px] font-semibold text-gray-900 tracking-tight"
                dir="ltr"
              >
                {watched.ticker}
              </span>
              <span
                className="text-[12px] text-[#7B7B79] truncate"
                dir="ltr"
              >
                {company}
              </span>
            </div>
            {sector ? (
              <div className="mt-0.5 text-[11px] text-[#9A9A95]" dir="ltr">
                {sector}
              </div>
            ) : null}
          </div>

          <div className="text-end shrink-0">
            {currentPrice != null ? (
              <div
                className="text-[14px] font-semibold text-gray-900 tabular-nums"
                dir="ltr"
              >
                {sym}
                {currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[#9A9A95]">—</div>
            )}
            {deltaPct != null ? (
              <div
                className="text-[11px] mt-0.5 tabular-nums font-medium"
                style={{ color: deltaColor }}
                dir="ltr"
              >
                {deltaPct >= 0 ? '+' : ''}
                {deltaPct.toFixed(1)}% {t('watching.sinceAnalysis')}
              </div>
            ) : null}
          </div>
        </div>

        <p
          className="mt-3 text-[12px] text-[#3F3F3D] leading-snug"
          dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
        >
          {t(actionLineKey)}
        </p>

        {!liveRow ? (
          <div className="mt-2 text-[11px] text-[#9A9A95] italic" dir="auto">
            {t('watching.noLongerInScan')}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUnwatch()
            }}
            className="text-[11px] text-[#7B7B79] hover:text-[#A32D2D]"
            style={{ cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </div>
    </article>
  )
}
