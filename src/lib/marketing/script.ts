// ═══════════════════════════════════════════════════════════════
// Generación de GUIÓN (narración) para videos de autos, con IA + fallback.
// Ajusta la longitud al tiempo objetivo (~2.6 palabras/seg de locución).
// ═══════════════════════════════════════════════════════════════

import { chatWithAI } from '@/lib/ai/providers'
import type { CarCreative } from './creative'
import { money } from './creative'

export interface ScriptOpts { tone?: string; durationSec?: number; extra?: string }

const TONES: Record<string, string> = {
  profesional: 'profesional y confiable',
  energico: 'enérgico y emocionante',
  lujo: 'elegante y aspiracional',
  cercano: 'cercano y amigable',
  urgente: 'con urgencia y oferta',
}

export function fallbackScript(c: CarCreative, opts: ScriptOpts = {}): string {
  const specs = [c.year && `del ${c.year}`, c.km && `con ${c.km}`, c.transmision, c.combustible].filter(Boolean).join(', ')
  return [
    `¿Buscas un ${c.brand || 'auto'} que combine estilo y rendimiento?`,
    `Te presentamos el ${c.title}${specs ? `, ${specs}` : ''}.`,
    c.price != null ? `Disponible por ${money(c.price, c.currency)}.` : 'Pregunta por su precio especial.',
    `${c.dealerName} te espera${c.ubicacion ? ` en ${c.ubicacion}` : ''}. Agenda tu prueba de manejo hoy.`,
  ].join(' ')
}

export async function generateScript(c: CarCreative, opts: ScriptOpts = {}, tenantApiKey?: string): Promise<string> {
  const dur = opts.durationSec || 12
  const words = Math.round(dur * 2.6)
  const tone = TONES[opts.tone || 'profesional'] || TONES.profesional
  const specs = [c.year && `Año ${c.year}`, c.km && `Km ${c.km}`, c.transmision, c.combustible, c.carroceria, c.condicion].filter(Boolean).join(', ')
  const sys = 'Eres un guionista publicitario automotriz de élite (nivel spot de TV). Escribes locuciones para reels verticales de venta de autos en México que DETIENEN el scroll. Reglas: arranca con un GANCHO de 3-6 palabras (pregunta o afirmación potente, jamás "te presentamos"); frases CORTAS y rítmicas; menciona máximo 2 specs (las más vendedoras); di el precio si existe; cierra con llamado a la acción + nombre del vendedor. Texto fluido para leer en voz alta, sin acotaciones, sin emojis, sin hashtags. Responde SOLO el guión.'
  const user = `Auto: ${c.title}${c.version ? ` (${c.version})` : ''}. Specs: ${specs || 'n/d'}. Precio: ${c.price != null ? money(c.price, c.currency) : 'a consultar'}. Vendedor: ${c.dealerName}${c.ubicacion ? `, ${c.ubicacion}` : ''}.
Tono ${tone}. Duración objetivo ${dur} segundos (~${words} palabras, NO te pases). ${opts.extra ? ` Indicaciones extra: ${opts.extra}.` : ''}`
  try {
    const r = await chatWithAI([{ role: 'system', content: sys }, { role: 'user', content: user }], 'glm', undefined, { temperature: 0.85, maxTokens: 500, disableThinking: true, ...(tenantApiKey ? { tenantApiKey } : {}) })
    const t = (r?.content || '').trim()
    return t.length > 15 ? t : fallbackScript(c, opts)
  } catch { return fallbackScript(c, opts) }
}
