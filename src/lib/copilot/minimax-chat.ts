// ═══════════════════════════════════════════════════════════════
// Cliente de chat MiniMax para el Copiloto IA.
// Usa MiniMax-Text-01 (NO razonador) por defecto: el copiloto opera con un
// protocolo ESTRICTO de JSON ({"action"}/{"final"}) y el bucle ReAct maneja
// los pasos externamente, así que NO necesita la cadena de razonamiento de M3
// — que además hacía que M3 "narrara" en prosa en vez de emitir la acción.
// Text-01 sigue el formato mucho mejor y es más rápido. Override con env.
// ═══════════════════════════════════════════════════════════════

const URL = 'https://api.minimax.io/v1/text/chatcompletion_v2'
const MODEL = process.env.MINIMAX_COPILOT_MODEL || 'MiniMax-Text-01'

export interface MMMessage { role: 'system' | 'user' | 'assistant'; content: string }

export const minimaxAvailable = (): boolean => !!process.env.MINIMAX_API_KEY

export async function minimaxChat(messages: MMMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const key = process.env.MINIMAX_API_KEY
  if (!key) throw new Error('MINIMAX_API_KEY no configurado')
  // Hasta 3 intentos: MiniMax a veces devuelve vacío/5xx transitorio y eso
  // tumbaba todo el turno del copiloto con un 500 al usuario.
  let lastErr: Error = new Error('MiniMax no respondió')
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200 * attempt))
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, messages, temperature: opts.temperature ?? 0.5, top_p: 0.95, max_tokens: opts.maxTokens ?? 2600 }),
      })
      if (!res.ok) { lastErr = new Error(`MiniMax ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`); if (res.status >= 500 || res.status === 429) continue; throw lastErr }
      const data = await res.json().catch(() => ({})) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] }
      const m = data.choices?.[0]?.message
      const content = (m?.content || m?.reasoning_content || '').trim()
      if (!content) { lastErr = new Error('MiniMax devolvió respuesta vacía'); continue }
      return content
    } catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)) }
  }
  throw lastErr
}
