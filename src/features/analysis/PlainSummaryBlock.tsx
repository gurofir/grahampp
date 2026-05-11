import { useTranslation } from 'react-i18next'
import type { Decision, PlainSummary } from '../../shared/lib/types'

interface PlainSummaryBlockProps {
  summary: PlainSummary
  decision: Decision
}

const ACCENT: Record<Decision, { dot: string; chipBg: string; chipFg: string }> = {
  BUY: { dot: '#3B6D11', chipBg: '#EAF3DE', chipFg: '#27500A' },
  WAIT: { dot: '#854F0B', chipBg: '#FAEEDA', chipFg: '#854F0B' },
  AVOID: { dot: '#A32D2D', chipBg: '#FCEBEB', chipFg: '#A32D2D' },
}

export default function PlainSummaryBlock({ summary, decision }: PlainSummaryBlockProps) {
  const { t } = useTranslation()
  const accent = ACCENT[decision]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">
        {t('plain.header', 'בשפה פשוטה')}
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          aria-hidden
          className="shrink-0"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: accent.dot,
            display: 'inline-block',
            transform: 'translateY(-1px)',
          }}
        />
        <span
          className="text-[20px] font-semibold text-gray-900"
          style={{ lineHeight: 1.25 }}
          dir="auto"
        >
          {summary.verdict}
        </span>
      </div>

      <p
        className="text-[14px] font-medium text-gray-900"
        style={{ lineHeight: 1.45 }}
        dir="auto"
      >
        {summary.headline}
      </p>

      <p
        className="text-[13px] text-gray-700"
        style={{ lineHeight: 1.6 }}
        dir="auto"
      >
        {summary.story}
      </p>

      {summary.feel ? (
        <div>
          <span
            className="inline-flex items-center text-[11px] font-medium"
            style={{
              gap: 4,
              padding: '3px 10px',
              borderRadius: 999,
              backgroundColor: accent.chipBg,
              color: accent.chipFg,
            }}
            dir="auto"
          >
            {summary.feel}
          </span>
        </div>
      ) : null}

      {summary.redFlags && summary.redFlags.length > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {summary.redFlags.map((flag, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[3px] shrink-0 text-[12px]"
                style={{ color: '#A32D2D' }}
              >
                ⚠
              </span>
              <span
                className="text-[12px] text-gray-800"
                style={{ lineHeight: 1.55 }}
                dir="auto"
              >
                {flag}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
