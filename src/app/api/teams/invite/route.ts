// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Team Invitations (Section 10)
// POST /api/teams/invite    → send invitation email
// GET  /api/teams/invite?token=... → accept invitation
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// ─── POST: Send invitation ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId?: string; email?: string; role?: string }
    const { workspaceId, email, role = 'member' } = body

    if (!workspaceId || !email) {
      return NextResponse.json({ error: 'workspaceId y email son requeridos' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    // Only admin/owner can invite
    const membership = await requireWorkspace(workspaceId, session.userId)
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permisos insuficientes para invitar miembros' }, { status: 403 })
    }

    const validRoles = ['admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace no encontrado' }, { status: 404 })
    }

    // Check if user is already a member
    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existingUser) {
      const alreadyMember = await db.workspaceMember.findFirst({
        where: { workspaceId, userId: existingUser.id },
      })
      if (alreadyMember) {
        return NextResponse.json({ error: 'Este usuario ya es miembro del workspace' }, { status: 409 })
      }
    }

    // Invalidate any pending invitation for this email in this workspace
    await db.invitation.deleteMany({
      where: { workspaceId, email, acceptedAt: null },
    })

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitation = await db.invitation.create({
      data: {
        workspaceId,
        email,
        role,
        token,
        sentById: session.userId,
        expiresAt,
      },
    })

    const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'https://valiautoflow.com'
    const inviteUrl = `${appUrl}/accept-invite?token=${token}`

    // Send invite email via Resend
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `ValiAutoFlow <${process.env.EMAIL_FROM || 'noreply@valiautoflow.com'}>`,
        to: email,
        subject: `Te han invitado a ${workspace.name} en ValiAutoFlow`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2>Invitación a ${workspace.name}</h2>
            <p>Has sido invitado a unirte al workspace <strong>${workspace.name}</strong> como <strong>${role}</strong>.</p>
            <p>Esta invitación expira en 7 días.</p>
            <a href="${inviteUrl}" style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">
              Aceptar invitación
            </a>
            <p style="color:#666;font-size:12px">Si no reconoces esta invitación, ignora este mensaje.</p>
          </div>
        `,
        text: `Has sido invitado a ${workspace.name} en ValiAutoFlow. Acepta aquí: ${inviteUrl}`,
      })
    } catch (emailErr) {
      // Don't fail the request if email fails — invitation is still created
      console.error('[TeamInvite] Email error:', emailErr)
    }

    return NextResponse.json({
      success: true,
      invitationId: invitation.id,
      inviteUrl,
      expiresAt,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ─── GET: Accept invitation ───────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: { workspace: { select: { name: true } } },
    })

    if (!invitation) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
    }
    if (invitation.acceptedAt) {
      return NextResponse.json({ error: 'Esta invitación ya fue aceptada' }, { status: 409 })
    }
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Esta invitación ha expirado' }, { status: 410 })
    }

    // Verify the logged-in user's email matches the invitation
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } })
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Esta invitación fue enviada a otro email. Por favor inicia sesión con la cuenta correcta.' },
        { status: 403 }
      )
    }

    // Add user to workspace
    await db.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: session.userId, workspaceId: invitation.workspaceId } },
      create: { userId: session.userId, workspaceId: invitation.workspaceId, role: invitation.role },
      update: { role: invitation.role },
    })

    // Mark invitation as accepted
    await db.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      workspaceId: invitation.workspaceId,
      workspaceName: invitation.workspace.name,
      role: invitation.role,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
