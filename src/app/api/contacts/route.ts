// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Contacts API
// GET /api/contacts — List contacts
// POST /api/contacts — Create contact
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

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

    const where: Record<string, unknown> = {
      workspaceId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(source ? { source } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    }

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

    await requireWorkspace(workspaceId, session.userId)

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
