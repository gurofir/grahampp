import { useTranslation } from 'react-i18next'
import {
  isTailwindSeverity,
  type Decision,
  type EngineResult,
  type FragilityFinding,
} from '../lib/types'

interface ReasonsAccordionProps {
  graham: EngineResult
  market: EngineResult
}

const DOT_COLOR: Record<Decision, string> = {
  BUY: '#3B6D11',
  AVOID: '#A32D2D',
  WAIT: '#5F5E5A',
}

function BulletList({
  items,
  dotColor,
  variant,
}: {
  items: string[]
  dotColor: string
  variant: 'positive' | 'risk'
}) {
  if (!items.length) return null
  const color = variant === 'risk' ? '#A32D2D' : dotColor
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-[6px] shrink-0"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: color,
              display: 'inline-block',
            }}
          />
          <span className="text-[12px] text-gray-800" style={{ lineHeight: 1.55 }}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CounterBlock({ engine }: { engine: EngineResult }) {
  const { t } = useTranslation()
  const counter = engine.counter
  if (!counter) return null
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">
        {t('reality.counterHeader')}
      </div>
      {counter.summary ? (
        <p className="text-[12px] text-gray-800" style={{ lineHeight: 1.6 }} dir="auto">
          {counter.summary}
        </p>
      ) : null}
      {counter.ifThen ? (
        <div
          className="rounded-md px-2.5 py-2"
          style={{ backgroundColor: '#FCEBEB66', border: '0.5px solid #F0C9C9' }}
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: '#A32D2D' }}
          >
            {t('reality.counterIfThen')}
          </div>
          <div className="text-[12px] text-gray-800" style={{ lineHeight: 1.55 }} dir="auto">
            {counter.ifThen}
          </div>
        </div>
      ) : null}
      {counter.killSwitches.length ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {t('reality.killSwitchesHeader')}
          </div>
          <ul className="space-y-1.5">
            {counter.killSwitches.map((k, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-[6px] shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#A32D2D',
                    display: 'inline-block',
                  }}
                />
                <span className="text-[12px] text-gray-800" style={{ lineHeight: 1.55 }}>
                  {k}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function FindingList({
  findings,
  variant,
}: {
  findings: FragilityFinding[]
  variant: 'headwind' | 'tailwind'
}) {
  const { t } = useTranslation()
  if (!findings.length) return null
  return (
    <ul className="space-y-1.5">
      {findings.slice(0, 6).map((f, i) => {
        const sevColor =
          variant === 'tailwind'
            ? '#27500A'
            : f.severity === 'severe'
              ? '#A32D2D'
              : f.severity === 'warn'
                ? '#854F0B'
                : '#5F5E5A'
        return (
          <li key={i} className="flex items-start gap-2">
            <span
              className="text-[10px] font-medium uppercase shrink-0"
              style={{ color: sevColor, minWidth: 56 }}
              dir="auto"
            >
              {t(`reality.dim.${f.dimension}`, f.dimension)}
            </span>
            <span className="text-[12px] text-gray-800" style={{ lineHeight: 1.55 }}>
              {f.evidence}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function FindingsBlock({ findings }: { findings: FragilityFinding[] }) {
  const { t } = useTranslation()
  if (!findings.length) return null
  const headwinds = findings.filter((f) => !isTailwindSeverity(f.severity))
  const tailwinds = findings.filter((f) => isTailwindSeverity(f.severity))
  return (
    <div className="space-y-3">
      {headwinds.length ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {t('reality.findingsHeader')}
          </div>
          <FindingList findings={headwinds} variant="headwind" />
        </div>
      ) : null}
      {tailwinds.length ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: '#27500A' }}>
            {t('reality.tailwindsHeader')}
          </div>
          <FindingList findings={tailwinds} variant="tailwind" />
        </div>
      ) : null}
    </div>
  )
}

function EngineColumn({
  title,
  engine,
}: {
  title: string
  engine: EngineResult
}) {
  const { t } = useTranslation()
  const color = DOT_COLOR[engine.decision]
  const findings = engine.findings || []

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 pb-1.5 border-b border-gray-100">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500" dir="ltr">
          {title}
        </span>
        <span
          className="text-[12px] font-semibold"
          style={{ color }}
          dir="ltr"
        >
          {t(`dualEngine.decision.${engine.decision}`)}
        </span>
      </div>

      {engine.thesis ? (
        <p className="text-[12px] text-gray-800" style={{ lineHeight: 1.6 }}>
          {engine.thesis}
        </p>
      ) : null}

      {engine.why.length ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {t('dualEngine.whyHeader')}
          </div>
          <BulletList items={engine.why} dotColor={color} variant="positive" />
        </div>
      ) : null}

      {engine.risks.length ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {t('dualEngine.risksHeader')}
          </div>
          <BulletList items={engine.risks} dotColor={color} variant="risk" />
        </div>
      ) : null}

      <CounterBlock engine={engine} />
      <FindingsBlock findings={findings} />

      {engine.trigger ? (
        <div
          className="rounded-md px-2.5 py-2"
          style={{ backgroundColor: '#F8F8F4', border: '0.5px solid #E5E7EB' }}
        >
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
            {t('dualEngine.trigger')}
          </div>
          <div className="text-[12px] text-gray-800" style={{ lineHeight: 1.55 }}>
            {engine.trigger}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ReasonsAccordion({ graham, market }: ReasonsAccordionProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5 px-4 py-4">
      <EngineColumn title={t('dualEngine.engineNames.graham')} engine={graham} />
      <div className="border-t border-gray-100 pt-5">
        <EngineColumn title={t('dualEngine.engineNames.market')} engine={market} />
      </div>
    </div>
  )
}
