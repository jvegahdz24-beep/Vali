// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Follow-Up Worker
// POST /api/followups/worker
// Cron-triggered worker that processes pending FollowUpTasks
// Auth: X-Worker-Key header
// Supports both persistent (whatsAppManager) and ephemeral connections
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'
import { generateFollowUpMessage } from '@/lib/ai/follow-up-engine'
import type { FollowUpTipo } from '@/lib/ai/follow-up-engine'
import { shouldStopFollowUps, cancelPendingFollowUps, markDisinterested } from '@/lib/ai/follow-up-guard'
import { nextAllowedSend } from '@/lib/ai/quiet-hours'
import { notifyFollowUpApproval } from '@/lib/telegram-events'

const WORKER_KEY = process.env.WORKER_KEY

function verifyWorkerKey(request: NextRequest): boolean {
  if (!WORKER_KEY) {
    // VULN-008: No fallback — require explicit env var in all environments
    if (process.env.NODE_ENV === 'production') {
      console.error('[Worker] WORKER_KEY env var is not set in production')
    }
    return false
  }
  return request.headers.get('x-worker-key') === WORKER_KEY
}

interface WorkerResult {
  success: boolean
  processed: number
  sent: number
  skipped: number
  errors: number
  errorDetails: Array<{ taskId: string; contactId: string; error: string }>
  timestamp: string
  durationMs: number
  recovered?: number
}

