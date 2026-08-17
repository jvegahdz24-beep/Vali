// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Module AI Tools
// Funciones que el agente IA puede invocar cuando los módulos
// appointments y catalog están activos.
// El agente menciona el tool_name en su respuesta y el processore
// lo detecta y ejecuta antes de enviar al cliente.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWorkspaceTimezone, zonedNaiveToUtc } from '@/lib/timezone'

// ─── Pattern matcher para detectar tool calls en respuestas IA ───

/**
 * Detecta si el AI quiere llamar a una tool en su respuesta.
 * Formato esperado: <<tool_name(param1, param2)>>
 * Ejemplo: <<check_availability(2024-12-20)>>
 */
export function detectToolCall(text: string): ToolCallMatch | null {
  const match = text.match(/<<(\w+)\(([^)]*)\)>>/)
  if (!match) return null
  return {
    fullMatch: match[0],
    toolName: match[1],
    rawArgs: match[2].split(',').map((a) => a.trim()).filter(Boolean),
  }
}

export interface ToolCallMatch {
  fullMatch: string
  toolName: string
  rawArgs: string[]
}

// ─── Tool Definitions ────────────────────────────────────────

/**
 * check_availability(date)
 * Verifica los slots disponibles para una fecha dada.
 * Date format: YYYY-MM-DD or natural description
 */
export async function check_availability(
  workspaceId: string,
  dateArg: string
): Promise<string> {
  try {
    // Parse date (accept YYYY-MM-DD or today/mañana)
    let targetDate: Date
    const normalized = dateArg.toLowerCase().trim()
    if (normalized === 'hoy' || normalized === 'today') {
      targetDate = new Date()
    } else if (normalized === 'mañana' || normalized === 'manana' || normalized === 'tomorrow') {
      targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + 1)
    } else {
      targetDate = new Date(dateArg)
      if (isNaN(targetDate.getTime())) {
        return `No pude interpretar la fecha "${dateArg}". Por favor indica la fecha en formato DD/MM/YYYY o di "hoy" o "mañana".`
      }
    }

    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    const tz = await getWorkspaceTimezone(workspaceId)
    const existingAppointments = await db.appointment.findMany({
      where: {
        workspaceId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: 'cancelled' },
      },
      orderBy: { date: 'asc' },
      select: { date: true, duration: true, title: true },
    })

    const dateStr = targetDate.toLocaleDateString('es-MX', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    if (existingAppointments.length === 0) {
      return `Para el ${dateStr} tenemos disponibilidad durante todo el día. ¿Qué horario te acomoda mejor?`
    }

    const occupiedSlots = existingAppointments.map((a) => {
      const time = a.date.toLocaleTimeString('es-MX', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      return time
    })

    return `Para el ${dateStr}, los siguientes horarios ya están ocupados: ${occupiedSlots.join(', ')}. ¿Te funciona otro horario o quieres ver otro día?`
  } catch (err) {
    console.error('[Tool:check_availability]', err)
    return 'No pude consultar la disponibilidad en este momento. Por favor intenta de nuevo.'
  }
}

/**
 * create_appointment(contactName, dateTime, title, type)
 * Crea una cita en el calendario interno.
 */
