import { useTranslation } from 'react-i18next'
import { ARCHETYPE_ACCENT } from '../lib/archetype'
import type { Archetype } from '../lib/types'

export interface ArchetypeBadgeProps {
  archetype: Archetype
  size?: 'sm' | 'md'
}

// Tinted pill displaying the archetype label (e.g. "CYCLICAL PANIC"). Used
// at the top of every situation card and on the stock-detail header.
export default function ArchetypeBadge({
  archetype,
  size = 'sm',
}: ArchetypeBadgeProps) {
  const { t } = useTranslation()
  const accent = ARCHETYPE_ACCENT[archetype]
  const padding = size === 'md' ? '4px 10px' : '2px 8px'
  const fontSize = size === 'md' ? 11 : 10
  return (
    <span
      className="inline-flex items-center rounded-full uppercase font-semibold tracking-wider"
      style={{
        backgroundColor: accent.bg,
        color: accent.fg,
        padding,
        fontSize,
        letterSpacing: '0.06em',
        lineHeight: 1.2,
      }}
    >
      {t(`archetype.${archetype}`)}
    </span>
  )
}
