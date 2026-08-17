// ═══════════════════════════════════════════════════════════════
// Carga de fuentes para Satori / next-og (ImageResponse las necesita
// explícitas; no usa fuentes del sistema). Montserrat (woff) cacheado.
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'fs/promises'
import path from 'path'

export interface OgFont { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: 'normal' }

let cache: OgFont[] | null = null
const DIR = path.join(process.cwd(), 'src', 'lib', 'marketing', 'fonts')
const WEIGHTS: (400 | 600 | 700 | 800)[] = [400, 600, 700, 800]

const toAB = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** Devuelve las fuentes Montserrat (cacheadas) para pasar a ImageResponse. */
export async function loadFonts(): Promise<OgFont[]> {
  if (cache) return cache
  const fonts = await Promise.all(
    WEIGHTS.map(async (weight) => ({
      name: 'Montserrat',
      data: toAB(await readFile(path.join(DIR, `Montserrat-${weight}.ttf`))),
      weight,
      style: 'normal' as const,
    })),
  )
  cache = fonts
  return fonts
}
