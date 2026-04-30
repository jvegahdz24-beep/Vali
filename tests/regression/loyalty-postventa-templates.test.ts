// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Regression Tests: Loyalty + Postventa + Templates
// ═══════════════════════════════════════════════════════════════
// Tests pure logic from all three CRM modules using mocked DB.
// No external dependencies, no real database required.
// ═══════════════════════════════════════════════════════════════

// ─── Mock DB BEFORE importing modules ─────────────────────────

const mockContactFindUnique = jest.fn()
const mockContactUpdate = jest.fn()
const mockDealFindUnique = jest.fn()
const mockConversationFindFirst = jest.fn()
const mockConversationCreate = jest.fn()
const mockFollowUpRuleCreate = jest.fn()
const mockFollowUpTaskCreate = jest.fn()
const mockPipelineFindFirst = jest.fn()
const mockPipelineCreate = jest.fn()
const mockWorkspaceFindUnique = jest.fn()
const mockWorkspaceUpdate = jest.fn()
const mockFollowUpRuleFindFirst = jest.fn()
const mockPipelineStageCreate = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    contact: {
      findUnique: (...args: unknown[]) => mockContactFindUnique(...args),
      update: (...args: unknown[]) => mockContactUpdate(...args),
    },
    deal: {
      findUnique: (...args: unknown[]) => mockDealFindUnique(...args),
    },
    conversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
      create: (...args: unknown[]) => mockConversationCreate(...args),
    },
    followUpRule: {
      create: (...args: unknown[]) => mockFollowUpRuleCreate(...args),
      findFirst: (...args: unknown[]) => mockFollowUpRuleFindFirst(...args),
    },
    followUpTask: {
      create: (...args: unknown[]) => mockFollowUpTaskCreate(...args),
    },
    pipeline: {
      findFirst: (...args: unknown[]) => mockPipelineFindFirst(...args),
      create: (...args: unknown[]) => mockPipelineCreate(...args),
    },
    pipelineStage: {
      create: (...args: unknown[]) => mockPipelineStageCreate(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
  },
}))

// ─── Source imports ───────────────────────────────────────────

import {
  addPoints,
  getLoyaltyTier,
  redeemReward,
  getReferralCode,
  processReferral,
  getLoyaltyStatus,
  POINT_EARNING,
  TIER_NAMES,
} from '@/lib/crm/loyalty'

import {
  generateSurveyMessage,
  generateReviewRequest,
  generateCrossSellSuggestion,
  triggerPostSaleSequence,
  getSequenceMessages,
  POSTVENTA_STEPS,
} from '@/lib/crm/postventa'

import {
  getAvailableTemplates,
  getTemplateById,
  applyTemplate,
} from '@/lib/crm/niche-templates'

// ─── Test Fixtures ───────────────────────────────────────────

const EMPTY_CONTACT = {
  id: '1',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '529844498785',
  email: 'juan@test.com',
  workspaceId: 'ws1',
  customFields: '{}',
  source: 'whatsapp',
  tags: '[]',
  leadScore: 50,
  temperature: 'warm',
  notes: null,
  lastMessageAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// Using 'any' typing for test fixture — matches real DB shape
const DEAL: Record<string, unknown> = {
  id: 'deal1',
  workspaceId: 'ws1',
  pipelineId: 'pipe1',
  stageId: 'stage1',
  contactId: '1',
  title: 'Sentra 2024',
  value: 450000,
  currency: 'MXN',
  description: 'Venta de auto',
  source: 'whatsapp',
  status: 'won',
  metadata: '{"seguro": true, "gps": true}',
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 1: LOYALTY ENGINE
// ═══════════════════════════════════════════════════════════════

describe('Feature 1: Loyalty — Point Accumulation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('adds points to a new contact', async () => {
    mockContactFindUnique.mockResolvedValue({ ...EMPTY_CONTACT })
    mockContactUpdate.mockResolvedValue({})

    await addPoints(1, 50, 'Compra completada')

    expect(mockContactUpdate).toHaveBeenCalledTimes(1)
    const updateCall = mockContactUpdate.mock.calls[0]
    const data = JSON.parse(updateCall[0].data.customFields)
    expect(data.loyaltyPoints).toBe(50)
    expect(data.loyaltyTier).toBe('bronce')
    expect(data.pointsHistory).toHaveLength(1)
    expect(data.pointsHistory[0].reason).toBe('Compra completada')
    expect(data.pointsHistory[0].points).toBe(50)
    expect(data.referralCode).toBeDefined()
    expect(data.referralCode).toHaveLength(6)
  })

  it('accumulates points across multiple calls', async () => {
    // Start with 0
    mockContactFindUnique.mockResolvedValueOnce({ ...EMPTY_CONTACT })
    mockContactUpdate.mockResolvedValueOnce({})

    await addPoints(1, 50, 'Compra')

    // Now has 50 points
    mockContactFindUnique.mockResolvedValueOnce({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 50, loyaltyTier: 'bronce', referralCode: 'ABC123', referralBonusGiven: [], pointsHistory: [] }),
    })
    mockContactUpdate.mockResolvedValueOnce({})

    await addPoints(1, 60, 'Cita')

    const updateCall = mockContactUpdate.mock.calls[1]
    const data = JSON.parse(updateCall[0].data.customFields)
    expect(data.loyaltyPoints).toBe(110)
    expect(data.loyaltyTier).toBe('plata') // 100-499 → plata
  })

  it('ignores negative points (early return)', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 10, loyaltyTier: 'bronce', referralCode: 'TEST1', referralBonusGiven: [], pointsHistory: [] }),
    })
    mockContactUpdate.mockResolvedValue({})

    await addPoints(1, -999, 'Penalización')

    // FIX: addPoints now returns early for points <= 0 (no DB write)
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('does not throw when contact not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)

    await expect(addPoints(999, 50, 'Test')).resolves.toBeUndefined()
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })
})

