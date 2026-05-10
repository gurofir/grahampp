import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SetupType } from '../lib/types'
import type { DiscoveryData, SituationRow } from '../hooks/useDiscovery'
import { currencySymbol } from '../lib/format'

interface DiscoveryFeedProps {
  data: DiscoveryData
  loading: boolean
  onSituationTap: (situation: SituationRow) => void
}

// Number of situations shown before the "show more" accordion expands.
// Keep low so the home screen stays scannable; the rest are one tap away.
const DEFAULT_VISIBLE = 3

const SETUP_BADGES: Record<
  SetupType,
  { bg: string; fg: string; border: string }
> = {
  rare_value: { bg: '#E6F1FB', fg: '#0C447C', border: '#C7DFF3' },
  consensus_buy: { bg: '#EAF3DE', fg: '#27500A', border: '#CCE3AB' },
  consensus_avoid: { bg: '#FCEBEB', fg: '#A32D2D', border: '#F4C8C8' },
  market_leading: { bg: '#FAEEDA', fg: '#854F0B', border: '#EDD3A7' },
  neutral: { bg: '#F4F4F0', fg: '#5F5E5A', border: '#E2E1DA' },
}

const DECISION_COLORS: Record<string, { fg: string; bg: string }> = {
  BUY: { fg: '#27500A', bg: '#EAF3DE' },
  WAIT: { fg: '#854F0B', bg: '#FAEEDA' },
  AVOID: { fg: '#A32D2D', bg: '#FCEBEB' },
}

function formatLastScan(t: ReturnType<typeof useTranslation>['t'], iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return t('discovery.lastScanJustNow')
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('discovery.lastScanJustNow')
  if (minutes < 60) return t('discovery.lastScanMinutes', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('discovery.lastScanHours', { hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return t('discovery.lastScanYesterday')
  return t('discovery.lastScanDays', { days })
}

export default function DiscoveryFeed({
  data,
  loading,
  onSituationTap,
}: DiscoveryFeedProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const situations = data.situations
  const total = situations.length
  const visibleSituations = expanded
    ? situations
    : situations.slice(0, DEFAULT_VISIBLE)
  const remaining = Math.max(0, total - DEFAULT_VISIBLE)
  const lastScanText = formatLastScan(t, data.scannedAt)

  const headerCount = total === 1
    ? t('discovery.foundOne')
    : t('discovery.foundMany', { count: total })

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 text-[13px] text-gray-500 text-center">
        {t('discovery.loading')}
      </section>
    )
  }

  if (!data.scannedAt && situations.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 text-[13px] text-gray-500 text-center">
        {t('discovery.scanPending')}
      </section>
    )
  }

  if (situations.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-1 text-center">
        <div className="text-[13px] text-gray-500">{t('discovery.noSituations')}</div>
        {lastScanText ? (
          <div className="text-[11px] text-gray-400">{lastScanText}</div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <header className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="text-[12px] uppercase tracking-wide text-gray-400">
          {t('discovery.headerTitle')}
        </div>
        <h2 className="mt-1 text-[18px] font-semibold text-gray-900 leading-snug">
          {headerCount}
        </h2>
        <p className="mt-1 text-[12px] text-gray-500">
          {t('discovery.scannedSummary', { universe: data.universeSize || '—' })}
        </p>
        {lastScanText ? (
          <p className="mt-2 text-[11px] text-gray-400">{lastScanText}</p>
        ) : null}
      </header>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <h3 className="text-[13px] font-medium text-gray-700 px-4 pt-4">
          {t('discovery.interestingSituations')}
        </h3>
        <ul className="mt-2 divide-y divide-gray-100">
          {visibleSituations.map((s) => (
            <li key={s.id}>
              <SituationRowItem
                situation={s}
                onTap={() => onSituationTap(s)}
              />
            </li>
          ))}
        </ul>
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-center text-[13px] text-gray-600 hover:text-gray-900
                       py-3 border-t border-gray-100 transition-colors"
          >
            {expanded
              ? t('discovery.showLess')
              : t('discovery.showMore', { count: remaining })}
          </button>
        ) : null}
      </div>
    </section>
  )
}

interface SituationRowItemProps {
  situation: SituationRow
  onTap: () => void
}

function SituationRowItem({ situation: s, onTap }: SituationRowItemProps) {
  const { t } = useTranslation()
  const badge = SETUP_BADGES[s.setup_type] || SETUP_BADGES.neutral
  const grahamColor = DECISION_COLORS[s.graham_decision] || DECISION_COLORS.WAIT
  const marketColor = DECISION_COLORS[s.market_decision] || DECISION_COLORS.WAIT
  const sym = currencySymbol(s.full_analysis?.currency || 'USD')

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-start px-4 py-3 hover:bg-gray-50 transition-colors
                 focus:outline-none focus:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap"
              style={{ background: badge.bg, color: badge.fg, borderColor: badge.border }}
            >
              {t(`setupBadge.${s.setup_type}`, '·')}
            </span>
            <span
              className="text-[11px] text-gray-500 truncate"
              title={t(`situationTypes.${s.situation_type}`, '')}
            >
              {t(`situationTypes.${s.situation_type}`, '')}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-gray-900 truncate" dir="ltr">
              {s.company_name || s.ticker}
            </span>
            <span className="text-[11px] text-gray-400 shrink-0" dir="ltr">
              {s.ticker}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: grahamColor.bg, color: grahamColor.fg }}
            >
              Graham · {s.graham_decision}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: marketColor.bg, color: marketColor.fg }}
            >
              Market · {s.market_decision}
            </span>
          </div>
          {s.insight ? (
            <p
              className="mt-1.5 text-[12px] text-gray-600 leading-snug"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {s.insight}
            </p>
          ) : null}
        </div>
        {s.current_price != null ? (
          <div className="text-end shrink-0">
            <div className="text-[13px] font-medium text-gray-900" dir="ltr">
              {sym}
              {s.current_price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            {typeof s.daily_change_pct === 'number' && Number.isFinite(s.daily_change_pct) ? (
              <div
                className="text-[11px] mt-0.5"
                style={{
                  color: s.daily_change_pct >= 0 ? '#27500A' : '#A32D2D',
                }}
                dir="ltr"
              >
                {s.daily_change_pct >= 0 ? '+' : ''}
                {s.daily_change_pct.toFixed(2)}%
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  )
}
