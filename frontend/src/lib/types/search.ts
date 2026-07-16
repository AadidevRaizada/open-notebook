// Search types
export interface SearchRequest {
  query: string
  type: 'text' | 'vector'
  limit: number
  search_sources: boolean
  search_notes: boolean
  minimum_score: number
}

export interface SearchResult {
  id: string
  title: string
  parent_id: string
  final_score: number
  matches?: string[]
  relevance?: number
  similarity?: number
  score?: number
  type?: string
  source_type?: string
  created: string
  updated: string
}

export interface SearchResponse {
  results: SearchResult[]
  total_count: number
  search_type: string
}

// Ask types
export type RetrievalMode = 'documents' | 'documents_gmail' | 'auto'

export interface AskRequest {
  question: string
  strategy_model: string
  answer_model: string
  final_answer_model: string
  retrieval_mode?: RetrievalMode
}

// Gmail thread surfaced in the unified sources panel (metadata only)
export interface EmailResultItem {
  thread_id: string
  subject: string
  participants: string[]
  message_count: number
  last_date: string | null
  snippet: string
  web_link: string
}

export interface AskResponse {
  answer: string
  question: string
}

// SSE Streaming types
export interface StrategyData {
  reasoning: string
  searches: Array<{
    term: string
    instructions: string
  }>
}

export interface AskStreamEvent {
  type: 'strategy' | 'answer' | 'email_results' | 'final_answer' | 'complete' | 'error'
  reasoning?: string
  searches?: Array<{ term: string; instructions: string }>
  content?: string
  final_answer?: string
  message?: string
  items?: EmailResultItem[]
}