describe('Feature 1: Loyalty — Tier Calculation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('bronce tier for 0-99 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 0, loyaltyTier: 'bronce', referralCode: 'T', referralBonusGiven: [], pointsHistory: [] }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('bronce')
    expect(tier.benefits).toHaveLength(0)
  })

  it('bronce tier at 99 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 99 }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('bronce')
  })

  it('plata tier at 100 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 100 }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('plata')
    expect(tier.benefits).toContain('5% descuento en próxima compra')
  })

  it('plata tier at 499 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 499 }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('plata')
  })

  it('oro tier at 500 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 500 }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('oro')
    expect(tier.benefits).toContain('10% descuento en próxima compra')
    expect(tier.benefits).toContain('Soporte prioritario')
  })

  it('diamante tier at 1500 points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 1500 }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('diamante')
    expect(tier.benefits).toContain('15% descuento en próxima compra')
    expect(tier.benefits).toContain('Soporte prioritario')
    expect(tier.benefits).toContain('Add-on gratis')
  })

  it('returns bronce when contact not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    const tier = await getLoyaltyTier(999)
    expect(tier.tier).toBe('bronce')
    expect(tier.points).toBe(0)
  })

  it('downgrades tier when points are redeemed below threshold', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 80, loyaltyTier: 'plata', referralCode: 'T', referralBonusGiven: [], pointsHistory: [] }),
    })
    const tier = await getLoyaltyTier(1)
    expect(tier.tier).toBe('bronce')
  })
})

describe('Feature 1: Loyalty — Referral Processing', () => {
  beforeEach(() => jest.clearAllMocks())

  it('gives 100 bonus points on first referral conversion', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 50,
        loyaltyTier: 'bronce',
        referralCode: 'REFER1',
        referralBonusGiven: [],
        pointsHistory: [],
      }),
    })
    mockContactUpdate.mockResolvedValue({})

    const result = await processReferral(1, '529811111111')
    expect(result.bonus).toBe(100)

    const updateCall = mockContactUpdate.mock.calls[0]
    const data = JSON.parse(updateCall[0].data.customFields)
    expect(data.loyaltyPoints).toBe(150)
    expect(data.referralBonusGiven).toContain('529811111111')
  })

  it('does not give duplicate bonus for same phone', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 50,
        loyaltyTier: 'bronce',
        referralCode: 'REFER1',
        referralBonusGiven: ['529811111111'],
        pointsHistory: [],
      }),
    })

    const result = await processReferral(1, '529811111111')
    expect(result.bonus).toBe(0)
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('returns 0 when referrer not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    const result = await processReferral(999, '529811111111')
    expect(result.bonus).toBe(0)
  })
})

