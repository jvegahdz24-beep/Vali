// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Ephemeral Agents System
// Dynamic AI agent spawning for specialized, short-lived tasks.
// Agents are spawned by events, produce recommendations (not
// direct responses), and auto-expire after inactivity.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import { eventBus, EVENT_TYPES } from '@/lib/event-bus'
import { logInfo, logWarn, logError, logTimer } from '@/lib/logger'

// ─── Constants ────────────────────────────────────────────────

/** Maximum agent lifetime in milliseconds (1 hour) */
const MAX_LIFETIME_MS = 60 * 60 * 1000

/** Auto-expire after this many ms of inactivity (15 minutes) */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

/** Persistencia no disponible hasta migrar el modelo ephemeralAgent. */
export const EPHEMERAL_AGENTS_ENABLED = process.env.EPHEMERAL_AGENTS_ENABLED === 'true'

function assertEphemeralAgentsEnabled(): void {
  if (!EPHEMERAL_AGENTS_ENABLED) {
    throw new Error('Ephemeral agents are disabled until their Prisma migration is deployed')
  }
}

// ─── Types ────────────────────────────────────────────────────

export type EphemeralAgentType =
  | 'financial_advisor'
  | 'debt_collector'
  | 'recovery_agent'
  | 'emotional_support'
  | 'calendar_agent'
  | 'research_agent'
  | 'campaign_agent'
  | 'closing_agent'

export type EphemeralAgentStatus = 'spawning' | 'active' | 'completed' | 'expired' | 'failed'

export interface AgentTemplate {
  type: EphemeralAgentType
  name: string
  description: string
  icon: string
  systemPrompt: string
  spawnEvents: string[]
  objective: string
  successCriteria: string[]
  availableTools: string[]
}

export interface SpawnAgentInput {
  workspaceId: string
  contactId?: string
  agentType: EphemeralAgentType
  spawnReason: string
  context?: Record<string, unknown>
}

export interface AgentResult {
  agentId: string
  agentType: EphemeralAgentType
  status: EphemeralAgentStatus
  recommendation: string
  actions: Array<{ type: string; description: string; payload?: Record<string, unknown> }>
  confidence: number
  reasoning: string
}

export interface ContactContext {
  contactId?: string
  contactName?: string
  contactPhone?: string
  temperature?: string
  leadScore?: number
  lastMessage?: string
  dealStage?: string
  dealValue?: number
  tags?: string[]
  notes?: string
}

// ─── 8 Agent Templates (Spanish System Prompts) ────────────────

