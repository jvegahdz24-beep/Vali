import { describe, it, expect } from 'vitest'
import { RevenueEngine } from './revenue-engine'
import type { LeadAnalysis } from '@/lib/types'

function baseAnalysis(overrides: Partial<LeadAnalysis> = {}): LeadAnalysis {
  return {
    score: 70,
    stage: 'negotiation',
    temperature: 'hot',
    intent: 'COTIZACION',
    buyingSignals: ['pidió precio', 'preguntó financiamiento'],
    objections: [],
    tags: [],
    estimatedValue: 0,
    nextAction: 'close',
    confidence: 0.8,
    ...overrides,
  }
}

describe('buildEngineAnalysisBlock', () => {
  const engine = new RevenueEngine()

  it('includes the detected intent, score, signals and a clear next action', () => {
    const block = engine.buildEngineAnalysisBlock(baseAnalysis(), {
      action: 'close',
      strategy: 'CIERRE',
    })
    expect(block).toContain('ANÁLISIS INTERNO DEL SISTEMA')
    expect(block).toContain('COTIZACION')
    expect(block).toContain('70/100')
    expect(block).toContain('pidió precio')
    expect(block).toMatch(/PRÓXIMA ACCIÓN/)
    expect(block).toMatch(/CERRAR/i)
  })

  it('tells the model NOT to leak the analysis to the customer', () => {
    const block = engine.buildEngineAnalysisBlock(baseAnalysis(), { action: 'question', strategy: '' })
    expect(block).toMatch(/NO lo menciones/i)
  })

  it('maps each engine action to actionable guidance', () => {
    const actions = ['close', 'handle_objection', 'educate', 'follow_up', 'question']
    for (const action of actions) {
      const block = engine.buildEngineAnalysisBlock(baseAnalysis({ objections: ['precio'] }), { action, strategy: 'x' })
      // The PRÓXIMA ACCIÓN line must be non-trivial guidance, never empty.
      const line = block.split('\n').find((l) => l.includes('PRÓXIMA ACCIÓN'))
      expect(line && line.length).toBeGreaterThan(40)
    }
  })

  it('handles leads with no signals / no objections gracefully', () => {
    const block = engine.buildEngineAnalysisBlock(
      baseAnalysis({ buyingSignals: [], objections: [] }),
      { action: 'question', strategy: '' },
    )
    expect(block).toContain('ninguna aún')
    expect(block).toContain('ninguna')
  })
})
