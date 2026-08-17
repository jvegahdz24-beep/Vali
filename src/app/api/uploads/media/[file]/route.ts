// Sirve archivos subidos (fotos de inventario, media de chat) desde
// public/uploads. Next no sirve /public en runtime → esta ruta dinámica sí.
// El rewrite /uploads/:file* → /api/uploads/media/:file* la usa (fix 2026-07-24).
// PÚBLICA a propósito (la consumen <img>/<video> y Meta al publicar).
import { NextRequest } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const CT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', heic: 'image/heic',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime', webm: 'video/webm',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  pdf: 'application/pdf',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const safe = path.basename(String(file || ''))
  const ext = (safe.split('.').pop() || '').toLowerCase()
  if (!CT[ext]) return new Response('No encontrado', { status: 404 })
  const full = path.join(process.cwd(), 'public', 'uploads', safe)
  const info = await stat(full).catch(() => null)
  if (!info) return new Response('No encontrado', { status: 404 })
  const buf = await readFile(full)
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': CT[ext], 'Content-Length': String(info.size), 'Cache-Control': 'public, max-age=3600' },
  })
}
