import { useTranslation } from 'react-i18next'

export type TabId = 'situations' | 'watching'

export interface BottomTabBarProps {
  active: TabId
  onChange: (next: TabId) => void
  watchingCount?: number
}

// Sticky bottom tab bar (Situations | Watching). Mirrors the mockup's
// minimal two-tab navigation. Watching tab shows a count bubble when > 0.
export default function BottomTabBar({
  active,
  onChange,
  watchingCount = 0,
}: BottomTabBarProps) {
  const { t } = useTranslation()
  return (
    <nav
      className="fixed bottom-0 inset-x-0 mx-auto max-w-sm bg-white"
      style={{
        borderTop: '0.5px solid #E0DFDB',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch">
        <TabButton
          active={active === 'situations'}
          label={t('tabs.situations')}
          onClick={() => onChange('situations')}
        />
        <TabButton
          active={active === 'watching'}
          label={t('tabs.watching')}
          badge={watchingCount > 0 ? watchingCount : undefined}
          onClick={() => onChange('watching')}
        />
      </div>
    </nav>
  )
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean
  label: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 flex items-center justify-center gap-1.5"
      style={{
        padding: '12px 0 14px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? '#1F2937' : '#7B7B79',
        borderTop: active ? '2px solid #1F2937' : '2px solid transparent',
        marginTop: '-0.5px',
        cursor: 'pointer',
        backgroundColor: 'transparent',
        textTransform: 'lowercase',
      }}
    >
      <span>{label}</span>
      {typeof badge === 'number' ? (
        <span
          aria-hidden
          className="inline-flex items-center justify-center rounded-full"
          style={{
            backgroundColor: active ? '#1F2937' : '#C8C6BF',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 600,
            minWidth: 16,
            height: 16,
            padding: '0 5px',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}
