// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Catalog API
// GET    /api/catalog?workspaceId=&category=&search=&active= — Lista ítems
// POST   /api/catalog — Crea un ítem
// PUT    /api/catalog — Actualiza un ítem (id en body)
// DELETE /api/catalog?id= — Elimina un ítem
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { allStatuses, statusKeyOf, roleCanSeeStatus } from '@/lib/inventory-visibility'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)

    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const activeParam = searchParams.get('active')

    const where: Record<string, unknown> = { workspaceId: workspaceId! }

    if (category) where.category = category
    if (activeParam !== null) where.isActive = activeParam === 'true'
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { category: { contains: search } },
      ]
    }

    const items = await db.catalogItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })

    // Get distinct categories for filters
    const allItems = await db.catalogItem.findMany({
      where: { workspaceId: workspaceId! },
      select: { category: true },
      distinct: ['category'],
    })
    const categories = allItems.map((i) => i.category).filter(Boolean) as string[]

    // Estatus del workspace (fábrica + personalizados) y filtrado por ROL:
    // un vendedor/viewer NO ve los autos en estatus restringidos a otros roles.
    // Dueño/Admin ven todo.
    const ws = await db.workspace.findUnique({ where: { id: workspaceId! }, select: { settings: true } })
    const statuses = allStatuses(ws?.settings)
    const isPrivileged = member.role === 'owner' || member.role === 'admin'
    const visibleItems = isPrivileged
      ? items
      : items.filter((i) => roleCanSeeStatus(statusKeyOf(i.metadata), member.role, statuses))

    return NextResponse.json({ items: visibleItems, categories, statuses })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      name: string
      description?: string
      price?: number
      currency?: string
      category?: string
      stock?: number
      isActive?: boolean
      imageUrl?: string
      metadata?: Record<string, unknown>
    }

    const { workspaceId, name, ...rest } = body

    if (!workspaceId || !name?.trim()) {
      return NextResponse.json({ error: 'workspaceId y name son requeridos' }, { status: 400 })
    }

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const item = await db.catalogItem.create({
      data: {
        workspaceId,
        name: name.trim(),
        description: rest.description?.trim() || null,
        price: rest.price ?? null,
        currency: rest.currency || 'MXN',
        category: rest.category?.trim() || null,
        stock: rest.stock ?? null,
        isActive: rest.isActive !== false,
        imageUrl: rest.imageUrl?.trim() || null,
        metadata: rest.metadata ? JSON.stringify(rest.metadata) : '{}',
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      id: string
      name?: string
      description?: string
      price?: number | null
      currency?: string
      category?: string | null
      stock?: number | null
      isActive?: boolean
      imageUrl?: string | null
      metadata?: Record<string, unknown>
    }

    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    }

    const existing = await db.catalogItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
    }

    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const item = await db.catalogItem.update({
      where: { id },
      data: {
        ...(updates.name !== undefined && { name: updates.name.trim() }),
        ...(updates.description !== undefined && { description: updates.description?.trim() || null }),
        ...(updates.price !== undefined && { price: updates.price }),
        ...(updates.currency !== undefined && { currency: updates.currency }),
        ...(updates.category !== undefined && { category: updates.category?.trim() || null }),
        ...(updates.stock !== undefined && { stock: updates.stock }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl?.trim() || null }),
        ...(updates.metadata !== undefined && { metadata: JSON.stringify(updates.metadata) }),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ item })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    }

    const existing = await db.catalogItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 })
    }

    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    await db.catalogItem.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
