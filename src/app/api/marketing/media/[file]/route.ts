// GET /api/marketing/media/<file>.mp4 — sirve videos generados (reels).
// PÚBLICA (Meta y <video> la consumen). Next no sirve archivos creados en
// /public tras el arranque, por eso van por ruta dinámica.

import { NextRequest } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const CT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const safe = path.basename(file)
  const ext = (safe.split('.').pop() || '').toLowerCase()
  if (!CT[ext]) return new Response('No encontrado', { status: 404 })
  // videos e imágenes IA (F6) viven en la misma carpeta generada
  const full = path.join(process.cwd(), 'public', 'marketing', 'videos', safe)
  const info = await stat(full).catch(() => null)
  if (!info) return new Response('No encontrado', { status: 404 })
  const buf = await readFile(full)
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': CT[ext], 'Content-Length': String(info.size), 'Cache-Control': 'public, max-age=3600' },
  })
}
