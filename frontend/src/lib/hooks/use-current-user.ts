'use client'

import { useOrganization, useUser } from '@clerk/nextjs'
import { isClerkEnabled } from '@/lib/auth/clerk'

interface CurrentUserInfo {
  /** Display name (full name, else email); null while loading or in password mode. */
  name: string | null
  email: string | null
  /** 1–2 uppercase letters for an avatar fallback. */
  initials: string
}

function initialsOf(name: string | null, email: string | null): string {
  const base = name || email || ''
  const parts = base.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase() || '?'
}

function useClerkCurrentUser(): CurrentUserInfo {
  const { user } = useUser()
  const name = user?.fullName || null
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  return { name: name ?? email, email, initials: initialsOf(name, email) }
}

function usePasswordCurrentUser(): CurrentUserInfo {
  return { name: null, email: null, initials: '?' }
}

// Build-time constant switch; see use-auth.ts for the same pattern.
export const useCurrentUser: () => CurrentUserInfo = isClerkEnabled
  ? useClerkCurrentUser
  : usePasswordCurrentUser

/**
 * The active organisation's profile image.
 * Null in password mode or before Clerk resolves the org.
 */
function useClerkOrgAvatar(): string | null {
  const { organization } = useOrganization()
  return organization?.imageUrl ?? null
}

export const useOrgAvatar: () => string | null = isClerkEnabled
  ? useClerkOrgAvatar
  : () => null

/**
 * The signed-in user's own profile image (Clerk generates one even when the
 * user hasn't uploaded a photo). Null in password mode.
 */
function useClerkUserAvatar(): string | null {
  const { user } = useUser()
  return user?.imageUrl ?? null
}

export const useUserAvatar: () => string | null = isClerkEnabled
  ? useClerkUserAvatar
  : () => null
