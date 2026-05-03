// ═══════════════════════════════════════════════════════════════
// Tests — Revenue Engine (Core AI Pipeline)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { RevenueEngine } from '@/lib/ai/revenue-engine'

describe('RevenueEngine — analyzeLead', () => {
  const engine = new RevenueEngine()

  it('retorna análisis default con mensajes vacíos', () => {
    const result = engine.analyzeLead([])
    expect(result.score).toBe(0)
    expect(result.stage).toBe('new')
    expect(result.temperature).toBe('cold')
    expect(result.intent).toBe('greeting')
  })

  it('retorna análisis default sin mensajes de usuario', () => {
    const result = engine.analyzeLead([
      { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' },
    ])
    expect(result.score).toBe(0)
    expect(result.stage).toBe('new')
  })

  it('detecta señales de compra correctamente', () => {
    const messages = [
      { role: 'user', content: 'Lo quiero comprar ya. ¿Cuánto pago inicial?' },
      { role: 'assistant', content: 'Podemos ayudarte.' },
      { role: 'user', content: 'Lo tomo, vamos. ¿Cuáles son los requisitos?' },
    ]
    const result = engine.analyzeLead(messages)
    expect(result.buyingSignals.length).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThan(0)
  })

  it('detecta objeciones de precio', () => {
    const messages = [
      { role: 'user', content: 'Muy caro, no tengo dinero. No me alcanza.' },
      { role: 'assistant', content: 'Te entiendo.' },
      { role: 'user', content: 'Es mucho dinero, está fuera de presupuesto.' },
    ]
    const result = engine.analyzeLead(messages)
    const priceObjections = result.objections.filter((o) => o.startsWith('precio'))
    expect(priceObjections.length).toBeGreaterThan(0)
  })

  it('detecta keywords de presupuesto', () => {
    const messages = [
      { role: 'user', content: '¿Tienen meses sin intereses? ¿Cuál es la mensualidad?' },
      { role: 'user', content: '¿Puedo pagar con crédito? ¿Cuánto es el anticipo?' },
    ]
    const result = engine.analyzeLead(messages)
    expect(result.score).toBeGreaterThan(0)
    expect(result.tags).toContain('tiene_interes_financiero')
  })

  it('etapa "new" para primer mensaje sin señales', () => {
    const result = engine.analyzeLead([{ role: 'user', content: 'Hola, buenos días.' }])
    expect(result.stage).toBe('new')
  })

  it('etapa alta para score alto con multiples senales de compra', () => {
    const messages = Array(20).fill({ role: 'user', content: 'Lo compro ya necesito urgente lo tomo comprar pagar cuanto disponible agendar visitar trato hecho me interesa perfecto cerramos quiero si claro exacto' })
    const result = engine.analyzeLead(messages)
    expect(result.score).toBeGreaterThan(40)
    expect(['proposal', 'negotiation', 'qualified'].includes(result.stage)).toBe(true)
  })

  it('score máximo es 100', () => {
    const manyBuySignals = Array(10).fill([{ role: 'user', content: 'Lo compro, lo tomo, ya, urgente, comprar, necesito, pagar, cuanto, disponible, visiting' }]).flat()
    const result = engine.analyzeLead(manyBuySignals)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('confidence incrementa con más conversación', () => {
    const short = engine.analyzeLead([{ role: 'user', content: 'Hola.' }])
    const long = engine.analyzeLead([
      { role: 'user', content: 'Hola, busco información sobre sus servicios.' },
      { role: 'assistant', content: 'Claro, te cuento.' },
      { role: 'user', content: 'Me interesa el plan premium con consultoría.' },
      { role: 'assistant', content: 'Excelente elección.' },
      { role: 'user', content: '¿Cuál es el precio y tienen financiamiento?' },
      { role: 'assistant', content: 'Tenemos planes desde...' },
      { role: 'user', content: 'Me gusta, ¿cómo puedo contratar?' },
    ])
    expect(long.confidence).toBeGreaterThan(short.confidence)
  })
})

describe('RevenueEngine — detectTrigger', () => {
  const engine = new RevenueEngine()

  it('detecta buy_signal cuando hay múltiples señales', () => {
    const analysis = {
      score: 70,
      stage: 'negotiation' as const,
      temperature: 'hot' as const,
      intent: 'buy_signal',
      buyingSignals: ['lo tomo', 'lo compro', 'vamos'],
      objections: [],
      tags: [],
      estimatedValue: 450000,
      nextAction: 'close' as const,
      confidence: 0.8,
    }
    const trigger = engine.detectTrigger(analysis)
    expect(trigger.isActive).toBe(true)
    expect(trigger.triggerType).toBe('buy_signal_detected')
  })

  it('detecta price_objection', () => {
    const analysis = {
      score: 40,
      stage: 'engaged' as const,
      temperature: 'warm' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: ['precio: muy caro', 'precio: no tengo dinero'],
      tags: ['tiene_objeciones'],
      estimatedValue: 320000,
      nextAction: 'handle_objection' as const,
      confidence: 0.5,
    }
    const trigger = engine.detectTrigger(analysis)
    expect(trigger.isActive).toBe(true)
    expect(trigger.triggerType).toBe('price_objection')
  })

  it('no activa trigger sin señales suficientes', () => {
    const analysis = {
      score: 10,
      stage: 'new' as const,
      temperature: 'cold' as const,
      intent: 'greeting',
      buyingSignals: [],
      objections: [],
      tags: ['nuevo'],
      estimatedValue: 300000,
      nextAction: 'question' as const,
      confidence: 0.3,
    }
    const trigger = engine.detectTrigger(analysis)
    expect(trigger.isActive).toBe(false)
    expect(trigger.triggerType).toBe('none')
  })
})

describe('RevenueEngine — makeDecision', () => {
  const engine = new RevenueEngine()

  it('acción "close" cuando hay buy_signal trigger', () => {
    const analysis = {
      score: 75,
      stage: 'negotiation' as const,
      temperature: 'hot' as const,
      intent: 'buy_signal',
      buyingSignals: ['lo tomo'],
      objections: [],
      tags: [],
      estimatedValue: 450000,
      nextAction: 'close' as const,
      confidence: 0.9,
    }
    const trigger = { isActive: true, triggerType: 'buy_signal_detected', confidence: 0.9 }
    const decision = engine.makeDecision(analysis, trigger)
    expect(decision.action).toBe('close')
    expect(decision.priority).toBe(10)
  })

  it('acción "handle_objection" cuando hay price_objection', () => {
    const analysis = {
      score: 35,
      stage: 'engaged' as const,
      temperature: 'warm' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: ['precio: muy caro'],
      tags: ['tiene_objeciones'],
      estimatedValue: 320000,
      nextAction: 'handle_objection' as const,
      confidence: 0.5,
    }
    const trigger = { isActive: true, triggerType: 'price_objection', confidence: 0.85 }
    const decision = engine.makeDecision(analysis, trigger)
    expect(decision.action).toBe('handle_objection')
  })

  it('acción "question" para score bajo sin trigger', () => {
    const analysis = {
      score: 5,
      stage: 'new' as const,
      temperature: 'cold' as const,
      intent: 'greeting',
      buyingSignals: [],
      objections: [],
      tags: ['nuevo'],
      estimatedValue: 300000,
      nextAction: 'question' as const,
      confidence: 0.3,
    }
    const trigger = { isActive: false, triggerType: 'none', confidence: 0 }
    const decision = engine.makeDecision(analysis, trigger)
    expect(decision.action).toBe('question')
    expect(decision.priority).toBe(1)
  })
})

describe('RevenueEngine — handleObjection', () => {
  const engine = new RevenueEngine()

  it('maneja objeción de precio', () => {
    const analysis = {
      score: 30,
      stage: 'engaged' as const,
      temperature: 'warm' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: ['precio: muy caro'],
      tags: ['tiene_objeciones'],
      estimatedValue: 320000,
      nextAction: 'handle_objection' as const,
      confidence: 0.5,
    }
    const response = engine.handleObjection(analysis, 'Es muy caro, no tengo dinero')
    expect(response.tone).toBe('empathetic')
    expect(response.question).toBeTruthy()
    expect(response.rawResponse).toBeTruthy()
    expect(response.suggestedReplies.length).toBeGreaterThan(0)
  })

  it('maneja objeción de tiempo', () => {
    const analysis = {
      score: 25,
      stage: 'engaged' as const,
      temperature: 'cold' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: ['tiempo: lo voy a pensar'],
      tags: ['tiene_objeciones'],
      estimatedValue: 320000,
      nextAction: 'handle_objection' as const,
      confidence: 0.4,
    }
    const response = engine.handleObjection(analysis, 'Lo voy a pensar, después')
    expect(response.tone).toBe('educational')
    expect(response.rawResponse).toContain('tomarte tu tiempo')
  })

  it('maneja objeción de socio', () => {
    const analysis = {
      score: 35,
      stage: 'engaged' as const,
      temperature: 'warm' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: ['socio: mi esposa'],
      tags: ['tiene_objeciones'],
      estimatedValue: 350000,
      nextAction: 'handle_objection' as const,
      confidence: 0.5,
    }
    const response = engine.handleObjection(analysis, 'Tengo que hablar con mi esposa')
    expect(response.tone).toBe('confident')
    expect(response.isClosingAttempt).toBe(true)
  })

  it('fallback genérico para objeción no reconocida', () => {
    const analysis = {
      score: 20,
      stage: 'new' as const,
      temperature: 'cold' as const,
      intent: 'objection',
      buyingSignals: [],
      objections: [],
      tags: [],
      estimatedValue: 300000,
      nextAction: 'handle_objection' as const,
      confidence: 0.3,
    }
    const response = engine.handleObjection(analysis, 'No sé, algo me preocupa')
    expect(response.tone).toBe('empathetic')
    expect(response.rawResponse).toBeTruthy()
  })
})

describe('RevenueEngine — generateFollowUpTasks', () => {
  const engine = new RevenueEngine()

  it('genera follow-ups para lead nuevo', () => {
    const analysis = {
      score: 15,
      stage: 'new' as const,
      temperature: 'cold' as const,
      intent: 'greeting',
      buyingSignals: [],
      objections: [],
      tags: ['nuevo'],
      estimatedValue: 300000,
      nextAction: 'question' as const,
      confidence: 0.3,
    }
    const tasks = engine.generateFollowUpTasks(analysis)
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0].channel).toBe('whatsapp')
    expect(tasks[0].template).toContain('{{name}}')
  })

  it('genera más follow-ups para lead caliente', () => {
    const coldAnalysis = {
      score: 10,
      stage: 'new' as const,
      temperature: 'cold' as const,
      intent: 'greeting',
      buyingSignals: [],
      objections: [],
      tags: ['nuevo'],
      estimatedValue: 300000,
      nextAction: 'question' as const,
      confidence: 0.3,
    }
    const hotAnalysis = {
      score: 85,
      stage: 'negotiation' as const,
      temperature: 'hot' as const,
      intent: 'buy_signal',
      buyingSignals: ['lo compro'],
      objections: [],
      tags: ['conversacion_activa'],
      estimatedValue: 450000,
      nextAction: 'close' as const,
      confidence: 0.9,
    }
    const coldTasks = engine.generateFollowUpTasks(coldAnalysis)
    const hotTasks = engine.generateFollowUpTasks(hotAnalysis)
    expect(hotTasks.length).toBeGreaterThanOrEqual(coldTasks.length)
  })

  it('máximo 5 follow-up tasks', () => {
    const analysis = {
      score: 80,
      stage: 'negotiation' as const,
      temperature: 'hot' as const,
      intent: 'buy_signal',
      buyingSignals: ['lo tomo', 'lo compro', 'vamos'],
      objections: [],
      tags: ['conversacion_activa', 'alto_engagement'],
      estimatedValue: 450000,
      nextAction: 'close' as const,
      confidence: 0.9,
    }
    const tasks = engine.generateFollowUpTasks(analysis)
    expect(tasks.length).toBeLessThanOrEqual(5)
  })
})

describe('RevenueEngine — generateCrmUpdates', () => {
  const engine = new RevenueEngine()

  it('genera actualizaciones de score, stage y tags', () => {
    const analysis = {
      score: 45,
      stage: 'qualified' as const,
      temperature: 'warm' as const,
      intent: 'product_interest',
      buyingSignals: ['me interesa'],
      objections: ['tiempo: después'],
      tags: ['interesa_modelo', 'tiene_objeciones'],
      estimatedValue: 380000,
      nextAction: 'educate' as const,
      confidence: 0.6,
    }
    const updates = engine.generateCrmUpdates(analysis)
    expect(updates.some((u) => u.type === 'score')).toBe(true)
    expect(updates.some((u) => u.type === 'stage')).toBe(true)
    expect(updates.some((u) => u.type === 'tags')).toBe(true)
    expect(updates.some((u) => u.type === 'persona')).toBe(true)
  })
})
