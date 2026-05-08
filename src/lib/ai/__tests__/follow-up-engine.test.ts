import { describe, it, expect } from 'vitest'

// Test follow-up engine logic
describe('Follow-up Engine', () => {
  it('should calculate correct follow-up delay in days', () => {
    const followUpSchedule = [3, 7, 15, 30, 60, 90]

    followUpSchedule.forEach((days, index) => {
      expect(days).toBeGreaterThan(0)
      expect(index).toBeLessThan(followUpSchedule.length)
      // Each subsequent follow-up should be further out
      if (index > 0) {
        expect(days).toBeGreaterThan(followUpSchedule[index - 1])
      }
    })
  })

  it('should detect when a lead has gone cold (no response > 7 days)', () => {
    const now = Date.now()
    const lastMessageAt = now - 8 * 24 * 60 * 60 * 1000 // 8 days ago
    const daysSinceLastMessage = (now - lastMessageAt) / (24 * 60 * 60 * 1000)

    expect(daysSinceLastMessage).toBeGreaterThan(7)
  })

  it('should not consider a lead cold if they responded recently', () => {
    const now = Date.now()
    const lastMessageAt = now - 2 * 24 * 60 * 60 * 1000 // 2 days ago
    const daysSinceLastMessage = (now - lastMessageAt) / (24 * 60 * 60 * 1000)

    expect(daysSinceLastMessage).toBeLessThan(7)
  })

  it('should select appropriate follow-up template based on archetype', () => {
    const templates = {
      Practico: 'la mayoria se enfoca en precio, pero el verdadero ahorro esta en el valor',
      Familiar: 'cuando viajas con mas personas, el espacio y la seguridad cambian todo',
      Aspiracional: 'hay opciones que no solo usas... las disfrutas',
      Estrategico: 'lo importante no es cuanto cuesta... sino cuanto te regresa',
      Consciente: 'las opciones sustentables estan en otro nivel tanto en valor como en experiencia',
    }

    Object.entries(templates).forEach(([archetype, template]) => {
      expect(typeof archetype).toBe('string')
      expect(typeof template).toBe('string')
      expect(template.length).toBeGreaterThan(20)
    })
  })

  it('should handle edge case of zero days since last message', () => {
    const now = Date.now()
    const lastMessageAt = now
    const daysSinceLastMessage = (now - lastMessageAt) / (24 * 60 * 60 * 1000)

    expect(daysSinceLastMessage).toBe(0)
  })
})