export async function create_appointment(
  workspaceId: string,
  contactName: string,
  dateTimeArg: string,
  title?: string,
  type: string = 'meeting',
  contactId?: string
): Promise<string> {
  try {
    const tz = await getWorkspaceTimezone(workspaceId)
    const appointmentDate = zonedNaiveToUtc(dateTimeArg, tz)
    if (isNaN(appointmentDate.getTime())) {
      return `No pude interpretar la fecha y hora "${dateTimeArg}". Por favor indica en formato: "2024-12-20 10:00" o similar.`
    }

    // Don't allow appointments in the past
    if (appointmentDate < new Date()) {
      return 'No se pueden agendar citas en el pasado. Por favor elige una fecha futura.'
    }

    // Una cita SIN contacto es inútil (no dice con quién, no se confirma ni recuerda).
    if (!contactId) {
      return 'No pude agendar la cita porque no identifiqué al contacto. Indícame de qué cliente es la cita.'
    }

    const appointmentTitle = title || `Cita con ${contactName}`
    const validTypes = ['call', 'meeting', 'followup', 'task']
    const appointmentType = validTypes.includes(type) ? type : 'meeting'

    await db.appointment.create({
      data: {
        workspaceId,
        contactId: contactId,
        title: appointmentTitle,
        description: `Cita agendada por el asistente IA para: ${contactName}`,
        date: appointmentDate,
        duration: 30,
        type: appointmentType,
        status: 'pending',
      },
    })

    const dateStr = appointmentDate.toLocaleDateString('es-MX', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const timeStr = appointmentDate.toLocaleTimeString('es-MX', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    return `¡Perfecto! Agendé tu cita para el ${dateStr} a las ${timeStr}. Recibirás confirmación. ¿Necesitas algo más?`
  } catch (err) {
    console.error('[Tool:create_appointment]', err)
    return 'Hubo un problema al agendar la cita. Por favor intenta de nuevo o contacta directamente al negocio.'
  }
}

/**
 * search_catalog(query)
 * Busca productos o servicios en el catálogo del workspace.
 */
export async function search_catalog(
  workspaceId: string,
  query: string
): Promise<string> {
  try {
    if (!query?.trim()) {
      return 'Por favor indícame qué tipo de producto o servicio estás buscando.'
    }

    const rawItems = await db.catalogItem.findMany({
      where: {
        workspaceId,
        isActive: true,
        OR: [
          { name: { contains: query } },
          { description: { contains: query } },
          { category: { contains: query } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 15,
      select: { name: true, price: true, currency: true, stock: true, category: true, metadata: true },
    })
    // No ofrecer al cliente autos en estatus con visibleToClient=false.
    const { clientHiddenStatusKeys, statusKeyOf } = await import('@/lib/inventory-visibility')
    const wsRow = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const hiddenKeys = clientHiddenStatusKeys(wsRow?.settings)
    const items = rawItems.filter((it) => !hiddenKeys.has(statusKeyOf(it.metadata))).slice(0, 5)

    if (items.length === 0) {
      return `No encontré productos relacionados con "${query}". ¿Puedes darme más detalles sobre lo que buscas?`
    }

    const results = items.map((item) => {
      const priceStr = item.price != null
        ? ` — ${item.currency || 'MXN'} $${Number(item.price).toLocaleString('es-MX')}`
        : ''
      const stockStr = item.stock != null ? ` (${item.stock} disponibles)` : ''
      const categoryStr = item.category ? ` [${item.category}]` : ''
      return `• ${item.name}${categoryStr}${priceStr}${stockStr}`
    }).join('\n')

    return `Encontré ${items.length} resultado(s) para "${query}":\n${results}\n\n¿Te interesa alguno? Puedo darte más detalles.`
  } catch (err) {
    console.error('[Tool:search_catalog]', err)
    return 'No pude consultar el catálogo en este momento. Por favor intenta de nuevo.'
  }
}

/**
 * get_product_details(id)
 * Obtiene los detalles completos de un producto específico.
 */
export async function get_product_details(
  workspaceId: string,
  productId: string
): Promise<string> {
  try {
    const item = await db.catalogItem.findFirst({
      where: { id: productId, workspaceId, isActive: true },
    })

    if (!item) {
      return 'No encontré ese producto en el catálogo. ¿Puedes confirmar que es el correcto?'
    }

    const lines = [`📦 *${item.name}*`]
    if (item.category) lines.push(`Categoría: ${item.category}`)
    if (item.description) lines.push(`\n${item.description}`)
    if (item.price != null) {
      lines.push(`\nPrecio: ${item.currency || 'MXN'} $${Number(item.price).toLocaleString('es-MX')}`)
    }
    if (item.stock != null) {
      lines.push(item.stock > 0 ? `Disponibilidad: ${item.stock} unidades` : '⚠️ Sin stock por el momento')
    }

    return lines.join('\n')
  } catch (err) {
    console.error('[Tool:get_product_details]', err)
    return 'No pude obtener los detalles del producto. Por favor intenta de nuevo.'
  }
}

// ─── Tool Router ─────────────────────────────────────────────

/**
 * update_deal_stage(contactId_or_name, stageName)
 * Moves a contact's active deal to the specified pipeline stage.
 * Called by AI when it detects a deal has progressed.
 */
export async function update_deal_stage(
  workspaceId: string,
  contactIdentifier: string,
  stageName: string,
  currentContactId?: string
): Promise<string> {
  try {
    if (!stageName) return 'Necesito el nombre de la etapa. Ejemplo: <<update_deal_stage(contactId, Propuesta enviada)>>'

    // Resolve contact
    let contactId = currentContactId
    if (!contactId && contactIdentifier) {
      const contact = await db.contact.findFirst({
        where: {
          workspaceId,
          OR: [
            { id: contactIdentifier },
            { firstName: { contains: contactIdentifier } },
            { phone: contactIdentifier },
          ],
        },
        select: { id: true },
      })
      contactId = contact?.id
    }

    if (!contactId) return 'No encontré el contacto para mover el deal.'

    // Find active deal
    const deal = await db.deal.findFirst({
      where: { workspaceId, contactId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, stageId: true, pipelineId: true },
    })
    if (!deal) return 'No encontré un deal activo para este contacto.'

    // Find matching stage in same pipeline
    const stage = await db.pipelineStage.findFirst({
      where: {
        pipelineId: deal.pipelineId,
        name: { contains: stageName },
      },
      select: { id: true, name: true },
    })
    if (!stage) return `No encontré la etapa "${stageName}" en este pipeline.`

    if (stage.id === deal.stageId) return `El deal ya está en la etapa "${stage.name}".`

    // Update deal stage (the deals route handles event publishing + history)
    await db.deal.update({
      where: { id: deal.id },
      data: { stageId: stage.id, updatedAt: new Date() },
    })

    // Write history directly since we're skipping the API route
    const oldStage = await db.pipelineStage.findUnique({ where: { id: deal.stageId }, select: { name: true } })
    await db.dealStageHistory.create({
      data: {
        dealId: deal.id,
        workspaceId,
        contactId,
        oldStageId: deal.stageId,
        oldStageName: oldStage?.name ?? null,
        newStageId: stage.id,
        newStageName: stage.name,
      },
    })

    return `✅ Deal movido a la etapa "${stage.name}".`
  } catch (err) {
    console.error('[Tool:update_deal_stage]', err)
    return 'No pude actualizar el deal en este momento.'
  }
}

/**
 * Ejecuta la tool detectada en la respuesta del AI.
 * Retorna el resultado de la tool como string para insertar en la respuesta.
 */
export async function executeToolCall(
  toolCall: ToolCallMatch,
  workspaceId: string,
  contactId?: string,
  contactName?: string
): Promise<string | null> {
  const { toolName, rawArgs } = toolCall

  switch (toolName) {
    case 'check_availability':
      return check_availability(workspaceId, rawArgs[0] || 'hoy')

    case 'create_appointment':
      return create_appointment(
        workspaceId,
        rawArgs[0] || contactName || 'Cliente',
        rawArgs[1] || '',
        rawArgs[2],
        rawArgs[3],
        contactId
      )

    case 'search_catalog':
      return search_catalog(workspaceId, rawArgs[0] || '')

    case 'get_product_details':
      return get_product_details(workspaceId, rawArgs[0] || '')

    case 'update_deal_stage':
      return update_deal_stage(workspaceId, rawArgs[0] || '', rawArgs[1] || '', contactId)

    default:
      console.warn(`[Tools] Unknown tool: ${toolName}`)
      return null
  }
}
