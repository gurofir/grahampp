import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SituationRow } from '../discovery/hooks/useDiscovery'
import type { DiscoveryData } from '../discovery/hooks/useDiscovery'
import type { WatchedItem } from '../../shared/lib/types'
import SearchInput from '../../shared/ui/SearchInput'
import { useWatchlist } from '../../shared/hooks/useWatchlist'
import { useWatchingData } from './hooks/useWatchingData'
import WatchingSection from './WatchingSection'

export interface WatchingPageProps {
  discovery: DiscoveryData | null
  // Called when user taps a watching card. We hand back BOTH the watched
  // snapshot and the latest live row (when present) so the caller can
  // decide whether to render from cache or fetch fresh.
  onItemTap: (watched: WatchedItem, liveRow: SituationRow | null) => void
}

// Constitutional Watching dashboard (Constitution §14, mockup screen 4).
//
// Layout:
//   - Header: title + count subtitle
//   - SearchInput (filter own watchlist)
//   - Three stacked sections:
//       1. THESIS UNDER PRESSURE
//       2. AWAITING CONFIRMATION SIGNALS
//       3. THESIS CONFIRMING
//   - Empty state when nothing is being watched
export default function WatchingPage({
  discovery,
  onItemTap,
}: WatchingPageProps) {
  const { t } = useTranslation()
  const watch = useWatchlist()
  const [search, setSearch] = useState('')

  const liveRows = discovery?.situations ?? []
  const { sections, totalCount } = useWatchingData(
    watch.items,
    liveRows,
    search,
  )

  if (watch.items.length === 0) {
    return (
      <div className="space-y-4">
        <Header count={0} />
        <div className="rounded-2xl border border-[#E0DFDB] bg-white p-6 text-center space-y-1.5">
          <div className="text-[14px] font-semibold text-gray-900">
            {t('watching.empty.title')}
          </div>
          <div className="text-[12px] text-[#7B7B79]" dir="auto">
            {t('watching.empty.subtitle')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Header count={watch.items.length} />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('watching.searchPlaceholder')}
      />

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-[#E0DFDB] bg-white p-4 text-[13px] text-[#7B7B79] text-center">
          {t('watching.empty.title')}
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s) => (
            <WatchingSection
              key={s.status}
              status={s.status}
              rows={s.rows}
              onTap={onItemTap}
              onUnwatch={watch.unwatch}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Header({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <header>
      <h1 className="text-[20px] font-semibold text-gray-900 leading-tight">
        {t('watching.title')}
      </h1>
      <p className="mt-1 text-[12px] text-[#7B7B79]">
        {count === 1
          ? t('watching.subtitleOne')
          : t('watching.subtitle', { count })}
      </p>
    </header>
  )
}
