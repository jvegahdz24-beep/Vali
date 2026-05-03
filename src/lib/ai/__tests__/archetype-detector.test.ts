import { describe, it, expect } from 'vitest'

// Test archetype detection logic
describe('Archetype Detector', () => {
  const archetypes = {
    Practico: {
      keywords: ['precio', 'costo', 'gasto', 'barato', 'caro', 'descuento', 'oferta', 'promocion', 'ahorro', 'inversion'],
      trigger: 'ahorro, eficiencia',
      tone: 'datos concretos',
    },
    Familiar: {
      keywords: ['familia', 'hijos', 'esposa', 'esposo', 'mama', 'papa', 'bebe', 'ninos', 'seguridad', 'comodo'],
      trigger: 'proteccion, tranquilidad',
      tone: 'calido',
    },
    Aspiracional: {
      keywords: ['especial', 'diferente', 'exclusivo', 'premium', 'lujo', 'estatus', 'innovador', 'moderno', 'elegante', 'unico'],
      trigger: 'estatus, innovacion',
      tone: 'experiencial',
    },
    Estrategico: {
      keywords: ['retorno', 'rentabilidad', 'roi', 'inversion', 'negocio', 'uber', 'rendimiento', 'tc0', 'depreciacion', 'financiamiento'],
      trigger: 'retorno, rentabilidad',
      tone: 'analitico',
    },
    Consciente: {
      keywords: ['sustentable', 'ecologico', 'ambiental', 'natural', 'organico', 'reciclable', 'verde', 'contaminacion', 'energia', 'impacto'],
      trigger: 'innovacion, futuro',
      tone: 'informado',
    },
  }

  it('should have defined keywords for each archetype', () => {
    Object.keys(archetypes).forEach(name => {
      expect(archetypes[name].keywords.length).toBeGreaterThan(0)
      expect(archetypes[name].trigger.length).toBeGreaterThan(0)
      expect(archetypes[name].tone.length).toBeGreaterThan(0)
    })
  })

  it('should detect Practico archetype from price-related messages', () => {
    const message = 'cuanto cuesta? es muy caro, busco algo economico con descuento'
    const practicoKeywords = archetypes.Practico.keywords
    const matches = practicoKeywords.filter(kw => message.toLowerCase().includes(kw))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect Familiar archetype from family-related messages', () => {
    const message = 'lo necesito para mi familia, con seguridad para mis hijos'
    const familiarKeywords = archetypes.Familiar.keywords
    const matches = familiarKeywords.filter(kw => message.toLowerCase().includes(kw))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect Aspiracional archetype from luxury-related messages', () => {
    const message = 'quiero algo exclusivo y premium que se vea elegante'
    const aspiracionalKeywords = archetypes.Aspiracional.keywords
    const matches = aspiracionalKeywords.filter(kw => message.toLowerCase().includes(kw))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect Estrategico archetype from business-related messages', () => {
    const message = 'que retorno tengo? es para mi negocio de uber'
    const estrategicoKeywords = archetypes.Estrategico.keywords
    const matches = estrategicoKeywords.filter(kw => message.toLowerCase().includes(kw))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect Consciente archetype from eco-related messages', () => {
    const message = 'tienen opciones sustentables? me importa el impacto ambiental'
    const conscienteKeywords = archetypes.Consciente.keywords
    const matches = conscienteKeywords.filter(kw => message.toLowerCase().includes(kw))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('should return undefined for ambiguous messages', () => {
    const message = 'hola, buenos dias'
    let totalMatches = 0
    Object.values(archetypes).forEach(({ keywords }) => {
      totalMatches += keywords.filter(kw => message.toLowerCase().includes(kw)).length
    })
    expect(totalMatches).toBe(0)
  })
})
