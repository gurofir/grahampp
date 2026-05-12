import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  Decision,
  Confidence,
  FragilityBand,
  FragilityFinding,
  RiskDimension,
} from '../../shared/lib/types'
import type { DiscoveryData, SituationRow } from './hooks/useDiscovery'
import { currencySymbol } from '../../shared/lib/format'

interface DiscoveryFeedProps {
  data: DiscoveryData
  loading: boolean
  onSituationTap: (situation: SituationRow) => void
}

// How many rows are shown collapsed. The list is meant to be glanceable;
// "show more" expands the rest in place.
const DEFAULT_VISIBLE = 5

// Visual quality bands for the colored left border. Bands map to the
// interestingScore produced by the backend (0..130). Top tier feels alive,
// middle tier is calm, bottom tier is muted but still visible.
//
// We deliberately do NOT use red here -- AVOIDs are filtered out upstream
// and unstable BUYs sink below MIN_INTERESTING. Anything that reaches the
// list is at minimum "interesting", just at varying conviction levels.
function qualityBandFor(score: number): {
  border: string
  label: string
  badge: { bg: string; fg: string }
} {
  if (score >= 90) {
    return {
      border: '#1F8A4D', // emerald
      label: 'highConviction',
      badge: { bg: '#E5F4EA', fg: '#1F8A4D' },
    }
  }
  if (score >= 70) {
    return {
      border: '#3B82A6', // teal
      label: 'strong',
      badge: { bg: '#E1EFF6', fg: '#226186' },
    }
  }
  return {
    border: '#9AA0A6', // neutral gray
    label: 'watching',
    badge: { bg: '#F1F2F4', fg: '#5F6368' },
  }
}

// Decision pill colors. BUY = green, WAIT = amber. AVOID never reaches us
// in the feed but we map it defensively to red.
const DECISION_COLORS: Record<Decision, { fg: string; bg: string }> = {
  BUY: { fg: '#1F6F2A', bg: '#DEF0E2' },
  WAIT: { fg: '#7D5400', bg: '#FBEAC9' },
  AVOID: { fg: '#9A2A2A', bg: '#FAD8D8' },
}

const FRAGILITY_COLORS: Record<FragilityBand, { fg: string; bg: string; dot: string }> = {
  robust: { fg: '#1F6F2A', bg: '#E5F4EA', dot: '#1F8A4D' },
  moderate: { fg: '#7D5400', bg: '#FBEAC9', dot: '#C68910' },
  fragile: { fg: '#9A2A2A', bg: '#FAD8D8', dot: '#C24747' },
  unstable: { fg: '#5C0F0F', bg: '#F0BFBF', dot: '#8B1A1A' },
}

// Tailwind set must mirror the backend (alignment.derivePrimaryFinding).
const TAILWIND_SEVERITIES = new Set(['tailwind', 'strong_tailwind'])

function topFinding(findings: FragilityFinding[] | undefined, decision: Decision): FragilityFinding | null {
  if (!findings || findings.length === 0) return null
  const wantTailwind = decision === 'BUY'
  const matching = findings.filter((f) =>
    wantTailwind ? TAILWIND_SEVERITIES.has(f.severity) : !TAILWIND_SEVERITIES.has(f.severity),
  )
  return (matching[0] ?? findings[0]) || null
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
  const visibleSituations = expanded ? situations : situations.slice(0, DEFAULT_VISIBLE)
  const remaining = Math.max(0, total - DEFAULT_VISIBLE)
  const lastScanText = formatLastScan(t, data.scannedAt)

  // Quick decision counts so the header can show "5 BUYs · 8 watching" --
  // gives the eye a sense of what the feed is made of before scanning rows.
  const counts = useMemo(() => {
    let buys = 0
    let waits = 0
    for (const s of situations) {
      if (s.graham_decision === 'BUY') buys += 1
      else if (s.graham_decision === 'WAIT') waits += 1
    }
    return { buys, waits }
  }, [situations])

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
        {lastScanText ? <div className="text-[11px] text-gray-400">{lastScanText}</div> : null}
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <header className="rounded-2xl border border-gray-100 bg-linear-to-br from-white to-gray-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">
              {t('discovery.headerTitle')}
            </div>
            <h2 className="mt-1 text-[20px] font-semibold text-gray-900 leading-tight">
              {total === 1
                ? t('discovery.foundOne')
                : t('discovery.foundMany', { count: total })}
            </h2>
          </div>
          {lastScanText ? (
            <div className="shrink-0 text-end">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">
                {t('discovery.scannedLabel')}
              </div>
              <div className="text-[12px] text-gray-600 mt-0.5">{lastScanText}</div>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {counts.buys > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: DECISION_COLORS.BUY.bg, color: DECISION_COLORS.BUY.fg }}
            >
              {counts.buys} {t('discovery.countBuys')}
            </span>
          ) : null}
          {counts.waits > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: DECISION_COLORS.WAIT.bg, color: DECISION_COLORS.WAIT.fg }}
            >
              {counts.waits} {t('discovery.countWatching')}
            </span>
          ) : null}
          <span className="text-[11px] text-gray-400 ms-auto">
            {t('discovery.universeContext', { universe: data.universeSize || '—' })}
          </span>
        </div>
      </header>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {visibleSituations.map((s, idx) => (
            <li key={s.id}>
              <SituationRowItem
                situation={s}
                rank={idx + 1}
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
            {expanded ? t('discovery.showLess') : t('discovery.showMore', { count: remaining })}
          </button>
        ) : null}
      </div>
    </section>
  )
}

