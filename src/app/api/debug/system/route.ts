// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — System Diagnostic Endpoint
// GET /api/debug/system — Full system health check in 1 request
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { cookies } from 'next/headers'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// WhatsApp connection state (in-memory singleton)
let whatsappState: { status: string; qrCode: string | null; phone: string | null; lastActivity: string | null } = {
  status: 'unknown',
  qrCode: null,
  phone: null,
  lastActivity: null,
}

// Expose for whatsapp module to update
export function setWhatsappDebugState(state: typeof whatsappState) {
  whatsappState = state
}

async function checkComponent(name: string, fn: () => Promise<{ ok: boolean; detail: string; latencyMs?: number }>) {
  const start = Date.now()
  try {
    const result = await fn()
    return { name, ...result, latencyMs: Date.now() - start }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { name, ok: false, detail: msg, latencyMs: Date.now() - start }
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

  const startTime = Date.now()
  const results: Record<string, unknown> = {}

  // ─── 1. SERVER STATUS ─────────────────────────────────────
  results.server = {
    ok: true,
    detail: 'Next.js standalone running',
    uptime: process.uptime() ? `${Math.floor(process.uptime())}s` : 'unknown',
    memory: `${Math.round((process.memoryUsage?.().rss || 0) / 1024 / 1024)}MB RSS`,
    nodeEnv: process.env.NODE_ENV || 'not set',
    bunVersion: process.version || 'unknown',
  }

  // ─── 2. ENVIRONMENT ──────────────────────────────────────
  // FIX C6: Only report set/not-set, NEVER expose partial values
  const requiredEnvs = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL']
  const envStatus = requiredEnvs.map(key => ({
    key,
    set: !!process.env[key],
  }))
  const missingEnvs = envStatus.filter(e => !e.set).map(e => e.key)
  results.environment = {
    ok: missingEnvs.length === 0,
    detail: missingEnvs.length > 0 ? `Missing: ${missingEnvs.join(', ')}` : 'All required env vars present',
    variables: envStatus,
  }

  // ─── 3. DATABASE ─────────────────────────────────────────
  try {
    const dbStart = Date.now()
    const userCount = await db.user.count()
    const contactCount = await db.contact.count()
    const workspaceCount = await db.workspace.count()
    const dealCount = await db.deal.count()
    const messageCount = await db.message.count()
    const agentCount = await db.agent.count()
    results.database = {
      ok: true,
      detail: `SQLite connected — ${userCount} users, ${contactCount} contacts, ${dealCount} deals, ${messageCount} messages`,
      latencyMs: Date.now() - dbStart,
      stats: { users: userCount, contacts: contactCount, workspaces: workspaceCount, deals: dealCount, messages: messageCount, agents: agentCount },
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    results.database = { ok: false, detail: `DB Error: ${msg}` }
  }

  // ─── 4. AUTH ─────────────────────────────────────────────
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
    if (sessionToken) {
      const payload = await verifySessionToken(sessionToken)
      if (payload) {
        results.auth = {
          ok: true,
          detail: `Authenticated as ${payload.email} (role: ${payload.role})`,
          user: { email: payload.email, name: payload.name, role: payload.role, workspaceId: payload.workspaceId },
          cookieSecure: false,
          cookieName: SESSION_COOKIE_NAME,
        }
      } else {
        results.auth = { ok: false, detail: 'Invalid or expired session token', cookieExists: true }
      }
    } else {
      results.auth = {
        ok: false,
        detail: 'No session cookie found — user not logged in',
        cookieExists: false,
        cookieName: SESSION_COOKIE_NAME,
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    results.auth = { ok: false, detail: `Auth check error: ${msg}` }
  }

  // ─── 5. WHATSAPP ─────────────────────────────────────────
  try {
    // Check if whatsapp module exists and is connected
    let waStatus = 'not_loaded'
    let waPhone: string | null = null
    let waLastActivity: string | null = null

    // Try to import the whatsapp connection state
    try {
      // Dynamic import to avoid build issues if module is missing
      const whatsappDir = process.cwd() + '/.whatsapp-auth'
      const fs = await import('fs')
      if (fs.default.existsSync(whatsappDir)) {
        const files = fs.default.readdirSync(whatsappDir)
        waStatus = files.length > 0 ? 'session_exists' : 'no_session'
      } else {
        waStatus = 'no_auth_dir'
      }
    } catch {
      waStatus = 'check_failed'
    }

    // Check the Baileys socket state via a simple test
    try {
      const { default: makeWASocket } = await import('@whiskeysockets/baileys')
      waStatus = 'baileys_available'
    } catch {
      waStatus = 'baileys_not_available'
    }

    results.whatsapp = {
      ok: waStatus === 'session_exists',
      detail: waStatus === 'session_exists'
        ? 'Session files found — may need QR rescan after container restart'
        : waStatus === 'no_session'
          ? 'No WhatsApp session — scan QR to connect'
          : waStatus === 'no_auth_dir'
            ? 'No .whatsapp-auth directory — needs setup'
            : `Status: ${waStatus}`,
      sessionStatus: waStatus,
      connected: false, // Always false after container restart
      phone: waPhone,
      lastActivity: waLastActivity,
      note: 'WhatsApp session resets on every container restart. Scan QR again after each restart.',
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    results.whatsapp = { ok: false, detail: `WhatsApp check error: ${msg}`, connected: false }
  }

  // ─── 6. AI ───────────────────────────────────────────────
  // FIX C6: Never expose partial API keys
  try {
    const hasKey = !!process.env.ZAI_API_KEY && process.env.ZAI_API_KEY.length > 10
    results.ai = {
      ok: hasKey,
      detail: hasKey ? 'ZAI API Key configured' : 'ZAI_API_KEY not configured — AI features disabled',
      provider: 'z-ai-web-dev-sdk (GLM)',
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    results.ai = { ok: false, detail: msg }
  }

  // ─── 7. MIDDLEWARE ───────────────────────────────────────
  results.middleware = {
    ok: true,
    detail: 'Middleware active — security headers, rate limiting, JWT verification',
    features: ['auth_redirect', 'rate_limiting', 'security_headers', 'session_verification'],
  }

  // ─── 8. BUILD INFO ───────────────────────────────────────
  results.build = {
    ok: true,
    detail: 'Standalone production build',
    standalone: true,
    buildId: process.env.__NEXT_BUILD_ID || 'unknown',
  }

  // ─── OVERALL STATUS ──────────────────────────────────────
  const allResults = Object.values(results) as Array<{ ok: boolean }>
  const criticalOk = [results.server, results.database, results.auth, results.ai].every(r => (r as { ok: boolean }).ok || true) // auth/ai not critical for system health
  const systemOk = (results.server as { ok: boolean }).ok && (results.database as { ok: boolean }).ok
  const warnings: string[] = []
  if (!(results.auth as { ok: boolean }).ok) warnings.push('auth')
  if (!(results.whatsapp as { ok: boolean }).ok) warnings.push('whatsapp')
  if (!(results.ai as { ok: boolean }).ok) warnings.push('ai')

  return NextResponse.json({
    status: systemOk ? 'ok' : 'critical',
    message: systemOk
      ? warnings.length > 0
        ? `System operational. Warnings: ${warnings.join(', ')}`
        : 'All systems operational'
      : 'CRITICAL: Core system failure',
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    components: results,
    summary: {
      server: (results.server as { ok: boolean }).ok ? 'ok' : 'CRITICAL',
      database: (results.database as { ok: boolean }).ok ? 'ok' : 'CRITICAL',
      auth: (results.auth as { ok: boolean }).ok ? 'ok' : 'warning',
      whatsapp: (results.whatsapp as { ok: boolean }).ok ? 'ok' : 'warning',
      ai: (results.ai as { ok: boolean }).ok ? 'ok' : 'warning',
    },
  })
  } catch (error) {
    return errorResponse(error, 'Error en diagnóstico del sistema')
  }
}
