'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import type { TFunction } from 'i18next'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Separator } from '@/components/ui/separator'
import {
  Book,
  Search,
  Settings,
  ChevronLeft,
  Menu,
  FileText,
  Plus,
  Home,
  Users,
  Building2,
  BarChart3,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: typeof Home
}

const getMemberNav = (t: TFunction): NavItem[] => [
  { name: t('navigation.home'), href: '/home', icon: Home },
  { name: t('navigation.askNavigator'), href: '/search', icon: Search },
  { name: t('navigation.knowledge'), href: '/sources', icon: FileText },
  { name: t('navigation.workspaces'), href: '/notebooks', icon: Book },
]

// Operational controls, deliberately separated from the member workflow.
// Models/Transformations/Advanced are reachable from Settings, not here.
const getAdminNav = (t: TFunction): NavItem[] => [
  { name: t('navigation.usersAccess'), href: '/admin?tab=users', icon: Users },
  { name: t('navigation.departments'), href: '/admin?tab=departments', icon: Building2 },
  { name: t('navigation.analytics'), href: '/admin?tab=usage', icon: BarChart3 },
  { name: t('navigation.settings'), href: '/settings', icon: Settings },
]

type CreateTarget = 'source' | 'notebook'

interface AppSidebarProps {
  /** Rendered inside the mobile drawer: always expanded, no collapse toggle. */
  mobile?: boolean
  /** Called after any navigation so the mobile drawer can close. */
  onNavigate?: () => void
}

export function AppSidebar({ mobile = false, onNavigate }: AppSidebarProps) {
  const { t } = useTranslation()
  const { isAdmin } = useIsAdmin()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isCollapsed: storeCollapsed, toggleCollapse } = useSidebarStore()
  const isCollapsed = mobile ? false : storeCollapsed
  const { openSourceDialog, openNotebookDialog } = useCreateDialogs()

  const [createMenuOpen, setCreateMenuOpen] = useState(false)

  const memberNav = getMemberNav(t)
  const adminNav = isAdmin ? getAdminNav(t) : []

  const handleCreateSelection = (target: CreateTarget) => {
    setCreateMenuOpen(false)
    onNavigate?.()
    if (target === 'source') openSourceDialog()
    else openNotebookDialog()
  }

  const isActive = (href: string) => {
    const [base, query] = href.split('?')
    if (pathname !== base && !pathname?.startsWith(`${base}/`)) return false
    // Tab-scoped links (the /admin?tab=… trio) are only active on their tab,
    // otherwise all three would highlight at once.
    if (!query) return true
    const tab = new URLSearchParams(query).get('tab')
    return (searchParams?.get('tab') ?? 'users') === tab
  }

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href)
    const button = (
      <Button
        variant="ghost"
        className={cn(
          'w-full gap-3 text-sidebar-foreground sidebar-menu-item',
          mobile ? 'h-11' : 'h-10',
          active &&
            'bg-sidebar-accent text-sidebar-accent-foreground font-medium hover:text-sidebar-accent-foreground',
          isCollapsed ? 'justify-center px-2' : 'justify-start'
        )}
      >
        <item.icon className="h-4 w-4" />
        {!isCollapsed && <span>{item.name}</span>}
      </Button>
    )

    if (isCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>
            <Link href={item.href} onClick={onNavigate}>
              {button}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <Link key={item.href} href={item.href} onClick={onNavigate}>
        {button}
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'app-sidebar flex h-full flex-col bg-sidebar border-sidebar-border transition-all duration-300',
          mobile ? 'w-full' : 'border-r',
          isCollapsed ? 'w-16' : mobile ? 'w-full' : 'w-64'
        )}
      >
        {/* Brand band. The IRS lockup is white-on-transparent and the
            50-years mark is gold on this exact navy, so both need it. */}
        <div
          className={cn(
            'shrink-0 bg-brand-band',
            isCollapsed ? 'flex justify-center px-2 py-3' : 'px-4 py-3'
          )}
        >
          {isCollapsed ? (
            <Image
              src="/50-years.gif"
              alt={t('common.fiftyYearsAlt')}
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-sm"
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <Image
                src="/irs-logo.png"
                alt="IRCLASS — Indian Register of Shipping"
                width={132}
                height={30}
                priority
                className="h-[30px] w-auto"
              />
              <Image
                src="/50-years.gif"
                alt={t('common.fiftyYearsAlt')}
                width={44}
                height={44}
                unoptimized
                className="h-11 w-11 rounded-sm"
              />
            </div>
          )}
        </div>

        {/* App name + collapse toggle */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-sidebar-border',
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}
        >
          {isCollapsed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapse}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label={t('navigation.nav')}
            >
              <Menu className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-sidebar-foreground">
                  {t('common.appName')}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {t('common.appSubtitle')}
                </div>
              </div>
              {!mobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleCollapse}
                  className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
                  data-testid="sidebar-toggle"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>

        <nav className={cn('min-h-0 flex-1 space-y-1 overflow-y-auto py-4', isCollapsed ? 'px-2' : 'px-3')}>
          <div className={cn('mb-4', isCollapsed ? 'px-0' : 'px-3')}>
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        onClick={() => setCreateMenuOpen(true)}
                        variant="default"
                        size="sm"
                        className="w-full justify-center px-2"
                        aria-label={t('common.create')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('common.create')}</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuTrigger asChild>
                  <Button
                    onClick={() => setCreateMenuOpen(true)}
                    variant="default"
                    size="sm"
                    className={cn('w-full justify-start', mobile && 'h-11')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('common.create')}
                  </Button>
                </DropdownMenuTrigger>
              )}

              <DropdownMenuContent
                align={isCollapsed ? 'end' : 'start'}
                side={isCollapsed ? 'right' : 'bottom'}
                className="w-48"
              >
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('source')
                  }}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {t('common.source')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('notebook')
                  }}
                  className="gap-2"
                >
                  <Book className="h-4 w-4" />
                  {t('common.notebook')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-1">{memberNav.map(renderItem)}</div>

          {adminNav.length > 0 && (
            <div className="pt-3">
              <Separator className="my-3" />
              {!isCollapsed && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  {t('navigation.administration')}
                </h3>
              )}
              <div className="space-y-1">{adminNav.map(renderItem)}</div>
            </div>
          )}
        </nav>

        {/* App preferences only. Account, organization and sign-out all
            live in the top-right account menu (AppHeader). */}
        <div className={cn('shrink-0 border-t border-sidebar-border p-3', isCollapsed && 'px-2')}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <ThemeToggle iconOnly />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{t('common.theme')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <LanguageToggle iconOnly />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{t('common.language')}</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <ThemeToggle iconOnly />
              <LanguageToggle iconOnly />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
