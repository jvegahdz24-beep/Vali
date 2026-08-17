// ═══════════════════════════════════════════════════════════════
// Biblioteca de música para videos. Pistas royalty-free integradas +
// las que suba el usuario (todas en public/marketing/music/*.mp3).
// ═══════════════════════════════════════════════════════════════

import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DIR = path.join(process.cwd(), 'public', 'marketing', 'music')

const LABELS: Record<string, string> = {
  'energica.mp3': 'Enérgica', 'lujo.mp3': 'Lujo / Premium', 'urbana.mp3': 'Urbana',
  'corporativa.mp3': 'Corporativa', 'epica.mp3': 'Épica', 'alegre.mp3': 'Alegre',
}

export interface Track { file: string; label: string; url: string; builtin: boolean }

export async function listMusic(): Promise<Track[]> {
  if (!existsSync(DIR)) return []
  try {
    const files = (await readdir(DIR)).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f))
    return files.map((f) => ({
      file: f,
      label: LABELS[f] || f.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      url: `/marketing/music/${f}`,
      builtin: !!LABELS[f],
    })).sort((a, b) => (a.builtin === b.builtin ? a.label.localeCompare(b.label) : a.builtin ? -1 : 1))
  } catch { return [] }
}

/** Ruta absoluta de una pista por nombre de archivo (validada dentro del dir). */
export function musicPath(file?: string | null): string | null {
  if (!file) return null
  const safe = path.basename(file)
  const p = path.join(DIR, safe)
  return existsSync(p) ? p : null
}
