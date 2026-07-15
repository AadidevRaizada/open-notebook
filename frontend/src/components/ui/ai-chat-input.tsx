'use client'

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ----------------------------------------------------------------------
// Transition physics — a springy expand + a fast, calm text resize.
// ----------------------------------------------------------------------
const SPRING_TRANSITION =
  'max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
const SMOOTH_HEIGHT_TRANSITION =
  'max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.15s ease-out'

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export interface PromptInputProps {
  onSubmit?: (value: string) => void
  /** Fired when the attach (upload) affordance is pressed. */
  onAttach?: () => void
  placeholder?: string
  /** Accessible label for the textarea / collapsed trigger. */
  ariaLabel?: string
  /** Accessible label for the send button. */
  submitLabel?: string
  /** Accessible label for the attach button. */
  attachLabel?: string
  className?: string
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
  collapsedWidth?: number
  expandedWidth?: number
  autoFocusOnExpand?: boolean
  /** Start expanded and never collapse (the card stays open at all times). */
  alwaysExpanded?: boolean
}

/**
 * IRClass Navigator ask box — a springy, self-expanding prompt input.
 *
 * Adapted to our feature set: it types a question and (optionally) opens the
 * source-upload dialog. Model/effort pickers are intentionally omitted — the
 * system chooses; members never see AI machinery.
 */