describe('Feature 1: Loyalty — Reward Redemption', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redeems reward with sufficient points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 500,
        loyaltyTier: 'oro',
        referralCode: 'T',
        referralBonusGiven: [],
        pointsHistory: [],
      }),
    })
    mockContactUpdate.mockResolvedValue({})

    const result = await redeemReward(1, 'free_addon')
    expect(result.success).toBe(true)
    expect(result.reward).toBe('Add-on gratis')

    const updateCall = mockContactUpdate.mock.calls[0]
    const data = JSON.parse(updateCall[0].data.customFields)
    expect(data.loyaltyPoints).toBe(0) // 500 - 500 = 0
    expect(data.loyaltyTier).toBe('bronce')
  })

  it('fails redemption with insufficient points', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 50,
        loyaltyTier: 'bronce',
        referralCode: 'T',
        referralBonusGiven: [],
        pointsHistory: [],
      }),
    })

    const result = await redeemReward(1, 'free_addon') // costs 500
    expect(result.success).toBe(false)
    expect(result.reward).toBe('')
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('fails redemption for unknown reward type', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 9999,
        loyaltyTier: 'diamante',
        referralCode: 'T',
        referralBonusGiven: [],
        pointsHistory: [],
      }),
    })

    const result = await redeemReward(1, 'nonexistent_reward')
    expect(result.success).toBe(false)
  })

  it('fails redemption when contact not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    const result = await redeemReward(999, 'discount_5')
    expect(result.success).toBe(false)
  })
})

describe('Feature 1: Loyalty — Referral Code Generation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generates new code when none exists', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: '{}',
    })
    mockContactUpdate.mockResolvedValue({})

    const code = await getReferralCode(1)
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('returns existing code if already set', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({ loyaltyPoints: 0, loyaltyTier: 'bronce', referralCode: 'EXIST1', referralBonusGiven: [], pointsHistory: [] }),
    })

    const code = await getReferralCode(1)
    expect(code).toBe('EXIST1')
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('returns empty string when contact not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    const code = await getReferralCode(999)
    expect(code).toBe('')
  })
})

describe('Feature 1: Loyalty — Point Earning Constants', () => {
  it('exports correct point values', () => {
    expect(POINT_EARNING.purchaseCompleted).toBe(50)
    expect(POINT_EARNING.appointmentAttended).toBe(20)
    expect(POINT_EARNING.fastResponse).toBe(5)
    expect(POINT_EARNING.referralConversion).toBe(100)
  })

  it('exports all tier names', () => {
    expect(TIER_NAMES).toEqual(['bronce', 'plata', 'oro', 'diamante'])
  })
})

