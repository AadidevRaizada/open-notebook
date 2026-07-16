'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowUp,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Lightbulb,
  Mail,
  Paperclip,
  RefreshCw,
  Save,
  Settings2,
  Compass,
  StickyNote,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTranslation } from '@/lib/hooks/use-translation'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AdvancedModelsDialog } from '@/components/search/AdvancedModelsDialog'
import { SaveToNotebooksDialog } from '@/components/search/SaveToNotebooksDialog'
import { convertReferencesToCompactMarkdown, type ReferenceType } from '@/lib/utils/source-references'
import { useSearch } from '@/lib/hooks/use-search'
import { useAsk } from '@/lib/hooks/use-ask'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useHasAnySources } from '@/lib/hooks/use-sources'
import { useConnectGmail, useGmailStatus } from '@/lib/hooks/use-gmail'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { useCurrentUser, useUserAvatar } from '@/lib/hooks/use-current-user'
import type { EmailResultItem, RetrievalMode } from '@/lib/types/search'
import {
  recordRecentQuestion,
  recordRecentAnswer,
  getRecentQuestionById,
  type StoredSource,
} from '@/lib/utils/recent-questions'
import { cn } from '@/lib/utils'

// Full key paths so i18n static analysis (locales/index.test.ts) can see them
const EXAMPLE_PROMPTS = [
  { key: 'searchPage.examplePrompts.certRequirements' },
  { key: 'searchPage.examplePrompts.complianceUpdates' },
  { key: 'searchPage.examplePrompts.relatedDocuments' },
  { key: 'searchPage.examplePrompts.processExplainer' },
] as const

interface Turn {
  id: number
  question: string
  answer: string
  /** True when AI answers are unavailable — the turn shows the notice instead. */
  noAi?: boolean
}

export default function SearchPage() {
  return (
    <AppShell>
      <SearchConversation />
    </AppShell>
  )
}

const RETRIEVAL_MODE_STORAGE_KEY = 'gmail-retrieval-mode'

function loadRetrievalMode(): RetrievalMode {
  if (typeof window === 'undefined') return 'auto'
  const stored = localStorage.getItem(RETRIEVAL_MODE_STORAGE_KEY)
  return stored === 'documents' || stored === 'documents_gmail' ? stored : 'auto'
}

