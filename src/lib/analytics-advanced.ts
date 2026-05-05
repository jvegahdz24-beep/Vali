// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Advanced Behavioral Analytics Engine
// Real ghosting detection, engagement scoring, funnel analysis,
// emotional analytics, productivity metrics, and agent performance
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Types ──────────────────────────────────────────────────

export interface GhostingAlert {
  id: string
  contactId: string
  contactName: string
  alertType: 'ghosting_risk' | 'ghosted'
  severity: 'warning' | 'critical'
  expectedIntervalMs: number
  actualIntervalMs: number
  silenceMultiplier: number
  dealStage: string | null
  lastMessageAt: string
  createdAt: string
}

export interface EngagementScore {
  score: number           // 0-100
  frequencyTrend: 'increasing' | 'decreasing' | 'stable'
  responseTimeTrend: 'faster' | 'slower' | 'stable'
  messageLengthTrend: 'longer' | 'shorter' | 'stable'
  initiativeRatio: number  // 0-1 (1 = contact always starts)
  questionRatio: number    // 0-1
  energyLevel: 'excited' | 'engaged' | 'neutral' | 'fading' | 'burnout'
  messageFrequencyPerDay: number
  avgResponseTimeMs: number
  avgMessageLength: number
}

export interface FunnelMetrics {
  stages: FunnelStage[]
  conversionRates: Record<string, number>
  dropOffRates: Record<string, number>
  avgDaysInStage: Record<string, number>
  bottleneckStage: string | null
  totalPipelineValue: number
  wonValue: number
  lostValue: number
  overallConversionRate: number
}

export interface FunnelStage {
  name: string
  count: number
  value: number
  color: string
  probability: number
}

export interface EmotionalTrendPoint {
  date: string
  sentiment: number      // -1 to 1
  positivity: number     // 0-1
  volatility: number     // 0-1
  messageCount: number
  avgMessageLength: number
  trigger?: string       // detected emotional trigger word/topic
}

export interface EmotionalAnalytics {
  trend: EmotionalTrendPoint[]
  currentSentiment: number
  sentimentTrend: 'improving' | 'declining' | 'stable'
  avgVolatility: number
  positiveTriggers: string[]
  negativeTriggers: string[]
  sentimentOutcomeCorrelation: number  // correlation between sentiment and deal outcomes
}

export interface ProductivityMetrics {
  messagesPerDay: number
  messagesPerWeek: number
  messagesPerMonth: number
  responseTimeDistribution: { bucket: string; count: number; color: string }[]
  medianResponseTimeSec: number
  p95ResponseTimeSec: number
  aiUtilizationRate: number     // % of outbound messages sent by AI
  humanTakeoverRate: number     // % of conversations where human intervened
  automationTriggerRate: number  // % of conversations that triggered automations
  totalAiMessages: number
  totalHumanMessages: number
}

export interface AgentPerformance {
  agentId: string
  agentName: string
  agentType: string
  totalConversations: number
  totalMessages: number
  avgConfidence: number
  successRate: number         // deals won / total conversations
  avgResponseTimeMs: number
  humanTakeoverRate: number
  routingAccuracy: number     // was the orchestrator routing correct
}

export interface ContactAnalytics {
  contactId: string
  contactName: string
  engagement: EngagementScore
  ghosting: {
    status: 'none' | 'ghosting_risk' | 'ghosted'
    expectedIntervalMs: number
    actualIntervalMs: number
    silenceMultiplier: number
  }
  emotional: {
    currentSentiment: number
    trend: 'improving' | 'declining' | 'stable'
    volatility: number
  }
  funnel: {
    currentStage: string | null
    daysInCurrentStage: number
    dealValue: number
  }
  productivity: {
    totalMessages: number
    avgResponseTimeMs: number
    lastMessageAt: string | null
  }
}

export interface WorkspaceAnalytics {
  ghostingAlerts: GhostingAlert[]
  funnelMetrics: FunnelMetrics
  productivity: ProductivityMetrics
  agentPerformance: AgentPerformance[]
  summary: {
    totalContacts: number
    activeConversations: number
    totalMessages: number
    avgEngagementScore: number
    ghostingRiskCount: number
    ghostedCount: number
    conversionRate: number
    topBottleneck: string | null
  }
}

// ─── Helper Functions ───────────────────────────────────────

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

function linearRegression(values: number[]): { slope: number; r2: number } {
  if (values.length < 2) return { slope: 0, r2: 0 }
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
    sumY2 += values[i] * values[i]
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, r2: 0 }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const ssRes = values.reduce((s, v, i) => s + Math.pow(v - (slope * i + intercept), 2), 0)
  const ssTot = values.reduce((s, v) => s + Math.pow(v - sumY / n, 2), 0)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  return { slope, r2 }
}

function trendFromSlope(slope: number): 'increasing' | 'decreasing' | 'stable' {
  if (Math.abs(slope) < 0.01) return 'stable'
  return slope > 0 ? 'increasing' : 'decreasing'
}

