'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AxiosError } from 'axios'
import {
  Ban,
  ChevronRight,
  Loader2,
  LogIn,
  MailPlus,
  MoreHorizontal,
  Shield,
  ShieldOff,
  Trash2,
  Undo2,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { AdminGuard } from '@/components/auth/AdminGuard'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AdminUser, AdminOrganization, OrgMember } from '@/lib/api/admin'
import { cn } from '@/lib/utils'
import {
  useAdminInvitations,
  useAdminOrganizations,
  useAdminStatus,
  useAdminUsage,
  useAdminUsers,
  useBanUser,
  useCurrentUserId,
  useDeleteUser,
  useInviteUser,
  useJoinOrganization,
  useOrgMembers,
  useRemoveOrgMember,
  useRevokeInvitation,
  useSetOrgMemberRole,
  useSetUserRole,
} from '@/lib/hooks/use-admin'

// Full literal key paths so the i18n unused-key analysis can see them.
const ACTION_LABEL_KEYS: Record<string, string> = {
  source_created: 'adminPage.actions.sourceCreated',
  note_created: 'adminPage.actions.noteCreated',
  chat_message: 'adminPage.actions.chatMessage',
  search: 'adminPage.actions.search',
  ask: 'adminPage.actions.ask',
  podcast_generated: 'adminPage.actions.podcastGenerated',
  transformation_run: 'adminPage.actions.transformationRun',
  export_report: 'adminPage.actions.exportReport',
}

const ACTION_ORDER = Object.keys(ACTION_LABEL_KEYS)

function errorDetail(error: unknown): string | undefined {
  return (error as AxiosError<{ detail?: string }>)?.response?.data?.detail
}

function formatTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date.toLocaleString()
}

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminPageContent />
    </AdminGuard>
  )
}

