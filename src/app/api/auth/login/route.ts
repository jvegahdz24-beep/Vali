// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Login API Endpoint
// POST /api/auth/login — Authenticate user and set session cookie
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, comparePassword, SESSION_COOKIE_NAME } from '@/lib/auth'
import { validateBody, loginSchema } from '@/lib/validations'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const validation = validateBody(loginSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { email, password } = validation.data

    // Find user in DB
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    // Compare password with bcrypt hash
    const isPasswordValid = await comparePassword(password, user.password)
    if (!isPasswordValid) {
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
      // No active workspace found — reactivate the first one
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
      secure: false, // Behind Caddy reverse proxy (SSL terminated at proxy level)
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Login Error]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
