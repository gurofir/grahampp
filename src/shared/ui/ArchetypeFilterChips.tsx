import { useTranslation } from 'react-i18next'
import type { Archetype } from '../lib/types'
import { ARCHETYPE_ACCENT } from '../lib/archetype'

export interface ArchetypeFilterChipsProps {
  archetypes: Archetype[]    // archetypes present in the current dataset
  selected: Archetype | null  // null = "All"
  onSelect: (archetype: Archetype | null) => void
  // counts[archetype] -> how many cards match. Drives chip badge count.
  counts: Partial<Record<Archetype, number>>
  totalCount: number
}

// Horizontal scrollable chip bar. Tap to filter the list by archetype.
// Tapping the active chip clears the filter (back to All).
export default function ArchetypeFilterChips({
  archetypes,
  selected,
  onSelect,
  counts,
  totalCount,
}: ArchetypeFilterChipsProps) {
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto"
      style={{ paddingBottom: 4, scrollbarWidth: 'none' }}
    >
      <Chip
        active={selected === null}
        onClick={() => onSelect(null)}
        label={`${t('discovery.allFilter')} · ${totalCount}`}
      />
      {archetypes.map((arch) => {
        const accent = ARCHETYPE_ACCENT[arch]
        const isActive = selected === arch
        const count = counts[arch] ?? 0
        return (
          <Chip
            key={arch}
            active={isActive}
            onClick={() => onSelect(isActive ? null : arch)}
            label={`${t(`archetype.${arch}`)} · ${count}`}
            accentBg={accent.bg}
            accentFg={accent.fg}
          />
        )
      })}
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
  accentBg,
  accentFg,
}: {
  label: string
  active: boolean
  onClick: () => void
  accentBg?: string
  accentFg?: string
}) {
  // When active and an accent palette is supplied, use the accent. When
  // active without accent (the All chip), use a neutral dark style.
  const style: React.CSSProperties = active
    ? {
        backgroundColor: accentBg ?? '#1F2937',
        color: accentFg ?? '#FFFFFF',
        border: `1px solid ${accentBg ?? '#1F2937'}`,
      }
    : {
        backgroundColor: '#FFFFFF',
        color: '#5F5E5A',
        border: '1px solid #E0DFDB',
      }
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full uppercase font-semibold tracking-wider whitespace-nowrap"
      style={{
        ...style,
        padding: '4px 10px',
        fontSize: 10,
        letterSpacing: '0.06em',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
