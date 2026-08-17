// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0.0 — Memory Queries
// Typed query helpers for AI agents
// High-level queries that agents commonly need
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logError, logOk, logWarn } from '@/lib/logger'
import { MemoryManager } from './memory-manager'

// Re-export key types from MemoryManager so agents only need one import
export type {
  ContactContext,
  ConversationContext,
  EmotionResult,
  EmotionalSnapshot,
  BehavioralSnapshot,
  EpisodeSummary,
  LeadProfileSnapshot,
  MemorySearchOptions,
  MemorySearchResult,
  ContactProfileResult,
} from './memory-manager'

// ─── Types ──────────────────────────────────────────────────

export interface ContactMemoryProfile {
  contactId: string
  memories: Array<{
    id: string
    key: string
    value: string
    category: string
    importance: number
    updatedAt: Date
  }>
  emotionalState: import('./memory-manager').EmotionalSnapshot | null
  behavioralPatterns: import('./memory-manager').BehavioralSnapshot | null
  recentEpisodes: import('./memory-manager').EpisodeSummary[]
  summary: string
}

export interface SimilarContactResult {
  contactId: string
  firstName: string
  lastName: string | null
  similarityScore: number
  sharedCategories: string[]
  sharedTags: string[]
}

export interface BuyingSignal {
  id: string
  type: 'budget_mentioned' | 'timeline_urgent' | 'objection_resolved' | 'product_interest' | 'price_inquiry' | 'comparison' | 'decision_maker'
  description: string
  confidence: number
  source: string
  detectedAt: Date
}

export interface EmotionalAlert {
  contactId: string
  contactName: string
  currentEmotion: string
  currentValence: number
  trend: 'declining' | 'volatile' | 'stable_negative'
  severity: 'low' | 'medium' | 'high'
  lastInteraction: Date | null
  negativeStreak: number // consecutive negative sentiment entries
}

export interface StaleContact {
  contactId: string
  firstName: string
  lastName: string | null
  phone: string | null
  lastMessageAt: Date | null
  daysInactive: number
  temperature: string
  leadScore: number
  totalMemories: number
  channel: string
}

// ═══════════════════════════════════════════════════════════════
// Query Functions
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// getFullContactMemory
// Returns a complete memory profile for a contact, including
// all memories, emotional state, behavioral patterns, episodes,
// and a generated summary string.
// ─────────────────────────────────────────────────────────

export async function getFullContactMemory(
  contactId: string,
  workspaceId: string,
): Promise<ContactMemoryProfile> {
  logInfo('MEMORY_QUERIES', 'getFullContactMemory', { contactId, workspaceId })

  try {
    const context = await MemoryManager.getContactContext(contactId, workspaceId)

    // Build a concise summary
    const memCount = context.memories.length
    const emotional = context.emotionalState
    const behavioral = context.behavioralPatterns

    let summary = ''
    if (context.contactInfo) {
      const name = `${context.contactInfo.firstName} ${context.contactInfo.lastName || ''}`.trim()
      summary = `Contacto: ${name}. `
    }
    summary += `${memCount} memorias registradas. `

    if (emotional) {
      summary += `Emocion: ${emotional.currentEmotion} (${emotional.recentTrend}). `
    }
    if (behavioral) {
      summary += `Engagement: ${behavioral.engagementScore}/100. `
    }
    if (context.leadProfile) {
      const lp = context.leadProfile
      summary += `Arquetipo: ${lp.archetype}. Temperatura: ${lp.temperature}. Score: ${lp.score}. `
    }

    // Append top critical memories
    const topMemories = context.memories
      .filter((m) => m.importance >= 7)
      .slice(0, 5)
      .map((m) => `${m.key}: ${m.value}`)
      .join('; ')

    if (topMemories) {
      summary += `Clave: ${topMemories}`
    }

    return {
      contactId,
      memories: context.memories,
      emotionalState: emotional,
      behavioralPatterns: behavioral,
      recentEpisodes: context.recentEpisodes,
      summary,
    }
  } catch (err) {
    logError('MEMORY_QUERIES', 'getFullContactMemory_error', err, { contactId })
    return {
      contactId,
      memories: [],
      emotionalState: null,
      behavioralPatterns: null,
      recentEpisodes: [],
      summary: 'Error al obtener memoria del contacto.',
    }
  }
}

// ─────────────────────────────────────────────────────────
// getQuickContext
// Returns a short context string optimized for AI prompt
// injection. Lightweight — fetches only what's needed.
// ─────────────────────────────────────────────────────────

