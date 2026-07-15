'use client'

import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { AdminGuard } from '@/components/auth/AdminGuard'
import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, Cpu, RefreshCw, Wand2, Wrench } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

// Full literal key paths so the i18n unused-key analysis can see them.
const AI_CONFIG_LINKS = [
  {
    href: '/settings/api-keys',
    icon: Cpu,
    titleKey: 'settingsPage.aiModelsTitle',
    descKey: 'settingsPage.aiModelsDesc',
  },
  {
    href: '/transformations',
    icon: Wand2,
    titleKey: 'settingsPage.documentActionsTitle',
    descKey: 'settingsPage.documentActionsDesc',
  },
  {
    href: '/advanced',
    icon: Wrench,
    titleKey: 'settingsPage.maintenanceTitle',
    descKey: 'settingsPage.maintenanceDesc',
  },
] as const

export default function SettingsPage() {
  return (
    <AdminGuard>
      <SettingsPageContent />
    </AdminGuard>
  )
}

function SettingsPageContent() {
  const { t } = useTranslation()
  const { refetch } = useSettings()

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-4xl space-y-8">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold">{t('navigation.settings')}</h1>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <SettingsForm />
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{t('settingsPage.aiConfigTitle')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('settingsPage.aiConfigDesc')}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {AI_CONFIG_LINKS.map(({ href, icon: Icon, titleKey, descKey }) => (
                  <Link key={href} href={href} className="group">
                    <Card className="h-full transition-colors group-hover:border-primary/40">
                      <CardContent className="flex h-full flex-col gap-2 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="font-medium text-sm">{t(titleKey)}</p>
                        <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
