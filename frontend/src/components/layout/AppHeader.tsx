'use client'

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { Building2, LogOut, Menu, Plug, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConnectedServicesPanel } from '@/components/gmail/ConnectedServicesPanel'
import { isClerkEnabled } from '@/lib/auth/clerk'
import { useAuth } from '@/lib/hooks/use-auth'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { useCommandPaletteStore } from '@/lib/stores/command-palette-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useEffect, useState } from 'react'

interface AppHeaderProps {
  onOpenMobileNav: () => void
}

/**
 * Slim application header. Two things live here: the primary workflow
 * ("Ask Navigator", the command palette) and the single account menu —
 * manage account, admin links and sign-out are all under that one dropdown.
 */
export function AppHeader({ onOpenMobileNav }: AppHeaderProps) {
  const { t } = useTranslation()
  const openPalette = useCommandPaletteStore((s) => s.setOpen)
  const { isAdmin } = useIsAdmin()
  const { logout } = useAuth()
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

        {/* Org switcher: admins only — members belong to exactly one org.
            Switch only; managing orgs/members happens via the account menu. */}
        {isClerkEnabled && isAdmin && (
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/home"
            appearance={{
              elements: {
                // Text/hover colors come from globals.css (.cl-organizationSwitcherTrigger).
                organizationSwitcherTrigger: 'rounded-md border border-border px-2 py-1.5',
                organizationSwitcherPopoverActionButton__createOrganization: 'hidden',
                organizationSwitcherPopoverActionButton__manageOrganization: 'hidden',
              },
            }}
          />
        )}

        {isClerkEnabled ? (
          <UserButton appearance={{ elements: { avatarBox: 'h-9 w-9' } }}>
            <UserButton.MenuItems>
              {isAdmin && (
                <UserButton.Link
                  label={t('navigation.usersAccess')}
                  labelIcon={<Users className="h-4 w-4" />}
                  href="/admin?tab=users"
                />
              )}
              {isAdmin && (
                <UserButton.Link
                  label={t('navigation.departments')}
                  labelIcon={<Building2 className="h-4 w-4" />}
                  href="/admin?tab=departments"
                />
              )}
              {/* Direct menu entry — opens the profile modal at the
                  Connected Services page declared below. */}
              <UserButton.Action
                label={t('gmail.connectedServices')}
                labelIcon={<Plug className="h-4 w-4" />}
                open="connected-services"
              />
            </UserButton.MenuItems>
            {/* Connected Services: users manage their own connectors (Gmail)
                here — connectors are never exposed as source types. */}
            <UserButton.UserProfilePage
              label={t('gmail.connectedServices')}
              url="connected-services"
              labelIcon={<Plug className="h-4 w-4" />}
            >
              <ConnectedServicesPanel />
            </UserButton.UserProfilePage>
          </UserButton>
        ) : (
          /* Password mode has no Clerk account menu, so sign-out lives here. */
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={logout}
            aria-label={t('common.signOut')}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.signOut')}</span>
          </Button>
        )}
      </div>
    </header>
  )
}