describe('Feature 1: Loyalty — Full Status API', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns complete loyalty status', async () => {
    mockContactFindUnique.mockResolvedValue({
      ...EMPTY_CONTACT,
      customFields: JSON.stringify({
        loyaltyPoints: 500,
        loyaltyTier: 'oro',
        referralCode: 'STATUS1',
        referralBonusGiven: [],
        pointsHistory: [
          { points: 50, reason: 'Compra', date: '2025-01-01T00:00:00Z' },
          { points: 100, reason: 'Referido', date: '2025-01-02T00:00:00Z' },
        ],
      }),
    })

    const status = await getLoyaltyStatus(1)
    expect(status.points).toBe(500)
    expect(status.tier).toBe('oro')
    expect(status.benefits.length).toBeGreaterThan(0)
    expect(status.referralCode).toBe('STATUS1')
    expect(status.history).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// FEATURE 2: POSTVENTA AUTOMATIZADO
// ═══════════════════════════════════════════════════════════════

describe('Feature 2: Postventa — Sequence Generation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('POSTVENTA_STEPS has correct 6 steps', () => {
    expect(POSTVENTA_STEPS).toHaveLength(6)
    expect(POSTVENTA_STEPS[0].label).toBe('thank_you')
    expect(POSTVENTA_STEPS[0].delayHours).toBe(0)
    expect(POSTVENTA_STEPS[1].label).toBe('satisfaction_survey')
    expect(POSTVENTA_STEPS[1].delayHours).toBe(24)
    expect(POSTVENTA_STEPS[2].delayHours).toBe(72)   // 3 days
    expect(POSTVENTA_STEPS[3].delayHours).toBe(168)   // 7 days
    expect(POSTVENTA_STEPS[4].delayHours).toBe(720)   // 30 days
    expect(POSTVENTA_STEPS[5].delayHours).toBe(1440)  // 60 days
  })

  it('triggerPostSaleSequence creates FollowUpRule + 6 FollowUpTasks', async () => {
    const contact = { ...EMPTY_CONTACT, customFields: '{}' }
    mockContactFindUnique.mockResolvedValue(contact)
    mockDealFindUnique.mockResolvedValue(DEAL)
    mockConversationFindFirst.mockResolvedValue({
      id: 'conv1',
      workspaceId: 'ws1',
      contactId: '1',
    })
    mockFollowUpRuleCreate.mockResolvedValue({ id: 'rule1' })
    mockFollowUpTaskCreate.mockResolvedValue({ id: 'task1' })

    await triggerPostSaleSequence(1, 1)

    expect(mockContactFindUnique).toHaveBeenCalledWith({ where: { id: '1' } })
    expect(mockDealFindUnique).toHaveBeenCalledWith({ where: { id: '1' } })
    expect(mockFollowUpRuleCreate).toHaveBeenCalledTimes(1)

    // Should create 6 tasks (one per sequence step)
    expect(mockFollowUpTaskCreate).toHaveBeenCalledTimes(6)

    // Each task should reference the contact and rule
    for (const call of mockFollowUpTaskCreate.mock.calls) {
      expect(call[0].data.contactId).toBe('1')
      expect(call[0].data.ruleId).toBe('rule1')
      expect(call[0].data.status).toBe('pending')
      expect(call[0].data.scheduledAt).toBeInstanceOf(Date)
    }
  })

  it('triggerPostSaleSequence creates conversation if none exists', async () => {
    mockContactFindUnique.mockResolvedValue(EMPTY_CONTACT)
    mockDealFindUnique.mockResolvedValue(DEAL)
    mockConversationFindFirst.mockResolvedValue(null)
    mockConversationCreate.mockResolvedValue({ id: 'conv-new', workspaceId: 'ws1', contactId: '1' })
    mockFollowUpRuleCreate.mockResolvedValue({ id: 'rule1' })
    mockFollowUpTaskCreate.mockResolvedValue({})

    await triggerPostSaleSequence(1, 1)

    expect(mockConversationCreate).toHaveBeenCalledTimes(1)
    expect(mockConversationCreate.mock.calls[0][0].data.workspaceId).toBe('ws1')
    expect(mockConversationCreate.mock.calls[0][0].data.contactId).toBe('1')
  })

  it('triggerPostSaleSequence handles missing contact gracefully', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    mockDealFindUnique.mockResolvedValue(null)

    await expect(triggerPostSaleSequence(999, 1)).resolves.toBeUndefined()
    // When both contact and deal are missing, nothing should be created
    expect(mockFollowUpRuleCreate).not.toHaveBeenCalled()
  })

  it('triggerPostSaleSequence handles missing deal gracefully', async () => {
    mockContactFindUnique.mockResolvedValue(EMPTY_CONTACT)
    mockDealFindUnique.mockResolvedValue(null)

    await expect(triggerPostSaleSequence(1, 999)).resolves.toBeUndefined()
    // When deal is missing but contact exists, nothing should be created
    expect(mockFollowUpRuleCreate).not.toHaveBeenCalled()
  })
})

describe('Feature 2: Postventa — Survey Messages', () => {
  it('generates personalized satisfaction survey', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'María' }
    const deal = { ...DEAL, title: 'Nissan Sentra 2024' }
    const msg = generateSurveyMessage(contact, deal)

    expect(msg).toContain('María')
    expect(msg).toContain('Nissan Sentra 2024')
    expect(msg).toContain('Califica')
    expect(msg).toContain('1 al 5')
  })

  it('generates review request message', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'Carlos' }
    const msg = generateReviewRequest(contact)

    expect(msg).toContain('Carlos')
    expect(msg).toContain('reseña')
    expect(msg).toContain('Google')
    expect(msg).toContain('Facebook')
  })
})

describe('Feature 2: Postventa — Cross-Sell Suggestions', () => {
  it('generates seguro-related suggestions when deal mentions seguro', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'Ana' }
    const deal = { ...DEAL, description: 'Venta de seguro de auto', metadata: 'seguro' }
    const msg = generateCrossSellSuggestion(contact, deal)

    expect(msg).toContain('Ana')
    expect(msg).toContain('Seguro de vida')
  })

  it('generates GPS-related suggestions when deal mentions GPS', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'Luis' }
    const deal = { ...DEAL, description: 'Instalación de GPS', metadata: '{}' }
    const msg = generateCrossSellSuggestion(contact, deal)

    expect(msg).toContain('Luis')
    expect(msg).toContain('GPS')
  })

  it('falls back to default suggestions when no keywords match', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'Pedro' }
    const deal = { ...DEAL, description: 'Servicio de limpieza', metadata: '{}' }
    const msg = generateCrossSellSuggestion(contact, deal)

    expect(msg).toContain('Pedro')
    expect(msg).toContain('mantenimiento')
  })
})