export const AGENT_TEMPLATES: Record<EphemeralAgentType, AgentTemplate> = {
  financial_advisor: {
    type: 'financial_advisor',
    name: 'Asesor Financiero',
    description: 'Genera opciones de financiamiento y planes de pago personalizados',
    icon: '💰',
    systemPrompt: `Eres un asesor financiero especializado del equipo de ventas. Tu único objetivo es generar RECOMENDACIONES de financiamiento y opciones de pago personalizadas.

REGLAS:
- Analiza la situación financiera del contacto y su capacidad de pago
- Genera al menos 3 opciones de financiamiento diferenciadas (enganche, mensualidades, plazos)
- Considera planes con tasas preferenciales cuando aplica
- NO respondas directamente al contacto — genera recomendaciones para el agente principal
- Toda la comunicación en español de México
- Sé preciso con números: enganche, mensualidades, CAT, plazo

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Resumen ejecutivo de la mejor opción",
  "actions": [
    {"type": "suggest_financing", "description": "...", "payload": {...}},
    {"type": "update_crm", "description": "..."}
  ],
  "confidence": 0.85,
  "reasoning": "Por qué se recomienda esta opción"
}`,
    spawnEvents: ['price_objection', 'financing_inquiry', 'budget_discussion'],
    objective: 'Generar opciones de financiamiento personalizadas basadas en la capacidad de pago detectada del contacto',
    successCriteria: [
      'Al menos 3 opciones de pago generadas',
      'Enganche y mensualidades calculados',
      'Recomendación principal identificada con justificación',
    ],
    availableTools: ['crm_get_contact', 'crm_update_lead', 'analytics_get_summary'],
  },

  debt_collector: {
    type: 'debt_collector',
    name: 'Gestor de Cobranza',
    description: 'Genera estrategias de seguimiento de pagos pendientes',
    icon: '📋',
    systemPrompt: `Eres un gestor de cobranza profesional y empático. Tu función es generar RECOMENDACIONES para el seguimiento de pagos pendientes o saldos vencidos.

REGLAS:
- Analiza el historial de pagos y comunicación del contacto
- Genera estrategias graduales: recordatorio amable → negociación → acuerdo formal
- Sugiere fechas de pago realistas basadas en patrones previos
- NO respondas directamente al contacto — genera recomendaciones
- Tono empático pero firme, en español de México
- Siempre ofrecer opciones de pago parcial o分期

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Estrategia de cobranza recomendada",
  "actions": [
    {"type": "schedule_reminder", "description": "...", "payload": {"date": "...", "message": "..."}},
    {"type": "negotiate_plan", "description": "...", "payload": {...}}
  ],
  "confidence": 0.8,
  "reasoning": "Análisis de la situación de pago del contacto"
}`,
    spawnEvents: ['payment_issue', 'overdue_payment', 'payment_reminder_needed'],
    objective: 'Diseñar una estrategia de cobranza efectiva y empática para resolver el saldo pendiente',
    successCriteria: [
      'Estrategia de contacto definida con al menos 2 niveles',
      'Opciones de negociación de pago generadas',
      'Mensaje de recordatorio redactado',
    ],
    availableTools: ['crm_get_contact', 'crm_update_lead', 'whatsapp_send_message', 'followup_create'],
  },

  recovery_agent: {
    type: 'recovery_agent',
    name: 'Agente de Recuperación',
    description: 'Genera estrategias para reenganchar leads que hicieron ghosting',
    icon: '🔄',
    systemPrompt: `Eres un especialista en recuperación de leads. Tu objetivo es generar RECOMENDACIONES para reactivar contactos que han dejado de responder (ghosting).

REGLAS:
- Analiza el último punto de la conversación y por qué pudo haberse cortado
- Identifica el ángulo psicológico más efectivo según el perfil del lead
- Genera mensajes de reenganche que no suenen desesperados
- Usa la regla de oro: agregar NUEVO valor en cada mensaje, nunca presionar
- NO respondas directamente al contacto — genera recomendaciones
- Español de México, tono natural y cálido

ÁNGULOS PSICOLÓGICOS:
- Práctico: nuevo dato de ahorro o eficiencia
- Familiar: nueva funcionalidad para la familia
- Aspiracional: exclusividad o edición limitada
- Estratégico: nuevo dato de ROI o mercado

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Estrategia de reenganche",
  "actions": [
    {"type": "send_recovery_message", "description": "...", "payload": {"message": "...", "delay_hours": 24}},
    {"type": "update_temperature", "description": "...", "payload": {"temperature": "warm"}}
  ],
  "confidence": 0.75,
  "reasoning": "Por qué este ángulo es el más efectivo"
}`,
    spawnEvents: ['ghosting_detected', 'nexus.silence_detected'],
    objective: 'Diseñar estrategia de reactivación personalizada para recuperar al lead con ghosting',
    successCriteria: [
      'Ángulo psicológico identificado',
      'Mensaje de reenganche sin presión generado',
      'Plan de follow-up definido para los próximos 7-30 días',
    ],
    availableTools: ['crm_get_contact', 'crm_update_lead', 'whatsapp_send_message', 'followup_create'],
  },

  emotional_support: {
    type: 'emotional_support',
    name: 'Soporte Emocional',
    description: 'Analiza el estado emocional y genera recomendaciones de manejo',
    icon: '❤️',
    systemPrompt: `Eres un analista emocional del equipo de ventas. Tu objetivo es evaluar el estado emocional del contacto y generar RECOMENDACIONES para que el agente principal ajuste su enfoque.

REGLAS:
- Analiza el tono, lenguaje y patrones del contacto
- Detecta emociones: frustración, confusión, entusiasmo, duda, ansiedad
- Genera recomendaciones de ajuste de tono, ritmo y estrategia
- Si el contacto está frustrado: sugerir pausa, empatía activa, cambio de tema
- Si está entusiasmado: sugerir cierre suave, urgencia controlada
- NO respondas directamente al contacto — genera recomendaciones
- Español de México

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Resumen del estado emocional y ajuste recomendado",
  "actions": [
    {"type": "adjust_tone", "description": "...", "payload": {"new_tone": "empático", "reason": "..."}},
    {"type": "suggested_response", "description": "...", "payload": {"message": "..."}}
  ],
  "confidence": 0.7,
  "reasoning": "Señales emocionales detectadas y su interpretación"
}`,
    spawnEvents: ['nexus.energy_changed', 'emotion.detected', 'low_energy'],
    objective: 'Analizar el estado emocional del contacto y recomendar ajustes al agente principal',
    successCriteria: [
      'Emoción principal detectada con confianza',
      'Ajuste de tono recomendado',
      'Respuesta sugerida generada como ejemplo',
    ],
    availableTools: ['crm_get_contact', 'nexus_get_temperature'],
  },

  calendar_agent: {
    type: 'calendar_agent',
    name: 'Agente de Agenda',
    description: 'Genera propuestas de citas y horarios optimizados',
    icon: '📅',
    systemPrompt: `Eres un asistente de agenda especializado en agendar citas de ventas. Tu objetivo es generar RECOMENDACIONES para la programación óptima de reuniones.

REGLAS:
- Analiza disponibilidad y patrones de respuesta del contacto
- Sugiere franjas horarias óptimas basadas en zona horaria y horario laboral
- Genera propuestas de agenda con tema, duración y objetivos
- Prioriza citas tempranas (las que se agendan rápido tienen más conversión)
- NO respondas directamente al contacto — genera recomendaciones
- Español de México

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Propuesta de agenda con franjas horarias sugeridas",
  "actions": [
    {"type": "create_event", "description": "...", "payload": {"title": "...", "date": "...", "duration": 30}},
    {"type": "send_confirmation", "description": "...", "payload": {"message": "..."}}
  ],
  "confidence": 0.85,
  "reasoning": "Por qué estas franjas son óptimas"
}`,
    spawnEvents: ['scheduling_needed', 'appointment_requested', 'followup_scheduled'],
    objective: 'Generar propuestas de agenda optimizadas para maximizar la conversión de citas',
    successCriteria: [
      'Al menos 2 franjas horarias propuestas',
      'Agenda con tema y objetivos definidos',
      'Mensaje de confirmación generado',
    ],
    availableTools: ['calendar_create_event', 'calendar_list_events', 'crm_get_contact', 'whatsapp_send_message'],
  },

  research_agent: {
    type: 'research_agent',
    name: 'Agente de Investigación',
    description: 'Investiga contexto del contacto y genera insights para la venta',
    icon: '🔍',
    systemPrompt: `Eres un investigador comercial que recopila y analiza información sobre el contacto para generar RECOMENDACIONES estratégicas de venta.

REGLAS:
- Investiga el historial completo del contacto: mensajes, deals, notas, interacciones
- Identifica patrones de comportamiento, preferencias, objeciones recurrentes
- Busca oportunidades cruzadas (cross-sell/upsell) basadas en el perfil
- Analiza la competencia implícita (menciones de otras opciones)
- Genera un briefing ejecutivo para el agente principal
- NO respondas directamente al contacto — genera recomendaciones
- Español de México

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Briefing ejecutivo del contacto",
  "actions": [
    {"type": "update_profile", "description": "...", "payload": {"fields": {...}}},
    {"type": "suggested_approach", "description": "...", "payload": {"strategy": "..."}}
  ],
  "confidence": 0.8,
  "reasoning": "Fuentes de información y patrones detectados"
}`,
    spawnEvents: ['research_needed', 'deep_context_required', 'cross_sell_opportunity'],
    objective: 'Generar un briefing completo del contacto con insights accionables para la venta',
    successCriteria: [
      'Historial del contacto analizado',
      'Patrones de comportamiento identificados',
      'Oportunidades de venta cruzada detectadas',
      'Estrategia de aproximación recomendada',
    ],
    availableTools: ['crm_get_contact', 'analytics_get_summary', 'crm_update_lead'],
  },

  campaign_agent: {
    type: 'campaign_agent',
    name: 'Agente de Campaña',
    description: 'Genera y optimiza campañas de automatización para segmentos',
    icon: '📢',
    systemPrompt: `Eres un especialista en campañas de marketing y ventas automatizadas. Tu objetivo es generar RECOMENDACIONES para crear o mejorar campañas de outreach.

REGLAS:
- Analiza el segmento objetivo y sus características comunes
- Genera secuencias de mensajes multi-canal (WhatsApp, email)
- Define métricas de éxito: tasa de apertura, respuesta, conversión
- Optimiza timing: cuándo enviar, cada cuánto, mejor hora
- Personaliza mensajes según el arquetipo y temperatura del segmento
- NO ejecutes campañas directamente — genera recomendaciones
- Español de México, tono persuasivo sin invasivo

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Estrategia de campaña recomendada",
  "actions": [
    {"type": "create_campaign", "description": "...", "payload": {"name": "...", "sequence": [...]}},
    {"type": "schedule_send", "description": "...", "payload": {"date": "...", "segment": "..."}}
  ],
  "confidence": 0.8,
  "reasoning": "Datos del segmento y mejor enfoque"
}`,
    spawnEvents: ['campaign_automation', 'bulk_outreach_needed', 'segment_campaign'],
    objective: 'Diseñar una campaña de outreach efectiva para el segmento objetivo con mensajes personalizados',
    successCriteria: [
      'Secuencia de al menos 3 mensajes generada',
      'Timing y frecuencia optimizados',
      'Métricas de éxito definidas',
    ],
    availableTools: ['crm_get_contact', 'analytics_get_summary', 'whatsapp_send_message'],
  },

  closing_agent: {
    type: 'closing_agent',
    name: 'Agente de Cierre',
    description: 'Genera estrategias de cierre personalizadas para deals en etapa final',
    icon: '🎯',
    systemPrompt: `Eres un cerrador de ventas estratégico. Tu objetivo es generar RECOMENDACIONES de cierre para deals que están en etapa final.

REGLAS:
- Analiza el progreso del deal: qué se ha cubierto, qué falta
- Identifica la técnica de cierre más efectiva según el perfil
- Evalúa objeciones restantes y cómo abordarlas
- Genera urgencia natural: disponibilidad, promoción, exclusividad
- Calcula la probabilidad de cierre real basada en señales
- NO respondas directamente al contacto — genera recomendaciones
- Español de México

TÉCNICAS DE CIERRE:
- Cierre alternativo: "¿Opción A o B?"
- Cierre de resumen: "Entonces, es esto. ¿Confirmamos?"
- Cierre de urgencia: "Esta oferta vence el..."
- Cierre de asunción: "Te agendo para..."
- Cierre de testimonio: "Como le pasó a Juan..."

FORMATO DE RESPUESTA (JSON):
{
  "recommendation": "Técnica de cierre recomendada con justificación",
  "actions": [
    {"type": "suggest_closing", "description": "...", "payload": {"technique": "...", "message": "..."}},
    {"type": "create_urgency", "description": "...", "payload": {"trigger": "...", "deadline": "..."}}
  ],
  "confidence": 0.85,
  "reasoning": "Señales de cierre detectadas y por qué esta técnica"
}`,
    spawnEvents: ['deal_stage_closing', 'closing_signal', 'high_intent'],
    objective: 'Generar estrategia de cierre efectiva con técnica y mensaje optimizados para el deal',
    successCriteria: [
      'Técnica de cierre seleccionada con justificación',
      'Mensaje de cierre generado',
      'Probabilidad de cierre estimada',
      'Objeciones restantes identificadas con respuesta',
    ],
    availableTools: ['crm_get_contact', 'crm_update_lead', 'crm_create_deal', 'whatsapp_send_message'],
  },
}

