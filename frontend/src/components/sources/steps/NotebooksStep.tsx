"use client"

import { useId, useMemo, useState } from "react"
import { Check, Plus, X, Loader2 } from "lucide-react"

import { FormSection } from "@/components/ui/form-section"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useTranslation } from "@/lib/hooks/use-translation"
import { useCreateNotebook } from "@/lib/hooks/use-notebooks"
import { cn } from "@/lib/utils"
import { NotebookResponse } from "@/lib/types/api"

interface NotebooksStepProps {
  notebooks: NotebookResponse[]
  selectedNotebooks: string[]
  onToggleNotebook: (notebookId: string) => void
  loading?: boolean
}

/**
 * Renders `name` with the first case-insensitive occurrence of `query`
 * bolded, city-picker style. Falls back to plain text when there's no
 * query or no match.
 */
function HighlightedName({ name, query }: { name: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{name}</>

  const index = name.toLowerCase().indexOf(trimmed.toLowerCase())
  if (index === -1) return <>{name}</>

  const before = name.slice(0, index)
  const match = name.slice(index, index + trimmed.length)
  const after = name.slice(index + trimmed.length)

  return (
    <>
      {before}
      <span className="font-semibold text-foreground">{match}</span>
      {after}
    </>
  )
}

export function NotebooksStep({
  notebooks,
  selectedNotebooks,
  onToggleNotebook,
  loading = false,
}: NotebooksStepProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const createNotebook = useCreateNotebook()

  const selectedNotebookObjects = useMemo(
    () => notebooks.filter((nb) => selectedNotebooks.includes(nb.id)),
    [notebooks, selectedNotebooks]
  )

  const filteredNotebooks = useMemo(() => {
    if (!query.trim()) return notebooks
    const lower = query.trim().toLowerCase()
    return notebooks.filter((nb) => nb.name.toLowerCase().includes(lower))
  }, [notebooks, query])

  const hasExactMatch = useMemo(
    () =>
      notebooks.some(
        (nb) => nb.name.trim().toLowerCase() === query.trim().toLowerCase()
      ),
    [notebooks, query]
  )

  const trimmedQuery = query.trim()

  // Selecting a notebook keeps the popover open so multiple notebooks can
  // be picked in a row; only the query is cleared so the full list reappears.
  const handleSelect = (notebookId: string) => {
    onToggleNotebook(notebookId)
    setQuery("")
  }

  const handleCreateAndSelect = async () => {
    if (!trimmedQuery || createNotebook.isPending) return
    try {
      const created = await createNotebook.mutateAsync({ name: trimmedQuery })
      onToggleNotebook(created.id)
      setQuery("")
    } catch {
      // useCreateNotebook already surfaces an error toast; nothing else to do.
    }
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div className="space-y-6">
      <FormSection
        title={`${t("notebooks.title")} (${t("common.optional")})`}
        description={t("sources.addExistingDesc")}
      >
        {/*
          Popover MUST be modal to match the parent Dialog (AddSourceDialog),
          which is modal by default. A non-modal Popover portaled inside a
          modal Dialog silently swallows pointer clicks on its content
          (the Dialog disables pointer-events on <body>, and a non-modal
          Popover never re-enables them for its own portal) — this is the
          documented shadcn/Radix issue #9712. Keyboard selection still
          worked, which was the tell.
        */}
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <div
              role="combobox"
              tabIndex={0}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={listId}
              onKeyDown={handleTriggerKeyDown}
              className={cn(
                "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs cursor-text",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                loading && "pointer-events-none opacity-50"
              )}
            >
              {selectedNotebookObjects.map((nb) => (
                <Badge
                  key={nb.id}
                  variant="secondary"
                  className="gap-1.5 py-1 pl-2.5 pr-1.5"
                >
                  {nb.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleNotebook(nb.id)
                    }}
                    aria-label={t("common.remove")}
                    className="rounded-full hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedNotebookObjects.length === 0 && (
                <span className="text-muted-foreground">
                  {t("notebooks.searchPlaceholder")}
                </span>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[--radix-popover-trigger-width] p-0"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("notebooks.searchPlaceholder")}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList id={listId}>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : (
                  <>
                    {filteredNotebooks.length === 0 && (
                      <CommandEmpty>
                        {t("sources.noNotebooksFound")}
                      </CommandEmpty>
                    )}
                    <CommandGroup>
                      {filteredNotebooks.map((nb) => {
                        const isSelected = selectedNotebooks.includes(nb.id)
                        return (
                          <CommandItem
                            key={nb.id}
                            value={`notebook-${nb.id} ${nb.name}`}
                            onSelect={() => handleSelect(nb.id)}
                            className="cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="flex-1 truncate">
                              <HighlightedName name={nb.name} query={query} />
                            </span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>

                    {trimmedQuery && !hasExactMatch && (
                      <CommandGroup>
                        <CommandItem
                          value={`create-notebook ${trimmedQuery}`}
                          onSelect={handleCreateAndSelect}
                          disabled={createNotebook.isPending}
                          className="cursor-pointer text-primary"
                        >
                          {createNotebook.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          <span>
                            {t("notebooks.createNewNamed").replace(
                              "{name}",
                              trimmedQuery
                            )}
                          </span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </FormSection>
    </div>
  )
}
