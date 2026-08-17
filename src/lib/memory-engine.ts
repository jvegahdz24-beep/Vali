// ═══════════════════════════════════════════════════════════════
// Memory Engine — AI-Powered Semantic Memory System
// Replaces rule-based if/else memory with real AI intelligence
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'

// ─── Types ────────────────────────────────────────────

export type MemoryCategory = 'conversational' | 'commercial' | 'emotional' | 'behavioral'
export type MemoryStatus = 'active' | 'superseded' | 'archived'

export interface StoredMemory {
  id: string
  userId: string
  contactId: string | null
  category: string
  key: string
  value: string
  source: string
  importance: number
  accessCount: number
  lastAccessed: Date | null
  lastReinforcedAt: Date
  status: string
  supersededById: string | null
  embedding: string | null
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export interface ExtractedMemory {
  key: string
  value: string
  category: MemoryCategory
  importance: number
  tags: string[]
  contradictsExistingKey?: string // If this contradicts an existing memory
  embeddingDescription: string
}

export interface MemoryExtractionResult {
  memories: ExtractedMemory[]
  contradictions: Array<{
    oldKey: string
    oldValue: string
    newKey: string
    newValue: string
    reason: string
  }>
}

export interface RelevantMemory extends StoredMemory {
  relevanceScore: number
}

// ─── In-Memory Cache ──────────────────────────────────

const relevanceCache = new Map<string, { memories: RelevantMemory[]; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(contactId: string, context: string): string {
  // Use a truncated hash of context for cache key
  const hash = context.slice(0, 100).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
  return `${contactId}:${Math.abs(hash)}`
}

// ─── Core Functions ───────────────────────────────────

/**
 * 1. Store a new memory with AI-generated embedding description.
 */
export async function storeMemory(
  userId: string,
  content: string,
  category: MemoryCategory | string,
  source: string = 'manual',
  contactId?: string,
  importance?: number,
  key?: string
): Promise<StoredMemory> {
  // Generate a short key from content if not provided
  const memoryKey = key || (await generateMemoryKey(content, category))

  // Generate embedding description for semantic search
  const embedding = await generateEmbeddingDescription(content, category)

  // Generate tags
  const tags = await generateTags(content, category)

  // Check if a memory with this key already exists
  const existing = await db.nexusMemory.findUnique({
    where: { userId_key: { userId, key: memoryKey } },
  })

  if (existing) {
    // Update existing memory (reinforce it)
    const updated = await db.nexusMemory.update({
      where: { id: existing.id },
      data: {
        value: content,
        category,
        source,
        importance: importance ?? Math.min(10, existing.importance + 1),
        lastAccessed: new Date(),
        lastReinforcedAt: new Date(),
        accessCount: { increment: 1 },
        embedding,
        tags: JSON.stringify(tags),
        status: 'active',
      },
    })
    return mapToStoredMemory(updated)
  }

  // Create new memory
  const memory = await db.nexusMemory.create({
    data: {
      userId,
      contactId: contactId ?? null,
      key: memoryKey,
      value: content,
      category,
      source,
      importance: importance ?? 5,
      lastReinforcedAt: new Date(),
      embedding,
      tags: JSON.stringify(tags),
    },
  })

  // Invalidate cache for this contact/user
  invalidateCache(contactId)

  return mapToStoredMemory(memory)
}

/**
 * 2. Auto-extract memories from a conversation using AI.
 * Detects contradictions, categorizes, assigns importance, and
 * handles conflict resolution.
 */
export async function extractMemoriesFromConversation(
  userId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  contactId?: string
): Promise<MemoryExtractionResult> {
  if (!messages || messages.length === 0) {
    return { memories: [], contradictions: [] }
  }

  // Format conversation for AI analysis
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n')

  // Get existing memories for contradiction detection
  const existingMemories = await db.nexusMemory.findMany({
    where: {
      userId,
      contactId: contactId ?? null,
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const existingMemoriesText = existingMemories.length > 0
    ? existingMemories.map((m) => `- [${m.category}] ${m.key}: ${m.value}`).join('\n')
    : 'Sin memorias existentes.'

  // Use AI to extract memories and detect contradictions
  const extractionPrompt: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: `Eres un sistema avanzado de extracción de memorias. Analiza la conversación y extrae información importante.

Categorías disponibles:
- conversational: Hechos mencionados en conversación (nombre, preferencias, historia personal)
- commercial: Información de negocio (presupuesto, necesidades, timeline, objeciones)
- emotional: Estado emocional, patrones de humor, triggers emocionales
- behavioral: Patrones de comunicación, tiempos de respuesta, niveles de engagement

Importancia (1-10):
- 1-3: Información trivial o poco relevante
- 4-6: Información útil pero no crítica
- 7-8: Información importante para el contexto
- 9-10: Información crítica que debe ser recordada siempre

Memorias existentes del contacto:
${existingMemoriesText}

Responde SOLO en formato JSON con esta estructura exacta:
{
  "memories": [
    {
      "key": "identificador_corto_unico",
      "value": "descripción completa del hecho",
      "category": "conversational|commercial|emotional|behavioral",
      "importance": 5,
      "tags": ["tag1", "tag2"],
      "embeddingDescription": "Descripción corta para búsqueda semántica",
      "contradictsExistingKey": "key_de_memoria_existente_si_hay_contradicción"
    }
  ],
  "contradictions": [
    {
      "oldKey": "key_original",
      "oldValue": "valor_original",
      "newKey": "nuevo_key",
      "newValue": "nuevo_valor",
      "reason": "Razón de la contradicción"
    }
  ]
}

Reglas importantes:
- Extrae SOLO información factual, no suposiciones
- Si no hay información notable, responde con {"memories": [], "contradictions": []}
- Detecta contradicciones con memorias existentes
- Las keys deben ser cortas, únicas y descriptivas (snake_case)
- Si la información actualiza algo existente (no contradice), usa el mismo key sin marcar contradicción
- NO incluyas saludos, despedidas ni preguntas genéricas`,
    },
    {
      role: 'user',
      content: `Analiza esta conversación y extrae memorias:\n\n${conversationText}`,
    },
  ]

  try {
    const result = await chatWithAI(extractionPrompt, 'glm', undefined, {
      temperature: 0.1,
      maxTokens: 2000,
    })

    const content = result.content.trim()
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { memories: [], contradictions: [] }
    }

    const parsed = JSON.parse(jsonMatch[0]) as MemoryExtractionResult
    const extractedMemories = parsed.memories || []
    const contradictions = parsed.contradictions || []

    // Process each extracted memory
    for (const mem of extractedMemories) {
      if (!mem.key || !mem.value) continue

      if (mem.contradictsExistingKey) {
        // Handle contradiction: supersede old memory
        await handleContradiction(
          userId,
          mem.contradictsExistingKey,
          mem,
          contactId
        )
      } else {
        // Check if memory with this key already exists
        const existing = await db.nexusMemory.findUnique({
          where: { userId_key: { userId, key: mem.key } },
        })

        if (existing && existing.contactId === (contactId ?? null)) {
          // Update existing memory (reinforce)
          await db.nexusMemory.update({
            where: { id: existing.id },
            data: {
              value: mem.value,
              category: mem.category,
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              lastAccessed: new Date(),
              lastReinforcedAt: new Date(),
              accessCount: { increment: 1 },
              embedding: mem.embeddingDescription || null,
              tags: JSON.stringify(mem.tags || []),
              status: 'active',
            },
          })
        } else {
          // Create new memory
          await db.nexusMemory.create({
            data: {
              userId,
              contactId: contactId ?? null,
              key: mem.key,
              value: mem.value,
              category: mem.category,
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              source: 'ai_extraction',
              embedding: mem.embeddingDescription || null,
              tags: JSON.stringify(mem.tags || []),
              lastReinforcedAt: new Date(),
            },
          })
        }
      }
    }

    // Invalidate cache
    invalidateCache(contactId)

    return {
      memories: extractedMemories,
      contradictions,
    }
  } catch (error) {
    console.error('[Memory Engine] Extraction error:', error instanceof Error ? error.message : String(error))
    return { memories: [], contradictions: [] }
  }
}

/**
 * 3. Get contextually relevant memories using AI-powered ranking.
 * Ensures a diverse mix of categories.
 */
export async function getRelevantMemories(
  contactId: string,
  context: string,
  limit: number = 10
): Promise<RelevantMemory[]> {
  // Check cache first
  const cacheKey = getCacheKey(contactId, context)
  const cached = relevanceCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.memories
  }

  // Get all active memories for this contact
  const allMemories = await db.nexusMemory.findMany({
    where: {
      contactId,
      status: 'active',
    },
    orderBy: [{ importance: 'desc' }, { lastReinforcedAt: 'desc' }],
  })

  if (allMemories.length === 0) {
    return []
  }

  // If we have few memories, return them all (no need for AI ranking)
  if (allMemories.length <= limit) {
    await reinforceMemories(allMemories.map((m) => m.id))
    return allMemories.map((m) => ({ ...mapToStoredMemory(m), relevanceScore: 1.0 }))
  }

  // Use AI to rank memories by relevance
  const ranked = await rankMemoriesByRelevance(allMemories, context, limit)

  // Reinforce the top memories
  const topIds = ranked.slice(0, limit).map((m) => m.id)
  await reinforceMemories(topIds)

  // El delegate Nexus es una frontera temporal: validar la forma esperada antes de mapear.
  type PrismaMemoryRecord = Parameters<typeof mapToStoredMemory>[0]
  const typedMemories = allMemories as PrismaMemoryRecord[]
  const memoryMap = new Map(typedMemories.map((m) => [m.id, m]))

  // Cache result
  const result: RelevantMemory[] = ranked.slice(0, limit).flatMap((m, i) => {
    const original = memoryMap.get(m.id)
    return original
      ? [{ ...mapToStoredMemory(original), relevanceScore: 1 - (i / limit) }]
      : []
  })

  relevanceCache.set(cacheKey, { memories: result, timestamp: Date.now() })

  // Clean old cache entries
  if (relevanceCache.size > 100) {
    const oldest = [...relevanceCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 50; i++) {
      relevanceCache.delete(oldest[i][0])
    }
  }

  return result
}

/**
 * 4. Search across a user's memories using AI.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit: number = 20
): Promise<RelevantMemory[]> {
  const allMemories = await db.nexusMemory.findMany({
    where: {
      userId,
      status: 'active',
    },
    orderBy: [{ importance: 'desc' }, { lastReinforcedAt: 'desc' }],
  })

  if (allMemories.length === 0) {
    return []
  }

  // Use AI to rank memories by search relevance
  const ranked = await rankMemoriesByRelevance(allMemories, query, limit)

  // Reinforce matched memories
  const matchedIds = ranked.slice(0, limit).map((m) => m.id)
  await reinforceMemories(matchedIds)

  // El delegate Nexus es una frontera temporal: validar la forma esperada antes de mapear.
  type PrismaMemoryRecord = Parameters<typeof mapToStoredMemory>[0]
  const typedMemories = allMemories as PrismaMemoryRecord[]
  const memoryMap = new Map(typedMemories.map((m) => [m.id, m]))

  return ranked.slice(0, limit).flatMap((m, i) => {
    const original = memoryMap.get(m.id)
    return original
      ? [{ ...mapToStoredMemory(original), relevanceScore: 1 - (i / limit) }]
      : []
  })
}

/**
 * 5. Remove a memory (soft delete → archived).
 */
export async function forgetMemory(
  memoryId: string,
  userId: string
): Promise<boolean> {
  try {
    const memory = await db.nexusMemory.findUnique({
      where: { id: memoryId },
    })

    if (!memory || memory.userId !== userId) {
      return false
    }

    await db.nexusMemory.update({
      where: { id: memoryId },
      data: { status: 'archived' },
    })

    invalidateCache(memory.contactId ?? undefined)
    return true
  } catch {
    return false
  }
}

/**
 * 6. AI-generated summary of everything known about a contact.
 */
export async function summarizeContactProfile(
  contactId: string
): Promise<{ summary: string; categoryBreakdown: Record<string, number>; totalMemories: number }> {
  // Get all active memories for this contact
  const memories = await db.nexusMemory.findMany({
    where: {
      contactId,
      status: 'active',
    },
    orderBy: { importance: 'desc' },
  })

  if (memories.length === 0) {
    return {
      summary: 'No hay información registrada sobre este contacto.',
      categoryBreakdown: {},
      totalMemories: 0,
    }
  }

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {}
  for (const m of memories) {
    categoryBreakdown[m.category] = (categoryBreakdown[m.category] || 0) + 1
  }

  // Use AI to generate a comprehensive summary
  const memoriesText = memories
    .map((m) => `[${m.category}] (${m.importance}/10) ${m.key}: ${m.value}`)
    .join('\n')

  const summaryPrompt: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: `Eres un analista de relaciones. Genera un resumen comprensivo de todo lo que sabemos sobre un contacto.

El resumen debe incluir:
1. Perfil general del contacto
2. Preferencias y necesidades clave
3. Estado emocional y patrones de comportamiento
4. Información comercial relevante (presupuesto, timeline, objeciones)
5. Recomendaciones para la próxima interacción

Responde en español, en 3-5 párrafos concisos. Sé específico con los datos proporcionados.`,
    },
    {
      role: 'user',
      content: `Memorias del contacto:\n\n${memoriesText}`,
    },
  ]

  try {
    const result = await chatWithAI(summaryPrompt, 'glm', undefined, {
      temperature: 0.5,
      maxTokens: 1000,
    })

    return {
      summary: result.content,
      categoryBreakdown,
      totalMemories: memories.length,
    }
  } catch {
    // Fallback to a basic text summary
    const categorySummaries = Object.entries(categoryBreakdown)
      .map(([cat, count]) => `${cat}: ${count} memorias`)
      .join(', ')

    return {
      summary: `Contacto con ${memories.length} memorias registradas. Categorías: ${categorySummaries}.`,
      categoryBreakdown,
      totalMemories: memories.length,
    }
  }
}

