import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isTailwindSeverity,
  type Decision,
  type EngineResult,
  type FragilityBand,
} from '../../shared/lib/types'

interface EnginePanelProps {
  name: string
  engine: EngineResult
  size: 'lead' | 'secondary'
}

const DECISION_COLOR: Record<Decision, { border: string; bg: string; fg: string }> = {
  BUY: { border: '#3B6D11', bg: '#EAF3DE33', fg: '#3B6D11' },
  AVOID: { border: '#A32D2D', bg: '#FCEBEB33', fg: '#A32D2D' },
  WAIT: { border: '#E5E7EB', bg: '#FFFFFF', fg: '#5F5E5A' },
}

const FRAGILITY_COLOR: Record<FragilityBand, { bg: string; fg: string }> = {
  robust: { bg: '#EAF3DE', fg: '#27500A' },
  moderate: { bg: '#FAEEDA', fg: '#854F0B' },
  fragile: { bg: '#FCEBEB', fg: '#A32D2D' },
  unstable: { bg: '#FCEBEB', fg: '#A32D2D' },
}

function FragilityPill({ band }: { band: FragilityBand }) {
  const { t } = useTranslation()
  const colors = FRAGILITY_COLOR[band]
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium"
      style={{
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: colors.bg,
        color: colors.fg,
      }}
      dir="auto"
    >
      {t(`reality.fragility.${band}`)}
    </span>
  )
}

export default function EnginePanel({ name, engine, size }: EnginePanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const colors = DECISION_COLOR[engine.decision] ?? DECISION_COLOR.WAIT
  const decisionFontSize = size === 'lead' ? 32 : 22
  const borderWidth = engine.decision === 'WAIT' ? 0.5 : 2
  const fragilityBand = engine.fragilityBand
  const blocked = !!engine.blocked
  const counter = engine.counter
  const tailwindCount = (engine.findings || []).filter((f) =>
    isTailwindSeverity(f.severity),
  ).length

  const hasDetails = !!engine.thesis || !!(counter && counter.summary) || !!engine.trigger || !!engine.entryZone

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        border: `${borderWidth}px solid ${colors.border}`,
        backgroundColor: colors.bg,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500" dir="ltr">
          {name}
        </span>
        <span className="text-[10px] text-gray-500">
          {t(`dualEngine.confidence.${engine.confidence}`)}
        </span>
      </div>

      <div>
        <span
          className="font-semibold leading-none"
          style={{ fontSize: decisionFontSize, color: colors.fg }}
          dir="ltr"
        >
          {t(`dualEngine.decision.${engine.decision}`)}
        </span>
      </div>

      {fragilityBand || blocked || tailwindCount > 0 ? (
        <div className="flex items-center flex-wrap gap-1.5">
          {fragilityBand ? <FragilityPill band={fragilityBand} /> : null}
          {tailwindCount > 0 ? (
            <span
              className="inline-flex items-center text-[10px] font-medium"
              style={{
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                backgroundColor: '#EAF3DE',
                color: '#27500A',
              }}
              dir="auto"
              title={t('reality.tailwindsHeader', 'גורמים תומכים')}
            >
              ↑ {tailwindCount}
            </span>
          ) : null}
          {blocked ? (
            <span
              className="inline-flex items-center text-[10px] font-medium uppercase tracking-wider"
              style={{
                gap: 4,
                padding: '2px 7px',
                borderRadius: 4,
                border: '0.5px solid #A32D2D',
                color: '#A32D2D',
              }}
              dir="auto"
            >
              {t('reality.blockedShort', 'חסום')}
            </span>
          ) : null}
        </div>
      ) : null}

      {hasDetails ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
          aria-expanded={expanded}
          dir="auto"
          style={{ padding: '2px 0' }}
        >
          {expanded
            ? `▴ ${t('dualEngine.hideDetails', 'הסתר ניתוח')}`
            : `▾ ${t('dualEngine.showDetails', 'הצג ניתוח')}`}
        </button>
      ) : null}

      {expanded ? (
        <div className="flex flex-col gap-2 pt-1">
          {engine.thesis ? (
            <p
              className="text-[12px] text-gray-700"
              style={{ lineHeight: 1.55 }}
              dir="auto"
            >
              {engine.thesis}
            </p>
          ) : null}

          {counter && counter.summary ? (
            <div
              className="rounded-md px-2 py-1.5"
              style={{
                backgroundColor: '#FCEBEB66',
                border: '0.5px solid #F0C9C9',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider mb-0.5"
                style={{ color: '#A32D2D' }}
              >
                {t('reality.counterShort', 'נגד')}
              </div>
              <div
                className="text-[11px] text-gray-800"
                style={{ lineHeight: 1.5 }}
                dir="auto"
              >
                {counter.summary}
              </div>
            </div>
          ) : null}

          {engine.trigger ? (
            <div
              className="rounded-md px-2 py-1.5"
              style={{
                backgroundColor: '#F8F8F4',
                border: '0.5px solid #E5E7EB',
              }}
            >
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
                {t('dualEngine.trigger')}
              </div>
              <div
                className="text-[11px] text-gray-700"
                style={{ lineHeight: 1.5 }}
                dir="auto"
              >
                {engine.trigger}
              </div>
            </div>
          ) : null}

          {engine.entryZone ? (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center"
                style={{
                  backgroundColor: '#EAF3DE',
                  color: '#27500A',
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                🎯 {t('dualEngine.entryZone')}
              </span>
              <span className="text-[11px] text-gray-700" dir="ltr">
                {engine.entryZone}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
