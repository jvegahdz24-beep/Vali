import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Prisma client BEFORE importing the selector.
const findMany = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { agentInstance: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { selectAgentForConversation, invalidateAgentInstanceCache } from '@/lib/ai/agent-selector'

function instance(over: Record<string, unknown> = {}) {
  return {
    id: 'inst-seg', role: 'SEGURO', vertical: 'seguros',
    systemPrompt: 'Eres SEGURO para Autos del Valle.',
    temperature: 0.3, keywords: JSON.stringify(['seguro', 'poliza']),
    stageMatch: JSON.stringify(['Cualificado']), priority: 100, ...over,
  }
}

describe('selectAgentForConversation', () => {
  beforeEach(() => { findMany.mockReset() })

  it('returns null when the workspace has no active instances (JHON untouched)', async () => {
    findMany.mockResolvedValue([])
    const r = await selectAgentForConversation({ workspaceId: 'ws-empty', incomingText: 'quiero un seguro' })
    expect(r).toBeNull()
  })

  it('routes to the agent when a keyword matches', async () => {
    findMany.mockResolvedValue([instance()])
    const r = await selectAgentForConversation({ workspaceId: 'ws-kw', incomingText: 'Hola, quiero un SEGURO para mi auto' })
    expect(r).not.toBeNull()
    expect(r!.role).toBe('SEGURO')
    expect(r!.vertical).toBe('seguros')
    expect(r!.systemPrompt).toContain('SEGURO')
    expect(r!.keywordsMatched).toContain('seguro')
  })

  it('matches keywords ignoring accents/case', async () => {
    findMany.mockResolvedValue([instance({ keywords: JSON.stringify(['póliza']) })])
    const r = await selectAgentForConversation({ workspaceId: 'ws-acc', incomingText: 'necesito una POLIZA nueva' })
    expect(r).not.toBeNull()
    expect(r!.role).toBe('SEGURO')
  })

  it('returns null when no keyword matches (JHON fallback)', async () => {
    findMany.mockResolvedValue([instance()])
    const r = await selectAgentForConversation({ workspaceId: 'ws-nomatch', incomingText: 'hola, buenos dias' })
    expect(r).toBeNull()
  })

  it('respects the agentFactoryEnabled=false kill-switch', async () => {
    findMany.mockResolvedValue([instance()])
    const r = await selectAgentForConversation({
      workspaceId: 'ws-kill', incomingText: 'quiero un seguro',
      workspaceSettings: { agentFactoryEnabled: false },
    })
    expect(r).toBeNull()
    expect(findMany).not.toHaveBeenCalled() // short-circuits before querying
  })

  it('falls back to vertical default keywords when the instance has none', async () => {
    findMany.mockResolvedValue([instance({ keywords: JSON.stringify([]) })])
    // "financiamiento" vertical instance with empty keywords → uses VERTICAL_KEYWORDS
    findMany.mockResolvedValue([instance({ role: 'FINAN', vertical: 'financiamiento', keywords: JSON.stringify([]) })])
    const r = await selectAgentForConversation({ workspaceId: 'ws-fallback', incomingText: 'me interesa el financiamiento a meses' })
    expect(r).not.toBeNull()
    expect(r!.role).toBe('FINAN')
  })

  it('picks the higher-scoring agent (more keyword hits) among several', async () => {
    findMany.mockResolvedValue([
      instance({ id: 'a', role: 'SEGURO', keywords: JSON.stringify(['seguro']) }),
      instance({ id: 'b', role: 'COTIZADOR', vertical: 'cotizador', keywords: JSON.stringify(['seguro', 'cotizacion', 'precio']) }),
    ])
    const r = await selectAgentForConversation({ workspaceId: 'ws-multi', incomingText: 'quiero una cotizacion de seguro y el precio' })
    expect(r!.instanceId).toBe('b') // 3 hits beats 1
  })

  it('invalidateAgentInstanceCache forces a re-query', async () => {
    findMany.mockResolvedValue([instance()])
    await selectAgentForConversation({ workspaceId: 'ws-cache', incomingText: 'seguro' })
    expect(findMany).toHaveBeenCalledTimes(1)
    await selectAgentForConversation({ workspaceId: 'ws-cache', incomingText: 'seguro' })
    expect(findMany).toHaveBeenCalledTimes(1) // cached
    invalidateAgentInstanceCache('ws-cache')
    await selectAgentForConversation({ workspaceId: 'ws-cache', incomingText: 'seguro' })
    expect(findMany).toHaveBeenCalledTimes(2) // re-queried after invalidation
  })
})