function sentimentFromText(text: string): number {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const positiveWords = [
    'genial', 'excelente', 'perfecto', 'increible', 'me encanta', 'me gusta',
    'gracias', 'maravilloso', 'fantastico', 'bien', 'excelente', 'wow',
    'interesante', 'claro', 'si', 'ok', 'listo', 'vamos', 'dime',
    'amor', 'feliz', 'contento', 'emocionado', 'ansioso', 'animado',
  ]
  const negativeWords = [
    'no', 'mal', 'caro', 'problema', 'error', 'difícil', 'imposible',
    'frustrado', 'enojado', 'molesto', 'confundido', 'decepcionado',
    'nunca', 'jamas', 'terrible', 'horrible', 'pésimo', 'no puedo',
    'no quiero', 'no me interesa', 'cancelar', 'arrepentido',
  ]
  let score = 0
  for (const w of positiveWords) {
    if (normalized.includes(w)) score += 1
  }
  for (const w of negativeWords) {
    if (normalized.includes(w)) score -= 1
  }
  // Cap between -1 and 1
  return Math.max(-1, Math.min(1, score / 3))
}

// ─── 1. Ghosting Detection ─────────────────────────────────

export async function detectGhosting(workspaceId: string): Promise<GhostingAlert[]> {
  const contacts = await db.contact.findMany({
    where: { workspaceId, status: 'active' },
    include: {
      conversations: {
        where: { status: { in: ['active', 'bot'] } },
        select: { id: true, messages: { orderBy: { createdAt: 'desc' }, take: 50 } },
      },
      deals: {
        where: { status: 'active' },
        select: { id: true, stage: { select: { name: true } } },
        take: 1,
      },
    },
  })

  const alerts: GhostingAlert[] = []
  const now = Date.now()

  for (const contact of contacts) {
    const allMessages = contact.conversations.flatMap((c) => c.messages)
    if (allMessages.length < 3) continue

    // Sort by time
    const sorted = allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    // Calculate response intervals from the contact (inbound messages)
    const contactMessages = sorted.filter((m) => m.direction === 'inbound')
    if (contactMessages.length < 2) continue

    const intervals: number[] = []
    for (let i = 1; i < contactMessages.length; i++) {
      const gap = contactMessages[i].createdAt.getTime() - contactMessages[i - 1].createdAt.getTime()
      if (gap > 5 * 60 * 1000 && gap < 7 * 24 * 60 * 60 * 1000) { // Between 5 min and 7 days
        intervals.push(gap)
      }
    }

    if (intervals.length < 2) continue

    // Calculate expected interval (median)
    const sortedIntervals = [...intervals].sort((a, b) => a - b)
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    const expectedIntervalMs = Math.max(medianInterval, 60 * 60 * 1000) // At least 1 hour

    // Calculate current silence
    const lastContactMsg = contactMessages[contactMessages.length - 1]
    const actualIntervalMs = now - lastContactMsg.createdAt.getTime()

    if (actualIntervalMs < expectedIntervalMs) continue // Not silent yet

    const silenceMultiplier = actualIntervalMs / expectedIntervalMs
    const dealStage = contact.deals.length > 0 ? contact.deals[0].stage?.name || null : null

    if (silenceMultiplier >= 4) {
      alerts.push({
        id: `ghost-${contact.id}`,
        contactId: contact.id,
        contactName: `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`,
        alertType: 'ghosted',
        severity: dealStage && (dealStage.includes('propuest') || dealStage.includes('negoci') || dealStage.includes('cierre')) ? 'critical' : 'warning',
        expectedIntervalMs,
        actualIntervalMs,
        silenceMultiplier: Math.round(silenceMultiplier * 10) / 10,
        dealStage,
        lastMessageAt: lastContactMsg.createdAt.toISOString(),
        createdAt: new Date().toISOString(),
      })
    } else if (silenceMultiplier >= 2) {
      alerts.push({
        id: `risk-${contact.id}`,
        contactId: contact.id,
        contactName: `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`,
        alertType: 'ghosting_risk',
        severity: dealStage && (dealStage.includes('propuest') || dealStage.includes('negoci') || dealStage.includes('cierre')) ? 'critical' : 'warning',
        expectedIntervalMs,
        actualIntervalMs,
        silenceMultiplier: Math.round(silenceMultiplier * 10) / 10,
        dealStage,
        lastMessageAt: lastContactMsg.createdAt.toISOString(),
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Sort by severity and silence multiplier
  alerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1
    if (b.severity === 'critical' && a.severity !== 'critical') return 1
    return b.silenceMultiplier - a.silenceMultiplier
  })

  return alerts
}

export async function storeGhostingAlerts(workspaceId: string, alerts: GhostingAlert[]): Promise<void> {
  for (const alert of alerts) {
    // Check if we already have an unresolved alert for this contact
    const existing = await db.analyticsAlert.findFirst({
      where: {
        workspaceId,
        contactId: alert.contactId,
        alertType: alert.alertType,
        isResolved: false,
      },
    })

    if (!existing) {
      await db.analyticsAlert.create({
        data: {
          workspaceId,
          contactId: alert.contactId,
          alertType: alert.alertType,
          severity: alert.severity,
          title: alert.alertType === 'ghosted'
            ? `Contacto ghosteado: ${alert.contactName}`
            : `Riesgo de ghosting: ${alert.contactName}`,
          description: alert.alertType === 'ghosted'
            ? `${alert.contactName} no responde desde ${formatDuration(alert.actualIntervalMs)} (${Math.round(alert.silenceMultiplier)}x su intervalo normal de ${formatDuration(alert.expectedIntervalMs)})${alert.dealStage ? ` — Etapa: ${alert.dealStage}` : ''}`
            : `Silencio de ${formatDuration(alert.actualIntervalMs)} (${Math.round(alert.silenceMultiplier)}x lo normal)${alert.dealStage ? ` — Etapa: ${alert.dealStage}` : ''}`,
          metadata: JSON.stringify({
            expectedIntervalMs: alert.expectedIntervalMs,
            actualIntervalMs: alert.actualIntervalMs,
            silenceMultiplier: alert.silenceMultiplier,
            dealStage: alert.dealStage,
          }),
        },
      })
    }
  }
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ─── 2. Energy / Engagement Analysis ───────────────────────

export async function computeEngagement(contactId: string): Promise<EngagementScore> {
  const conversations = await db.conversation.findMany({
    where: { contactId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { content: true, direction: true, createdAt: true, senderType: true },
      },
    },
  })

  const allMessages = conversations.flatMap((c) => c.messages)
  if (allMessages.length < 2) {
    return defaultEngagementScore()
  }

  const contactMessages = allMessages.filter((m) => m.direction === 'inbound' || m.senderType === 'contact')
  if (contactMessages.length === 0) {
    return defaultEngagementScore()
  }

  // ── Message frequency trend ──
  // Group messages by day
  const messagesByDay = new Map<string, number>()
  for (const msg of contactMessages) {
    const day = msg.createdAt.toISOString().split('T')[0]
    messagesByDay.set(day, (messagesByDay.get(day) || 0) + 1)
  }
  const dayKeys = [...messagesByDay.keys()].sort()
  const dailyCounts = dayKeys.map((k) => messagesByDay.get(k) || 0)
  const freqRegression = linearRegression(dailyCounts)
  const frequencyTrend = trendFromSlope(freqRegression.slope)
  const messageFrequencyPerDay = dailyCounts.length > 0
    ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length
    : 0

  // ── Response time trend ──
  const responseTimes: { time: number; date: string }[] = []
  for (let i = 1; i < allMessages.length; i++) {
    const prev = allMessages[i - 1]
    const curr = allMessages[i]
    if (
      (prev.direction === 'outbound' || prev.senderType === 'agent') &&
      (curr.direction === 'inbound' || curr.senderType === 'contact')
    ) {
      const gapMs = curr.createdAt.getTime() - prev.createdAt.getTime()
      if (gapMs > 0 && gapMs < 24 * 60 * 60 * 1000) {
        responseTimes.push({ time: gapMs, date: curr.createdAt.toISOString().split('T')[0] })
      }
    }
  }

  let responseTimeTrend: 'faster' | 'slower' | 'stable' = 'stable'
  let avgResponseTimeMs = 0
  if (responseTimes.length >= 2) {
    const rtValues = responseTimes.map((r) => r.time)
    const rtRegression = linearRegression(rtValues)
    // Negative slope = faster over time
    if (rtRegression.slope < -10000) responseTimeTrend = 'faster'
    else if (rtRegression.slope > 10000) responseTimeTrend = 'slower'
    avgResponseTimeMs = Math.round(rtValues.reduce((a, b) => a + b, 0) / rtValues.length)
  } else if (responseTimes.length === 1) {
    avgResponseTimeMs = responseTimes[0].time
  }

  // ── Message length trend ──
  const lengthValues = contactMessages.map((m) => m.content.length)
  const lengthRegression = linearRegression(lengthValues)
  const messageLengthTrend = trendFromSlope(lengthRegression.slope) as 'longer' | 'shorter' | 'stable'
  const avgMessageLength = lengthValues.length > 0
    ? Math.round(lengthValues.reduce((a, b) => a + b, 0) / lengthValues.length)
    : 0

  // ── Initiative ratio (who starts conversations) ──
  let contactStarts = 0
  for (const conv of conversations) {
    const firstMsg = conv.messages[0]
    if (firstMsg && (firstMsg.direction === 'inbound' || firstMsg.senderType === 'contact')) {
      contactStarts++
    }
  }
  const initiativeRatio = conversations.length > 0 ? contactStarts / conversations.length : 0.5

  // ── Question ratio ──
  const questionsCount = contactMessages.filter((m) => /\?|¿/.test(m.content)).length
  const questionRatio = contactMessages.length > 0 ? questionsCount / contactMessages.length : 0

  // ── Compute composite score (0-100) ──
  let score = 50 // Base

  // Frequency: increasing = +15, stable = +5, decreasing = -10
  if (frequencyTrend === 'increasing') score += 15
  else if (frequencyTrend === 'stable') score += 5
  else score -= 10

  // Response time: faster = +15, stable = +5, slower = -10
  if (responseTimeTrend === 'faster') score += 15
  else if (responseTimeTrend === 'stable') score += 5
  else score -= 10

  // Message length: longer = +10, stable = +3, shorter = -5
  if (messageLengthTrend === 'longer') score += 10
  else if (messageLengthTrend === 'stable') score += 3
  else score -= 5

  // Initiative: contact starting = good engagement
  score += Math.round(initiativeRatio * 10)

  // Questions: shows interest
  score += Math.round(questionRatio * 10)

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score))

  // Energy level
  let energyLevel: EngagementScore['energyLevel'] = 'neutral'
  if (score >= 80) energyLevel = 'excited'
  else if (score >= 60) energyLevel = 'engaged'
  else if (score >= 40) energyLevel = 'neutral'
  else if (score >= 20) energyLevel = 'fading'
  else energyLevel = 'burnout'

  return {
    score,
    frequencyTrend,
    responseTimeTrend,
    messageLengthTrend,
    initiativeRatio: Math.round(initiativeRatio * 100) / 100,
    questionRatio: Math.round(questionRatio * 100) / 100,
    energyLevel,
    messageFrequencyPerDay: Math.round(messageFrequencyPerDay * 100) / 100,
    avgResponseTimeMs,
    avgMessageLength,
  }
}