// ─── Event-to-Agent Mapping ────────────────────────────────────

const EVENT_TO_AGENT_MAP: Record<string, EphemeralAgentType> = {
  price_objection: 'financial_advisor',
  financing_inquiry: 'financial_advisor',
  budget_discussion: 'financial_advisor',
  ghosting_detected: 'recovery_agent',
  'nexus.silence_detected': 'recovery_agent',
  'nexus.energy_changed': 'emotional_support',
  'emotion.detected': 'emotional_support',
  low_energy: 'emotional_support',
  scheduling_needed: 'calendar_agent',
  appointment_requested: 'calendar_agent',
  followup_scheduled: 'calendar_agent',
  campaign_automation: 'campaign_agent',
  bulk_outreach_needed: 'campaign_agent',
  segment_campaign: 'campaign_agent',
  payment_issue: 'debt_collector',
  overdue_payment: 'debt_collector',
  payment_reminder_needed: 'debt_collector',
  research_needed: 'research_agent',
  deep_context_required: 'research_agent',
  cross_sell_opportunity: 'research_agent',
  deal_stage_closing: 'closing_agent',
  closing_signal: 'closing_agent',
  high_intent: 'closing_agent',
}

// ─── In-Memory Activity Tracker ───────────────────────────────

/**
 * Tracks last activity timestamp per agent ID.
 * Used to detect inactivity for auto-expiry.
 */
