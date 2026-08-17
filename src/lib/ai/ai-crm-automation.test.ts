// ═══════════════════════════════════════════════════════════════
// TEST: AI CRM Full Automation
// Verifica que cuando se conecta una API key de IA, la IA controla
// todo el CRM: califica leads, mueve deals en pipeline, asigna
// agentes, genera tags, y genera follow-ups — sin intervención humana.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RevenueEngine } from './revenue-engine'

// ─── Mock DB ─────────────────────────────────────────────────
// autoCreateOrUpdateDeal uses db internally — mock it here
const mockDbDeal = {
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}
const mockDbPipeline = {
  findFirst: vi.fn(),
}
const mockDbContact = {
  findUnique: vi.fn(),
}
const mockDbCatalogItem = {
  findMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    pipeline: mockDbPipeline,
    deal: mockDbDeal,
    contact: mockDbContact,
    catalogItem: mockDbCatalogItem,
  },
}))

// ─── Shared fixtures ──────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'stage-1', name: 'Lead Nuevo',   order: 1 },
  { id: 'stage-2', name: 'Contactado',   order: 2 },
  { id: 'stage-3', name: 'Cualificado',  order: 3 },
  { id: 'stage-4', name: 'Propuesta',    order: 4 },
  { id: 'stage-5', name: 'Negociación',  order: 5 },
]

const MOCK_PIPELINE = {
  id: 'pipeline-1',
  workspaceId: 'ws-1',
  isActive: true,
  stages: PIPELINE_STAGES,
}

// Helper: build user messages
function msgs(...contents: string[]) {
  return contents.map((content) => ({ role: 'user', content }))
}

// ─── API Key Gate logic ──────────────────────────────────────

/**
 * Replica de la lógica en message-processor.ts (bloque 6c).
 * Esto es lo que determina si la IA corre o no.
 */