/**
 * 7. Apply memory decay — reduce importance of unreinforced memories.
 * Should be called periodically (e.g., daily cron).
 */
export async function applyMemoryDecay(): Promise<{
  decayed: number
  archived: number
}> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Find memories not reinforced in 30 days
  const staleMemories = await db.nexusMemory.findMany({
    where: {
      status: 'active',
      lastReinforcedAt: { lt: thirtyDaysAgo },
      importance: { gt: 1 },
    },
  })

  let decayed = 0
  let archived = 0

  for (const memory of staleMemories) {
    const newImportance = memory.importance - 1

    if (newImportance < 2) {
      // Archive low-importance memories
      await db.nexusMemory.update({
        where: { id: memory.id },
        data: { status: 'archived', importance: 1 },
      })
      archived++
    } else {
      // Reduce importance
      await db.nexusMemory.update({
        where: { id: memory.id },
        data: { importance: newImportance },
      })
      decayed++
    }
  }

  // Clear cache since memories changed
  relevanceCache.clear()

  return { decayed, archived }
}

// ─── Helper Functions ─────────────────────────────────

/**
 * Generate a unique, short key from content using AI.
 */
async function generateMemoryKey(content: string, category: string): Promise<string> {
  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Genera un identificador único y corto (máximo 4 palabras, snake_case) para el siguiente contenido. Responde SOLO con el identificador, sin explicaciones. Ejemplos: "nombre_usuario", "presupuesto_cliente", "estado_emocional", "preferencia_comunicacion".`,
        },
        {
          role: 'user',
          content: `Categoría: ${category}\nContenido: ${content.slice(0, 200)}`,
        },
      ],
      'glm',
      undefined,
      { temperature: 0.1, maxTokens: 30 }
    )

    // Clean and normalize the key
    let key = result.content.trim().toLowerCase()
    // Remove quotes, dots, and extra whitespace
    key = key.replace(/['".,!?]/g, '').replace(/\s+/g, '_').slice(0, 50)
    // Fallback if key is empty
    if (!key || key.length < 2) {
      key = `mem_${Date.now().toString(36)}`
    }
    return key
  } catch {
    return `mem_${Date.now().toString(36)}`
  }
}

/**
 * Generate an embedding description for semantic relevance matching.
 */
async function generateEmbeddingDescription(
  content: string,
  category: string
): Promise<string> {
  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Genera una descripción corta (máximo 15 palabras) que capture el significado esencial de este contenido para búsqueda semántica. Responde SOLO con la descripción, sin explicaciones ni comillas.`,
        },
        {
          role: 'user',
          content: `Categoría: ${category}\nContenido: ${content.slice(0, 200)}`,
        },
      ],
      'glm',
      undefined,
      { temperature: 0.1, maxTokens: 50 }
    )

    return result.content.trim().slice(0, 100)
  } catch {
    return content.slice(0, 100)
  }
}