const activityTracker = new Map<string, number>()

/**
 * Clean up expired activity entries periodically.
 */
function cleanupActivityTracker(): void {
  const now = Date.now()
  for (const [agentId, lastActivity] of activityTracker) {
    if (now - lastActivity > MAX_LIFETIME_MS) {
      activityTracker.delete(agentId)
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupActivityTracker, 5 * 60 * 1000)

// ─── Core Functions ───────────────────────────────────────────

/**
 * Spawn a new ephemeral agent.
 * Creates a DB record, marks it active, and invokes the AI to generate recommendations.
 */
export async function spawnAgent(input: SpawnAgentInput): Promise<AgentResult> {
  assertEphemeralAgentsEnabled()
  const timer = logTimer('AI', 'spawnAgent')
  const template = AGENT_TEMPLATES[input.agentType]

  if (!template) {
    throw new Error(`Unknown agent type: ${input.agentType}`)
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + MAX_LIFETIME_MS)

  // Create agent record in DB
  const agent = await db.ephemeralAgent.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId || null,
      agentType: input.agentType,
      status: 'spawning',
      objective: template.objective,
      result: '{}',
      spawnReason: input.spawnReason,
      context: JSON.stringify(input.context || {}),
      expiresAt,
    },
  })

  logInfo('AI', 'ephemeral_spawned', {
    agentId: agent.id,
    type: agent.agentType,
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    reason: input.spawnReason,
  })

  // Track activity
  activityTracker.set(agent.id, Date.now())

  try {
    // Build contact context for the agent
    const contactContext = await buildContactContext(input.workspaceId, input.contactId)

    // Update status to active
    await db.ephemeralAgent.update({
      where: { id: agent.id },
      data: { status: 'active' },
    })

    // Invoke AI to generate recommendations
    const result = await invokeAgent(agent.id, template, contactContext, input)

    // Mark as completed
    const completedAt = new Date()
    await db.ephemeralAgent.update({
      where: { id: agent.id },
      data: {
        status: 'completed',
        completedAt,
        result: JSON.stringify(result),
      },
    })

    timer.end('ok', { agentId: agent.id, type: agent.agentType })

    // Emit event
    await eventBus.emit(EVENT_TYPES.AGENT_RESPONDED, {
      agentId: agent.id,
      agentType: `ephemeral_${agent.agentType}`,
      conversationId: input.contactId || '',
      response: result.recommendation,
      latencyMs: timer.elapsed(),
    }, 'ephemeral_agents', { ephemeralAgentId: agent.id })

    // Clean up activity tracker
    activityTracker.delete(agent.id)

    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logError('AI', 'ephemeral_failed', error, { agentId: agent.id, type: agent.agentType })

    await db.ephemeralAgent.update({
      where: { id: agent.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        result: JSON.stringify({ error: errMsg }),
      },
    })

    activityTracker.delete(agent.id)
    throw error
  }
}

