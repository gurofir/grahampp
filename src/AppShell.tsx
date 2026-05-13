import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from './features/home/LanguageToggle'
import TopTabBar, { type TabId } from './shared/ui/TopTabBar'

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
// Sticky brand row + top tab bar. Body scrolls underneath. The tab bar
// stays visible as the user scrolls so they can switch tabs without
// scrolling back to the top.
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
      <header
        className="sticky top-0 z-30 bg-white"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {showBrandBar ? (
          <div
            className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ borderBottom: '0.5px solid #F4F2EC' }}
          >
            <h1
              className="text-[15px] font-semibold tracking-tight text-gray-900"
              dir="ltr"
            >
              {t('app.title')}
            </h1>
            <LanguageToggle />
          </div>
        ) : null}
        <TopTabBar
          active={activeTab}
          onChange={onTabChange}
          watchingCount={watchingCount}
        />
      </header>

      <main className="px-4 pt-4 pb-8">{children}</main>
    </>
  )
}