function defaultEngagementScore(): EngagementScore {
  return {
    score: 50,
    frequencyTrend: 'stable',
    responseTimeTrend: 'stable',
    messageLengthTrend: 'stable',
    initiativeRatio: 0.5,
    questionRatio: 0,
    energyLevel: 'neutral',
    messageFrequencyPerDay: 0,
    avgResponseTimeMs: 0,
    avgMessageLength: 0,
  }
}

// ─── 3. Funnel Analytics ────────────────────────────────────

export async function computeFunnelMetrics(workspaceId: string): Promise<FunnelMetrics> {
  // Get all pipeline stages
  const pipelines = await db.pipeline.findMany({
    where: { workspaceId, isActive: true },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          deals: {
            where: { status: 'active' },
            select: { id: true, value: true, createdAt: true, updatedAt: true, status: true },
          },
        },
      },
    },
  })

  const allStages: FunnelStage[] = []
  let stageDealsMap = new Map<string, { count: number; value: number; dealIds: string[] }>()

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      const dealCount = stage.deals.length
      const dealValue = stage.deals.reduce((sum, d) => sum + d.value, 0)
      allStages.push({
        name: stage.name,
        count: dealCount,
        value: dealValue,
        color: stage.color,
        probability: stage.probability,
      })
      stageDealsMap.set(stage.id, {
        count: dealCount,
        value: dealValue,
        dealIds: stage.deals.map((d) => d.id),
      })
    }
  }

  // Compute conversion and drop-off rates between stages
  const conversionRates: Record<string, number> = {}
  const dropOffRates: Record<string, number> = {}
  for (let i = 1; i < allStages.length; i++) {
    const prev = allStages[i - 1]
    const curr = allStages[i]
    const key = `${prev.name}_to_${curr.name}`
    if (prev.count > 0) {
      conversionRates[key] = Math.round((curr.count / prev.count) * 100) / 100
      dropOffRates[key] = Math.round((1 - curr.count / prev.count) * 100) / 100
    } else {
      conversionRates[key] = 0
      dropOffRates[key] = 0
    }
  }

  // Avg days in stage
  const avgDaysInStage: Record<string, number> = {}
  let bottleneckStage: string | null = null
  let maxAvgDays = 0

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      if (stage.deals.length === 0) {
        avgDaysInStage[stage.name] = 0
        continue
      }
      let totalDays = 0
      for (const deal of stage.deals) {
        const days = (deal.updatedAt.getTime() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        totalDays += days
      }
      const avgDays = Math.round((totalDays / stage.deals.length) * 10) / 10
      avgDaysInStage[stage.name] = avgDays
      if (avgDays > maxAvgDays && !stage.isWon) {
        maxAvgDays = avgDays
        bottleneckStage = stage.name
      }
    }
  }

  // Pipeline values
  const totalPipelineValue = allStages.reduce((sum, s) => sum + s.value, 0)
  const wonStages = allStages.filter((s) => s.name.toLowerCase().includes('ganad') || s.name.toLowerCase().includes('won') || s.name.toLowerCase().includes('close'))
  const wonValue = wonStages.reduce((sum, s) => sum + s.value, 0)
  const lostValue = 0 // We don't track lost value separately without querying lost deals

  // Overall conversion rate: from first stage to last active non-won/lost stage
  let overallConversionRate = 0
  const activeStages = allStages.filter(
    (s) => !s.name.toLowerCase().includes('ganad') && !s.name.toLowerCase().includes('perdid') &&
          !s.name.toLowerCase().includes('won') && !s.name.toLowerCase().includes('lost')
  )
  if (activeStages.length >= 2) {
    const first = activeStages[0]
    const last = activeStages[activeStages.length - 1]
    if (first.count > 0) {
      overallConversionRate = Math.round((last.count / first.count) * 100) / 100
    }
  }

  return {
    stages: allStages,
    conversionRates,
    dropOffRates,
    avgDaysInStage,
    bottleneckStage,
    totalPipelineValue: Math.round(totalPipelineValue * 100) / 100,
    wonValue: Math.round(wonValue * 100) / 100,
    lostValue,
    overallConversionRate,
  }
}