/**
 * Get all active ephemeral agents for a workspace.
 */
export async function getActiveAgents(
  workspaceId: string,
  options?: { agentType?: EphemeralAgentType; contactId?: string; limit?: number },
): Promise<Array<{
  id: string
  agentType: EphemeralAgentType
  status: EphemeralAgentStatus
  objective: string
  spawnReason: string | null
  result: AgentResult
  createdAt: Date
  expiresAt: Date
  completedAt: Date | null
}>> {
  if (!EPHEMERAL_AGENTS_ENABLED) return []

  const where: Record<string, unknown> = {
    workspaceId,
    status: { in: ['spawning', 'active', 'completed'] },
  }

  if (options?.agentType) where.agentType = options.agentType
  if (options?.contactId) where.contactId = options.contactId

  const agents = await db.ephemeralAgent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 20,
  })

  return agents.map((agent) => ({
    id: agent.id,
    agentType: agent.agentType as EphemeralAgentType,
    status: agent.status as EphemeralAgentStatus,
    objective: agent.objective,
    spawnReason: agent.spawnReason,
    result: safeParseResult(agent.result),
    createdAt: agent.createdAt,
    expiresAt: agent.expiresAt,
    completedAt: agent.completedAt,
  }))
}

/**
 * Get a specific agent's result.
 */
