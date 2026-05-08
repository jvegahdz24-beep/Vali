// ═══════════════════════════════════════════════════════════════
// Memory Engine — Unit Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mock modules (hoisted by vitest) ─────────────────

vi.mock('@/lib/db', () => ({
  db: {
    nexusMemory: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/lib/ai/providers', () => ({
  chatWithAI: vi.fn(),
}))

// ─── Imports after mocks ──────────────────────────────

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import {
  storeMemory,
  extractMemoriesFromConversation,
  getRelevantMemories,
  searchMemories,
  forgetMemory,
  summarizeContactProfile,
  applyMemoryDecay,
  relevanceCache,
} from '@/lib/memory-engine'

// ─── Helpers ──────────────────────────────────────────

const mockChatWithAI = vi.mocked(chatWithAI)
const nexusMemoryMock = db.nexusMemory

const TEST_USER_ID = 'user_test_123'
const TEST_CONTACT_ID = 'contact_test_456'
const NOW = new Date()

function aiResponse(content: string) {
  return {
    content,
    model: 'glm-4.5-flash',
    provider: 'glm' as const,
    tokensUsed: 10,
    latencyMs: 100,
  }
}

function createMockMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_' + Math.random().toString(36).slice(2),
    userId: TEST_USER_ID,
    workspaceId: null,
    contactId: TEST_CONTACT_ID,
    category: 'conversational',
    key: 'test_memory',
    value: 'Test memory value',
    source: 'conversation',
    importance: 5,
    accessCount: 0,
    lastAccessed: null,
    lastReinforcedAt: NOW,
    expiresAt: null,
    status: 'active',
    supersededById: null,
    embedding: 'Test description for semantic search',
    tags: '["test"]',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────

describe('Memory Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relevanceCache.clear()
  })

  describe('storeMemory', () => {
    it('should create a new memory when key does not exist', async () => {
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(null)
      vi.mocked(nexusMemoryMock.create).mockResolvedValue(createMockMemory({
        key: 'nombre_usuario',
        value: 'El usuario se llama Juan Pérez',
      }))

      mockChatWithAI
        .mockResolvedValueOnce(aiResponse('nombre_usuario'))
        .mockResolvedValueOnce(aiResponse('El usuario se llama Juan'))
        .mockResolvedValueOnce(aiResponse('["nombre", "identidad"]'))

      const result = await storeMemory(
        TEST_USER_ID,
        'El usuario se llama Juan Pérez',
        'conversational',
        'manual'
      )

      expect(result.key).toBe('nombre_usuario')
      expect(result.category).toBe('conversational')
      expect(nexusMemoryMock.create).toHaveBeenCalledTimes(1)
      expect(mockChatWithAI).toHaveBeenCalledTimes(3)
    })

    it('should update existing memory when key already exists (reinforce)', async () => {
      const existing = createMockMemory({ key: 'presupuesto_cliente', importance: 5 })
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(existing)
      vi.mocked(nexusMemoryMock.update).mockResolvedValue({
        ...existing,
        value: 'Nuevo presupuesto',
        importance: 6,
        accessCount: 1,
      })

      const result = await storeMemory(
        TEST_USER_ID,
        'Nuevo presupuesto',
        'commercial',
        'ai_extraction',
        undefined,
        8,
        'presupuesto_cliente'
      )

      expect(nexusMemoryMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.objectContaining({
            value: 'Nuevo presupuesto',
            importance: 8,
          }),
        })
      )
      // storeMemory always calls AI for embedding + tags generation (even on update)
      expect(mockChatWithAI).toHaveBeenCalledTimes(2)
    })
  })

  describe('extractMemoriesFromConversation', () => {
    it('should extract memories from conversation using AI', async () => {
      const messages = [
        { role: 'user' as const, content: 'Mi nombre es Carlos y mi presupuesto es $20,000' },
        { role: 'assistant' as const, content: 'Mucho gusto Carlos.' },
      ]

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(null)
      vi.mocked(nexusMemoryMock.create).mockResolvedValue(createMockMemory())

      mockChatWithAI.mockResolvedValueOnce(aiResponse(JSON.stringify({
        memories: [
          {
            key: 'nombre_contacto',
            value: 'Carlos',
            category: 'conversational',
            importance: 8,
            tags: ['nombre'],
            embeddingDescription: 'Contacto llamado Carlos',
          },
          {
            key: 'presupuesto',
            value: '$20,000',
            category: 'commercial',
            importance: 9,
            tags: ['presupuesto'],
            embeddingDescription: 'Presupuesto de veinte mil',
          },
        ],
        contradictions: [],
      })))

      const result = await extractMemoriesFromConversation(TEST_USER_ID, messages, TEST_CONTACT_ID)

      expect(result.memories).toHaveLength(2)
      expect(result.contradictions).toHaveLength(0)
      expect(nexusMemoryMock.create).toHaveBeenCalledTimes(2)
    })

    it('should detect and handle contradictions', async () => {
      const messages = [
        { role: 'user' as const, content: 'Ahora solo tengo $5,000 de presupuesto' },
        { role: 'assistant' as const, content: 'Entendido.' },
      ]

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([
        createMockMemory({ key: 'presupuesto', value: '$10,000' }),
      ])
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(
        createMockMemory({ key: 'presupuesto', value: '$10,000' })
      )
      vi.mocked(nexusMemoryMock.create).mockResolvedValue(
        createMockMemory({ id: 'new_mem', key: 'presupuesto_actualizado', value: '$5,000' })
      )
      vi.mocked(nexusMemoryMock.update).mockResolvedValue(
        createMockMemory({ key: 'presupuesto', value: '$5,000' })
      )

      mockChatWithAI.mockResolvedValueOnce(aiResponse(JSON.stringify({
        memories: [
          {
            key: 'presupuesto_actualizado',
            value: '$5,000',
            category: 'commercial',
            importance: 8,
            tags: ['presupuesto'],
            embeddingDescription: 'Presupuesto reducido',
            contradictsExistingKey: 'presupuesto',
          },
        ],
        contradictions: [
          {
            oldKey: 'presupuesto',
            oldValue: '$10,000',
            newKey: 'presupuesto_actualizado',
            newValue: '$5,000',
            reason: 'El usuario redujo su presupuesto',
          },
        ],
      })))

      const result = await extractMemoriesFromConversation(TEST_USER_ID, messages, TEST_CONTACT_ID)

      expect(result.memories).toHaveLength(1)
      expect(result.contradictions).toHaveLength(1)
      expect(result.contradictions[0].reason).toContain('redujo')
    })

    it('should return empty result for empty messages', async () => {
      const result = await extractMemoriesFromConversation(TEST_USER_ID, [], TEST_CONTACT_ID)

      expect(result.memories).toHaveLength(0)
      expect(result.contradictions).toHaveLength(0)
      expect(mockChatWithAI).not.toHaveBeenCalled()
    })

    it('should handle AI parsing failure gracefully', async () => {
      const messages = [
        { role: 'user' as const, content: 'Hola' },
        { role: 'assistant' as const, content: '¿Qué tal?' },
      ]

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])
      mockChatWithAI.mockResolvedValueOnce(aiResponse('No hay información relevante aquí.'))

      const result = await extractMemoriesFromConversation(TEST_USER_ID, messages, TEST_CONTACT_ID)

      expect(result.memories).toHaveLength(0)
    })
  })

  describe('getRelevantMemories', () => {
    it('should return all memories if count <= limit', async () => {
      const memories = [
        createMockMemory({ id: 'm1', key: 'nombre', value: 'Juan' }),
        createMockMemory({ id: 'm2', key: 'presupuesto', value: '$10,000' }),
      ]

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue(memories)
      vi.mocked(nexusMemoryMock.updateMany).mockResolvedValue({ count: 2 })

      const result = await getRelevantMemories(TEST_CONTACT_ID, 'Quiero hablar del precio', 10)

      expect(result).toHaveLength(2)
      // Should reinforce memories
      expect(nexusMemoryMock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['m1', 'm2'] } },
        })
      )
    })

    it('should use AI ranking when memories exceed limit', async () => {
      const memories = Array.from({ length: 15 }, (_, i) =>
        createMockMemory({ id: `mem_${i}`, key: `memory_${i}`, value: `Value ${i}` })
      )

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue(memories)
      vi.mocked(nexusMemoryMock.updateMany).mockResolvedValue({ count: 10 })

      mockChatWithAI.mockResolvedValueOnce(aiResponse('[2, 0, 14, 7, 3, 1, 11, 8, 5, 12]'))

      const result = await getRelevantMemories(TEST_CONTACT_ID, 'Contexto de prueba', 10)

      expect(result).toHaveLength(10)
      expect(mockChatWithAI).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no memories exist', async () => {
      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])

      const result = await getRelevantMemories(TEST_CONTACT_ID, 'test', 10)

      expect(result).toHaveLength(0)
      expect(nexusMemoryMock.updateMany).not.toHaveBeenCalled()
      expect(mockChatWithAI).not.toHaveBeenCalled()
    })

    it('should use cached results when available', async () => {
      const cachedMemory = {
        id: 'cached_1',
        userId: TEST_USER_ID,
        workspaceId: null,
        contactId: TEST_CONTACT_ID,
        category: 'conversational',
        key: 'cached',
        value: 'Cached memory',
        source: 'test',
        importance: 8,
        accessCount: 1,
        lastAccessed: NOW,
        lastReinforcedAt: NOW,
        status: 'active',
        supersededById: null,
        embedding: 'test',
        tags: [],
        createdAt: NOW,
        updatedAt: NOW,
        relevanceScore: 1.0,
      }

      // Pre-populate cache - use the same hash function as getCacheKey
      const context = 'my test cache context'
      const hash = context.slice(0, 100).split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
      const cacheKey = `${TEST_CONTACT_ID}:${Math.abs(hash)}`
      relevanceCache.set(cacheKey, {
        memories: [cachedMemory],
        timestamp: Date.now(),
      })

      const result = await getRelevantMemories(TEST_CONTACT_ID, context, 10)

      expect(result).toHaveLength(1)
      expect(nexusMemoryMock.findMany).not.toHaveBeenCalled()
      expect(mockChatWithAI).not.toHaveBeenCalled()
    })
  })

  describe('searchMemories', () => {
    it('should search across all user memories using AI ranking', async () => {
      const memories = Array.from({ length: 5 }, (_, i) =>
        createMockMemory({
          id: `search_${i}`,
          key: `key_${i}`,
          category: ['conversational', 'commercial', 'emotional', 'behavioral', 'conversational'][i],
        })
      )

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue(memories)
      vi.mocked(nexusMemoryMock.updateMany).mockResolvedValue({ count: 3 })

      mockChatWithAI.mockResolvedValueOnce(aiResponse('[0, 3, 1]'))

      const result = await searchMemories(TEST_USER_ID, 'presupuesto automotriz', 3)

      expect(result).toHaveLength(3)
      expect(mockChatWithAI).toHaveBeenCalledTimes(1)
    })

    it('should return empty when user has no memories', async () => {
      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])

      const result = await searchMemories(TEST_USER_ID, 'any query', 10)

      expect(result).toHaveLength(0)
    })
  })

  describe('forgetMemory', () => {
    it('should archive a memory (soft delete)', async () => {
      const memory = createMockMemory({ id: 'forget_me' })
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(memory)
      vi.mocked(nexusMemoryMock.update).mockResolvedValue({ ...memory, status: 'archived' })

      const result = await forgetMemory('forget_me', TEST_USER_ID)

      expect(result).toBe(true)
      expect(nexusMemoryMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'forget_me' },
          data: { status: 'archived' },
        })
      )
    })

    it('should return false when memory not found', async () => {
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(null)

      const result = await forgetMemory('nonexistent', TEST_USER_ID)

      expect(result).toBe(false)
    })

    it('should return false when memory belongs to different user', async () => {
      vi.mocked(nexusMemoryMock.findUnique).mockResolvedValue(
        createMockMemory({ userId: 'other_user' })
      )

      const result = await forgetMemory('other_mem', TEST_USER_ID)

      expect(result).toBe(false)
    })
  })

  describe('summarizeContactProfile', () => {
    it('should generate AI summary with category breakdown', async () => {
      const memories = [
        createMockMemory({ category: 'conversational', importance: 8 }),
        createMockMemory({ category: 'commercial', importance: 9 }),
        createMockMemory({ category: 'emotional', importance: 6 }),
        createMockMemory({ category: 'commercial', importance: 7 }),
      ]

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue(memories)
      mockChatWithAI.mockResolvedValueOnce(aiResponse(
        'Carlos es un cliente con alto interés en vehículos. Su presupuesto es de $20,000.'
      ))

      const result = await summarizeContactProfile(TEST_CONTACT_ID)

      expect(result.summary).toContain('Carlos')
      expect(result.totalMemories).toBe(4)
      expect(result.categoryBreakdown).toEqual({
        conversational: 1,
        commercial: 2,
        emotional: 1,
      })
    })

    it('should return default message when no memories exist', async () => {
      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])

      const result = await summarizeContactProfile(TEST_CONTACT_ID)

      expect(result.summary).toContain('información')
      expect(result.totalMemories).toBe(0)
    })

    it('should fallback to basic summary when AI fails', async () => {
      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([
        createMockMemory({ category: 'conversational' }),
        createMockMemory({ category: 'commercial' }),
      ])
      mockChatWithAI.mockRejectedValueOnce(new Error('AI failed'))

      const result = await summarizeContactProfile(TEST_CONTACT_ID)

      expect(result.summary).toContain('2 memorias')
      expect(result.totalMemories).toBe(2)
    })
  })

  describe('applyMemoryDecay', () => {
    it('should reduce importance of stale memories and archive low ones', async () => {
      const thirtyOneDaysAgo = new Date()
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31)

      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([
        createMockMemory({ id: 's3', importance: 3, lastReinforcedAt: thirtyOneDaysAgo }),
        createMockMemory({ id: 's2', importance: 2, lastReinforcedAt: thirtyOneDaysAgo }),
      ])
      vi.mocked(nexusMemoryMock.update).mockResolvedValue(
        createMockMemory({ id: 's3', importance: 2 })
      )

      const result = await applyMemoryDecay()

      expect(result.decayed).toBe(1)
      expect(result.archived).toBe(1)
      expect(relevanceCache.size).toBe(0)
    })

    it('should not decay recently reinforced memories', async () => {
      vi.mocked(nexusMemoryMock.findMany).mockResolvedValue([])

      const result = await applyMemoryDecay()

      expect(result.decayed).toBe(0)
      expect(result.archived).toBe(0)
    })
  })
})
