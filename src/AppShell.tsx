import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from './features/home/LanguageToggle'
import BottomTabBar, { type TabId } from './shared/ui/BottomTabBar'

export interface AppShellProps {
  children: ReactNode
  activeTab: TabId
  onTabChange: (next: TabId) => void
  watchingCount: number
  // Brand bar at the top is optional -- the Result page hides it because
  // the SituationHeader already provides identity.
  showBrandBar?: boolean
}

// Page chrome for the constitutional UI (mockup screens 1, 3, 4).
//
// Sticky bottom-tab bar + scrollable body. The brand bar at top is small
// and non-distracting per Constitution §19 (calm visual language).
export default function AppShell({
  children,
  activeTab,
  onTabChange,
  watchingCount,
  showBrandBar = true,
}: AppShellProps) {
  const { t } = useTranslation()

  return (
    <>
      {showBrandBar ? (
        <header
          className="sticky top-0 z-30 bg-white"
          style={{
            borderBottom: '0.5px solid #ECEAE3',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h1
              className="text-[15px] font-semibold tracking-tight text-gray-900"
              dir="ltr"
            >
              {t('app.title')}
            </h1>
            <LanguageToggle />
          </div>
        </header>
      ) : null}

      <main className="px-4 pt-4" style={{ paddingBottom: 88 }}>
        {children}
      </main>

      <BottomTabBar
        active={activeTab}
        onChange={onTabChange}
        watchingCount={watchingCount}
      />
    </>
  )
}
