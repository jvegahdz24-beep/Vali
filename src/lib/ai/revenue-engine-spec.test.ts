import { describe, it, expect } from 'vitest'
import { RevenueEngine, computeLeadScoreDelta, buildIntentActionDirective } from '@/lib/ai/revenue-engine'
import { FOLLOW_UP_TIMELINE } from '@/lib/ai/follow-up-engine'

// These exercise the offline (keyword / pure) paths of the engine that the
// 2026-06 spec hardening touched: SALUDO/RECLAMO intents, the disinterest
// scoring penalty and the hot≥70 temperature threshold.

describe('RevenueEngine — intent classifier (keyword path, offline)', () => {
  const engine = new RevenueEngine()

  it('classifies a bare greeting as saludo (not info/cotización)', async () => {
    expect(await engine.classifyIntent('Hola')).toBe('saludo')
    expect(await engine.classifyIntent('Buenas tardes')).toBe('saludo')
  })

  it('classifies a money dispute as reclamo (distinct from queja)', async () => {
    expect(await engine.classifyIntent('me cobraron de más en mi tarjeta')).toBe('reclamo')
    expect(await engine.classifyIntent('quiero un reembolso del cargo')).toBe('reclamo')
  })

  it('maps the 7 exact spec intents', async () => {
    expect(await engine.classifyIntent('hola, ¿cuánto cuesta el sedán?')).toBe('info')
    expect(await engine.classifyIntent('quiero comprar el plan pro')).toBe('compra')
    expect(await engine.classifyIntent('¿dan financiamiento a meses?')).toBe('credito')
    expect(await engine.classifyIntent('¿podemos agendar una cita?')).toBe('cita')
    expect(await engine.classifyIntent('el sistema no funciona, qué mal servicio')).toBe('queja')
  })
})

describe('RevenueEngine — disinterest penalty + temperature', () => {
  const engine = new RevenueEngine()

  it('drops an explicit "no me interesa" lead to cold and tags it', () => {
    const a = engine.analyzeLead([
      { role: 'user', content: 'no me interesa, gracias' },
    ])
    expect(a.tags).toContain('desinteresado')
    expect(a.temperature).toBe('cold')
    expect(a.score).toBeLessThan(30)
  })

  it('never produces a negative score even with strong disinterest', () => {
    const a = engine.analyzeLead([
      { role: 'user', content: 'no me interesa, ya no quiero, déjame en paz' },
    ])
    expect(a.score).toBeGreaterThanOrEqual(0)
  })

  it('applies the EXACT spec event increments (computeLeadScoreDelta)', () => {
    expect(computeLeadScoreDelta('hola')).toBe(5)                       // mensaje +5
    expect(computeLeadScoreDelta('¿cuánto cuesta?')).toBe(15)           // +5 +10 precio
    expect(computeLeadScoreDelta('quiero agendar una cita')).toBe(20)   // +5 +15 cita
    expect(computeLeadScoreDelta('mi correo es juan@mail.com')).toBe(25) // +5 +20 contacto
    expect(computeLeadScoreDelta('no me interesa')).toBe(-25)           // +5 −30
    expect(computeLeadScoreDelta('precio', { openedQuoteLink: true })).toBe(25) // +5 +10 +10 link
  })

  it('maps a strong-signal conversation to hot only at score ≥ 70', () => {
    const a = engine.analyzeLead([
      { role: 'user', content: 'quiero comprar ya, lo tomo, tengo el presupuesto listo y es urgente para hoy' },
      { role: 'user', content: 'me lo llevo, ¿cómo pago? acepto el precio, cerramos' },
      { role: 'user', content: 'dame el enganche y la mensualidad, listo para firmar' },
    ])
    // temperature must be consistent with the ≥70 rule
    if (a.score >= 70) expect(a.temperature).toBe('hot')
    else expect(a.temperature).not.toBe('hot')
  })
})

describe('intent → acción esperada (spec Paso 1)', () => {
  it('saludo must NOT push a quote', () => {
    const d = buildIntentActionDirective('saludo')
    expect(d).toContain('SALUDO')
    expect(d.toLowerCase()).toContain('no env')
  })

  it('compra must push to close', () => {
    expect(buildIntentActionDirective('compra').toUpperCase()).toContain('CIERRE')
  })

  it('info must NOT advance to close yet', () => {
    expect(buildIntentActionDirective('info').toLowerCase()).toContain('no avances')
  })

  it('reclamo must escalate to a human', () => {
    expect(buildIntentActionDirective('reclamo').toLowerCase()).toContain('humano')
  })
})

describe('follow-up timeline — spec 7/14/21/28, máx 4', () => {
  it('has exactly 4 steps spaced 7 days apart', () => {
    expect(FOLLOW_UP_TIMELINE).toHaveLength(4)
    for (const step of FOLLOW_UP_TIMELINE) {
      expect(step.delayMinutes).toBe(7 * 24 * 60)
    }
  })
})
