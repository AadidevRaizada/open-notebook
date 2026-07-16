'use client'

import { formatDistanceToNow } from 'date-fns'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useConnectGmail,
  useDisconnectGmail,
  useGmailStatus,
} from '@/lib/hooks/use-gmail'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'

/**
 * Connected Services — shown inside the account menu (Clerk user profile).
 * Connectors live here, never as source types: users manage the link between
 * Navigator and their external accounts in one place.
 */
export function ConnectedServicesPanel() {
  const { t, i18n } = useTranslation()
  const { data: status, isLoading } = useGmailStatus()
  const connectGmail = useConnectGmail()
  const disconnectGmail = useDisconnectGmail()

  const lastChecked = status?.last_sync_at
    ? formatDistanceToNow(new Date(status.last_sync_at), {
        addSuffix: true,
        locale: getDateLocale(i18n.language),
      })
    : null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {t('gmail.connectedServices')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('gmail.connectedServicesDesc')}
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Mail className="h-4 w-4 text-foreground/70" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Gmail</span>
                {status?.connected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('gmail.connected')}
                  </span>
                )}
              </div>
              {status?.connected ? (
                <div className="mt-0.5 space-y-0.5">
                  <p className="truncate text-sm text-muted-foreground">{status.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {lastChecked
                      ? t('gmail.lastChecked', { time: lastChecked })
                      : t('gmail.liveAccess')}
                  </p>
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t('gmail.notConnectedDesc')}
                </p>
              )}
            </div>
          </div>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status?.connected ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => disconnectGmail.mutate()}
              disabled={disconnectGmail.isPending}
            >
              {disconnectGmail.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {t('gmail.disconnect')}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() => connectGmail.mutate()}
              disabled={connectGmail.isPending || status?.configured === false}
            >
              {connectGmail.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {t('gmail.connect')}
            </Button>
          )}
        </div>
        {status?.configured === false && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('gmail.notConfigured')}
          </p>
        )}
      </div>
    </div>
  )
}