// ─── 4. Emotional Analytics ────────────────────────────────

export async function computeEmotionalTrend(
  contactId: string,
  days: number = 30
): Promise<EmotionalAnalytics> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const conversations = await db.conversation.findMany({
    where: { contactId },
    include: {
      messages: {
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { content: true, createdAt: true, direction: true, senderType: true },
      },
    },
  })

  const contactMessages = conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.direction === 'inbound' || m.senderType === 'contact')

  if (contactMessages.length === 0) {
    return emptyEmotionalAnalytics()
  }

  // Group by day
  const dayBuckets = new Map<string, typeof contactMessages>()
  for (const msg of contactMessages) {
    const day = msg.createdAt.toISOString().split('T')[0]
    if (!dayBuckets.has(day)) dayBuckets.set(day, [])
    dayBuckets.get(day)!.push(msg)
  }

  const dayKeys = [...dayBuckets.keys()].sort()
  const trend: EmotionalTrendPoint[] = []
  const allSentiments: number[] = []
  const positiveTriggers = new Map<string, number>()
  const negativeTriggers = new Map<string, number>()

  // Emotional trigger keywords
  const posTriggerWords = [
    'precio', 'costo', 'oferta', 'descuento', 'promocion', 'interesado',
    'quiero', 'me gusta', 'cuando', 'agendar', 'cita', 'empezar',
    'funciona', 'demo', 'probar', 'excelente', 'genial',
  ]
  const negTriggerWords = [
    'caro', 'no puedo', 'no tengo', 'problema', 'error', 'lento',
    'no responde', 'no funciona', 'difícil', 'complicado',
    'cancelar', 'arrepentido', 'otra opción',
  ]

  for (const day of dayKeys) {
    const msgs = dayBuckets.get(day)!
    let daySentimentSum = 0
    let dayLengths: number[] = []
    let dayTrigger: string | undefined

    for (const msg of msgs) {
      const sent = sentimentFromText(msg.content)
      daySentimentSum += sent
      dayLengths.push(msg.content.length)

      // Detect triggers
      const norm = msg.content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      for (const tw of posTriggerWords) {
        if (norm.includes(tw)) {
          positiveTriggers.set(tw, (positiveTriggers.get(tw) || 0) + 1)
          if (!dayTrigger) dayTrigger = tw
        }
      }
      for (const tw of negTriggerWords) {
        if (norm.includes(tw)) {
          negativeTriggers.set(tw, (negativeTriggers.get(tw) || 0) + 1)
          if (!dayTrigger) dayTrigger = tw
        }
      }
    }

    const avgSentiment = msgs.length > 0 ? daySentimentSum / msgs.length : 0
    allSentiments.push(avgSentiment)

    // Volatility = standard deviation of sentiments within the day
    const daySentiments = msgs.map((m) => sentimentFromText(m.content))
    const mean = daySentiments.reduce((a, b) => a + b, 0) / daySentiments.length
    const variance = daySentiments.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / daySentiments.length
    const volatility = Math.min(1, Math.sqrt(variance))

    trend.push({
      date: day,
      sentiment: Math.round(avgSentiment * 100) / 100,
      positivity: Math.max(0, Math.round(avgSentiment * 100) / 100),
      volatility: Math.round(volatility * 100) / 100,
      messageCount: msgs.length,
      avgMessageLength: dayLengths.length > 0
        ? Math.round(dayLengths.reduce((a, b) => a + b, 0) / dayLengths.length)
        : 0,
      trigger: dayTrigger,
    })
  }

  // Current sentiment (last 5 messages average)
  const recentMsgs = contactMessages.slice(-5)
  const currentSentiment = recentMsgs.length > 0
    ? recentMsgs.reduce((s, m) => s + sentimentFromText(m.content), 0) / recentMsgs.length
    : 0

  // Sentiment trend
  const sentRegression = linearRegression(allSentiments)
  let sentimentTrend: 'improving' | 'declining' | 'stable' = 'stable'
  if (sentRegression.slope > 0.02) sentimentTrend = 'improving'
  else if (sentRegression.slope < -0.02) sentimentTrend = 'declining'

  // Average volatility
  const avgVolatility = trend.length > 0
    ? Math.round((trend.reduce((s, t) => s + t.volatility, 0) / trend.length) * 100) / 100
    : 0

  // Top triggers
  const topPositiveTriggers = [...positiveTriggers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  const topNegativeTriggers = [...negativeTriggers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  // Sentiment-outcome correlation (simplified)
  const wsId = await workspaceId_fromContact(contactId)
  const sentimentOutcomeCorrelation = await computeSentimentOutcomeCorrelation(wsId)

  return {
    trend,
    currentSentiment: Math.round(currentSentiment * 100) / 100,
    sentimentTrend,
    avgVolatility,
    positiveTriggers: topPositiveTriggers,
    negativeTriggers: topNegativeTriggers,
    sentimentOutcomeCorrelation,
  }
}

async function workspaceId_fromContact(contactId: string): Promise<string> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { workspaceId: true },
  })
  return contact?.workspaceId || ''
}