function SearchConversation() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get('q') || ''
  const urlAnswerId = searchParams?.get('a') || ''
  // Old deep links with ?mode=search still work (list only, no answer).
  const urlSearchOnly = searchParams?.get('mode') === 'search'
  const urlGmailResult = searchParams?.get('gmail')

  const [question, setQuestion] = useState('')
  const [includeNotes, setIncludeNotes] = useState(true)
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>(loadRetrievalMode)
  // Email threads for the sources panel — captured from the stream before the
  // ask state resets, cleared on the next query.
  const [panelEmails, setPanelEmails] = useState<EmailResultItem[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveTurn, setSaveTurn] = useState<Turn | null>(null)

  // Sources panel content — decoupled from the live search so a replayed
  // (stored) answer can show its own saved provenance.
  const [panelSources, setPanelSources] = useState<StoredSource[] | null>(null)
  const [lastQuery, setLastQuery] = useState('')
  const panelSourcesRef = useRef<StoredSource[] | null>(null)
  panelSourcesRef.current = panelSources

  // Advanced models dialog (admin only)
  const [showAdvancedModels, setShowAdvancedModels] = useState(false)
  const [customModels, setCustomModels] = useState<{
    strategy: string
    answer: string
    finalAnswer: string
  } | null>(null)

  const searchMutation = useSearch()
  const ask = useAsk()
  const { isStreaming, finalAnswer, answers, error: askError, reset: resetAsk } = ask
  const { data: modelDefaults, isLoading: modelsLoading } = useModelDefaults()
  const { data: availableModels } = useModels()
  const { openModal } = useModalManager()
  const { openSourceDialog } = useCreateDialogs()
  const { hasSources, isLoading: sourcesLoading } = useHasAnySources()
  const { isAdmin } = useIsAdmin()
  const { name } = useCurrentUser()
  const userAvatar = useUserAvatar()
  const { data: gmailStatus } = useGmailStatus()
  const connectGmail = useConnectGmail()
  const gmailConnected = !!gmailStatus?.connected

  const changeRetrievalMode = useCallback((mode: RetrievalMode) => {
    setRetrievalMode(mode)
    try {
      localStorage.setItem(RETRIEVAL_MODE_STORAGE_KEY, mode)
    } catch {
      /* storage unavailable — mode still applies for this session */
    }
  }, [])

  // Returning from the Google consent screen: toast + strip the param.
  const gmailToastShownRef = useRef(false)
  useEffect(() => {
    if (!urlGmailResult || gmailToastShownRef.current) return
    gmailToastShownRef.current = true
    if (urlGmailResult === 'connected') {
      toast.success(t('gmail.connectedToast'))
    } else {
      toast.error(t('gmail.connectErrorToast'))
    }
    router.replace('/search', { scroll: false })
  }, [urlGmailResult, router, t])

  const initials = useMemo(() => {
    if (!name || name.includes('@')) return 'U'
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
  }, [name])

  const modelNameById = useMemo(() => {
    if (!availableModels) return new Map<string, string>()
    return new Map(availableModels.map((model) => [model.id, model.name]))
  }, [availableModels])

  const resolveModelName = (id?: string | null) => {
    if (!id) return t('searchPage.notSet')
    return modelNameById.get(id) ?? id
  }

  const hasEmbeddingModel = !!modelDefaults?.default_embedding_model
  // The answer stream needs both a chat model and retrieval (embeddings).
  const canAsk = !!modelDefaults?.default_chat_model && hasEmbeddingModel

  // Typewriter placeholder — cycles the generic prompt + example questions.
  const placeholderPhrases = useMemo(
    () => [t('searchPage.unifiedPlaceholder'), ...EXAMPLE_PROMPTS.map((p) => t(p.key))],
    [t]
  )
  const typedPlaceholder = useTypewriterPlaceholder(placeholderPhrases, question.length === 0)

  const hasAutoTriggeredRef = useRef(false)

  const runQuery = useCallback(
    (rawQuestion: string) => {
      const q = rawQuestion.trim()
      if (!q || modelsLoading || isStreaming) return

      setActiveQuestion(q)
      setQuestion('')
      setLastQuery(q)
      setPanelEmails([])
      recordRecentQuestion(q)

      searchMutation.mutate({
        query: q,
        type: hasEmbeddingModel ? 'vector' : 'text',
        limit: 100,
        search_sources: true,
        search_notes: includeNotes,
        minimum_score: 0.2,
      })

      if (canAsk && modelDefaults?.default_chat_model) {
        const models = customModels || {
          strategy: modelDefaults.default_chat_model,
          answer: modelDefaults.default_chat_model,
          finalAnswer: modelDefaults.default_chat_model,
        }
        ask.sendAsk(q, models, gmailConnected ? retrievalMode : 'documents')
      } else {
        setTurns((prev) => [...prev, { id: Date.now(), question: q, answer: '', noAi: true }])
        setActiveQuestion(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelsLoading, isStreaming, hasEmbeddingModel, includeNotes, canAsk, modelDefaults, customModels, gmailConnected, retrievalMode]
  )

  // Capture email threads for the sources panel before the ask state resets.
  useEffect(() => {
    if (ask.emailResults.length > 0) {
      setPanelEmails(ask.emailResults)
    }
  }, [ask.emailResults])

  // Keep the Sources panel in sync with the latest live search.
  useEffect(() => {
    if (searchMutation.data) {
      setPanelSources(
        searchMutation.data.results.map((r) => ({
          title: r.title,
          parent_id: r.parent_id,
          matches: r.matches,
        }))
      )
    }
  }, [searchMutation.data])

  // Commit the active exchange once the answer stream completes, and persist
  // the answer so it can be re-opened later without re-querying.
  useEffect(() => {
    if (activeQuestion && !isStreaming && finalAnswer !== null) {
      const q = activeQuestion
      const a = finalAnswer
      const sources = panelSourcesRef.current ?? undefined
      setTurns((prev) => [...prev, { id: Date.now(), question: q, answer: a }])
      recordRecentAnswer(q, a, sources)
      setActiveQuestion(null)
      resetAsk()
    }
  }, [isStreaming, finalAnswer, activeQuestion, resetAsk])

  // Replay a stored answer when arriving with ?a=<ts> — no re-query.
  useEffect(() => {
    if (hasAutoTriggeredRef.current || !urlAnswerId) return
    const ts = Number(urlAnswerId)
    const stored = Number.isFinite(ts) ? getRecentQuestionById(ts) : undefined
    if (stored?.a) {
      hasAutoTriggeredRef.current = true
      setTurns([{ id: stored.ts, question: stored.q, answer: stored.a }])
      setPanelSources(stored.sources ?? [])
      setLastQuery(stored.q)
    }
  }, [urlAnswerId])

  // Auto-trigger a fresh ask when arriving with ?q=… (unless replaying stored).
  useEffect(() => {
    if (hasAutoTriggeredRef.current || !urlQuery || modelsLoading || urlSearchOnly) return
    hasAutoTriggeredRef.current = true
    runQuery(urlQuery)
  }, [urlQuery, urlSearchOnly, modelsLoading, runQuery])

  // Keep the conversation scrolled to the newest message.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, activeQuestion, answers.length, finalAnswer])

  const handleReferenceClick = useCallback(
    (type: string, id: string) => {
      const modalType = type === 'source_insight' ? 'insight' : (type as 'source' | 'note' | 'insight')
      openModal(modalType, id)
    },
    [openModal]
  )

  const handleSubmit = useCallback(() => {
    if (!question.trim()) return
    runQuery(question)
  }, [question, runQuery])

  const openSaveDialog = (turn: Turn) => {
    setSaveTurn(turn)
    setShowSaveDialog(true)
  }

  const isEmpty = turns.length === 0 && !activeQuestion
  const sourcesBusy = searchMutation.isPending

  // While a question is in flight we show a phase-based status ("Thinking…",
  // "Formulating a strategy…", …) instead of the intermediate strategy/answer
  // text — those internals stay hidden; only the final answer is shown.
  const gmailActiveForQuery = gmailConnected && retrievalMode !== 'documents'

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Conversation column ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
            {/* First-time user: knowledge base is empty */}
            {!sourcesLoading && !hasSources && (
              <div className="mb-8 flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{t('searchPage.emptyKbTitle')}</p>
                    <p className="text-sm text-muted-foreground">{t('searchPage.emptyKbDesc')}</p>
                  </div>
                </div>
                <Button onClick={openSourceDialog} className="shrink-0">
                  <FileText className="mr-2 h-4 w-4" />
                  {t('searchPage.emptyKbAction')}
                </Button>
              </div>
            )}

            {isEmpty ? (
              <EmptyConversation onPick={runQuery} />
            ) : (
              <div className="space-y-10">
                {turns.map((turn) => (
                  <Exchange
                    key={turn.id}
                    turn={turn}
                    initials={initials}
                    avatarUrl={userAvatar}
                    aiNotConfigured={t('searchPage.aiNotConfigured')}
                    onReferenceClick={handleReferenceClick}
                    onSave={() => openSaveDialog(turn)}
                    onRegenerate={() => runQuery(turn.question)}
                  />
                ))}

                {/* Active (streaming) exchange */}
                {activeQuestion && (
                  <div className="space-y-5">
                    <UserBubble text={activeQuestion} initials={initials} avatarUrl={userAvatar} />
                    <AssistantMessage>
                      {askError ? (
                        <p className="text-sm text-destructive">{askError}</p>
                      ) : finalAnswer ? (
                        <AnswerBody content={finalAnswer} onReferenceClick={handleReferenceClick} />
                      ) : (
                        <ThinkingIndicator
                          hasStrategy={!!ask.strategy}
                          hasAnswers={ask.answers.length > 0 || ask.emailResults.length > 0}
                          gmailActive={gmailActiveForQuery}
                        />
                      )}
                    </AssistantMessage>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Sticky composer ───────────────────────────────────────── */}
        <div className="shrink-0 bg-background/80 px-4 pb-4 pt-2 backdrop-blur sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {!canAsk && !modelsLoading && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{t('searchPage.aiNotConfigured')}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
              className="rounded-2xl border border-border bg-card shadow-sm transition-shadow duration-200 focus-within:border-ring focus-within:shadow-md"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={openSourceDialog}
                  aria-label={t('searchPage.emptyKbAction')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={question ? '' : typedPlaceholder}
                  disabled={isStreaming}
                  autoFocus
                  autoComplete="off"
                  aria-label={t('common.accessibility.enterQuestion')}
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
                />
                <Button
                  type="submit"
                  disabled={isStreaming || !question.trim()}
                  className="h-10 w-10 shrink-0 rounded-full p-0"
                  aria-label={t('searchPage.ask')}
                >
                  {isStreaming ? <LoadingSpinner size="sm" /> : <ArrowUp className="h-5 w-5" />}
                </Button>
              </div>

              {/* Quiet control row: include-notes + Gmail retrieval + admin models */}
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-3">
                  <label className="flex min-h-8 shrink-0 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={includeNotes}
                      onCheckedChange={(checked) => setIncludeNotes(checked as boolean)}
                      disabled={isStreaming}
                    />
                    <span className="whitespace-nowrap">{t('searchPage.includeNotes')}</span>
                  </label>

                  {/* Retrieval scope: Auto (planner decides) / Documents / Documents+Gmail.
                      Members manage the connection itself under Connected Services. */}
                  {gmailStatus?.configured &&
                    (gmailConnected ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isStreaming}
                            className="h-8 min-w-0 px-2 text-xs text-muted-foreground"
                          >
                            <Mail className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {retrievalMode === 'auto'
                                ? t('gmail.modeAuto')
                                : retrievalMode === 'documents'
                                  ? t('gmail.modeDocuments')
                                  : t('gmail.modeDocumentsGmail')}
                            </span>
                            <ChevronDown className="ml-1 h-3 w-3 shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuRadioGroup
                            value={retrievalMode}
                            onValueChange={(v) => changeRetrievalMode(v as RetrievalMode)}
                          >
                            <DropdownMenuRadioItem value="auto">
                              <div className="flex flex-col">
                                <span>{t('gmail.modeAuto')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t('gmail.modeAutoDesc')}
                                </span>
                              </div>
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="documents">
                              <div className="flex flex-col">
                                <span>{t('gmail.modeDocuments')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t('gmail.modeDocumentsDesc')}
                                </span>
                              </div>
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="documents_gmail">
                              <div className="flex flex-col">
                                <span>{t('gmail.modeDocumentsGmail')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t('gmail.modeDocumentsGmailDesc')}
                                </span>
                              </div>
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={connectGmail.isPending}
                        onClick={() => connectGmail.mutate()}
                        className="h-8 min-w-0 px-2 text-xs text-muted-foreground"
                      >
                        <Mail className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t('gmail.connect')}</span>
                      </Button>
                    ))}
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {t('searchPage.pressToSubmit')}
                  </span>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isStreaming}
                      onClick={() => setShowAdvancedModels(true)}
                      className="h-8 min-w-0 px-2 text-xs text-muted-foreground"
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {customModels
                          ? t('searchPage.usingCustomModels')
                          : t('searchPage.usingDefaultModels')}
                      </span>
                      <span className="ml-1.5 hidden truncate font-medium text-foreground/70 md:inline">
                        {resolveModelName(customModels?.answer || modelDefaults?.default_chat_model)}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </form>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t('searchPage.conversationDisclaimer')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Sources panel (NotebookLM-style provenance) ───────────────── */}
      <aside
        aria-label={t('searchPage.matchingKnowledge')}
        className="hidden w-80 shrink-0 flex-col border-l border-border bg-card lg:flex"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('searchPage.sources')}</h2>
          {(panelSources?.length ?? 0) + panelEmails.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {(panelSources?.length ?? 0) + panelEmails.length}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sourcesBusy ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner size="sm" />
            </div>
          ) : (panelSources && panelSources.length > 0) || panelEmails.length > 0 ? (
            <div className="space-y-4">
              {/* Unified provenance: email threads + documents, each typed by icon. */}
              {panelEmails.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('gmail.matchingEmails')}
                  </p>
                  {panelEmails.map((email) => (
                    <EmailCard key={email.thread_id} email={email} />
                  ))}
                </div>
              )}
              {panelSources && panelSources.length > 0 && (
                <div className="space-y-2">
                  {panelEmails.length > 0 && (
                    <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('searchPage.matchingKnowledge')}
                    </p>
                  )}
                  {panelSources.map((result, i) => (
                    <SourceCard key={`${result.parent_id}-${i}`} result={result} onOpen={handleReferenceClick} />
                  ))}
                </div>
              )}
            </div>
          ) : panelSources ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">
              {t('searchPage.noResultsFor').replace('{query}', lastQuery)}
            </p>
          ) : (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">
              {t('searchPage.sourcesEmpty')}
            </p>
          )}
        </div>
      </aside>

      {/* Admin advanced-models dialog */}
      {isAdmin && (
        <AdvancedModelsDialog
          open={showAdvancedModels}
          onOpenChange={setShowAdvancedModels}
          defaultModels={{
            strategy: customModels?.strategy || modelDefaults?.default_chat_model || '',
            answer: customModels?.answer || modelDefaults?.default_chat_model || '',
            finalAnswer: customModels?.finalAnswer || modelDefaults?.default_chat_model || '',
          }}
          onSave={setCustomModels}
        />
      )}

      {/* Save to workspace */}
      {saveTurn && (
        <SaveToNotebooksDialog
          open={showSaveDialog}
          onOpenChange={(open) => {
            setShowSaveDialog(open)
            if (!open) setSaveTurn(null)
          }}
          question={saveTurn.question}
          answer={saveTurn.answer}
        />
      )}
    </div>
  )
}

