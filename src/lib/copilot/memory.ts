// ═══════════════════════════════════════════════════════════════
// Memoria de aprendizaje del Copiloto (autodidacta). Guarda hechos,
// preferencias y lecciones del negocio; las inyecta en cada conversación
// y las EXTRAE automáticamente tras cada interacción para mejorar solo.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAIJson } from '@/lib/ai/providers'

const MAX_MEMORIES = 200
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const KINDS = ['preference', 'fact', 'lesson', 'shortcut']

export interface Memory { id: string; kind: string; content: string; source: string }

/** Carga la memoria relevante (lo aprendido) priorizando lo que pediste y lo más usado. */
export async function loadMemories(workspaceId: string, limit = 30): Promise<Memory[]> {
  const mems = await db.copilotMemory.findMany({
    where: { workspaceId },
    orderBy: [{ source: 'desc' }, { uses: 'desc' }, { createdAt: 'desc' }], // 'user' > 'auto'
    take: limit,
    select: { id: true, kind: true, content: true, source: true },
  }).catch(() => [])
  return mems
}

/** Bloque de texto para inyectar en el system prompt. */
export function memoryBlock(mems: Memory[]): string {
  if (!mems.length) return ''
  const label: Record<string, string> = { preference: 'Preferencia', fact: 'Dato', lesson: 'Lección', shortcut: 'Atajo' }
  const lines = mems.map((m) => `- (${label[m.kind] || 'Dato'}) ${m.content}`).join('\n')
  return `\n\nMEMORIA (lo que has APRENDIDO de este negocio y del usuario; aplícalo y respétalo):\n${lines}`
}

/** Guarda un aprendizaje con deduplicación. Devuelve true si se guardó. */
export async function saveMemory(workspaceId: string, content: string, opts: { kind?: string; source?: 'auto' | 'user' } = {}): Promise<boolean> {
  const text = String(content || '').trim()
  if (text.length < 4 || text.length > 400) return false
  const kind = KINDS.includes(opts.kind || '') ? opts.kind! : 'fact'
  const dedupeKey = norm(text).slice(0, 120)
  const existing = await db.copilotMemory.findFirst({ where: { workspaceId, dedupeKey } }).catch(() => null)
  if (existing) {
    // refuerza la existente (subir uso / promover a 'user' si lo pediste explícito)
    await db.copilotMemory.update({ where: { id: existing.id }, data: { uses: { increment: 1 }, lastUsedAt: new Date(), ...(opts.source === 'user' ? { source: 'user', content: text } : {}) } }).catch(() => {})
    return false
  }
  await db.copilotMemory.create({ data: { workspaceId, kind, content: text, dedupeKey, source: opts.source || 'auto' } }).catch(() => {})
  // poda si excede el máximo (borra lo más viejo y menos usado de origen 'auto')
  const count = await db.copilotMemory.count({ where: { workspaceId } }).catch(() => 0)
  if (count > MAX_MEMORIES) {
    const old = await db.copilotMemory.findMany({ where: { workspaceId, source: 'auto' }, orderBy: [{ uses: 'asc' }, { createdAt: 'asc' }], take: count - MAX_MEMORIES, select: { id: true } }).catch(() => [])
    if (old.length) await db.copilotMemory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } }).catch(() => {})
  }
  return true
}

/** Marca como usadas las memorias inyectadas (para priorizar las relevantes). */
export async function touchMemories(ids: string[]): Promise<void> {
  if (!ids.length) return
  await db.copilotMemory.updateMany({ where: { id: { in: ids } }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => {})
}

/** Autodidacta: extrae 0-3 aprendizajes DURABLES de la última interacción y los guarda. */
export async function learnFromConversation(workspaceId: string, userMsg: string, assistantReply: string, actions: string[]): Promise<void> {
  try {
    const sys = 'Eres el módulo de aprendizaje de un copiloto de negocio. De la interacción, extrae SOLO aprendizajes DURABLES y reutilizables sobre el NEGOCIO o las PREFERENCIAS del usuario (no cosas momentáneas). Ejemplos válidos: "Prefiere mensajes cortos y con emojis", "El horario del lote es 9 a 19h", "Sus mejores autos son SUV", "No publicar los domingos". Ignora pedidos puntuales. Responde SOLO JSON.'
    const user = `Usuario: ${userMsg}\nCopiloto: ${assistantReply}\nAcciones: ${actions.join(', ') || 'ninguna'}\n\nDevuelve JSON {"learnings":[{"kind":"preference|fact|lesson|shortcut","content":"frase corta"}]} con 0 a 3 aprendizajes durables (vacío si no hay nada que valga la pena recordar).`
    const { data } = await chatWithAIJson<{ learnings?: { kind?: string; content?: string }[] }>(
      [{ role: 'system', content: sys }, { role: 'user', content: user }], 'glm', undefined, { temperature: 0.3, maxTokens: 400, disableThinking: true },
    )
    for (const l of (data?.learnings || []).slice(0, 3)) {
      if (l?.content) await saveMemory(workspaceId, l.content, { kind: l.kind, source: 'auto' })
    }
  } catch { /* el aprendizaje nunca debe romper la respuesta */ }
}
