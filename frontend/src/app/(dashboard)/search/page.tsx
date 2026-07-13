'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { AppShell } from '@/components/layout/AppShell'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sparkles,
  Search,
  ChevronDown,
  AlertCircle,
  Settings2,
  Save,
  ArrowUp,
  FileText,
  Book,
  SlidersHorizontal,
} from 'lucide-react'
import { useSearch } from '@/lib/hooks/use-search'
import { useAsk } from '@/lib/hooks/use-ask'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useHasAnySources } from '@/lib/hooks/use-sources'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { StreamingResponse } from '@/components/search/StreamingResponse'
import { AdvancedModelsDialog } from '@/components/search/AdvancedModelsDialog'
import { SaveToNotebooksDialog } from '@/components/search/SaveToNotebooksDialog'
import { cn } from '@/lib/utils'

// Full key paths so i18n static analysis (locales/index.test.ts) can see them
const EXAMPLE_PROMPTS = [
  { key: 'searchPage.examplePrompts.certRequirements' },
  { key: 'searchPage.examplePrompts.complianceUpdates' },
  { key: 'searchPage.examplePrompts.relatedDocuments' },
  { key: 'searchPage.examplePrompts.processExplainer' },
] as const

export default function SearchPage() {
  const { t } = useTranslation()
  // URL params
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get('q') || ''
  const rawMode = searchParams?.get('mode')
  const urlMode = rawMode === 'search' ? 'search' : 'ask'

  // Mode state (controlled) - replaces the old tabs with a segmented control
  const [mode, setMode] = useState<'ask' | 'search'>(
    urlMode === 'search' ? 'search' : 'ask'
  )

  // Search state
  const [searchQuery, setSearchQuery] = useState(urlMode === 'search' ? urlQuery : '')
  const [searchType, setSearchType] = useState<'text' | 'vector'>('text')
  const [searchSources, setSearchSources] = useState(true)
  const [searchNotes, setSearchNotes] = useState(true)
  const [showSearchOptions, setShowSearchOptions] = useState(false)

  // Ask state
  const [askQuestion, setAskQuestion] = useState(urlMode === 'ask' ? urlQuery : '')

  // Advanced models dialog
  const [showAdvancedModels, setShowAdvancedModels] = useState(false)
  const [customModels, setCustomModels] = useState<{
    strategy: string
    answer: string
    finalAnswer: string
  } | null>(null)

  // Save to notebooks dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  // Hooks
  const searchMutation = useSearch()
  const ask = useAsk()
  const { data: modelDefaults, isLoading: modelsLoading } = useModelDefaults()
  const { data: availableModels } = useModels()
  const { openModal } = useModalManager()
  const { openSourceDialog, openNotebookDialog } = useCreateDialogs()
  const { hasSources, isLoading: sourcesLoading } = useHasAnySources()

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

  // Track if we've already auto-triggered from URL params
  const hasAutoTriggeredRef = useRef(false)
  const lastUrlParamsRef = useRef({ q: '', mode: '' })

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return

    searchMutation.mutate({
      query: searchQuery,
      type: searchType,
      limit: 100,
      search_sources: searchSources,
      search_notes: searchNotes,
      minimum_score: 0.2
    })
  }, [searchQuery, searchType, searchSources, searchNotes, searchMutation])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleAsk = useCallback(() => {
    if (!askQuestion.trim() || !modelDefaults?.default_chat_model) return

    const models = customModels || {
      strategy: modelDefaults.default_chat_model,
      answer: modelDefaults.default_chat_model,
      finalAnswer: modelDefaults.default_chat_model
    }

    ask.sendAsk(askQuestion, models)
  }, [askQuestion, modelDefaults, customModels, ask])

  // Auto-trigger search/ask when arriving with URL params
  useEffect(() => {
    if (hasAutoTriggeredRef.current || !urlQuery) return
    if (urlMode === 'ask' && modelsLoading) return

    if (urlMode === 'search') {
      handleSearch()
      hasAutoTriggeredRef.current = true
    } else if (urlMode === 'ask' && modelDefaults?.default_chat_model) {
      handleAsk()
      hasAutoTriggeredRef.current = true
    }
  }, [urlQuery, urlMode, modelsLoading, modelDefaults, handleSearch, handleAsk])

  // Handle URL param changes while on page (e.g., from command palette again)
  useEffect(() => {
    const currentQ = searchParams?.get('q') || ''
    const rawCurrentMode = searchParams?.get('mode')
    const currentMode = rawCurrentMode === 'search' ? 'search' : 'ask'

    if (currentQ !== lastUrlParamsRef.current.q || currentMode !== lastUrlParamsRef.current.mode) {
      lastUrlParamsRef.current = { q: currentQ, mode: currentMode }

      if (currentQ) {
        if (currentMode === 'search') {
          setSearchQuery(currentQ)
          setMode('search')
          hasAutoTriggeredRef.current = false
        } else {
          setAskQuestion(currentQ)
          setMode('ask')
          hasAutoTriggeredRef.current = false
        }
      }
    }
  }, [searchParams])

  const isAsk = mode === 'ask'
  const hasAskResult = ask.isStreaming || ask.finalAnswer || ask.answers.length > 0
  const hasSearchResult = !!searchMutation.data
  const showEmptyState = isAsk ? !hasAskResult : !hasSearchResult

  const handlePromptClick = (text: string) => {
    if (isAsk) {
      setAskQuestion(text)
    } else {
      setSearchQuery(text)
    }
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10 space-y-8">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                {t('searchPage.askAndSearch')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('searchPage.homeSubtitle')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openSourceDialog}>
                <FileText className="h-4 w-4 mr-2" />
                {t('common.newSource')}
              </Button>
              <Button variant="outline" size="sm" onClick={openNotebookDialog}>
                <Book className="h-4 w-4 mr-2" />
                {t('common.newNotebook')}
              </Button>
            </div>
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

          {/* Segmented mode control */}
          <div
            role="radiogroup"
            aria-label={t('common.accessibility.searchKB')}
            className="inline-flex rounded-xl border bg-muted/40 p-1 gap-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={isAsk}
              onClick={() => setMode('ask')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isAsk
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sparkles className={cn('h-4 w-4', isAsk && 'text-primary')} />
              <span className="text-left">
                <span className="block leading-tight">{t('searchPage.askBeta')}</span>
                <span className="block text-xs font-normal text-muted-foreground leading-tight">
                  {t('searchPage.askModeHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isAsk}
              onClick={() => setMode('search')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                !isAsk
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Search className={cn('h-4 w-4', !isAsk && 'text-primary')} />
              <span className="text-left">
                <span className="block leading-tight">{t('searchPage.search')}</span>
                <span className="block text-xs font-normal text-muted-foreground leading-tight">
                  {t('searchPage.searchModeHint')}
                </span>
              </span>
            </button>
          </div>

          {/* Unified command card */}
          <Card className="border shadow-sm">
            <CardContent className="p-4 md:p-5 space-y-4">
              {isAsk ? (
                <>
                  <Textarea
                    placeholder={t('searchPage.enterQuestionPlaceholder')}
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !ask.isStreaming && askQuestion.trim()) {
                        e.preventDefault()
                        handleAsk()
                      }
                    }}
                    disabled={ask.isStreaming}
                    rows={3}
                    className="resize-none border-0 shadow-none px-0 text-base focus-visible:ring-0"
                    aria-label={t('common.accessibility.enterQuestion')}
                  />

                  {!hasEmbeddingModel && (
                    <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-500">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{t('searchPage.noEmbeddingModel')}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 border-t pt-3">
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

                    <div className="flex items-center gap-2">
                      <p className="hidden sm:block text-xs text-muted-foreground">
                        {t('searchPage.pressToSubmit')}
                      </p>
                      <Button
                        onClick={handleAsk}
                        disabled={ask.isStreaming || !askQuestion.trim() || !hasEmbeddingModel}
                        size="icon"
                        className="h-9 w-9 rounded-full"
                        aria-label={t('searchPage.ask')}
                      >
                        {ask.isStreaming ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

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
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        placeholder={t('searchPage.enterSearchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        disabled={searchMutation.isPending}
                        aria-label={t('common.accessibility.enterSearch')}
                        autoComplete="off"
                        className="w-full h-11 rounded-lg border bg-transparent pl-10 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                      />
                    </div>
                    <Button
                      onClick={handleSearch}
                      disabled={searchMutation.isPending || !searchQuery.trim()}
                      aria-label={t('common.accessibility.searchKBBtn')}
                      className="h-11 px-5"
                    >
                      {searchMutation.isPending ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        t('searchPage.search')
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <Popover open={showSearchOptions} onOpenChange={setShowSearchOptions}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={searchMutation.isPending}
                          className="h-8 px-2 text-xs text-muted-foreground"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                          {t('searchPage.filters')}
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 space-y-4">
                        <div className="space-y-2" role="group" aria-labelledby="search-type-label">
                          <span id="search-type-label" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('searchPage.searchType')}
                          </span>
                          {!hasEmbeddingModel && (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>{t('searchPage.vectorSearchWarning')}</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSearchType('text')}
                              disabled={modelsLoading || searchMutation.isPending}
                              className={cn(
                                'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                                searchType === 'text'
                                  ? 'border-primary bg-primary/5 text-primary font-medium'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {t('searchPage.textSearch')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSearchType('vector')}
                              disabled={!hasEmbeddingModel || searchMutation.isPending}
                              className={cn(
                                'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                                searchType === 'vector'
                                  ? 'border-primary bg-primary/5 text-primary font-medium'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {t('searchPage.vectorSearch')}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2" role="group" aria-labelledby="search-in-label">
                          <span id="search-in-label" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('searchPage.searchIn')}
                          </span>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={searchSources}
                                onCheckedChange={(checked) => setSearchSources(checked as boolean)}
                                disabled={searchMutation.isPending}
                              />
                              {t('searchPage.searchSources')}
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={searchNotes}
                                onCheckedChange={(checked) => setSearchNotes(checked as boolean)}
                                disabled={searchMutation.isPending}
                              />
                              {t('searchPage.searchNotes')}
                            </label>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <p className="hidden sm:block text-xs text-muted-foreground">
                      {t('searchPage.pressToSearch')}
                    </p>
                  </div>
                </>
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
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left text-sm hover:border-primary/40 hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-foreground">{text}</span>
                      <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ask results */}
          {isAsk && hasAskResult && (
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
                  {t('searchPage.saveToNotebooks')}
                </Button>
              )}
            </div>
          )}

          {/* Search results */}
          {!isAsk && hasSearchResult && searchMutation.data && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {t('searchPage.resultsFound').replace('{count}', searchMutation.data.total_count.toString())}
                </h3>
                <Badge variant="outline">
                  {searchMutation.data.search_type === 'text' ? t('searchPage.textSearch') : t('searchPage.vectorSearch')}
                </Badge>
              </div>

              {searchMutation.data.results.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    {t('searchPage.noResultsFor').replace('{query}', searchQuery)}
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
                      <Card key={index}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <button
                                onClick={() => openModal(modalType, id)}
                                className="text-primary hover:underline font-medium"
                              >
                                {result.title}
                              </button>
                              <Badge variant="secondary" className="ml-2">
                                {result.final_score.toFixed(2)}
                              </Badge>
                            </div>
                          </div>

                          {result.matches && result.matches.length > 0 && (
                            <Collapsible className="mt-3">
                              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                <ChevronDown className="h-4 w-4" />
                                {t('searchPage.matches').replace('{count}', result.matches.length.toString())}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-1">
                                {result.matches.map((match, i) => (
                                  <div key={i} className="text-sm pl-6 py-1 border-l-2 border-muted">
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

          {/* Save to Notebooks Dialog */}
          {ask.finalAnswer && (
            <SaveToNotebooksDialog
              open={showSaveDialog}
              onOpenChange={setShowSaveDialog}
              question={askQuestion}
              answer={ask.finalAnswer}
            />
          )}
        </div>
      </div>
    </AppShell>
  )
}
