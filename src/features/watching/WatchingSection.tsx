import { useTranslation } from 'react-i18next'
import type { WatchStatus } from '../../shared/lib/types'
import type { SituationRow } from '../discovery/hooks/useDiscovery'
import type { WatchingRow } from './hooks/useWatchingData'
import { WATCH_STATUS_ACCENT } from '../../shared/lib/watchStatus'
import WatchingCard from './WatchingCard'

export interface WatchingSectionProps {
  status: WatchStatus
  rows: WatchingRow[]
  onTap: (watched: WatchingRow['watched'], live: SituationRow | null) => void
  onUnwatch: (ticker: string) => void
}

// One vertical group on the Watching page. Hidden when no rows fall into
// the bucket (we don't render empty section headers).
export default function WatchingSection({
  status,
  rows,
  onTap,
  onUnwatch,
}: WatchingSectionProps) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  const accent = WATCH_STATUS_ACCENT[status]

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: accent.dot,
          }}
        />
        <h2
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: accent.dot }}
        >
          {t(`watching.section.${status}`)} · {rows.length}
        </h2>
      </header>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.watched.ticker}>
            <WatchingCard
              watched={row.watched}
              liveRow={row.liveRow}
              status={row.status}
              onTap={() => onTap(row.watched, row.liveRow)}
              onUnwatch={() => onUnwatch(row.watched.ticker)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
