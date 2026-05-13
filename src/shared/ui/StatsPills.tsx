import { useTranslation } from 'react-i18next'

export interface StatsPillsProps {
  examiningCount: number
  watchingCount: number
  screenedCount: number
  onWatchingTap?: () => void
}

// Three small stats pills under the header on the Discovery list page.
// Tappable "watching" pill switches to the Watching tab.
export default function StatsPills({
  examiningCount,
  watchingCount,
  screenedCount,
  onWatchingTap,
}: StatsPillsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill>{t('discovery.statsExamining', { count: examiningCount })}</Pill>
      <Pill onClick={onWatchingTap} interactive={!!onWatchingTap}>
        {t('discovery.statsWatchingActive', { count: watchingCount })}
      </Pill>
      <Pill muted>{t('discovery.statsScreened', { count: screenedCount })}</Pill>
    </div>
  )
}

function Pill({
  children,
  onClick,
  interactive,
  muted,
}: {
  children: React.ReactNode
  onClick?: () => void
  interactive?: boolean
  muted?: boolean
}) {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 999,
    border: '1px solid #E0DFDB',
    backgroundColor: muted ? 'transparent' : '#F5F4EF',
    color: muted ? '#7B7B79' : '#3F3F3D',
    lineHeight: 1.3,
  }
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ ...base, cursor: 'pointer' }}
      >
        {children}
      </button>
    )
  }
  return <span style={base}>{children}</span>
}