describe('Feature 2: Postventa — Sequence Messages Preview', () => {
  it('returns all 6 sequence messages with labels', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'Test' }
    const deal = { ...DEAL, title: 'Test Deal' }
    const messages = getSequenceMessages(contact, deal)

    expect(messages).toHaveLength(6)
    expect(messages[0].label).toBe('thank_you')
    expect(messages[0].delayLabel).toBe('Inmediato')
    expect(messages[1].label).toBe('satisfaction_survey')
    expect(messages[1].delayLabel).toBe('24 horas después')
    expect(messages[2].delayLabel).toBe('3 días después')
    expect(messages[3].delayLabel).toBe('7 días después')
    expect(messages[4].delayLabel).toBe('30 días después')
    expect(messages[5].delayLabel).toBe('60 días después')

    // All messages should contain personalization
    for (const m of messages) {
      expect(m.message).toBeTruthy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// FEATURE 3: NICHE TEMPLATES
// ═══════════════════════════════════════════════════════════════

describe('Feature 3: Templates — Template Listing', () => {
  it('returns all 8 templates', () => {
    const templates = getAvailableTemplates()
    expect(templates).toHaveLength(8)
  })

  it('includes all expected template IDs', () => {
    const templates = getAvailableTemplates()
    const ids = templates.map(t => t.id)
    expect(ids).toContain('automotriz')
    expect(ids).toContain('inmobiliaria')
    expect(ids).toContain('salud')
    expect(ids).toContain('restaurante')
    expect(ids).toContain('educacion')
    expect(ids).toContain('legal')
    expect(ids).toContain('tienda')
    expect(ids).toContain('generico')
  })

  it('each template has required fields', () => {
    const templates = getAvailableTemplates()
    for (const t of templates) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.industry).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.systemPrompt).toBeTruthy()
      expect(t.scoringRules).toBeDefined()
      expect(t.scoringRules.highValueSignals).toBeInstanceOf(Array)
      expect(t.scoringRules.negativeSignals).toBeInstanceOf(Array)
      expect(t.followUpTemplates).toBeInstanceOf(Array)
      expect(t.pipelineStages).toBeInstanceOf(Array)
    }
  })

  it('each template has at least one pipeline stage with isWon=true and one with isLost=true', () => {
    const templates = getAvailableTemplates()
    for (const t of templates) {
      const won = t.pipelineStages.some(s => s.isWon)
      const lost = t.pipelineStages.some(s => s.isLost)
      expect(won).toBe(true)
      expect(lost).toBe(true)
    }
  })

  it('automotriz template has auto-specific signals', () => {
    const template = getTemplateById('automotriz')!
    expect(template.scoringRules.highValueSignals).toContain('prueba de manejo')
    expect(template.scoringRules.highValueSignals).toContain('financiamiento')
    expect(template.scoringRules.highValueSignals).toContain('seguro')
  })
})

describe('Feature 3: Templates — getTemplateById', () => {
  it('returns template by id', () => {
    const t = getTemplateById('salud')
    expect(t).toBeDefined()
    expect(t!.name).toContain('Médico')
  })

  it('returns undefined for unknown id', () => {
    const t = getTemplateById('nonexistent')
    expect(t).toBeUndefined()
  })
})

