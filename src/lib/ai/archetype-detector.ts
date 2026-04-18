// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Customer Archetype Detection
// Detects customer profiles silently from conversation
// ═══════════════════════════════════════════════════════════════

export type Archetype = 'practico' | 'familiar' | 'aspiracional' | 'estrategico' | 'consciente' | 'desconocido'

export interface ArchetypeDetection {
  archetype: Archetype
  confidence: number
  signals: string[]
  recommendedModels: string[]
  triggerPhrase: string
  tone: string
}

const ARCHETYPE_PATTERNS: Record<string, {
  keywords: string[]
  models: string[]
  trigger: string
  tone: string
}> = {
  practico: {
    keywords: ['gasto', 'gasolina', 'económico', 'economico', 'barato', 'precio', 'cuánto gasta', 'mantenimiento', 'rendimiento', 'km/l', 'litro', 'combustible', 'ahorro', 'costo por', 'mensualidad', 'comparación', 'comparacion'],
    models: ['Grand i10', 'HB20'],
    trigger: 'La mayoría se enfoca en precio, pero el verdadero ahorro está en el mantenimiento',
    tone: 'Datos concretos, sin rodeos. Enfocado en números y comparativas.',
  },
  familiar: {
    keywords: ['familia', 'hijos', 'esposa', 'esposo', 'mujer', 'niños', 'bebé', 'bebe', 'niña', 'seguridad', 'espacio', 'maletas', 'sillas', 'viaje', 'carretera', 'vacaciones', 'cómodo', 'comodo', 'amplio', 'cinco personas', '5 personas'],
    models: ['Creta', 'Creta Grand'],
    trigger: 'Cuando viajas con más personas, el espacio y la seguridad cambian todo',
    tone: 'Cálido, enfocado en experiencia familiar y tranquilidad.',
  },
  aspiracional: {
    keywords: ['diseño', 'bonito', 'bonita', 'elegante', 'potente', 'deportivo', 'lujo', 'premium', 'nuevo', 'último modelo', 'diferente', 'llama atención', 'tecnología', 'pantalla', 'camara', 'cámara', 'color', 'estilo'],
    models: ['Elantra', 'Tucson N Line'],
    trigger: 'Hay modelos que no solo manejas... se disfrutan',
    tone: 'Experiencial, emocional, con personalidad.',
  },
  estrategico: {
    keywords: ['uber', 'diDi', 'cabify', 'plataforma', 'renta', 'invertir', 'retorno', 'negocio', 'flota', 'empresa', 'comercial', 'depreciación', 'seguro', 'gasto fiscal', 'deducible', 'comprobante', 'factura'],
    models: ['Grand i10', 'HB20'],
    trigger: 'Lo importante no es cuánto cuesta... sino cuánto te regresa',
    tone: 'Analítico, datos, sin emoción. Enfocado en ROI.',
  },
  consciente: {
    keywords: ['híbrido', 'hibrido', 'eléctrico', 'electrico', 'contaminación', 'contaminacion', 'emisiones', 'eco', 'sustentable', 'medio ambiente', 'batería', 'bateria', 'carga', 'eficiente', 'green', 'verde'],
    models: ['Elantra Híbrido', 'Tucson Híbrida'],
    trigger: 'Los híbridos están en otro nivel tanto en consumo como en experiencia',
    tone: 'Informado, técnico pero accesible.',
  },
}

export function detectArchetype(messages: string[]): ArchetypeDetection {
  if (!messages || messages.length === 0) {
    return {
      archetype: 'desconocido',
      confidence: 0,
      signals: [],
      recommendedModels: [],
      triggerPhrase: '',
      tone: '',
    }
  }

  const allText = messages.join(' ').toLowerCase()
  const normalizedText = allText.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let bestArchetype = 'desconocido' as Archetype
  let bestScore = 0
  let bestSignals: string[] = []

  for (const [archetype, config] of Object.entries(ARCHETYPE_PATTERNS)) {
    let score = 0
    const signals: string[] = []

    for (const keyword of config.keywords) {
      const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (normalizedText.includes(normalizedKeyword) || allText.includes(keyword.toLowerCase())) {
        score += 1
        signals.push(keyword)
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestArchetype = archetype as Archetype
      bestSignals = signals
    }
  }

  if (bestScore < 2) {
    return {
      archetype: 'desconocido',
      confidence: 0,
      signals: [],
      recommendedModels: [],
      triggerPhrase: '¿Qué priorizas principalmente: ahorro, espacio o diseño?',
      tone: '',
    }
  }

  const config = ARCHETYPE_PATTERNS[bestArchetype]
  const confidence = Math.min(bestScore / 5, 1)

  return {
    archetype: bestArchetype,
    confidence: Math.round(confidence * 100) / 100,
    signals: bestSignals,
    recommendedModels: config.models,
    triggerPhrase: config.trigger,
    tone: config.tone,
  }
}
