'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowRight,
  Book,
  Check,
  CloudUpload,
  FileText,
  FolderPlus,
  Library,
  MessageCircleQuestion,
  UserPlus,
} from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { sourcesApi } from '@/lib/api/sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useHasAnySources } from '@/lib/hooks/use-sources'
import { useAdminUsage, useAdminUsers } from '@/lib/hooks/use-admin'
import { getDateLocale } from '@/lib/utils/date-locale'
import {
  getRecentQuestions,
  hasAskedAnyQuestion,
  type RecentQuestion,
} from '@/lib/utils/recent-questions'

const EXAMPLE_KEYS = [
  'homePage.example1',
  'homePage.example2',
  'homePage.example3',
  'homePage.example4',
] as const

export default function HomePage() {
  return (
    <AppShell>
      <HomeContent />
    </AppShell>
  )
}

function useGreeting(): string {
  const { t } = useTranslation()
  const hour = new Date().getHours()
  if (hour < 12) return t('homePage.greetingMorning')
  if (hour < 18) return t('homePage.greetingAfternoon')
  return t('homePage.greetingEvening')
}

function HomeContent() {
  const { t, language } = useTranslation()
  const router = useRouter()
  const greeting = useGreeting()
  const { name } = useCurrentUser()
  // useCurrentUser falls back to the email address when the account has no
  // name set — greet those users generically rather than by their email.
  const firstName = name && !name.includes('@') ? name.split(/\s+/)[0] : null
  const { isAdmin } = useIsAdmin()
  const { openSourceDialog, openNotebookDialog } = useCreateDialogs()

  const [question, setQuestion] = useState('')
  const { hasSources, isLoading: sourcesChecking } = useHasAnySources()
  const { data: notebooks } = useNotebooks(false)

  const ask = useCallback(
    (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) return
      // Recording happens on the search page too, but record here so the
      // wizard's "ask your first question" step completes immediately.
      import('@/lib/utils/recent-questions').then(({ recordRecentQuestion }) =>
        recordRecentQuestion(trimmed)
      )
      router.push(`/search?q=${encodeURIComponent(trimmed)}`)
    },
    [router]
  )

  const quickActions = useMemo(() => {
    const actions = [
      {
        key: 'upload',
        title: t('homePage.actionUploadTitle'),
        desc: t('homePage.actionUploadDesc'),
        icon: CloudUpload,
        onClick: openSourceDialog,
      },
      {
        key: 'workspace',
        title: t('homePage.actionWorkspaceTitle'),
        desc: t('homePage.actionWorkspaceDesc'),
        icon: FolderPlus,
        onClick: openNotebookDialog,
      },
      {
        key: 'knowledge',
        title: t('homePage.actionKnowledgeTitle'),
        desc: t('homePage.actionKnowledgeDesc'),
        icon: Library,
        onClick: () => router.push('/sources'),
      },
    ]
    if (isAdmin) {
      actions.push({
        key: 'invite',
        title: t('homePage.actionInviteTitle'),
        desc: t('homePage.actionInviteDesc'),
        icon: UserPlus,
        onClick: () => router.push('/admin?tab=users'),
      })
    }
    return actions
  }, [t, isAdmin, openSourceDialog, openNotebookDialog, router])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-10">
          {/* Greeting — quiet; the ask box below is the page's one priority */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              {t('homePage.welcomeSubtitle')}
            </p>
          </div>

          {/* Ask IRClass Navigator — THE primary action */}
          <section aria-label={t('homePage.askLabel')}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(question)
              }}
              className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
            >
              <label
                htmlFor="home-ask-input"
                className="mb-3 block text-sm font-medium text-foreground"
              >
                {t('homePage.askLabel')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="home-ask-input"
                  autoFocus
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t('homePage.askPlaceholder')}
                  className="h-12 flex-1 border-border bg-background text-base shadow-none focus-visible:ring-2"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!question.trim()}
                  className="h-12 w-12 shrink-0 p-0"
                  aria-label={t('homePage.askButton')}
                >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {EXAMPLE_KEYS.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full font-normal text-muted-foreground hover:text-foreground"
                    onClick={() => ask(t(key))}
                  >
                    {t(key)}
                  </Button>
                ))}
              </div>
            </form>
          </section>

          {/* Quick actions — secondary weight */}
          <section aria-label={t('homePage.getStarted')} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('homePage.getStarted')}
            </h2>
            <div
              className={cn(
                'grid gap-3 sm:grid-cols-2',
                isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
              )}
            >
              {quickActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className="card-hover flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <action.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{action.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {action.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {isAdmin && <AdminStatStrip />}

          {sourcesChecking ? null : hasSources ? (
            <RecentWork notebooks={notebooks ?? []} language={language} />
          ) : (
            <FirstRunWizard
              hasWorkspace={(notebooks?.length ?? 0) > 0}
              onUpload={openSourceDialog}
              onCreateWorkspace={openNotebookDialog}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** One quiet line of counts. Operators see work; managers see numbers. */
function AdminStatStrip() {
  const { t } = useTranslation()
  const { data: usage } = useAdminUsage(true)
  const { data: users } = useAdminUsers(true)
  const { data: docCount } = useQuery({
    queryKey: ['home', 'document-count'],
    // The API caps limit at 100; anything above 422s.
    queryFn: async () => (await sourcesApi.list({ limit: 100 })).length,
    staleTime: 5 * 60 * 1000,
  })

  const queries = usage?.users.reduce(
    (sum, u) => sum + (u.actions['ask'] ?? 0) + (u.actions['search'] ?? 0),
    0
  )

  const stats = [
    docCount !== undefined && {
      label: t('homePage.statDocuments'),
      value: docCount >= 100 ? '99+' : String(docCount),
    },
    users && { label: t('homePage.statUsers'), value: String(users.length) },
    queries !== undefined && { label: t('homePage.statQueries'), value: String(queries) },
  ].filter(Boolean) as { label: string; value: string }[]

  if (stats.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-border py-3 text-sm">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <span className="font-semibold tabular-nums text-foreground">{stat.value}</span>
          <span className="text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}

interface RecentWorkProps {
  notebooks: { id: string; name: string; source_count: number; updated: string }[]
  language: string
}

function RecentWork({ notebooks, language }: RecentWorkProps) {
  const { t } = useTranslation()
  const [questions, setQuestions] = useState<RecentQuestion[]>([])

  useEffect(() => {
    const load = () => setQuestions(getRecentQuestions())
    load()
    window.addEventListener('recent-questions-changed', load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener('recent-questions-changed', load)
      window.removeEventListener('storage', load)
    }
  }, [])

  const { data: recentSources } = useQuery({
    queryKey: ['home', 'recent-sources'],
    queryFn: () => sourcesApi.list({ limit: 5, sort_by: 'updated', sort_order: 'desc' }),
    staleTime: 30 * 1000,
  })

  const relative = (value: string | number) => {
    try {
      return formatDistanceToNow(new Date(value), {
        addSuffix: true,
        locale: getDateLocale(language),
      })
    } catch {
      return null
    }
  }

  return (
    <section className="grid gap-6 md:grid-cols-3">
      {/* Recent workspaces */}
      <RecentColumn
        title={t('homePage.recentWorkspaces')}
        viewAllHref="/notebooks"
        viewAllLabel={t('homePage.viewAll')}
      >
        {notebooks.slice(0, 5).map((nb) => (
          <RecentRow
            key={nb.id}
            href={`/notebooks/${nb.id}`}
            icon={Book}
            title={nb.name}
            meta={t('homePage.docsCount').replace('{count}', String(nb.source_count))}
          />
        ))}
        {notebooks.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t('homePage.noWorkspacesYet')}
          </p>
        )}
      </RecentColumn>

      {/* Recent questions */}
      <RecentColumn
        title={t('homePage.recentQuestions')}
        viewAllHref="/search"
        viewAllLabel={t('homePage.viewAll')}
      >
        {questions.slice(0, 5).map((item) => (
          <RecentRow
            key={item.ts}
            href={`/search?q=${encodeURIComponent(item.q)}`}
            icon={MessageCircleQuestion}
            title={item.q}
            meta={relative(item.ts) ?? undefined}
          />
        ))}
        {questions.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t('homePage.noQuestionsYet')}
          </p>
        )}
      </RecentColumn>

      {/* Recent knowledge */}
      <RecentColumn
        title={t('homePage.recentKnowledge')}
        viewAllHref="/sources"
        viewAllLabel={t('homePage.viewAll')}
      >
        {(recentSources ?? []).slice(0, 5).map((source) => (
          <RecentRow
            key={source.id}
            href={`/sources/${source.id}`}
            icon={FileText}
            title={source.title || t('sources.untitledSource')}
            meta={relative(source.updated) ?? undefined}
          />
        ))}
        {(recentSources ?? []).length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t('homePage.noKnowledgeYet')}
          </p>
        )}
      </RecentColumn>
    </section>
  )
}

