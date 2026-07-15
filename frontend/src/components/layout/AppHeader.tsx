'use client'

import { UserButton } from '@clerk/nextjs'
import { Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isClerkEnabled } from '@/lib/auth/clerk'
import { useCommandPaletteStore } from '@/lib/stores/command-palette-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useEffect, useState } from 'react'

interface AppHeaderProps {
  onOpenMobileNav: () => void
}

/**
 * Slim application header. The single action it offers is the primary
 * workflow ("Ask Navigator", the command palette) plus the account button.
 */
export function AppHeader({ onOpenMobileNav }: AppHeaderProps) {
  const { t } = useTranslation()
  const openPalette = useCommandPaletteStore((s) => s.setOpen)
  const [isMac, setIsMac] = useState(true)

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4">
      <Button
        variant="ghost"
        size="sm"
        className="h-11 w-11 p-0 md:hidden"
        onClick={onOpenMobileNav}
        aria-label={t('navigation.nav')}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          onClick={() => openPalette(true)}
          className="h-11 gap-2 px-3 text-muted-foreground sm:px-4"
        >
          <Search className="h-4 w-4" />
          <span>{t('navigation.askNavigator')}</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
            {isMac ? '⌘' : 'Ctrl+'}K
          </kbd>
        </Button>
        {isClerkEnabled && (
          <UserButton
            appearance={{ elements: { avatarBox: 'h-9 w-9' } }}
          />
        )}
      </div>
    </header>
  )
}
