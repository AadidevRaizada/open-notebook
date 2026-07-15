'use client'

import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { AppShell } from '@/components/layout/AppShell'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ChevronDown,
  AlertCircle,
  Settings2,
  Save,
  ArrowUp,
  FileText,
} from 'lucide-react'
import { useSearch } from '@/lib/hooks/use-search'
import { useAsk } from '@/lib/hooks/use-ask'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useHasAnySources } from '@/lib/hooks/use-sources'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { recordRecentQuestion } from '@/lib/utils/recent-questions'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { StreamingResponse } from '@/components/search/StreamingResponse'
import { AdvancedModelsDialog } from '@/components/search/AdvancedModelsDialog'
import { SaveToNotebooksDialog } from '@/components/search/SaveToNotebooksDialog'

// Full key paths so i18n static analysis (locales/index.test.ts) can see them
const EXAMPLE_PROMPTS = [
  { key: 'searchPage.examplePrompts.certRequirements' },
  { key: 'searchPage.examplePrompts.complianceUpdates' },
  { key: 'searchPage.examplePrompts.relatedDocuments' },
  { key: 'searchPage.examplePrompts.processExplainer' },
] as const

export default function SearchPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get('q') || ''
  // Old deep links with ?mode=search still work (list only, no answer),
  // but no UI exposes the mode anymore — typing is enough.
  const urlSearchOnly = searchParams?.get('mode') === 'search'

  const [question, setQuestion] = useState(urlQuery)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [searchOnly, setSearchOnly] = useState(urlSearchOnly)

  // Advanced models dialog (admin only)
  const [showAdvancedModels, setShowAdvancedModels] = useState(false)
  const [customModels, setCustomModels] = useState<{
    strategy: string
    answer: string
    finalAnswer: string
  } | null>(null)

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [submittedQuestion, setSubmittedQuestion] = useState('')

  const searchMutation = useSearch()
  const ask = useAsk()
  const { data: modelDefaults, isLoading: modelsLoading } = useModelDefaults()
  const { data: availableModels } = useModels()
  const { openModal } = useModalManager()
  const { openSourceDialog } = useCreateDialogs()
  const { hasSources, isLoading: sourcesLoading } = useHasAnySources()
  const { isAdmin } = useIsAdmin()

  const modelNameById = useMemo(() => {
    if (!availableModels) {
      return new Map<string, string>()
    }
    return new Map(availableModels.map((model) => [model.id, model.name]))
  }, [availableModels])

  const resolveModelName = (id?: string | null) => {
    if (!id) return t('searchPage.notSet')
    return modelNameById.get(id) ?? id
  }

  const hasEmbeddingModel = !!modelDefaults?.default_embedding_model
  // The answer stream needs both a chat model and retrieval (embeddings).
  const canAsk = !!modelDefaults?.default_chat_model && hasEmbeddingModel

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Track auto-triggering from URL params
  const hasAutoTriggeredRef = useRef(false)
  const lastUrlParamsRef = useRef({ q: '', searchOnly: false })

  const runQuery = useCallback(
    (rawQuestion: string, options?: { searchOnly?: boolean }) => {
      const q = rawQuestion.trim()
      if (!q || modelsLoading) return

      const listOnly = options?.searchOnly ?? false
      setSubmittedQuestion(q)
      recordRecentQuestion(q)

      // Matching knowledge list — the system picks the retrieval strategy.
      searchMutation.mutate({
        query: q,
        type: hasEmbeddingModel ? 'vector' : 'text',
        limit: 100,
        search_sources: true,
        search_notes: includeNotes,
        minimum_score: 0.2,
      })

      // Answer stream in parallel, when AI is configured.
      if (!listOnly && canAsk && modelDefaults?.default_chat_model) {
        const models = customModels || {
          strategy: modelDefaults.default_chat_model,
          answer: modelDefaults.default_chat_model,
          finalAnswer: modelDefaults.default_chat_model,
        }
        ask.sendAsk(q, models)
      }
    },
    [modelsLoading, hasEmbeddingModel, includeNotes, canAsk, modelDefaults, customModels, ask, searchMutation]
  )

  const handleSubmit = useCallback(() => {
    if (ask.isStreaming || !question.trim()) return
    setSearchOnly(false)
    runQuery(question)
  }, [ask.isStreaming, question, runQuery])

  // Auto-trigger when arriving with URL params (?q=...&mode=search honored)
  useEffect(() => {
    if (hasAutoTriggeredRef.current || !urlQuery || modelsLoading) return
    hasAutoTriggeredRef.current = true
    runQuery(urlQuery, { searchOnly: urlSearchOnly })
  }, [urlQuery, urlSearchOnly, modelsLoading, runQuery])

  // Handle URL param changes while on the page (e.g., command palette again)
  useEffect(() => {
    const currentQ = searchParams?.get('q') || ''
    const currentSearchOnly = searchParams?.get('mode') === 'search'

    if (
      currentQ !== lastUrlParamsRef.current.q ||
      currentSearchOnly !== lastUrlParamsRef.current.searchOnly
    ) {
      lastUrlParamsRef.current = { q: currentQ, searchOnly: currentSearchOnly }
      if (currentQ) {
        setQuestion(currentQ)
        setSearchOnly(currentSearchOnly)
        hasAutoTriggeredRef.current = false
      }
    }
  }, [searchParams])

  const hasAskResult = ask.isStreaming || ask.finalAnswer || ask.answers.length > 0
  const hasSearchResult = !!searchMutation.data
  const showEmptyState = !hasAskResult && !hasSearchResult && !searchMutation.isPending

  const handlePromptClick = (text: string) => {
    setQuestion(text)
    textareaRef.current?.focus()
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10 space-y-8">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t('searchPage.unifiedTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('searchPage.unifiedSubtitle')}
            </p>
          </div>

          {/* First-time user prompt: knowledge base is empty */}
          {!sourcesLoading && !hasSources && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{t('searchPage.emptyKbTitle')}</p>
                    <p className="text-sm text-muted-foreground">{t('searchPage.emptyKbDesc')}</p>
                  </div>
                </div>
                <Button onClick={openSourceDialog} className="shrink-0">
                  <FileText className="h-4 w-4 mr-2" />
                  {t('searchPage.emptyKbAction')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* The ask box — the single primary action */}
          <Card className="border shadow-sm">
            <CardContent className="p-4 md:p-5 space-y-4">
              <Textarea
                ref={textareaRef}
                placeholder={t('searchPage.unifiedPlaceholder')}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                disabled={ask.isStreaming}
                rows={3}
                autoFocus
                className="resize-none border-0 shadow-none px-0 text-base focus-visible:ring-0"
                aria-label={t('common.accessibility.enterQuestion')}
              />

              {!canAsk && !modelsLoading && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-500">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{t('searchPage.aiNotConfigured')}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox
                      checked={includeNotes}
                      onCheckedChange={(checked) => setIncludeNotes(checked as boolean)}
                      disabled={searchMutation.isPending || ask.isStreaming}
                    />
                    {t('searchPage.includeNotes')}
                  </label>

                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ask.isStreaming}
                      onClick={() => setShowAdvancedModels(true)}
                      className="h-8 px-2 text-xs text-muted-foreground"
                    >
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      {customModels ? t('searchPage.usingCustomModels') : t('searchPage.usingDefaultModels')}
                      <span className="ml-1.5 font-medium text-foreground/70">
                        {resolveModelName(customModels?.answer || modelDefaults?.default_chat_model)}
                      </span>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <p className="hidden sm:block text-xs text-muted-foreground">
                    {t('searchPage.pressToSubmit')}
                  </p>
                  <Button
                    onClick={handleSubmit}
                    disabled={ask.isStreaming || searchMutation.isPending || !question.trim()}
                    size="icon"
                    className="h-11 w-11 rounded-full"
                    aria-label={t('searchPage.ask')}
                  >
                    {ask.isStreaming || searchMutation.isPending ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {isAdmin && (
                <AdvancedModelsDialog
                  open={showAdvancedModels}
                  onOpenChange={setShowAdvancedModels}
                  defaultModels={{
                    strategy: customModels?.strategy || modelDefaults?.default_chat_model || '',
                    answer: customModels?.answer || modelDefaults?.default_chat_model || '',
                    finalAnswer: customModels?.finalAnswer || modelDefaults?.default_chat_model || ''
                  }}
                  onSave={setCustomModels}
                />
              )}
            </CardContent>
          </Card>

          {/* Example prompts - only shown before any interaction */}
          {showEmptyState && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('searchPage.tryAsking')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => {
                  const text = t(prompt.key)
                  return (
                    <button
                      key={prompt.key}
                      type="button"
                      onClick={() => handlePromptClick(text)}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left text-sm hover:border-primary/40 hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-foreground">{text}</span>
                      <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Answer — the primary panel */}
          {!searchOnly && hasAskResult && (
            <div className="space-y-4">
              <StreamingResponse
                isStreaming={ask.isStreaming}
                strategy={ask.strategy}
                answers={ask.answers}
                finalAnswer={ask.finalAnswer}
              />
              {ask.finalAnswer && (
                <Button variant="outline" onClick={() => setShowSaveDialog(true)}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('searchPage.saveToWorkspace')}
                </Button>
              )}
            </div>
          )}

          {/* Matching knowledge — quiet supporting list below the answer */}
          {hasSearchResult && searchMutation.data && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('searchPage.matchingKnowledge')}
              </p>

              {searchMutation.data.results.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                    {t('searchPage.noResultsFor').replace('{query}', submittedQuestion)}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {searchMutation.data.results.map((result, index) => {
                    if (!result.parent_id) {
                      console.warn('Search result with null parent_id:', result)
                      return null
                    }
                    const [type, id] = result.parent_id.split(':')
                    const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'

                    return (
                      <Card key={index} className="shadow-none">
                        <CardContent className="py-3">
                          <button
                            onClick={() => openModal(modalType, id)}
                            className="text-sm text-primary hover:underline font-medium text-left"
                          >
                            {result.title}
                          </button>

                          {result.matches && result.matches.length > 0 && (
                            <Collapsible className="mt-2">
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                                <ChevronDown className="h-3.5 w-3.5" />
                                {t('searchPage.matches').replace('{count}', result.matches.length.toString())}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-1">
                                {result.matches.map((match, i) => (
                                  <div key={i} className="text-sm pl-6 py-1 border-l-2 border-muted text-muted-foreground">
                                    {match}
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Save to workspace dialog */}
          {ask.finalAnswer && (
            <SaveToNotebooksDialog
              open={showSaveDialog}
              onOpenChange={setShowSaveDialog}
              question={submittedQuestion || question}
              answer={ask.finalAnswer}
            />
          )}
        </div>
      </div>
    </AppShell>
  )
}
