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
  '/api/whatsapp/status',     // QR polling needs no auth
  '/api/whatsapp/connect',    // Connection trigger
  '/api/whatsapp/ephemeral',  // Ephemeral sessions (auth via requireAuth in route)
  '/api/followups/worker',    // Cron worker (auth via X-Worker-Key header)
  '/api/cron',                // Cron endpoints (auth via worker keys)
  '/api/engine/cron',         // Engine cron (auth via CRON_SECRET in route)
  '/api/whatsapp/meta/webhook', // Meta Cloud API webhook (no JWT, signature verified in route)
  '/api/meta/webhook',        // Webhook genérico Meta/Instagram (verify token validado en la ruta)
  '/api/meta/callback',       // Redirect URI de login Meta/Instagram (página informativa)
  '/api/marketing/meta/callback', // Callback OAuth "Conectar con Facebook" (state firmado)
  '/api/tiktok/callback',     // Callback OAuth de TikTok (state=workspaceId)
  '/api/gcal/callback',       // Callback OAuth de Google Calendar (state=workspaceId)
  '/api/telegram/webhook',    // Telegram bot webhook (no JWT, optional secret verified in route)
  '/api/marketing/render',    // Imágenes de marketing públicas (las consumen Meta y las <img>; valida ws+car en la ruta)
  '/api/marketing/testimonial', // Creativos de testimonio (F10) — mismas <img>/Meta, valida ws en la ruta
  '/api/marketing/media',     // Videos/reels generados (los consumen Meta y <video>)
  '/api/widget',              // Widget de webchat embebible en sitios de clientes (rate-limit propio en la ruta)
]

// Rate-limited route prefixes (endpoint → { limit, windowMs })
const rateLimitedRoutes: Record<string, { limit: number; windowMs: number }> = {
  '/api/auth/login': { limit: 5, windowMs: 60_000 },          // SEC-006: 5 attempts/min
  '/api/auth/register': { limit: 3, windowMs: 60_000 },        // 3 registrations/min
  '/api/auth/reset-password': { limit: 3, windowMs: 60_000 },  // 3 resets/min
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

  // Nexus is intentionally disabled until its Prisma schema and migration are
  // present. Keeping this gate in middleware prevents partially migrated routes
  // from reaching nonexistent delegates and makes the feature opt-in after the
  // migration is reviewed and deployed.
  if ((pathname === '/api/nexus' || pathname.startsWith('/api/nexus/')) && process.env.NEXUS_ENABLED !== 'true') {
    return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  }

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

  // Peticiones de API sin sesión: 401 JSON (NO redirigir a /login). Si se
  // redirige un fetch POST a /login, el navegador lo sigue con POST y /login
  // responde 405 "Method Not Allowed" (HTML) → el cliente reventaba con
  // "Unexpected token M ... is not valid JSON" (reporte de Jhon 2026-08-02).
  const isApi = pathname.startsWith('/api/')

  if (!sessionToken) {
    if (isApi) return addSecurityHeaders(NextResponse.json({ error: 'Sesión expirada. Recarga la página e inicia sesión de nuevo.', code: 'UNAUTHENTICATED' }, { status: 401 }))
    // Root path → marketing landing for unauthenticated visitors
    if (pathname === '/') {
      return addSecurityHeaders(NextResponse.redirect(new URL('/landing', request.url)))
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  // Verify the JWT token
  const payload = await verifySessionToken(sessionToken)

  if (!payload) {
    // API con token inválido/expirado: 401 JSON (no redirect que rompe el fetch).
    if (isApi) {
      const r = NextResponse.json({ error: 'Sesión expirada. Recarga la página e inicia sesión de nuevo.', code: 'UNAUTHENTICATED' }, { status: 401 })
      r.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' })
      return addSecurityHeaders(r)
    }
    // Token is invalid or expired — clear cookie and redirect
    if (pathname === '/') {
      const response = NextResponse.redirect(new URL('/landing', request.url))
      response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
      return addSecurityHeaders(response)
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // SEC-003
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return addSecurityHeaders(response)
  }

  // Admin panel — require superadmin role
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    if (payload.role !== 'superadmin') {
      // Redirect non-superadmins to home
      return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)))
    }
  }

  // User is authenticated — handle unknown routes
  // The dashboard is a single-page app; redirect unknown paths to /
  const knownPaths = [
    '/',
    '/login', '/signup', '/landing',
    '/terms', '/privacy', '/reset-password', '/setup-sql',
    '/select-plan',
    '/checkout',
  ]
  const isKnownPath = knownPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isApiPath = pathname.startsWith('/api/')
  const isAdminPath = pathname.startsWith('/admin')
  const isNextInternal = pathname.startsWith('/_next') || pathname.startsWith('/__nextjs')
  const isStaticFile = staticExtensions.some(ext => pathname.endsWith(ext))

  if (!isKnownPath && !isApiPath && !isAdminPath && !isNextInternal && !isStaticFile) {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|mov|webm|mp3|m4a|xlsx|xls|csv)$).*)',
  ],
}
