// ═══════════════════════════════════════════════════════════════
// Procesa las publicaciones AGENDADAS que ya vencieron (lo llama el cron).
// Genera el video si aplica y publica vía publishCar; actualiza estado.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { publishCar } from './publish'
import { buildCarReel, type ReelOpts } from './video'

const J = (s: string, d: unknown) => { try { return JSON.parse(s) } catch { return d } }

export async function processDueScheduled(base: string): Promise<{ processed: number; results: { id: string; status: string }[] }> {
  const due = await db.scheduledPost.findMany({ where: { status: 'pending', scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 20 })
  const out: { id: string; status: string }[] = []
  for (const sp of due) {
    try {
      const networks: string[] = J(sp.networks, [])
      const formats: string[] = J(sp.formats, [])
      const templates: Record<string, string> = J(sp.templates, {})
      let videoUrl: string | undefined
      const fmts = [...formats]
      if (sp.withVideo) {
        const cfg = J(sp.videoConfig || '{}', {}) as Partial<ReelOpts>
        const v = await buildCarReel({ ...cfg, workspaceId: sp.workspaceId, carId: sp.carId, base } as ReelOpts)
        videoUrl = `${base.replace(/\/$/, '')}${v.url}`
        if (!fmts.includes('reel')) fmts.push('reel')
      }
      const { results, published } = await publishCar({ workspaceId: sp.workspaceId, carId: sp.carId, networks, formats: fmts, templates, caption: sp.caption || undefined, videoUrl, source: 'scheduled', base })
      await db.scheduledPost.update({ where: { id: sp.id }, data: { status: published > 0 ? 'done' : 'error', result: JSON.stringify(results).slice(0, 4000) } })
      out.push({ id: sp.id, status: published > 0 ? 'done' : 'error' })
    } catch (e) {
      await db.scheduledPost.update({ where: { id: sp.id }, data: { status: 'error', result: (e instanceof Error ? e.message : 'error').slice(0, 1000) } })
      out.push({ id: sp.id, status: 'error' })
    }
  }
  return { processed: due.length, results: out }
}