/**
 * Cycles a set of phrases with a type → pause → delete → next rhythm, exposed
 * as the input placeholder. Collapses to the first phrase when the field has
 * content or the user prefers reduced motion.
 */
function useTypewriterPlaceholder(phrases: string[], enabled: boolean): string {
  const [text, setText] = useState(phrases[0] ?? '')

  useEffect(() => {
    const first = phrases[0] ?? ''
    if (!enabled) {
      setText(first)
      return
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setText(first)
      return
    }

    let phrase = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const current = phrases[phrase] ?? ''
      if (!deleting) {
        char += 1
        setText(current.slice(0, char))
        if (char >= current.length) {
          deleting = true
          timer = setTimeout(tick, 1800) // hold the full phrase
          return
        }
        timer = setTimeout(tick, 45)
      } else {
        char -= 1
        setText(current.slice(0, Math.max(0, char)))
        if (char <= 0) {
          deleting = false
          phrase = (phrase + 1) % phrases.length
          timer = setTimeout(tick, 400)
          return
        }
        timer = setTimeout(tick, 22)
      }
    }

    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [enabled, phrases])

  return text
}

/**
 * Phase-based status shown while an answer is in flight. We never surface the
 * model's intermediate strategy or per-search answers — the user just sees
 * that Navigator is thinking, then the final answer. Messages rotate within a
 * phase for a bit of life, and stop entirely under reduced-motion.
 */
