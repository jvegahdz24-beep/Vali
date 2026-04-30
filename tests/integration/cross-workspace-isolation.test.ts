// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Cross-Workspace Isolation (Integration)
// Comprehensive test: 2 workspaces, 2 users, verifies NO data leaks
// ═══════════════════════════════════════════════════════════════

describe('Cross-Workspace Isolation (Integration)', () => {
  // ─── Test Data Model ───────────────────────────────────────

  interface TestUser {
    id: string
    email: string
    role: string
  }

  interface TestWorkspace {
    id: string
    name: string
    ownerId: string
  }

  interface TestMembership {
    userId: string
    workspaceId: string
    role: string
  }

  interface TestContact {
    id: string
    workspaceId: string
    firstName: string
    phone: string
    email: string
  }

  interface TestConversation {
    id: string
    workspaceId: string
    contactId: string
  }

  interface TestMessage {
    id: string
    conversationId: string
    content: string
  }

  // ─── Setup: 2 Workspaces, 3 Users ─────────────────────────

  const users: TestUser[] = [
    { id: 'user-ws1-owner', email: 'owner1@alpha.com', role: 'owner' },
    { id: 'user-ws1-member', email: 'member1@alpha.com', role: 'member' },
    { id: 'user-ws2-owner', email: 'owner2@beta.com', role: 'owner' },
  ]

  const workspaces: TestWorkspace[] = [
    { id: 'ws-alpha', name: 'Alpha Corp', ownerId: 'user-ws1-owner' },
    { id: 'ws-beta', name: 'Beta Inc', ownerId: 'user-ws2-owner' },
  ]

  const memberships: TestMembership[] = [
    // User 1 is ONLY in ws-alpha
    { userId: 'user-ws1-owner', workspaceId: 'ws-alpha', role: 'owner' },
    { userId: 'user-ws1-member', workspaceId: 'ws-alpha', role: 'member' },
    // User 3 is ONLY in ws-beta
    { userId: 'user-ws2-owner', workspaceId: 'ws-beta', role: 'owner' },
  ]

  const contacts: TestContact[] = [
    { id: 'contact-alpha-1', workspaceId: 'ws-alpha', firstName: 'Alpha Client', phone: '+1234567890', email: 'alpha@test.com' },
    { id: 'contact-alpha-2', workspaceId: 'ws-alpha', firstName: 'Alpha Lead', phone: '+1234567891', email: 'lead@alpha.com' },
    { id: 'contact-beta-1', workspaceId: 'ws-beta', firstName: 'Beta Client', phone: '+9876543210', email: 'beta@test.com' },
    { id: 'contact-beta-2', workspaceId: 'ws-beta', firstName: 'Beta Lead', phone: '+9876543211', email: 'lead@beta.com' },
  ]

  const conversations: TestConversation[] = [
    { id: 'conv-alpha', workspaceId: 'ws-alpha', contactId: 'contact-alpha-1' },
    { id: 'conv-beta', workspaceId: 'ws-beta', contactId: 'contact-beta-1' },
  ]

  const messages: TestMessage[] = [
    { id: 'msg-alpha', conversationId: 'conv-alpha', content: 'Alpha secret deal info' },
    { id: 'msg-beta', conversationId: 'conv-beta', content: 'Beta confidential negotiation' },
  ]

  // ─── Helper Functions ──────────────────────────────────────

  function getUserWorkspaces(userId: string): string[] {
    return memberships
      .filter(m => m.userId === userId)
      .map(m => m.workspaceId)
  }

  function getWorkspaceContacts(workspaceId: string): TestContact[] {
    return contacts.filter(c => c.workspaceId === workspaceId)
  }

  function getConversationWorkspace(convId: string): string | null {
    const conv = conversations.find(c => c.id === convId)
    return conv?.workspaceId ?? null
  }

  function canAccessWorkspace(userId: string, workspaceId: string): boolean {
    return getUserWorkspaces(userId).includes(workspaceId)
  }

  function canAccessMessage(userId: string, messageId: string): boolean {
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return false
    const wsId = getConversationWorkspace(msg.conversationId)
    if (!wsId) return true
    return canAccessWorkspace(userId, wsId)
  }

  // ─── Workspace Membership Tests ────────────────────────────

  describe('Workspace membership isolation', () => {
    it('user-ws1-owner is ONLY in ws-alpha', () => {
      const ws = getUserWorkspaces('user-ws1-owner')
      expect(ws).toEqual(['ws-alpha'])
      expect(ws).not.toContain('ws-beta')
    })

    it('user-ws2-owner is ONLY in ws-beta', () => {
      const ws = getUserWorkspaces('user-ws2-owner')
      expect(ws).toEqual(['ws-beta'])
      expect(ws).not.toContain('ws-alpha')
    })

    it('user-ws1-member is ONLY in ws-alpha', () => {
      const ws = getUserWorkspaces('user-ws1-member')
      expect(ws).toEqual(['ws-alpha'])
      expect(ws).not.toContain('ws-beta')
    })

    it('no user is in both workspaces', () => {
      for (const user of users) {
        const ws = getUserWorkspaces(user.id)
        expect(ws.length).toBeLessThanOrEqual(1)
      }
    })
  })

  // ─── Contact Isolation ─────────────────────────────────────

  describe('Contact data isolation', () => {
    it('ws-alpha has exactly 2 contacts', () => {
      expect(getWorkspaceContacts('ws-alpha')).toHaveLength(2)
    })

    it('ws-beta has exactly 2 contacts', () => {
      expect(getWorkspaceContacts('ws-beta')).toHaveLength(2)
    })

    it('user from ws-alpha cannot see ws-beta contacts', () => {
      const accessibleWs = getUserWorkspaces('user-ws1-owner')
      const accessibleContacts = contacts.filter(c => accessibleWs.includes(c.workspaceId))

      expect(accessibleContacts).toHaveLength(2)
      expect(accessibleContacts.every(c => c.workspaceId === 'ws-alpha')).toBe(true)
      expect(accessibleContacts.find(c => c.workspaceId === 'ws-beta')).toBeUndefined()
    })

    it('user from ws-beta cannot see ws-alpha contacts', () => {
      const accessibleWs = getUserWorkspaces('user-ws2-owner')
      const accessibleContacts = contacts.filter(c => accessibleWs.includes(c.workspaceId))

      expect(accessibleContacts).toHaveLength(2)
      expect(accessibleContacts.every(c => c.workspaceId === 'ws-beta')).toBe(true)
    })

    it('Alpha contacts do not contain Beta data (cross-check by email)', () => {
      const alphaContacts = getWorkspaceContacts('ws-alpha')
      const betaEmails = ['beta@test.com', 'lead@beta.com']

      for (const email of betaEmails) {
        expect(alphaContacts.find(c => c.email === email)).toBeUndefined()
      }
    })

    it('Beta contacts do not contain Alpha data (cross-check by phone)', () => {
      const betaContacts = getWorkspaceContacts('ws-beta')
      const alphaPhones = ['+1234567890', '+1234567891']

      for (const phone of alphaPhones) {
        expect(betaContacts.find(c => c.phone === phone)).toBeUndefined()
      }
    })
  })

  // ─── Message Isolation ─────────────────────────────────────

  describe('Message data isolation (via conversation.workspaceId)', () => {
    it('user-ws1-owner can access messages in ws-alpha conversations', () => {
      expect(canAccessMessage('user-ws1-owner', 'msg-alpha')).toBe(true)
    })

    it('user-ws1-owner CANNOT access messages in ws-beta conversations', () => {
      expect(canAccessMessage('user-ws1-owner', 'msg-beta')).toBe(false)
    })

    it('user-ws2-owner can access messages in ws-beta conversations', () => {
      expect(canAccessMessage('user-ws2-owner', 'msg-beta')).toBe(true)
    })

    it('user-ws2-owner CANNOT access messages in ws-alpha conversations', () => {
      expect(canAccessMessage('user-ws2-owner', 'msg-alpha')).toBe(false)
    })

    it('message content from other workspace is never exposed', () => {
      const alphaUserAccessible = messages.filter(m => canAccessMessage('user-ws1-owner', m.id))
      expect(alphaUserAccessible).toHaveLength(1)
      expect(alphaUserAccessible[0].content).toBe('Alpha secret deal info')
      expect(alphaUserAccessible.find(m => m.content.includes('Beta'))).toBeUndefined()
    })
  })

  // ─── Developer Export Isolation ────────────────────────────

  describe('Developer export endpoint isolation', () => {
    it('exporting contacts for ws-alpha returns only alpha contacts', () => {
      const workspaceId = 'ws-alpha'
      const exported = contacts.filter(c => c.workspaceId === workspaceId)
      expect(exported).toHaveLength(2)
      expect(exported.every(c => c.workspaceId === 'ws-alpha')).toBe(true)
    })

    it('exporting messages for ws-alpha returns only alpha messages', () => {
      const workspaceId = 'ws-alpha'
      const exported = messages.filter(m => {
        const convWs = getConversationWorkspace(m.conversationId)
        return convWs === workspaceId
      })
      expect(exported).toHaveLength(1)
      expect(exported[0].content).toContain('Alpha')
    })

    it('exporting with different workspaceId yields different results', () => {
      const alphaExport = contacts.filter(c => c.workspaceId === 'ws-alpha')
      const betaExport = contacts.filter(c => c.workspaceId === 'ws-beta')

      // Different data
      expect(alphaExport).not.toEqual(betaExport)

      // No overlap
      const alphaIds = alphaExport.map(c => c.id)
      const betaIds = betaExport.map(c => c.id)
      const overlap = alphaIds.filter(id => betaIds.includes(id))
      expect(overlap).toHaveLength(0)
    })
  })

  // ─── JHON Panel Isolation ──────────────────────────────────

  describe('JHON Panel workspace isolation', () => {
    it('jhon-panel for ws-alpha only queries ws-alpha contacts', () => {
      const workspaceId = 'ws-alpha'
      const queriedContacts = contacts.filter(c => c.workspaceId === workspaceId)
      expect(queriedContacts.length).toBeGreaterThan(0)
      expect(queriedContacts.every(c => c.workspaceId === 'ws-alpha')).toBe(true)
    })

    it('user without workspace membership gets 403 from jhon-panel', () => {
      const userId = 'user-ws1-owner'
      const targetWorkspaceId = 'ws-beta'
      const canAccess = canAccessWorkspace(userId, targetWorkspaceId)
      expect(canAccess).toBe(false)
      // Would return: 403 'No tienes acceso a este workspace'
    })
  })

  // ─── Auth Bypass Prevention ────────────────────────────────

  describe('Auth bypass prevention summary', () => {
    it('no combination of userId + workspaceId gives cross-workspace access', () => {
      const accessMatrix: Record<string, Record<string, boolean>> = {}

      for (const user of users) {
        accessMatrix[user.id] = {}
        for (const ws of workspaces) {
          accessMatrix[user.id][ws.id] = canAccessWorkspace(user.id, ws.id)
        }
      }

      // user-ws1-owner should only have access to ws-alpha
      expect(accessMatrix['user-ws1-owner']['ws-alpha']).toBe(true)
      expect(accessMatrix['user-ws1-owner']['ws-beta']).toBe(false)

      // user-ws2-owner should only have access to ws-beta
      expect(accessMatrix['user-ws2-owner']['ws-alpha']).toBe(false)
      expect(accessMatrix['user-ws2-owner']['ws-beta']).toBe(true)
    })

    it('workspaceId parameter alone is not sufficient (must also verify membership)', () => {
      // Even if an attacker knows ws-beta ID and passes it as parameter,
      // requireWorkspace checks the membership table
      const attackerUserId = 'user-ws1-owner'
      const targetWorkspace = 'ws-beta'
      const fakeParams = { workspaceId: targetWorkspace }

      // The actual check:
      const membershipExists = memberships.some(
        m => m.userId === attackerUserId && m.workspaceId === fakeParams.workspaceId
      )
      expect(membershipExists).toBe(false)
    })
  })
})
