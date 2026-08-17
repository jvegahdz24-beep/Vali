// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Tool Executor (Module 3)
// Executes AI-triggered tools: deal updates, credit calc,
// payment links, appointment scheduling, expediente uploads
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getExpedienteSummary } from '@/lib/erp/expediente'
import { getWorkspaceTimezone, zonedNaiveToUtc } from '@/lib/timezone'

// ─── Tool Definitions (OpenAI-compatible schema) ─────────────

export const REVENUE_ENGINE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consultarExpediente',
      description:
        'Consulta el expediente digital del contacto: qué documentos tiene en archivo (INE, RFC, comprobante, contrato) y si ya está listo para facturar. Úsalo antes de pedir datos fiscales o cerrar la venta.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateDealStage',
      description: 'Actualiza la etapa del deal del lead en el pipeline de ventas',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: 'Nombre de la etapa: Nuevo, Calificado, Propuesta, Negociación, Ganado, Perdido' },
          notes: { type: 'string', description: 'Notas opcionales sobre el cambio de etapa' },
        },
        required: ['stage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcularCredito',
      description: 'Calcula mensualidades y condiciones de crédito para un monto y plazo dados',
      parameters: {
        type: 'object',
        properties: {
          monto: { type: 'number', description: 'Monto total del crédito en MXN' },
          plazo: { type: 'number', description: 'Plazo en meses (12, 24, 36, 48, 60)' },
          tasa: { type: 'number', description: 'Tasa anual en % (opcional, default 24%)' },
        },
        required: ['monto', 'plazo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scheduleAppointment',
      description: 'Agenda una cita o llamada con el contacto',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha y hora en formato ISO 8601' },
          tipo: { type: 'string', description: 'Tipo: call, meeting, followup' },
          titulo: { type: 'string', description: 'Título de la cita' },
        },
        required: ['fecha', 'tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateContacto',
      description: 'Actualiza datos del contacto (email, presupuesto detectado, etc.)',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          notes: { type: 'string' },
          budget: { type: 'string', description: 'Presupuesto detectado, e.g. "500000 MXN"' },
        },
        required: [],
      },
    },
  },
]

// ─── Tool Result Types ────────────────────────────────────────

export interface ToolResult {
  toolName: string
  success: boolean
  data?: unknown
  message?: string
}

// ─── Tool Execution ───────────────────────────────────────────

