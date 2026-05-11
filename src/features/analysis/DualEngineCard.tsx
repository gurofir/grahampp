import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Confidence, DualEngine, SetupType } from '../../shared/lib/types'
import { currencySymbol } from '../../shared/lib/format'
import EnginePanel from './EnginePanel'
import PlainSummaryBlock from './PlainSummaryBlock'

interface HeaderInfo {
  ticker: string
  companyName: string
  sector?: string | null
  country?: string | null
  currentPrice: number
  currency: string
  dailyChangePct?: number | null
  low52?: number | null
  high52?: number | null
}

interface DualEngineCardProps {
  data: DualEngine | null
  header: HeaderInfo
  loading?: boolean
  unavailable?: boolean
  onCtaClick?: () => void
  ctaTaken?: boolean
}

interface BadgeStyle {
  bg: string
  fg: string
  icon: string
  show: boolean
}

const BADGE_STYLES: Record<SetupType, BadgeStyle> = {
  rare_value: { bg: '#E6F1FB', fg: '#0C447C', icon: '⚡', show: true },
  consensus_buy: { bg: '#EAF3DE', fg: '#27500A', icon: '✓', show: true },
  consensus_avoid: { bg: '#FCEBEB', fg: '#A32D2D', icon: '⚠', show: true },
  market_leading: { bg: '#FAEEDA', fg: '#854F0B', icon: '📈', show: true },
  neutral: { bg: '#F4F4F0', fg: '#5F5E5A', icon: '·', show: false },
}

const CONFIDENCE_RANK: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 }