function ThinkingIndicator({
  hasStrategy,
  hasAnswers,
  gmailActive,
}: {
  hasStrategy: boolean
  hasAnswers: boolean
  gmailActive: boolean
}) {
  const { t } = useTranslation()

  const messages = useMemo(() => {
    if (hasAnswers) return [t('searchPage.thinking.composing')]
    if (hasStrategy) {
      return gmailActive
        ? [t('searchPage.thinking.searching'), t('searchPage.thinking.readingEmails')]
        : [t('searchPage.thinking.searching')]
    }
    return [t('searchPage.thinking.thinking'), t('searchPage.thinking.strategizing')]
  }, [hasStrategy, hasAnswers, gmailActive, t])

  const [index, setIndex] = useState(0)

  // Reset to the first message whenever the phase (message set) changes.
  useEffect(() => {
    setIndex(0)
  }, [messages])

  useEffect(() => {
    if (messages.length <= 1) return
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length)
    }, 1800)
    return () => clearInterval(id)
  }, [messages])

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="sm" />
      <span className="animate-pulse">{messages[index] ?? messages[0]}</span>
    </div>
  )
}

/** Centered welcome shown before the first question. */
function EmptyConversation({ onPick }: { onPick: (q: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Compass className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('searchPage.unifiedTitle')}
      </h1>
      <p className="mt-2 max-w-md text-base text-muted-foreground">
        {t('searchPage.unifiedSubtitle')}
      </p>
      <p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t('searchPage.tryAsking')}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt.key}
            type="button"
            onClick={() => onPick(t(prompt.key))}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t(prompt.key)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A committed question/answer pair. */