function RecentColumn({
  title,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string
  viewAllHref: string
  viewAllLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <Link
          href={viewAllHref}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {viewAllLabel}
        </Link>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function RecentRow({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string
  icon: typeof Book
  title: string
  meta?: string
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
    </Link>
  )
}

interface FirstRunWizardProps {
  hasWorkspace: boolean
  onUpload: () => void
  onCreateWorkspace: () => void
}

/** Numbered onboarding checklist shown while the knowledge base is empty. */
function FirstRunWizard({ hasWorkspace, onUpload, onCreateWorkspace }: FirstRunWizardProps) {
  const { t } = useTranslation()
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    setAsked(hasAskedAnyQuestion())
    const update = () => setAsked(hasAskedAnyQuestion())
    window.addEventListener('recent-questions-changed', update)
    return () => window.removeEventListener('recent-questions-changed', update)
  }, [])

  const steps = [
    {
      title: t('homePage.wizardStep1Title'),
      desc: t('homePage.wizardStep1Desc'),
      done: false, // the wizard is only rendered while no sources exist
      onClick: onUpload,
    },
    {
      title: t('homePage.wizardStep2Title'),
      desc: t('homePage.wizardStep2Desc'),
      done: hasWorkspace,
      onClick: onCreateWorkspace,
    },
    {
      title: t('homePage.wizardStep3Title'),
      desc: t('homePage.wizardStep3Desc'),
      done: asked,
      onClick: () => document.getElementById('home-ask-input')?.focus(),
    },
  ]

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-semibold">{t('homePage.wizardTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('homePage.wizardSubtitle')}</p>
      <ol className="mt-4 space-y-1">
        {steps.map((step, index) => (
          <li key={step.title}>
            <button
              type="button"
              onClick={step.onClick}
              className="flex w-full min-h-[44px] items-center gap-4 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-brand-gold text-brand-gold-foreground'
                    : 'border border-border bg-background text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    step.done && 'text-muted-foreground line-through'
                  )}
                >
                  {step.title}
                </span>
                <span className="block text-xs text-muted-foreground">{step.desc}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}
