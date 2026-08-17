// ═══════════════════════════════════════════════════════════════
// Tests — Humanizer (AI → WhatsApp natural messages)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import {
  humanizeResponse,
  stripMarkdown,
  removeRoboticOpeners,
  replaceFormalWords,
  normalizeWhitespace,
  fixAIArtifacts,
  enforceIdentity,
  maybeAddEmoji,
  splitLongMessage,
  getRandomDelay,
  getInterMessageDelay,
} from '@/lib/ai/humanizer'

describe('humanizeResponse', () => {
  it('devuelve texto vacío si recibe null', () => {
    expect(humanizeResponse(null as any)).toBeNull()
  })

  it('devuelve texto vacío si recibe string vacío', () => {
    expect(humanizeResponse('')).toBe('')
  })

  it('transforma respuesta robótica a natural', () => {
    const robotic = 'Claro que sí, con mucho gusto te puedo ayudar. El día de hoy tenemos excelentes opciones para ti.'
    const result = humanizeResponse(robotic)
    expect(result).not.toContain('Claro que sí')
    expect(result).not.toContain('el día de hoy')
    expect(result).toContain('hoy')
  })

  it('elimina referencias a IA y bots', () => {
    const input = 'Como asistente virtual, me gustaría ayudarte. Soy una IA que puede orientarte.'
    const result = humanizeResponse(input)
    expect(result).not.toContain('asistente virtual')
    expect(result).not.toContain('Soy una IA')
  })

  it('corrige identidad: Carlos → Jhon', () => {
    const input = 'Me llamo Carlos y estoy aquí para ayudarte.'
    const result = humanizeResponse(input)
    expect(result).toContain('Jhon')
    expect(result).not.toContain('Carlos')
  })

  it('corrige identidad: ValiAutoFlow → Jhon', () => {
    const input = 'ValiAutoFlow aquí, ¿en qué te puedo apoyar?'
    const result = humanizeResponse(input)
    expect(result).toContain('Jhon')
    expect(result).not.toContain('ValiAutoFlow')
  })
})

describe('stripMarkdown', () => {
  it('elimina negritas y cursivas', () => {
    expect(stripMarkdown('**negrita**')).toBe('negrita')
    expect(stripMarkdown('*cursiva*')).toBe('cursiva')
    expect(stripMarkdown('***ambas***')).toBe('ambas')
  })

  it('elimina encabezados markdown', () => {
    expect(stripMarkdown('## Título')).toBe('Título')
    expect(stripMarkdown('### Subtítulo')).toBe('Subtítulo')
  })

  it('elimina bloques de código', () => {
    expect(stripMarkdown('```js\nconsole.log("hi")\n```')).toBe('')
  })

  it('elimina links pero mantiene texto', () => {
    expect(stripMarkdown('[Google](https://google.com)')).toBe('Google')
  })

  it('elimina listas numeradas y viñetas', () => {
    const input = '1. Primero\n2. Segundo\n- Tercero\n* Cuarto'
    const result = stripMarkdown(input)
    expect(result).not.toMatch(/^\d+\./m)
    expect(result).not.toMatch(/^[-*]\s/m)
  })
})

describe('removeRoboticOpeners', () => {
  it('elimina "Claro que sí, " del inicio', () => {
    expect(removeRoboticOpeners('Claro que sí, te ayudo con eso.')).toBe('te ayudo con eso.')
  })

  it('elimina "Por supuesto" del inicio', () => {
    const result = removeRoboticOpeners('Por supuesto que sí, aquí estamos.')
    expect(result).not.toContain('Por supuesto')
  })

  it('elimina "Estoy aquí para ayudarte"', () => {
    const result = removeRoboticOpeners('Estoy aquí para ayudarte con tu consulta.')
    expect(result).not.toContain('Estoy aquí para ayudarte')
  })

  it('no elimina opener del medio del texto', () => {
    const input = 'Me dijo que por supuesto era correcto.'
    const result = removeRoboticOpeners(input)
    expect(result).toBe(input)
  })
})

describe('replaceFormalWords', () => {
  it('reemplaza "el día de hoy" → "hoy"', () => {
    expect(replaceFormalWords('El día de hoy tenemos promociones.')).toContain('hoy')
    expect(replaceFormalWords('El día de hoy tenemos promociones.')).not.toContain('el día de hoy')
  })

  it('reemplaza "sin embargo" → "pero"', () => {
    expect(replaceFormalWords('Es caro, sin embargo vale la pena.')).toContain('pero')
  })

  it('reemplaza "le recomendaría" → "te recomiendo"', () => {
    expect(replaceFormalWords('Le recomendaría el plan premium.')).toContain('te recomiendo')
  })

  it('elimina "atentamente" y "saludos cordiales"', () => {
    const input = 'Aquí tienes la info. Atentamente, Jhon. Saludos cordiales.'
    const result = replaceFormalWords(input)
    expect(result).not.toContain('Atentamente')
    expect(result).not.toContain('Saludos cordiales')
  })
})

describe('normalizeWhitespace', () => {
  it('colapsa espacios múltiples', () => {
    expect(normalizeWhitespace('hola   mundo')).toBe('hola mundo')
  })

  it('limita saltos de línea a 2 consecutivos', () => {
    const result = normalizeWhitespace('a\n\n\n\nb')
    expect(result).not.toContain('\n\n\n')
  })

  it('elimina líneas en blanco', () => {
    const result = normalizeWhitespace('a\n   \nb')
    expect(result).not.toMatch(/\n\s*\n/)
  })
})