async function computeSentimentOutcomeCorrelation(workspaceId: string): Promise<number> {
  // Simplified: check if contacts with higher sentiment scores have more won deals
  const contacts = await db.contact.findMany({
    where: { workspaceId },
    select: {
      id: true,
      leadScore: true,
      deals: {
        where: { OR: [{ status: 'won' }, { stage: { isWon: true } }] },
        select: { id: true },
      },
    },
    take: 100,
  })

  if (contacts.length < 5) return 0

  let hasWonCount = 0
  let noWonCount = 0
  let highScoreWithWon = 0
  let highScoreWithout = 0

  for (const c of contacts) {
    const hasWon = c.deals.length > 0
    const highScore = c.leadScore >= 50
    if (hasWon) hasWonCount++
    else noWonCount++
    if (highScore && hasWon) highScoreWithWon++
    if (highScore && !hasWon) highScoreWithout++
  }

  // Simple correlation using leadScore as proxy for engagement/sentiment
  const highScoreTotal = highScoreWithWon + highScoreWithout
  if (highScoreTotal === 0 || hasWonCount === 0) return 0

  const highScoreWonRate = highScoreWithWon / highScoreTotal
  const overallWonRate = hasWonCount / contacts.length
  return Math.round((highScoreWonRate - overallWonRate) * 100) / 100
}

