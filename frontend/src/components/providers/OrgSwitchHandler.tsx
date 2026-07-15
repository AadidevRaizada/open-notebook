'use client'

import { useEffect, useRef } from 'react'
import { useOrganization } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

import { queryClient } from '@/lib/api/query-client'
import { useNavigationStore } from '@/lib/stores/navigation-store'

/**
 * Resets client-side state when the active Clerk organization changes.
 *
 * React Query keys are not org-namespaced and the navigation store caches
 * content paths, so switching orgs would otherwise surface the previous org's
 * cached data (a cross-tenant leak in the UI). On a real org change (not the
 * initial mount) we clear the query cache, drop any stored return path, and
 * send the user to a neutral landing page so nothing stale is displayed.
 *
 * Mounted only inside the Clerk branch of AuthProvider, so useOrganization()
 * always has a ClerkProvider ancestor.
 */
export function OrgSwitchHandler() {
  const { organization, isLoaded } = useOrganization()
  const router = useRouter()
  const previousOrgId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // Wait for Clerk to hydrate; otherwise the null → org transition right
    // after sign-in registers as an org switch and hijacks the landing page.
    if (!isLoaded) return
    const currentOrgId = organization?.id ?? null

    // Record the initial value without triggering a reset on first load.
    if (previousOrgId.current === undefined) {
      previousOrgId.current = currentOrgId
      return
    }

    if (previousOrgId.current !== currentOrgId) {
      previousOrgId.current = currentOrgId
      // Drop all cached queries so no other org's data lingers in the UI.
      queryClient.clear()
      useNavigationStore.getState().clearReturnTo()
      router.push('/home')
    }
  }, [isLoaded, organization?.id, router])

  return null
}
