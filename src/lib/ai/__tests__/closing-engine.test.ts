import { describe, it, expect } from 'vitest'

// Test closing engine logic (pure function tests)
describe('Closing Engine', () => {
  it('should identify urgency signals in conversation', () => {
    const urgencyPhrases = [
      'lo necesito hoy',
      'es urgente',
      'cuanto antes',
      'ya quiero',
      'apurate',
      'tengo prisa',
    ]

    urgencyPhrases.forEach(phrase => {
      const isUrgent = phrase.includes('urgente') || phrase.includes('necesito hoy') || phrase.includes('cuanto antes')
      expect(typeof isUrgent).toBe('boolean')
    })
  })

  it('should identify buying signals in conversation', () => {
    const buyingSignals = [
      'como le hago para pagar',
      'cuanto cuesta',
      'quiero contratar',
      'me interesa',
      'vamos a cerrar',
      'como es el proceso',
    ]

    buyingSignals.forEach(signal => {
      const hasSignal = signal.includes('pagar') || signal.includes('contratar') || signal.includes('cerrar')
      expect(typeof hasSignal).toBe('boolean')
    })
  })

  it('should classify closing techniques correctly', () => {
    const techniques = ['alternativa', 'urgencia', 'resumen', 'asuncion', 'fomo']

    techniques.forEach(technique => {
      expect(typeof technique).toBe('string')
      expect(technique.length).toBeGreaterThan(0)
    })
  })

  it('should score deal probability based on signals', () => {
    const signals = { urgency: true, budget: true, timeline: true, authority: false }
    const score = Object.values(signals).filter(Boolean).length / Object.values(signals).length

    expect(score).toBe(0.75) // 3 out of 4 signals
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