// ═══ RED DE SEGURIDAD: mensajes de clientes SIN RESPUESTA (2026-07-13) ═══
// Si un mensaje entrante se perdió (p.ej. llegó durante una reconexión de
// WhatsApp), la conversación queda con el ÚLTIMO mensaje del cliente y sin
// respuesta. Este barrido corre con el worker (cada 5 min): detecta esas
// conversaciones (3 min a 24 h de antigüedad), reprocesa el mensaje por el
// pipeline y entrega la respuesta — tarde, pero se entrega. Máx 6 por corrida
// y reintento cada 6 h por conversación para no ciclar.
async function recoverUnansweredInbound(): Promise<number> {
  let recovered = 0
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const cutoff = new Date(Date.now() - 3 * 60 * 1000)
    const convs = await db.conversation.findMany({
      where: { channel: 'whatsapp', status: 'active', lastMessageAt: { gte: since, lte: cutoff } },
      orderBy: { lastMessageAt: 'desc' },
      take: 40,
      select: { id: true, workspaceId: true, contactId: true, metadata: true },
    })
    for (const conv of convs) {
      if (recovered >= 6) break
      const last = await db.message.findFirst({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'desc' },
        select: { content: true, direction: true, senderType: true, createdAt: true },
      })
      if (!last || last.direction !== 'inbound' || last.senderType !== 'contact') continue
      if (last.createdAt > cutoff) continue

      let meta: Record<string, unknown> = {}
      try { meta = JSON.parse(conv.metadata || '{}') } catch { /* */ }
      const lastRec = meta.lastRecoveryAt ? new Date(String(meta.lastRecoveryAt)).getTime() : 0
      if (Date.now() - lastRec < 6 * 60 * 60 * 1000) continue

      const contact = conv.contactId ? await db.contact.findUnique({ where: { id: conv.contactId } }) : null
      if (!contact?.phone) continue
      // Respeta Manual/pausa: si la IA está apagada y la pausa NO venció, no tocamos.
      let cf: Record<string, unknown> = {}
      try { cf = JSON.parse(contact.customFields || '{}') } catch { /* */ }
      const pauseExpired = cf.aiPausedUntil ? new Date(String(cf.aiPausedUntil)).getTime() <= Date.now() : false
      if ((cf.aiDisabled === true || meta.aiDisabled === true) && !pauseExpired) continue

      // Marca ANTES de intentar (si el pipeline truena, no ciclamos cada 5 min)
      meta.lastRecoveryAt = new Date().toISOString()
      await db.conversation.update({ where: { id: conv.id }, data: { metadata: JSON.stringify(meta) } }).catch(() => {})

      const { processMessageCore } = await import('@/lib/ai/message-processor')
      const res = await processMessageCore({
        text: last.content,
        phone: contact.phone,
        workspaceId: conv.workspaceId,
        conversationId: conv.id,
        channel: 'whatsapp',
        skipMessageSave: true, // el mensaje del cliente YA está guardado
      }).catch(() => null)

      if (res?.aiReplyText) {
        const { routedSendText } = await import('@/lib/whatsapp/channel-router')
        const sent = await routedSendText(conv.workspaceId, contact.phone, res.aiReplyText).catch(() => ({ success: false }))
        if ((sent as { success?: boolean }).success) {
          recovered++
          console.log(`[Recovery] 📬 Respuesta tardía entregada a ${contact.phone} (mensaje sin responder detectado)`)
        }
      }
    }
  } catch (e) {
    console.warn('[Recovery] error (no crítico):', e instanceof Error ? e.message : e)
  }
  return recovered
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  if (!verifyWorkerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_WORKER_KEY' }, { status: 401 })
  }

  const result: WorkerResult = {
    success: true, processed: 0, sent: 0, skipped: 0, errors: 0,
    errorDetails: [], timestamp: new Date().toISOString(), durationMs: 0,
  }

  try {
    const now = new Date()
    console.log(`[FollowUp Worker] Starting at ${now.toISOString()}`)

    // Red de seguridad: responde mensajes de clientes que quedaron sin contestar
    // (corre SIEMPRE, haya o no follow-ups pendientes).
    result.recovered = await recoverUnansweredInbound()
    if (result.recovered > 0) console.log(`[FollowUp Worker] ${result.recovered} conversación(es) recuperada(s) sin respuesta`)

    // Torre de control: alerta si el WhatsApp de algún tenant está caído.
    const { alertDisconnectedTenants } = await import('@/lib/ops/health-alert')
    await alertDisconnectedTenants()

    // Cache por workspace del modo "aprobar por Telegram"
    const approvalCache = new Map<string, boolean>()

    // Cache de settings por workspace (para el gate de horario nocturno)
    const settingsCache = new Map<string, Record<string, unknown>>()
    const getWsSettings = async (id: string): Promise<Record<string, unknown>> => {
      if (!settingsCache.has(id)) {
        let s: Record<string, unknown> = {}
        try { const r = await db.workspace.findUnique({ where: { id }, select: { settings: true } }); s = JSON.parse(r?.settings || '{}') } catch { /* */ }
        settingsCache.set(id, s)
      }
      return settingsCache.get(id)!
    }

    const pendingTasks = await db.followUpTask.findMany({
      where: { status: 'pending', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
    })

    console.log(`[FollowUp Worker] Found ${pendingTasks.length} pending tasks`)

    if (pendingTasks.length === 0) {
      result.durationMs = Date.now() - startTime
      return NextResponse.json(result)
    }

    result.processed = pendingTasks.length

    for (const task of pendingTasks) {
      try {
        const contact = await db.contact.findUnique({
          where: { id: task.contactId },
          select: { id: true, firstName: true, lastName: true, phone: true, status: true, customFields: true },
        })

        if (!contact) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'Contact not found' } })
          result.skipped++
          continue
        }

        if (!contact.phone) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'No phone' } })
          result.skipped++
          continue
        }

        // ── HORARIO NOCTURNO (gate único de TODA la escalera) ──
        // Si el envío cae en la ventana de silencio del negocio (default
        // 21:00–08:00 en su zona horaria), se reprograma para la mañana
        // siguiente con un jitter de hasta 1h (no todos a las 8:00:00 clavadas,
        // que se ve robótico y golpea WhatsApp en ráfaga). Cierra el hueco que
        // el motor no tenía: antes enviaba a cualquier hora que corriera el cron.
        {
          const wsS = await getWsSettings(task.workspaceId)
          const allowed = nextAllowedSend(now, wsS)
          if (allowed.getTime() > now.getTime()) {
            const jitterMs = Math.floor(Math.random() * 60 * 60 * 1000)
            await db.followUpTask.update({ where: { id: task.id }, data: { scheduledAt: new Date(allowed.getTime() + jitterMs) } })
            result.skipped++
            continue
          }
        }

        // Difusión manual: el usuario eligió explícitamente a quién y qué enviar
        // → NO aplican el cooldown 24h ni el freno anti-spam (solo el espaciado).
        const isManualBroadcast = task.ruleId === 'manual-broadcast'

        // Check cooldown (24h)
        const cooldownCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const recentSent = isManualBroadcast ? 0 : await db.followUpTask.count({
          where: { contactId: task.contactId, status: 'sent', sentAt: { gte: cooldownCutoff } },
        })
        if (recentSent > 0) {
          await db.followUpTask.update({ where: { id: task.id }, data: { scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } })
          result.skipped++
          continue
        }

        // ── FRENO ANTI-SPAM + COLA LARGA (política Jhon 2026-07-15) ──
        // Ráfaga (pasos 0-7): al topar N sin respuesta → desinteresado + TRANSICIÓN
        // a cola larga (1 contacto/mes hasta el año). Cola larga (longTail): exenta
        // del freno; solo la paran las condiciones DURAS (hardStopFollowUps).
        // Postventa (ruleId 'post-sale'): dirigida a quien YA COMPRÓ → exenta
        // del freno anti-spam y del paro "ya es cliente"; sí respeta IA
        // apagada / pausa / noqualify (hardStopFollowUps con postSale:true).
        const isPostSale = task.ruleId === 'post-sale'

        if (!isManualBroadcast) {
          let tmGuard: { step?: number; longTail?: boolean; reactivation?: boolean } = {}
          try { tmGuard = JSON.parse(task.metadata || '{}') } catch { /* */ }
          const { hardStopFollowUps, scheduleLongTailEntry } = await import('@/lib/ai/follow-up-engine')
          const hard = await hardStopFollowUps(task.contactId, { postSale: isPostSale })
          if (hard.stop) {
            await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: `paro duro: ${hard.reason}` } })
            await cancelPendingFollowUps(task.contactId)
            console.log(`[FollowUp Worker] PARO DURO (${hard.reason}): contacto ${task.contactId}`)
            result.skipped++
            continue
          }
          // El OPENER de una reactivación de cartera (reactivation:true, disparada
          // a mano por el gerente) se salta el freno "N sin respuesta" — es una
          // decisión deliberada de re-tocar la cartera. Del paso 1 en adelante el
          // freno vuelve (los pasos siguientes ya no llevan la marca).
          if (!isPostSale && !tmGuard.longTail && !tmGuard.reactivation && await shouldStopFollowUps(task.contactId, task.workspaceId)) {
            await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'sin respuesta: tope de follow-ups alcanzado → cola larga' } })
            await cancelPendingFollowUps(task.contactId)
            await markDisinterested(task.contactId, task.workspaceId)
            const lt = await scheduleLongTailEntry(task.contactId, task.workspaceId, task.conversationId, typeof tmGuard.step === 'number' ? tmGuard.step : -1)
            console.log(`[FollowUp Worker] Ráfaga topada → desinteresado + cola larga ${lt?.success ? `(paso ${lt.step})` : '(no aplicó)'}: contacto ${task.contactId}`)
            result.skipped++
            continue
          }
        }

        // Get message template
        let messageTemplate = ''
        if (isManualBroadcast) {
          // Difusión manual: el mensaje viene tal cual en metadata.message
          try { messageTemplate = (JSON.parse(task.metadata || '{}') as { message?: string }).message || '' } catch { /* */ }
          if (!messageTemplate) {
            await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'Difusión sin mensaje' } })
            result.skipped++
            continue
          }
        } else if (task.ruleId === 'dib-reactivation') {
          // Usa el mensaje ya guardado en metadata al crear la tarea. NO vuelve
          // a llamar findAndReactivate (eso re-escaneaba y RE-CREABA tareas → spiral).
          try {
            const meta = JSON.parse(task.metadata || '{}') as { message?: string }
            messageTemplate = meta.message || ''
          } catch { /* fallback */ }
          // Fallback (tareas viejas sin metadata): dry-run para derivar el mensaje SIN crear tareas.
          if (!messageTemplate) {
            try {
              const results = await reactivationEngine.findAndReactivate(task.workspaceId, { dryRun: true })
              messageTemplate = results.find(r => r.contactId === task.contactId)?.message || ''
            } catch { /* fallback */ }
          }
        } else {
          const rule = await db.followUpRule.findUnique({ where: { id: task.ruleId }, select: { messageTemplate: true } })
          const rawTemplate = rule?.messageTemplate || ''

          // ── AI-generated follow-up: task metadata contains {tipo, step} ──
          if (!rawTemplate) {
            let taskMeta: { tipo?: string; step?: number } = {}
            try { taskMeta = JSON.parse(task.metadata || '{}') } catch { /* ignore */ }

            if (taskMeta.tipo) {
              // Mark as processing to prevent double-execution
              await db.followUpTask.update({ where: { id: task.id }, data: { status: 'processing' } })
              try {
                const workspace = await db.workspace.findUnique({
                  where: { id: task.workspaceId },
                  select: { settings: true, name: true },
                })
                const wsSettings = typeof workspace?.settings === 'string'
                  ? JSON.parse(workspace?.settings || '{}')
                  : (workspace?.settings || {})

                messageTemplate = await generateFollowUpMessage(
                  task.contactId,
                  task.conversationId,
                  taskMeta.tipo as FollowUpTipo,
                  wsSettings,
                )
              } catch (aiErr) {
                const aiErrMsg = aiErr instanceof Error ? aiErr.message : String(aiErr)
                console.error(`[FollowUp Worker] AI generation failed for task ${task.id}: ${aiErrMsg}`)
                // Reset to pending so next run retries
                await db.followUpTask.update({ where: { id: task.id }, data: { status: 'pending', retryCount: { increment: 1 } } })
                result.errors++
                result.errorDetails.push({ taskId: task.id, contactId: task.contactId, error: `AI gen failed: ${aiErrMsg}` })
                continue
              }
            }
          } else {
            messageTemplate = rawTemplate
          }
        }

        const personalizedMessage = messageTemplate
          .replace(/\{\{name\}\}/g, contact.firstName)
          .replace(/\{\{firstName\}\}/g, contact.firstName)
          .replace(/\{\{lastName\}\}/g, contact.lastName || '')

        if (!personalizedMessage) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'Empty template and no AI fallback' } })
          result.skipped++
          continue
        }

        // ANTI-REPETICIÓN: nunca enviar el mismo texto dos veces al mismo cliente.
        const dupMsg = await db.message.findFirst({
          where: { conversationId: task.conversationId, direction: 'outbound', content: personalizedMessage },
          select: { id: true },
        })
        if (dupMsg) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'mensaje idéntico ya enviado antes' } })
          result.skipped++
          continue
        }

        // MODO APROBACIÓN POR TELEGRAM (settings.followUpApproval === 'telegram'):
        // no enviar directo — dejar el borrador esperando OK del equipo.
        if (!approvalCache.has(task.workspaceId)) {
          try {
            const wsRow = await db.workspace.findUnique({ where: { id: task.workspaceId }, select: { settings: true } })
            approvalCache.set(task.workspaceId, JSON.parse(wsRow?.settings || '{}').followUpApproval === 'telegram')
          } catch { approvalCache.set(task.workspaceId, false) }
        }
        if (!isManualBroadcast && approvalCache.get(task.workspaceId)) {
          let tm: Record<string, unknown> = {}
          try { tm = JSON.parse(task.metadata || '{}') } catch { /* ignore */ }
          await db.followUpTask.update({
            where: { id: task.id },
            data: { status: 'awaiting_approval', metadata: JSON.stringify({ ...tm, draft: personalizedMessage, approvalRequestedAt: new Date().toISOString() }) },
          })
          await notifyFollowUpApproval(task.workspaceId, { taskId: task.id, contactName: contact.firstName, phone: contact.phone, draft: personalizedMessage })
          result.skipped++
          continue
        }

        // Envío MULTICANAL: WhatsApp o Telegram según el canal preferido del
        // lead (contrato §2b). sendToLead resuelve el canal y usa el manager de
        // WhatsApp (persistente→efímero) o el Bot API de Telegram.
        const { sendToLead } = await import('@/lib/marketing/lead-channel')
        const sent = await sendToLead(task.workspaceId, contact, personalizedMessage)
        const sendResult: { success: boolean; id?: string; error?: string } = { success: sent.success, id: sent.id, error: sent.error }
        const sendSource = sent.channel || 'none'

        if (!sendResult.success) {
          await db.followUpTask.update({ where: { id: task.id }, data: { error: sent.error || 'Canal no conectado', retryCount: { increment: 1 } } })
          result.skipped++
          continue
        }

        // Mark as sent
        await db.followUpTask.update({ where: { id: task.id }, data: { status: 'sent', sentAt: new Date() } })

        await db.message.create({
          data: {
            conversationId: task.conversationId,
            content: personalizedMessage,
            type: 'text',
            direction: 'outbound',
            senderType: 'agent',
            senderId: task.ruleId === 'dib-reactivation' ? 'dib-reactivation' : 'followup-worker',
            isAiGenerated: task.ruleId === 'dib-reactivation',
            status: 'sent',
            externalId: sendResult.id,
            metadata: JSON.stringify({ source: 'followup-worker', taskId: task.id, ruleId: task.ruleId, sendSource, automated: true }),
          },
        })

        await db.conversation.update({
          where: { id: task.conversationId },
          data: { lastMessageAt: new Date(), lastMessagePreview: personalizedMessage.slice(0, 100) },
        })
        await db.contact.update({ where: { id: task.contactId }, data: { lastMessageAt: new Date() } })

        if (task.ruleId === 'dib-reactivation') {
          await db.leadProfile.updateMany({
            where: { contactId: task.contactId, workspaceId: task.workspaceId },
            data: { reactivateCount: { increment: 1 }, lastReactivateAt: new Date(), reactivationCycle: { increment: 1 } },
          })
        }

        // ── MOTOR INTELIGENTE: la escalera psicológica AVANZA sola — al enviar
        // el paso N se agenda el N+1 (antes nadie lo hacía y el timeline moría
        // en el paso 0). El freno anti-spam sigue mandando: si el lead no
        // responde, shouldStopFollowUps corta la cadena al llegar al tope y el
        // paso agendado se cancela sin enviarse. Una respuesta reinicia a 0.
        if (!isManualBroadcast && task.ruleId !== 'dib-reactivation') {
          try {
            const tm = JSON.parse(task.metadata || '{}') as { step?: number; tipo?: string }
            if (typeof tm.step === 'number' && tm.tipo) {
              const { scheduleNextFollowUp } = await import('@/lib/ai/follow-up-engine')
              await scheduleNextFollowUp(task.contactId, task.workspaceId, task.conversationId, tm.step + 1)
            }
          } catch { /* el avance de escalera nunca rompe el envío */ }
        }

        console.log(`[FollowUp Worker] Task ${task.id}: SENT via ${sendSource} to ${contact.firstName}`)
        result.sent++

      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : String(taskError)
        console.error(`[FollowUp Worker] Task ${task.id}: EXCEPTION — ${errorMsg}`)
        await db.followUpTask.update({ where: { id: task.id }, data: { error: errorMsg, retryCount: { increment: 1 } } }).catch(() => {})
        result.errors++
        result.errorDetails.push({ taskId: task.id, contactId: task.contactId, error: errorMsg })
      }
    }

    result.durationMs = Date.now() - startTime
    console.log(`[FollowUp Worker] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors (${result.durationMs}ms)`)
    return NextResponse.json(result)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[FollowUp Worker] Fatal error:', error)
    return NextResponse.json({
      success: false, processed: 0, sent: 0, skipped: 0, errors: 1,
      errorDetails: [{ taskId: 'system', contactId: 'system', error: errorMsg }],
      timestamp: new Date().toISOString(), durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_WORKER_KEY' }, { status: 401 })
  }

  try {
    const [pending, sent, failed, skipped] = await Promise.all([
      db.followUpTask.count({ where: { status: 'pending' } }),
      db.followUpTask.count({ where: { status: 'sent' } }),
      db.followUpTask.count({ where: { status: 'failed' } }),
      db.followUpTask.count({ where: { status: 'cancelled' } }),
    ])
    const nextTask = await db.followUpTask.findFirst({ where: { status: 'pending' }, orderBy: { scheduledAt: 'asc' }, select: { scheduledAt: true } })

    // Aggregate connection state across all workspace managers
    const { whatsAppRegistry } = await import('@/lib/whatsapp/connection')
    const anyConnected = whatsAppRegistry.all().some((m) => m.isConnected()) || !!ephemeralManager.getConnected()

    return NextResponse.json({
      status: 'ok',
      queue: { pending, sent, failed, cancelled: skipped },
      total: pending + sent + failed + skipped,
      nextScheduledAt: nextTask?.scheduledAt || null,
      whatsappConnected: anyConnected,
      ephemeralSessions: ephemeralManager.list().length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 })
  }
}