function emptyEmotionalAnalytics(): EmotionalAnalytics {
  return {
    trend: [],
    currentSentiment: 0,
    sentimentTrend: 'stable',
    avgVolatility: 0,
    positiveTriggers: [],
    negativeTriggers: [],
    sentimentOutcomeCorrelation: 0,
  }
}

// ─── 5. Productivity Metrics ────────────────────────────────

export async function computeProductivity(workspaceId: string, period: string = '30d'): Promise<ProductivityMetrics> {
  const { startDate } = getDateRange(period)
  const now = new Date()

  // Message counts
  const [totalMessages, aiMessages, humanMessages] = await Promise.all([
    db.message.count({
      where: {
        conversation: { workspaceId },
        createdAt: { gte: startDate },
      },
    }),
    db.message.count({
      where: {
        conversation: { workspaceId },
        isAiGenerated: true,
        createdAt: { gte: startDate },
      },
    }),
    db.message.count({
      where: {
        conversation: { workspaceId },
        isAiGenerated: false,
        direction: 'outbound',
        createdAt: { gte: startDate },
      },
    }),
  ])

  const daysDiff = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
  const messagesPerDay = Math.round((totalMessages / daysDiff) * 100) / 100
  const messagesPerWeek = Math.round(messagesPerDay * 7 * 100) / 100
  const messagesPerMonth = Math.round(messagesPerDay * 30 * 100) / 100

  const totalOutbound = aiMessages + humanMessages
  const aiUtilizationRate = totalOutbound > 0 ? Math.round((aiMessages / totalOutbound) * 100) / 100 : 0

  // Response time distribution
  const allMessages = await db.message.findMany({
    where: {
      conversation: { workspaceId },
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, direction: true, isAiGenerated: true },
  })

  const responseGaps: number[] = []
  for (let i = 0; i < allMessages.length - 1; i++) {
    const msg = allMessages[i]
    const next = allMessages[i + 1]
    if (
      msg.direction === 'inbound' && !msg.isAiGenerated &&
      next.direction === 'outbound' && next.isAiGenerated
    ) {
      const gapMs = next.createdAt.getTime() - msg.createdAt.getTime()
      if (gapMs > 0 && gapMs < 3600000) responseGaps.push(gapMs)
    }
  }

  const responseTimeDistribution = [
    { bucket: '< 1 min', count: 0, color: '#10b981' },
    { bucket: '1-5 min', count: 0, color: '#34d399' },
    { bucket: '5-15 min', count: 0, color: '#fbbf24' },
    { bucket: '15-60 min', count: 0, color: '#f97316' },
    { bucket: '60+ min', count: 0, color: '#ef4444' },
  ]

  for (const gapMs of responseGaps) {
    const gapSec = gapMs / 1000
    if (gapSec < 60) responseTimeDistribution[0].count++
    else if (gapSec < 300) responseTimeDistribution[1].count++
    else if (gapSec < 900) responseTimeDistribution[2].count++
    else if (gapSec < 3600) responseTimeDistribution[3].count++
    else responseTimeDistribution[4].count++
  }

  const sortedGaps = [...responseGaps].sort((a, b) => a - b)
  const medianResponseTimeSec = sortedGaps.length > 0
    ? Math.round(sortedGaps[Math.floor(sortedGaps.length / 2)] / 1000)
    : 0
  const p95ResponseTimeSec = sortedGaps.length > 0
    ? Math.round(sortedGaps[Math.floor(sortedGaps.length * 0.95)] / 1000)
    : 0

  // Human takeover rate
  const conversationsWithHuman = await db.conversation.count({
    where: {
      workspaceId,
      assignedTo: { not: null },
      status: 'active',
    },
  })
  const totalActiveConversations = await db.conversation.count({
    where: { workspaceId, status: { in: ['active', 'bot'] } },
  })
  const humanTakeoverRate = totalActiveConversations > 0
    ? Math.round((conversationsWithHuman / totalActiveConversations) * 100) / 100
    : 0

  // Automation trigger rate
  const automationLogs = await db.automationLog.count({
    where: { workspaceId, createdAt: { gte: startDate } },
  })
  const automationTriggerRate = totalActiveConversations > 0
    ? Math.round((Math.min(automationLogs, totalActiveConversations) / totalActiveConversations) * 100) / 100
    : 0

  return {
    messagesPerDay,
    messagesPerWeek,
    messagesPerMonth,
    responseTimeDistribution,
    medianResponseTimeSec,
    p95ResponseTimeSec,
    aiUtilizationRate,
    humanTakeoverRate,
    automationTriggerRate,
    totalAiMessages: aiMessages,
    totalHumanMessages: humanMessages,
  }
}

// ─── 6. Agent Performance ──────────────────────────────────

