// ═══════════════════════════════════════════════════════════════
// JHON ENGINE — Lead Memory Interpreter
// The core intelligence that analyzes contact events and
// produces actionable lead memories with decision traces
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import type {
  LeadMemory,
  BehaviorPattern,
  ActionType,
  Urgency,
  DecisionFactor,
  PatternEffectiveness,
} from './types'

// ─── Constants ─────────────────────────────────
const TWO_HOURS = 2 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

// ─── Action Definitions ────────────────────────
const ACTION_DEFINITIONS: Record<BehaviorPattern, {
  type: ActionType
  label: string
  reason: string
  jhonSays: string
  expectedOutcome: string
  deadline: number
  ifNotMet: ActionType
  urgency: Urgency
}> = {
  neglected_hot_lead: {
    type: 'CALL_NOW',
    label: 'LLAMAR AHORA',
    reason: 'Lead caliente sin contacto en más de 2h',
    jhonSays: 'Este lead se está enfriando por tu inacción. Llama ya o pierde la venta.',
    expectedOutcome: 'Contacto directo con el lead en 30min',
    deadline: 30,
    ifNotMet: 'SEND_AGGRESSIVE_FOLLOWUP',
    urgency: 'CRITICAL',
  },
  ready_to_close: {
    type: 'SEND_PROPOSAL',
    label: 'ENVIAR PROPUESTA',
    reason: 'Score alto + intención detectada = listo para cerrar',
    jhonSays: 'Todas las señales están verdes. Envía la propuesta y cierra.',
    expectedOutcome: 'Lead revisa propuesta y responde en 4h',
    deadline: 240,
    ifNotMet: 'CALL_NOW',
    urgency: 'HIGH',
  },
  ghost_after_intent: {
    type: 'SEND_FOLLOW_UP',
    label: 'ENVIAR SEGUIMIENTO',
    reason: 'Mostró interés pero desapareció',
    jhonSays: 'Preguntó y desapareció. Un seguimiento oportuno puede reactivarlo.',
    expectedOutcome: 'Respuesta del lead en 2h',
    deadline: 120,
    ifNotMet: 'SEND_AGGRESSIVE_FOLLOWUP',
    urgency: 'HIGH',
  },
  price_sensitive: {
    type: 'SEND_PROPOSAL',
    label: 'ENVIAR PROPUESTA',
    reason: 'Pregunta precio repetidamente — necesita ver valor',
    jhonSays: 'No le des más cifras. Envía propuesta con valor percibido.',
    expectedOutcome: 'Lead reconsidera valor vs precio en 4h',
    deadline: 240,
    ifNotMet: 'CALL_NOW',
    urgency: 'MEDIUM',
  },
  recurring_window_shopper: {
    type: 'SEND_FOLLOW_UP',
    label: 'ENVIAR SEGUIMIENTO',
    reason: 'Pide info recurrentemente sin avanzar — posible miedo al compromiso',
    jhonSays: 'Pide info pero no decide. Necesita empujón directo.',
    expectedOutcome: 'Respuesta del lead en 2h',
    deadline: 120,
    ifNotMet: 'REACTIVATE',
    urgency: 'MEDIUM',
  },
  cold_no_activity: {
    type: 'REACTIVATE',
    label: 'REACTIVAR',
    reason: 'Sin actividad reciente — lead frío',
    jhonSays: 'Inactivo. No gastes energía hasta que haya señal.',
    expectedOutcome: 'Lead responde o confirma desinterés',
    deadline: 180,
    ifNotMet: 'MARK_LOST',
    urgency: 'LOW',
  },
  warm_need_nudge: {
    type: 'SEND_FOLLOW_UP',
    label: 'ENVIAR SEGUIMIENTO',
    reason: 'Lead tibio — un toque puede reactivarlo',
    jhonSays: 'Está tibio. Un mensaje bien timing puede cambiar todo.',
    expectedOutcome: 'Respuesta del lead en 2h',
    deadline: 120,
    ifNotMet: 'SEND_AGGRESSIVE_FOLLOWUP',
    urgency: 'MEDIUM',
  },
  hot_active_buyer: {
    type: 'SCHEDULE_MEETING',
    label: 'AGENDAR REUNIÓN',
    reason: 'Lead activo y caliente — consolidar con reunión',
    jhonSays: 'Está caliente y activo. No lo dejes escapar, agenda reunión.',
    expectedOutcome: 'Reunión confirmada en 24h',
    deadline: 1440,
    ifNotMet: 'CALL_NOW',
    urgency: 'HIGH',
  },
  new_unqualified: {
    type: 'LOG_NOTE',
    label: 'OBSERVAR',
    reason: 'Lead nuevo — datos insuficientes para actuar',
    jhonSays: 'Nuevo. Sin datos suficientes. Observa antes de actuar.',
    expectedOutcome: 'Más datos para cualificar',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
    urgency: 'LOW',
  },
}

