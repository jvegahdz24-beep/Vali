// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Comprensión multimodal de media entrante (WhatsApp).
// Convierte audio / imagen / documento en TEXTO que el bot puede entender:
//   - audio (notas de voz) → transcripción (STT)
//   - imagen → descripción por visión
//   - documento (PDF/Excel/CSV/texto) → texto extraído (LOCAL, sin API)
//
// Proveedores con auto-detección por env (el que tenga key con fondos):
//   STT:    GROQ_API_KEY (whisper-large-v3-turbo) → OPENAI_API_KEY (whisper-1)
//   Visión: GROQ_API_KEY (llama-vision) → ZAI_API_KEY (glm-4.5v) → OPENAI_API_KEY (gpt-4o-mini)
// Docs no necesitan API. Si no hay proveedor para audio/imagen, devuelve null
// y el bot pide el texto amablemente (fallback existente).
// ═══════════════════════════════════════════════════════════════

import type { MediaInfo } from '@/lib/whatsapp/media-handler'

// Keys que el TENANT puede configurar en Configuración → Conexiones (settings.apiKeys),
// con fallback a las del .env de la plataforma.
export interface MediaKeys { groq?: string; openai?: string }
const MINIMAX = process.env.MINIMAX_API_KEY
const groqKey = (k?: MediaKeys) => (k?.groq && k.groq.trim()) || process.env.GROQ_API_KEY || ''
const openaiKey = (k?: MediaKeys) => (k?.openai && k.openai.trim()) || process.env.OPENAI_API_KEY || ''
// MiniMax SÍ ve imágenes con la key actual (verificado): endpoint nativo
// chatcompletion_v2 + image_url. Text-01 da salida limpia para descripción.
const MINIMAX_VISION_MODEL = process.env.MINIMAX_VISION_MODEL || 'MiniMax-Text-01'

const stripThink = (s: string) => s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()

// MiniMax visión (endpoint nativo) — usa la MINIMAX_API_KEY existente.
async function minimaxVision(dataUrl: string, prompt: string): Promise<string | null> {
  if (!MINIMAX) return null
  try {
    const r = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MINIMAX}` },
      body: JSON.stringify({
        model: MINIMAX_VISION_MODEL, max_tokens: 600,
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: prompt }] }],
      }),
    })
    const j = await r.json() as { choices?: { message?: { content?: string } }[]; base_resp?: { status_msg?: string } }
    const c = stripThink(j?.choices?.[0]?.message?.content || '')
    if (c) return c
    console.warn('[Media] MiniMax vision empty/err', j?.base_resp?.status_msg || r.status)
  } catch (e) { console.warn('[Media] MiniMax vision error', e instanceof Error ? e.message : e) }
  return null
}

// ─── STT: transcribir audio (notas de voz) ───
export async function transcribeAudio(buffer: Buffer, mimeType: string, keys?: MediaKeys): Promise<string | null> {
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'm4a'
  const GROQ = groqKey(keys), OPENAI = openaiKey(keys)
  // 1) Groq Whisper (rápido, hay tier gratis)
  if (GROQ) {
    try {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${ext}`)
      fd.append('model', 'whisper-large-v3-turbo')
      fd.append('language', 'es')
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: fd })
      if (r.ok) { const j = await r.json() as { text?: string }; if (j.text?.trim()) return j.text.trim() }
      else console.warn('[Media] Groq STT', r.status, (await r.text().catch(() => '')).slice(0, 120))
    } catch (e) { console.warn('[Media] Groq STT error', e instanceof Error ? e.message : e) }
  }
  // 2) OpenAI Whisper
  if (OPENAI) {
    try {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${ext}`)
      fd.append('model', 'whisper-1')
      fd.append('language', 'es')
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI}` }, body: fd })
      if (r.ok) { const j = await r.json() as { text?: string }; if (j.text?.trim()) return j.text.trim() }
    } catch (e) { console.warn('[Media] OpenAI STT error', e instanceof Error ? e.message : e) }
  }
  return null
}

