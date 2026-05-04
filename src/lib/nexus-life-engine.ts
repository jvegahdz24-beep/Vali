// ═══════════════════════════════════════════════════════════════
// NEXUS Life Engine — Emotional Presence Engine
// Makes NEXUS feel "alive" with proactive emotional intelligence
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI, type AIMessage } from '@/lib/ai/providers'
import { eventBus, EVENT_TYPES } from '@/lib/event-bus'
import { logInfo, logWarn, logError, logOk, logTimer } from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────

export interface LifeEngineCycleResult {
  processedAt: string
  usersProcessed: number
  microFollowUps: number
  deepMessages: number
  silencesDetected: number
  energyUpdates: number
  patternsDetected: number
  errors: string[]
}

export interface EnergyBreakdown {
  frequencyDelta: number     // -20 to +20: message frequency change
  responseTimeDelta: number  // -20 to +20: response time change (slower = negative)
  lengthDelta: number        // -20 to +20: message length change (shorter = negative)
  sentimentScore: number     // -20 to +20: stress/tired/busy indicators
  timePatternScore: number   // -20 to +20: unusual time-of-day patterns
}

export interface ContactContext {
  id: string
  name: string
  relation: string
  lastInteraction?: Date
  daysSinceInteraction: number
  communicationStyle?: string
  lastTopic?: string
  notes?: string
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MICRO_FOLLOW_UP_COOLDOWN_HOURS = 4   // minimum hours between micro follow-ups
const DEEP_MESSAGE_COOLDOWN_HOURS = 20     // minimum hours between deep messages
const ENERGY_SIGNIFICANT_DELTA = 15        // score change threshold for emitting events
const SILENCE_MULTIPLIER_THRESHOLD = 2     // flag when silence = 2x normal interval
const MAX_FOLLOW_UPS_PER_CYCLE = 2         // cap per user per cycle to avoid spam
const MAX_PENDING_FOLLOW_UPS = 10          // don't queue more than this per user

// Sentiment keywords (Spanish)
const STRESS_KEYWORDS = [
  'estresado', 'estresada', 'estrés', 'ansioso', 'ansiosa', 'ansiedad',
  'agotado', 'agotada', 'cansado', 'cansada', 'agobiado', 'agobiada',
  'preocupado', 'preocupada', 'preocupación', 'nervioso', 'nerviosa',
  'dormir', 'insomnio', 'migraña', 'dolor', 'quemado', 'burnout',
  'presión', 'presionado', 'apretado', 'atrapado',
]
const LOW_ENERGY_KEYWORDS = [
  'tired', 'cansado', 'cansada', 'no puedo más', 'no aguanto',
  'difícil', 'dificil', 'complicado', 'duro', 'pesado',
  'no tengo tiempo', 'ocupado', 'ocupada', 'sin tiempo',
  'demasiado', 'trabajo', 'tarea', 'pendiente', 'atrasado',
]
const POSITIVE_KEYWORDS = [
  'genial', 'increíble', 'excelente', 'perfecto', 'bien',
  'contento', 'contenta', 'feliz', 'animado', 'animada',
  'energía', 'productivo', 'productiva', 'logré', 'logre',
  'terminé', 'termine', 'avancé', 'avance', 'progreso',
]

// ─────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'mañana'
  if (hour >= 12 && hour < 18) return 'tarde'
  if (hour >= 18 && hour < 22) return 'noche'
  return 'madrugada'
}

function getTimeGreeting(): string {
  const tod = getTimeOfDay()
  switch (tod) {
    case 'mañana': return 'buenos días'
    case 'tarde': return 'buenas tardes'
    case 'noche': return 'buenas noches'
    case 'madrugada': return 'a estas horas'
    default: return 'hola'
  }
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60)
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T } catch { return fallback }
}

// ─────────────────────────────────────────────────────────────
// 1. MICRO FOLLOW-UP GENERATOR (Hourly)
// ─────────────────────────────────────────────────────────────