export async function computeAgentPerformance(workspaceId: string): Promise<AgentPerformance[]> {
  const agents = await db.agent.findMany({
    where: { workspaceId, isActive: true },
    include: {
      logs: {
        select: {
          confidence: true,
          createdAt: true,
          conversation: { select: { contactId: true } },
        },
      },
    },
  })

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const performance: AgentPerformance[] = []

  for (const agent of agents) {
    const recentLogs = agent.logs.filter((l) => l.createdAt >= thirtyDaysAgo)
    if (recentLogs.length === 0) continue

    const totalMessages = recentLogs.length
    const avgConfidence = recentLogs.reduce((s, l) => s + l.confidence, 0) / recentLogs.length

    // Get unique conversations
    const uniqueConvIds = new Set(recentLogs.map((l) => l.conversation.contactId).filter(Boolean))

    // Success rate: how many contacts with this agent ended up with won deals
    let dealsWon = 0
    for (const contactId of uniqueConvIds) {
      if (!contactId) continue
      const wonDeals = await db.deal.count({
        where: {
          contactId,
          workspaceId,
          OR: [{ status: 'won' }, { stage: { isWon: true } }],
        },
      })
      if (wonDeals > 0) dealsWon++
    }
    const successRate = uniqueConvIds.size > 0 ? Math.round((dealsWon / uniqueConvIds.size) * 100) / 100 : 0

    // Average response time from logs
    const avgResponseTimeMs = recentLogs.length > 0
      ? Math.round(recentLogs.reduce((s) => s, 0) / recentLogs.length) // placeholder; use latencyMs if available
      : 0

    // Human takeover rate for this agent's conversations
    const agentConvIds = recentLogs.map((l) => l.conversation.contactId).filter(Boolean)
    let humanTakeovers = 0
    const checked = new Set<string>()
    for (const contactId of agentConvIds) {
      if (!contactId || checked.has(contactId)) continue
      checked.add(contactId)
      const humanConv = await db.conversation.count({
        where: { contactId, assignedTo: { not: null } },
      })
      if (humanConv > 0) humanTakeovers++
    }
    const humanTakeoverRate = checked.size > 0 ? Math.round((humanTakeovers / checked.size) * 100) / 100 : 0

    // Routing accuracy: default to confidence-based estimate
    const routingAccuracy = Math.round(avgConfidence * 100) / 100

    performance.push({
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      totalConversations: uniqueConvIds.size,
      totalMessages,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      successRate,
      avgResponseTimeMs,
      humanTakeoverRate,
      routingAccuracy,
    })
  }

  return performance.sort((a, b) => b.successRate - a.successRate)
}

// ─── Public API Functions ──────────────────────────────────