function Exchange({
  turn,
  initials,
  avatarUrl,
  aiNotConfigured,
  onReferenceClick,
  onSave,
  onRegenerate,
}: {
  turn: Turn
  initials: string
  avatarUrl: string | null
  aiNotConfigured: string
  onReferenceClick: (type: string, id: string) => void
  onSave: () => void
  onRegenerate: () => void
}) {
  return (
    <div className="group space-y-5">
      <UserBubble text={turn.question} initials={initials} avatarUrl={avatarUrl} />
      <AssistantMessage>
        {turn.noAi ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{aiNotConfigured}</span>
          </div>
        ) : (
          <>
            <AnswerBody content={turn.answer} onReferenceClick={onReferenceClick} />
            <MessageActions content={turn.answer} onSave={onSave} onRegenerate={onRegenerate} />
          </>
        )}
      </AssistantMessage>
    </div>
  )
}

/** Right-aligned user message — a compact chat bubble. */
function UserBubble({
  text,
  initials,
  avatarUrl,
}: {
  text: string
  initials: string
  avatarUrl?: string | null
}) {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
        {text}
      </div>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
      )}
    </div>
  )
}

/** Left-aligned assistant message — wide, content-first, no heavy card. */
function AssistantMessage({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Compass className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-xs font-semibold text-foreground">{t('common.appName')}</p>
        {children}
      </div>
    </div>
  )
}

