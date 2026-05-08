// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Reports Export API
// GET /api/reports?type=contacts|deals|conversations|analytics&format=csv|json
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

    const type = searchParams.get('type') || 'contacts'
    const format = searchParams.get('format') || 'json'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const whereDate: Record<string, unknown> = {}
    if (startDate) {
      whereDate.gte = new Date(startDate)
    }
    if (endDate) {
      whereDate.lte = new Date(endDate)
    }

    let data: Record<string, unknown>[] = []
    let headers: string[] = []

    switch (type) {
      case 'contacts': {
        const contacts = await db.contact.findMany({
          where: {
            workspaceId: workspaceId!,
            ...(startDate || endDate ? { createdAt: whereDate } : {}),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            source: true,
            status: true,
            leadScore: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
        headers = ['ID', 'Nombre', 'Apellido', 'Teléfono', 'Email', 'Fuente', 'Estado', 'Lead Score', 'Creado', 'Actualizado']
        data = contacts.map((c) => ({
          ID: c.id,
          Nombre: c.firstName,
          Apellido: c.lastName || '',
          Teléfono: c.phone || '',
          Email: c.email || '',
          Fuente: c.source,
          Estado: c.status,
          'Lead Score': c.leadScore,
          Creado: c.createdAt.toISOString(),
          Actualizado: c.updatedAt.toISOString(),
        }))
        break
      }

      case 'deals': {
        const deals = await db.deal.findMany({
          where: {
            workspaceId: workspaceId!,
            ...(startDate || endDate ? { createdAt: whereDate } : {}),
          },
          include: {
            contact: { select: { firstName: true, lastName: true } },
            stage: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
        headers = ['ID', 'Título', 'Contacto', 'Etapa', 'Valor', 'Moneda', 'Estado', 'Fuente', 'Creado', 'Cerrado']
        data = deals.map((d) => ({
          ID: d.id,
          Título: d.title,
          Contacto: d.contact ? `${d.contact.firstName} ${d.contact.lastName || ''}` : '',
          Etapa: d.stage?.name,
          Valor: d.value,
          Moneda: d.currency,
          Estado: d.status,
          Fuente: d.source,
          Creado: d.createdAt.toISOString(),
          Cerrado: d.wonAt?.toISOString() || '',
        }))
        break
      }

      case 'conversations': {
        const conversations = await db.conversation.findMany({
          where: {
            workspaceId: workspaceId!,
            ...(startDate || endDate ? { createdAt: whereDate } : {}),
          },
          include: {
            contact: { select: { firstName: true, lastName: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { lastMessageAt: 'desc' },
        })
        headers = ['ID', 'Canal', 'Estado', 'Contacto', 'Mensajes', 'No Leídos', 'Agente Asignado', 'Último Mensaje', 'Creado']
        data = conversations.map((c) => ({
          ID: c.id,
          Canal: c.channel,
          Estado: c.status,
          Contacto: c.contact ? `${c.contact.firstName} ${c.contact.lastName || ''}` : '',
          Mensajes: c._count.messages,
          'No Leídos': c.unreadCount,
          'Agente Asignado': c.assignedAgentId || '',
          'Último Mensaje': c.lastMessageAt?.toISOString() || '',
          Creado: c.createdAt.toISOString(),
        }))
        break
      }

      case 'analytics': {
        // Analytics report: daily activity summary
        const totalContacts = await db.contact.count({
          where: { workspaceId: workspaceId! },
        })
        const totalConversations = await db.conversation.count({
          where: { workspaceId: workspaceId! },
        })
        const totalDeals = await db.deal.count({
          where: { workspaceId: workspaceId! },
        })
        const wonDeals = await db.deal.count({
          where: { workspaceId: workspaceId!, status: 'won' },
        })
        const activeDeals = await db.deal.count({
          where: { workspaceId: workspaceId!, status: 'active' },
        })
        const totalMessages = await db.message.count({
          where: { conversation: { workspaceId: workspaceId! } },
          ...(startDate || endDate ? { createdAt: whereDate as never } : {}),
        })
        const totalAgents = await db.agent.count({
          where: { workspaceId: workspaceId! },
        })

        // Revenue from won deals
        const revenueData = await db.deal.aggregate({
          _sum: { value: true },
          where: { workspaceId: workspaceId!, status: 'won' },
        })

        headers = ['Métrica', 'Valor']
        data = [
          { Métrica: 'Total Contactos', Valor: totalContacts },
          { Métrica: 'Total Conversaciones', Valor: totalConversations },
          { Métrica: 'Total Deals', Valor: totalDeals },
          { Métrica: 'Deals Activos', Valor: activeDeals },
          { Métrica: 'Deals Ganados', Valor: wonDeals },
          { Métrica: 'Ingresos Totales', Valor: revenueData._sum.value || 0 },
          { Métrica: 'Total Mensajes', Valor: totalMessages },
          { Métrica: 'Total Agentes', Valor: totalAgents },
        ]
        break
      }

      default:
        return Response.json({ error: 'Tipo de reporte no válido' }, { status: 400 })
    }

    if (format === 'csv') {
      const csvRows: string[] = []
      csvRows.push(headers.join(','))
      for (const row of data) {
        const values = headers.map((h) => {
          const val = String(row[h] ?? '')
          // Escape CSV values
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return val
        })
        csvRows.push(values.join(','))
      }
      const csv = csvRows.join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="reporte_${type}_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    // Default: JSON
    return Response.json({
      type,
      format: 'json',
      generatedAt: new Date().toISOString(),
      totalRows: data.length,
      headers,
      data,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
