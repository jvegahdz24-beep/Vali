// ═══════════════════════════════════════════════════════════════
// Asesor IA de marketing: consejos accionables según el negocio real
// (inventario, fotos, actividad de publicación, marca). IA + datos duros
// con fallback determinístico para que SIEMPRE dé consejos útiles.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAIJson } from '@/lib/ai/providers'

export interface Tip { title: string; detail: string; severity?: 'info' | 'do' | 'warn' }

function hasPhoto(it: { imageUrl: string | null; metadata: string | null }): boolean {
  if (it.imageUrl) return true
  try { const m = JSON.parse(it.metadata || '{}'); return Array.isArray(m.images) && m.images.length > 0 } catch { return false }
}

export async function generateTips(workspaceId: string): Promise<{ tips: Tip[]; ai: boolean }> {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [items, ws, recent, bot] = await Promise.all([
    db.catalogItem.findMany({ where: { workspaceId }, select: { price: true, metadata: true, category: true, imageUrl: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } }),
    db.marketingPost.count({ where: { workspaceId, status: 'ok', createdAt: { gte: since } } }).catch(() => 0),
    db.marketingBotConfig.findUnique({ where: { workspaceId } }).catch(() => null),
  ])
  const total = items.length
  const noPhoto = items.filter((i) => !hasPhoto(i)).length
  const brands: Record<string, number> = {}
  let sum = 0, n = 0
  for (const it of items) { if (it.price != null) { sum += it.price; n++ }; try { const b = JSON.parse(it.metadata || '{}').marca; if (b) brands[b] = (brands[b] || 0) + 1 } catch { /* */ } }
  const avg = n ? Math.round(sum / n) : null
  const topBrands = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)

  // Consejos data-driven (siempre presentes)
  const data: Tip[] = []
  if (noPhoto > 0) data.push({ title: `${noPhoto} auto(s) sin foto`, detail: 'Súbeles al menos una foto buena: los creativos con foto real venden mucho más que los de placeholder.', severity: 'warn' })
  if (recent === 0) data.push({ title: 'No has publicado esta semana', detail: 'Publica al menos 3 veces por semana. Activa el Piloto Automático para no depender de recordarlo.', severity: 'do' })
  else if (recent < 3) data.push({ title: `Solo ${recent} publicación(es) esta semana`, detail: 'Sube la frecuencia a 3-5 por semana para mantener alcance constante.', severity: 'do' })
  if (!bot?.enabled) data.push({ title: 'Piloto Automático apagado', detail: 'Actívalo para que el sistema publique solo en los mejores horarios (Mar-Jue 11-13h y 19-21h).', severity: 'do' })
  if (avg && avg > 500000) data.push({ title: 'Inventario premium', detail: 'Con autos de precio alto usa la plantilla Editorial, tono "Lujo" y música elegante para reforzar valor.', severity: 'info' })

  try {
    const sys = 'Eres consultor de marketing automotriz en México. Das consejos concretos y accionables (no genéricos) para que un concesionario venda más con su contenido de redes. Responde SOLO JSON.'
    const user = `Negocio: ${ws?.name || 'concesionario'}. Inventario: ${total} autos, ${noPhoto} sin foto, precio prom ${avg ?? 'n/d'}, marcas top ${topBrands.join(', ') || 'n/d'}. Publicaciones últimos 7 días: ${recent}. Bot automático: ${bot?.enabled ? 'activo' : 'apagado'}.
Devuelve JSON {"tips":[{"title":"corto","detail":"consejo accionable 1-2 frases","severity":"info|do|warn"}]} con 3 consejos ESTRATÉGICOS de diseño/estilo/contenido específicos para este negocio.`
    const { data: out } = await chatWithAIJson<{ tips?: Tip[] }>([{ role: 'system', content: sys }, { role: 'user', content: user }], 'glm', undefined, { temperature: 0.6, maxTokens: 700, disableThinking: true })
    const aiTips = Array.isArray(out?.tips) ? out!.tips!.filter((t) => t?.title && t?.detail).slice(0, 4) : []
    if (aiTips.length) return { tips: [...data, ...aiTips].slice(0, 8), ai: true }
  } catch { /* fallback */ }

  if (!data.length) data.push({ title: 'Publica con constancia', detail: 'Genera creativos de tus autos destacados y publícalos en feed e historias varias veces por semana.', severity: 'do' })
  return { tips: data, ai: false }
}