/**
 * Execute a tool call triggered by the AI
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: {
    workspaceId: string
    contactId?: string
    conversationId?: string
  }
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'updateDealStage':
        return await executeUpdateDealStage(args, context)
      case 'calcularCredito':
        return executeCreditCalc(args)
      case 'scheduleAppointment':
        return await executeScheduleAppointment(args, context)
      case 'updateContacto':
        return await executeUpdateContacto(args, context)
      case 'consultarExpediente':
        return await executeConsultarExpediente(context)
      default:
        return { toolName, success: false, message: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    return {
      toolName,
      success: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

async function executeUpdateDealStage(
  args: Record<string, unknown>,
  ctx: { workspaceId: string; contactId?: string; conversationId?: string }
): Promise<ToolResult> {
  if (!ctx.contactId) return { toolName: 'updateDealStage', success: false, message: 'No contactId' }

  const stageName = String(args.stage || '')
  const activeDeal = await db.deal.findFirst({
    where: { contactId: ctx.contactId, workspaceId: ctx.workspaceId, status: 'active' },
    select: { id: true, pipelineId: true },
  })
  if (!activeDeal) return { toolName: 'updateDealStage', success: false, message: 'No active deal found' }

  const stage = await db.pipelineStage.findFirst({
    where: { pipelineId: activeDeal.pipelineId, name: { contains: stageName } },
    select: { id: true, name: true },
  })
  if (!stage) return { toolName: 'updateDealStage', success: false, message: `Stage "${stageName}" not found` }

  await db.deal.update({
    where: { id: activeDeal.id },
    data: { stageId: stage.id, updatedAt: new Date() },
  })

  return { toolName: 'updateDealStage', success: true, data: { stageId: stage.id, stageName: stage.name } }
}

function executeCreditCalc(args: Record<string, unknown>): ToolResult {
  const monto = Number(args.monto) || 0
  const plazo = Number(args.plazo) || 12
  const tasa = Number(args.tasa) || 24

  if (monto <= 0 || plazo <= 0) {
    return { toolName: 'calcularCredito', success: false, message: 'Monto y plazo deben ser positivos' }
  }

  const tasaMensual = tasa / 100 / 12
  const mensualidad = tasaMensual === 0
    ? monto / plazo
    : monto * (tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1)

  const totalPagar = mensualidad * plazo
  const totalIntereses = totalPagar - monto

  return {
    toolName: 'calcularCredito',
    success: true,
    data: {
      monto,
      plazo,
      tasa,
      mensualidad: Math.round(mensualidad * 100) / 100,
      totalPagar: Math.round(totalPagar * 100) / 100,
      totalIntereses: Math.round(totalIntereses * 100) / 100,
    },
    message: `Mensualidad: $${Math.round(mensualidad).toLocaleString('es-MX')} MXN por ${plazo} meses`,
  }
}

async function executeScheduleAppointment(
  args: Record<string, unknown>,
  ctx: { workspaceId: string; contactId?: string }
): Promise<ToolResult> {
  // Una cita SIN contacto es inútil (no dice con quién, no se puede confirmar ni
  // recordar). La IA no debe crear citas fantasma.
  if (!ctx.contactId) {
    return { toolName: 'scheduleAppointment', success: false, message: 'No se agenda: falta el contacto del lead.' }
  }
  const fechaStr = String(args.fecha || '')
  const tipo = String(args.tipo || 'call')
  const titulo = String(args.titulo || 'Cita agendada por IA')

  const fecha = zonedNaiveToUtc(fechaStr, await getWorkspaceTimezone(ctx.workspaceId))
  if (isNaN(fecha.getTime()) || fecha <= new Date()) {
    return { toolName: 'scheduleAppointment', success: false, message: `Fecha inválida: ${fechaStr}` }
  }

  const validTypes = ['call', 'meeting', 'followup', 'task']
  const appointmentType = validTypes.includes(tipo) ? tipo : 'call'

  await db.appointment.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactId,
      title: titulo,
      description: 'Agendada automáticamente por IA (Tool Executor)',
      date: fecha,
      duration: 20,
      type: appointmentType,
      status: 'pending',
    },
  })

  return { toolName: 'scheduleAppointment', success: true, data: { fecha: fecha.toISOString(), tipo: appointmentType } }
}

async function executeUpdateContacto(
  args: Record<string, unknown>,
  ctx: { workspaceId: string; contactId?: string }
): Promise<ToolResult> {
  if (!ctx.contactId) return { toolName: 'updateContacto', success: false, message: 'No contactId' }

  const updates: Record<string, unknown> = {}
  if (args.email) updates.email = String(args.email)
  if (args.notes) updates.notes = String(args.notes)

  if (args.budget) {
    const contact = await db.contact.findUnique({
      where: { id: ctx.contactId },
      select: { customFields: true },
    })
    const cf = typeof contact?.customFields === 'string'
      ? JSON.parse(contact.customFields || '{}')
      : (contact?.customFields || {})
    cf.detectedBudget = String(args.budget)
    updates.customFields = JSON.stringify(cf)
  }

  if (Object.keys(updates).length === 0) {
    return { toolName: 'updateContacto', success: false, message: 'No fields to update' }
  }

  await db.contact.update({ where: { id: ctx.contactId }, data: updates })
  return { toolName: 'updateContacto', success: true, data: updates }
}

async function executeConsultarExpediente(
  ctx: { workspaceId: string; contactId?: string }
): Promise<ToolResult> {
  if (!ctx.contactId) return { toolName: 'consultarExpediente', success: false, message: 'No contactId' }

  const summary = await getExpedienteSummary(ctx.workspaceId, ctx.contactId)
  const cats = Object.keys(summary.filesByCategory)
  const docsMsg = cats.length > 0 ? `Documentos en archivo: ${cats.join(', ')}.` : 'Sin documentos en archivo.'
  const invoiceMsg = summary.readyForInvoice
    ? 'Listo para facturar.'
    : `Faltan para facturar: ${summary.missingForInvoice.join(', ')}.`

  return {
    toolName: 'consultarExpediente',
    success: true,
    data: summary,
    message: `${docsMsg} ${invoiceMsg}`,
  }
}

/**
 * Build a formatted string result from a tool execution to inject back into the AI context
 */
export function formatToolResult(result: ToolResult): string {
  if (!result.success) return `[TOOL ERROR] ${result.toolName}: ${result.message}`
  if (result.message) return `[TOOL OK] ${result.toolName}: ${result.message}`
  return `[TOOL OK] ${result.toolName}: completado`
}