async function generateMicroFollowUp(
  userId: string,
  contact?: ContactContext,
  profile?: { temperature: number; vacationMode: boolean } | null,
  lastTopic?: string,
): Promise<string | null> {
  if (profile?.vacationMode) return null

  const tod = getTimeOfDay()
  const temp = profile?.temperature ?? 50
  const daysSince = contact?.daysSinceInteraction ?? 99

  // Don't generate if user's temperature is very low (might be overwhelmed)
  if (temp < 20) return null

  const contactInfo = contact
    ? `Contacto: ${contact.name} (${contact.relation}). Última interacción: hace ${daysSince} días. Estilo de comunicación: ${contact.communicationStyle ?? 'no determinado'}. Último tema: ${contact.lastTopic ?? 'no determinado'}. Notas: ${contact.notes ?? 'sin notas'}.`
    : 'No hay contactos específicos — es un seguimiento general al usuario.'

  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Eres NEXUS, un asistente virtual empático y cercano. Genera UN MENSAJE CORTO de seguimiento (máximo 2 frases) para el usuario.
REGLAS:
- Debe sentirse natural y espontáneo, NO robótico ni genérico
- Toma en cuenta la hora del día (${tod}, ${getTimeGreeting()})
- Si la temperatura emocional es baja (${temp}/100), sé más suave y comprensivo
- Si la temperatura es alta (${temp}/100), sé más enérgico y propositivo
- NO uses saludos formales, habla como un amigo cercano
- NO repitas los mismos mensajes. Varía el tono y enfoque
- Referencia el contexto si hay algo relevante
- Responde SOLO con el mensaje, sin comillas ni explicaciones`,
        },
        {
          role: 'user',
          content: `Contexto: ${contactInfo}\nHora del día: ${tod}\nTemperatura emocional: ${temp}/100\nÚltimo tema: ${lastTopic ?? 'general'}`,
        },
      ],
      'glm',
      undefined,
      { temperature: 0.9, maxTokens: 150, frequencyPenalty: 0.7, presencePenalty: 0.8 },
    )

    const message = result.content.trim()
    if (!message || message.length < 10 || message.length > 300) return null

    return message
  } catch (err) {
    logWarn('LIFE_ENGINE', 'micro_followup_gen_error', { userId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 2. DEEP MESSAGE GENERATOR (24h)
// ─────────────────────────────────────────────────────────────

async function generateDeepMessage(
  userId: string,
  recentConversations: { title: string; messages: { role: string; content: string; createdAt: Date }[] }[],
  memories: { key: string; value: string; category: string }[],
  profile?: { temperature: number; occupation?: string; interests: string; goals: string; coachMode: boolean; vacationMode: boolean } | null,
): Promise<string | null> {
  if (profile?.vacationMode) return null

  const temp = profile?.temperature ?? 50
  const interests = safeJsonParse<string[]>(profile?.interests ?? '[]', [])
  const goals = safeJsonParse<string[]>(profile?.goals ?? '[]', [])
  const occupation = profile?.occupation ?? 'no especificada'

  const convSummary = recentConversations.slice(0, 3).map(c => {
    const lastMsgs = c.messages.slice(-4).map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('\n')
    return `Conversación: "${c.title}"\n${lastMsgs}`
  }).join('\n---\n')

  const memorySummary = memories.slice(0, 8).map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n')

  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Eres NEXUS, un asistente virtual empático e inteligente. Genera un MENSAJE PROFUNDO Y PENSADO (3-5 oraciones) que demuestre inteligencia emocional genuina.

CONTEXTO DEL USUARIO:
- Ocupación: ${occupation}
- Temperatura emocional actual: ${temp}/100
- Intereses: ${interests.join(', ') || 'no especificados'}
- Metas: ${goals.join(', ') || 'no especificadas'}
- Coach mode: ${profile?.coachMode ? 'activado' : 'desactivado'}

REGLAS:
- Referencia algo específico de las conversaciones recientes
- Muestra consciencia de la situación actual del usuario
- Proporciona valor: un insight, ánimo, o contenido relevante
- Debe sentirse PERSONAL, no genérico ni generado masivamente
- Si la temperatura es baja (${temp}/100), sé compasivo y contenedor
- Si es alta (${temp}/100), celébra y desafía suavemente
- Escribe en español, con tono cercano pero respetuoso
- NO uses emojis excesivos
- Responde SOLO con el mensaje`,
        },
        {
          role: 'user',
          content: `Memorias del usuario:\n${memorySummary || 'Sin memorias aún'}\n\nConversaciones recientes:\n${convSummary || 'Sin conversaciones recientes'}`,
        },
      ],
      'glm',
      undefined,
      { temperature: 0.8, maxTokens: 400, frequencyPenalty: 0.6, presencePenalty: 0.7 },
    )

    const message = result.content.trim()
    if (!message || message.length < 30 || message.length > 800) return null

    return message
  } catch (err) {
    logWarn('LIFE_ENGINE', 'deep_message_gen_error', { userId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 3. ENERGY ANALYSIS ENGINE
// ─────────────────────────────────────────────────────────────

function computeEnergyScore(
  recentMessages: { role: string; content: string; createdAt: Date }[],
  olderMessages: { role: string; content: string; createdAt: Date }[],
): { score: number; breakdown: EnergyBreakdown; label: string } {
  const breakdown: EnergyBreakdown = {
    frequencyDelta: 0,
    responseTimeDelta: 0,
    lengthDelta: 0,
    sentimentScore: 0,
    timePatternScore: 0,
  }

  // --- Frequency analysis ---
  const recentCount = recentMessages.filter(m => m.role === 'user').length
  const olderCount = olderMessages.filter(m => m.role === 'user').length
  const recentHours = recentMessages.length > 1
    ? Math.max(1, hoursBetween(recentMessages[0].createdAt, recentMessages[recentMessages.length - 1].createdAt))
    : 24
  const olderHours = olderMessages.length > 1
    ? Math.max(1, hoursBetween(olderMessages[0].createdAt, olderMessages[olderMessages.length - 1].createdAt))
    : 168
  const recentRate = recentCount / recentHours
  const olderRate = olderCount / olderHours
  const freqDelta = olderRate > 0 ? ((recentRate - olderRate) / olderRate) * 100 : 0
  breakdown.frequencyDelta = Math.max(-20, Math.min(20, freqDelta * 0.2))

  // --- Response time analysis ---
  const responseTimes: number[] = []
  for (let i = 1; i < recentMessages.length; i++) {
    if (recentMessages[i].role === 'user' && recentMessages[i - 1].role === 'assistant') {
      const diff = hoursBetween(recentMessages[i].createdAt, recentMessages[i - 1].createdAt)
      if (diff < 24 && diff > 0) responseTimes.push(diff)
    }
  }
  if (responseTimes.length > 0) {
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    // Slower response = possibly stressed (-), faster = engaged (+)
    if (avgResponseTime > 4) breakdown.responseTimeDelta = -15
    else if (avgResponseTime > 2) breakdown.responseTimeDelta = -8
    else if (avgResponseTime < 0.5) breakdown.responseTimeDelta = 10
    else breakdown.responseTimeDelta = 0
  }

  // --- Message length analysis ---
  const recentLengths = recentMessages.filter(m => m.role === 'user').map(m => m.content.length)
  const olderLengths = olderMessages.filter(m => m.role === 'user').map(m => m.content.length)
  if (recentLengths.length > 0 && olderLengths.length > 0) {
    const recentAvgLen = recentLengths.reduce((a, b) => a + b, 0) / recentLengths.length
    const olderAvgLen = olderLengths.reduce((a, b) => a + b, 0) / olderLengths.length
    if (olderAvgLen > 0) {
      const lenDelta = ((recentAvgLen - olderAvgLen) / olderAvgLen) * 100
      breakdown.lengthDelta = Math.max(-20, Math.min(20, lenDelta * 0.3))
    }
  }

  // --- Sentiment keyword analysis ---
  const allRecentText = recentMessages.map(m => m.content.toLowerCase()).join(' ')
  const stressHits = STRESS_KEYWORDS.filter(k => allRecentText.includes(k)).length
  const lowHits = LOW_ENERGY_KEYWORDS.filter(k => allRecentText.includes(k)).length
  const positiveHits = POSITIVE_KEYWORDS.filter(k => allRecentText.includes(k)).length
  breakdown.sentimentScore = Math.max(-20, Math.min(20, (stressHits + lowHits) * -5 + positiveHits * 3))

  // --- Time-of-day pattern analysis ---
  const lateNightMessages = recentMessages.filter(m => {
    const hour = m.createdAt.getHours()
    return (hour >= 0 && hour < 5) || hour >= 23
  }).length
  const earlyMorningMessages = recentMessages.filter(m => {
    const hour = m.createdAt.getHours()
    return hour >= 5 && hour < 7
  }).length
  if (lateNightMessages > 3) breakdown.timePatternScore = -12
  else if (lateNightMessages > 1) breakdown.timePatternScore = -6
  else if (earlyMorningMessages > 2) breakdown.timePatternScore = 8
  else breakdown.timePatternScore = 0

  // --- Composite score (base 50, add breakdown) ---
  const rawScore = 50 + breakdown.frequencyDelta + breakdown.responseTimeDelta +
    breakdown.lengthDelta + breakdown.sentimentScore + breakdown.timePatternScore
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  // Label
  let label: string
  if (score >= 80) label = 'Alta energía'
  else if (score >= 60) label = 'Energía positiva'
  else if (score >= 40) label = 'Estable'
  else if (score >= 25) label = 'Posible estrés'
  else label = 'Baja energía'

  return { score, breakdown, label }
}

// ─────────────────────────────────────────────────────────────
// 4. SILENCE DETECTION ENGINE
// ─────────────────────────────────────────────────────────────

async function detectSilences(userId: string): Promise<{
  contactId?: string
  contactName?: string
  hoursSilent: number
  expectedInterval: number
  urgencyLevel: string
}[]> {
  const contacts = await db.nexusContact.findMany({
    where: { userId },
  })

  const alerts: {
    contactId?: string
    contactName?: string
    hoursSilent: number
    expectedInterval: number
    urgencyLevel: string
  }[] = []

  for (const contact of contacts) {
    // Get follow-ups for this contact to determine response patterns
    const followUps = await db.nexusFollowUp.findMany({
      where: { userId, contactId: contact.id, status: 'sent' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    if (followUps.length < 2) continue // not enough data

    // Calculate expected response interval from time between sent follow-ups
    const intervals: number[] = []
    for (let i = 1; i < followUps.length; i++) {
      const diff = hoursBetween(followUps[i - 1].createdAt, followUps[i].createdAt)
      if (diff > 0) intervals.push(diff)
    }
    if (intervals.length === 0) continue

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const expectedInterval = Math.max(4, Math.round(avgInterval))

    // Hours since last interaction with this contact
    const lastFollowUp = followUps[0]
    const hoursSinceLast = hoursBetween(lastFollowUp.createdAt, new Date())

    // Also check the user's overall last message
    const userMessages = await db.nexusMessage.findMany({
      where: {
        conversation: { userId },
        role: 'user',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    const hoursSinceUserMessage = userMessages.length > 0
      ? hoursBetween(userMessages[0].createdAt, new Date())
      : 9999

    const relevantSilence = Math.min(hoursSinceLast, hoursSinceUserMessage)

    // Check if silence exceeds threshold
    if (relevantSilence >= expectedInterval * SILENCE_MULTIPLIER_THRESHOLD) {
      // Determine urgency based on temperature and how long silence has been
      const userProfile = await db.nexusProfile.findUnique({ where: { userId } })
      const temp = userProfile?.temperature ?? 50

      let urgencyLevel: string
      if (relevantSilence >= expectedInterval * 4) urgencyLevel = 'critical'
      else if (relevantSilence >= expectedInterval * 3) urgencyLevel = 'high'
      else if (temp < 30) urgencyLevel = 'high' // low temp + silence = more urgent
      else if (relevantSilence >= expectedInterval * 2.5) urgencyLevel = 'medium'
      else urgencyLevel = 'low'

      alerts.push({
        contactId: contact.id,
        contactName: contact.name,
        hoursSilent: Math.round(relevantSilence),
        expectedInterval,
        urgencyLevel,
      })
    }
  }

  return alerts
}

// ─────────────────────────────────────────────────────────────
// 5. BEHAVIORAL PATTERN DETECTION
// ─────────────────────────────────────────────────────────────

async function detectBehavioralPatterns(
  userId: string,
  messages: { role: string; content: string; createdAt: Date }[],
): Promise<void> {
  if (messages.length < 20) return // Need enough data

  const userMessages = messages.filter(m => m.role === 'user')

  // --- Communication Rhythm ---
  const hourDistribution = new Array(24).fill(0) as number[]
  for (const msg of userMessages) {
    hourDistribution[msg.createdAt.getHours()]++
  }

  const totalMsgs = userMessages.length
  const morningPct = hourDistribution.slice(6, 12).reduce((a, b) => a + b, 0) / totalMsgs
  const afternoonPct = hourDistribution.slice(12, 18).reduce((a, b) => a + b, 0) / totalMsgs
  const eveningPct = hourDistribution.slice(18, 23).reduce((a, b) => a + b, 0) / totalMsgs
  const nightPct = (hourDistribution[23] + hourDistribution.slice(0, 6).reduce((a, b) => a + b, 0)) / totalMsgs

  let rhythmName: string | null = null
  let rhythmDesc: string | null = null
  let rhythmConf = 0

  if (morningPct > 0.5) {
    rhythmName = 'Persona matutina'
    rhythmDesc = `El ${Math.round(morningPct * 100)}% de sus mensajes son entre 6am y 12pm. Prefiere comunicarse por la mañana.`
    rhythmConf = Math.min(0.95, morningPct)
  } else if (nightPct > 0.4) {
    rhythmName = 'Persona nocturna'
    rhythmDesc = `El ${Math.round(nightPct * 100)}% de sus mensajes son entre 11pm y 6am. Posible indicador de ansiedad o trabajo nocturno.`
    rhythmConf = Math.min(0.95, nightPct)
  } else if (afternoonPct > 0.45) {
    rhythmName = 'Activo por la tarde'
    rhythmDesc = `El ${Math.round(afternoonPct * 100)}% de sus mensajes son entre 12pm y 6pm.`
    rhythmConf = Math.min(0.95, afternoonPct)
  }

  if (rhythmName && rhythmConf > 0.4) {
    await upsertPattern(userId!, 'rhythm', rhythmName, rhythmDesc!, rhythmConf, {
      hourDistribution,
      morningPct, afternoonPct, eveningPct, nightPct,
    })
  }

  // --- Weekly engagement cycle ---
  const dayDistribution = new Array(7).fill(0) as number[]
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  for (const msg of userMessages) {
    dayDistribution[msg.createdAt.getDay()]++
  }

  const weekdayPct = dayDistribution.slice(1, 6).reduce((a, b) => a + b, 0) / totalMsgs
  const weekendPct = (dayDistribution[0] + dayDistribution[6]) / totalMsgs

  if (weekdayPct > 0.85) {
    await upsertPattern(userId, 'engagement_cycle', 'Patrón entre semana', 
      `El ${Math.round(weekdayPct * 100)}% de la comunicación es de lunes a viernes. ${dayDistribution.slice(1, 6).map((c, i) => `${dayNames[i + 1]}: ${c}`).join(', ')}`,
      Math.min(0.95, weekdayPct),
      { dayDistribution, weekdayPct, weekendPct })
  } else if (weekendPct > 0.4) {
    await upsertPattern(userId, 'engagement_cycle', 'Activo los fines de semana',
      `El ${Math.round(weekendPct * 100)}% de la comunicación es fines de semana.`,
      Math.min(0.95, weekendPct),
      { dayDistribution, weekdayPct, weekendPct })
  }

  // --- Topic preferences (from conversation titles) ---
  const convos = await db.nexusConversation.findMany({
    where: { userId, status: 'active' },
    select: { title: true, agentType: true },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })

  if (convos.length >= 5) {
    const typeCount: Record<string, number> = {}
    for (const c of convos) {
      const t = c.agentType || 'nexus'
      typeCount[t] = (typeCount[t] || 0) + 1
    }

    const topType = Object.entries(typeCount).sort(([, a], [, b]) => b - a)[0]
    if (topType && topType[1] >= 5) {
      const typeNames: Record<string, string> = {
        nexus: 'Asistente general', coder: 'Programación', analyst: 'Análisis de datos',
        writer: 'Redacción', researcher: 'Investigación',
      }
      await upsertPattern(userId, 'topic_preference', `Preferencia por ${typeNames[topType[0]] || topType[0]}`,
        `De las últimas ${convos.length} conversaciones, ${topType[1]} fueron con el agente ${typeNames[topType[0]] || topType[0]} (${Math.round(topType[1] / convos.length * 100)}%).`,
        Math.min(0.95, topType[1] / convos.length),
        { typeCount, totalConversations: convos.length })
    }
  }

  // --- Emotional triggers (detected via AI) ---
  if (userMessages.length >= 30) {
    try {
      const lastTexts = userMessages.slice(-20).map(m => m.content.slice(0, 150)).join('\n')
      const result = await chatWithAI(
        [
          {
            role: 'system',
            content: `Analiza los siguientes mensajes del usuario y detecta patrones emocionales o triggers.
Responde SOLO en JSON array: [{"name":"<nombre>","description":"<descripción>","confidence":<0-1>}]
Máximo 3 patrones. Si no hay patrones claros, responde []. NO incluyas texto adicional.`,
          },
          { role: 'user', content: lastTexts },
        ],
        'glm',
        undefined,
        { temperature: 0.2, maxTokens: 500 },
      )

      const jsonMatch = result.content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const patterns = safeJsonParse<Array<{ name: string; description: string; confidence: number }>>(jsonMatch[0], [])
        for (const p of patterns) {
          if (p.name && p.description && p.confidence > 0.4) {
            await upsertPattern(userId, 'emotional_trigger', p.name, p.description, p.confidence, {})
          }
        }
      }
    } catch (err) {
      logWarn('LIFE_ENGINE', 'pattern_ai_error', { userId, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

async function upsertPattern(
  userId: string,
  patternType: string,
  name: string,
  description: string,
  confidence: number,
  data: Record<string, unknown>,
): Promise<void> {
  await db.nexusBehavioralPattern.upsert({
    where: {
      id: `${userId}_${patternType}_${name}`.slice(0, 100),
    },
    create: {
      id: `${userId}_${patternType}_${name}`.slice(0, 100),
      userId,
      patternType,
      name,
      description,
      confidence: Math.min(1, Math.max(0, confidence)),
      data: JSON.stringify(data),
    },
    update: {
      description,
      confidence: Math.min(1, Math.max(0, confidence)),
      data: JSON.stringify(data),
      updatedAt: new Date(),
    },
  })

  // Emit event
  try {
    await eventBus.emit(EVENT_TYPES.NEXUS_PATTERN_DETECTED, {
      userId,
      patternType,
      patternName: name,
      confidence,
      description,
    }, 'life-engine')
  } catch {
    // Event emission failure should not block pattern detection
  }
}

// ─────────────────────────────────────────────────────────────
// 6. RE-ENGAGEMENT MESSAGE (for silence detection)
// ─────────────────────────────────────────────────────────────

async function generateReengagementMessage(
  userId: string,
  contactName?: string,
  urgencyLevel?: string,
): Promise<string | null> {
  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Eres NEXUS, un asistente virtual empático. Genera un mensaje de re-engagement para un contacto que ha estado en silencio.
Nivel de urgencia: ${urgencyLevel ?? 'low'}
${urgencyLevel === 'critical' ? 'El silencio es muy prolongado. Sé directo pero comprensivo.' : ''}
${urgencyLevel === 'low' ? 'El silencio es leve. Sé casual y amigable, sin presionar.' : ''}
- El mensaje debe ser en español, corto (1-2 frases)
- NO suenes desesperado ni exigente
- Referencia el nombre del contacto si está disponible: ${contactName ?? 'amigo/a'}
- Responde SOLO con el mensaje`,
        },
        { role: 'user', content: `Genera un mensaje de re-engagement para ${contactName ?? 'un contacto'}. Urgencia: ${urgencyLevel ?? 'low'}.` },
      ],
      'glm',
      undefined,
      { temperature: 0.85, maxTokens: 200 },
    )

    const message = result.content.trim()
    if (!message || message.length < 10 || message.length > 400) return null
    return message
  } catch (err) {
    logWarn('LIFE_ENGINE', 'reengagement_gen_error', { userId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN LIFE ENGINE CYCLE
// ─────────────────────────────────────────────────────────────

export async function runLifeEngineCycle(): Promise<LifeEngineCycleResult> {
  const result: LifeEngineCycleResult = {
    processedAt: new Date().toISOString(),
    usersProcessed: 0,
    microFollowUps: 0,
    deepMessages: 0,
    silencesDetected: 0,
    energyUpdates: 0,
    patternsDetected: 0,
    errors: [],
  }

  const timer = logTimer('SYSTEM', 'life_engine_cycle')
  logInfo('SYSTEM', 'life_engine_cycle_start', {})

  try {
    // Get all users with an active NEXUS profile
    const profiles = await db.nexusProfile.findMany({
      include: { user: { select: { id: true, name: true } } },
    })

    logInfo('SYSTEM', 'life_engine_profiles_found', { count: profiles.length })

    for (const profile of profiles) {
      const userId = profile.userId
      try {
        await processUserCycle(userId, profile, result)
        result.usersProcessed++
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logError('SYSTEM', 'life_engine_user_error', err, { userId })
        result.errors.push(`User ${userId}: ${errMsg.slice(0, 100)}`)
      }
    }

    logOk('SYSTEM', 'life_engine_cycle_complete', {
      usersProcessed: result.usersProcessed,
      microFollowUps: result.microFollowUps,
      deepMessages: result.deepMessages,
      silencesDetected: result.silencesDetected,
      energyUpdates: result.energyUpdates,
    })
  } catch (err) {
    logError('SYSTEM', 'life_engine_cycle_fatal', err)
    result.errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  }

  timer.end('ok', result as unknown as Record<string, unknown>)
  return result
}

async function processUserCycle(
  userId: string,
  profile: { userId: string; temperature: number; vacationMode: boolean; occupation?: string | null; interests: string; goals: string; coachMode: boolean },
  result: LifeEngineCycleResult,
): Promise<void> {
  // Ensure profile is properly typed
  const userProfile = profile as {
    userId: string
    temperature: number
    vacationMode: boolean
    occupation?: string | null
    interests: string
    goals: string
    coachMode: boolean
  }

  if (userProfile.vacationMode) return

  // ─── Get user's data ───
  const recentMessages = await db.nexusMessage.findMany({
    where: { conversation: { userId } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  // Older messages for comparison (30-90 days ago)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const olderMessages = await db.nexusMessage.findMany({
    where: {
      conversation: { userId },
      createdAt: { gte: thirtyDaysAgo, lt: threeDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  // Get recent conversations for deep message context
  const recentConvs = await db.nexusConversation.findMany({
    where: { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { role: true, content: true, createdAt: true },
      },
    },
  })

  // Get memories
  const memories = await db.nexusMemory.findMany({
    where: { userId },
    orderBy: { importance: 'desc' },
    take: 10,
    select: { key: true, value: true, category: true },
  })

  // Get contacts
  const contacts = await db.nexusContact.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  // Count pending follow-ups
  const pendingCount = await db.nexusFollowUp.count({
    where: { userId, status: 'pending' },
  })

  // ─── 1. ENERGY ANALYSIS ───
  const { score: newEnergyScore, breakdown, label } = computeEnergyScore(
    recentMessages.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    olderMessages.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
  )

  // Get previous energy score
  const prevEnergyLog = await db.nexusEnergyLog.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  const oldEnergyScore = prevEnergyLog?.score ?? 50

  // Save energy log
  await db.nexusEnergyLog.create({
    data: {
      userId,
      score: newEnergyScore,
      breakdown: JSON.stringify(breakdown),
      label,
      source: 'system',
    },
  })
  result.energyUpdates++

  // Emit event if significant change
  if (Math.abs(newEnergyScore - oldEnergyScore) >= ENERGY_SIGNIFICANT_DELTA) {
    try {
      await eventBus.emit(EVENT_TYPES.NEXUS_ENERGY_CHANGED, {
        userId,
        oldScore: oldEnergyScore,
        newScore: newEnergyScore,
        breakdown: breakdown as unknown as Record<string, number>,
        label,
      }, 'life-engine')
    } catch {
      // Event emission failure should not block
    }
  }

  // ─── 2. MICRO FOLLOW-UPS ───
  if (pendingCount < MAX_PENDING_FOLLOW_UPS) {
    // Check last micro follow-up time
    const lastMicroFollowUp = await db.nexusFollowUp.findFirst({
      where: { userId, type: 'micro' },
      orderBy: { createdAt: 'desc' },
    })

    const shouldGenerateMicro = !lastMicroFollowUp ||
      hoursBetween(lastMicroFollowUp.createdAt, new Date()) >= MICRO_FOLLOW_UP_COOLDOWN_HOURS

    if (shouldGenerateMicro) {
      // Pick a random contact or use general context
      const randomContact = contacts.length > 0
        ? contacts[Math.floor(Math.random() * contacts.length)]
        : undefined

      const contactCtx: ContactContext | undefined = randomContact ? {
        id: randomContact.id,
        name: randomContact.name,
        relation: randomContact.relation,
        lastInteraction: randomContact.updatedAt,
        daysSinceInteraction: Math.round(hoursBetween(randomContact.updatedAt, new Date()) / 24),
        communicationStyle: undefined,
        notes: randomContact.notes || undefined,
      } : undefined

      const lastTopic = recentConvs.length > 0 ? recentConvs[0].title : undefined

      const microMessage = await generateMicroFollowUp(
        userId,
        contactCtx,
        { temperature: userProfile.temperature, vacationMode: false },
        lastTopic,
      )

      if (microMessage) {
        const followUp = await db.nexusFollowUp.create({
          data: {
            userId,
            contactId: randomContact?.id,
            type: 'micro',
            content: microMessage,
            context: JSON.stringify({
              topic: lastTopic,
              timeOfDay: getTimeOfDay(),
              temperature: userProfile.temperature,
              daysSinceInteraction: contactCtx?.daysSinceInteraction,
              contactName: contactCtx?.name,
            }),
            status: 'pending',
            expiresAt: new Date(Date.now() + MICRO_FOLLOW_UP_COOLDOWN_HOURS * 60 * 60 * 1000),
          },
        })
        result.microFollowUps++

        try {
          await eventBus.emit(EVENT_TYPES.NEXUS_FOLLOWUP_GENERATED, {
            userId,
            followUpId: followUp.id,
            type: 'micro',
            contactId: contactCtx?.id,
            contactName: contactCtx?.name,
            content: microMessage,
          }, 'life-engine')
        } catch {
          // Event emission failure should not block
        }
      }
    }
  }

  // ─── 3. DEEP MESSAGES (24h) ───
  const lastDeepMessage = await db.nexusFollowUp.findFirst({
    where: { userId, type: 'deep' },
    orderBy: { createdAt: 'desc' },
  })

  const shouldGenerateDeep = !lastDeepMessage ||
    hoursBetween(lastDeepMessage.createdAt, new Date()) >= DEEP_MESSAGE_COOLDOWN_HOURS

  if (shouldGenerateDeep && recentMessages.length > 5) {
    const deepMessage = await generateDeepMessage(
      userId,
      recentConvs.map(c => ({
        title: c.title,
        messages: c.messages.map(m => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      })),
      memories,
      {
        temperature: userProfile.temperature,
        occupation: userProfile.occupation ?? undefined,
        interests: userProfile.interests,
        goals: userProfile.goals,
        coachMode: userProfile.coachMode,
        vacationMode: false,
      },
    )

    if (deepMessage) {
      const followUp = await db.nexusFollowUp.create({
        data: {
          userId,
          type: 'deep',
          content: deepMessage,
          context: JSON.stringify({
            source: 'ai_deep_analysis',
            temperature: userProfile.temperature,
            conversationCount: recentConvs.length,
            memoryCount: memories.length,
          }),
          status: 'pending',
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h expiry
        },
      })
      result.deepMessages++

      try {
        await eventBus.emit(EVENT_TYPES.NEXUS_FOLLOWUP_GENERATED, {
          userId,
          followUpId: followUp.id,
          type: 'deep',
          content: deepMessage,
        }, 'life-engine')
      } catch {
        // Event emission failure should not block
      }
    }
  }

  // ─── 4. SILENCE DETECTION ───
  const silenceAlerts = await detectSilences(userId)
  for (const alert of silenceAlerts) {
    // Check if there's already an active alert for this contact
    const existingAlert = await db.nexusSilenceAlert.findFirst({
      where: {
        userId,
        contactId: alert.contactId,
        status: 'active',
      },
    })

    if (!existingAlert) {
      // Generate re-engagement message
      const reengagementMsg = await generateReengagementMessage(
        userId,
        alert.contactName,
        alert.urgencyLevel,
      )

      await db.nexusSilenceAlert.create({
        data: {
          userId,
          contactId: alert.contactId,
          hoursSilent: alert.hoursSilent,
          expectedInterval: alert.expectedInterval,
          urgencyLevel: alert.urgencyLevel,
          message: reengagementMsg,
          status: 'active',
        },
      })

      // Also create a follow-up if message was generated
      if (reengagementMsg) {
        await db.nexusFollowUp.create({
          data: {
            userId,
            contactId: alert.contactId,
            type: 'reengagement',
            content: reengagementMsg,
            context: JSON.stringify({
              urgencyLevel: alert.urgencyLevel,
              hoursSilent: alert.hoursSilent,
              expectedInterval: alert.expectedInterval,
            }),
            status: 'pending',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        result.microFollowUps++ // count as follow-up
      }

      result.silencesDetected++

      try {
        await eventBus.emit(EVENT_TYPES.NEXUS_SILENCE_DETECTED, {
          userId,
          contactId: alert.contactId,
          contactName: alert.contactName,
          hoursSilent: alert.hoursSilent,
          expectedInterval: alert.expectedInterval,
          urgencyLevel: alert.urgencyLevel,
        }, 'life-engine')
      } catch {
        // Event emission failure should not block
      }
    }
  }

  // ─── 5. BEHAVIORAL PATTERN DETECTION (run less frequently) ───
  const lastPatternDetection = await db.nexusBehavioralPattern.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })

  const shouldDetectPatterns = !lastPatternDetection ||
    hoursBetween(lastPatternDetection.updatedAt, new Date()) >= 24

  if (shouldDetectPatterns && recentMessages.length >= 20) {
    try {
      await detectBehavioralPatterns(
        userId,
        recentMessages.map(m => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      )
      result.patternsDetected++
    } catch (err) {
      logWarn('LIFE_ENGINE', 'pattern_detection_error', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ─── 6. TEMPERATURE EVENT (if energy shift is significant) ───
  if (Math.abs(newEnergyScore - oldEnergyScore) >= 20 && newEnergyScore < 35) {
    // Low energy might indicate temperature shift
    const tempShift = Math.round((50 - newEnergyScore) * 0.3)
    const newTemp = Math.max(0, Math.min(100, userProfile.temperature - tempShift))
    if (Math.abs(newTemp - userProfile.temperature) >= 5) {
      try {
        await eventBus.emit(EVENT_TYPES.NEXUS_TEMPERATURE_CHANGED, {
          userId,
          oldValue: userProfile.temperature,
          newValue: newTemp,
          source: 'life_engine_energy_shift',
          reason: `Cambio de energía detectado (${oldEnergyScore} → ${newEnergyScore})`,
        }, 'life-engine')
      } catch {
        // Event emission failure should not block
      }
    }
  }

  // Expire old pending follow-ups
  await db.nexusFollowUp.updateMany({
    where: {
      userId,
      status: 'pending',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Get pending follow-ups for a user
// ─────────────────────────────────────────────────────────────

export async function getPendingFollowUps(userId: string) {
  return db.nexusFollowUp.findMany({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      contact: { select: { id: true, name: true, relation: true } },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Get energy history
// ─────────────────────────────────────────────────────────────

export async function getEnergyHistory(userId: string, limit = 30) {
  return db.nexusEnergyLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Get silence alerts
// ─────────────────────────────────────────────────────────────

export async function getSilenceAlerts(userId: string, status?: string) {
  return db.nexusSilenceAlert.findMany({
    where: {
      userId,
      ...(status && status !== 'all' ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      contact: { select: { id: true, name: true, relation: true } },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Get behavioral patterns
// ─────────────────────────────────────────────────────────────

export async function getBehavioralPatterns(userId: string) {
  return db.nexusBehavioralPattern.findMany({
    where: { userId, isActive: true },
    orderBy: { confidence: 'desc' },
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Dismiss / approve / send follow-up
// ─────────────────────────────────────────────────────────────

export async function updateFollowUpStatus(
  followUpId: string,
  userId: string,
  newStatus: 'approved' | 'sent' | 'dismissed',
) {
  const followUp = await db.nexusFollowUp.findFirst({
    where: { id: followUpId, userId },
  })

  if (!followUp) throw new Error('Follow-up no encontrado')

  return db.nexusFollowUp.update({
    where: { id: followUpId },
    data: {
      status: newStatus,
      ...(newStatus === 'sent' ? { sentAt: new Date() } : {}),
      ...(newStatus === 'dismissed' ? { dismissedAt: new Date() } : {}),
    },
  })
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API: Resolve silence alert
// ─────────────────────────────────────────────────────────────

export async function resolveSilenceAlert(
  alertId: string,
  userId: string,
  status: 'resolved' | 'dismissed',
) {
  const alert = await db.nexusSilenceAlert.findFirst({
    where: { id: alertId, userId },
  })

  if (!alert) throw new Error('Alerta no encontrada')

  return db.nexusSilenceAlert.update({
    where: { id: alertId },
    data: {
      status,
      resolvedAt: new Date(),
    },
  })
}