describe('fixAIArtifacts', () => {
  it('elimina tags como [INSIGHT], [DIRECCION]', () => {
    const input = '[INSIGHT] El lead está interesado. [DIRECCION] Ofrecer plan premium.'
    const result = fixAIArtifacts(input)
    expect(result).not.toContain('[INSIGHT]')
    expect(result).not.toContain('[DIRECCION]')
  })

  it('elimina quick replies separados por |', () => {
    const input = 'Te recomiendo el plan premium. | Plan Básico | Plan Pro | Ver precios |'
    const result = fixAIArtifacts(input)
    expect(result).not.toContain('Plan Básico')
  })

  it('elimina (emoji optional)', () => {
    expect(fixAIArtifacts('Hola 😊 (emoji optional)')).not.toContain('(emoji optional)')
  })

  it('elimina doble puntuación', () => {
    expect(fixAIArtifacts('Muy bien!!')).toBe('Muy bien!')
    expect(fixAIArtifacts('¿Qué??')).toBe('¿Qué?')
  })
})

describe('enforceIdentity', () => {
  it('reemplaza "Me llamo Carlos" → "Me llamo Jhon"', () => {
    expect(enforceIdentity('Me llamo Carlos')).toBe('Me llamo Jhon')
  })

  it('reemplaza "Soy Vali" → "Soy Jhon"', () => {
    expect(enforceIdentity('Soy Vali')).toBe('Soy Jhon')
  })

  it('reemplaza "de ValiAutoFlow, soy" → "soy Jhon del equipo de"', () => {
    const result = enforceIdentity('de ValiAutoFlow, soy tu asesor')
    expect(result).toContain('Jhon del equipo de')
  })

  it('no modifica texto sin identidad incorrecta', () => {
    expect(enforceIdentity('Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?')
  })

  it('maneja null y undefined', () => {
    expect(enforceIdentity(null as any)).toBeNull()
    expect(enforceIdentity(undefined as any)).toBeUndefined()
  })
})

describe('maybeAddEmoji', () => {
  it('no siempre agrega emoji (10% probabilidad)', () => {
    // Ejecutar 100 veces y verificar que no siempre agrega
    let added = 0
    for (let i = 0; i < 100; i++) {
      const result = maybeAddEmoji('Hola, ¿cómo estás?')
      if (result !== 'Hola, ¿cómo estás?') added++
    }
    // Con 10% probabilidad, esperamos ~10 de 100, pero nunca 100
    expect(added).toBeLessThan(50)
  })

  it('no agrega emoji si ya termina con uno', () => {
    // Forzar Math.random para que intente agregar
    const originalRandom = Math.random
    Math.random = () => 0.05 // dentro del 10%
    const result = maybeAddEmoji('Hola 😊')
    expect(result).toBe('Hola 😊')
    Math.random = originalRandom
  })

  it('no agrega emoji si termina con pregunta', () => {
    const originalRandom = Math.random
    Math.random = () => 0.05
    const result = maybeAddEmoji('¿Qué necesitas?')
    expect(result).toBe('¿Qué necesitas?')
    Math.random = originalRandom
  })
})

describe('splitLongMessage', () => {
  it('devuelve mensaje único si es corto', () => {
    const result = splitLongMessage('Hola, ¿cómo estás?', 280)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Hola, ¿cómo estás?')
  })

  it('divide mensajes largos en múltiples partes', () => {
    const longMsg = 'A'.repeat(300) + '. Y otra cosa más.'
    const result = splitLongMessage(longMsg, 280)
    expect(result.length).toBeGreaterThan(1)
  })

  it('respeta maxChars en cada parte', () => {
    const longMsg = 'Palabra '.repeat(100)
    const result = splitLongMessage(longMsg, 100)
    for (const part of result) {
      expect(part.length).toBeLessThanOrEqual(110) // Allow small margin
    }
  })

  it('prioriza división en saltos de línea', () => {
    const msg = 'Primera parte con algo de texto.\nSegunda parte con más texto aquí.\nTercera parte final.'
    const result = splitLongMessage(msg, 60)
    // Al menos uno debería dividirse en newline
    expect(result.length).toBeGreaterThanOrEqual(2)
  })
})

describe('getRandomDelay', () => {
  it('retorna un número entre 1000 y 4500 para mensajes cortos', () => {
    const delay = getRandomDelay(10)
    expect(delay).toBeGreaterThanOrEqual(1000)
    expect(delay).toBeLessThanOrEqual(4500)
  })

  it('agrega delay extra para mensajes más largos', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const shortDelay = getRandomDelay(10)
      const longDelay = getRandomDelay(500)
      expect(longDelay).toBeGreaterThanOrEqual(shortDelay)
    } finally {
      randomSpy.mockRestore()
    }
  })
})

describe('getInterMessageDelay', () => {
  it('retorna un delay entre 2000 y 4000ms', () => {
    for (let i = 0; i < 10; i++) {
      const delay = getInterMessageDelay()
      expect(delay).toBeGreaterThanOrEqual(2000)
      expect(delay).toBeLessThanOrEqual(4000)
    }
  })
})
