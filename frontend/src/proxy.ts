import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Clerk mode activates when the publishable key is present at build time.
// (Do not import from '@/lib/auth/clerk' here: the proxy runs in the edge
// runtime and should stay dependency-free.)
const isClerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

// Routes reachable without a session: Clerk's own auth pages, the legacy
// password login, and the runtime config endpoint used before login.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login',
  '/config',
])

function redirectRootToHome(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url))
  }
  return null
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const rootRedirect = redirectRootToHome(request)
  if (rootRedirect) return rootRedirect

  if (!isPublicRoute(request)) {
    // Redirects unauthenticated visitors to /sign-in.
    await auth.protect()
  }

  return NextResponse.next()
})

function passwordProxy(request: NextRequest) {
  return redirectRootToHome(request) ?? NextResponse.next()
}

// Named `proxy` export is Next.js 16's middleware convention for proxy.ts.
export const proxy = isClerkEnabled ? clerkProxy : passwordProxy

export const config = {
  // Skip API routes, Next internals and public static assets (by extension) —
  // otherwise brand images like /irs-logo.png get redirected to /sign-in.
  matcher: [
    '/((?!api|_next|[^?]*\\.(?:png|gif|svg|jpe?g|webp|ico|css|js|map|txt|woff2?|ttf|webmanifest)).*)',
    '/__clerk/:path*',
  ],
}
