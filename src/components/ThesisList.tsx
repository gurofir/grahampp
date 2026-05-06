import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Thesis } from '../hooks/useTheses'
import { currencySymbol } from '../lib/format'

interface ThesisListProps {
  theses: Thesis[]
  onRemove: (ticker: string) => void
  onView: (thesis: Thesis) => void
  onUpdate: (ticker: string) => void
  onUpdateThesisText: (ticker: string, text: string) => void
}

export default function ThesisList({
  theses,
  onRemove,
  onView,
  onUpdate,
  onUpdateThesisText,
}: ThesisListProps) {
  const { t } = useTranslation()

  if (theses.length === 0) {
    return (
      <div className="text-center px-4 py-12 text-gray-500">
        <div className="text-[15px] mb-2">{t('watchlist.empty.title')}</div>
        <div className="text-[13px]">{t('watchlist.empty.subtitle')}</div>
      </div>
    )
  }

  return (
    <section>
      <header className="mb-5">
        <h2 className="text-[20px] font-medium text-gray-900 mb-1">
          {t('watchlist.title')}
        </h2>
        <p className="text-[12px] text-gray-500">
          {theses.length === 1
            ? t('watchlist.subtitleOne')
            : t('watchlist.subtitle', { count: theses.length })}
        </p>
      </header>

      <ul>
        {theses.map((th) => (
          <li key={th.ticker}>
            <ThesisCard
              thesis={th}
              onView={() => onView(th)}
              onUpdate={() => onUpdate(th.ticker)}
              onRemove={() => onRemove(th.ticker)}
              onSaveThesisText={(text) => onUpdateThesisText(th.ticker, text)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ThesisCardProps {
  thesis: Thesis
  onView: () => void
  onUpdate: () => void
  onRemove: () => void
  onSaveThesisText: (text: string) => void
}

type AlertKind = 'earnings' | 'price' | 'tier' | null

const ALERT_STYLES: Record<Exclude<AlertKind, null>, { bg: string; dot: string; fg: string }> = {
  earnings: { bg: '#FAEEDA', dot: '#BA7517', fg: '#854F0B' },
  price: { bg: '#E6F1FB', dot: '#185FA5', fg: '#185FA5' },
  tier: { bg: '#F1EFE8', dot: '#5F5E5A', fg: '#5F5E5A' },
}

function detectAlert(thesis: Thesis): AlertKind {
  if (
    thesis.lastEarningsDate &&
    thesis.earningsDateAtAnalysis &&
    thesis.lastEarningsDate !== thesis.earningsDateAtAnalysis
  ) {
    const lastTs = Date.parse(thesis.lastEarningsDate)
    const analyzedTs = Date.parse(thesis.analyzedAt)
    if (Number.isFinite(lastTs) && Number.isFinite(analyzedTs) && lastTs > analyzedTs) {
      return 'earnings'
    }
  }
  if (thesis.priceAtAnalysis > 0) {
    const pct = Math.abs(
      (thesis.currentPrice - thesis.priceAtAnalysis) / thesis.priceAtAnalysis,
    )
    if (pct > 0.15) return 'price'
  }
  const baseSnap = thesis.indicatorSnapshot
  const latestSnap = thesis.latestIndicatorSnapshot
  if (baseSnap && latestSnap) {
    for (const key of Object.keys(latestSnap)) {
      if (baseSnap[key] && latestSnap[key] && baseSnap[key] !== latestSnap[key]) {
        return 'tier'
      }
    }
  }
  return null
}

function ThesisCard({ thesis, onView, onUpdate, onRemove, onSaveThesisText }: ThesisCardProps) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(thesis.thesisText)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(thesis.thesisText)
  }, [editing, thesis.thesisText])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  const symbol = currencySymbol(thesis.currency)
  const pctSince = useMemo(() => {
    if (thesis.priceAtAnalysis <= 0) return 0
    return ((thesis.currentPrice - thesis.priceAtAnalysis) / thesis.priceAtAnalysis) * 100
  }, [thesis.currentPrice, thesis.priceAtAnalysis])

  const alert = detectAlert(thesis)
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(thesis.analyzedAt)) / 86400000),
  )
  const pctColor =
    pctSince > 0 ? '#3B6D11' : pctSince < 0 ? '#A32D2D' : '#5F5E5A'

  const commit = () => {
    const next = draft.trim()
    if (next !== thesis.thesisText.trim()) onSaveThesisText(next)
    setEditing(false)
  }

  return (
    <article
      className="bg-white"
      style={{
        border: '0.5px solid #E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: '0.75rem',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('actions.remove')}
        className="absolute text-gray-300 hover:text-gray-700 transition-colors"
        style={{
          top: 6,
          insetInlineStart: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          fontSize: 14,
          lineHeight: '24px',
          textAlign: 'center',
        }}
      >
        ×
      </button>

      <button
        type="button"
        onClick={onView}
        className="w-full text-start"
        style={{
          padding: '12px 14px',
          borderBottom: '0.5px solid #F1F1F1',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-medium text-gray-500 uppercase"
              style={{ letterSpacing: '0.08em' }}
              dir="ltr"
            >
              {thesis.ticker}
            </div>
            <div
              className="text-[15px] font-medium text-gray-900 truncate"
              style={{ marginTop: 2 }}
            >
              {thesis.companyName}
            </div>
          </div>
          <div className="text-end shrink-0" dir="ltr">
            <div className="text-[18px] font-medium text-gray-900">
              {symbol}
              {thesis.currentPrice.toFixed(2)}
            </div>
            <div
              className="text-[12px] font-medium"
              style={{ color: pctColor, marginTop: 2 }}
            >
              {pctSince >= 0 ? '+' : ''}
              {pctSince.toFixed(1)}%
              <span className="ms-1 text-gray-500" style={{ fontWeight: 400 }} dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
                {t('watchlist.sinceAnalysis')}
              </span>
            </div>
          </div>
        </div>

        {alert ? (
          <div
            className="flex items-center gap-1.5"
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              marginTop: 8,
              backgroundColor: ALERT_STYLES[alert].bg,
              color: ALERT_STYLES[alert].fg,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: ALERT_STYLES[alert].dot,
              }}
            />
            <span>{t(`watchlist.alerts.${alert}`)}</span>
          </div>
        ) : null}
      </button>

      <div
        style={{
          padding: '10px 14px',
          borderBottom: '0.5px solid #F1F1F1',
        }}
        onClick={(e) => {
          if (!editing) {
            e.stopPropagation()
            setEditing(true)
          }
        }}
      >
        <div
          className="text-[11px] text-gray-500"
          style={{ marginBottom: 4 }}
        >
          {t('watchlist.thesisLabel')}
        </div>
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(thesis.thesisText)
                setEditing(false)
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                commit()
              }
            }}
            rows={3}
            className="w-full text-[13px] text-gray-900 bg-transparent resize-none focus:outline-none"
            style={{ lineHeight: 1.5, fontStyle: 'italic' }}
            placeholder={t('watchlist.thesisPlaceholder') ?? ''}
          />
        ) : (
          <p
            className="text-[13px] cursor-text"
            style={{
              lineHeight: 1.5,
              fontStyle: 'italic',
              color: thesis.thesisText ? '#171717' : '#9CA3AF',
              whiteSpace: 'pre-wrap',
            }}
          >
            {thesis.thesisText || t('watchlist.thesisEmpty')}
          </p>
        )}
      </div>

      <div
        className="flex items-center justify-between"
        style={{ padding: '10px 14px' }}
      >
        <span className="text-[11px] text-gray-500">
          {days === 0
            ? t('watchlist.updatedToday')
            : days === 1
              ? t('watchlist.updatedDayAgo')
              : t('watchlist.updatedDaysAgo', { days })}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUpdate()
          }}
          className="text-[12px] font-medium"
          style={{ color: '#185FA5' }}
        >
          {t('watchlist.updateAnalysis')} ←
        </button>
      </div>
    </article>
  )
}
