// Per-device recent questions for the Home page. Stored locally by design:
// question history — and now the answer that was produced — stays on the
// user's machine so it can be re-opened later without re-querying.

/** Minimal source snapshot kept alongside a stored answer (for the panel). */
export interface StoredSource {
  title: string
  parent_id: string
  matches?: string[]
}

export interface RecentQuestion {
  q: string
  ts: number
  /** The answer that was produced, if the query completed. */
  a?: string
  /** Lightweight provenance snapshot for the Sources panel. */
  sources?: StoredSource[]
}

const STORAGE_KEY = 'irclass-recent-questions'
const MAX_QUESTIONS = 10
const MAX_ANSWER_CHARS = 20000
const MAX_SOURCES = 12

export function getRecentQuestions(): RecentQuestion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is RecentQuestion =>
        item && typeof item.q === 'string' && typeof item.ts === 'number'
    )
  } catch {
    return []
  }
}

export function getRecentQuestionById(ts: number): RecentQuestion | undefined {
  return getRecentQuestions().find((item) => item.ts === ts)
}

function persist(next: RecentQuestion[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    // Same-tab listeners (the Home page) don't get native storage events.
    window.dispatchEvent(new Event('recent-questions-changed'))
  } catch {
    // Quota/privacy-mode failures are non-fatal; history is a convenience.
  }
}

export function recordRecentQuestion(question: string): void {
  if (typeof window === 'undefined') return
  const q = question.trim()
  if (!q) return
  const existing = getRecentQuestions().filter((item) => item.q !== q)
  const next = [{ q, ts: Date.now() }, ...existing].slice(0, MAX_QUESTIONS)
  persist(next)
}

/**
 * Attach the produced answer (and a small sources snapshot) to the most recent
 * matching question so it can be replayed later without re-querying.
 */
export function recordRecentAnswer(
  question: string,
  answer: string,
  sources?: StoredSource[]
): void {
  if (typeof window === 'undefined') return
  const q = question.trim()
  if (!q || !answer) return
  const items = getRecentQuestions()
  const idx = items.findIndex((item) => item.q === q)
  const trimmedSources = sources
    ?.slice(0, MAX_SOURCES)
    .map((s) => ({
      title: s.title,
      parent_id: s.parent_id,
      matches: s.matches?.slice(0, 1),
    }))

  if (idx === -1) {
    // No prior record (e.g. asked from a deep link) — create one.
    const next = [
      { q, ts: Date.now(), a: answer.slice(0, MAX_ANSWER_CHARS), sources: trimmedSources },
      ...items,
    ].slice(0, MAX_QUESTIONS)
    persist(next)
    return
  }

  items[idx] = {
    ...items[idx],
    a: answer.slice(0, MAX_ANSWER_CHARS),
    sources: trimmedSources,
  }
  persist(items)
}

export function hasAskedAnyQuestion(): boolean {
  return getRecentQuestions().length > 0
}
