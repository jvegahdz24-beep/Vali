import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const workspaceId = searchParams.get('workspaceId')
    const format = searchParams.get('format') || 'csv'

    await requireWorkspace(workspaceId!, session.userId)

    if (!type) {
      return Response.json(
        { success: false, error: 'type es requerido' },
        { status: 400 }
      )
    }

    if (format !== 'csv') {
      return Response.json(
        { success: false, error: 'Solo CSV es soportado actualmente' },
        { status: 400 }
      )
    }

    let csvContent = ''
    let filename = ''

    switch (type) {
      case 'contacts': {
        const contacts = await db.contact.findMany({
          where: { workspaceId: workspaceId! },
          orderBy: { createdAt: 'desc' },
        })

        const headers = 'Nombre,Apellido,Teléfono,Correo,Fuente,Estado,Lead Score,Tags,Fecha Creación,Último Mensaje'
        const rows = contacts.map((c) => {
          const tags = typeof c.tags === 'string' ? JSON.parse(c.tags || '[]').join('; ') : ''
          return [
            escapeField(c.firstName),
            escapeField(c.lastName || ''),
            escapeField(c.phone || ''),
            escapeField(c.email || ''),
            escapeField(c.source),
            escapeField(c.status),
            c.leadScore,
            escapeField(tags),
            c.createdAt.toISOString().slice(0, 10),
            c.lastMessageAt ? c.lastMessageAt.toISOString().slice(0, 10) : '',
          ].join(',')
        })

        csvContent = [headers, ...rows].join('\n')
        filename = `valiflow-contactos-${new Date().toISOString().slice(0, 10)}.csv`
        break
      }

      case 'deals': {
        const deals = (await db.deal.findMany({
          where: { workspaceId: workspaceId! },
          include: {
            contact: true,
            stage: true,
          },
          orderBy: { createdAt: 'desc' },
        })) as Array<any>

        const headers = 'Trato,Valor,Moneda,Estado,Fuente,Contacto,Etapa,Fecha Creación,Última Actualización'
        const rows = deals.map((d: any) => {
          const contactName = d.contact
            ? `${d.contact.firstName}${d.contact.lastName ? ' ' + d.contact.lastName : ''}`
            : ''
          return [
            escapeField(d.title),
            d.value,
            escapeField(d.currency),
            escapeField(d.status),
            escapeField(d.source),
            escapeField(contactName),
            escapeField(d.stage?.name || ''),
            d.createdAt.toISOString().slice(0, 10),
            d.updatedAt.toISOString().slice(0, 10),
          ].join(',')
        })

        csvContent = [headers, ...rows].join('\n')
        filename = `valiflow-tratos-${new Date().toISOString().slice(0, 10)}.csv`
        break
      }

      case 'conversations': {
        const conversations = (await db.conversation.findMany({
          where: { workspaceId: workspaceId! },
          include: {
            contact: true,
          },
          orderBy: { lastMessageAt: 'desc' },
        })) as Array<any>

        const headers = 'Contacto,Canal,Estado,Último Mensaje,No Leídos,Última Actividad,Fecha Creación'
        const rows = conversations.map((c: any) => {
          const contactName = c.contact
            ? `${c.contact.firstName}${c.contact.lastName ? ' ' + c.contact.lastName : ''}`
            : 'Sin contacto'
          return [
            escapeField(contactName),
            escapeField(c.channel),
            escapeField(c.status),
            escapeField(c.lastMessagePreview || ''),
            c.unreadCount,
            c.lastMessageAt.toISOString().slice(0, 10),
            c.createdAt.toISOString().slice(0, 10),
          ].join(',')
        })

        csvContent = [headers, ...rows].join('\n')
        filename = `valiflow-conversaciones-${new Date().toISOString().slice(0, 10)}.csv`
        break
      }

      default:
        return Response.json(
          { success: false, error: 'Tipo no válido. Usa: contacts, deals, conversations' },
          { status: 400 }
        )
    }

    return new Response('\ufeff' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

function escapeField(value: string): string {
  if (!value) return '""'
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