interface SituationRowItemProps {
  situation: SituationRow
  rank: number
  onTap: () => void
}

function SituationRowItem({ situation: s, rank, onTap }: SituationRowItemProps) {
  const { t } = useTranslation()
  const sym = currencySymbol(s.full_analysis?.currency || 'USD')
  const grahamFinal = s.full_analysis?.dualEngine?.graham
  const fragility = (grahamFinal?.fragilityBand as FragilityBand | undefined) ?? null
  const finding = topFinding(grahamFinal?.findings, s.graham_decision)
  const isTailwind = finding ? TAILWIND_SEVERITIES.has(finding.severity) : false
  const findingChipColor = isTailwind
    ? { fg: '#1F6F2A', bg: '#E5F4EA' }
    : finding?.severity === 'severe'
      ? { fg: '#9A2A2A', bg: '#FAD8D8' }
      : { fg: '#7D5400', bg: '#FBEAC9' }

  const quality = qualityBandFor(s.score ?? 0)
  const grahamDecisionColor = DECISION_COLORS[s.graham_decision] || DECISION_COLORS.WAIT
  const confidence = (s.graham_confidence as Confidence | undefined) ?? null

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-start hover:bg-gray-50 transition-colors
                 focus:outline-none focus:bg-gray-50 group"
    >
      <div className="flex">
        {/* Quality border on the leading edge -- visually conveys ranking
            without requiring the user to read the score number. */}
        <div
          className="w-1 shrink-0"
          style={{ background: quality.border }}
          aria-hidden
        />
        <div className="flex-1 min-w-0 px-4 py-3.5">
          {/* Top row: rank + ticker + company; right-aligned price */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[10px] font-medium text-gray-400 tabular-nums"
                  aria-hidden
                >
                  #{rank}
                </span>
                <span className="text-[17px] font-semibold text-gray-900 tracking-tight" dir="ltr">
                  {s.ticker}
                </span>
                <span className="text-[12px] text-gray-500 truncate" dir="ltr">
                  {s.company_name || s.ticker}
                </span>
              </div>
              {s.sector ? (
                <div className="mt-0.5 text-[11px] text-gray-400" dir="ltr">
                  {s.sector}
                </div>
              ) : null}
            </div>
            {s.current_price != null ? (
              <div className="text-end shrink-0">
                <div className="text-[16px] font-semibold text-gray-900 tabular-nums" dir="ltr">
                  {sym}
                  {s.current_price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                {typeof s.daily_change_pct === 'number' && Number.isFinite(s.daily_change_pct) ? (
                  <div
                    className="text-[12px] mt-0.5 tabular-nums font-medium"
                    style={{ color: s.daily_change_pct >= 0 ? '#1F8A4D' : '#A32D2D' }}
                    dir="ltr"
                  >
                    {s.daily_change_pct >= 0 ? '+' : ''}
                    {s.daily_change_pct.toFixed(2)}%
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Chip row: decision + fragility + top finding */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide"
              style={{ background: grahamDecisionColor.bg, color: grahamDecisionColor.fg }}
              dir="ltr"
            >
              {s.graham_decision}
            </span>
            {confidence ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium text-gray-500 bg-gray-100">
                {t(`discovery.confidence.${confidence.toLowerCase()}`, confidence)}
              </span>
            ) : null}
            {fragility ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                style={{
                  background: FRAGILITY_COLORS[fragility].bg,
                  color: FRAGILITY_COLORS[fragility].fg,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: FRAGILITY_COLORS[fragility].dot }}
                />
                {t(`reality.fragility.${fragility}`, fragility)}
              </span>
            ) : null}
            {finding ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                style={{ background: findingChipColor.bg, color: findingChipColor.fg }}
                title={finding.evidence}
              >
                <span aria-hidden>{isTailwind ? '↗' : '!'}</span>
                {t(
                  `reality.dim.${finding.dimension as RiskDimension}`,
                  finding.dimension.replace(/_/g, ' '),
                )}
              </span>
            ) : null}
          </div>

          {/* Inline analytical thesis (Graham's actual one-liner with numbers) */}
          {s.insight ? (
            <p
              className="mt-2 text-[13px] text-gray-700 leading-snug"
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
      </div>
    </button>
  )
}
