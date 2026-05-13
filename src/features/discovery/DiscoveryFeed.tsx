import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiscoveryData, SituationRow } from './hooks/useDiscovery'
import type { Archetype } from '../../shared/lib/types'
import { classifyArchetype } from '../../shared/lib/archetype'
import SituationCard from './SituationCard'
import SearchInput from '../../shared/ui/SearchInput'
import StatsPills from '../../shared/ui/StatsPills'
import ArchetypeFilterChips from '../../shared/ui/ArchetypeFilterChips'
import { useWatchlist } from '../../shared/hooks/useWatchlist'

export interface DiscoveryFeedProps {
  data: DiscoveryData
  loading: boolean
  onSituationTap: (situation: SituationRow) => void
  onSwitchToWatching?: () => void
  // Called when the user hits Enter in the search box with a ticker-shaped
  // string (e.g. "MRVL"). Treats the box as both a live filter AND a
  // global ticker analyzer -- the same affordance from any tab.
  onAnalyzeTicker?: (ticker: string) => void
}

// Heuristic for "looks like a ticker" -- US tickers are 1-5 letters
// optionally followed by .XX (e.g. BRK.B, RDS.A). Allows lowercase since
// we'll uppercase before submitting.
const TICKER_RE = /^[A-Za-z]{1,5}(\.[A-Za-z]{1,2})?$/

function looksLikeTicker(input: string): boolean {
  return TICKER_RE.test(input.trim())
}

const DEFAULT_VISIBLE = 6

// Constitutional Discovery list page (Constitution §16, mockup screen 1).
//
// Layout, top to bottom:
//   1. Compact app title + scan timestamp
//   2. SearchInput (filter by ticker / company / situation title)
//   3. Three stats pills (examining / watching / screened)
//   4. Archetype filter chips (horizontally scrollable)
//   5. List of SituationCards, ordered by score, filtered by search/chip
//   6. "Show more" button when collapsed
export default function DiscoveryFeed({
  data,
  loading,
  onSituationTap,
  onSwitchToWatching,
  onAnalyzeTicker,
}: DiscoveryFeedProps) {
  const { t } = useTranslation()
  const watch = useWatchlist()

  const [search, setSearch] = useState('')
  const [archetypeFilter, setArchetypeFilter] = useState<Archetype | null>(null)
  const [expanded, setExpanded] = useState(false)

  const situations = data.situations

  // Pre-classify every row once so the chip filter and the card render
  // share the same archetype assignment.
  const classified = useMemo(() => {
    return situations.map((s) => ({
      row: s,
      archetype: classifyArchetype(s),
    }))
  }, [situations])

  // Counts per archetype (drives the chip badge counts and the "All" total).
  const archetypeCounts = useMemo(() => {
    const out: Partial<Record<Archetype, number>> = {}
    for (const c of classified) {
      out[c.archetype] = (out[c.archetype] ?? 0) + 1
    }
    return out
  }, [classified])

  // Order chips by frequency desc so the most relevant patterns surface
  // first. Hide archetypes that didn't appear at all in this scan.
  const visibleArchetypes = useMemo<Archetype[]>(() => {
    return (Object.keys(archetypeCounts) as Archetype[])
      .filter((k) => (archetypeCounts[k] ?? 0) > 0)
      .sort((a, b) => (archetypeCounts[b] ?? 0) - (archetypeCounts[a] ?? 0))
  }, [archetypeCounts])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return classified.filter(({ row, archetype }) => {
      if (archetypeFilter && archetype !== archetypeFilter) return false
      if (!needle) return true
      return (
        row.ticker.toLowerCase().includes(needle) ||
        (row.company_name || '').toLowerCase().includes(needle) ||
        (row.sector || '').toLowerCase().includes(needle) ||
        (row.insight || '').toLowerCase().includes(needle)
      )
    })
  }, [classified, archetypeFilter, search])

  const total = filtered.length
  const visibleSlice = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE)
  const remaining = Math.max(0, total - DEFAULT_VISIBLE)

  const lastScanText = formatLastScan(t, data.scannedAt)

  // Common Enter handler for the search input -- treats input as a ticker
  // and fires the global analyze callback when it matches the heuristic.
  const handleSearchSubmit = () => {
    if (!onAnalyzeTicker) return
    const candidate = search.trim()
    if (!candidate) return
    if (!looksLikeTicker(candidate)) return
    onAnalyzeTicker(candidate.toUpperCase())
  }

  if (loading && situations.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E0DFDB] bg-white p-4 text-[13px] text-[#7B7B79] text-center">
        {t('discovery.loading')}
      </div>
    )
  }

  if (!data.scannedAt && situations.length === 0) {
    return (
      <div className="space-y-4">
        <Header lastScanText={lastScanText} />
        <SearchInput
          value={search}
          onChange={setSearch}
          onSubmit={handleSearchSubmit}
          placeholder={t('discovery.searchPlaceholder')}
        />
        <div className="rounded-2xl border border-[#E0DFDB] bg-white p-4 text-[13px] text-[#7B7B79] text-center">
          {t('discovery.scanPending')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Header lastScanText={lastScanText} />

      <SearchInput
        value={search}
        onChange={setSearch}
        onSubmit={handleSearchSubmit}
        placeholder={t('discovery.searchPlaceholder')}
      />

      <StatsPills
        examiningCount={situations.length}
        watchingCount={watch.items.length}
        screenedCount={data.universeSize || 0}
        onWatchingTap={onSwitchToWatching}
      />

      {visibleArchetypes.length > 0 ? (
        <ArchetypeFilterChips
          archetypes={visibleArchetypes}
          selected={archetypeFilter}
          onSelect={(a) => {
            setArchetypeFilter(a)
            setExpanded(false)
          }}
          counts={archetypeCounts}
          totalCount={situations.length}
        />
      ) : null}

      {visibleSlice.length === 0 ? (
        <div className="rounded-2xl border border-[#E0DFDB] bg-white p-4 text-[13px] text-[#7B7B79] text-center">
          {t('discovery.noSituations')}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleSlice.map(({ row }) => (
            <li key={row.id}>
              <SituationCard
                situation={row}
                isWatched={watch.isWatched(row.ticker)}
                onTap={() => onSituationTap(row)}
                onToggleWatch={() => watch.toggleSituation(row)}
              />
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-xl border border-[#E0DFDB] bg-white text-[13px] text-[#3F3F3D] hover:bg-[#FAF9F5] transition-colors"
          style={{ padding: '10px 0' }}
        >
          {t('discovery.showMoreSituations', { count: remaining })}
        </button>
      ) : null}
    </div>
  )
}

function Header({ lastScanText }: { lastScanText: string }) {
  const { t } = useTranslation()
  return (
    <header>
      <div className="text-[11px] uppercase tracking-wider text-[#9A9A95]">
        {lastScanText
          ? t('discovery.scanIntro', { ago: lastScanText })
          : t('discovery.headerTitle')}
      </div>
    </header>
  )
}

function formatLastScan(
  t: ReturnType<typeof useTranslation>['t'],
  iso: string | null,
): string {
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