// Sentinel used to strip the reference list that convertReferencesToCompactMarkdown
// appends — we render numbered badges inline and rely on the Sources panel for
// the full provenance, so the trailing list is unwanted.
const REF_LIST_SENTINEL = '§IRCLASS_REFS§'

function AnswerBody({
  content,
  onReferenceClick,
}: {
  content: string
  onReferenceClick: (type: string, id: string) => void
}) {
  const numbered = useMemo(() => {
    const withList = convertReferencesToCompactMarkdown(content, REF_LIST_SENTINEL)
    return withList.split(`\n\n${REF_LIST_SENTINEL}:`)[0]
  }, [content])

  const CitationLink = useMemo(() => makeCitationLink(onReferenceClick), [onReferenceClick])

  return <MarkdownRenderer components={{ a: CitationLink }}>{numbered}</MarkdownRenderer>
}

/** Renders `#ref-…` links as compact numbered citation badges. */
function makeCitationLink(onReferenceClick: (type: string, id: string) => void) {
  const CitationLink = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string; children?: React.ReactNode }) => {
    if (href?.startsWith('#ref-')) {
      const parts = href.substring(5).split('-')
      const type = parts[0] as ReferenceType
      const id = parts.slice(1).join('-')
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReferenceClick(type, id)
          }}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-primary/10 px-1 align-super text-[10px] font-semibold leading-none text-primary no-underline transition-colors hover:bg-primary/20"
        >
          {children}
        </button>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
        {children}
      </a>
    )
  }
  CitationLink.displayName = 'CitationLink'
  return CitationLink
}

/** Hover-revealed actions under an answer. */
function MessageActions({
  content,
  onSave,
  onRegenerate,
}: {
  content: string
  onSave: () => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success(t('common.copyToClipboard'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('common.error'))
    }
  }

  const action = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        {action(
          t('common.copyToClipboard'),
          copied ? <Check className="h-3.5 w-3.5 text-brand-gold" /> : <Copy className="h-3.5 w-3.5" />,
          copy
        )}
        {action(t('searchPage.saveToWorkspace'), <Save className="h-3.5 w-3.5" />, onSave)}
        {action(t('searchPage.regenerate'), <RefreshCw className="h-3.5 w-3.5" />, onRegenerate)}
      </div>
    </TooltipProvider>
  )
}

/** Email thread card in the provenance panel — links out to Gmail. */
function EmailCard({ email }: { email: EmailResultItem }) {
  const { t } = useTranslation()
  const sender = email.participants[0] ?? ''
  const date = email.last_date ? new Date(email.last_date).toLocaleDateString() : ''

  return (
    <a
      href={email.web_link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('gmail.openInGmail')}
      className="card-hover flex w-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {email.subject}
        </span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </div>
      <p className="truncate pl-6 text-xs text-muted-foreground">
        {sender}
        {date && ` · ${date}`}
        {email.message_count > 1 && ` · ${email.message_count} ✉`}
      </p>
      {email.snippet && (
        <p className="line-clamp-2 pl-6 text-xs leading-relaxed text-muted-foreground">
          {email.snippet}
        </p>
      )}
    </a>
  )
}

/** Compact source card in the provenance panel. */
function SourceCard({
  result,
  onOpen,
}: {
  result: StoredSource
  onOpen: (type: string, id: string) => void
}) {
  const { t } = useTranslation()
  const [type, id] = (result.parent_id ?? '').split(':')
  const excerpt = result.matches?.[0]

  const Icon = type === 'note' ? StickyNote : type === 'source_insight' ? Lightbulb : FileText

  if (!id) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(type, id)}
      className="card-hover flex w-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {result.title || t('sources.untitledSource')}
        </span>
      </div>
      {excerpt && (
        <p className={cn('pl-6 text-xs leading-relaxed text-muted-foreground', 'line-clamp-3')}>
          {excerpt}
        </p>
      )}
      {result.matches && result.matches.length > 1 && (
        <p className="pl-6 text-[11px] text-muted-foreground/70">
          {t('searchPage.matches').replace('{count}', String(result.matches.length))}
        </p>
      )}
    </button>
  )
}
