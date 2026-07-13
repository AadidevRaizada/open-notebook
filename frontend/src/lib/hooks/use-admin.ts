'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@clerk/nextjs'
import { adminApi } from '@/lib/api/admin'
import { isClerkEnabled } from '@/lib/auth/clerk'

export const ADMIN_QUERY_KEYS = {
  status: ['admin', 'status'] as const,
  users: ['admin', 'users'] as const,
  invitations: ['admin', 'invitations'] as const,
  usage: ['admin', 'usage'] as const,
}

export function useAdminStatus() {
  return useQuery({ queryKey: ADMIN_QUERY_KEYS.status, queryFn: adminApi.getStatus })
}

export function useAdminUsers(enabled = true) {
  return useQuery({ queryKey: ADMIN_QUERY_KEYS.users, queryFn: adminApi.listUsers, enabled })
}

export function useAdminInvitations(enabled = true) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.invitations,
    queryFn: adminApi.listInvitations,
    enabled,
  })
}

export function useAdminUsage() {
  return useQuery({ queryKey: ADMIN_QUERY_KEYS.usage, queryFn: adminApi.getUsage })
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users })
    queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.invitations })
  }
}

export function useInviteUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (email: string) => adminApi.inviteUser(email),
    onSuccess: invalidate,
  })
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (invitationId: string) => adminApi.revokeInvitation(invitationId),
    onSuccess: invalidate,
  })
}

export function useSetUserRole() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | null }) =>
      adminApi.setUserRole(userId, role),
    onSuccess: invalidate,
  })
}

export function useBanUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ userId, ban }: { userId: string; ban: boolean }) =>
      ban ? adminApi.banUser(userId) : adminApi.unbanUser(userId),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: invalidate,
  })
}

function useClerkCurrentUserId(): string | null {
  const { user } = useUser()
  return user?.id ?? null
}

function usePasswordCurrentUserId(): string | null {
  return null
}

// Build-time constant switch; see use-is-admin.ts for the same pattern.
export const useCurrentUserId: () => string | null = isClerkEnabled
  ? useClerkCurrentUserId
  : usePasswordCurrentUserId
