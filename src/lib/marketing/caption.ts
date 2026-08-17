// ═══════════════════════════════════════════════════════════════
// Generación de captions para publicaciones de autos.
// Intenta con IA (chatWithAI) y SIEMPRE cae a un texto determinístico
// profesional si la IA no está disponible (sin saldo, etc.).
// ═══════════════════════════════════════════════════════════════

import { chatWithAI } from '@/lib/ai/providers'
import type { CarCreative } from './creative'
import { money } from './creative'

const BASE_TAGS = [
  'autos', 'autosenventa', 'seminuevos', 'autosusados', 'autosmexico',
  'carros', 'compraventa', 'agenciadeautos', 'financiamiento', 'autodeldia',
]

const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '')

export function buildHashtags(c: CarCreative, max = 15): string[] {
  const seen = new Set<string>(); const out: string[] = []
  const cand = [c.brand, c.model, c.carroceria, c.combustible, c.ubicacion, ...BASE_TAGS]
  for (const raw of cand) {
    if (!raw) continue
    const t = clean(String(raw))
    if (t.length < 2 || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase()); out.push(`#${t}`)
    if (out.length >= max) break
  }
  return out
}

export interface CaptionResult { text: string; hashtags: string[]; ai: boolean }

export function fallbackCaption(c: CarCreative, platform: 'instagram' | 'facebook'): CaptionResult {
  const hashtags = buildHashtags(c, platform === 'instagram' ? 15 : 8)
  const specs = [
    c.year && `Año ${c.year}`, c.km, c.transmision, c.combustible, c.carroceria,
  ].filter(Boolean) as string[]
  const hook = `🚗 ${c.title}`
  const bullets = specs.map((s) => `✅ ${s}`).join('\n')
  const price = c.price != null ? `\n💰 ${money(c.price, c.currency)}` : ''
  const cta = c.phone ? `\n\n📲 Escríbenos: ${c.phone}` : '\n\n📲 Envíanos un mensaje para más info'
  const loc = c.ubicacion ? `\n📍 ${c.ubicacion}` : ''
  return { text: `${hook}${price}\n\n${bullets}${loc}${cta}`.trim(), hashtags, ai: false }
}

export async function generateCaption(c: CarCreative, platform: 'instagram' | 'facebook', tenantApiKey?: string, examples?: string[]): Promise<CaptionResult> {
  const specs = [c.year && `Año: ${c.year}`, c.km && `Km: ${c.km}`, c.transmision, c.combustible, c.carroceria, c.condicion].filter(Boolean).join(', ')
  const sys = 'Eres un experto en marketing automotriz para redes sociales en México. Escribes captions que venden autos: con gancho emocional, beneficios concretos y llamada a la acción clara. Tono cercano y profesional. Responde SOLO con el texto del caption, sin hashtags al final (esos van aparte), sin comillas.'
  // Aprendizaje: captions que YA funcionaron con la audiencia de este negocio
  const learned = examples?.length
    ? `\n\nEstos textos anteriores tuvieron la mejor respuesta con esta audiencia — imita su ESTILO (tono, estructura, gancho) sin copiar frases:\n${examples.map((e, i) => `${i + 1}. """${e}"""`).join('\n')}`
    : ''
  const user = `Crea un caption para ${platform === 'instagram' ? 'Instagram' : 'Facebook'} para vender este auto:
- ${c.title}${c.version ? ` (${c.version})` : ''}
- ${specs}
- Precio: ${c.price != null ? money(c.price, c.currency) : 'a consultar'}
- Vendedor: ${c.dealerName}${c.ubicacion ? `, ${c.ubicacion}` : ''}${c.phone ? `, tel ${c.phone}` : ''}
Reglas: ${platform === 'instagram' ? 'máx 6 líneas, usa 2-4 emojis' : 'máx 8 líneas, cálido'}. Incluye CTA. NADA de hashtags.${learned}`
  try {
    const r = await chatWithAI(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      'glm', undefined,
      { temperature: 0.8, maxTokens: 700, disableThinking: true, ...(tenantApiKey ? { tenantApiKey } : {}) },
    )
    const text = (r?.content || '').trim()
    if (!text || text.length < 20) throw new Error('vacío')
    return { text, hashtags: buildHashtags(c, platform === 'instagram' ? 15 : 8), ai: true }
  } catch {
    return fallbackCaption(c, platform)
  }
}
