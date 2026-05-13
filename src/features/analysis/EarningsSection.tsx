import { useTranslation } from 'react-i18next'
import type { Analysis, EarningsQuarter } from '../../shared/lib/types'
import { formatDate } from '../../shared/lib/format'

export interface EarningsSectionProps {
  analysis: Analysis
}

// Body of the "Earnings" accordion on the stock-detail page. Renders, in
// order:
//
//   1. Last reported quarter -- date, EPS actual vs estimate, surprise %,
//      and a sentiment chip (BEAT / IN LINE / MISS) tinted by surprise sign.
//   2. 4-quarter mini-table -- recent earnings track record at a glance.
//   3. Next earnings date -- when known and in the future.
//
// Falls back to a calm "no earnings on file" message for older cached
// rows that pre-date the earningsHistory field.
export default function EarningsSection({ analysis }: EarningsSectionProps) {
  const { t, i18n } = useTranslation()
  const history = analysis.earningsHistory ?? []
  const last = history[0] ?? null
  const next = formatNextEarningsDate(analysis.earningsDate, i18n.language)

  if (!last) {
    return (
      <div className="px-4 py-4 text-[12px] text-[#7B7B79]">
        <p>{t('earnings.noData')}</p>
        {next ? (
          <p className="mt-2">
            <span className="font-medium text-[#3F3F3D]">
              {t('earnings.next')}:
            </span>{' '}
            <span className="tabular-nums" dir="ltr">
              {next}
            </span>
          </p>
        ) : null}
      </div>
    )
  }

  const beatCount = history.filter(
    (q) => typeof q.surprisePct === 'number' && q.surprisePct > 0,
  ).length

  return (
    <div className="px-4 py-4 space-y-4">
      <LastQuarterBlock quarter={last} locale={i18n.language} />

      {history.length > 1 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#9A9A95] font-semibold mb-2">
            {t('earnings.recentQuarters')}
          </div>
          <div className="rounded-lg border border-[#E0DFDB] overflow-hidden">
            <table className="w-full text-[12px]" dir="ltr">
              <thead>
                <tr className="bg-[#FAF9F5] text-[#7B7B79]">
                  <th className="text-start px-3 py-1.5 font-medium">
                    {t('earnings.quarter')}
                  </th>
                  <th className="text-end px-3 py-1.5 font-medium">
                    {t('earnings.actual')}
                  </th>
                  <th className="text-end px-3 py-1.5 font-medium">
                    {t('earnings.estimate')}
                  </th>
                  <th className="text-end px-3 py-1.5 font-medium">
                    {t('earnings.surprise')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((q, i) => (
                  <tr
                    key={q.date + (q.period ?? '')}
                    style={{
                      borderTop:
                        i === 0 ? 'none' : '0.5px solid #F1EFE8',
                    }}
                  >
                    <td className="px-3 py-1.5 text-[#3F3F3D] tabular-nums">
                      {formatQuarterLabel(q, i18n.language)}
                    </td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-[#3F3F3D]">
                      {fmtEps(q.epsActual)}
                    </td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-[#7B7B79]">
                      {fmtEps(q.epsEstimate)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-end tabular-nums font-medium"
                      style={{ color: surpriseColor(q.surprisePct) }}
                    >
                      {fmtPct(q.surprisePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-[#7B7B79]">
            {t('earnings.beatRecord', {
              beat: beatCount,
              total: history.length,
            })}
          </p>
        </div>
      ) : null}

      {next ? (
        <div className="text-[12px] text-[#3F3F3D]">
          <span className="font-medium">{t('earnings.next')}:</span>{' '}
          <span className="tabular-nums" dir="ltr">
            {next}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function LastQuarterBlock({
  quarter,
  locale,
}: {
  quarter: EarningsQuarter
  locale: string
}) {
  const { t } = useTranslation()
  const sentiment = surpriseSentiment(quarter.surprisePct)
  const palette = SENTIMENT_PALETTE[sentiment]
  const dateLabel = formatDate(quarter.date, locale) ?? '—'

  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: palette.bg,
        border: `0.5px solid ${palette.ring}33`,
        padding: '12px 14px',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-wider text-[#7B7B79] font-semibold">
          {t('earnings.lastReport')}
        </div>
        <span
          className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: palette.chipBg,
            color: palette.chipFg,
            padding: '3px 9px',
            borderRadius: 999,
            letterSpacing: '0.06em',
          }}
        >
          {t(`earnings.sentiment.${sentiment}`)}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-[13px] text-[#3F3F3D] tabular-nums" dir="ltr">
          {dateLabel}
        </div>
        <div
          className="text-[20px] font-semibold tabular-nums"
          style={{ color: palette.headlineFg }}
          dir="ltr"
        >
          {fmtPct(quarter.surprisePct, true)}
        </div>
      </div>

      <div
        className="mt-2 grid grid-cols-2 gap-2 text-[12px] tabular-nums"
        dir="ltr"
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#7B7B79] font-semibold">
            {t('earnings.actual')}
          </div>
          <div className="text-[14px] font-medium text-[#3F3F3D]">
            {fmtEps(quarter.epsActual)}
          </div>
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wider text-[#7B7B79] font-semibold">
            {t('earnings.estimate')}
          </div>
          <div className="text-[14px] font-medium text-[#3F3F3D]">
            {fmtEps(quarter.epsEstimate)}
          </div>
        </div>
      </div>
    </div>
  )
}

type SentimentKey = 'beat' | 'miss' | 'inLine' | 'unknown'

const SENTIMENT_PALETTE: Record<
  SentimentKey,
  {
    bg: string
    ring: string
    chipBg: string
    chipFg: string
    headlineFg: string
  }
> = {
  beat: {
    bg: '#EAF3DE',
    ring: '#3B6D11',
    chipBg: '#3B6D11',
    chipFg: '#FFFFFF',
    headlineFg: '#3B6D11',
  },
  miss: {
    bg: '#FCEBEB',
    ring: '#A32D2D',
    chipBg: '#A32D2D',
    chipFg: '#FFFFFF',
    headlineFg: '#A32D2D',
  },
  inLine: {
    bg: '#F2EBD9',
    ring: '#6F5A1F',
    chipBg: '#6F5A1F',
    chipFg: '#FFFFFF',
    headlineFg: '#6F5A1F',
  },
  unknown: {
    bg: '#F1EFE8',
    ring: '#7B7B79',
    chipBg: '#7B7B79',
    chipFg: '#FFFFFF',
    headlineFg: '#3F3F3D',
  },
}

function surpriseSentiment(pct: number | null | undefined): SentimentKey {
  if (pct == null || !Number.isFinite(pct)) return 'unknown'
  // Allow ±1% to count as in-line so micro-rounding doesn't read as a beat.
  if (pct > 1) return 'beat'
  if (pct < -1) return 'miss'
  return 'inLine'
}

function surpriseColor(pct: number | null | undefined): string {
  const s = surpriseSentiment(pct)
  if (s === 'beat') return '#3B6D11'
  if (s === 'miss') return '#A32D2D'
  if (s === 'inLine') return '#6F5A1F'
  return '#7B7B79'
}

function fmtEps(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

function fmtPct(v: number | null | undefined, withSign = false): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${withSign ? sign : sign}${v.toFixed(1)}%`
}

function formatQuarterLabel(q: EarningsQuarter, locale: string): string {
  const d = formatDate(q.date, locale)
  return d ?? q.period ?? '—'
}

// Show the next-earnings date only when it's in the future. The
// `earningsDate` from Yahoo is occasionally a stale past date (the last
// report) -- silently dropping past dates avoids pretending we know when
// the next call will happen.
function formatNextEarningsDate(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t < Date.now() - 86_400_000) return null
  return formatDate(iso, locale)
}
