'use client'

import { useAuth as useClerkAuth, useClerk } from '@clerk/nextjs'
import { useAuthStore } from '@/lib/stores/auth-store'
import { isClerkEnabled } from '@/lib/auth/clerk'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface UseAuthResult {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (password: string) => Promise<boolean>
  logout: () => void
}

/**
 * Clerk-mode adapter: session state comes from Clerk; login happens on the
 * /sign-in page (Clerk components), so login() here is a no-op.
 */
function useClerkAuthAdapter(): UseAuthResult {
  const { isSignedIn, isLoaded } = useClerkAuth()
  const { signOut } = useClerk()

  return {
    isAuthenticated: !!isSignedIn,
    isLoading: !isLoaded,
    error: null,
    login: async () => false,
    logout: () => {
      void signOut({ redirectUrl: '/sign-in' })
    },
  }
}

/** Legacy shared-password flow backed by the Zustand auth store. */
function usePasswordAuth(): UseAuthResult {
  const router = useRouter()
  const {
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth,
    checkAuthRequired,
    error,
    hasHydrated,
    authRequired
  } = useAuthStore()

  useEffect(() => {
    // Only check auth after the store has hydrated from localStorage
    if (hasHydrated) {
      // First check if auth is required
      if (authRequired === null) {
        checkAuthRequired().then((required) => {
          // If auth is required, check if we have valid credentials
          if (required) {
            checkAuth()
          }
        })
      } else if (authRequired) {
        // Auth is required, check credentials
        checkAuth()
      }
      // If authRequired === false, we're already authenticated (set in checkAuthRequired)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, authRequired])

  const handleLogin = async (password: string) => {
    const success = await login(password)
    if (success) {
      // Check if there's a stored redirect path
      const redirectPath = sessionStorage.getItem('redirectAfterLogin')
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin')
        router.push(redirectPath)
      } else {
        router.push('/search')
      }
    }
    return success
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return {
    isAuthenticated,
    isLoading: isLoading || !hasHydrated, // Treat lack of hydration as loading
    error,
    login: handleLogin,
    logout: handleLogout
  }
}

// isClerkEnabled is a build-time constant, so the chosen implementation never
// changes at runtime and the rules of hooks hold within each component.
export const useAuth: () => UseAuthResult = isClerkEnabled
  ? useClerkAuthAdapter
  : usePasswordAuth