/**
 * Generate tags for a memory.
 */
async function generateTags(
  content: string,
  category: string
): Promise<string[]> {
  try {
    const result = await chatWithAI(
      [
        {
          role: 'system',
          content: `Genera de 2 a 5 tags relevantes para categorizar esta información. Responde SOLO en formato JSON array de strings, sin explicaciones. Ejemplo: ["presupuesto", "automotriz", "urgente"]`,
        },
        {
          role: 'user',
          content: `Categoría: ${category}\nContenido: ${content.slice(0, 200)}`,
        },
      ],
      'glm',
      undefined,
      { temperature: 0.1, maxTokens: 80 }
    )

    const content_ = result.content.trim()
    const jsonMatch = content_.match(/\[.*?\]/)
    if (jsonMatch) {
      const tags = JSON.parse(jsonMatch[0]) as string[]
      return tags.slice(0, 5)
    }
    return [category]
  } catch {
    return [category]
  }
}

/**
 * Rank memories by relevance to a context query using AI.
 */
async function rankMemoriesByRelevance(
  memories: Array<{ id: string; key: string; value: string; category: string; importance: number; embedding: string | null }>,
  context: string,
  limit: number
): Promise<Array<{ id: string }>> {
  // Build a compact representation of memories
  const memoriesList = memories.map((m, i) => ({
    idx: i,
    key: m.key,
    desc: m.embedding || m.value.slice(0, 80),
    category: m.category,
    importance: m.importance,
  }))

  const memoriesJson = JSON.stringify(memoriesList)

  const rankingPrompt: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: `Eres un sistema de ranking de relevancia. Dado un contexto de conversación y una lista de memorias, devuelve los índices de las memorias más relevantes.

IMPORTANTE:
- Incluye una variedad de categorías (no devuelvas solo memorias de una categoría)
- Prioriza memorias con alta importancia pero también considera relevancia semántica
- Devuelve SOLO los índices en formato JSON array, ordenados de más relevante a menos relevante
- Máximo ${limit} resultados

Responde SOLO con un JSON array de números. Ejemplo: [3, 0, 7, 1, 4]`,
    },
    {
      role: 'user',
      content: `Contexto: ${context.slice(0, 500)}\n\nMemorias (índice: key | descripción | categoría | importancia):\n${memoriesJson}`,
    },
  ]

  try {
    const result = await chatWithAI(rankingPrompt, 'glm', undefined, {
      temperature: 0.1,
      maxTokens: 200,
    })

    const content_ = result.content.trim()
    const jsonMatch = content_.match(/\[[\s\S]*?\]/)
    if (jsonMatch) {
      const indices = JSON.parse(jsonMatch[0]) as number[]
      // Filter valid indices and map to memory IDs
      const validIndices = indices.filter((i) => i >= 0 && i < memories.length)
      return validIndices.map((i) => ({ id: memories[i].id }))
    }
  } catch {
    // Fallback: return by importance
    console.warn('[Memory Engine] Ranking failed, falling back to importance order')
  }

  // Fallback: sort by importance
  return memories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit)
    .map((m) => ({ id: m.id }))
}

