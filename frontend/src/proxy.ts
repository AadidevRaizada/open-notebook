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

function redirectRootToNotebooks(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/notebooks', request.url))
  }
  return null
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const rootRedirect = redirectRootToNotebooks(request)
  if (rootRedirect) return rootRedirect

  if (!isPublicRoute(request)) {
    // Redirects unauthenticated visitors to /sign-in.
    await auth.protect()
  }

  return NextResponse.next()
})

function passwordProxy(request: NextRequest) {
  return redirectRootToNotebooks(request) ?? NextResponse.next()
}

// Named `proxy` export is Next.js 16's middleware convention for proxy.ts.
export const proxy = isClerkEnabled ? clerkProxy : passwordProxy

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    '/__clerk/:path*',
  ],
}
