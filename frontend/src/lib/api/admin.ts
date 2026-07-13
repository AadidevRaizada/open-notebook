import { apiClient } from './client'

export interface AdminUser {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  image_url: string | null
  role: string | null
  banned: boolean
  last_sign_in_at: number | null
  created_at: number | null
}

export interface AdminInvitation {
  id: string
  email: string
  status: string
  created_at: number | null
}

export interface AdminStatus {
  auth_mode: 'clerk' | 'password' | 'none'
  user_management: boolean
}

export interface UsageUser {
  user_id: string
  email: string | null
  actions: Record<string, number>
  total: number
  last_active: string | null
}

export interface UsageEvent {
  user_id: string
  email: string | null
  action: string
  created: string
}

export interface UsageSummary {
  users: UsageUser[]
  recent: UsageEvent[]
}

export const adminApi = {
  getStatus: async (): Promise<AdminStatus> =>
    (await apiClient.get<AdminStatus>('/admin/status')).data,

  listUsers: async (): Promise<AdminUser[]> =>
    (await apiClient.get<AdminUser[]>('/admin/users')).data,

  listInvitations: async (): Promise<AdminInvitation[]> =>
    (await apiClient.get<AdminInvitation[]>('/admin/invitations')).data,

  inviteUser: async (email: string): Promise<AdminInvitation> =>
    (
      await apiClient.post<AdminInvitation>('/admin/invitations', {
        email,
        redirect_url: `${window.location.origin}/sign-up`,
      })
    ).data,

  revokeInvitation: async (invitationId: string): Promise<AdminInvitation> =>
    (await apiClient.post<AdminInvitation>(`/admin/invitations/${invitationId}/revoke`)).data,

  setUserRole: async (userId: string, role: 'admin' | null): Promise<AdminUser> =>
    (await apiClient.patch<AdminUser>(`/admin/users/${userId}/role`, { role })).data,

  banUser: async (userId: string): Promise<AdminUser> =>
    (await apiClient.post<AdminUser>(`/admin/users/${userId}/ban`)).data,

  unbanUser: async (userId: string): Promise<AdminUser> =>
    (await apiClient.post<AdminUser>(`/admin/users/${userId}/unban`)).data,

  deleteUser: async (userId: string): Promise<void> => {
    await apiClient.delete(`/admin/users/${userId}`)
  },

  getUsage: async (): Promise<UsageSummary> =>
    (await apiClient.get<UsageSummary>('/admin/usage')).data,
}