/**
 * Handle contradiction between old and new memory.
 * Old memory is marked as superseded, new memory gets higher importance.
 */
async function handleContradiction(
  userId: string,
  oldKey: string,
  newMemory: ExtractedMemory,
  contactId?: string
): Promise<void> {
  // Find the old memory
  const oldMemory = await db.nexusMemory.findUnique({
    where: { userId_key: { userId, key: oldKey } },
  })

  if (!oldMemory) return

  // Create the new memory (use the new key)
  const newMem = await db.nexusMemory.create({
    data: {
      userId,
      contactId: contactId ?? null,
      key: newMemory.key,
      value: newMemory.value,
      category: newMemory.category,
      importance: Math.min(10, Math.max(oldMemory.importance + 1, newMemory.importance)),
      source: 'ai_extraction',
      embedding: newMemory.embeddingDescription || null,
      tags: JSON.stringify(newMemory.tags || []),
      lastReinforcedAt: new Date(),
    },
  })

  // Mark old memory as superseded
  await db.nexusMemory.update({
    where: { id: oldMemory.id },
    data: {
      status: 'superseded',
      supersededById: newMem.id,
    },
  })
}

/**
 * Reinforce memories by updating their lastReinforcedAt timestamp.
 */
async function reinforceMemories(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) return

  await db.nexusMemory.updateMany({
    where: { id: { in: memoryIds } },
    data: {
      lastReinforcedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: { increment: 1 },
    },
  })
}

