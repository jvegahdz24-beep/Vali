// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Login API Endpoint
// POST /api/auth/login — Authenticate user and set session cookie
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { validateBody, loginSchema } from '@/lib/validations'
import { logInfo, logError, logWarn, logOk } from '@/lib/logger'
import { acceptPendingInvitations } from '@/lib/auth/accept-invitations'
import { logAudit, getRequestIp } from '@/lib/audit'
import { recordAccessSession, getAccessContext } from '@/lib/access-session'

// Compare password using bcrypt (supports both legacy SHA-256 and new bcrypt hashes)
function verifyPassword(password: string, storedHash: string): { valid: boolean; isLegacy: boolean } {
  // bcrypt hashes start with $2a$, $2b$, or $2y$
  if (storedHash.startsWith('$2')) {
    return { valid: bcrypt.compareSync(password, storedHash), isLegacy: false }
  }
  // Legacy SHA-256 fallback (for accounts created before migration)
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex')
  return { valid: legacyHash === storedHash, isLegacy: true }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const validation = validateBody(loginSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { email, password } = validation.data
    const normalizedEmail = email.toLowerCase().trim()

    // Find user in DB
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    // SEC-007: Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Cuenta bloqueada temporalmente. Intenta de nuevo más tarde.', code: 'ACCOUNT_LOCKED' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } }
      )
    }

    // Compare password (bcrypt, with transparent upgrade from legacy SHA-256)
    const { valid: isPasswordValid, isLegacy } = verifyPassword(password, user.password)

    if (!isPasswordValid) {
      // SEC-007: Increment failed attempts; lock after 10 failures for 15 minutes
      const newCount = (user.failedLoginAttempts ?? 0) + 1
      const shouldLock = newCount >= 10
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newCount,
          ...(shouldLock ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}),
        },
      })
      // ValiGuard: registrar acceso sospechoso (intento fallido) con IP + dispositivo
      try {
        const m = await db.workspaceMember.findFirst({ where: { userId: user.id }, select: { workspaceId: true } })
        if (m) {
          const ctx = getAccessContext(req)
          await logAudit({ workspaceId: m.workspaceId, userId: user.id, action: 'login_failed', ip: ctx.ip, metadata: { email: normalizedEmail, attempts: newCount, locked: shouldLock, browser: ctx.browser, os: ctx.os, device: ctx.device, city: ctx.city, country: ctx.country } })
        }
      } catch { /* nunca bloquear el login */ }
      return NextResponse.json(
        { error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    // VULN-004 fix: Transparently upgrade legacy SHA-256 hash to bcrypt
    if (isLegacy) {
      try {
        const newHash = await bcrypt.hash(password, 12)
        await db.user.update({ where: { id: user.id }, data: { password: newHash } })
      } catch (upgradeErr) {
        // Non-fatal: log but don't block login
        logWarn('AUTH', 'password_upgrade_failed', { userId: user.id, error: upgradeErr instanceof Error ? upgradeErr.message : String(upgradeErr) })
      }
    }

    // SEC-007: Reset failed login attempts on successful authentication
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    // Auto-aceptar invitaciones pendientes para este email (unirse a equipos)
    await acceptPendingInvitations(user.id, user.email)

    // Get workspaceId — prefer ACTIVE workspace, fallback to any
    const members = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, isActive: true } } },
    })

    // Auto-reactivate any inactive workspace for this user
    let activeMember = members.find(m => m.workspace.isActive)
    if (!activeMember && members.length > 0) {
      const firstMember = members[0]
      await db.workspace.update({
        where: { id: firstMember.workspaceId },
        data: { isActive: true },
      })
      activeMember = { ...firstMember, workspace: { id: firstMember.workspaceId, isActive: true } }
      logInfo('AUTH', 'workspace_reactivated', { workspaceId: firstMember.workspaceId, userId: user.id })
    }

    // Create JWT token
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      workspaceId: activeMember?.workspaceId,
    })

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // SEC-003
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    logOk('AUTH', 'login_success', { userId: user.id, workspaceId: activeMember?.workspaceId || null })

    // ValiGuard: registrar acceso exitoso como sesión activa + bitácora con dispositivo/ubicación
    if (activeMember?.workspaceId) {
      try {
        const ctx = await recordAccessSession({ workspaceId: activeMember.workspaceId, userId: user.id, req })
        await logAudit({
          workspaceId: activeMember.workspaceId, userId: user.id, action: 'login', ip: ctx.ip,
          metadata: { email: user.email, browser: ctx.browser, os: ctx.os, device: ctx.device, city: ctx.city, country: ctx.country },
        })
      } catch { /* no bloquear */ }
    }

    return response
  } catch (error) {
    logError('AUTH', 'login_error', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
