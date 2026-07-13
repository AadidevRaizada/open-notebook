'use client'

import { useUser } from '@clerk/nextjs'
import { isClerkEnabled } from '@/lib/auth/clerk'

interface UseIsAdminResult {
  /** True when the current user may access admin pages (models, transformations, advanced). */
  isAdmin: boolean
  /** False while the user's session/metadata is still loading. */
  isLoaded: boolean
}

function useClerkIsAdmin(): UseIsAdminResult {
  const { user, isLoaded } = useUser()
  return {
    isAdmin: user?.publicMetadata?.role === 'admin',
    isLoaded,
  }
}

/**
 * Password mode has a single operator, so everyone is an admin — this
 * preserves the pre-Clerk behavior for local dev and single-user deployments.
 */
function usePasswordIsAdmin(): UseIsAdminResult {
  return { isAdmin: true, isLoaded: true }
}

// Build-time constant switch; see use-auth.ts for the same pattern.
export const useIsAdmin: () => UseIsAdminResult = isClerkEnabled
  ? useClerkIsAdmin
  : usePasswordIsAdmin
