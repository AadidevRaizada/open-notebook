/**
 * Clerk feature flag.
 *
 * Clerk mode activates when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is present at
 * build time. Without it, the app falls back to the legacy shared-password
 * authentication (OPEN_NOTEBOOK_PASSWORD on the API), keeping local dev and
 * self-hosted single-user deployments working unchanged.
 */
export const isClerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

/**
 * Returns the browser-side Clerk session token, or null when unavailable
 * (signed out, Clerk still loading, or running on the server).
 * Clerk session JWTs are short-lived; getToken() transparently refreshes.
 */
export async function getClerkToken(): Promise<string | null> {
  if (!isClerkEnabled || typeof window === 'undefined') return null
  const clerk = (
    window as unknown as {
      Clerk?: { session?: { getToken(): Promise<string | null> } | null }
    }
  ).Clerk
  try {
    return (await clerk?.session?.getToken()) ?? null
  } catch {
    return null
  }
}