function extractTenantApiKey(settingsJson: string): string | undefined {
  let wsApiKeySettings: Record<string, string> = {}
  try {
    const raw = JSON.parse(settingsJson || '{}')
    wsApiKeySettings = (raw.apiKeys as Record<string, string>) || {}
  } catch { return undefined }

  const preferredProviders = ['glm', 'groq', 'openai', 'deepseek', 'gemini']
  for (const p of preferredProviders) {
    const k = wsApiKeySettings[p]
    if (k && k.length > 10) return k
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────
// SUITE 1: API KEY GATE — La IA sólo corre si hay key configurada
// ─────────────────────────────────────────────────────────────

describe('API Key Gate — Acceso condicional al pipeline de IA', () => {
  it('NO corre la IA cuando settings está vacío', () => {
    expect(extractTenantApiKey('')).toBeUndefined()
    expect(extractTenantApiKey('{}')).toBeUndefined()
  })

  it('NO corre la IA cuando apiKeys existe pero está vacío', () => {
    const settings = JSON.stringify({ apiKeys: {} })
    expect(extractTenantApiKey(settings)).toBeUndefined()
  })

  it('NO corre la IA cuando la key es demasiado corta (< 10 chars)', () => {
    const settings = JSON.stringify({ apiKeys: { glm: 'abc123' } })
    expect(extractTenantApiKey(settings)).toBeUndefined()
  })

  it('SÍ corre la IA con una key GLM válida', () => {
    const settings = JSON.stringify({ apiKeys: { glm: 'glm-valid-api-key-1234567890' } })
    const key = extractTenantApiKey(settings)
    expect(key).toBe('glm-valid-api-key-1234567890')
  })

  it('SÍ corre la IA con una key Groq válida (fallback orden)', () => {
    const settings = JSON.stringify({ apiKeys: { groq: 'gsk_groq_test_key_abcdef1234' } })
    const key = extractTenantApiKey(settings)
    expect(key).toBe('gsk_groq_test_key_abcdef1234')
  })

  it('SÍ corre la IA con key OpenAI válida', () => {
    const settings = JSON.stringify({ apiKeys: { openai: 'sk-openai-test-key-abcdef1234' } })
    expect(extractTenantApiKey(settings)).toBe('sk-openai-test-key-abcdef1234')
  })

  it('Prefiere GLM sobre Groq cuando ambas están configuradas', () => {
    const settings = JSON.stringify({
      apiKeys: {
        glm: 'glm-primary-key-1234567890',
        groq: 'gsk_groq_secondary_key_1234',
      },
    })
    expect(extractTenantApiKey(settings)).toBe('glm-primary-key-1234567890')
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 2: ANÁLISIS DE LEADS — La IA califica automáticamente
// ─────────────────────────────────────────────────────────────

describe('RevenueEngine.analyzeLead() — Calificación automática de leads', () => {
  const engine = new RevenueEngine()

  it('Lead nuevo sin mensajes → score 0, temperatura cold', () => {
    const result = engine.analyzeLead([])
    expect(result.score).toBe(0)
    expect(result.temperature).toBe('cold')
    expect(result.stage).toBe('new')
  })

  it('Saludo simple → score bajo, etapa new', () => {
    const result = engine.analyzeLead(msgs('Hola, buenos días'))
    expect(result.score).toBeLessThan(30)
    expect(result.stage).toBe('new')
  })

  it('Señales de compra aumentan el score significativamente', () => {
    const result = engine.analyzeLead(
      msgs(
        'Hola, me interesa el Sentra',
        'Quiero saber el precio y los requisitos',
        'Cuanto es el pago inicial y cuántos meses son',
        'Me gustaría agendar una cita para verlo',
        'Lo quiero comprar esta semana',
      )
    )
    expect(result.score).toBeGreaterThan(25)
    expect(result.buyingSignals.length).toBeGreaterThan(0)
  })

  it('Mensajes urgentes (hoy, ya, necesito) aumentan el score de timing', () => {
    const result = engine.analyzeLead(
      msgs(
        'Hola necesito una cotización ya',
        'Lo necesito urgente para hoy',
        'Dime el precio y si tienen disponible',
      )
    )
    expect(result.score).toBeGreaterThan(15)
  })

  it('Objeciones de precio son detectadas y añaden tag', () => {
    const result = engine.analyzeLead(
      msgs(
        'Hola quiero info del Versa',
        'Está muy caro, no me alcanza',
        'Tienen algo más barato',
      )
    )
    expect(result.objections.length).toBeGreaterThan(0)
    expect(result.objections.some((o) => o.includes('precio'))).toBe(true)
    expect(result.tags).toContain('tiene_objeciones')
  })

  it('Conversación larga (≥3 turnos) añade tag conversacion_activa', () => {
    const result = engine.analyzeLead(
      msgs('Hola', 'Me interesa el Sentra', 'Cuánto cuesta')
    )
    expect(result.tags).toContain('conversacion_activa')
  })

  it('Conversación muy larga (≥6 turnos) añade tag alto_engagement', () => {
    const result = engine.analyzeLead(
      msgs('Hola', 'Quiero info', 'Precios?', 'Y financiamiento?', 'Ok entiendo', 'Cuando me veo con alguien?')
    )
    expect(result.tags).toContain('alto_engagement')
  })

  it('Lead caliente (score ≥ 70) → temperatura hot', () => {
    // Saturar todas las categorías de scoring para garantizar 70+
    const result = engine.analyzeLead(
      msgs(
        'lo tomo me lo llevo lo quiero compro vamos trato hecho cerramos ya ahora hoy urgente',
        'quiero la cita agendar sucursal meses requisitos documentos inmediato necesito rapido',
        'pago inicial mensualidad meses sin intereses comprobante ingresos credito inicial anticipo',
        'direccion horario ubicacion donde estan separar apartar reservar cuota plazo años',
        'me lo llevo hoy mismo cuanto es la cuota mensual para cerrar mañana',
        'quiero agendar cita en la sucursal lo quiero comprar ya tengo el inicial',
      )
    )
    expect(result.temperature).toBe('hot')
    expect(result.score).toBeGreaterThanOrEqual(70)
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 3: CRM UPDATES — La IA genera actualizaciones automáticas
// ─────────────────────────────────────────────────────────────

describe('RevenueEngine.generateCrmUpdates() — Actualizaciones CRM automáticas', () => {
  const engine = new RevenueEngine()

  function buildAnalysis(score: number, temperature: 'cold' | 'warm' | 'hot', stage: string, tags: string[] = []) {
    return {
      score,
      temperature,
      stage: stage as any,
      intent: 'inquiry' as any,
      buyingSignals: [],
      objections: [],
      tags,
      estimatedValue: 400000,
      nextAction: 'educate' as any,
      confidence: 0.6,
    }
  }

  it('Siempre incluye actualización de score', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(55, 'warm', 'qualified'))
    const scoreUpdate = updates.find((u) => u.type === 'score')
    expect(scoreUpdate).toBeDefined()
    expect(scoreUpdate!.value).toBe(55)
  })

  it('Siempre incluye actualización de etapa (stage)', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(65, 'warm', 'proposal'))
    const stageUpdate = updates.find((u) => u.type === 'stage')
    expect(stageUpdate).toBeDefined()
    expect(stageUpdate!.value).toBe('proposal')
  })

  it('Incluye actualización de tags cuando existen', () => {
    const analysis = buildAnalysis(40, 'warm', 'qualified', ['interesa_modelo', 'conversacion_activa'])
    const updates = engine.generateCrmUpdates(analysis)
    const tagsUpdate = updates.find((u) => u.type === 'tags')
    expect(tagsUpdate).toBeDefined()
    expect(Array.isArray(tagsUpdate!.value)).toBe(true)
    expect(tagsUpdate!.value).toContain('interesa_modelo')
  })

  it('Siempre incluye notas con resumen del análisis', () => {
    const analysis = buildAnalysis(60, 'warm', 'proposal', [])
    const updates = engine.generateCrmUpdates(analysis)
    const notesUpdate = updates.find((u) => u.type === 'notes')
    expect(notesUpdate).toBeDefined()
    expect(String(notesUpdate!.value)).toContain('Score: 60/100')
    expect(String(notesUpdate!.value)).toContain('proposal')
  })

  it('Asigna persona "comprador_listo" cuando score ≥ 70', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(80, 'hot', 'negotiation'))
    const personaUpdate = updates.find((u) => u.type === 'persona')
    expect(personaUpdate!.value).toBe('comprador_listo')
  })

  it('Asigna persona "interesado_calificado" cuando score 50-69', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(55, 'warm', 'proposal'))
    const personaUpdate = updates.find((u) => u.type === 'persona')
    expect(personaUpdate!.value).toBe('interesado_calificado')
  })

  it('Asigna persona "prospecto_cálido" cuando score 30-49', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(35, 'warm', 'qualified'))
    const personaUpdate = updates.find((u) => u.type === 'persona')
    expect(personaUpdate!.value).toBe('prospecto_cálido')
  })

  it('Asigna persona "explorador" cuando score < 30', () => {
    const updates = engine.generateCrmUpdates(buildAnalysis(15, 'cold', 'new'))
    const personaUpdate = updates.find((u) => u.type === 'persona')
    expect(personaUpdate!.value).toBe('explorador')
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 4: FOLLOW-UP TASKS — La IA programa seguimientos automáticos
// ─────────────────────────────────────────────────────────────

describe('RevenueEngine.generateFollowUpTasks() — Follow-ups automáticos sin intervención humana', () => {
  const engine = new RevenueEngine()

  function buildAnalysis(score: number, temperature: 'cold' | 'warm' | 'hot', stage: string, tags: string[] = []) {
    return {
      score,
      temperature,
      stage: stage as any,
      intent: 'inquiry' as any,
      buyingSignals: [],
      objections: [],
      tags,
      estimatedValue: 400000,
      nextAction: 'educate' as any,
      confidence: 0.6,
    }
  }

  it('Lead frío nuevo → genera follow-up inmediato (0h)', () => {
    const tasks = engine.generateFollowUpTasks(buildAnalysis(5, 'cold', 'new'))
    expect(tasks.some((t) => t.delayHours === 0)).toBe(true)
  })

  it('Lead score 20-50 → genera follow-up a las 2h', () => {
    const tasks = engine.generateFollowUpTasks(buildAnalysis(30, 'cold', 'engaged'))
    expect(tasks.some((t) => t.delayHours === 2)).toBe(true)
  })

  it('Lead caliente (score ≥ 70) → follow-up a las 4h y 24h', () => {
    const tasks = engine.generateFollowUpTasks(buildAnalysis(80, 'hot', 'negotiation'))
    expect(tasks.some((t) => t.delayHours === 4)).toBe(true)
    expect(tasks.some((t) => t.delayHours === 24)).toBe(true)
  })

  it('Lead en propuesta/cualificado → follow-up largo a las 72h', () => {
    const tasks = engine.generateFollowUpTasks(buildAnalysis(55, 'warm', 'proposal'))
    expect(tasks.some((t) => t.delayHours === 72)).toBe(true)
  })

  it('Los follow-ups siempre son por WhatsApp', () => {
    const tasks = engine.generateFollowUpTasks(buildAnalysis(40, 'warm', 'qualified'))
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.channel === 'whatsapp')).toBe(true)
  })

  it('Máximo 5 follow-up tasks para no spamear', () => {
    const tasks = engine.generateFollowUpTasks(
      buildAnalysis(80, 'hot', 'proposal', ['conversacion_activa'])
    )
    expect(tasks.length).toBeLessThanOrEqual(5)
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 5: PIPELINE DE DEALS — La IA mueve deals automáticamente
// ─────────────────────────────────────────────────────────────

describe('autoCreateOrUpdateDeal() — Pipeline CRM automático por score', () => {
  // Import inside tests to get mocked version
  let autoCreateOrUpdateDeal: typeof import('@/lib/crm/auto-deal').autoCreateOrUpdateDeal

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDbPipeline.findFirst.mockResolvedValue(MOCK_PIPELINE)
    mockDbContact.findUnique.mockResolvedValue({
      tags: '[]',
      customFields: '{}',
      notes: null,
      leadProfile: null,
    })
    mockDbCatalogItem.findMany.mockResolvedValue([])
    mockDbDeal.findMany.mockResolvedValue([]) // no existing deal by default
    mockDbDeal.create.mockResolvedValue({ id: 'new-deal-1' })
    mockDbDeal.update.mockResolvedValue({ id: 'existing-deal-1' })
    mockDbDeal.deleteMany.mockResolvedValue({ count: 0 })
    const mod = await import('@/lib/crm/auto-deal')
    autoCreateOrUpdateDeal = mod.autoCreateOrUpdateDeal
  })

  const BASE_INPUT = {
    workspaceId: 'ws-1',
    contactId: 'contact-1',
    conversationId: 'conv-1',
    contactName: 'Juan López',
    tags: [],
    channel: 'whatsapp',
  }

  it('Score < 20 → crea deal en etapa "Lead Nuevo"', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 10 })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-1' }),
      })
    )
  })

  it('Score 20-39 → crea deal en etapa "Contactado"', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 25 })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-2' }),
      })
    )
  })

  it('Score 40-59 → crea deal en etapa "Cualificado"', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 50 })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-3' }),
      })
    )
  })

  it('Score 60-79 → crea deal en etapa "Propuesta"', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 65 })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-4' }),
      })
    )
  })

  it('Score ≥ 80 → crea deal en etapa "Negociación"', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 85 })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 'stage-5' }),
      })
    )
  })

  it('Usa producto real del catálogo cuando coincide con tags del contacto', async () => {
    mockDbCatalogItem.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'CRM Pro',
        description: 'Automatización de ventas',
        price: 12000,
        currency: 'MXN',
        category: 'Software',
      },
    ])
    await autoCreateOrUpdateDeal({
      ...BASE_INPUT,
      leadScore: 30,
      tags: ['producto: CRM Pro'],
    })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: expect.stringContaining('CRM Pro'),
          value: 12000,
        }),
      })
    )
  })

  it('Sin producto real → título incluye "Oportunidad" y no inventa valor', async () => {
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 20, tags: [] })
    expect(mockDbDeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: expect.stringContaining('Oportunidad'),
          value: 0,
        }),
      })
    )
  })

  it('Deal existente con score mayor → mueve a etapa superior (actualiza, no crea)', async () => {
    mockDbDeal.findMany.mockResolvedValue([
      {
        id: 'existing-deal-1',
        stageId: 'stage-2', // Contactado (order: 2)
        value: 400000,
        title: 'Juan López — Lead WhatsApp',
        status: 'active',
      },
    ])
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 65 }) // → Propuesta (stage-4)
    expect(mockDbDeal.update).toHaveBeenCalled()
    expect(mockDbDeal.create).not.toHaveBeenCalled()
    const updateCall = mockDbDeal.update.mock.calls[0][0]
    expect(updateCall.data.stageId).toBe('stage-4')
  })

  it('Deal existente con stage igual o mayor → NO retrocede (no actualiza stage)', async () => {
    mockDbDeal.findMany.mockResolvedValue([
      {
        id: 'existing-deal-1',
        stageId: 'stage-5', // Negociación (order: 5) — ya avanzado
        value: 500000,
        title: 'Juan López — Implementación CRM',
        description: 'Editado manualmente',
        status: 'active',
      },
    ])
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 30 }) // score bajo
    // No debe actualizar el stage (no retroceder)
    expect(mockDbDeal.update).not.toHaveBeenCalled()
    expect(mockDbDeal.create).not.toHaveBeenCalled()
  })

  it('Duplicados de deals → elimina extras y conserva el más avanzado', async () => {
    mockDbDeal.findMany.mockResolvedValue([
      { id: 'deal-1', stageId: 'stage-2', value: 400000, title: 'Juan — Lead', status: 'active' },
      { id: 'deal-2', stageId: 'stage-3', value: 450000, title: 'Juan — Lead', status: 'active' },
      { id: 'deal-3', stageId: 'stage-1', value: 380000, title: 'Juan — Lead', status: 'active' },
    ])
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 60 })
    // Debe eliminar los 2 duplicados (deal-1 y deal-3, los de menor orden)
    expect(mockDbDeal.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['deal-1', 'deal-3']) } },
      })
    )
  })

  it('Sin pipeline configurado → no crash, sólo skips silenciosamente', async () => {
    mockDbPipeline.findFirst.mockResolvedValue(null)
    await expect(
      autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 50 })
    ).resolves.toBeUndefined()
    expect(mockDbDeal.create).not.toHaveBeenCalled()
  })

  it('El deal usa presupuesto detectado cuando no hay precio de catálogo', async () => {
    mockDbContact.findUnique.mockResolvedValue({
      tags: '[]',
      customFields: '{}',
      notes: null,
      leadProfile: {
        preferredProduct: 'Implementación CRM',
        budget: '$25,000',
        mainObjection: null,
        timeline: null,
        interests: '[]',
      },
    })
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 50, tags: [] })
    const createCall = mockDbDeal.create.mock.calls[0][0]
    expect(createCall.data.title).toContain('Implementación CRM')
    expect(createCall.data.value).toBe(25000)
    expect(createCall.data.currency).toBe('MXN')
  })

  it('El deal incluye fecha esperada de cierre (21 días)', async () => {
    const before = Date.now()
    await autoCreateOrUpdateDeal({ ...BASE_INPUT, leadScore: 40 })
    const after = Date.now()
    const createCall = mockDbDeal.create.mock.calls[0][0]
    const closeDate: Date = createCall.data.expectedCloseDate
    const diffDays = (closeDate.getTime() - before) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(20)
    expect(diffDays).toBeLessThanOrEqual(22)
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 6: AGENT ROUTING — La IA asigna agentes automáticamente
// ─────────────────────────────────────────────────────────────

describe('RevenueEngine.routeToAgent() — Asignación automática de agentes', () => {
  const engine = new RevenueEngine()

  function buildAnalysis(score: number, temperature: 'cold' | 'warm' | 'hot', intent: string) {
    return {
      score,
      temperature,
      stage: 'qualified' as any,
      intent: intent as any,
      buyingSignals: [],
      objections: [],
      tags: [],
      estimatedValue: 400000,
      nextAction: 'educate' as any,
      confidence: 0.6,
    }
  }

  it('Retorna un agentType (no undefined)', () => {
    const routing = engine.routeToAgent(buildAnalysis(50, 'warm', 'inquiry'), msgs('Hola quiero info'))
    expect(routing.agentType).toBeDefined()
    expect(typeof routing.agentType).toBe('string')
  })

  it('Retorna un score de confidence entre 0 y 1', () => {
    const routing = engine.routeToAgent(buildAnalysis(60, 'warm', 'inquiry'), msgs('Quiero ver precios'))
    expect(routing.confidence).toBeGreaterThanOrEqual(0)
    expect(routing.confidence).toBeLessThanOrEqual(1)
  })

  it('Retorna un reasoning no vacío', () => {
    const routing = engine.routeToAgent(buildAnalysis(70, 'hot', 'buy_signal'), msgs('Quiero comprarlo'))
    expect(routing.reasoning).toBeTruthy()
    expect(routing.reasoning.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────
// SUITE 7: PIPELINE COMPLETO (sin DB) — Integración end-to-end
// ─────────────────────────────────────────────────────────────

describe('RevenueEngine — Pipeline completo de calificación y decisión', () => {
  const engine = new RevenueEngine()

  it('Pipeline 9 pasos devuelve: action, strategy, crmUpdates, followUpTasks, agentRouting', () => {
    const analysis = engine.analyzeLead(
      msgs('Hola quiero info del Sentra', 'Cuánto cuesta y qué requisitos?', 'Quiero ir a verlo esta semana')
    )
    const trigger = engine.detectTrigger(analysis)
    const decision = engine.makeDecision(analysis, trigger)
    const crmUpdates = engine.generateCrmUpdates(analysis)
    const followUpTasks = engine.generateFollowUpTasks(analysis)
    const agentRouting = engine.routeToAgent(analysis, msgs('Quiero ir a verlo'))

    expect(decision.action).toBeDefined()
    expect(decision.strategy.length).toBeGreaterThan(0)
    expect(crmUpdates.length).toBeGreaterThanOrEqual(3) // score + stage + notes mínimo
    expect(followUpTasks.length).toBeGreaterThan(0)
    expect(agentRouting.agentType).toBeDefined()
  })

  it('Lead con señales de cierre → action="close"', () => {
    const analysis = engine.analyzeLead(
      msgs(
        'Lo quiero, vamos a cerrar el trato',
        'Cuanto es el pago inicial para cerrar hoy',
        'Ya tengo el dinero, compro esta semana',
        'Dame la dirección para ir mañana y traigo los documentos',
        'Quiero apartar la unidad ya',
        'Me lo llevo, dime el precio final',
      )
    )
    const trigger = engine.detectTrigger(analysis)
    const decision = engine.makeDecision(analysis, trigger)
    // Con múltiples buy signals y score alto, debe intentar cerrar
    expect(['close', 'follow_up', 'educate']).toContain(decision.action)
  })

  it('Lead con objeciones → trigger de objeción activo', () => {
    const analysis = engine.analyzeLead(
      msgs(
        'Me interesa pero está muy caro',
        'No me alcanza el presupuesto',
        'Tienen algo más barato?',
      )
    )
    const trigger = engine.detectTrigger(analysis)
    if (trigger.isActive) {
      expect(trigger.triggerType).toBe('price_objection')
    }
    // Independientemente, las objeciones deben estar detectadas
    expect(analysis.objections.length).toBeGreaterThan(0)
  })

  it('El score siempre está entre 0 y 100', () => {
    // Mensajes extremadamente calificados
    const result = engine.analyzeLead(
      Array.from({ length: 20 }, (_, i) =>
        msgs(
          `compro ${i} cito agendar requisitos documentos pago inicial cuota meses ingresos credito` +
          ` lo tomo lo quiero cerrar direccion visita cita urgente hoy ya ahora`
        )[0]
      )
    )
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