export async function getQuickContext(
  contactId: string,
  workspaceId: string,
  conversationId?: string,
): Promise<string> {
  logInfo('MEMORY_QUERIES', 'getQuickContext', { contactId, workspaceId, conversationId })

  try {
    // Use conversation context if conversationId is provided
    if (conversationId) {
      const ctx = await MemoryManager.getConversationContext(conversationId)
      return ctx.formattedPrompt
    }

    // Otherwise build a quick contact context
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: {
        firstName: true,
        lastName: true,
        temperature: true,
        leadScore: true,
        lastMessageAt: true,
      },
    })

    if (!contact) {
      return 'Contacto no encontrado.'
    }

    // Get top 5 memories quickly
    const topMemories = await db.nexusMemory.findMany({
      where: {
        contactId,
        status: 'active',
      },
      orderBy: [{ importance: 'desc' }, { lastReinforcedAt: 'desc' }],
      take: 5,
      select: {
        key: true,
        value: true,
        category: true,
        importance: true,
      },
    })

    const name = `${contact.firstName} ${contact.lastName || ''}`.trim()
    const parts: string[] = [`Contacto: ${name}`]

    if (contact.temperature !== 'cold') {
      parts.push(`Temperatura: ${contact.temperature}`)
    }
    if (contact.leadScore > 0) {
      parts.push(`Score: ${contact.leadScore}/100`)
    }
    if (contact.lastMessageAt) {
      parts.push(`Ultimo mensaje: ${contact.lastMessageAt.toISOString().split('T')[0]}`)
    }

    if (topMemories.length > 0) {
      parts.push(
        'Memorias clave:\n' +
          topMemories.map((m) => `  - [${m.category}] ${m.key}: ${m.value}`).join('\n')
      )
    }

    return parts.join('\n')
  } catch (err) {
    logError('MEMORY_QUERIES', 'getQuickContext_error', err, { contactId })
    return 'Error al obtener contexto rapido.'
  }
}

// ─────────────────────────────────────────────────────────
// findSimilarContacts
// Finds contacts with similar memory patterns to the given
// contact. Useful for cross-referencing and pattern matching.
// ─────────────────────────────────────────────────────────