describe('Feature 3: Templates — Template Application to Workspace', () => {
  beforeEach(() => jest.clearAllMocks())

  it('applies template successfully when workspace has no pipeline', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      id: 'ws1',
      name: 'Test Workspace',
      slug: 'test',
      industry: 'automotive',
      settings: '{}',
    })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockPipelineFindFirst.mockResolvedValue(null)
    mockPipelineCreate.mockResolvedValue({ id: 'pipe1' })

    const result = await applyTemplate('ws1', 'automotriz')
    expect(result.success).toBe(true)

    // Should update workspace
    expect(mockWorkspaceUpdate).toHaveBeenCalledTimes(1)
    const updateCall = mockWorkspaceUpdate.mock.calls[0]
    expect(updateCall[0].where.id).toBe('ws1')
    const settings = JSON.parse(updateCall[0].data.settings)
    expect(settings.niche).toBe('automotriz')
    expect(settings.scoringRules).toBeDefined()

    // Should create pipeline
    expect(mockPipelineCreate).toHaveBeenCalledTimes(1)
  })

  it('returns error for unknown template', async () => {
    const result = await applyTemplate('ws1', 'nonexistent_template')
    expect(result.success).toBe(false)
    expect(result.error).toContain('no encontrado')
  })

  it('returns error when workspace not found', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(null)

    const result = await applyTemplate('ws999', 'automotriz')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Workspace')
  })

  it('creates follow-up rules if they do not exist', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      industry: 'generic',
      settings: '{}',
    })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockPipelineFindFirst.mockResolvedValue({
      id: 'pipe1',
      workspaceId: 'ws1',
      stages: [{ id: 's1' }], // Has stages, skip creation
    })
    mockFollowUpRuleFindFirst.mockResolvedValue(null) // No existing rules
    mockFollowUpRuleCreate.mockResolvedValue({ id: 'rule1' })

    const result = await applyTemplate('ws1', 'generico')
    expect(result.success).toBe(true)

    // Should try to create follow-up rules (2 for generico template)
    expect(mockFollowUpRuleFindFirst).toHaveBeenCalled()
    expect(mockFollowUpRuleCreate).toHaveBeenCalled()
  })

  it('skips follow-up rules if they already exist', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      industry: 'generic',
      settings: '{}',
    })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockPipelineFindFirst.mockResolvedValue({
      id: 'pipe1',
      workspaceId: 'ws1',
      stages: [{ id: 's1' }],
    })
    mockFollowUpRuleFindFirst.mockResolvedValue({ id: 'existing-rule' }) // Already exists

    const result = await applyTemplate('ws1', 'generico')
    expect(result.success).toBe(true)

    // Should NOT create new rules
    expect(mockFollowUpRuleCreate).not.toHaveBeenCalled()
  })

  it('adds stages to existing empty pipeline', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      industry: 'generic',
      settings: '{}',
    })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockPipelineFindFirst.mockResolvedValue({
      id: 'pipe1',
      workspaceId: 'ws1',
      stages: [], // Empty
    })
    mockPipelineStageCreate.mockResolvedValue({ id: 'stage1' })
    mockFollowUpRuleFindFirst.mockResolvedValue({ id: 'existing' })

    const result = await applyTemplate('ws1', 'salud')
    expect(result.success).toBe(true)

    // Should create stages (salud has 5 stages)
    expect(mockPipelineStageCreate).toHaveBeenCalledTimes(5)
  })
})

// ═══════════════════════════════════════════════════════════════
// CROSS-FEATURE INTEGRATION
// ═══════════════════════════════════════════════════════════════

describe('Cross-feature: Loyalty + Postventa + Templates', () => {
  it('all modules export expected functions', () => {
    // Loyalty
    expect(typeof addPoints).toBe('function')
    expect(typeof getLoyaltyTier).toBe('function')
    expect(typeof redeemReward).toBe('function')
    expect(typeof getReferralCode).toBe('function')
    expect(typeof processReferral).toBe('function')
    expect(typeof getLoyaltyStatus).toBe('function')

    // Postventa
    expect(typeof generateSurveyMessage).toBe('function')
    expect(typeof generateReviewRequest).toBe('function')
    expect(typeof generateCrossSellSuggestion).toBe('function')
    expect(typeof triggerPostSaleSequence).toBe('function')
    expect(typeof getSequenceMessages).toBe('function')

    // Templates
    expect(typeof getAvailableTemplates).toBe('function')
    expect(typeof getTemplateById).toBe('function')
    expect(typeof applyTemplate).toBe('function')
  })

  it('postventa messages personalize correctly with contact names', () => {
    const contact = { ...EMPTY_CONTACT, firstName: 'García-López' }
    const deal = { ...DEAL, title: 'Toyota Corolla 2024' }

    const survey = generateSurveyMessage(contact, deal)
    const review = generateReviewRequest(contact)
    const crossSell = generateCrossSellSuggestion(contact, deal)
    const messages = getSequenceMessages(contact, deal)

    expect(survey).toContain('García-López')
    expect(review).toContain('García-López')
    expect(crossSell).toContain('García-López')
    for (const m of messages) {
      expect(m.message.length).toBeGreaterThan(0)
    }
  })
})