// ─── Visión: describir imagen ───
export async function describeImage(buffer: Buffer, mimeType: string, caption?: string, keys?: MediaKeys): Promise<string | null> {
  const GROQ = groqKey(keys), OPENAI = openaiKey(keys)
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
  const prompt = `Eres el asistente de un negocio. Describe brevemente y en ESPAÑOL qué muestra esta imagen que envió un cliente (es relevante para una venta/atención). Si hay texto, números, un documento, una captura, un producto/auto o un comprobante, dilo. Sé concreto en 1-3 frases.${caption ? ` El cliente escribió: "${caption}".` : ''}`
  const tryOpenAICompat = async (url: string, key: string, model: string) => {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 400 }),
    })
    if (!r.ok) { console.warn('[Media] vision', model, r.status, (await r.text().catch(() => '')).slice(0, 120)); return null }
    const j = await r.json() as { choices?: { message?: { content?: string } }[] }
    return j.choices?.[0]?.message?.content?.trim() || null
  }
  // 0) MiniMax (key actual, ya verificado) — proveedor principal
  { const t = await minimaxVision(dataUrl, prompt); if (t) return t }
  // 1) Groq vision (tier gratis)
  if (GROQ) { try { const t = await tryOpenAICompat('https://api.groq.com/openai/v1/chat/completions', GROQ, 'llama-3.2-90b-vision-preview'); if (t) return t } catch { /* next */ } }
  // 2) OpenAI (GLM-4.5V/Z.AI RETIRADO 2026-07-22 — sin saldo, ya no se usa)
  if (OPENAI) { try { const t = await tryOpenAICompat('https://api.openai.com/v1/chat/completions', OPENAI, 'gpt-4o-mini'); if (t) return t } catch { /* next */ } }
  return null
}

// ─── Documentos: extraer texto LOCALMENTE (sin API) ───
export async function extractDocumentText(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  try {
    const name = (fileName || '').toLowerCase()
    if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import('pdf-parse')) as any).default || ((await import('pdf-parse')) as any)
      const data = await pdfParse(buffer)
      return (data?.text || '').trim().slice(0, 6000) || null
    }
    if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv') || /\.(xlsx?|csv)$/.test(name)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const parts: string[] = []
      for (const sn of wb.SheetNames.slice(0, 3)) parts.push(`Hoja ${sn}:\n${XLSX.utils.sheet_to_csv(wb.Sheets[sn])}`)
      return parts.join('\n\n').slice(0, 6000) || null
    }
    if (mimeType.startsWith('text/') || /\.(txt|md|json)$/.test(name)) {
      return buffer.toString('utf8').slice(0, 6000) || null
    }
  } catch (e) { console.warn('[Media] doc extract error', e instanceof Error ? e.message : e) }
  return null
}

// ─── Router: media → texto para el bot ───
// Devuelve un texto que representa el media (ya entendido) o null si no se pudo.
export async function understandMedia(buffer: Buffer, media: MediaInfo, keys?: MediaKeys): Promise<string | null> {
  if (media.type === 'audio') {
    const t = await transcribeAudio(buffer, media.mimeType, keys)
    return t ? `🎤 (Nota de voz transcrita del cliente): "${t}"` : null
  }
  if (media.type === 'image' || media.type === 'sticker') {
    const d = await describeImage(buffer, media.mimeType, media.caption, keys)
    if (!d) return null
    return `🖼️ (El cliente envió una imagen. Esto se ve en ella): ${d}${media.caption ? `\nTexto del cliente: "${media.caption}"` : ''}`
  }
  if (media.type === 'document') {
    const txt = await extractDocumentText(buffer, media.mimeType, media.fileName)
    if (!txt) return null
    return `📄 (El cliente envió el documento "${media.fileName}". Contenido):\n${txt}`
  }
  return null
}