function AdminPageContent() {
  const { t } = useTranslation()
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{t('adminPage.title')}</h1>
              <p className="text-muted-foreground mt-2">{t('adminPage.description')}</p>
            </div>

            <Tabs defaultValue="users">
              <TabsList>
                <TabsTrigger value="users">{t('adminPage.usersTab')}</TabsTrigger>
                <TabsTrigger value="usage">{t('adminPage.usageTab')}</TabsTrigger>
              </TabsList>
              <TabsContent value="users" className="space-y-6 mt-4">
                <UsersTab />
              </TabsContent>
              <TabsContent value="usage" className="space-y-6 mt-4">
                <UsageTab />
              </TabsContent>
            </Tabs>

            <div className="text-sm text-muted-foreground">
              {t('adminPage.quickLinks')}{' '}
              <Link className="underline hover:text-foreground" href="/settings/api-keys">
                {t('navigation.models')}
              </Link>
              {' · '}
              <Link className="underline hover:text-foreground" href="/transformations">
                {t('navigation.transformations')}
              </Link>
              {' · '}
              <Link className="underline hover:text-foreground" href="/advanced">
                {t('navigation.advanced')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const { data: status, isLoading: statusLoading } = useAdminStatus()
  const userManagement = status?.user_management ?? false
  const { data: users, isLoading: usersLoading } = useAdminUsers(userManagement)
  const { data: invitations } = useAdminInvitations(userManagement)
  const { data: organizations } = useAdminOrganizations(userManagement)
  const currentUserId = useCurrentUserId()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMode, setInviteMode] = useState<'newOrg' | 'existingOrg'>('newOrg')
  const [inviteOrgName, setInviteOrgName] = useState('')
  const [inviteOrgId, setInviteOrgId] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'ban'
    user: AdminUser
  } | null>(null)

  const inviteUser = useInviteUser()
  const revokeInvitation = useRevokeInvitation()
  const setUserRole = useSetUserRole()
  const banUser = useBanUser()
  const deleteUser = useDeleteUser()

  if (statusLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!userManagement) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t('adminPage.userManagementUnavailable')}
      </Card>
    )
  }

  const inviteReady =
    inviteEmail.trim() !== '' &&
    (inviteMode === 'newOrg' ? inviteOrgName.trim() !== '' : inviteOrgId !== '')

  const handleInvite = () => {
    if (!inviteReady) return
    const email = inviteEmail.trim()
    const input =
      inviteMode === 'newOrg'
        ? { email, organizationName: inviteOrgName.trim() }
        : { email, organizationId: inviteOrgId }
    inviteUser.mutate(input, {
      onSuccess: () => {
        toast.success(t('adminPage.inviteSuccess').replace('{email}', email))
        setInviteEmail('')
        setInviteOrgName('')
      },
      onError: (error) =>
        toast.error(errorDetail(error) ?? t('adminPage.inviteError')),
    })
  }

  const mutationCallbacks = {
    onSuccess: () => toast.success(t('adminPage.actionSuccess')),
    onError: (error: unknown) =>
      toast.error(errorDetail(error) ?? t('adminPage.actionError')),
  }

  return (
    <>
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">{t('adminPage.inviteTitle')}</h2>
        <div className="flex gap-2">
          <Button
            variant={inviteMode === 'newOrg' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setInviteMode('newOrg')}
          >
            {t('adminPage.inviteModeNewOrg')}
          </Button>
          <Button
            variant={inviteMode === 'existingOrg' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setInviteMode('existingOrg')}
          >
            {t('adminPage.inviteModeExistingOrg')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {inviteMode === 'newOrg'
            ? t('adminPage.inviteModeNewOrgDesc')
            : t('adminPage.inviteModeExistingOrgDesc')}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Input
            type="email"
            placeholder={t('adminPage.invitePlaceholder')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            className="max-w-sm"
          />
          {inviteMode === 'newOrg' ? (
            <Input
              placeholder={t('adminPage.orgNamePlaceholder')}
              value={inviteOrgName}
              onChange={(e) => setInviteOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              className="max-w-xs"
            />
          ) : (
            <Select value={inviteOrgId} onValueChange={setInviteOrgId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t('adminPage.selectOrganization')} />
              </SelectTrigger>
              <SelectContent>
                {(organizations ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={handleInvite} disabled={inviteUser.isPending || !inviteReady}>
            {inviteUser.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <MailPlus className="h-4 w-4 mr-2" />
            )}
            {t('adminPage.inviteButton')}
          </Button>
        </div>
        {invitations && invitations.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('adminPage.pendingInvitations')}
            </h3>
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{invitation.email}</span>
                  {invitation.organization_name && (
                    <Badge variant="outline">{invitation.organization_name}</Badge>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revokeInvitation.isPending}
                  onClick={() =>
                    revokeInvitation.mutate(
                      {
                        invitationId: invitation.id,
                        organizationId: invitation.organization_id,
                      },
                      {
                        onSuccess: () => toast.success(t('adminPage.revokeSuccess')),
                        onError: (error) =>
                          toast.error(errorDetail(error) ?? t('adminPage.actionError')),
                      }
                    )
                  }
                >
                  {t('adminPage.revoke')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t('adminPage.usersTitle')}</h2>
        {usersLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y">
            {(users ?? []).map((user) => {
              const isSelf = user.id === currentUserId
              const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
              const lastSignIn = formatTimestamp(user.last_sign_in_at)
              return (
                <div key={user.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{user.email}</span>
                      {user.role === 'admin' ? (
                        <Badge>{t('adminPage.roleAdmin')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('adminPage.roleMember')}</Badge>
                      )}
                      {user.banned && <Badge variant="destructive">{t('adminPage.banned')}</Badge>}
                      {isSelf && <Badge variant="secondary">{t('adminPage.you')}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {name && <span className="mr-2">{name}</span>}
                      {t('adminPage.lastSignIn')}: {lastSignIn ?? t('adminPage.never')}
                    </div>
                  </div>
                  {!isSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.role === 'admin' ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setUserRole.mutate({ userId: user.id, role: null }, mutationCallbacks)
                            }
                          >
                            <ShieldOff className="h-4 w-4 mr-2" />
                            {t('adminPage.removeAdmin')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              setUserRole.mutate(
                                { userId: user.id, role: 'admin' },
                                mutationCallbacks
                              )
                            }
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            {t('adminPage.makeAdmin')}
                          </DropdownMenuItem>
                        )}
                        {user.banned ? (
                          <DropdownMenuItem
                            onClick={() =>
                              banUser.mutate({ userId: user.id, ban: false }, mutationCallbacks)
                            }
                          >
                            <Undo2 className="h-4 w-4 mr-2" />
                            {t('adminPage.unbanUser')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: 'ban', user })}>
                            <Ban className="h-4 w-4 mr-2" />
                            {t('adminPage.banUser')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmAction({ type: 'delete', user })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('adminPage.deleteUser')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t('adminPage.organizationsTitle')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('adminPage.organizationsDesc')}
        </p>
        {(organizations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminPage.organizationsEmpty')}</p>
        ) : (
          <div className="divide-y">
            {(organizations ?? []).map((org) => (
              <OrgRow key={org.id} org={org} />
            ))}
          </div>
        )}
      </Card>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'delete'
                ? t('adminPage.deleteConfirmTitle')
                : t('adminPage.banConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(confirmAction?.type === 'delete'
                ? t('adminPage.deleteConfirmDesc')
                : t('adminPage.banConfirmDesc')
              ).replace('{email}', confirmAction?.user.email ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return
                if (confirmAction.type === 'delete') {
                  deleteUser.mutate(confirmAction.user.id, mutationCallbacks)
                } else {
                  banUser.mutate({ userId: confirmAction.user.id, ban: true }, mutationCallbacks)
                }
                setConfirmAction(null)
              }}
            >
              {confirmAction?.type === 'delete'
                ? t('adminPage.deleteUser')
                : t('adminPage.banUser')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function OrgRow({ org }: { org: AdminOrganization }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null)

  const joinOrganization = useJoinOrganization()
  const { data: members, isLoading } = useOrgMembers(org.id, expanded)
  const setRole = useSetOrgMemberRole()
  const removeMember = useRemoveOrgMember()

  const memberCallbacks = {
    onSuccess: () => toast.success(t('adminPage.actionSuccess')),
    onError: (error: unknown) =>
      toast.error(errorDetail(error) ?? t('adminPage.actionError')),
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{org.name}</span>
            <span className="block text-xs text-muted-foreground">
              {t('adminPage.membersCount').replace(
                '{count}',
                String(org.members_count ?? 0)
              )}
            </span>
          </span>
        </button>
        <Button
          variant="outline"
          size="sm"
          disabled={joinOrganization.isPending}
          onClick={() =>
            joinOrganization.mutate(org.id, {
              onSuccess: () =>
                toast.success(t('adminPage.joinSuccess').replace('{org}', org.name)),
              onError: (error) =>
                toast.error(errorDetail(error) ?? t('adminPage.joinError')),
            })
          }
        >
          {joinOrganization.isPending && joinOrganization.variables === org.id ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="mr-2 h-4 w-4" />
          )}
          {t('adminPage.joinButton')}
        </Button>
      </div>

      {expanded && (
        <div className="ml-6 mt-3 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (members ?? []).length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">
              {t('adminPage.noMembers')}
            </p>
          ) : (
            (members ?? []).map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-2 py-1 text-sm"
              >
                <span className="min-w-0 truncate">{m.email ?? m.user_id}</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onValueChange={(role) =>
                      setRole.mutate(
                        {
                          organizationId: org.id,
                          userId: m.user_id,
                          role: role as 'org:admin' | 'org:member',
                        },
                        memberCallbacks
                      )
                    }
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org:admin">
                        {t('adminPage.orgRoleAdmin')}
                      </SelectItem>
                      <SelectItem value="org:member">
                        {t('adminPage.orgRoleMember')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={t('adminPage.removeMember')}
                    onClick={() => setConfirmRemove(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('adminPage.removeMemberConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminPage.removeMemberConfirmDesc')
                .replace('{email}', confirmRemove?.email ?? confirmRemove?.user_id ?? '')
                .replace('{org}', org.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmRemove) return
                removeMember.mutate(
                  { organizationId: org.id, userId: confirmRemove.user_id },
                  memberCallbacks
                )
                setConfirmRemove(null)
              }}
            >
              {t('adminPage.removeMember')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function UsageTab() {
  const { t } = useTranslation()
  const { data: usage, isLoading } = useAdminUsage()

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const users = usage?.users ?? []
  const recent = usage?.recent ?? []

  return (
    <>
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t('adminPage.usageTitle')}</h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminPage.usageEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">{t('adminPage.usersTitle')}</th>
                  {ACTION_ORDER.map((action) => (
                    <th key={action} className="py-2 pr-4 font-medium whitespace-nowrap">
                      {t(ACTION_LABEL_KEYS[action])}
                    </th>
                  ))}
                  <th className="py-2 pr-4 font-medium">{t('adminPage.usageTotal')}</th>
                  <th className="py-2 font-medium whitespace-nowrap">{t('adminPage.lastActive')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{user.email ?? user.user_id}</td>
                    {ACTION_ORDER.map((action) => (
                      <td key={action} className="py-2 pr-4">
                        {user.actions[action] ?? 0}
                      </td>
                    ))}
                    <td className="py-2 pr-4 font-medium">{user.total}</td>
                    <td className="py-2 whitespace-nowrap">
                      {formatTimestamp(user.last_active) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {recent.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-semibold">{t('adminPage.recentActivity')}</h2>
          <div className="space-y-1">
            {recent.map((event, index) => (
              <div
                key={`${event.user_id}-${event.created}-${index}`}
                className="flex items-center justify-between text-sm py-1"
              >
                <span className="truncate">
                  <span className="font-medium">{event.email ?? event.user_id}</span>
                  <span className="text-muted-foreground">
                    {' — '}
                    {ACTION_LABEL_KEYS[event.action] ? t(ACTION_LABEL_KEYS[event.action]) : event.action}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                  {formatTimestamp(event.created)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
