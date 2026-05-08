// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0.0 — Memory Manager
// Central orchestrator for the multi-layer memory system
// Coordinates: Semantic, Episodic, Emotional, Behavioral, Working
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logError, logOk, logWarn } from '@/lib/logger'
import { eventBus, EVENT_TYPES } from '@/lib/event-bus'

import { SemanticStore, type MemoryResult } from './semantic-store'
import { EpisodicStore, type EpisodeRecord } from './episodic-store'
import { EmotionalStore, type EmotionalState, type EmotionRecord } from './emotional-store'
import { BehavioralStore } from './behavioral-store'
import { WorkingMemory } from './working-memory'

// ─── Types ──────────────────────────────────────────────────

export interface ProcessMessageInput {
  workspaceId: string
  contactId?: string
  conversationId: string
  message: string
  direction: 'inbound' | 'outbound'
  senderType: 'contact' | 'agent' | 'human' | 'system'
  messageId?: string
  channel?: string
}

export interface ProcessMessageResult {
  storedMemories: number
  episodeId: string | null
  emotion: EmotionResult | null
  behavioralUpdate: boolean
  workingMemoryKey: string | null
  errors: string[]
}

export interface EmotionResult {
  emotion: string
  confidence: number
  valence: number // -1 (negative) to +1 (positive)
}

export interface ContactContext {
  contactId: string
  workspaceId: string
  memories: Array<{
    id: string
    key: string
    value: string
    category: string
    importance: number
    updatedAt: Date
  }>
  emotionalState: EmotionalSnapshot | null
  behavioralPatterns: BehavioralSnapshot | null
  recentEpisodes: EpisodeSummary[]
  leadProfile: LeadProfileSnapshot | null
  contactInfo: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
    temperature: string
    leadScore: number
    lastMessageAt: Date | null
    source: string
  } | null
}

export interface EmotionalSnapshot {
  currentEmotion: string
  currentValence: number
  recentTrend: 'improving' | 'stable' | 'declining'
  emotionHistory: Array<{ emotion: string; valence: number; recordedAt: Date }>
  dominantEmotions: Array<{ emotion: string; count: number }>
}

export interface BehavioralSnapshot {
  avgResponseTimeMs: number
  messageFrequency: number // messages per day (last 7 days)
  preferredChannel: string
  communicationStyle: string
  engagementScore: number // 0-100
  totalInteractions: number
  lastActiveAt: Date | null
}

export interface EpisodeSummary {
  id: string
  type: string
  summary: string
  timestamp: Date
  metadata: Record<string, unknown>
}

export interface LeadProfileSnapshot {
  archetype: string
  archetypeConfidence: number
  temperature: string
  score: number
  budget: string | null
  preferredProduct: string | null
  mainObjection: string | null
  timeline: string | null
  buyingMotivation: string | null
  priceSensitivity: string
  urgencyLevel: string
}

export interface ConversationContext {
  conversationId: string
  contactId: string | null
  workspaceId: string
  workingMemory: Record<string, unknown> | null
  relevantMemories: Array<{
    id: string
    key: string
    value: string
    category: string
    relevanceScore: number
  }>
  emotionalState: EmotionalSnapshot | null
  recentEpisodes: EpisodeSummary[]
  formattedPrompt: string
}

export interface MemorySearchOptions {
  categories?: string[]
  minImportance?: number
  limit?: number
  contactId?: string
  includeArchived?: boolean
}

export interface MemorySearchResult {
  semantic: Array<{
    id: string
    key: string
    value: string
    category: string
    importance: number
    relevanceScore: number
  }>
  episodes: EpisodeSummary[]
  emotional: EmotionalSnapshot | null
  totalCount: number
  categories: Record<string, number>
}

export interface ContactProfileResult {
  contactId: string
  profile: string
  memories: Array<{ key: string; value: string; category: string; importance: number }>
  emotionalSummary: string
  behavioralSummary: string
  totalMemories: number
  categoryBreakdown: Record<string, number>
  generatedAt: Date
}

