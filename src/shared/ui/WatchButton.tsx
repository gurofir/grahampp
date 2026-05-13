import { useTranslation } from 'react-i18next'
import type { MouseEvent } from 'react'

export interface WatchButtonProps {
  isWatched: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
  // Stop propagation: when the button is rendered inside a clickable card,
  // we don't want the card's onClick to fire as well.
  stopPropagation?: boolean
}

// "+ watch" / "watching" pill. Visual states:
//   - not watched: outlined / neutral
//   - watched:     filled / accented
export default function WatchButton({
  isWatched,
  onToggle,
  size = 'sm',
  stopPropagation = true,
}: WatchButtonProps) {
  const { t } = useTranslation()
  const padding = size === 'md' ? '6px 14px' : '4px 10px'
  const fontSize = size === 'md' ? 12 : 11

  const baseStyle: React.CSSProperties = {
    padding,
    fontSize,
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 500,
    lineHeight: 1.2,
    transition: 'all 120ms ease-out',
  }

  const watchedStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    border: '1px solid #1F2937',
  }

  const unwatchedStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: 'transparent',
    color: '#3F3F3D',
    border: '1px solid #C8C6BF',
  }

  return (
    <button
      type="button"
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (stopPropagation) e.stopPropagation()
        onToggle()
      }}
      style={isWatched ? watchedStyle : unwatchedStyle}
      aria-pressed={isWatched}
    >
      {isWatched ? t('watch.watching') : t('watch.add')}
    </button>
  )
}