// ─── Main Export ────────────────────────────────
export async function interpretLeadMemory(
  contactId: string,
  workspaceId: string
): Promise<LeadMemory> {
  // Fetch ALL events for this contact, ordered desc
  const events = await db.engineEvent.findMany({
    where: { contactId, workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Fetch contact with leadProfile
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: { leadProfile: true },
  })

  if (!contact) {
    throw new Error(`Contact ${contactId} not found`)
  }

  const profile = contact.leadProfile
  const lastInteraction: Date | null = contact.lastMessageAt ?? profile?.lastActiveAt ?? null

  // Detect behavior pattern
  const pattern = detectPattern(events, contact, profile, lastInteraction)

  // Check for strategy switching (decay escalation)
  const switchAction = checkStrategySwitch(events, contact)

  // Build decision trace
  const decisionTrace = buildDecisionTrace(events, contact, profile, pattern, lastInteraction)

  // Calculate intent level
  const intentLevel = calculateIntentLevel(events, contact, pattern)

  // Calculate score trend
  const scoreTrend = calculateScoreTrend(events)

  // Calculate confidence
  const { score: confidenceScore, reason: confidenceReason } = calculateConfidence(events, contact, pattern)

  // Calculate time to decay
  const timeToDecay = calculateTimeToDecay(contact)

  // Determine risk level
  const riskLevel = determineRiskLevel(contact, pattern, timeToDecay, events)

  // Build pattern effectiveness
  const patternEffectiveness = buildPatternEffectiveness(events, pattern)

  // Generate Spanish narrative
  const narrative = generateNarrative(pattern, contact, timeToDecay, switchAction)

  // Determine next best action
  const nextBestAction = resolveNextBestAction(pattern, switchAction, timeToDecay, confidenceScore)

  return {
    contactId,
    pattern,
    intentLevel,
    scoreTrend,
    confidenceScore,
    confidenceReason,
    riskLevel,
    timeToDecay,
    decisionTrace,
    patternEffectiveness,
    narrative,
    nextBestAction,
  }
}

// ─── Pattern Detection ─────────────────────────
function detectPattern(
  events: any[],
  contact: any,
  profile: any,
  lastInteraction: Date | null
): BehaviorPattern {
  const now = Date.now()

  const hasPriceEvent = events.some(
    (e: any) => e.type === 'INTENT_DETECTED' && e.subType === 'asked_price'
  )
  const hasFollowUp = events.some(
    (e: any) => e.type === 'ACTION_EXECUTED' && e.subType === 'SEND_FOLLOW_UP'
  )
  const noOutcome = !events.some((e: any) => e.type === 'ACTION_OUTCOME')

  const isHot =
    contact.temperature === 'hot' || (contact.leadScore || 0) >= 70
  const isWarm =
    contact.temperature === 'warm' ||
    ((contact.leadScore || 0) >= 40 && (contact.leadScore || 0) < 70)

  // hot + no activity for 2h = neglected
  if (
    isHot &&
    lastInteraction &&
    now - lastInteraction.getTime() > TWO_HOURS
  ) {
    return 'neglected_hot_lead'
  }

  // score >= 80 + intent detected = ready to close
  if (
    (contact.leadScore || 0) >= 80 &&
    events.some((e: any) => e.type === 'INTENT_DETECTED')
  ) {
    return 'ready_to_close'
  }

  // had intent but now ghosted
  if (
    events.some((e: any) => e.type === 'INTENT_DETECTED') &&
    lastInteraction &&
    now - lastInteraction.getTime() > TWENTY_FOUR_HOURS
  ) {
    return 'ghost_after_intent'
  }

  // asked price multiple times
  if (events.filter((e: any) => e.subType === 'asked_price').length >= 2) {
    return 'price_sensitive'
  }

  // window shopper pattern
  if (
    events.filter((e: any) => e.subType === 'requested_info').length >= 3 &&
    noOutcome
  ) {
    return 'recurring_window_shopper'
  }

  // cold — no recent activity
  if (
    !isHot &&
    !isWarm &&
    (!lastInteraction || now - lastInteraction.getTime() > 3 * TWENTY_FOUR_HOURS)
  ) {
    return 'cold_no_activity'
  }

  // warm needs nudge (6h without activity)
  if (
    isWarm &&
    lastInteraction &&
    now - lastInteraction.getTime() > 6 * 60 * 60 * 1000
  ) {
    return 'warm_need_nudge'
  }

  // hot active buyer
  if (
    isHot &&
    lastInteraction &&
    now - lastInteraction.getTime() < TWO_HOURS
  ) {
    return 'hot_active_buyer'
  }

  // new / unqualified
  if (events.length <= 2) {
    return 'new_unqualified'
  }

  return 'warm_need_nudge'
}

// ─── Strategy Switching by Decay ───────────────
function checkStrategySwitch(
  events: any[],
  contact: any
): ActionType | null {
  const now = Date.now()

  const recentScores = events
    .filter((e: any) => e.type === 'SCORE_UPDATED' && e.score !== null)
    .sort(
      (a: any, b: any) =>
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, 5)

  // Score dropped > 15 with no outcome → aggressive
  if (recentScores.length >= 2) {
    const scoreDrop =
      (recentScores[0]?.score || 0) -
      (recentScores[recentScores.length - 1]?.score || 0)
    if (scoreDrop > 15) {
      const hasOutcome = events.some(
        (e: any) => e.type === 'ACTION_OUTCOME'
      )
      if (!hasOutcome) return 'SEND_AGGRESSIVE_FOLLOWUP'
    }
  }

  // Hot lead with no activity for 2h → call now
  if (contact.temperature === 'hot' && contact.lastMessageAt) {
    if (now - contact.lastMessageAt.getTime() > TWO_HOURS) {
      return 'CALL_NOW'
    }
  }

  return null
}

// ─── Decision Trace ────────────────────────────
function buildDecisionTrace(
  events: any[],
  contact: any,
  profile: any,
  pattern: BehaviorPattern,
  lastInteraction: Date | null
): DecisionFactor[] {
  const trace: DecisionFactor[] = []
  const now = Date.now()

  // Score factor
  const score = contact.leadScore || 0
  trace.push({
    factor: 'Lead Score',
    weight: score >= 70 ? 3 : score >= 40 ? 1 : -1,
    description:
      score >= 70
        ? `Score alto (${score}) — señal de compra fuerte`
        : score >= 40
        ? `Score moderado (${score}) — necesita cualificación`
        : `Score bajo (${score}) — poco engagement`,
  })

  // Temperature factor
  const temp = contact.temperature || 'cold'
  trace.push({
    factor: 'Temperatura',
    weight: temp === 'hot' ? 3 : temp === 'warm' ? 1 : -2,
    description:
      temp === 'hot'
        ? 'Lead caliente — actividad reciente'
        : temp === 'warm'
        ? 'Lead tibio — algo de interés'
        : 'Lead frío — sin señal de interés',
  })

  // Time since last interaction
  if (lastInteraction) {
    const hoursSince = (now - lastInteraction.getTime()) / (1000 * 60 * 60)
    trace.push({
      factor: 'Tiempo sin interacción',
      weight:
        hoursSince < 2 ? 2 : hoursSince < 6 ? 0 : hoursSince < 24 ? -1 : -3,
      description:
        hoursSince < 2
          ? `${Math.round(hoursSince * 60)}min — ventana activa`
          : hoursSince < 6
          ? `${Math.round(hoursSince)}h — empieza a enfriarse`
          : hoursSince < 24
          ? `${Math.round(hoursSince)}h — probablemente olvidando`
          : `${Math.round(hoursSince)}h — ghost confirmado`,
    })
  } else {
    trace.push({
      factor: 'Tiempo sin interacción',
      weight: -3,
      description: 'Sin interacción registrada',
    })
  }

  // Intent detection events
  const intentEvents = events.filter(
    (e: any) => e.type === 'INTENT_DETECTED'
  )
  if (intentEvents.length > 0) {
    trace.push({
      factor: 'Intención detectada',
      weight: 2,
      description: `${intentEvents.length} señal(es) de intención de compra`,
    })
  }

  // Positive outcomes
  const positiveOutcomes = events.filter(
    (e: any) =>
      e.type === 'ACTION_OUTCOME' &&
      ['REPLIED', 'INTEREST_CONFIRMED', 'MEETING_BOOKED', 'CLOSED_WON'].includes(
        e.subType || ''
      )
  )
  if (positiveOutcomes.length > 0) {
    trace.push({
      factor: 'Respuestas positivas',
      weight: 3,
      description: `${positiveOutcomes.length} resultado(s) favorable(s)`,
    })
  }

  // Negative outcomes
  const negativeOutcomes = events.filter(
    (e: any) =>
      e.type === 'ACTION_OUTCOME' &&
      ['NO_RESPONSE_2H', 'NO_RESPONSE_24H', 'GHOSTED', 'CLOSED_LOST'].includes(
        e.subType || ''
      )
  )
  if (negativeOutcomes.length > 0) {
    trace.push({
      factor: 'Sin respuesta',
      weight: -2,
      description: `${negativeOutcomes.length} sin respuesta o ghost`,
    })
  }

  // Auto actions triggered (bad signal)
  const autoActions = events.filter(
    (e: any) => e.type === 'AUTO_ACTION_TRIGGERED'
  )
  if (autoActions.length > 0) {
    trace.push({
      factor: 'Auto-acciones disparadas',
      weight: -2,
      description: `${autoActions.length} acción(es) automática(s) por inacción`,
    })
  }

  // Profile data if available
  if (profile) {
    if (profile.reactivateCount > 0) {
      trace.push({
        factor: 'Reactivaciones previas',
        weight: profile.reactivateCount > 2 ? -1 : 0,
        description: `Reactivado ${profile.reactivateCount} vez(es) antes`,
      })
    }
    if (profile.communicationStyle === 'cautious') {
      trace.push({
        factor: 'Estilo cauteloso',
        weight: -1,
        description: 'Comunicación cautelosa — necesita confianza',
      })
    }
  }

  return trace
}

// ─── Intent Level ──────────────────────────────
function calculateIntentLevel(
  events: any[],
  contact: any,
  pattern: BehaviorPattern
): number {
  const score = contact.leadScore || 0

  // Base from score
  let intent = Math.min(score, 100)

  // Bonus for pattern
  const patternBonus: Partial<Record<BehaviorPattern, number>> = {
    ready_to_close: 20,
    hot_active_buyer: 15,
    neglected_hot_lead: 10,
    ghost_after_intent: -10,
    cold_no_activity: -30,
    new_unqualified: -20,
  }

  intent += patternBonus[pattern] || 0

  // Check for intent events
  const hasIntent = events.some((e: any) => e.type === 'INTENT_DETECTED')
  if (hasIntent) intent += 10

  // Check for positive outcomes
  const hasPositive = events.some(
    (e: any) =>
      e.type === 'ACTION_OUTCOME' &&
      ['REPLIED', 'INTEREST_CONFIRMED', 'MEETING_BOOKED'].includes(e.subType || '')
  )
  if (hasPositive) intent += 5

  return Math.max(0, Math.min(100, intent))
}

// ─── Score Trend ───────────────────────────────
function calculateScoreTrend(
  events: any[]
): "rising" | "falling" | "stable" {
  const scoreEvents = events
    .filter((e: any) => e.type === 'SCORE_UPDATED' && e.score !== null)
    .sort(
      (a: any, b: any) =>
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, 3)

  if (scoreEvents.length < 2) return 'stable'

  const latest = scoreEvents[0].score || 0
  const earliest = scoreEvents[scoreEvents.length - 1].score || 0
  const diff = latest - earliest

  if (diff > 5) return 'rising'
  if (diff < -5) return 'falling'
  return 'stable'
}

// ─── Confidence Calculation ────────────────────
function calculateConfidence(
  events: any[],
  contact: any,
  pattern: BehaviorPattern
): { score: number; reason: string } {
  const eventCount = events.length
  const now = Date.now()
  const hasRecentEvent = events.some(
    (e: any) => now - e.createdAt.getTime() < TWO_HOURS
  )

  // ── Data volume ──
  // EngineEvents alone are too sparse — most active leads have 0, which made
  // EVERY lead show 0% confidence (multiplicative formula collapses to 0).
  // We also count the conversation's message volume so an engaged lead reflects
  // real confidence even without logged engine events.
  const messageCount = contact?.leadProfile?.totalMessages ?? 0
  const dataPoints = eventCount + messageCount
  const base = Math.min(dataPoints / 8, 1) // ~8 interacciones → datos suficientes

  // ── Freshness ── recent engine event OR recent inbound message (24h)
  const lastActivity = contact?.lastMessageAt ?? contact?.leadProfile?.lastActiveAt ?? null
  const recentActivity = hasRecentEvent ||
    (lastActivity ? now - new Date(lastActivity).getTime() < 24 * 60 * 60 * 1000 : false)
  const freshness = recentActivity ? 1 : 0.6

  // Pattern effectiveness (from outcome data) — neutral 0.6 when no outcomes yet
  const outcomes = events.filter((e: any) => e.type === 'ACTION_OUTCOME')
  const successes = outcomes.filter(
    (e: any) =>
      ['REPLIED', 'INTEREST_CONFIRMED', 'MEETING_BOOKED', 'CLOSED_WON'].includes(
        e.subType || ''
      )
  )
  const effectiveness =
    outcomes.length > 0 ? successes.length / outcomes.length : 0.6

  const score = Math.round(base * effectiveness * freshness * 100) / 100

  let reason = ''
  if (dataPoints < 3) {
    reason = 'Datos insuficientes (poca interacción aún)'
  } else if (!recentActivity) {
    reason = 'Sin actividad reciente (> 24h)'
  } else if (effectiveness < 0.3) {
    reason = 'Historial bajo de respuestas positivas'
  } else {
    reason = 'Datos recientes con buena interacción'
  }

  return { score, reason }
}

// ─── Time to Decay ─────────────────────────────
function calculateTimeToDecay(contact: any): number {
  if (!contact.lastMessageAt) return 0

  const now = Date.now()
  const hoursSinceLastMessage =
    (now - contact.lastMessageAt.getTime()) / (1000 * 60 * 60)

  switch (contact.temperature) {
    case 'hot':
      return Math.max(0, Math.round((2 - hoursSinceLastMessage) * 60))
    case 'warm':
      return Math.max(0, Math.round((6 - hoursSinceLastMessage) * 60))
    default:
      return Math.max(0, Math.round((24 - hoursSinceLastMessage) * 60))
  }
}

// ─── Risk Level ────────────────────────────────
function determineRiskLevel(
  contact: any,
  pattern: BehaviorPattern,
  timeToDecay: number,
  events: any[]
): "critical" | "high" | "medium" | "low" {
  const score = contact.leadScore || 0

  // Critical: hot lead about to decay
  if (
    (pattern === 'neglected_hot_lead' || pattern === 'hot_active_buyer') &&
    timeToDecay < 30
  ) {
    return 'critical'
  }

  // Critical: score dropping fast
  if (score >= 50 && events.some((e: any) => e.type === 'AUTO_ACTION_TRIGGERED')) {
    return 'critical'
  }

  // High: ready to close or ghost after intent
  if (
    pattern === 'ready_to_close' ||
    (pattern === 'ghost_after_intent' && timeToDecay < 120)
  ) {
    return 'high'
  }

  // High: time to decay is short
  if (timeToDecay < 60 && contact.temperature !== 'cold') {
    return 'high'
  }

  // Medium
  if (score >= 30 || contact.temperature === 'warm') {
    return 'medium'
  }

  return 'low'
}

// ─── Pattern Effectiveness ─────────────────────
function buildPatternEffectiveness(
  events: any[],
  pattern: BehaviorPattern
): PatternEffectiveness | null {
  const patternEvents = events.filter(
    (e: any) => e.type === 'PATTERN_IDENTIFIED' && e.subType === pattern
  )

  if (patternEvents.length === 0) return null

  // Look for action outcomes after pattern identification
  const outcomes = events.filter((e: any) => e.type === 'ACTION_OUTCOME')
  const successes = outcomes.filter(
    (e: any) =>
      ['REPLIED', 'INTEREST_CONFIRMED', 'MEETING_BOOKED', 'CLOSED_WON'].includes(
        e.subType || ''
      )
  )

  const successRate =
    outcomes.length > 0 ? successes.length / outcomes.length : 0

  const lastOutcome = outcomes.length > 0
    ? outcomes[0].subType as any
    : undefined

  return {
    pattern,
    successRate,
    avgTimeToClose: successRate > 0 ? 48 : 0,
    totalOccurrences: patternEvents.length,
    lastOutcome,
  }
}

// ─── Narrative Generation (Spanish) ────────────
function generateNarrative(
  pattern: BehaviorPattern,
  contact: any,
  timeToDecay: number,
  switchAction: ActionType | null
): string {
  const name = contact.firstName || 'Este lead'
  const isUrgent = timeToDecay < 60

  const narratives: Record<BehaviorPattern, string[]> = {
    neglected_hot_lead: [
      `${name} estaba caliente y no lo contactaste. Ya lleva sin respuesta activa. Haz algo ahora o pierde la venta.`,
      `Lead caliente abandonado. ${name} mostró interés pero se enfrió por inacción. Reacción inmediata requerida.`,
    ],
    ready_to_close: [
      `${name} tiene toda la señal de compra. Falta empuje final. No lo dejes pensar mucho.`,
    ],
    ghost_after_intent: [
      `${name} preguntó y desapareció. ${isUrgent ? 'Ventana cerrándose.' : 'Aún hay tiempo pero actúa.'}`,
    ],
    price_sensitive: [
      `${name} pregunta precio repetidamente. Necesita sentir valor, no cifras.`,
    ],
    recurring_window_shopper: [
      `${name} pide info pero no avanza. Tiene miedo de compromiso o no es quien decide.`,
    ],
    cold_no_activity: [
      `${name} está inactivo. No gastar energía hasta que haya señal.`,
    ],
    warm_need_nudge: [
      `${name} está tibio. Un toque oportuno puede reactivarlo.`,
    ],
    hot_active_buyer: [
      `${name} está activo y caliente. Mantén la presión, no lo dejes escapar.`,
    ],
    new_unqualified: [
      `${name} es nuevo. Sin datos suficientes para actuar agresivamente. Observa.`,
    ],
  }

  if (switchAction) {
    return `Se está enfriando rápido. Cambia estrategia ahora. ${name} necesita acción agresiva.`
  }

  const options = narratives[pattern] || narratives.new_unqualified
  return options[Math.floor(Math.random() * options.length)]
}

// ─── Resolve Next Best Action ──────────────────
function resolveNextBestAction(
  pattern: BehaviorPattern,
  switchAction: ActionType | null,
  timeToDecay: number,
  confidenceScore: number
): LeadMemory['nextBestAction'] {
  // If strategy switch triggered, override the action
  if (switchAction) {
    const switchLabels: Record<string, string> = {
      SEND_AGGRESSIVE_FOLLOWUP: 'SEGUIMIENTO AGRESIVO',
      CALL_NOW: 'LLAMAR AHORA',
    }
    return {
      type: switchAction,
      label: switchLabels[switchAction] || switchAction,
      reason: 'Estrategia cambiada por decay acelerado',
      urgency: 'CRITICAL',
      jhonSays: 'El patrón normal no funciona. Cambia la estrategia AHORA.',
      expectedOutcome: 'Respuesta inmediata o ghost confirmado',
      deadline: 60,
      ifNotMet: 'REACTIVATE',
    }
  }

  // Use pattern-based action definition
  const def = ACTION_DEFINITIONS[pattern]

  // Adjust urgency based on time to decay
  let urgency = def.urgency
  if (timeToDecay < 30 && urgency !== 'CRITICAL') {
    urgency = 'CRITICAL'
  } else if (timeToDecay < 60 && urgency === 'LOW') {
    urgency = 'MEDIUM'
  }

  return {
    type: def.type,
    label: def.label,
    reason: def.reason,
    urgency,
    jhonSays: def.jhonSays,
    expectedOutcome: def.expectedOutcome,
    deadline: def.deadline,
    ifNotMet: def.ifNotMet,
  }
}