export async function getAgentResult(agentId: string): Promise<{
  id: string
  agentType: EphemeralAgentType
  status: EphemeralAgentStatus
  objective: string
  spawnReason: string | null
  result: AgentResult
  createdAt: Date
  expiresAt: Date
  completedAt: Date | null
} | null> {
  if (!EPHEMERAL_AGENTS_ENABLED) return null

  const agent = await db.ephemeralAgent.findUnique({
    where: { id: agentId },
  })

  if (!agent) return null

  return {
    id: agent.id,
    agentType: agent.agentType as EphemeralAgentType,
    status: agent.status as EphemeralAgentStatus,
    objective: agent.objective,
    spawnReason: agent.spawnReason,
    result: safeParseResult(agent.result),
    createdAt: agent.createdAt,
    expiresAt: agent.expiresAt,
    completedAt: agent.completedAt,
  }
}

/**
 * Manually expire an ephemeral agent.
 */
export async function expireAgent(agentId: string): Promise<boolean> {
  if (!EPHEMERAL_AGENTS_ENABLED) return false

  const agent = await db.ephemeralAgent.findUnique({
    where: { id: agentId },
  })

  if (!agent) return false
  if (agent.status === 'completed' || agent.status === 'expired') return true

  await db.ephemeralAgent.update({
    where: { id: agentId },
    data: {
      status: 'expired',
      completedAt: new Date(),
    },
  })

  activityTracker.delete(agentId)

  logInfo('AI', 'ephemeral_expired', { agentId, type: agent.agentType })
  return true
}

/**
 * Auto-expire all agents that have exceeded their lifetime or inactivity timeout.
 * Call this periodically (e.g., from a cron job).
 */
