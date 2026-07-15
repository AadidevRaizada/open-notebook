// Per-device recent questions for the Home page. Stored locally by design:
// question history stays on the user's machine.
export interface RecentQuestion {
  q: string
  ts: number
}

const STORAGE_KEY = 'irclass-recent-questions'
const MAX_QUESTIONS = 10

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

export function recordRecentQuestion(question: string): void {
  if (typeof window === 'undefined') return
  const q = question.trim()
  if (!q) return
  try {
    const existing = getRecentQuestions().filter((item) => item.q !== q)
    const next = [{ q, ts: Date.now() }, ...existing].slice(0, MAX_QUESTIONS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    // Same-tab listeners (the Home page) don't get native storage events.
    window.dispatchEvent(new Event('recent-questions-changed'))
  } catch {
    // Quota/privacy-mode failures are non-fatal; history is a convenience.
  }
}

export function hasAskedAnyQuestion(): boolean {
  return getRecentQuestions().length > 0
}
