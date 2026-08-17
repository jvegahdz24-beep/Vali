// ═══════════════════════════════════════════════════════════════
// "Brief" creativo: el usuario describe en lenguaje natural cómo quiere
// el contenido (estilo, colores, vibra) y la IA devuelve una CONFIG lista
// (acento, plantilla sugerida, tono de guión, mood de música, overlay).
// Es el "plus" de la IA sobre los controles manuales.
// ═══════════════════════════════════════════════════════════════

import { chatWithAIJson } from '@/lib/ai/providers'

export interface BriefResult {
  accent: string          // hex
  feedTemplate: string    // clasica | ficha | oferta
  storyTemplate: string   // historia | cobertura | editorial
  scriptTone: string      // profesional | energico | lujo | cercano | urgente
  musicMood: string       // energica | lujo | urbana | corporativa | epica | alegre
  transition: string      // fade | slideleft | smoothup | circleopen | dissolve
  watermark: boolean
  notes: string
}

const FALLBACK: BriefResult = {
  accent: '#10b981', feedTemplate: 'clasica', storyTemplate: 'historia',
  scriptTone: 'profesional', musicMood: 'energica', transition: 'fade', watermark: true,
  notes: 'Configuración equilibrada para venta automotriz.',
}

export async function interpretBrief(text: string, tenantApiKey?: string): Promise<BriefResult> {
  const sys = 'Eres director de arte de marketing automotriz. Conviertes una petición en lenguaje natural en una configuración de diseño. Responde SOLO JSON válido con las claves pedidas y valores EXACTOS de las listas dadas.'
  const user = `Petición del usuario: "${text}".
Devuelve JSON: {
"accent": color hex acorde a la petición (ej #C9A227 para dorado/lujo, #ef4444 para oferta/urgencia, #2563eb para confianza),
"feedTemplate": uno de [clasica, ficha, oferta],
"storyTemplate": uno de [historia, cobertura, editorial],
"scriptTone": uno de [profesional, energico, lujo, cercano, urgente],
"musicMood": uno de [energica, lujo, urbana, corporativa, epica, alegre],
"transition": uno de [fade, slideleft, smoothup, circleopen, dissolve],
"watermark": boolean (true si quiere logo/marca de agua),
"notes": breve explicación en español de las elecciones }`
  try {
    const { data } = await chatWithAIJson<Partial<BriefResult>>([{ role: 'system', content: sys }, { role: 'user', content: user }], 'glm', undefined, { temperature: 0.5, maxTokens: 500, disableThinking: true, ...(tenantApiKey ? { tenantApiKey } : {}) })
    const pick = <T extends string>(v: unknown, allowed: T[], def: T): T => (typeof v === 'string' && allowed.includes(v as T) ? v as T : def)
    return {
      accent: typeof data.accent === 'string' && /^#?[0-9a-fA-F]{6}$/.test(data.accent) ? (data.accent.startsWith('#') ? data.accent : `#${data.accent}`) : FALLBACK.accent,
      feedTemplate: pick(data.feedTemplate, ['clasica', 'ficha', 'oferta'], 'clasica'),
      storyTemplate: pick(data.storyTemplate, ['historia', 'cobertura', 'editorial'], 'historia'),
      scriptTone: pick(data.scriptTone, ['profesional', 'energico', 'lujo', 'cercano', 'urgente'], 'profesional'),
      musicMood: pick(data.musicMood, ['energica', 'lujo', 'urbana', 'corporativa', 'epica', 'alegre'], 'energica'),
      transition: pick(data.transition, ['fade', 'slideleft', 'smoothup', 'circleopen', 'dissolve'], 'fade'),
      watermark: data.watermark !== false,
      notes: typeof data.notes === 'string' ? data.notes : FALLBACK.notes,
    }
  } catch { return FALLBACK }
}