function HeaderHero({
  header,
  insight,
  badge,
  badgeText,
}: {
  header: HeaderInfo
  insight?: string
  badge: BadgeStyle
  badgeText: string
}) {
  const { t } = useTranslation()
  const symbol = currencySymbol(header.currency)
  const subtitleParts = [header.ticker, header.sector, header.country].filter(
    (s): s is string => !!s && String(s).trim().length > 0,
  )
  const subtitle = subtitleParts.join(' · ')
  const change =
    typeof header.dailyChangePct === 'number' && Number.isFinite(header.dailyChangePct)
      ? header.dailyChangePct
      : null
  const changeColor =
    change == null ? '#5F5E5A' : change >= 0 ? '#3B6D11' : '#A32D2D'
  const changeText =
    change == null ? null : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`

  const rangePct = (() => {
    const { currentPrice, low52, high52 } = header
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
    <div style={{ backgroundColor: '#E6F1FB' }}>
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        {badge.show ? (
          <div
            className="inline-flex items-center"
            style={{
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 500,
              backgroundColor: badge.bg,
              color: badge.fg,
            }}
          >
            <span aria-hidden>{badge.icon}</span>
            <span>{badgeText}</span>
          </div>
        ) : null}
        {insight ? (
          <p
            className="text-[14px] font-medium"
            style={{ color: '#0C447C', lineHeight: 1.55 }}
          >
            {insight}
          </p>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1 text-[17px] font-medium text-gray-900 truncate">
            {header.companyName}
          </div>
          <div
            className="shrink-0 text-[24px] font-medium text-gray-900 leading-none"
            dir="ltr"
          >
            {symbol}
            {Number.isFinite(header.currentPrice)
              ? header.currentPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 mt-1">
          {subtitle ? (
            <div
              className="min-w-0 flex-1 text-[11px] text-[#185FA5] truncate"
              dir="ltr"
            >
              {subtitle}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {changeText ? (
            <div
              className="shrink-0 text-[12px] font-medium"
              style={{ color: changeColor }}
              dir="ltr"
            >
              {changeText} {t('header.todaySuffix', 'היום')}
            </div>
          ) : null}
        </div>
      </div>

      {rangePct != null ? (
        <div className="px-4 pt-2 pb-3" dir="ltr">
          <div
            className="text-[11px] mb-1.5 text-end"
            style={{ color: '#185FA5' }}
            dir="auto"
          >
            {t('header.range52w')}
          </div>
          <div
            className="relative"
            style={{ height: 4, backgroundColor: '#B5D4F4', borderRadius: 2 }}
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
                backgroundColor: '#185FA5',
                border: '2px solid #E6F1FB',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px]" style={{ color: '#185FA5' }}>
              {symbol}
              {typeof header.low52 === 'number'
                ? header.low52.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : '—'}
            </span>
            <span className="text-[11px]" style={{ color: '#185FA5' }}>
              {symbol}
              {typeof header.high52 === 'number'
                ? header.high52.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : '—'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DualEngineCardSkeleton({ header }: { header: HeaderInfo }) {
  const neutralBadge = BADGE_STYLES.neutral
  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ border: '0.5px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
      aria-busy
    >
      <HeaderHero header={header} badge={neutralBadge} badgeText="" />
      <div className="p-3 grid grid-cols-2 gap-3" style={{ borderTop: '0.5px solid #E5E7EB' }}>
        <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      </div>
      <div className="p-4 space-y-2" style={{ borderTop: '0.5px solid #E5E7EB' }}>
        <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
        <div className="h-4 rounded bg-gray-100 animate-pulse w-3/4" />
        <div className="h-12 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    </section>
  )
}

function DualEngineCardUnavailable({ header }: { header: HeaderInfo }) {
  const { t } = useTranslation()
  const neutralBadge = BADGE_STYLES.neutral
  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ border: '0.5px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      <HeaderHero header={header} badge={neutralBadge} badgeText="" />
      <div
        className="px-4 py-5 text-center"
        style={{ borderTop: '0.5px solid #E5E7EB' }}
      >
        <div className="text-[13px] text-[#A32D2D] font-medium">
          {t('aiSection.unavailable', 'AI interpretation is currently unavailable.')}
        </div>
      </div>
    </section>
  )
}

export default function DualEngineCard({
  data,
  header,
  loading,
  unavailable,
  onCtaClick,
  ctaTaken,
}: DualEngineCardProps) {
  const { t } = useTranslation()
  const [taken, setTaken] = useState(!!ctaTaken)

  if (loading) return <DualEngineCardSkeleton header={header} />
  if (!data || unavailable) return <DualEngineCardUnavailable header={header} />

  const badge = BADGE_STYLES[data.setupType] ?? BADGE_STYLES.neutral

  // Decide which engine "leads" visually:
  // 1. If only one says BUY → BUY leads.
  // 2. Otherwise the engine with higher confidence leads.
  // 3. If still tied, Graham leads (the framework's voice of record).
  const grahamRank = CONFIDENCE_RANK[data.graham.confidence] ?? 0
  const marketRank = CONFIDENCE_RANK[data.market.confidence] ?? 0
  const grahamLeads = (() => {
    if (data.graham.decision === 'BUY' && data.market.decision !== 'BUY') return true
    if (data.market.decision === 'BUY' && data.graham.decision !== 'BUY') return false
    if (grahamRank !== marketRank) return grahamRank >= marketRank
    return true
  })()

  const handleCta = () => {
    if (taken) return
    setTaken(true)
    onCtaClick?.()
  }

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ border: '0.5px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      <HeaderHero
        header={header}
        insight={data.insight}
        badge={badge}
        badgeText={t(`dualEngine.setup.${data.setupType}`)}
      />

      <div className="px-4 py-3" style={{ borderTop: '0.5px solid #E5E7EB' }}>
        {data.graham.plainSummary ? (
          <PlainSummaryBlock
            summary={data.graham.plainSummary}
            decision={data.graham.decision}
          />
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              {t('dualEngine.suggestedAction')}
            </div>
            <div className="text-[15px] font-medium text-gray-900" style={{ lineHeight: 1.5 }}>
              {data.suggestedAction.text}
            </div>
            {data.suggestedAction.sub ? (
              <div className="text-[12px] text-gray-500 mt-0.5" style={{ lineHeight: 1.5 }}>
                {data.suggestedAction.sub}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        className="px-4 pt-3 pb-1"
        style={{ borderTop: '0.5px solid #E5E7EB' }}
      >
        <div
          className="text-[10px] uppercase tracking-wider text-gray-500"
          dir="auto"
        >
          {t('dualEngine.analystEvidence', 'ראיות אנליסטיות')}
        </div>
      </div>

      <div className="px-3 pb-3 grid grid-cols-2 gap-3">
        <EnginePanel
          name={t('dualEngine.engineNames.graham')}
          engine={data.graham}
          size={grahamLeads ? 'lead' : 'secondary'}
        />
        <EnginePanel
          name={t('dualEngine.engineNames.market')}
          engine={data.market}
          size={grahamLeads ? 'secondary' : 'lead'}
        />
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #E5E7EB' }}>
        <button
          type="button"
          onClick={handleCta}
          disabled={taken}
          className="w-full text-center transition-colors"
          style={{
            backgroundColor: taken ? '#3B6D11' : '#185FA5',
            color: '#E6F1FB',
            padding: '14px',
            borderRadius: 8,
            opacity: taken ? 0.95 : 1,
          }}
        >
          <div className="text-[14px] font-medium">
            {taken ? t('dualEngine.ctaTaken') : data.ctaLabel}
          </div>
          {!taken && data.ctaSub ? (
            <div className="text-[11px] mt-0.5" style={{ opacity: 0.75 }}>
              {data.ctaSub}
            </div>
          ) : null}
        </button>
      </div>
    </section>
  )
}
