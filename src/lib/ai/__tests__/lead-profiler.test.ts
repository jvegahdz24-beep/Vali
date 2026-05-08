// ═══════════════════════════════════════════════════════════════
// Tests — Lead Profiler (DIB Intelligence Layer)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectArchetype, type Archetype } from '@/lib/ai/archetype-detector'

describe('detectArchetype', () => {
  it('retorna desconocido si no hay mensajes', () => {
    const result = detectArchetype([])
    expect(result.archetype).toBe('desconocido')
    expect(result.confidence).toBe(0)
    expect(result.signals).toHaveLength(0)
  })

  it('retorna desconocido si el score es menor a 2', () => {
    const result = detectArchetype(['¿Hola, buenos días?'])
    expect(result.archetype).toBe('desconocido')
  })

  it('detecta arquetipo práctico con keywords de precio y ahorro', () => {
    const messages = [
      '¿Cuánto cuesta el plan económico?',
      'Quiero comparar precios y ver el ahorro mensual.',
      '¿Cuál es el costo de mantenimiento?',
      '¿Tienen algún plan barato?',
    ]
    const result = detectArchetype(messages)
    expect(result.archetype).toBe('practico')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.recommendedModels.length).toBeGreaterThan(0)
  })

  it('detecta arquetipo familiar con keywords de familia', () => {
    const messages = [
      'Busco algo para mi familia y mis hijos.',
      'Necesito espacio para las maletas cuando viajamos.',
      'Que sea cómodo y seguro para los niños.',
      'Somos cinco personas y necesitamos amplitud.',
    ]
    const result = detectArchetype(messages)
    expect(result.archetype).toBe('familiar')
    expect(result.signals.length).toBeGreaterThan(0)
  })

  it('detecta arquetipo aspiracional con keywords de diseño y lujo', () => {
    const messages = [
      'Me interesa el diseño elegante y premium.',
      'Quiero algo que llame la atención, un diseño bonito.',
      '¿Tienen el último modelo en color especial?',
      'Busco algo deportivo y potente.',
    ]
    const result = detectArchetype(messages)
    expect(result.archetype).toBe('aspiracional')
  })

  it('detecta arquetipo estratégico con keywords de negocio', () => {
    const messages = [
      'Necesito esto para mi empresa, como flota.',
      '¿Puedo deducir el seguro como gasto fiscal?',
      'Quiero invertir en algo que tenga retorno.',
      '¿Tienen factura y comprobante fiscal?',
    ]
    const result = detectArchetype(messages)
    expect(result.archetype).toBe('estrategico')
  })

  it('detecta arquetipo consciente con keywords de sustentabilidad', () => {
    const messages = [
      'Me interesa lo sustentable y eficiente.',
      '¿Tienen opciones verdes o eco?',
      'Busco algo con bajas emisiones.',
      'La responsabilidad ambiental es importante para mí.',
    ]
    const result = detectArchetype(messages)
    expect(result.archetype).toBe('consciente')
  })

  it('incluye trigger phrase y tone cuando detecta arquetipo', () => {
    const messages = [
      '¿Cuánto cuesta? ¿Es económico?',
      '¿Cuál es la inversión y el precio?',
      'Quiero ver comparación de costos.',
      '¿Tienen plan de financiamiento?',
    ]
    const result = detectArchetype(messages)
    if (result.archetype !== 'desconocido') {
      expect(result.triggerPhrase).toBeTruthy()
      expect(result.tone).toBeTruthy()
    }
  })

  it('normaliza acentos en keywords', () => {
    const messages = [
      'Busco algo economico y comodo.',
      'Que tenga buen rendimiento y bajo costo de mantenimiento.',
      'Necesito comparacion de precios.',
    ]
    const result = detectArchetype(messages)
    // No debe ser desconocido porque las keywords con acentos se normalizan
    expect(result.archetype).not.toBe('desconocido')
  })

  it('elige el arquetipo con mayor score si hay múltiples', () => {
    const messages = [
      'Busco algo económico para mi familia.',
      'Quiero comparar precios y que sea seguro para los niños.',
      '¿Cuál es el costo y el ahorro? ¿Es cómodo para 5 personas?',
      'Necesito un plan accesible, amplio y con buena relación costo-beneficio.',
    ]
    const result = detectArchetype(messages)
    // Puede ser practico o familiar, pero debe detectar algo
    expect(result.archetype).not.toBe('desconocido')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('confidence tiene máximo de 1.0', () => {
    const manyKeywords = Array(20).fill('precio costo económico inversión ahorro gasto financiamiento')
    const result = detectArchetype(manyKeywords)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})
