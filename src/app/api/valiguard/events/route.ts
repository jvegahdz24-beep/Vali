// ═══════════════════════════════════════════════════════════════
// ValiGuard — Feed de eventos/auditoría en tiempo real (DATOS REALES).
// GET /api/valiguard/events?workspaceId=
// Unifica EngineEvent + ContactTimelineEvent + AutomationLog + ConsentLog
// en un solo feed de actividad con actor, módulo, riesgo y detalles.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

type Risk = 'alto' | 'medio' | 'bajo' | 'info'
type Actor = 'IA' | 'Sistema' | 'Automatización' | 'Usuario'

interface UnifiedEvent {
  id: string
  source: 'engine' | 'timeline' | 'automation' | 'audit'
  createdAt: string
  actor: Actor
  actorName: string
  event: string        // etiqueta legible
  eventKey: string     // clave para icono
  subType?: string
  module: string
  details: string
  contactId?: string
  contactName?: string
  risk: Risk
  metadata: Record<string, unknown>
  ip?: string
  device?: string
  location?: string
}

// ── Mapa de tipos EngineEvent → etiqueta/módulo/riesgo/actor ──
const ENGINE_MAP: Record<string, { label: string; module: string; risk: Risk; actor: Actor; key: string }> = {
  ACTION_EXECUTED:            { label: 'Acción ejecutada por IA',      module: 'Motor IA',          risk: 'bajo',  actor: 'IA',            key: 'play' },
  ACTION_RECOMMENDED:         { label: 'Acción recomendada',           module: 'Motor IA',          risk: 'info',  actor: 'IA',            key: 'sparkles' },
  ACTION_OUTCOME:             { label: 'Resultado de acción',          module: 'Motor IA',          risk: 'bajo',  actor: 'IA',            key: 'target' },
  SCORE_UPDATED:              { label: 'Score de lead actualizado',    module: 'Inteligencia',      risk: 'info',  actor: 'IA',            key: 'trending' },
  AUTO_ACTION_TRIGGERED:      { label: 'Automatización disparada',     module: 'Automatizaciones',  risk: 'bajo',  actor: 'Automatización', key: 'zap' },
  HOT_LEAD_THRESHOLD_CROSSED: { label: 'Lead caliente detectado',      module: 'Ventas (Pipeline)', risk: 'medio', actor: 'IA',            key: 'flame' },
  HOT_LEAD_NOTIFIED:          { label: 'Notificación de lead caliente',module: 'Ventas (Pipeline)', risk: 'medio', actor: 'Sistema',       key: 'bell' },
  STALE_LEAD_7D_NOTIFIED:     { label: 'Lead estancado (7 días)',      module: 'Ventas (Pipeline)', risk: 'alto',  actor: 'Sistema',       key: 'alert' },
  APPOINTMENT_REMINDER_SENT:  { label: 'Recordatorio de cita enviado', module: 'Calendario Auto',   risk: 'info',  actor: 'Sistema',       key: 'calendar' },
  ATTENDANCE_CHECK_SENT:      { label: 'Verificación de asistencia',   module: 'Calendario Auto',   risk: 'info',  actor: 'Sistema',       key: 'calendar' },
  MISSED_APPT_PROCESSED:      { label: 'Cita perdida procesada',       module: 'Calendario Auto',   risk: 'medio', actor: 'Sistema',       key: 'calendar-x' },
}

const TIMELINE_MAP: Record<string, { label: string; module: string; risk: Risk; key: string }> = {
  intention:  { label: 'Intención de compra detectada', module: 'Conversaciones', risk: 'info',  key: 'target' },
  interest:   { label: 'Interés detectado',             module: 'Conversaciones', risk: 'info',  key: 'sparkles' },
  objection:  { label: 'Objeción detectada',            module: 'Conversaciones', risk: 'medio', key: 'alert' },
  budget:     { label: 'Presupuesto identificado',      module: 'Conversaciones', risk: 'info',  key: 'trending' },
  archetype:  { label: 'Arquetipo identificado',        module: 'Inteligencia',   risk: 'info',  key: 'user' },
  painpoint:  { label: 'Dolor/necesidad identificado',  module: 'Conversaciones', risk: 'info',  key: 'target' },
  ai_summary: { label: 'Resumen de conversación (IA)',  module: 'Inteligencia',   risk: 'bajo',  key: 'file' },
  appointment:{ label: 'Cita registrada',               module: 'Calendario Auto',risk: 'bajo',  key: 'calendar' },
  document:   { label: 'Documento recibido',            module: 'Conversaciones', risk: 'bajo',  key: 'file' },
  consent:    { label: 'Consentimiento registrado',     module: 'ValiGuard',      risk: 'bajo',  key: 'shield' },
  deal:       { label: 'Cambio en oportunidad',         module: 'Ventas (Pipeline)', risk: 'bajo', key: 'briefcase' },
  milestone:  { label: 'Hito alcanzado',                module: 'Inteligencia',   risk: 'bajo',  key: 'target' },
  note:       { label: 'Nota agregada',                 module: 'Conversaciones', risk: 'info',  key: 'file' },
}

