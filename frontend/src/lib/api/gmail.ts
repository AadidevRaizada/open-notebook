import apiClient from './client'

export interface GmailStatus {
  configured: boolean
  connected: boolean
  email: string | null
  last_sync_at: string | null
}

export interface GmailRecentItem {
  message_id: string
  thread_id: string
  subject: string | null
  sender: string | null
  timestamp: string | null
  labels: string[]
  snippet: string | null
}

// Admin overview row — one connected Gmail account (metadata only, no tokens).
export interface GmailAdminConnection {
  user_id: string
  org_id: string | null
  email: string
  scopes: string[]
  last_sync_at: string | null
  created: string | null
  updated: string | null
}

export const gmailApi = {
  status: async () => {
    const response = await apiClient.get<GmailStatus>('/gmail/status')
    return response.data
  },

  // Returns the Google consent URL; the caller navigates the browser there.
  connect: async () => {
    const response = await apiClient.post<{ authorize_url: string }>('/gmail/connect')
    return response.data
  },

  recent: async (params?: { limit?: number; refresh?: boolean }) => {
    const response = await apiClient.get<{ items: GmailRecentItem[] }>('/gmail/recent', {
      params,
    })
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ disconnected: boolean }>('/gmail/connection')
    return response.data
  },

  // Admin-only: every connected Gmail account across all users.
  adminConnections: async () => {
    const response = await apiClient.get<{
      connections: GmailAdminConnection[]
      total: number
    }>('/gmail/admin/connections')
    return response.data
  },
}