export async function getContactAnalytics(contactId: string): Promise<ContactAnalytics | null> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workspaceId: true,
      lastMessageAt: true,
      deals: {
        where: { status: 'active' },
        select: { stage: { select: { name: true } }, value: true, createdAt: true },
        take: 1,
      },
    },
  })

  if (!contact) return null

  const engagement = await computeEngagement(contactId)
  const workspaceId = await workspaceId_fromContact(contactId)

  // Ghosting status
  const conversations = await db.conversation.findMany({
    where: { contactId },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 30, select: { content: true, direction: true, createdAt: true, senderType: true } },
    },
  })

  const allMessages = conversations.flatMap((c) => c.messages)
  const contactMessages = allMessages
    .filter((m) => m.direction === 'inbound' || m.senderType === 'contact')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  let ghostingStatus: ContactAnalytics['ghosting'] = {
    status: 'none',
    expectedIntervalMs: 0,
    actualIntervalMs: 0,
    silenceMultiplier: 0,
  }

  if (contactMessages.length >= 2) {
    const intervals: number[] = []
    for (let i = 1; i < contactMessages.length; i++) {
      const gap = contactMessages[i].createdAt.getTime() - contactMessages[i - 1].createdAt.getTime()
      if (gap > 5 * 60 * 1000 && gap < 7 * 24 * 60 * 60 * 1000) {
        intervals.push(gap)
      }
    }
    if (intervals.length >= 2) {
      const sorted = [...intervals].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const expectedIntervalMs = Math.max(median, 60 * 60 * 1000)
      const actualIntervalMs = Date.now() - contactMessages[contactMessages.length - 1].createdAt.getTime()
      const multiplier = actualIntervalMs / expectedIntervalMs

      let status: 'none' | 'ghosting_risk' | 'ghosted' = 'none'
      if (multiplier >= 4) status = 'ghosted'
      else if (multiplier >= 2) status = 'ghosting_risk'

      ghostingStatus = {
        status,
        expectedIntervalMs,
        actualIntervalMs,
        silenceMultiplier: Math.round(multiplier * 10) / 10,
      }
    }
  }

  // Emotional summary (simplified)
  const recentContactMsgs = contactMessages.slice(-10)
  const currentSentiment = recentContactMsgs.length > 0
    ? recentContactMsgs.reduce((s, m) => s + sentimentFromText(m.content), 0) / recentContactMsgs.length
    : 0
  const sentValues = recentContactMsgs.map((m) => sentimentFromText(m.content))
  const sentMean = sentValues.length > 0 ? sentValues.reduce((a, b) => a + b, 0) / sentValues.length : 0
  const sentVariance = sentValues.length > 0
    ? sentValues.reduce((s, v) => s + Math.pow(v - sentMean, 2), 0) / sentValues.length
    : 0
  let sentimentTrend: 'improving' | 'declining' | 'stable' = 'stable'
  if (sentValues.length >= 3) {
    const reg = linearRegression(sentValues)
    if (reg.slope > 0.05) sentimentTrend = 'improving'
    else if (reg.slope < -0.05) sentimentTrend = 'declining'
  }

  // Funnel position
  const deal = contact.deals.length > 0 ? contact.deals[0] : null
  const daysInCurrentStage = deal ? Math.round((Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0

  // Total messages count
  const totalMessagesCount = allMessages.length

  return {
    contactId: contact.id,
    contactName: `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`,
    engagement,
    ghosting: ghostingStatus,
    emotional: {
      currentSentiment: Math.round(currentSentiment * 100) / 100,
      trend: sentimentTrend,
      volatility: Math.round(Math.min(1, Math.sqrt(sentVariance)) * 100) / 100,
    },
    funnel: {
      currentStage: deal?.stage?.name || null,
      daysInCurrentStage,
      dealValue: deal?.value || 0,
    },
    productivity: {
      totalMessages: totalMessagesCount,
      avgResponseTimeMs: engagement.avgResponseTimeMs,
      lastMessageAt: contact.lastMessageAt?.toISOString() || null,
    },
  }
}

export async function getWorkspaceAnalytics(
  workspaceId: string,
  period: string = '30d'
): Promise<WorkspaceAnalytics> {
  const [ghostingAlerts, funnelMetrics, productivity, agentPerformance] = await Promise.all([
    detectGhosting(workspaceId),
    computeFunnelMetrics(workspaceId),
    computeProductivity(workspaceId, period),
    computeAgentPerformance(workspaceId),
  ])

  // Store ghosting alerts in DB
  await storeGhostingAlerts(workspaceId, ghostingAlerts)

  // Workspace summary
  const [totalContacts, activeConversations, totalMessages] = await Promise.all([
    db.contact.count({ where: { workspaceId } }),
    db.conversation.count({ where: { workspaceId, status: { in: ['active', 'bot'] } } }),
    db.message.count({
      where: { conversation: { workspaceId } },
    }),
  ])

  const ghostingRiskCount = ghostingAlerts.filter((a) => a.alertType === 'ghosting_risk').length
  const ghostedCount = ghostingAlerts.filter((a) => a.alertType === 'ghosted').length

  return {
    ghostingAlerts,
    funnelMetrics,
    productivity,
    agentPerformance,
    summary: {
      totalContacts,
      activeConversations,
      totalMessages,
      avgEngagementScore: 50, // Computed from contacts would be expensive; using default
      ghostingRiskCount,
      ghostedCount,
      conversionRate: funnelMetrics.overallConversionRate,
      topBottleneck: funnelMetrics.bottleneckStage,
    },
  }
}

export async function getGhostingAlerts(workspaceId: string): Promise<GhostingAlert[]> {
  // Return both live-detected and stored alerts
  const liveAlerts = await detectGhosting(workspaceId)

  // Store new alerts
  await storeGhostingAlerts(workspaceId, liveAlerts)

  // Get stored unresolved alerts
  const storedAlerts = await db.analyticsAlert.findMany({
    where: {
      workspaceId,
      alertType: { in: ['ghosting_risk', 'ghosted'] },
      isResolved: false,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Merge: prefer live data, add stored that aren't already covered
  const liveContactIds = new Set(liveAlerts.map((a) => a.contactId))
  const combinedAlerts = [...liveAlerts]

  for (const stored of storedAlerts) {
    if (stored.contactId && !liveContactIds.has(stored.contactId)) {
      const meta = safeJsonParse<{ expectedIntervalMs: number; actualIntervalMs: number; silenceMultiplier: number; dealStage: string | null }>(stored.metadata, { expectedIntervalMs: 0, actualIntervalMs: 0, silenceMultiplier: 0, dealStage: null })
      combinedAlerts.push({
        id: stored.id,
        contactId: stored.contactId || '',
        contactName: stored.title.replace(/^(Riesgo de ghosting|Contacto ghosteado): /, ''),
        alertType: stored.alertType as 'ghosting_risk' | 'ghosted',
        severity: stored.severity as 'warning' | 'critical',
        expectedIntervalMs: meta.expectedIntervalMs || 0,
        actualIntervalMs: meta.actualIntervalMs || 0,
        silenceMultiplier: meta.silenceMultiplier || 0,
        dealStage: meta.dealStage || null,
        lastMessageAt: stored.createdAt.toISOString(),
        createdAt: stored.createdAt.toISOString(),
      })
    }
  }

  return combinedAlerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1
    if (b.severity === 'critical' && a.severity !== 'critical') return 1
    return b.silenceMultiplier - a.silenceMultiplier
  })
}

export async function getFunnelMetrics(workspaceId: string): Promise<FunnelMetrics> {
  return computeFunnelMetrics(workspaceId)
}

export async function getEmotionalTrend(
  contactId: string,
  days: number = 30
): Promise<EmotionalAnalytics> {
  return computeEmotionalTrend(contactId, days)
}

// ─── Utility ───────────────────────────────────────────────

function getDateRange(period: string): { startDate: Date } {
  const now = new Date()
  const startDate = new Date()
  switch (period) {
    case '7d':
      startDate.setDate(now.getDate() - 7)
      break
    case '90d':
      startDate.setDate(now.getDate() - 90)
      break
    default:
      startDate.setDate(now.getDate() - 30)
  }
  return { startDate }
}