// ═══════════════════════════════════════════════════════════════
// MemoryManager — Central Orchestrator
// ═══════════════════════════════════════════════════════════════

export class MemoryManager {
  private static TAG = 'MEMORY_MANAGER'

  // ─────────────────────────────────────────────────────────
  // 1. PROCESS MESSAGE
  // The main entry point: processes an incoming/outgoing message
  // through all memory layers in parallel where possible.
  // ─────────────────────────────────────────────────────────

  static async processMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
    const timerStart = Date.now()
    const errors: string[] = []
    let storedMemories = 0
    let episodeId: string | null = null
    let emotion: EmotionResult | null = null
    let behavioralUpdate = false
    let workingMemoryKey: string | null = null

    const {
      workspaceId,
      contactId,
      conversationId,
      message,
      direction,
      senderType,
      messageId,
      channel,
    } = input

    logInfo(MemoryManager.TAG, 'processMessage_start', {
      workspaceId,
      contactId,
      conversationId,
      direction,
      channel,
    })

    try {
      // ── Step A: Store content to SemanticStore ──
      // Only extract semantic memories from contact inbound messages
      // to avoid noise from our own responses
      if (direction === 'inbound' && contactId && message.trim().length > 0) {
        try {
          await SemanticStore.store(workspaceId, message, 'conversation', {
            contactId,
            source: 'chat',
            importance: 0.5,
          })
          storedMemories = 1
          logOk(MemoryManager.TAG, 'semantic_stored', { contactId, count: 1 })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`semantic: ${msg}`)
          logError(MemoryManager.TAG, 'semantic_store_error', err, { contactId })
        }
      }

      // ── Step B: Record episode in EpisodicStore ──
      try {
        episodeId = await EpisodicStore.recordEpisode(workspaceId, {
          conversationId,
          contactId,
          type: 'message',
          summary: message.slice(0, 200),
          content: message.slice(0, 500),
          metadata: {
            direction,
            senderType,
            channel: channel || 'unknown',
            ...(messageId ? { messageId } : {}),
          },
          occurredAt: new Date(),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`episodic: ${msg}`)
        logError(MemoryManager.TAG, 'episodic_record_error', err, { conversationId })
      }

      // ── Step C & D: Detect emotion + update behavior (parallel) ──
      const emotionPromise = (async (): Promise<EmotionResult | null> => {
        if (!contactId || direction !== 'inbound' || message.trim().length === 0) return null
        try {
          // Detect emotion from text via AI
          const detection = await EmotionalStore.detectEmotionFromText(message)

          if (detection.confidence > 0.2) {
            // Record the emotion
            await EmotionalStore.recordEmotion(workspaceId, {
              contactId,
              conversationId,
              emotion: detection.emotion,
              intensity: detection.intensity,
              valence: detection.valence,
              context: message.slice(0, 300),
              detectedAt: new Date(),
            })

            return {
              emotion: detection.emotion,
              confidence: detection.confidence,
              valence: detection.valence,
            }
          }

          return null
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`emotional: ${msg}`)
          logError(MemoryManager.TAG, 'emotion_detection_error', err, { contactId })
          return null
        }
      })()