export async function expireStaleAgents(): Promise<number> {
  if (!EPHEMERAL_AGENTS_ENABLED) return 0

  const now = new Date()

  // Expire agents past their max lifetime
  const expiredLifetime = await db.ephemeralAgent.updateMany({
    where: {
      status: { in: ['spawning', 'active'] },
      expiresAt: { lt: now },
    },
    data: {
      status: 'expired',
      completedAt: now,
    },
  })

  // Expire agents with no activity (checked via in-memory tracker)
  let expiredInactivity = 0
  const nowMs = Date.now()

  for (const [agentId, lastActivity] of activityTracker) {
    if (nowMs - lastActivity > INACTIVITY_TIMEOUT_MS) {
      try {
        const updated = await db.ephemeralAgent.updateMany({
          where: {
            id: agentId,
            status: { in: ['spawning', 'active'] },
          },
          data: {
            status: 'expired',
            completedAt: now,
          },
        })
        if (updated.count > 0) {
          expiredInactivity++
          activityTracker.delete(agentId)
        }
      } catch {
        activityTracker.delete(agentId)
      }
    }
  }

  const totalExpired = expiredLifetime.count + expiredInactivity
  if (totalExpired > 0) {
    logInfo('AI', 'ephemeral_batch_expired', {
      lifetimeExpired: expiredLifetime.count,
      inactivityExpired: expiredInactivity,
    })
  }

  return totalExpired
}

/**
 * Determine which agent type to spawn based on an event.
 */
export function resolveAgentType(eventType: string): EphemeralAgentType | null {
  return EVENT_TO_AGENT_MAP[eventType] || null
}

/**
 * Spawn an agent based on an event. Convenience function that maps events to agent types.
 */
export async function spawnFromEvent(
  eventType: string,
  workspaceId: string,
  contactId?: string,
  eventContext?: Record<string, unknown>,
): Promise<AgentResult | null> {
  const agentType = resolveAgentType(eventType)
  if (!agentType) {
    logWarn('AI', 'ephemeral_no_match', { eventType })
    return null
  }

  return spawnAgent({
    workspaceId,
    contactId,
    agentType,
    spawnReason: `Evento: ${eventType}`,
    context: eventContext,
  })
}

// ─── Internal Helpers ─────────────────────────────────────────

/**
 * Build contact context string for the AI prompt.
 */
async function buildContactContext(
  workspaceId: string,
  contactId?: string,
): Promise<ContactContext> {
  if (!contactId) return {}

  try {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      include: {
        leadProfile: true,
        deals: {
          where: { status: 'active' },
          take: 1,
          orderBy: { updatedAt: 'desc' },
          include: { stage: { select: { name: true } } },
        },
      },
    })

    if (!contact) return { contactId }

    return {
      contactId: contact.id,
      contactName: `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`,
      contactPhone: contact.phone || undefined,
      temperature: contact.temperature,
      leadScore: contact.leadScore,
      tags: JSON.parse(contact.tags || '[]'),
      notes: contact.notes || undefined,
      dealStage: contact.deals[0]?.stage?.name,
      dealValue: contact.deals[0]?.value,
    }
  } catch {
    return { contactId }
  }
}

/**
 * Invoke the AI with the agent's system prompt and context to generate recommendations.
 */
async function invokeAgent(
  agentId: string,
  template: AgentTemplate,
  contactContext: ContactContext,
  input: SpawnAgentInput,
): Promise<AgentResult> {
  const contextBlock = buildContextMessage(contactContext, input.context)
  const userMessage = buildUserMessage(template, contactContext, input)

  const messages = [
    { role: 'system' as const, content: template.systemPrompt },
    { role: 'user' as const, content: contextBlock + '\n\n---\n\n' + userMessage },
  ]

  const result = await chatWithAI(messages, 'glm', 'GLM-4.5-Flash', {
    temperature: 0.4,
    maxTokens: 2048,
  })

  // Parse the AI response into a structured AgentResult
  return parseAgentResponse(agentId, template.type, result.content)
}

/**
 * Build the context message with contact information.
 */
