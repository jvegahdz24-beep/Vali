// ═══════════════════════════════════════════════════════════════
// GENERACIÓN DE IMÁGENES CON IA (F6, 2026-07-22) — MiniMax image-01.
// Crea fotos publicitarias profesionales del auto a partir de un prompt (y,
// opcionalmente, la foto real del auto como referencia). La URL que devuelve
// MiniMax es temporal (OSS) → se descarga y persiste en public/marketing/videos
// (misma carpeta que sirve /api/marketing/media). Todo MiniMax, sin apps externas.
// ═══════════════════════════════════════════════════════════════

import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const MM_KEY = () => process.env.MINIMAX_API_KEY || ''
const MM_URL = 'https://api.minimax.io/v1/image_generation'

export interface AiImageResult { url: string; file: string }

/** Llama a MiniMax image-01 y devuelve las URLs (temporales) generadas. */
async function callMiniMaxImage(prompt: string, opts?: { aspectRatio?: string; n?: number; referenceImageUrl?: string }): Promise<string[]> {
  const key = MM_KEY()
  if (!key) throw new Error('MINIMAX_API_KEY no configurada')
  const body: Record<string, unknown> = {
    model: 'image-01',
    prompt: prompt.slice(0, 1500),
    aspect_ratio: opts?.aspectRatio || '1:1',
    n: Math.min(4, Math.max(1, opts?.n || 1)),
    prompt_optimizer: true,
  }
  // Referencia del auto real (si MiniMax la acepta; si falla, se reintenta sin ella).
  if (opts?.referenceImageUrl) body.subject_reference = [{ type: 'character', image_file: opts.referenceImageUrl }]
  const doCall = async (b: Record<string, unknown>) => {
    const r = await fetch(MM_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    const d = await r.json().catch(() => ({})) as { data?: { image_urls?: string[] }; base_resp?: { status_code?: number; status_msg?: string } }
    if (d?.base_resp?.status_code && d.base_resp.status_code !== 0) throw new Error(d.base_resp.status_msg || 'MiniMax image error')
    return d?.data?.image_urls || []
  }
  try {
    return await doCall(body)
  } catch (e) {
    // Si la referencia falló, reintenta como texto-a-imagen puro.
    if (body.subject_reference) { delete body.subject_reference; return await doCall(body) }
    throw e
  }
}

/** Descarga una URL de imagen y la guarda en la carpeta pública de medios. */
async function persist(url: string, workspaceId: string): Promise<AiImageResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No pude descargar la imagen generada (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const dir = path.join(process.cwd(), 'public', 'marketing', 'videos')
  await mkdir(dir, { recursive: true })
  const name = `ai-${workspaceId.slice(0, 6)}-${Date.now()}-${Math.floor(Math.random() * 1e4)}.jpg`
  await writeFile(path.join(dir, name), buf)
  return { url: `/api/marketing/media/${name}`, file: name }
}

/** Genera N imágenes con MiniMax y las persiste localmente. */
export async function generateAiImages(prompt: string, workspaceId: string, opts?: { aspectRatio?: string; n?: number; referenceImageUrl?: string }): Promise<AiImageResult[]> {
  const urls = await callMiniMaxImage(prompt, opts)
  if (!urls.length) throw new Error('MiniMax no devolvió imágenes')
  const out: AiImageResult[] = []
  for (const u of urls) { try { out.push(await persist(u, workspaceId)) } catch { /* omite la que falle */ } }
  if (!out.length) throw new Error('No se pudo guardar ninguna imagen generada')
  return out
}

/** Prompt publicitario a partir de los datos reales del auto. */
export function buildCarImagePrompt(car: { name: string; brand?: string | null; year?: number | null; type?: string | null; color?: string | null }, style?: string): string {
  const desc = [car.year, car.brand, car.name].filter(Boolean).join(' ')
  const styleMap: Record<string, string> = {
    showroom: 'in a luxury car showroom with dramatic cinematic lighting, glossy floor reflections',
    calle: 'on a modern city street at golden hour, urban lifestyle, dynamic angle',
    lujo: 'in an elegant premium setting, spotlight, dark luxurious background, studio quality',
    aventura: 'on a scenic mountain road, adventurous outdoor setting, natural light',
  }
  const scene = styleMap[style || ''] || styleMap.showroom
  return `Professional automotive advertising photograph of a ${desc} car ${scene}. High-end commercial photography, ultra realistic, 8k, sharp focus, no text, no watermark.`
}
