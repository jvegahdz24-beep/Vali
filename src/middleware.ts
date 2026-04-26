import { NextResponse } from 'next/server'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import type { NextRequest } from 'next/server'

// ─── Route Configuration ──────────────────────────────────────

const publicRoutes = [
  '/login',
  '/signup',
  '/landing',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
]

const publicApiRoutes = [
  '/api/auth',
  '/api/webhooks',
  '/api/seed',
  '/api/health',
  '/api/billing/webhook',
  // FIX C6: /api/debug/system REMOVED from public — now requires auth
  // FIX C7: /api/download/project and /api/sql-migration REMOVED from public — now require auth
  '/api/whatsapp/status',     // QR polling needs no auth
  '/api/whatsapp/connect',    // Connection trigger
  '/api/whatsapp/qr-standalone', // QR image
  '/api/whatsapp/ephemeral',  // Ephemeral sessions (auth via requireAuth in route)
  '/api/followups/worker',    // Cron worker (auth via X-Worker-Key header)
  '/api/cron',                // Cron endpoints (auth via worker keys)
]

// Rate-limited route prefixes (endpoint → { limit, windowMs })
const rateLimitedRoutes: Record<string, { limit: number; windowMs: number }> = {
  '/api/auth/login': { limit: 20, windowMs: 60_000 },
}

// Static file extensions
const staticExtensions = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.webp', '.mp4', '.webm',
  '.json', '.xml', '.txt', '.pdf', '.doc', '.docx', '.zip',
]

// Public static pages (no auth needed)
const publicPages = [
  '/terms',
  '/privacy',
]

// Reset password page (needs token from URL, not session)
const publicPagesExact = [
  '/reset-password',
]

// ─── In-Memory Rate Limiter (Edge-compatible) ──────────────────
// FIX: Removed setInterval (NOT supported in Edge Runtime).
// Cleanup happens lazily during each rate limit check instead.

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Lazy cleanup: remove expired entries BEFORE checking.
 * Called on every rate limit check — cheap since expired entries
 * are few and the check is O(n) on a small Map.
 */
function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of rateLimitStore) {
    if (now >= entry.resetAt) rateLimitStore.delete(key)
  }
}

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number | null } {
  const now = Date.now()

  // Lazy cleanup instead of setInterval (Edge Runtime safe)
  cleanupExpiredEntries(now)

  const entry = rateLimitStore.get(key)

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: null }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count++
  return { allowed: true, retryAfter: null }
}

// ─── Security Headers ─────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()')
  response.headers.delete('x-powered-by')
  return response
}

// ─── Middleware ────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow public static pages (terms, privacy)
  if (publicPages.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow reset-password page
  if (publicPagesExact.includes(pathname)) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow public API routes
  if (publicApiRoutes.some(route => pathname.startsWith(route))) {
    // Check rate limits on specific endpoints
    for (const [routePrefix, config] of Object.entries(rateLimitedRoutes)) {
      if (pathname.startsWith(routePrefix)) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown'
        const key = `rl:${ip}:${routePrefix}`
        const result = checkRateLimit(key, config.limit, config.windowMs)

        if (!result.allowed) {
          const response = NextResponse.json(
            {
              error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
              code: 'RATE_LIMITED',
              retryAfter: result.retryAfter,
            },
            {
              status: 429,
              headers: {
                'Retry-After': String(result.retryAfter),
              },
            }
          )
          return addSecurityHeaders(response)
        }
      }
    }
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow Next.js internal routes
  if (pathname.startsWith('/_next') || pathname.startsWith('/__nextjs')) {
    return NextResponse.next()
  }

  // Allow static files
  if (staticExtensions.some(ext => pathname.endsWith(ext))) {
    return NextResponse.next()
  }

  // Check for authentication via valiflow-session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  // Verify the JWT token
  const payload = await verifySessionToken(sessionToken)

  if (!payload) {
    // Token is invalid or expired — clear cookie and redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: false, // Behind Caddy reverse proxy
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return addSecurityHeaders(response)
  }

  // User is authenticated — handle unknown routes
  // The dashboard is a single-page app; redirect unknown paths to /
  const knownPaths = [
    '/',
    '/login', '/signup', '/landing',
    '/terms', '/privacy', '/reset-password', '/setup-sql',
  ]
  const isKnownPath = knownPaths.some(p => pathname === p)
  const isApiPath = pathname.startsWith('/api/')
  const isNextInternal = pathname.startsWith('/_next') || pathname.startsWith('/__nextjs')
  const isStaticFile = staticExtensions.some(ext => pathname.endsWith(ext))

  if (!isKnownPath && !isApiPath && !isNextInternal && !isStaticFile) {
    // Unknown route — redirect to homepage with the original path as query param
    // so the client can restore the correct view
    const homeUrl = new URL('/', request.url)
    if (pathname !== '/') homeUrl.searchParams.set('redirect', pathname)
    return addSecurityHeaders(NextResponse.redirect(homeUrl))
  }

  // Known route — add security headers and allow access
  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