function buildContextMessage(
  contactContext: ContactContext,
  additionalContext?: Record<string, unknown>,
): string {
  const parts: string[] = ['CONTEXTO DEL CONTACTO:']

  if (contactContext.contactName) parts.push(`- Nombre: ${contactContext.contactName}`)
  if (contactContext.contactPhone) parts.push(`- Teléfono: ${contactContext.contactPhone}`)
  if (contactContext.temperature) parts.push(`- Temperatura: ${contactContext.temperature}`)
  if (contactContext.leadScore !== undefined) parts.push(`- Lead Score: ${contactContext.leadScore}/100`)
  if (contactContext.dealStage) parts.push(`- Etapa del deal: ${contactContext.dealStage}`)
  if (contactContext.dealValue !== undefined) parts.push(`- Valor del deal: $${contactContext.dealValue.toLocaleString()}`)
  if (contactContext.tags && contactContext.tags.length > 0) parts.push(`- Etiquetas: ${contactContext.tags.join(', ')}`)
  if (contactContext.notes) parts.push(`- Notas: ${contactContext.notes.slice(0, 300)}`)

  if (additionalContext && Object.keys(additionalContext).length > 0) {
    parts.push(`\nCONTEXTO ADICIONAL:\n${JSON.stringify(additionalContext, null, 2)}`)
  }

  return parts.join('\n')
}

/**
 * Build the user message that instructs the agent what to do.
 */
function buildUserMessage(
  template: AgentTemplate,
  contactContext: ContactContext,
  input: SpawnAgentInput,
): string {
  return `INSTRUCCIÓN:
Tu tipo de agente es: ${template.name}
Tu objetivo es: ${template.objective}
Razón del despawn: ${input.spawnReason}

Criterios de éxito:
${template.successCriteria.map((c) => `- ${c}`).join('\n')}

Genera tu recomendación en formato JSON exactamente como se especifica en tu system prompt.
Responde SOLAMENTE con el JSON, sin texto adicional antes o después.`
}

/**
 * Parse the AI response into a structured AgentResult.
 */
function parseAgentResponse(
  agentId: string,
  agentType: EphemeralAgentType,
  rawContent: string,
): AgentResult {
  // Try to extract JSON from the response
  let content = rawContent.trim()

  // Remove markdown code fences
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    content = jsonMatch[1].trim()
  }

  // Find JSON object boundaries
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(content) as {
      recommendation?: string
      actions?: Array<{ type: string; description: string; payload?: Record<string, unknown> }>
      confidence?: number
      reasoning?: string
    }

    return {
      agentId,
      agentType,
      status: 'completed',
      recommendation: parsed.recommendation || rawContent.slice(0, 500),
      actions: (parsed.actions || []).map((a) => ({
        type: a.type || 'generic',
        description: a.description || '',
        payload: a.payload,
      })),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || '',
    }
  } catch {
    // Fallback: wrap raw content as recommendation
    return {
      agentId,
      agentType,
      status: 'completed',
      recommendation: rawContent.slice(0, 1000),
      actions: [],
      confidence: 0.3,
      reasoning: 'No se pudo parsear la respuesta como JSON estructurado. Se usa el contenido raw como recomendación.',
    }
  }
}

/**
 * Safely parse a stored JSON result string into an AgentResult.
 */
function safeParseResult(resultJson: string): AgentResult {
  try {
    const parsed = JSON.parse(resultJson)
    if (parsed && parsed.agentId) return parsed as AgentResult
  } catch {
    // ignore
  }

  // Return a fallback result
  return {
    agentId: 'unknown',
    agentType: 'financial_advisor',
    status: 'failed',
    recommendation: resultJson || 'Sin resultado',
    actions: [],
    confidence: 0,
    reasoning: '',
  }
}

/**
 * Get all agent template definitions.
 */
export function getAgentTemplates(): AgentTemplate[] {
  return Object.values(AGENT_TEMPLATES)
}

/**
 * Get a specific agent template by type.
 */
export function getAgentTemplate(type: EphemeralAgentType): AgentTemplate | undefined {
  return AGENT_TEMPLATES[type]
}