export async function findSimilarContacts(
  workspaceId: string,
  contactId: string,
  limit: number = 5,
): Promise<SimilarContactResult[]> {
  logInfo('MEMORY_QUERIES', 'findSimilarContacts', { workspaceId, contactId, limit })

  try {
    // Get the source contact's memory categories and tags
    const sourceMemories = await db.nexusMemory.findMany({
      where: {
        contactId,
        workspaceId,
        status: 'active',
      },
      select: {
        category: true,
        tags: true,
      },
    })

    if (sourceMemories.length === 0) {
      return []
    }

    // Build category frequency map for source contact
    const sourceCategories = new Map<string, number>()
    const sourceTags = new Set<string>()

    for (const mem of sourceMemories) {
      sourceCategories.set(mem.category, (sourceCategories.get(mem.category) || 0) + 1)
      try {
        const tags = JSON.parse(mem.tags) as string[]
        for (const tag of tags) {
          sourceTags.add(tag.toLowerCase())
        }
      } catch {
        // ignore malformed tags
      }
    }

    // Get all other contacts in workspace with memories
    const otherContactMemories = await db.nexusMemory.findMany({
      where: {
        workspaceId,
        status: 'active',
        contactId: { not: contactId },
      },
      select: {
        contactId: true,
        category: true,
        tags: true,
      },
    })

    if (otherContactMemories.length === 0) {
      return []
    }

    // Group by contact and compute similarity
    const contactScores = new Map<string, {
      categories: Map<string, number>
      tags: Set<string>
      totalCount: number
    }>()

    for (const mem of otherContactMemories) {
      const memContactId = mem.contactId
      if (!memContactId) continue
      if (!contactScores.has(memContactId)) {
        contactScores.set(memContactId, {
          categories: new Map(),
          tags: new Set(),
          totalCount: 0,
        })
      }
      const entry = contactScores.get(memContactId)!
      entry.categories.set(mem.category, (entry.categories.get(mem.category) || 0) + 1)
      entry.totalCount++
      try {
        const tags = JSON.parse(mem.tags) as string[]
        for (const tag of tags) {
          entry.tags.add(tag.toLowerCase())
        }
      } catch {
        // ignore
      }
    }

    // Compute Jaccard-like similarity for categories and tags
    const results: Array<{
      contactId: string
      score: number
      sharedCategories: string[]
      sharedTags: string[]
    }> = []

    for (const [cId, data] of contactScores) {
      // Category overlap
      const sourceCatKeys = new Set(sourceCategories.keys())
      const targetCatKeys = new Set(data.categories.keys())
      const sharedCatKeys = [...sourceCatKeys].filter((k) => targetCatKeys.has(k))
      const catUnion = new Set([...sourceCatKeys, ...targetCatKeys])
      const catSimilarity = catUnion.size > 0 ? sharedCatKeys.length / catUnion.size : 0

      // Tag overlap
      const sharedTagList = [...sourceTags].filter((t) => data.tags.has(t))
      const tagUnion = new Set([...sourceTags, ...data.tags])
      const tagSimilarity = tagUnion.size > 0 ? sharedTagList.length / tagUnion.size : 0

      // Weighted score (categories matter more than tags)
      const score = (catSimilarity * 0.7) + (tagSimilarity * 0.3)

      if (score > 0.1) { // only include meaningful similarities
        results.push({
          contactId: cId,
          score,
          sharedCategories: sharedCatKeys,
          sharedTags: sharedTagList.slice(0, 10),
        })
      }
    }

    // Sort by score and take top N
    results.sort((a, b) => b.score - a.score)
    const topResults = results.slice(0, limit)

    // Enrich with contact names
    if (topResults.length > 0) {
      const contacts = await db.contact.findMany({
        where: {
          id: { in: topResults.map((r) => r.contactId) },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      })

      const contactMap = new Map(contacts.map((c) => [c.id, c]))

      return topResults.map((r) => {
        const c = contactMap.get(r.contactId)
        return {
          contactId: r.contactId,
          firstName: c?.firstName || 'Desconocido',
          lastName: c?.lastName || null,
          similarityScore: Math.round(r.score * 100) / 100,
          sharedCategories: r.sharedCategories,
          sharedTags: r.sharedTags,
        }
      })
    }

    return []
  } catch (err) {
    logError('MEMORY_QUERIES', 'findSimilarContacts_error', err, { contactId })
    return []
  }
}

// ─────────────────────────────────────────────────────────
// getBuyingSignals
// Returns commercial memories relevant to sales: budget
// mentions, urgency signals, objections resolved, etc.
// ─────────────────────────────────────────────────────────

export async function getBuyingSignals(
  contactId: string,
  workspaceId: string,
): Promise<BuyingSignal[]> {
  logInfo('MEMORY_QUERIES', 'getBuyingSignals', { contactId, workspaceId })

  try {
    // Get commercial memories for this contact
    const commercialMemories = await db.nexusMemory.findMany({
      where: {
        contactId,
        workspaceId,
        status: 'active',
        category: {
          in: ['commercial', 'behavioral'],
        },
      },
      orderBy: [{ importance: 'desc' }, { lastReinforcedAt: 'desc' }],
      take: 30,
    })

    if (commercialMemories.length === 0) {
      return []
    }

    const signals: BuyingSignal[] = []
    const signalKeywords: Record<BuyingSignal['type'], string[]> = {
      budget_mentioned: ['presupuesto', 'budget', 'precio', 'precio maximo', 'cuanto cuesta', 'costo'],
      timeline_urgent: ['ya', 'ahora', 'urge', 'urges', 'necesito', 'rapido', 'inmediato', ' cuanto antes', 'esta semana', 'hoy'],
      objection_resolved: ['no objection', 'resuelto', 'conforme', 'ok', 'de acuerdo', 'suena bien', 'me convence'],
      product_interest: ['modelo', 'version', 'color', 'caracteristicas', 'especificaciones', 'tiene', 'quiere'],
      price_inquiry: ['precio', 'cuanto', 'costo', 'tarifa', 'plan', 'financiamiento', 'credito', 'meses', 'enganche'],
      comparison: ['otro', 'competencia', 'comparar', 'versus', 'diferencia', 'mejor', 'barato'],
      decision_maker: ['decido', 'yo decido', 'mi decision', 'soy el', 'jefe', 'dueno', 'gerente', 'direc'],
    }

    // Parse tags from JSON
    function parseTags(tagsStr: string): string[] {
      try {
        return JSON.parse(tagsStr) as string[]
      } catch {
        return []
      }
    }

    for (const mem of commercialMemories) {
      const valueLower = mem.value.toLowerCase()
      const keyLower = mem.key.toLowerCase()
      const tags = parseTags(mem.tags)
      const combinedText = `${keyLower} ${valueLower} ${tags.join(' ')}`

      for (const [signalType, keywords] of Object.entries(signalKeywords)) {
        const matched = keywords.some((kw) => combinedText.includes(kw))
        if (matched) {
          signals.push({
            id: mem.id,
            type: signalType as BuyingSignal['type'],
            description: mem.value,
            confidence: Math.min(mem.importance / 10, 1),
            source: `memory:${mem.key}`,
            detectedAt: mem.lastReinforcedAt,
          })
        }
      }
    }

    // Also check LeadProfile for explicit buying signals
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      include: { leadProfile: true },
    })

    if (contact?.leadProfile) {
      const lp = contact.leadProfile

      if (lp.budget) {
        signals.push({
          id: `lp_budget_${contactId}`,
          type: 'budget_mentioned',
          description: `Presupuesto detectado: ${lp.budget}`,
          confidence: 0.8,
          source: 'lead_profile:budget',
          detectedAt: lp.updatedAt || lp.createdAt,
        })
      }

      if (lp.timeline && ['now', 'ahora', 'urgent', 'urgente'].includes(lp.timeline.toLowerCase())) {
        signals.push({
          id: `lp_timeline_${contactId}`,
          type: 'timeline_urgent',
          description: `Timeline urgente: ${lp.timeline}`,
          confidence: 0.9,
          source: 'lead_profile:timeline',
          detectedAt: lp.updatedAt || lp.createdAt,
        })
      }

      if (lp.urgencyLevel === 'high' || lp.urgencyLevel === 'medium') {
        signals.push({
          id: `lp_urgency_${contactId}`,
          type: 'timeline_urgent',
          description: `Nivel de urgencia: ${lp.urgencyLevel}`,
          confidence: lp.urgencyLevel === 'high' ? 0.85 : 0.6,
          source: 'lead_profile:urgencyLevel',
          detectedAt: lp.updatedAt || lp.createdAt,
        })
      }

      if (lp.preferredProduct) {
        signals.push({
          id: `lp_product_${contactId}`,
          type: 'product_interest',
          description: `Producto de interes: ${lp.preferredProduct}`,
          confidence: 0.75,
          source: 'lead_profile:preferredProduct',
          detectedAt: lp.updatedAt || lp.createdAt,
        })
      }
    }

    // Deduplicate by type, keep highest confidence
    const byType = new Map<string, BuyingSignal>()
    for (const signal of signals) {
      const existing = byType.get(signal.type)
      if (!existing || signal.confidence > existing.confidence) {
        byType.set(signal.type, signal)
      }
    }

    // Sort by confidence descending
    return [...byType.values()].sort((a, b) => b.confidence - a.confidence)
  } catch (err) {
    logError('MEMORY_QUERIES', 'getBuyingSignals_error', err, { contactId })
    return []
  }
}

