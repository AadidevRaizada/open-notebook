'use client'

import { useState } from 'react'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { SetupBanner } from './SetupBanner'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useTranslation } from '@/lib/hooks/use-translation'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden h-full md:flex">
        <AppSidebar />
      </div>

      {/* Mobile navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-80 max-w-[85vw] gap-0 p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">{t('navigation.nav')}</SheetTitle>
          <AppSidebar mobile onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AppHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <SetupBanner />
        {children}
      </main>
    </div>
  )
}
