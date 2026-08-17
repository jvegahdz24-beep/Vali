// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Contacts API
// GET /api/contacts — List contacts
// POST /api/contacts — Create contact
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, getPlanLimits, ApiError } from '@/lib/api-auth'
import { canViewAllData } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)

    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || undefined
    const source = searchParams.get('source') || undefined
    const sortBy = searchParams.get('sortBy') || 'lastMessageAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)
    const leadScoreMin = searchParams.get('leadScoreMin') ? parseInt(searchParams.get('leadScoreMin')!, 10) : undefined
    const leadScoreMax = searchParams.get('leadScoreMax') ? parseInt(searchParams.get('leadScoreMax')!, 10) : undefined
    const tagsParam = searchParams.get('tags') || undefined
    // Segmento de las pestañas de Contactos (mismas definiciones que /api/contacts/stats)
    const segment = searchParams.get('segment') || undefined
    // Filtro por ETAPA del pipeline (campañas masivas §Pantalla 5): contactos con
    // un trato en esa etapa.
    const stageId = searchParams.get('stageId') || undefined

    // Búsqueda por TOKENS: "Nombre Apellido" se divide en palabras y cada una
    // debe aparecer en algún campo (AND de ORs). Antes el término completo se
    // comparaba contra cada campo por separado y "Juan Pérez" no encontraba
    // firstName="Juan" lastName="Pérez".
    const tokenFilter = (token: string) => ({
      OR: [
        { firstName: { contains: token } },
        { lastName: { contains: token } },
        { phone: { contains: token } },
        { email: { contains: token } },
      ],
    })
    const searchTokens = search.trim().split(/\s+/).filter(Boolean).slice(0, 6)

    const where: Record<string, unknown> = {
      workspaceId,
      ...(status && status !== 'all' ? { status } : { status: { not: 'archived' } }),
      ...(source ? { source } : {}),
      ...(searchTokens.length ? { AND: searchTokens.map(tokenFilter) } : {}),
    }

    // RBAC: un vendedor (member) solo ve SUS contactos asignados; owner/admin/viewer
    // ven todo el workspace (igual que /api/conversations). Contact.assignedTo = userId.
    if (!canViewAllData(member.role)) where.assignedTo = session.userId

    // Handle lead score range filter
    if (leadScoreMin !== undefined || leadScoreMax !== undefined) {
      const scoreFilter: Record<string, unknown> = {}
      if (leadScoreMin !== undefined) scoreFilter.gte = leadScoreMin
      if (leadScoreMax !== undefined) scoreFilter.lte = leadScoreMax
      ;(where as any).leadScore = scoreFilter
    }

    // Handle tags filter
    if (tagsParam) {
      const tagList = tagsParam.split(',').map(t => t.trim()).filter(Boolean)
      if (tagList.length > 0) {
        (where as any).tags = { contains: tagList[0] }
      }
    }

    // Filtro por etapa del pipeline: contactos con un trato en esa etapa.
    if (stageId) {
      (where as any).deals = { some: { stageId } }
    }

    // Segmento de pestaña — MISMAS definiciones que /api/contacts/stats para que
    // el contador de la pestaña y la lista SIEMPRE cuadren (antes las pestañas
    // Clientes/Inactivos no filtraban nada y la lista no correspondía al número).
    if (segment && segment !== 'todos') {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      if (segment === 'leads') {
        (where as any).leadScore = { lt: 40 }
      } else if (segment === 'prospectos') {
        (where as any).leadScore = { gte: 40, lt: 70 }
      } else if (segment === 'clientes') {
        (where as any).OR = [
          { deals: { some: { OR: [{ status: 'won' }, { stage: { isWon: true } }] } } },
          { tags: { contains: '"cliente"' } },
        ]
      } else if (segment === 'inactivos') {
        (where as any).OR = [{ lastMessageAt: { lt: d30 } }, { lastMessageAt: null }]
      }
    }

    const [contacts, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              conversations: true,
              deals: true,
            },
          },
        },
      }),
      db.contact.count({ where }),
    ])

    return Response.json({
      items: contacts,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, firstName, lastName, phone, email, source, tags, customFields, notes } = body

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    // Enforce plan contact limit
    const { limits, planName } = await getPlanLimits(workspaceId)
    if (limits.maxContacts !== -1) {
      const count = await db.contact.count({ where: { workspaceId, status: { not: 'archived' } } })
      if (count >= limits.maxContacts) {
        throw new ApiError(
          403,
          `Has alcanzado el límite de ${limits.maxContacts} contactos de tu plan ${planName}. Actualiza tu plan para agregar más contactos.`,
          'CONTACT_LIMIT_REACHED'
        )
      }
    }

    if (!firstName) {
      return Response.json(
        { error: 'Missing required fields: firstName' },
        { status: 400 }
      )
    }

    // Check for duplicate phone
    if (phone) {
      const existing = await db.contact.findFirst({
        where: { workspaceId, phone, status: { not: 'archived' } },
      })
      if (existing) {
        return Response.json({ error: 'Contact with this phone already exists', contactId: existing.id }, { status: 409 })
      }
    }

    const contact = await db.contact.create({
      data: {
        workspaceId,
        firstName,
        lastName: lastName || null,
        phone: phone || null,
        email: email || null,
        source: source || 'manual',
        tags: JSON.stringify(tags || []),
        customFields: JSON.stringify(customFields || {}),
        notes: notes || null,
      },
    })

    return Response.json({ success: true, contact }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
