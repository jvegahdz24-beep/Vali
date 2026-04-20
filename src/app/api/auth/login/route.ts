// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Login API Endpoint
// POST /api/auth/login — Authenticate user and set session cookie
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { validateBody, loginSchema } from '@/lib/validations'

// Synchronous SHA-256 using Node.js crypto (fast, no async overhead, no bcrypt OOM)
function sha256hex(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex')
}

// Compare password: SHA-256 only (bcrypt removed for memory safety)
function verifyPassword(password: string, storedHash: string): boolean {
  const passwordHash = sha256hex(password)
  return passwordHash === storedHash
}

// Demo credentials (hardcoded for quick access)
const DEMO_EMAIL = 'jvegahdz24@gmail.com'
const DEMO_PASSWORD_SHA256 = sha256hex('valiflow2026')

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

    // Compare password (SHA-256)
    const isPasswordValid = verifyPassword(password, user.password)

    // Also accept demo credentials directly (backup in case DB hash is stale)
    const isDemoFallback = normalizedEmail === DEMO_EMAIL && sha256hex(password) === DEMO_PASSWORD_SHA256

    if (!isPasswordValid && !isDemoFallback) {
      return NextResponse.json(
        { error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

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
      console.log(`[Login] Auto-reactivated workspace ${firstMember.workspaceId} for user ${user.email}`)
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
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    console.log(`[Login] Success: ${user.email} → workspace ${activeMember?.workspaceId || 'none'}`)

    return response
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Login Error]', errMsg)
    return NextResponse.json(
      { error: 'Error interno del servidor', code: 'INTERNAL_ERROR', details: errMsg },
      { status: 500 }
    )
  }
}