export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      onSubmit,
      onAttach,
      placeholder = 'Ask anything',
      ariaLabel = 'Prompt',
      submitLabel = 'Send',
      attachLabel = 'Attach',
      className,
      defaultValue = '',
      value: controlledValue,
      onChange,
      collapsedWidth = 320,
      expandedWidth = 480,
      autoFocusOnExpand = true,
      alwaysExpanded = false,
    },
    ref
  ) => {
    const [expanded, setExpanded] = useState(alwaysExpanded)
    const [isSmoothResize, setIsSmoothResize] = useState(false)
    const [localValue, setLocalValue] = useState(defaultValue)
    const [containerHeight, setContainerHeight] = useState(116)
    const [textareaHeight, setTextareaHeight] = useState(68)
    const [isScrolling, setIsScrolling] = useState(false)

    const isControlled = controlledValue !== undefined
    const value = isControlled ? controlledValue : localValue
    const hasValue = value.trim() !== ''

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const topFadeRef = useRef<HTMLDivElement>(null)
    const bottomFadeRef = useRef<HTMLDivElement>(null)

    const updateFades = useCallback(() => {
      const el = textareaRef.current
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (topFadeRef.current) {
        topFadeRef.current.style.opacity = Math.min(scrollTop / 20, 1).toString()
      }
      if (bottomFadeRef.current) {
        const bottomScroll = scrollHeight - clientHeight - scrollTop
        bottomFadeRef.current.style.opacity = Math.min(Math.max(bottomScroll - 16, 0) / 10, 1).toString()
      }
    }, [])

    const handleValueChange = useCallback(
      (val: string) => {
        setIsSmoothResize(true)
        if (!isControlled) setLocalValue(val)
        onChange?.(val)
      },
      [isControlled, onChange]
    )

    const expand = () => {
      setIsSmoothResize(false)
      setExpanded(true)
    }

    // Expand as soon as there's content (e.g. a chip prefilled the value).
    useEffect(() => {
      if (value.trim() !== '' && !expanded) {
        setIsSmoothResize(false)
        setExpanded(true)
      }
    }, [value, expanded])

    // Focus the textarea when the card opens.
    useEffect(() => {
      if (expanded && autoFocusOnExpand) {
        const timer = setTimeout(() => {
          const el = textareaRef.current
          if (el) {
            el.focus()
            const len = el.value.length
            el.setSelectionRange(len, len)
          }
        }, 50)
        return () => clearTimeout(timer)
      }
    }, [expanded, autoFocusOnExpand])

    // Auto-grow the textarea between a min and max height.
    useEffect(() => {
      const el = textareaRef.current
      if (!el) return
      const currentHeight = el.style.height
      el.style.transition = 'none'
      el.style.height = '0px'
      const scrollHeight = el.scrollHeight
      el.style.height = currentHeight
      void el.offsetHeight
      el.style.transition = ''

      const newHeight = Math.max(68, Math.min(scrollHeight, 160))
      el.style.height = `${newHeight}px`
      setTextareaHeight(newHeight)
      setIsScrolling(scrollHeight > 160)
      setTimeout(updateFades, 0)
    }, [value, expanded, updateFades])

    useEffect(() => {
      setContainerHeight(Math.max(116, textareaHeight + 48))
      setTimeout(updateFades, 0)
    }, [textareaHeight, updateFades])

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (alwaysExpanded) return
      if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) return
      if (value.trim() === '') {
        setIsSmoothResize(false)
        setExpanded(false)
      }
    }

    const handleSubmit = () => {
      if (value.trim() === '') return
      setIsSmoothResize(false)
      onSubmit?.(value)
      handleValueChange('')
      if (!alwaysExpanded) setExpanded(false)
    }

    return (
      <div
        ref={(node) => {
          containerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
        }}
        onBlur={handleBlur}
        className={cn('relative flex w-full flex-col', className)}
        style={{
          maxWidth: expanded ? expandedWidth : collapsedWidth,
          transition: isSmoothResize
            ? 'max-width 0.15s ease-out'
            : 'max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        <div
          className="irclass-rainbow-frame relative w-full rounded-[24px] p-[1.6px]"
          style={{
            height: expanded ? containerHeight + 3.2 : 48 + 3.2,
            transition: isSmoothResize ? SMOOTH_HEIGHT_TRANSITION : SPRING_TRANSITION,
          }}
        >
        <div
          onMouseDown={(e) => {
            const isTextarea = e.target === textareaRef.current
            if (expanded && !isTextarea) {
              e.preventDefault()
              textareaRef.current?.focus()
            }
          }}
          style={{
            borderRadius: 22.5,
            height: expanded ? containerHeight : 48,
            transition: isSmoothResize ? SMOOTH_HEIGHT_TRANSITION : SPRING_TRANSITION,
            overflow: expanded ? 'visible' : 'hidden',
          }}
          className={cn(
            'relative z-10 h-full w-full bg-card shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring/20',
            expanded ? 'cursor-text' : 'cursor-default'
          )}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
              .prompt-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
              .prompt-scrollbar:hover::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--muted-foreground) 30%, transparent); }
              .irclass-rainbow-frame {
                background-image: linear-gradient(90deg, #0B2D5C, #2A9D8F, #C9A227, #7B2FF7, #4361EE, #0B2D5C);
                background-size: 300% 100%;
                animation: irclass-border-flow 7s linear infinite;
              }
              @keyframes irclass-border-flow {
                0% { background-position: 0% 50%; }
                100% { background-position: 300% 50%; }
              }
              @media (prefers-reduced-motion: reduce) {
                .irclass-rainbow-frame { animation: none; }
              }
            `,
            }}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onScroll={updateFades}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
              if (e.key === 'Escape' && value.trim() === '') {
                if (alwaysExpanded) return
                setIsSmoothResize(false)
                setExpanded(false)
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            style={{
              transition: isSmoothResize
                ? 'height 0.15s ease-out'
                : 'opacity 0.3s ease-out, transform 0.3s ease-out, height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
            className={cn(
              'prompt-scrollbar absolute inset-x-0 top-0 z-[1] w-full resize-none bg-transparent py-3.5 pl-4 pr-12 text-base leading-[24px] text-foreground outline-none placeholder:text-muted-foreground',
              expanded
                ? 'translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none -translate-y-1 scale-95 opacity-0',
              isScrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
            )}
          />

          <div
            ref={topFadeRef}
            className="pointer-events-none absolute left-4 right-12 top-0 z-[2] h-8 bg-gradient-to-b from-card via-card/90 to-transparent"
            style={{ opacity: 0 }}
          />
          <div
            ref={bottomFadeRef}
            className="pointer-events-none absolute left-4 right-12 z-[2] h-8 bg-gradient-to-t from-card via-card/90 to-transparent"
            style={{
              opacity: 0,
              top: `${textareaHeight - 32}px`,
              transition: isSmoothResize
                ? 'top 0.15s ease-out'
                : 'top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          />

          {/* Collapsed placeholder — click to expand */}
          <button
            type="button"
            onClick={expand}
            style={{
              transition: isSmoothResize ? 'none' : 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
            className={cn(
              'absolute inset-x-0 top-0 z-[1] cursor-text py-[15px] pl-4 pr-12 text-left text-base leading-[18px] text-muted-foreground outline-none',
              !expanded
                ? 'translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none translate-y-1 scale-105 opacity-0'
            )}
            aria-label={ariaLabel}
          >
            {placeholder}
          </button>

          {/* Attach (upload) — only when expanded */}
          {onAttach && (
            <div
              className={cn(
                'absolute bottom-2 left-3 z-[10] flex items-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]',
                expanded
                  ? 'translate-y-0 opacity-100 blur-0'
                  : 'pointer-events-none translate-y-2 opacity-0 blur-sm'
              )}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onAttach()
                }}
                aria-label={attachLabel}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PaperclipIcon />
              </button>
            </div>
          )}

          {/* Send */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            disabled={!hasValue}
            aria-label={submitLabel}
            style={{ borderRadius: 9999 }}
            className="absolute bottom-2 right-2 z-[10] flex size-8 items-center justify-center bg-primary text-primary-foreground outline-none transition-all duration-300 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <ArrowUpIcon />
          </button>
        </div>
        </div>
      </div>
    )
  }
)

PromptInput.displayName = 'PromptInput'
