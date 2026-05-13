import { useTranslation } from 'react-i18next'
import type { CounterThesis, EngineResult } from '../../shared/lib/types'
import { deriveConfirmationSignals } from '../../shared/lib/archetype'

export interface ThesisFlowPanelProps {
  graham: EngineResult
}

// Constitution §10: every analysis must surface the thesis AND the
// counter-thesis AND the kill-switches AND the confirmation signals -- in
// that order, all visible without expansion.
//
// Layout (4 stacked sub-sections):
//   1. THE THESIS                        (graham.thesis)
//   2. WHY THE MARKET MAY STILL BE RIGHT (counter.summary)
//   3. WHAT BREAKS THIS THESIS           (counter.killSwitches[])
//   4. WHAT CONFIRMS THIS THESIS         (tailwind findings, max 3)
//
// Sub-sections are hidden if they have no content -- a thesis with no
// killSwitches simply doesn't show that block, the panel doesn't pad it
// with placeholder text.
export default function ThesisFlowPanel({ graham }: ThesisFlowPanelProps) {
  const { t } = useTranslation()
  const counter: CounterThesis | null = graham.counter ?? null
  const confirms = deriveConfirmationSignals(graham.findings)

  return (
    <section
      className="rounded-2xl bg-white"
      style={{
        border: '0.5px solid #E0DFDB',
        padding: '14px',
      }}
    >
      <Block
        label={t('thesisFlow.thesis')}
        accent="#1F2937"
        body={graham.thesis ? <Para text={graham.thesis} /> : null}
      />

      {counter?.summary ? (
        <Block
          label={t('thesisFlow.counter')}
          accent="#854F0B"
          body={<Para text={counter.summary} />}
          isFirst={false}
        />
      ) : null}

      {counter?.killSwitches?.length ? (
        <Block
          label={t('thesisFlow.breaks')}
          accent="#A32D2D"
          isFirst={false}
          body={<BulletList items={counter.killSwitches} bulletColor="#A32D2D" />}
        />
      ) : null}

      {confirms.length ? (
        <Block
          label={t('thesisFlow.confirms')}
          accent="#1F8A4D"
          isFirst={false}
          body={<BulletList items={confirms} bulletColor="#1F8A4D" />}
        />
      ) : null}
    </section>
  )
}

function Block({
  label,
  body,
  accent,
  isFirst = true,
}: {
  label: string
  body: React.ReactNode
  accent: string
  isFirst?: boolean
}) {
  if (!body) return null
  return (
    <div
      className="space-y-2"
      style={{
        paddingTop: isFirst ? 0 : 12,
        marginTop: isFirst ? 0 : 12,
        borderTop: isFirst ? 'none' : '0.5px solid #ECEAE3',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        {label}
      </div>
      {body}
    </div>
  )
}

function Para({ text }: { text: string }) {
  return (
    <p
      className="text-[13px] text-[#3F3F3D] leading-relaxed"
      dir="auto"
    >
      {text}
    </p>
  )
}

function BulletList({
  items,
  bulletColor,
}: {
  items: string[]
  bulletColor: string
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            aria-hidden
            className="shrink-0"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: bulletColor,
              marginTop: 7,
            }}
          />
          <span
            className="text-[12px] text-[#3F3F3D] leading-snug"
            dir="auto"
          >
            {it}
          </span>
        </li>
      ))}
    </ul>
  )
}
