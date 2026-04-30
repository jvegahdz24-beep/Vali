// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Security Tests: Cross-Workspace Data Isolation
// Tests that users cannot access data from other workspaces
//
// Covers P0 fix: developer/export, P1 fix: jhon-panel, messages/[id]
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import crypto from 'crypto'

// ─── Mock setup: replace requireAuth, keep requireWorkspace real ──
// This lets us bypass cookie/JWT while testing actual DB isolation

const mockRequireAuth = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth')
  return {
    ...actual,
    requireAuth: (...args: any[]) => mockRequireAuth(...args),
  }
})

// Helper: create a fake Request that mimics NextRequest for route handlers
function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as any
}

// ─── Test Suite ──────────────────────────────────────────────

describe('Security: Cross-Workspace Data Isolation', () => {
  let workspaceId: string
  let userId: string
  const fakeWorkspaceId = 'ws_nonexistent_' + crypto.randomUUID()

  beforeAll(async () => {
    // Get the seeded workspace and its owner from the real DB
    const ws = await db.workspace.findFirst()
    if (!ws) throw new Error('No workspace found in DB. Run: npx prisma db seed')

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: ws.id },
    })
    if (!member) throw new Error('No workspace member found in DB.')

    workspaceId = ws.id
    userId = member.userId

    // Default mock: authenticated user from the seeded workspace
    mockRequireAuth.mockResolvedValue({
      userId,
      email: 'test@valiflow.com',
      name: 'Test User',
      role: 'owner',
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 1. GET /api/developer/export — P0 FIX
  //    Previously leaked ALL workspace data to any authenticated user
  //    Now requires requireWorkspace() + filters by workspaceId
  // ═══════════════════════════════════════════════════════════

  describe('GET /api/developer/export (P0 fix)', () => {
    it('should reject requests without workspaceId (400)', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        'http://localhost/api/developer/export?table=contacts&limit=5'
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('workspaceId')
    })

    it('should reject access to non-member workspace (403)', async () => {
      const mod = await import('@/app/api/developer/export/route')
      mockRequireAuth.mockResolvedValue({
        userId,
        email: 'test@valiflow.com',
        name: 'Test User',
        role: 'owner',
      })

      const req = createRequest(
        `http://localhost/api/developer/export?table=contacts&workspaceId=${fakeWorkspaceId}&limit=5`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.statusCode).toBe(403)
    })

    it('should return contacts filtered by own workspace', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        `http://localhost/api/developer/export?table=contacts&workspaceId=${workspaceId}&limit=5`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.total).toBeGreaterThanOrEqual(0)
      expect(data.items).toBeDefined()
      expect(Array.isArray(data.items)).toBe(true)
    })

    it('should return conversations filtered by own workspace', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        `http://localhost/api/developer/export?table=conversations&workspaceId=${workspaceId}&limit=5`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('should return messages filtered by own workspace', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        `http://localhost/api/developer/export?table=messages&workspaceId=${workspaceId}&limit=5`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('should reject invalid table names (400)', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        `http://localhost/api/developer/export?table=users&workspaceId=${workspaceId}&limit=5`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Tabla no permitida')
    })

    it('should return CSV format when requested', async () => {
      const mod = await import('@/app/api/developer/export/route')
      const req = createRequest(
        `http://localhost/api/developer/export?table=contacts&workspaceId=${workspaceId}&limit=5&format=csv`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/csv')
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 2. GET /api/jhon-panel — P1 FIX
  //    Previously any authenticated user could view leads from any workspace
  //    Now requires requireWorkspace() membership check
  // ═══════════════════════════════════════════════════════════

  describe('GET /api/jhon-panel (P1 fix)', () => {
    it('should reject requests without workspaceId (400)', async () => {
      const mod = await import('@/app/api/jhon-panel/route')
      const req = createRequest('http://localhost/api/jhon-panel')
      const res = await mod.GET(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('workspaceId')
    })

    it('should reject access to non-member workspace (403)', async () => {
      const mod = await import('@/app/api/jhon-panel/route')
      mockRequireAuth.mockResolvedValue({
        userId,
        email: 'test@valiflow.com',
        name: 'Test User',
        role: 'owner',
      })

      const req = createRequest(
        `http://localhost/api/jhon-panel?workspaceId=${fakeWorkspaceId}`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.statusCode).toBe(403)
    })

    it('should return JHON panel data for own workspace', async () => {
      const mod = await import('@/app/api/jhon-panel/route')
      const req = createRequest(
        `http://localhost/api/jhon-panel?workspaceId=${workspaceId}`
      )
      const res = await mod.GET(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('jhonInsight')
      expect(data).toHaveProperty('globalPriority')
      expect(data).toHaveProperty('prioritizedLeads')
      expect(data).toHaveProperty('totalActiveLeads')
    })
  })

  // ═══════════════════════════════════════════════════════════
  // 3. PUT /api/messages/[id] — P1 FIX
  //    Previously any authenticated user could update any message metadata
  //    Now verifies conversation.workspaceId ownership
  // ═══════════════════════════════════════════════════════════

  describe('PUT /api/messages/[id] (P1 fix)', () => {
    let realMessageId: string
    let realConversationWorkspaceId: string

    beforeAll(async () => {
      // Get a real message and its conversation's workspace
      const message = await db.message.findFirst({
        include: {
          conversation: {
            select: { workspaceId: true },
          },
        },
      })
      if (message) {
        realMessageId = message.id
        realConversationWorkspaceId = message.conversation?.workspaceId || ''
      }
    })

    it('should return 404 for nonexistent message', async () => {
      const mod = await import('@/app/api/messages/[id]/route')
      const fakeMsgId = 'msg_nonexistent_' + crypto.randomUUID()
      const req = createRequest(`http://localhost/api/messages/${fakeMsgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: true }),
      })

      const res = await mod.PUT(req, {
        params: Promise.resolve({ id: fakeMsgId }),
      })

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toContain('no encontrad')
    })

    it('should reject update by non-member user (403)', async () => {
      // Skip if no seeded message exists
      if (!realMessageId) return

      const mod = await import('@/app/api/messages/[id]/route')
      // Mock user that is NOT a member of the message's workspace
      mockRequireAuth.mockResolvedValue({
        userId: 'nonexistent_user_' + crypto.randomUUID(),
        email: 'outsider@evil.com',
        name: 'Outside User',
        role: 'viewer',
      })

      const req = createRequest(`http://localhost/api/messages/${realMessageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: true }),
      })

      const res = await mod.PUT(req, {
        params: Promise.resolve({ id: realMessageId }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.statusCode).toBe(403)
    })

    it('should allow update by workspace member (200)', async () => {
      // Skip if no seeded message exists or user is not in the workspace
      if (!realMessageId || !realConversationWorkspaceId) return

      const mod = await import('@/app/api/messages/[id]/route')
      // Restore the real user who IS a member of the workspace
      mockRequireAuth.mockResolvedValue({
        userId,
        email: 'test@valiflow.com',
        name: 'Test User',
        role: 'owner',
      })

      const req = createRequest(`http://localhost/api/messages/${realMessageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: true }),
      })

      const res = await mod.PUT(req, {
        params: Promise.resolve({ id: realMessageId }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.message).toBeDefined()
    })

    it('should toggle reaction on message', async () => {
      if (!realMessageId || !realConversationWorkspaceId) return

      const mod = await import('@/app/api/messages/[id]/route')
      mockRequireAuth.mockResolvedValue({
        userId,
        email: 'test@valiflow.com',
        name: 'Test User',
        role: 'owner',
      })

      // Set reaction
      const req1 = createRequest(`http://localhost/api/messages/${realMessageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: '👍' }),
      })
      const res1 = await mod.PUT(req1, {
        params: Promise.resolve({ id: realMessageId }),
      })
      expect(res1.status).toBe(200)

      // Toggle off (same reaction removes it)
      const req2 = createRequest(`http://localhost/api/messages/${realMessageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: '👍' }),
      })
      const res2 = await mod.PUT(req2, {
        params: Promise.resolve({ id: realMessageId }),
      })
      expect(res2.status).toBe(200)
    })
  })
})
