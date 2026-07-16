'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { gmailApi } from '@/lib/api/gmail'
import { useTranslation } from '@/lib/hooks/use-translation'

export const GMAIL_QUERY_KEYS = {
  status: ['gmail', 'status'] as const,
  recent: ['gmail', 'recent'] as const,
  adminConnections: ['gmail', 'admin', 'connections'] as const,
}

export function useGmailStatus() {
  return useQuery({
    queryKey: GMAIL_QUERY_KEYS.status,
    queryFn: gmailApi.status,
    staleTime: 60_000,
  })
}

/** Admin overview of every connected Gmail account. Enabled only for admins. */
export function useGmailAdminConnections(enabled = true) {
  return useQuery({
    queryKey: GMAIL_QUERY_KEYS.adminConnections,
    queryFn: gmailApi.adminConnections,
    enabled,
  })
}

export function useGmailRecent(enabled: boolean, limit = 25) {
  return useQuery({
    queryKey: [...GMAIL_QUERY_KEYS.recent, limit],
    queryFn: () => gmailApi.recent({ limit }),
    enabled,
  })
}

/** Fetch the Google consent URL and navigate the browser to it. */
export function useConnectGmail() {
  const { t } = useTranslation()
  return useMutation({
    mutationFn: gmailApi.connect,
    onSuccess: (data) => {
      window.location.href = data.authorize_url
    },
    onError: () => {
      toast.error(t('gmail.connectFailed'))
    },
  })
}

export function useDisconnectGmail() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: gmailApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GMAIL_QUERY_KEYS.status })
      queryClient.invalidateQueries({ queryKey: GMAIL_QUERY_KEYS.recent })
      toast.success(t('gmail.disconnected'))
    },
    onError: () => {
      toast.error(t('gmail.disconnectFailed'))
    },
  })
}
