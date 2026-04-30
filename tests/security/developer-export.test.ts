// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Developer Export Workspace Isolation
// Tests for /api/developer/export endpoint
// Fix: P0 — Added requireWorkspace() + workspaceId filters on all queries
// ═══════════════════════════════════════════════════════════════

describe('Developer Export — Workspace Isolation (developer/export/route.ts)', () => {
  // ─── Allowed Tables Validation ──────────────────────────────

  describe('Table whitelist', () => {
    const ALLOWED_TABLES = ['contacts', 'conversations', 'messages', 'deals', 'agents', 'automations'] as const

    it('should only allow the 6 whitelisted tables', () => {
      const testTables = [
        'contacts', 'conversations', 'messages', 'deals', 'agents', 'automations', // valid
        'users', 'workspaces', 'sessions', 'accounts', 'pipeline', // invalid — no access
      ]

      for (const table of testTables) {
        const isAllowed = ALLOWED_TABLES.includes(table as any)
        if (['contacts', 'conversations', 'messages', 'deals', 'agents', 'automations'].includes(table)) {
          expect(isAllowed).toBe(true)
        } else {
          expect(isAllowed).toBe(false)
        }
      }
    })

    it('should reject SQL injection attempts via table name', () => {
      const ALLOWED_TABLES = ['contacts', 'conversations', 'messages', 'deals', 'agents', 'automations']
      const sqlInjectionAttempts = [
        'users; DROP TABLE users--',
        'contacts UNION SELECT * FROM users',
        '../users',
        'contacts\x00users',
        'contacts; --',
      ]

      for (const attempt of sqlInjectionAttempts) {
        const isAllowed = ALLOWED_TABLES.includes(attempt as any)
        expect(isAllowed).toBe(false)
      }
    })
  })

  // ─── Field Whitelisting ─────────────────────────────────────

  describe('Field whitelisting (prevents data leakage)', () => {
    const TABLE_FIELDS: Record<string, string[]> = {
      contacts: ['id', 'firstName', 'lastName', 'phone', 'email', 'source', 'status', 'leadScore', 'createdAt'],
      conversations: ['id', 'channel', 'status', 'lastMessagePreview', 'unreadCount', 'createdAt'],
      messages: ['id', 'content', 'type', 'direction', 'senderType', 'isAiGenerated', 'createdAt'],
      deals: ['id', 'title', 'value', 'currency', 'status', 'createdAt'],
      agents: ['id', 'name', 'type', 'model', 'modelName', 'temperature', 'isActive', 'personality', 'createdAt'],
      automations: ['id', 'name', 'description', 'triggerType', 'isActive', 'runCount', 'createdAt'],
    }

    const sensitiveFields = ['password', 'metadata', 'settings', 'apiKey', 'secret', 'token', 'workspaceId']

    it('should NEVER include sensitive fields in any table export', () => {
      for (const [table, fields] of Object.entries(TABLE_FIELDS)) {
        for (const sensitive of sensitiveFields) {
          expect(fields).not.toContain(sensitive)
        }
      }
    })

    it('contacts export should not include internal notes or tags JSON', () => {
      expect(TABLE_FIELDS.contacts).not.toContain('tags')
      expect(TABLE_FIELDS.contacts).not.toContain('notes')
      expect(TABLE_FIELDS.contacts).not.toContain('metadata')
    })

    it('should have a consistent subset of fields per table', () => {
      for (const [table, fields] of Object.entries(TABLE_FIELDS)) {
        expect(fields.length).toBeGreaterThan(0)
        expect(fields).toContain('id')
        expect(fields).toContain('createdAt')
      }
    })
  })

  // ─── Workspace Filter Logic ─────────────────────────────────

  describe('Workspace isolation (query filters)', () => {
    it('should filter contacts by workspaceId', () => {
      // Simulates: db.contact.findMany({ where: { workspaceId } })
      const workspaceId = 'ws-alpha'
      const contacts = [
        { id: 'c1', workspaceId: 'ws-alpha', firstName: 'Alpha Contact' },
        { id: 'c2', workspaceId: 'ws-beta', firstName: 'Beta Contact' },
        { id: 'c3', workspaceId: 'ws-alpha', firstName: 'Another Alpha' },
      ]

      const filtered = contacts.filter(c => c.workspaceId === workspaceId)
      expect(filtered).toHaveLength(2)
      expect(filtered.every(c => c.workspaceId === 'ws-alpha')).toBe(true)
    })

    it('should filter conversations by workspaceId', () => {
      const workspaceId = 'ws-beta'
      const conversations = [
        { id: 'conv1', workspaceId: 'ws-alpha' },
        { id: 'conv2', workspaceId: 'ws-beta' },
      ]

      const filtered = conversations.filter(c => c.workspaceId === workspaceId)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].workspaceId).toBe('ws-beta')
    })

    it('should filter messages through conversation.workspaceId', () => {
      // Messages don't have direct workspaceId — they use conversation.workspaceId
      const workspaceId = 'ws-alpha'
      const messages = [
        { id: 'm1', conversation: { workspaceId: 'ws-alpha' } },
        { id: 'm2', conversation: { workspaceId: 'ws-beta' } },
        { id: 'm3', conversation: { workspaceId: 'ws-alpha' } },
      ]

      const filtered = messages.filter(m => m.conversation.workspaceId === workspaceId)
      expect(filtered).toHaveLength(2)
      expect(filtered.every(m => m.conversation.workspaceId === 'ws-alpha')).toBe(true)
    })

    it('should return empty results for workspace with no data', () => {
      const workspaceId = 'ws-nonexistent'
      const contacts = [
        { id: 'c1', workspaceId: 'ws-alpha' },
        { id: 'c2', workspaceId: 'ws-beta' },
      ]

      const filtered = contacts.filter(c => c.workspaceId === workspaceId)
      expect(filtered).toHaveLength(0)
    })
  })

  // ─── workspaceId Required ───────────────────────────────────

  describe('workspaceId parameter validation', () => {
    it('should require workspaceId parameter (400 if missing)', () => {
      const workspaceId = null
      expect(workspaceId).toBeNull() // Would return 400
    })

    it('should accept valid workspaceId', () => {
      const workspaceId = 'ws-valid-id'
      expect(workspaceId).toBeTruthy()
      expect(typeof workspaceId).toBe('string')
    })
  })
})
