import { ClerkProvider } from '@clerk/nextjs'
import { isClerkEnabled } from '@/lib/auth/clerk'
import { OrgSwitchHandler } from '@/components/providers/OrgSwitchHandler'

/**
 * Wraps children in ClerkProvider only when Clerk is configured.
 * ClerkProvider throws without a publishable key, so password-mode builds
 * (no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) must render children directly.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkEnabled) {
    return <>{children}</>
  }
  return (
    <ClerkProvider>
      <OrgSwitchHandler />
      {children}
    </ClerkProvider>
  )
}