/**
 * Invalidate cache for a contact.
 */
function invalidateCache(contactId?: string): void {
  if (!contactId) {
    relevanceCache.clear()
    return
  }
  for (const [key] of relevanceCache) {
    if (key.startsWith(`${contactId}:`)) {
      relevanceCache.delete(key)
    }
  }
}

/**
 * Map a Prisma NexusMemory to our StoredMemory interface.
 */
function mapToStoredMemory(prismaMemory: {
  id: string
  userId: string
  workspaceId: string | null
  contactId: string | null
  category: string
  key: string
  value: string
  source: string
  importance: number
  accessCount: number
  lastAccessed: Date | null
  lastReinforcedAt: Date
  status: string
  supersededById: string | null
  embedding: string | null
  tags: string
  createdAt: Date
  updatedAt: Date
}): StoredMemory {
  let parsedTags: string[] = []
  try {
    parsedTags = JSON.parse(prismaMemory.tags)
  } catch {
    parsedTags = []
  }

  return {
    id: prismaMemory.id,
    userId: prismaMemory.userId,
    contactId: prismaMemory.contactId,
    category: prismaMemory.category,
    key: prismaMemory.key,
    value: prismaMemory.value,
    source: prismaMemory.source,
    importance: prismaMemory.importance,
    accessCount: prismaMemory.accessCount,
    lastAccessed: prismaMemory.lastAccessed,
    lastReinforcedAt: prismaMemory.lastReinforcedAt,
    status: prismaMemory.status,
    supersededById: prismaMemory.supersededById,
    embedding: prismaMemory.embedding,
    tags: parsedTags,
    createdAt: prismaMemory.createdAt,
    updatedAt: prismaMemory.updatedAt,
  }
}

// ─── Exports for testing ──────────────────────────────

export { relevanceCache }
