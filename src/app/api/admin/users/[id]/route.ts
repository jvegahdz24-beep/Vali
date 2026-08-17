// ═══════════════════════════════════════════════════════════════
// Admin — User Detail & Actions
// GET    /api/admin/users/[id]       — get user detail
// PATCH  /api/admin/users/[id]       — update role, suspend, etc.
// DELETE /api/admin/users/[id]       — delete user
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateUserSchema = z.object({
  role: z.enum(['member', 'admin', 'owner', 'superadmin']).optional(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        image: true,
        phone: true,
        timezone: true,
        locale: true,
        ownedWorkspaces: {
          select: {
            id: true,
            name: true,
            plan: true,
            isActive: true,
            createdAt: true,
            subscription: {
              select: {
                plan: true,
                status: true,
                trialEnd: true,
                amount: true,
                currency: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
              },
            },
            _count: {
              select: {
                contacts: true,
                conversations: true,
                deals: true,
                agents: true,
                automations: true,
              },
            },
          },
        },
        workspaces: {
          select: {
            role: true,
            joinedAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                plan: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/users/[id] GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const data = updateUserSchema.parse(body)

    // Prevent superadmin from removing their own admin role
    if (id === session.userId && data.role && data.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'No puedes cambiar tu propio rol de superadmin' },
        { status: 400 }
      )
    }

    const user = await db.user.update({
      where: { id },
      data: {
        ...(data.role !== undefined && { role: data.role }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    })

    // If suspending the workspace, also update workspace.isActive
    if (data.isActive !== undefined) {
      await db.workspace.updateMany({
        where: { ownerId: id },
        data: { isActive: data.isActive },
      })
    }

    return NextResponse.json({ user, message: 'Usuario actualizado' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    console.error('[admin/users/[id] PATCH]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params

    if (id === session.userId) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })
    }

    // Explicit deletion order to satisfy all FK constraints
    await db.$transaction(async (tx) => {
      // 1. Remove user from all workspaces (member records)
      await tx.workspaceMember.deleteMany({ where: { userId: id } })
      // 2. Delete owned workspaces (cascades contacts, agents, conversations, etc.)
      await tx.workspace.deleteMany({ where: { ownerId: id } })
      // 3. Delete auth records
      await tx.session.deleteMany({ where: { userId: id } })
      await tx.account.deleteMany({ where: { userId: id } })
      // 4. Delete user (deleteMany avoids P2025 if already gone)
      await tx.user.deleteMany({ where: { id } })
    })

    return NextResponse.json({ message: 'Usuario eliminado' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/users/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
