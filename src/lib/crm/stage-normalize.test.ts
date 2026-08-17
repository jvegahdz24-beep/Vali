import { describe, it, expect } from 'vitest'
import { normalizeStageName, CANONICAL_STAGES } from './auto-deal'

describe('normalizeStageName', () => {
  it('maps exact canonical names to themselves', () => {
    for (const s of CANONICAL_STAGES) {
      expect(normalizeStageName(s)).toBe(s)
    }
  })

  it('is case- and accent-insensitive', () => {
    expect(normalizeStageName('NEGOCIACION')).toBe('Negociación')
    expect(normalizeStageName('negociacion')).toBe('Negociación')
    expect(normalizeStageName('Negociación')).toBe('Negociación')
    expect(normalizeStageName('  cualificado ')).toBe('Cualificado')
  })

  it('maps the historical invalid "cierre" value to a real stage', () => {
    // Regression: the system used to inject [CRM:stage:cierre], which was silently
    // dropped because "cierre" is not a pipeline stage. It must now resolve to Cerrado.
    expect(normalizeStageName('cierre')).toBe('Cerrado')
    expect(normalizeStageName('Cierre')).toBe('Cerrado')
    expect(normalizeStageName('cerrar')).toBe('Cerrado')
    expect(normalizeStageName('ganado')).toBe('Cerrado')
  })

  it('maps common synonyms', () => {
    expect(normalizeStageName('calificado')).toBe('Cualificado')
    expect(normalizeStageName('cotizacion')).toBe('Propuesta')
    expect(normalizeStageName('won')).toBe('Cerrado')
  })

  it('returns undefined for unrecognized values so callers fall back to score logic', () => {
    expect(normalizeStageName('banana')).toBeUndefined()
    expect(normalizeStageName('')).toBeUndefined()
    expect(normalizeStageName(undefined)).toBeUndefined()
    expect(normalizeStageName(null)).toBeUndefined()
  })
})