// ─────────────────────────────────────────────────────────
// getEmotionalAlerts
// Returns contacts with negative emotional trends within
// a workspace. Useful for proactive follow-up triggers.
// ─────────────────────────────────────────────────────────

export async function getEmotionalAlerts(
  workspaceId: string,
): Promise<EmotionalAlert[]> {
  logInfo('MEMORY_QUERIES', 'getEmotionalAlerts', { workspaceId })

  try {
    // Find contacts that have emotional data with negative trends
    // We query contacts with recent interactions that have emotional readings
    const recentThreshold = new Date()
    recentThreshold.setDate(recentThreshold.getDate() - 7) // last 7 days

    // Get contacts that have had messages in the last 7 days
    const activeContacts = await db.contact.findMany({
      where: {
        workspaceId,
        status: 'active',
        lastMessageAt: { gte: recentThreshold },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lastMessageAt: true,
        temperature: true,
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (activeContacts.length === 0) {
      return []
    }

    const alerts: EmotionalAlert[] = []

    for (const contact of activeContacts) {
      try {
        // Get emotional snapshot
        const { EmotionalStore } = await import('./emotional-store')
        const state = await EmotionalStore.getCurrentEmotionalState(contact.id)

        if (state.dominantEmotion === 'neutral' && state.emotionDistribution && Object.keys(state.emotionDistribution).length === 0) continue

        // Build emotion history from recent records
        const recentRecords = await EmotionalStore.getContactEmotionalTimeline(contact.id, { limit: 20 })
        const emotionHistory = recentRecords.map((r) => ({
          emotion: r.emotion,
          valence: r.valence,
          recordedAt: r.detectedAt,
        }))

        // Check for negative conditions
        const isNegative = state.averageValence < -0.3
        const isDeclining = state.trendDirection === 'declining'

        // Count negative streak (consecutive negative entries in history)
        let negativeStreak = 0
        for (let i = emotionHistory.length - 1; i >= 0; i--) {
          if (emotionHistory[i].valence < -0.2) {
            negativeStreak++
          } else {
            break
          }
        }

        // Determine severity
        let severity: EmotionalAlert['severity'] = 'low'
        let trend: EmotionalAlert['trend'] = 'stable_negative'

        if (isDeclining && negativeStreak >= 3) {
          severity = 'high'
          trend = 'declining'
        } else if (isDeclining || negativeStreak >= 2) {
          severity = 'medium'
          trend = 'declining'
        } else if (isNegative) {
          severity = 'low'
          trend = 'stable_negative'
        }

        // Check for volatile emotions (frequent changes)
        if (emotionHistory.length >= 4) {
          const recent4 = emotionHistory.slice(-4)
          const emotions = recent4.map((e) => e.emotion)
          const uniqueEmotions = new Set(emotions)
          if (uniqueEmotions.size >= 4) {
            severity = Math.max(
              severity === 'low' ? 1 : severity === 'medium' ? 2 : 3,
              2,
            ) as unknown as EmotionalAlert['severity']
            trend = 'volatile'
          }
        }

        if (severity !== 'low' || isNegative) {
          alerts.push({
            contactId: contact.id,
            contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(),
            currentEmotion: state.dominantEmotion,
            currentValence: state.averageValence,
            trend,
            severity,
            lastInteraction: contact.lastMessageAt,
            negativeStreak,
          })
        }
      } catch {
        // Skip this contact on error
        continue
      }
    }

    // Sort by severity (high first)
    const severityOrder = { high: 3, medium: 2, low: 1 }
    alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])

    return alerts
  } catch (err) {
    logError('MEMORY_QUERIES', 'getEmotionalAlerts_error', err, { workspaceId })
    return []
  }
}

// ─────────────────────────────────────────────────────────
// getStaleContacts
// Returns contacts with no recent interactions that may
// need re-engagement. Configurable by days inactive.
// ─────────────────────────────────────────────────────────

export async function getStaleContacts(
  workspaceId: string,
  daysInactive: number = 7,
): Promise<StaleContact[]> {
  logInfo('MEMORY_QUERIES', 'getStaleContacts', { workspaceId, daysInactive })

  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysInactive)

    // Find contacts that have NOT had messages since cutoff
    // but have had messages before (they're real contacts, not just created)
    const staleContacts = await db.contact.findMany({
      where: {
        workspaceId,
        status: 'active',
        OR: [
          { lastMessageAt: { lt: cutoff } },
          { lastMessageAt: null },
        ],
        conversations: {
          some: {
            workspaceId,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        lastMessageAt: true,
        temperature: true,
        leadScore: true,
        conversations: {
          select: { channel: true },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'asc' }, // least recently active first
    })

    if (staleContacts.length === 0) {
      return []
    }

    // Get memory counts for each contact
    const contactIds = staleContacts.map((c) => c.id)
    const memoryCounts = await db.nexusMemory.groupBy({
      by: ['contactId'],
      where: {
        contactId: { in: contactIds },
        status: 'active',
      },
      _count: { id: true },
    })

    const memoryCountMap = new Map(
      memoryCounts.map((mc) => [mc.contactId, mc._count.id])
    )

    const now = Date.now()

    return staleContacts.map((contact) => {
      const lastMsg = contact.lastMessageAt
      const daysInactiveCalc = lastMsg
        ? Math.floor((now - lastMsg.getTime()) / 86_400_000)
        : daysInactive

      return {
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        lastMessageAt: lastMsg,
        daysInactive: daysInactiveCalc,
        temperature: contact.temperature,
        leadScore: contact.leadScore,
        totalMemories: Number(memoryCountMap.get(contact.id) || 0),
        channel: contact.conversations[0]?.channel || 'unknown',
      }
    })
  } catch (err) {
    logError('MEMORY_QUERIES', 'getStaleContacts_error', err, { workspaceId, daysInactive })
    return []
  }
}

// ─── Default Export ─────────────────────────────────────────

export default {
  getFullContactMemory,
  getQuickContext,
  findSimilarContacts,
  getBuyingSignals,
  getEmotionalAlerts,
  getStaleContacts,
}
