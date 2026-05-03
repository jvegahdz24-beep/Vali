import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

const ALLOWED_TABLES = ['contacts', 'conversations', 'messages', 'deals', 'agents', 'automations'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

const TABLE_FIELDS: Record<AllowedTable, string[]> = {
  contacts: ['id', 'firstName', 'lastName', 'phone', 'email', 'source', 'status', 'leadScore', 'createdAt'],
  conversations: ['id', 'channel', 'status', 'lastMessagePreview', 'unreadCount', 'createdAt'],
  messages: ['id', 'content', 'type', 'direction', 'senderType', 'isAiGenerated', 'createdAt'],
  deals: ['id', 'title', 'value', 'currency', 'status', 'createdAt'],
  agents: ['id', 'name', 'type', 'model', 'modelName', 'temperature', 'isActive', 'personality', 'createdAt'],
  automations: ['id', 'name', 'description', 'triggerType', 'isActive', 'runCount', 'createdAt'],
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const workspaceId = payload.workspaceId
    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'No workspace asociado al usuario' },
        { status: 400 }
      )
    }
    await requireWorkspace(workspaceId, payload.userId)

    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table') as AllowedTable | null
    const format = searchParams.get('format') || 'json'
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
      return NextResponse.json(
        { success: false, error: `Tabla no permitida. Tablas disponibles: ${ALLOWED_TABLES.join(', ')}` },
        { status: 400 }
      )
    }

    const fields = TABLE_FIELDS[table as AllowedTable] || []
    let records: Record<string, unknown>[] = []
    let total = 0

    if (table === 'contacts') {
      records = await db.contact.findMany({ where: { workspaceId }, take: limit, orderBy: { createdAt: 'desc' } })
      total = await db.contact.count({ where: { workspaceId } })
    } else if (table === 'conversations') {
      records = await db.conversation.findMany({ where: { workspaceId }, take: limit, orderBy: { createdAt: 'desc' } })
      total = await db.conversation.count({ where: { workspaceId } })
    } else if (table === 'messages') {
      records = await db.message.findMany({
        where: { conversation: { workspaceId } },
        take: limit, orderBy: { createdAt: 'desc' },
      })
      total = await db.message.count({ where: { conversation: { workspaceId } } })
    } else if (table === 'deals') {
      records = await db.deal.findMany({ where: { workspaceId }, take: limit, orderBy: { createdAt: 'desc' } })
      total = await db.deal.count({ where: { workspaceId } })
    } else if (table === 'agents') {
      records = await db.agent.findMany({ where: { workspaceId }, take: limit, orderBy: { createdAt: 'desc' } })
      total = await db.agent.count({ where: { workspaceId } })
    } else if (table === 'automations') {
      records = await db.automation.findMany({ where: { workspaceId }, take: limit, orderBy: { createdAt: 'desc' } })
      total = await db.automation.count({ where: { workspaceId } })
    }

    const formattedRecords = records.map(record => {
      const formatted: Record<string, unknown> = {}
      for (const field of fields) {
        if (field in record) {
          const val = record[field]
          if (val instanceof Date) {
            formatted[field] = val.toISOString()
          } else if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
            try { formatted[field] = JSON.parse(val) } catch { formatted[field] = val }
          } else {
            formatted[field] = val
          }
        }
      }
      return formatted
    })

    if (format === 'csv') {
      const escapeCSV = (val: unknown): string => {
        const str = String(val ?? '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csvRows = [
        fields.join(','),
        ...formattedRecords.map(row =>
          fields.map(f => escapeCSV(row[f])).join(',')
        ),
      ]

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${table}.csv"`,
        },
      })
    }

    return NextResponse.json({ success: true, table, total, items: formattedRecords, fields })
  } catch (error) {
    return errorResponse(error, 'Error al exportar datos')
  }
}