      const behavioralPromise = (async (): Promise<boolean> => {
        if (!contactId) return false
        try {
          // Run full pattern detection which updates patterns asynchronously
          await BehavioralStore.detectPatterns(workspaceId, contactId)
          return true
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`behavioral: ${msg}`)
          logError(MemoryManager.TAG, 'behavioral_update_error', err, { contactId })
          return false
        }
      })()

      // Wait for both parallel tasks
      const [emotionResult, behaviorResult] = await Promise.all([
        emotionPromise,
        behavioralPromise,
      ])

      emotion = emotionResult
      behavioralUpdate = behaviorResult

      // ── Step E: Update WorkingMemory ──
      try {
        WorkingMemory.setContext(
          conversationId,
          'last_message',
          {
            content: message.slice(0, 200),
            direction,
            senderType,
            timestamp: new Date().toISOString(),
          },
          3600 * 1000, // expire in 1 hour (in ms)
        )
        workingMemoryKey = 'last_message'
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`working_memory: ${msg}`)
        logError(MemoryManager.TAG, 'working_memory_error', err, { conversationId })
      }

      // ── Step F: Emit events to eventBus ──
      if (emotion && emotion.confidence > 0.3) {
        try {
          await eventBus.emit(EVENT_TYPES.EMOTION_DETECTED, {
            contactId,
            conversationId,
            emotion: emotion.emotion,
            confidence: emotion.confidence,
            messageId,
          }, 'memory_manager')
        } catch {
          // Event bus errors are non-critical
        }
      }

      if (storedMemories > 0 && contactId) {
        try {
          await eventBus.emit(EVENT_TYPES.MEMORY_STORED, {
            memoryId: `mem_${Date.now()}`,
            contactId,
            key: 'extracted_memories',
            source: 'conversation',
          }, 'memory_manager')
        } catch {
          // Event bus errors are non-critical
        }
      }

      const latencyMs = Date.now() - timerStart

      logOk(MemoryManager.TAG, 'processMessage_complete', {
        workspaceId,
        contactId,
        conversationId,
        storedMemories,
        episodeId,
        emotion: emotion?.emotion || null,
        behavioralUpdate,
        errors: errors.length,
        latencyMs,
      })

      return {
        storedMemories,
        episodeId,
        emotion,
        behavioralUpdate,
        workingMemoryKey,
        errors,
      }
    } catch (err) {
      const latencyMs = Date.now() - timerStart
      logError(MemoryManager.TAG, 'processMessage_fatal', err, {
        workspaceId,
        contactId,
        conversationId,
        latencyMs,
      })
      return {
        storedMemories,
        episodeId,
        emotion,
        behavioralUpdate,
        workingMemoryKey,
        errors: [err instanceof Error ? err.message : String(err), ...errors],
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET CONTACT CONTEXT
  // Returns everything known about a contact — used by AI
  // agents to build comprehensive context.
  // ─────────────────────────────────────────────────────────

  static async getContactContext(
    contactId: string,
    workspaceId: string,
    conversationId?: string,
  ): Promise<ContactContext> {
    logInfo(MemoryManager.TAG, 'getContactContext', { contactId, workspaceId })

    try {
      // Fetch contact info from CRM
      const contact = await db.contact.findUnique({
        where: { id: contactId },
        include: { leadProfile: true },
      })

      // ── A: Get recent semantic memories ──
      // SemanticStore.searchByContact returns MemoryResult[] from pgvector
      let memories: ContactContext['memories'] = []
      try {
        const searchResults = await SemanticStore.searchByContact(
          contactId,
          `${contactId} context`,
          30,
        )
        memories = searchResults.map((r) => ({
          id: r.id,
          key: r.content.slice(0, 50), // use content as key since SemanticStore uses raw content
          value: r.content,
          category: r.category,
          importance: r.importance,
          updatedAt: r.updatedAt,
        }))
      } catch (err) {
        logError(MemoryManager.TAG, 'getContactContext_semantic', err, { contactId })
      }

      // ── B: Get current emotional state ──
      // Build EmotionalSnapshot from EmotionalStore.getCurrentEmotionalState + timeline
      let emotionalState: EmotionalSnapshot | null = null
      try {
        const state = await EmotionalStore.getCurrentEmotionalState(contactId)
        const recentRecords = await EmotionalStore.getContactEmotionalTimeline(contactId, {
          limit: 20,
        })

        // Build emotion history from records
        const emotionHistory = recentRecords.map((r) => ({
          emotion: r.emotion,
          valence: r.valence,
          recordedAt: r.detectedAt,
        }))

        // Build dominant emotions list from the EmotionalState distribution
        const dominantEmotions = Object.entries(state.emotionDistribution)
          .map(([emotion, percentage]) => ({
            emotion,
            count: percentage, // percentage as "count" proxy
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)

        emotionalState = {
          currentEmotion: state.dominantEmotion,
          currentValence: state.averageValence,
          recentTrend: state.trendDirection,
          emotionHistory,
          dominantEmotions,
        }
      } catch (err) {
        logError(MemoryManager.TAG, 'getContactContext_emotional', err, { contactId })
      }

      // ── C: Get behavioral patterns ──
      // Build BehavioralSnapshot from BehavioralStore.detectPatterns + getPatterns
      let behavioralPatterns: BehavioralSnapshot | null = null
      try {
        const detected = await BehavioralStore.detectPatterns(workspaceId, contactId)

        // Get the response time pattern
        const responseTimePattern = detected.patterns.find(
          (p) => p.patternType === 'response_time'
        )
        const engagementPattern = detected.patterns.find(
          (p) => p.patternType === 'engagement_level'
        )
        const stylePattern = detected.patterns.find(
          (p) => p.patternType === 'communication_style'
        )
        const channelPattern = detected.patterns.find(
          (p) => p.patternType === 'preferred_channel'
        )

        behavioralPatterns = {
          avgResponseTimeMs: (responseTimePattern?.patternValue as Record<string, number>)?.averageMs ?? 0,
          messageFrequency: (engagementPattern?.patternValue as Record<string, number>)?.messageFrequency ?? 0,
          preferredChannel: (channelPattern?.patternValue as Record<string, string>)?.channel ??
            (channelPattern?.patternValue as Record<string, string>)?.preferredChannel ?? 'unknown',
          communicationStyle: (stylePattern?.patternValue as Record<string, string>)?.style ?? 'unknown',
          engagementScore: (engagementPattern?.patternValue as Record<string, number>)?.overallScore ?? 0,
          totalInteractions: (engagementPattern?.sampleSize ?? 0) + (responseTimePattern?.sampleSize ?? 0),
          lastActiveAt: new Date(), // Updated from detectPatterns.analyzedAt
        }
      } catch (err) {
        logError(MemoryManager.TAG, 'getContactContext_behavioral', err, { contactId })
      }

      // ── D: Get recent episodes ──
      let recentEpisodes: EpisodeSummary[] = []
      try {
        // Use getContactTimeline from EpisodicStore
        const episodeRecords = await EpisodicStore.getContactTimeline(contactId, {
          limit: 20,
        })
        recentEpisodes = episodeRecords.map(toEpisodeSummary)
      } catch (err) {
        logError(MemoryManager.TAG, 'getContactContext_episodic', err, { contactId })
      }

      // ── E: Build lead profile snapshot ──
      let leadProfile: LeadProfileSnapshot | null = null
      if (contact?.leadProfile) {
        const lp = contact.leadProfile
        leadProfile = {
          archetype: lp.archetype,
          archetypeConfidence: lp.archetypeConfidence,
          temperature: lp.temperature,
          score: lp.score,
          budget: lp.budget,
          preferredProduct: lp.preferredProduct,
          mainObjection: lp.mainObjection,
          timeline: lp.timeline,
          buyingMotivation: lp.buyingMotivation,
          priceSensitivity: lp.priceSensitivity,
          urgencyLevel: lp.urgencyLevel,
        }
      }

      // ── F: Contact info ──
      const contactInfo = contact
        ? {
            firstName: contact.firstName,
            lastName: contact.lastName,
            phone: contact.phone,
            email: contact.email,
            temperature: contact.temperature,
            leadScore: contact.leadScore,
            lastMessageAt: contact.lastMessageAt,
            source: contact.source,
          }
        : null

      return {
        contactId,
        workspaceId,
        memories,
        emotionalState,
        behavioralPatterns,
        recentEpisodes,
        leadProfile,
        contactInfo,
      }
    } catch (err) {
      logError(MemoryManager.TAG, 'getContactContext_fatal', err, { contactId, workspaceId })
      // Return empty context rather than throwing
      return {
        contactId,
        workspaceId,
        memories: [],
        emotionalState: null,
        behavioralPatterns: null,
        recentEpisodes: [],
        leadProfile: null,
        contactInfo: null,
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. GET CONVERSATION CONTEXT
  // Returns working memory + recent episodes + relevant
  // semantic memories. Used by AI to respond to current
  // conversation. Includes a formatted prompt string.
  // ─────────────────────────────────────────────────────────

  static async getConversationContext(
    conversationId: string,
  ): Promise<ConversationContext> {
    logInfo(MemoryManager.TAG, 'getConversationContext', { conversationId })

    try {
      // Fetch conversation to get contactId and workspaceId
      const conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        select: {
          contactId: true,
          workspaceId: true,
          channel: true,
          lastMessagePreview: true,
        },
      })

      if (!conversation) {
        logWarn(MemoryManager.TAG, 'conversation_not_found', { conversationId })
        return {
          conversationId,
          contactId: null,
          workspaceId: 'unknown',
          workingMemory: null,
          relevantMemories: [],
          emotionalState: null,
          recentEpisodes: [],
          formattedPrompt: '',
        }
      }

      const { contactId, workspaceId } = conversation

      // ── A: Get working memory context ──
      let workingMemory: Record<string, unknown> | null = null
      try {
        workingMemory = await WorkingMemory.getAllContext(conversationId)
      } catch (err) {
        logError(MemoryManager.TAG, 'convContext_workingMemory', err, { conversationId })
      }

      // ── B: Get relevant semantic memories ──
      let relevantMemories: ConversationContext['relevantMemories'] = []
      try {
        // Build a context query from the last message preview
        const contextQuery = conversation.lastMessagePreview || 'context'
        if (contactId) {
          const searchResults = await SemanticStore.searchByContact(
            contactId,
            contextQuery,
            15,
          )
          relevantMemories = searchResults.map((r) => ({
            id: r.id,
            key: r.content.slice(0, 50),
            value: r.content,
            category: r.category,
            relevanceScore: r.similarity,
          }))
        }
      } catch (err) {
        logError(MemoryManager.TAG, 'convContext_semantic', err, { conversationId })
      }

      // ── C: Get current emotional state ──
      let emotionalState: EmotionalSnapshot | null = null
      try {
        if (contactId) {
          const state = await EmotionalStore.getCurrentEmotionalState(contactId)
          const recentRecords = await EmotionalStore.getContactEmotionalTimeline(contactId, {
            limit: 10,
          })

          const emotionHistory = recentRecords.map((r) => ({
            emotion: r.emotion,
            valence: r.valence,
            recordedAt: r.detectedAt,
          }))

          const dominantEmotions = Object.entries(state.emotionDistribution)
            .map(([emotion, percentage]) => ({
              emotion,
              count: percentage,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)

          emotionalState = {
            currentEmotion: state.dominantEmotion,
            currentValence: state.averageValence,
            recentTrend: state.trendDirection,
            emotionHistory,
            dominantEmotions,
          }
        }
      } catch (err) {
        logError(MemoryManager.TAG, 'convContext_emotional', err, { conversationId })
      }

      // ── D: Get recent episodes for this conversation ──
      let recentEpisodes: EpisodeSummary[] = []
      try {
        const episodeRecords = await EpisodicStore.getConversationTimeline(conversationId, 10)
        recentEpisodes = episodeRecords.map(toEpisodeSummary)
      } catch (err) {
        logError(MemoryManager.TAG, 'convContext_episodic', err, { conversationId })
      }

      // ── E: Build formatted prompt for AI ──
      const formattedPrompt = MemoryManager.formatContextPrompt({
        contactId,
        workingMemory,
        relevantMemories,
        emotionalState,
        recentEpisodes,
      })

      return {
        conversationId,
        contactId,
        workspaceId,
        workingMemory,
        relevantMemories,
        emotionalState,
        recentEpisodes,
        formattedPrompt,
      }
    } catch (err) {
      logError(MemoryManager.TAG, 'getConversationContext_fatal', err, { conversationId })
      return {
        conversationId,
        contactId: null,
        workspaceId: 'unknown',
        workingMemory: null,
        relevantMemories: [],
        emotionalState: null,
        recentEpisodes: [],
        formattedPrompt: '',
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. SEARCH
  // Unified search across all memory stores
  // ─────────────────────────────────────────────────────────

  static async search(
    workspaceId: string,
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchResult> {
    logInfo(MemoryManager.TAG, 'search', { workspaceId, query, options })

    const {
      categories,
      minImportance,
      limit = 20,
      contactId,
    } = options

    try {
      // ── Search SemanticStore ──
      let semanticResults: MemorySearchResult['semantic'] = []
      try {
        // SemanticStore.search takes (workspaceId, query, limit?, filters?)
        // Map our categories/minImportance to SearchFilters
        const filters = {
          contactId: contactId || undefined,
          minImportance: minImportance !== undefined ? minImportance : undefined,
          category: categories && categories.length === 1 ? (categories[0] as 'conversation' | 'document' | 'preference' | 'fact' | 'instruction' | 'context') : undefined,
        }

        const rawResults = await SemanticStore.search(workspaceId, query, limit, filters)
        semanticResults = rawResults.map((r) => ({
          id: r.id,
          key: r.content.slice(0, 50),
          value: r.content,
          category: r.category,
          importance: r.importance,
          relevanceScore: r.similarity,
        }))
      } catch (err) {
        logError(MemoryManager.TAG, 'search_semantic', err, { workspaceId, query })
      }

      // ── Search EpisodicStore ──
      let episodes: EpisodeSummary[] = []
      try {
        const episodeRecords = await EpisodicStore.searchEpisodes(workspaceId, query, {
          limit: Math.min(limit, 10),
          contactId: contactId || undefined,
        })
        episodes = episodeRecords.map(toEpisodeSummary)
      } catch (err) {
        logError(MemoryManager.TAG, 'search_episodic', err, { workspaceId, query })
      }

      // ── Get emotional context for contact if specified ──
      let emotional: EmotionalSnapshot | null = null
      if (contactId) {
        try {
          const state = await EmotionalStore.getCurrentEmotionalState(contactId)
          const recentRecords = await EmotionalStore.getContactEmotionalTimeline(contactId, {
            limit: 10,
          })
          const emotionHistory = recentRecords.map((r) => ({
            emotion: r.emotion,
            valence: r.valence,
            recordedAt: r.detectedAt,
          }))
          const dominantEmotions = Object.entries(state.emotionDistribution)
            .map(([emotion, percentage]) => ({ emotion, count: percentage }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)

          emotional = {
            currentEmotion: state.dominantEmotion,
            currentValence: state.averageValence,
            recentTrend: state.trendDirection,
            emotionHistory,
            dominantEmotions,
          }
        } catch (err) {
          logError(MemoryManager.TAG, 'search_emotional', err, { contactId })
        }
      }

      // ── Build category breakdown ──
      const categoriesMap: Record<string, number> = {}
      for (const mem of semanticResults) {
        categoriesMap[mem.category] = (categoriesMap[mem.category] || 0) + 1
      }

      return {
        semantic: semanticResults,
        episodes,
        emotional,
        totalCount: semanticResults.length + episodes.length,
        categories: categoriesMap,
      }
    } catch (err) {
      logError(MemoryManager.TAG, 'search_fatal', err, { workspaceId, query })
      return {
        semantic: [],
        episodes: [],
        emotional: null,
        totalCount: 0,
        categories: {},
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. GET CONTACT PROFILE
  // AI-generated comprehensive profile of a contact
  // ─────────────────────────────────────────────────────────

  static async getContactProfile(
    contactId: string,
    workspaceId: string,
  ): Promise<ContactProfileResult> {
    logInfo(MemoryManager.TAG, 'getContactProfile', { contactId, workspaceId })

    try {
      // Gather all context data
      const context = await MemoryManager.getContactContext(contactId, workspaceId)

      if (context.memories.length === 0) {
        return {
          contactId,
          profile: 'Sin informacion registrada sobre este contacto.',
          memories: [],
          emotionalSummary: 'Sin datos emocionales.',
          behavioralSummary: 'Sin datos de comportamiento.',
          totalMemories: 0,
          categoryBreakdown: {},
          generatedAt: new Date(),
        }
      }

      // Build category breakdown
      const categoryBreakdown: Record<string, number> = {}
      for (const mem of context.memories) {
        categoryBreakdown[mem.category] = (categoryBreakdown[mem.category] || 0) + 1
      }

      // Build the memories list for the profile
      const memories = context.memories.map((m) => ({
        key: m.key,
        value: m.value,
        category: m.category,
        importance: m.importance,
      }))

      // Build emotional summary
      let emotionalSummary = 'Sin datos emocionales.'
      if (context.emotionalState) {
        const es = context.emotionalState
        const topEmotions = es.dominantEmotions
          .slice(0, 3)
          .map((e) => `${e.emotion} (${e.count}x)`)
          .join(', ')
        emotionalSummary = `Estado actual: ${es.currentEmotion} (valencia: ${es.currentValence.toFixed(2)}). `
          + `Tendencia: ${es.recentTrend}. `
          + `Emociones dominantes: ${topEmotions || 'sin datos'}.`
      }

      // Build behavioral summary
      let behavioralSummary = 'Sin datos de comportamiento.'
      if (context.behavioralPatterns) {
        const bp = context.behavioralPatterns
        const avgResponseMin = Math.round(bp.avgResponseTimeMs / 60_000)
        behavioralSummary = `Frecuencia: ${bp.messageFrequency.toFixed(1)} msgs/dia. `
          + `Tiempo respuesta promedio: ${avgResponseMin} min. `
          + `Canal preferido: ${bp.preferredChannel}. `
          + `Estilo: ${bp.communicationStyle}. `
          + `Engagement: ${bp.engagementScore}/100. `
          + `Total interacciones: ${bp.totalInteractions}.`
      }

      // Build structured profile text
      const contactName = context.contactInfo
        ? `${context.contactInfo.firstName} ${context.contactInfo.lastName || ''}`.trim()
        : 'Contacto desconocido'

      const contactBasic = context.contactInfo
        ? [
            context.contactInfo.temperature !== 'cold'
              ? `Temperatura: ${context.contactInfo.temperature}`
              : null,
            context.contactInfo.leadScore > 0
              ? `Lead Score: ${context.contactInfo.leadScore}/100`
              : null,
            context.contactInfo.source !== 'whatsapp'
              ? `Origen: ${context.contactInfo.source}`
              : null,
          ]
            .filter(Boolean)
            .join('. ')
        : ''

      // Categorize memories by importance
      const criticalMemories = memories
        .filter((m) => m.importance >= 0.8)
        .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
        .join('\n')
      const importantMemories = memories
        .filter((m) => m.importance >= 0.5 && m.importance < 0.8)
        .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
        .join('\n')

      let profile = `## Perfil de ${contactName}\n\n`
      if (contactBasic) profile += `**Datos CRM:** ${contactBasic}\n\n`

      if (context.leadProfile) {
        const lp = context.leadProfile
        profile += `**Arquetipo:** ${lp.archetype} (${(lp.archetypeConfidence * 100).toFixed(0)}% confianza)\n`
        if (lp.budget) profile += `**Presupuesto:** ${lp.budget}\n`
        if (lp.preferredProduct) profile += `**Producto de interes:** ${lp.preferredProduct}\n`
        if (lp.mainObjection) profile += `**Objecion principal:** ${lp.mainObjection}\n`
        if (lp.timeline) profile += `**Timeline:** ${lp.timeline}\n`
        if (lp.buyingMotivation) profile += `**Motivacion de compra:** ${lp.buyingMotivation}\n`
        profile += '\n'
      }

      if (criticalMemories) {
        profile += `**Memorias criticas (importancia 0.8+):**\n${criticalMemories}\n\n`
      }
      if (importantMemories) {
        profile += `**Memorias importantes (0.5-0.8):**\n${importantMemories}\n\n`
      }

      profile += `**Resumen emocional:** ${emotionalSummary}\n\n`
      profile += `**Resumen de comportamiento:** ${behavioralSummary}\n`

      // Add recent episode context
      if (context.recentEpisodes.length > 0) {
        const recentEp = context.recentEpisodes.slice(0, 5)
        profile += `\n**Actividad reciente:**\n`
        for (const ep of recentEp) {
          const timeAgo = getTimeAgo(ep.timestamp)
          profile += `- [${ep.type}] ${ep.summary} (${timeAgo})\n`
        }
      }

      return {
        contactId,
        profile,
        memories,
        emotionalSummary,
        behavioralSummary,
        totalMemories: memories.length,
        categoryBreakdown,
        generatedAt: new Date(),
      }
    } catch (err) {
      logError(MemoryManager.TAG, 'getContactProfile_fatal', err, { contactId })
      return {
        contactId,
        profile: 'Error al generar el perfil del contacto.',
        memories: [],
        emotionalSummary: 'Error al obtener datos emocionales.',
        behavioralSummary: 'Error al obtener datos de comportamiento.',
        totalMemories: 0,
        categoryBreakdown: {},
        generatedAt: new Date(),
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Format context for AI prompt injection
  // ─────────────────────────────────────────────────────────

  private static formatContextPrompt(params: {
    contactId: string | null
    workingMemory: Record<string, unknown> | null
    relevantMemories: ConversationContext['relevantMemories']
    emotionalState: EmotionalSnapshot | null
    recentEpisodes: EpisodeSummary[]
  }): string {
    const { contactId, workingMemory, relevantMemories, emotionalState, recentEpisodes } = params
    const sections: string[] = []

    // Working memory (most recent context)
    if (workingMemory && Object.keys(workingMemory).length > 0) {
      sections.push(
        `[CONTEXTO ACTUAL]\n${JSON.stringify(workingMemory, null, 2).slice(0, 500)}`
      )
    }

    // Relevant semantic memories
    if (relevantMemories.length > 0) {
      const memLines = relevantMemories
        .slice(0, 10)
        .map((m) => `  - [${m.category}] (${m.relevanceScore.toFixed(2)}) ${m.key}: ${m.value}`)
        .join('\n')
      sections.push(`[MEMORIAS RELEVANTES DEL CONTACTO]\n${memLines}`)
    }

    // Emotional state
    if (emotionalState) {
      const trendLabel = {
        improving: 'mejorando',
        stable: 'estable',
        declining: 'empeorando',
      }[emotionalState.recentTrend]

      sections.push(
        `[ESTADO EMOCIONAL]\n` +
        `  Emocion actual: ${emotionalState.currentEmotion} (valencia: ${emotionalState.currentValence.toFixed(2)})\n` +
        `  Tendencia: ${trendLabel}`
      )
    }

    // Recent episodes
    if (recentEpisodes.length > 0) {
      const epLines = recentEpisodes
        .slice(0, 5)
        .map((ep) => {
          const timeAgo = getTimeAgo(ep.timestamp)
          return `  - [${ep.type}] ${ep.summary} (${timeAgo})`
        })
        .join('\n')
      sections.push(`[EPISODIOS RECIENTES]\n${epLines}`)
    }

    if (sections.length === 0) {
      return contactId
        ? `No hay contexto de memoria disponible para esta conversacion (contacto: ${contactId}).`
        : 'No hay contexto de memoria disponible para esta conversacion.'
    }

    return sections.join('\n\n')
  }
}

// ─── Internal Helpers ──────────────────────────────────────

/**
 * Convert an EpisodicStore EpisodeRecord to our simplified EpisodeSummary.
 */
function toEpisodeSummary(record: EpisodeRecord): EpisodeSummary {
  return {
    id: record.id,
    type: record.type,
    summary: record.summary,
    timestamp: record.occurredAt,
    metadata: record.metadata ?? {},
  }
}

/**
 * Format a date as a human-readable "time ago" string (in Spanish).
 */
function getTimeAgo(date: Date): string {
  const now = Date.now()
  const then = date.getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'ahora mismo'
  if (diffMin < 60) return `hace ${diffMin}m`
  if (diffHr < 24) return `hace ${diffHr}h`
  if (diffDay < 7) return `hace ${diffDay}d`
  return `hace ${Math.floor(diffDay / 7)}sem`
}

// ─── Default Export ─────────────────────────────────────────

export default MemoryManager
