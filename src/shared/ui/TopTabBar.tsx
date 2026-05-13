import { useTranslation } from 'react-i18next'

export type TabId = 'situations' | 'watching'

export interface TopTabBarProps {
  active: TabId
  onChange: (next: TabId) => void
  watchingCount?: number
}

// Two-tab bar that lives at the top of the app shell, right under the
// brand row. Subtle underline indicates the active tab. Constitution
// preference: keep navigation calm and out of the thumb zone, so the
// header is the natural home for it (mobile-first one-handed reading).
export default function TopTabBar({
  active,
  onChange,
  watchingCount = 0,
}: TopTabBarProps) {
  const { t } = useTranslation()
  return (
    <div
      className="bg-white"
      style={{
        borderBottom: '0.5px solid #ECEAE3',
      }}
    >
      <div className="flex items-stretch gap-6 px-4">
        <Tab
          active={active === 'situations'}
          label={t('tabs.situations')}
          onClick={() => onChange('situations')}
        />
        <Tab
          active={active === 'watching'}
          label={t('tabs.watching')}
          badge={watchingCount > 0 ? watchingCount : undefined}
          onClick={() => onChange('watching')}
        />
      </div>
    </div>
  )
}

function Tab({
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
      className="flex items-center gap-1.5"
      style={{
        padding: '10px 0 12px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#1F2937' : '#7B7B79',
        borderBottom: active ? '2px solid #1F2937' : '2px solid transparent',
        marginBottom: '-0.5px',
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
