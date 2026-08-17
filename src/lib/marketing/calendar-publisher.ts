// ═══════════════════════════════════════════════════════════════
// Publicador del CALENDARIO (contrato A.2.7 §Pantalla 3).
// Corre en el cron (cada 5 min): busca ContentCalendarEntry APROBADAS cuya hora
// ya llegó (scheduledAt <= ahora) y las publica al canal indicado, dejando el
// estado en "published" o "failed". Antes el calendario era un tablero muerto:
// aprobar dejaba la entrada en "approved" para siempre, nada la publicaba.
//
// Canales de TEXTO (lo que produce el calendario): Telegram y Facebook.
// Instagram/TikTok requieren medios → se agendan desde el Estudio de Diseños/
// Video (modelo ScheduledPost); aquí se marcan "failed" con nota clara.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { readMetaCreds, canPublishFacebook, fbPublishText, type MetaCreds } from '@/lib/marketing/meta'
import { telegramPublishToChannel } from '@/lib/telegram'

export async function publishDueCalendarEntries(workspaceId: string): Promise<{ published: number; failed: number }> {
  const due = await db.contentCalendarEntry.findMany({
    where: { workspaceId, status: 'approved', scheduledAt: { lte: new Date() } },
    include: { content: { select: { content: true, title: true } } },
    orderBy: { scheduledAt: 'asc' },
    take: 15,
  })
  if (!due.length) return { published: 0, failed: 0 }

  let published = 0, failed = 0
  let creds: MetaCreds | null = null

  for (const e of due) {
    const text = (e.content?.content || e.notes || e.title || '').trim()
    const ch = (e.channel || '').toLowerCase()
    let ok = false
    let err = ''
    try {
      if (!text) {
        err = 'sin texto a publicar'
      } else if (ch === 'telegram') {
        const r = await telegramPublishToChannel(workspaceId, { text })
        ok = r.ok; err = r.error || ''
      } else if (ch === 'facebook') {
        if (!creds) {
          const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
          creds = readMetaCreds(ws?.settings)
        }
        if (!canPublishFacebook(creds)) err = 'Facebook no está conectado'
        else { const r = await fbPublishText(creds, text); ok = !!r.postId }
      } else {
        err = `${ch || 'canal'}: requiere imagen o video — agéndalo desde el Estudio de Diseños/Video`
      }
    } catch (e2) {
      err = e2 instanceof Error ? e2.message : 'error al publicar'
    }

    await db.contentCalendarEntry.update({
      where: { id: e.id },
      data: {
        status: ok ? 'published' : 'failed',
        notes: ok ? e.notes : `${e.notes ? e.notes + ' · ' : ''}[error] ${err}`.slice(0, 1000),
      },
    }).catch(() => {})

    if (ok) { published++; console.log(`[CalendarPub] published entry=${e.id} ch=${ch}`) }
    else { failed++; console.warn(`[CalendarPub] failed entry=${e.id} ch=${ch}: ${err}`) }
  }

  return { published, failed }
}