const AUDIT_MAP: Record<string, { label: string; module: string; risk: Risk; key: string }> = {
  view_contact:      { label: 'Visualización de contacto', module: 'Contactos',     risk: 'bajo',  key: 'eye' },
  view_conversation: { label: 'Visualización de conversación', module: 'Conversaciones', risk: 'bajo', key: 'eye' },
  export_csv:        { label: 'Exportación de datos',      module: 'Analíticas Live', risk: 'medio', key: 'download' },
  assign_agent:      { label: 'Asignación de agente',      module: 'Equipo (Roles)', risk: 'bajo',  key: 'user' },
  delete_contact:    { label: 'Eliminación de contacto',   module: 'Contactos',     risk: 'alto',  key: 'trash' },
  bulk_action:       { label: 'Acción masiva',             module: 'Contactos',     risk: 'medio', key: 'layers' },
  login:             { label: 'Inicio de sesión',          module: 'Accesos',       risk: 'bajo',  key: 'login' },
  login_failed:      { label: 'Intento fallido de inicio de sesión', module: 'Accesos', risk: 'alto', key: 'shield-alert' },
  permission_change: { label: 'Cambio de permisos',        module: 'Equipo (Roles)',risk: 'alto',  key: 'user-cog' },
}

function truncate(s: string, n = 120): string { return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '') }

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const now = Date.now()
    const dayAgo = new Date(now - 86400000)
    const twoDayAgo = new Date(now - 2 * 86400000)
    const weekAgo = new Date(now - 7 * 86400000)

    // Traer lo reciente de cada fuente (cap por fuente para el feed)
    const [engine, timeline, autoLogs, auditLogs, members, sessionRows] = await Promise.all([
      db.engineEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 250 }),
      db.contactTimelineEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 150 }),
      db.automationLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 120 }),
      db.consentLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 120 }),
      db.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, role: true, user: { select: { name: true, email: true } } } }),
      db.accessSession.findMany({ where: { workspaceId }, orderBy: { lastSeenAt: 'desc' }, take: 60 }),
    ])

    // Nombres de contacto para los eventos con contactId
    const contactIds = Array.from(new Set([
      ...engine.map((e) => e.contactId),
      ...timeline.map((t) => t.contactId),
      ...autoLogs.map((a) => a.contactId).filter(Boolean) as string[],
    ].filter(Boolean)))
    const contacts = contactIds.length
      ? await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const nameOf = new Map(contacts.map((c) => [c.id, `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contacto']))
    const userName = new Map(members.map((m) => [m.userId, m.user?.name || m.user?.email || 'Usuario']))

    const events: UnifiedEvent[] = []

    for (const e of engine) {
      const m = ENGINE_MAP[e.type] || { label: e.type, module: 'Motor IA', risk: 'info' as Risk, actor: 'Sistema' as Actor, key: 'activity' }
      let meta: Record<string, unknown> = {}
      try { meta = JSON.parse(e.metadata || '{}') } catch { /* */ }
      const detailParts: string[] = []
      if (e.subType) detailParts.push(String(e.subType))
      if (typeof meta.action === 'string') detailParts.push(meta.action)
      if (typeof meta.expectedOutcome === 'string') detailParts.push(meta.expectedOutcome)
      if (meta.scoreDelta != null) detailParts.push(`Δscore ${meta.scoreDelta}`)
      if (meta.from != null && meta.to != null) detailParts.push(`${meta.from} → ${meta.to}`)
      if (meta.daysSince != null) detailParts.push(`${meta.daysSince} días sin actividad`)
      events.push({
        id: e.id, source: 'engine', createdAt: e.createdAt.toISOString(), actor: m.actor, actorName: m.actor === 'IA' ? 'Motor de IA' : m.actor === 'Automatización' ? 'Motor de automatización' : 'Sistema ValiAutoFlow',
        event: m.label, eventKey: m.key, subType: e.subType || undefined, module: m.module,
        details: truncate(detailParts.join(' · ')) || (e.contactId ? (nameOf.get(e.contactId) || '') : ''),
        contactId: e.contactId || undefined, contactName: e.contactId ? nameOf.get(e.contactId) : undefined,
        risk: m.risk, metadata: { ...meta, score: e.score, temperature: e.temperature },
      })
    }
    for (const t of timeline) {
      const m = TIMELINE_MAP[t.type] || { label: t.type, module: 'Conversaciones', risk: 'info' as Risk, key: 'activity' }
      const actor: Actor = t.source === 'human' ? 'Usuario' : t.source === 'ai' ? 'IA' : 'Sistema'
      events.push({
        id: t.id, source: 'timeline', createdAt: t.createdAt.toISOString(), actor,
        actorName: actor === 'IA' ? 'Motor de IA' : actor === 'Usuario' ? 'Operador' : 'Sistema ValiAutoFlow',
        event: m.label, eventKey: m.key, module: m.module,
        details: truncate(t.title), contactId: t.contactId, contactName: nameOf.get(t.contactId),
        risk: t.importance === 'high' ? 'medio' : m.risk, metadata: (() => { try { return JSON.parse(t.metadata || '{}') } catch { return {} } })(),
      })
    }
    for (const a of autoLogs) {
      const failed = a.status === 'failed' || a.status === 'error'
      events.push({
        id: a.id, source: 'automation', createdAt: a.createdAt.toISOString(), actor: 'Automatización', actorName: 'Motor de automatización',
        event: failed ? 'Automatización falló' : 'Automatización ejecutada', eventKey: failed ? 'alert' : 'zap', module: 'Automatizaciones',
        details: truncate(a.action || a.message || a.errorMessage || ''),
        contactId: a.contactId || undefined, contactName: a.contactName || (a.contactId ? nameOf.get(a.contactId) : undefined),
        risk: failed ? 'alto' : 'bajo', metadata: (() => { try { return JSON.parse(a.metadata || '{}') } catch { return {} } })(),
      })
    }
    for (const l of auditLogs) {
      const m = AUDIT_MAP[l.action] || { label: l.action, module: 'Sistema', risk: 'bajo' as Risk, key: 'shield' }
      const md = (() => { try { return JSON.parse(l.metadata || '{}') } catch { return {} as Record<string, unknown> } })()
      const dev = [md.browser, md.os, md.device].filter(Boolean).join(' · ') || undefined
      const loc = [md.city, md.country].filter(Boolean).join(', ') || undefined
      const baseDetail = truncate([l.resourceType, l.resourceId].filter(Boolean).join(' '))
      events.push({
        id: l.id, source: 'audit', createdAt: l.createdAt.toISOString(), actor: 'Usuario', actorName: l.userId ? (userName.get(l.userId) || 'Usuario') : 'Usuario',
        event: m.label, eventKey: m.key, module: m.module,
        details: baseDetail || [dev, loc].filter(Boolean).join(' · '),
        risk: m.risk, metadata: { ip: l.ip, ...md },
        ip: l.ip || undefined, device: dev, location: loc,
      })
    }

    events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    // ── KPIs (reales, NO limitados por el cap del feed) ──
    const [eventsToday, eventsYesterday, tlToday, autoToday, riskWeek, alertsWeek, auditToday, suspiciousWeek] = await Promise.all([
      db.engineEvent.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      db.engineEvent.count({ where: { workspaceId, createdAt: { gte: twoDayAgo, lt: dayAgo } } }),
      db.contactTimelineEvent.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      db.automationLog.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      db.engineEvent.count({ where: { workspaceId, type: { in: ['STALE_LEAD_7D_NOTIFIED', 'MISSED_APPT_PROCESSED'] }, createdAt: { gte: weekAgo } } }),
      db.engineEvent.count({ where: { workspaceId, type: { in: ['STALE_LEAD_7D_NOTIFIED', 'HOT_LEAD_THRESHOLD_CROSSED', 'MISSED_APPT_PROCESSED'] }, createdAt: { gte: weekAgo } } }),
      db.consentLog.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      db.consentLog.count({ where: { workspaceId, action: 'login_failed', createdAt: { gte: weekAgo } } }),
    ])
    const eventosHoy = eventsToday + tlToday + autoToday + auditToday
    const deltaPct = eventsYesterday > 0 ? Math.round(((eventsToday - eventsYesterday) / eventsYesterday) * 100) : null

    const sessions = sessionRows.map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: userName.get(s.userId) || 'Usuario',
      ip: s.ip || undefined,
      device: [s.browser, s.os, s.device].filter(Boolean).join(' · ') || undefined,
      browser: s.browser || undefined,
      os: s.os || undefined,
      deviceType: s.device || undefined,
      location: [s.city, s.country].filter(Boolean).join(', ') || undefined,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    }))
    const sesionesActivas = sessionRows.filter((s) => s.isActive).length

    return Response.json({
      events,
      sessions,
      capped: events.length >= 500,
      kpis: {
        eventosHoy,
        eventosHoyDelta: deltaPct,
        alertasActivas: alertsWeek,
        usuariosActivos: members.length,
        sesionesActivas,
        accesosSospechosos: suspiciousWeek,
        riesgoAlto: riskWeek,
        totalEventos: events.length,
      },
      users: members.map((m) => ({ id: m.userId, name: m.user?.name || m.user?.email || 'Usuario', role: m.role })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
