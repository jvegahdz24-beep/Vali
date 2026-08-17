// ═══════════════════════════════════════════════════════════════
// Herramientas del Copiloto IA: acciones de NEGOCIO que el agente puede
// ejecutar a pedido (inventario, marketing, análisis). NUNCA toca código.
// Cada tool: {name, desc, params, run(args, ctx)} → {summary, data?}.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { buildCarCreative, money } from '@/lib/marketing/creative'
import { generateCaption } from '@/lib/marketing/caption'
import { generateMarketStudy } from '@/lib/marketing/market-study'
import { generateTips } from '@/lib/marketing/tips'
import { publishCar } from '@/lib/marketing/publish'
import { buildCarReel } from '@/lib/marketing/video'
import { sendOperatorMessage } from '@/lib/whatsapp/operator-send'
import { loadConnection, meliApi, vehicleToMeliItem } from '@/lib/meli/client'
import { chatWithAI } from '@/lib/ai/providers'
import { logTimelineEvent } from '@/lib/erp/bitacora'
import { recordDealOutcome } from '@/lib/engine/outcomes'
import { saveMemory, loadMemories } from './memory'
import { broadcastToWorkspace } from '@/lib/telegram'
import { TEMPLATE_REGISTRY, instantiateTemplate, type AgentTemplate as FactoryTemplate } from '@/lib/templates/agent-templates'
import { invalidateAgentInstanceCache, defaultKeywordsForVertical, isConversationalVertical } from '@/lib/ai/agent-selector'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { processMessageCore, invalidatePersonalityCache } from '@/lib/ai/message-processor'
import { processInventoryImport, parseCsv, resolveGoogleUrl, type NormalizedVehicle } from '@/lib/erp/inventory-import'
import { buildIndustryPersona, getIndustryConfig } from '@/lib/ai/industries'
import { readAdsCreds, canRunAds, createPausedCampaign } from '@/lib/marketing/ads'
import { collectBriefing, formatBriefing } from './briefing'

// Convierte texto descargado (CSV/JSON/SQL/TXT) en payload para el procesador de inventario.
function textToImportPayload(text: string, forceCsv = false):
  | { kind: 'rows'; headers: string[]; rows: Record<string, unknown>[] }
  | { kind: 'text'; text: string } {
  const trimmed = text.trim()
  if (!forceCsv && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    try {
      const parsed = JSON.parse(trimmed)
      const arr = Array.isArray(parsed) ? parsed
        : Array.isArray((parsed as Record<string, unknown>).items) ? (parsed as Record<string, unknown[]>).items
        : Array.isArray((parsed as Record<string, unknown>).vehicles) ? (parsed as Record<string, unknown[]>).vehicles
        : Array.isArray((parsed as Record<string, unknown>).data) ? (parsed as Record<string, unknown[]>).data
        : null
      if (arr && arr.length && typeof arr[0] === 'object') return { kind: 'rows', headers: Object.keys(arr[0] as object), rows: arr as Record<string, unknown>[] }
      return { kind: 'text', text: trimmed }
    } catch { /* fall through */ }
  }
  const firstLine = trimmed.split(/\r?\n/)[0] || ''
  if (forceCsv || (firstLine.includes(',') && trimmed.split(/\r?\n/).length > 1)) {
    const { headers, rows } = parseCsv(trimmed)
    if (headers.length && rows.length) return { kind: 'rows', headers, rows }
  }
  return { kind: 'text', text: trimmed }
}

// vertical → rol por defecto (mismo mapeo que el endpoint /api/agent-factory/instances)
const VERTICAL_ROLE: Record<string, string> = {
  ventas: 'CLOSER', seguimiento: 'FOLLOWUP', seguros: 'SEGURO', financiamiento: 'FINAN',
  precalificacion: 'PRECALIF', cotizador: 'COTIZADOR', 'planes-pago': 'PLANES',
  'recordatorio-pagos': 'RECORDATORIO', soporte: 'SOPORTE', logistica: 'LOGISTICA', inventario: 'INVENTARIO',
}
const roleForVertical = (v: string) => VERTICAL_ROLE[v] || v.toUpperCase().replace(/[^A-Z0-9]+/g, '_')

// Resuelve una plantilla del registry por id, vertical o nombre (normalizado).
function findTemplate(q: string): FactoryTemplate | null {
  if (!q) return null
  const nq = norm(q)
  return (
    TEMPLATE_REGISTRY.find((t) => t.id === q) ||
    TEMPLATE_REGISTRY.find((t) => norm(t.vertical) === nq) ||
    TEMPLATE_REGISTRY.find((t) => norm(t.name).includes(nq) || nq.includes(norm(t.vertical))) ||
    null
  )
}

// Resuelve un AgentInstance del workspace por id o nombre/rol/vertical (normalizado).
async function findAgent(ws: string, q: string) {
  if (!q) return null
  const byId = await db.agentInstance.findFirst({ where: { id: String(q), workspaceId: ws } })
  if (byId) return byId
  const all = await db.agentInstance.findMany({ where: { workspaceId: ws } })
  const nq = norm(q)
  return all.find((a) => norm(a.name).includes(nq) || norm(a.role) === nq || norm(a.vertical) === nq) || null
}

async function aiDraft(system: string, user: string): Promise<string> {
  try { const r = await chatWithAI([{ role: 'system', content: system }, { role: 'user', content: user }], 'glm', undefined, { temperature: 0.75, maxTokens: 320, disableThinking: true }); return (r?.content || '').trim() } catch { return '' }
}

export interface ToolCtx { workspaceId: string; base: string }
export interface ToolResult { summary: string; data?: unknown }
export interface Tool { name: string; desc: string; params: string; run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolResult> }

const J = (s: string | null) => { try { return JSON.parse(s || '{}') } catch { return {} } }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function findCar(ws: string, q: string) {
  if (!q) return null
  const byId = await db.catalogItem.findFirst({ where: { id: String(q), workspaceId: ws } })
  if (byId) return byId
  const all = await db.catalogItem.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: 'desc' } })
  const nq = norm(q)
  const exact = all.find((c) => norm(c.name).includes(nq))
  if (exact) return exact
  // Fallback: por tokens — todas las palabras significativas presentes en el nombre
  const stop = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'mi', 'producto', 'auto', 'coche', 'carro', 'plan'])
  const tokens = nq.split(/\s+/).filter((t) => t.length >= 2 && !stop.has(t))
  if (tokens.length) {
    const hit = all.find((c) => { const n = norm(c.name); return tokens.every((t) => n.includes(t)) })
    if (hit) return hit
    const partial = all.find((c) => { const n = norm(c.name); return tokens.some((t) => n.includes(t)) })
    if (partial) return partial
  }
  return null
}

const carLine = (c: { name: string; price: number | null; currency: string | null; metadata: string | null }) => {
  const m = J(c.metadata); return `${c.name} — ${money(c.price, c.currency || 'MXN')}${m.status ? ` [${m.status}]` : ''}${m.km ? ` · ${m.km}km` : ''}`
}

type ContactRow = { id: string; firstName: string; lastName: string | null; phone: string | null; email: string | null; temperature: string; leadScore: number; tags: string; notes: string | null; status: string }
const contactName = (c: { firstName: string; lastName: string | null }) => `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`

async function findContact(ws: string, q: string): Promise<ContactRow | null> {
  if (!q) return null
  const byId = await db.contact.findFirst({ where: { id: String(q), workspaceId: ws } })
  if (byId) return byId as ContactRow
  const digits = String(q).replace(/\D/g, '')
  if (digits.length >= 7) { const byPhone = await db.contact.findFirst({ where: { workspaceId: ws, phone: { contains: digits.slice(-10) } } }); if (byPhone) return byPhone as ContactRow }
  const all = await db.contact.findMany({ where: { workspaceId: ws }, take: 800 })
  const nq = norm(q)
  return (all.find((c) => norm(contactName(c)).includes(nq)) || null) as ContactRow | null
}

// Envía un WhatsApp a un contacto ya resuelto, con timeout para no colgar.
async function sendWa(ctx: ToolCtx, contact: ContactRow, message: string): Promise<{ ok: boolean; info: string }> {
  if (!contact.phone) return { ok: false, info: `${contactName(contact)}: sin teléfono` }
  if (!message.trim()) return { ok: false, info: `${contactName(contact)}: mensaje vacío` }
  let convo = await db.conversation.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: contact.id }, orderBy: { lastMessageAt: 'desc' } })
  if (!convo) convo = await db.conversation.create({ data: { workspaceId: ctx.workspaceId, contactId: contact.id, channel: 'whatsapp', status: 'active' } })
  try {
    const r = await Promise.race([
      sendOperatorMessage({ workspaceId: ctx.workspaceId, phone: contact.phone, message, conversationId: convo.id, contactId: contact.id }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tiempo de espera agotado (WhatsApp no respondió)')), 15000)),
    ])
    return (r.success || r.delivered) ? { ok: true, info: `${contactName(contact)}: enviado ✓` } : { ok: false, info: `${contactName(contact)}: ${r.error || 'no enviado (¿WhatsApp conectado?)'}` }
  } catch (e) { return { ok: false, info: `${contactName(contact)}: ${e instanceof Error ? e.message : 'error'}` } }
}

async function defaultPipeline(ws: string) {
  return db.pipeline.findFirst({ where: { workspaceId: ws, isActive: true }, orderBy: { order: 'asc' }, include: { stages: { orderBy: { order: 'asc' } } } })
}
const periodStart = (p: string): { start: Date; label: string } => {
  if (p === 'hoy') { const d = new Date(); d.setHours(0, 0, 0, 0); return { start: d, label: 'hoy' } }
  const days = p === '30d' ? 30 : p === '90d' ? 90 : 7
  return { start: new Date(Date.now() - days * 86400000), label: `últimos ${days} días` }
}

export const TOOLS: Tool[] = [
  {
    name: 'buscar_inventario',
    desc: 'Lista autos del inventario, opcionalmente filtrando.',
    params: '{ "estado"?: "disponible|apartado|vendido", "marca"?: string, "query"?: string, "limite"?: number }',
    run: async (a, ctx) => {
      const items = await db.catalogItem.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' } })
      let f = items
      if (a.estado) f = f.filter((c) => (J(c.metadata).status || 'disponible') === a.estado)
      if (a.marca) f = f.filter((c) => norm(J(c.metadata).marca || '').includes(norm(String(a.marca))))
      if (a.query) f = f.filter((c) => norm(c.name).includes(norm(String(a.query))))
      const lim = Math.min(Number(a.limite) || 15, 40)
      const list = f.slice(0, lim)
      return { summary: `${f.length} auto(s) encontrados. Mostrando ${list.length}:\n` + list.map((c) => '• ' + carLine(c)).join('\n'), data: { total: f.length, ids: list.map((c) => c.id) } }
    },
  },
  {
    name: 'analizar_inventario',
    desc: 'Análisis del inventario: totales, valor, marcas, autos sin foto y los que llevan más tiempo (lentos).',
    params: '{}',
    run: async (_a, ctx) => {
      const items = await db.catalogItem.findMany({ where: { workspaceId: ctx.workspaceId } })
      const now = Date.now(); let sum = 0, np = 0
      const byStatus: Record<string, number> = {}, byBrand: Record<string, number> = {}
      const slow: { name: string; days: number }[] = []
      for (const c of items) {
        const m = J(c.metadata); if (c.price) sum += c.price
        const st = m.status || 'disponible'; byStatus[st] = (byStatus[st] || 0) + 1
        if (m.marca) byBrand[m.marca] = (byBrand[m.marca] || 0) + 1
        const hasPhoto = c.imageUrl || (Array.isArray(m.images) && m.images.length)
        if (!hasPhoto) np++
        const days = Math.floor((now - new Date(c.createdAt).getTime()) / 86400000)
        if (st !== 'vendido') slow.push({ name: c.name, days })
      }
      slow.sort((a, b) => b.days - a.days)
      const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')
      return {
        summary: `Inventario: ${items.length} autos, valor total ${money(sum)}.\nPor estatus: ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}.\nMarcas: ${top(byBrand)}.\nSin foto: ${np}.\nMás tiempo en lote: ${slow.slice(0, 5).map((s) => `${s.name} (${s.days}d)`).join(', ')}.`,
        data: { total: items.length, value: sum, byStatus, noPhoto: np },
      }
    },
  },
  {
    name: 'actualizar_auto',
    desc: 'Cambia el estatus (disponible/apartado/vendido) y/o el precio de un auto.',
    params: '{ "auto": "nombre o id", "estatus"?: "disponible|apartado|vendido", "precio"?: number }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || ''))
      if (!car) return { summary: `No encontré el auto "${a.auto}".` }
      const m = J(car.metadata)
      const data: Record<string, unknown> = {}
      if (a.estatus) { m.status = String(a.estatus); data.metadata = JSON.stringify(m); data.isActive = a.estatus === 'disponible' }
      if (a.precio != null) data.price = Number(a.precio)
      if (!Object.keys(data).length) return { summary: 'No indicaste qué cambiar (estatus o precio).' }
      await db.catalogItem.update({ where: { id: car.id }, data })
      return { summary: `Actualizado: ${car.name}${a.estatus ? ` → ${a.estatus}` : ''}${a.precio != null ? ` → ${money(Number(a.precio))}` : ''}.` }
    },
  },
  {
    name: 'generar_caption',
    desc: 'Genera un caption (texto) para redes de un auto.',
    params: '{ "auto": "nombre o id", "red"?: "instagram|facebook" }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}".` }
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true, logo: true, settings: true } })
      const c = buildCarCreative(car, ws!, ctx.base)
      const r = await generateCaption(c, a.red === 'facebook' ? 'facebook' : 'instagram')
      return { summary: `Caption para ${car.name}:\n\n${r.text}\n\n${r.hashtags.join(' ')}` }
    },
  },
  {
    name: 'generar_imagen',
    desc: 'Genera un creativo de imagen (feed o historia) de un auto y devuelve su enlace.',
    params: '{ "auto": "nombre o id", "formato"?: "feed|story", "plantilla"?: "clasica|ficha|oferta|historia|cobertura|editorial" }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}".` }
      const fmt = a.formato === 'story' ? 'story' : 'feed'
      const tpl = a.plantilla || (fmt === 'story' ? 'historia' : 'clasica')
      const url = `${ctx.base}/api/marketing/render?workspaceId=${ctx.workspaceId}&carId=${car.id}&format=${fmt}&template=${tpl}`
      return { summary: `Imagen ${fmt} de ${car.name} lista: ${url}`, data: { url } }
    },
  },
  {
    name: 'generar_video',
    desc: 'Genera un VIDEO COMERCIAL profesional de un producto del inventario: fotos reales a pantalla completa con movimiento, hook de apertura, specs por toma, precio protagonista, cierre con WhatsApp, música y VOZ narrada por IA. 4 estilos distintos para variar (impacto=oferta agresiva, premium=lujo elegante, dinamico=urbano juvenil, ficha=informativo limpio); sin estilo se elige uno al azar. Corre EN SEGUNDO PLANO (~1-2 min): responde al instante con el enlace donde quedará.',
    params: '{ "auto": "nombre o id del producto", "estilo"?: "impacto|premium|dinamico|ficha|aleatorio", "conVoz"?: boolean, "voz"?: "mujer|hombre", "musica"?: "energica|lujo|urbana|corporativa|epica|alegre" }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}" en el inventario.` }
      const conVoz = a.conVoz !== false // por defecto CON voz (es lo que más piden)
      const estilo = String(a.estilo || 'aleatorio')
      const fileName = `${car.id}-${Date.now()}.mp4`
      const url = `${ctx.base}/api/marketing/media/${fileName}`
      const voiceId = a.voz ? (String(a.voz).toLowerCase().startsWith('h') ? 'Spanish_SensibleManager' : 'Spanish_ConfidentWoman') : undefined
      const wsId = ctx.workspaceId, base = ctx.base
      // Job en segundo plano: el chat responde YA (Cloudflare corta ~100s; el video tarda 60-120s)
      void (async () => {
        try {
          const v = await buildCarReel({
            workspaceId: wsId, carId: car.id, base, fileName, estilo,
            ...(a.musica ? { music: `${a.musica}.mp3` } : {}),
            autoNarration: conVoz, voiceId,
          })
          await broadcastToWorkspace(wsId, `🎬 <b>Video listo</b>: ${car.name} — estilo ${v.style} (${v.durationSec}s, ${v.shots} tomas${v.hasVoice ? ', con voz' : ''}${v.hasMusic ? ', con música' : ''})\n${base}${v.url}`).catch(() => {})
          await db.engineEvent.create({ data: { workspaceId: wsId, contactId: '', type: 'VIDEO_GENERATED', metadata: JSON.stringify({ car: car.name, url: `${base}${v.url}`, hasVoice: v.hasVoice, style: v.style }) } }).catch(() => {})
        } catch (e) {
          await broadcastToWorkspace(wsId, `⚠️ El video de ${car.name} falló: ${e instanceof Error ? e.message : 'error'}`).catch(() => {})
        }
      })()
      return { summary: `🎬 Estoy generando el video comercial de ${car.name} (estilo ${estilo === 'aleatorio' ? 'sorpresa — cada video sale diferente' : estilo}${conVoz ? ', CON VOZ narrada' : ''}, con música). Tarda ~1-2 minutos y quedará en este enlace:\n${url}\n\nAvísale al usuario que en ~2 minutos lo abra (si aún no carga, sigue en proceso; con "mis videos" se confirma). Si tiene Telegram conectado, le llegará el aviso ahí.`, data: { url, fileName } }
    },
  },
  {
    name: 'mis_videos',
    desc: 'Lista los videos generados recientemente (los más nuevos primero) con su enlace y si ya están listos.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const { readdir, stat } = await import('fs/promises'); const path = (await import('path')).default
      const dir = path.join(process.cwd(), 'public', 'marketing', 'videos')
      let files: string[] = []
      try { files = await readdir(dir) } catch { return { summary: 'Aún no hay videos generados.' } }
      const mp4s = files.filter((f) => f.endsWith('.mp4'))
      if (!mp4s.length) return { summary: 'Aún no hay videos generados.' }
      const rows = await Promise.all(mp4s.map(async (f) => { const st = await stat(path.join(dir, f)); return { f, mtime: st.mtimeMs, mb: st.size / 1048576 } }))
      rows.sort((x, y) => y.mtime - x.mtime)
      const lim = Math.min(Number(a.limite) || 5, 15)
      const list = rows.slice(0, lim)
      const carIds = list.map((r) => r.f.split('-')[0])
      const cars = await db.catalogItem.findMany({ where: { id: { in: carIds } }, select: { id: true, name: true } })
      const nameOf = new Map(cars.map((c) => [c.id, c.name]))
      return { summary: `Videos recientes (${list.length}):\n` + list.map((r) => `• ${nameOf.get(r.f.split('-')[0]) || 'Producto'} — ${r.mb.toFixed(1)}MB, ${new Date(r.mtime).toLocaleString('es-MX')} → ${ctx.base}/api/marketing/media/${r.f}`).join('\n') }
    },
  },
  {
    name: 'enviar_media_whatsapp',
    desc: 'Envía una FOTO o VIDEO por WhatsApp a un contacto (la foto de un producto, un creativo generado o un video con voz). Puedes pasar la URL del archivo o decir "ultimo video"/"ultima imagen" para usar el más reciente.',
    params: '{ "contacto": "nombre/teléfono/id", "url": "https://... o \'ultimo video\'", "caption"?: "texto que acompaña" }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      if (!c.phone) return { summary: `${contactName(c)} no tiene teléfono.` }
      let url = String(a.url || '').trim()
      const path = (await import('path')).default
      // "ultimo video" → el mp4 más reciente
      if (/ultim[oa]s?\s*video/i.test(url) || (!url && true)) {
        const { readdir, stat } = await import('fs/promises')
        const dir = path.join(process.cwd(), 'public', 'marketing', 'videos')
        try {
          const files = (await readdir(dir)).filter((f) => f.endsWith('.mp4'))
          const rows = await Promise.all(files.map(async (f) => ({ f, m: (await stat(path.join(dir, f))).mtimeMs })))
          rows.sort((x, y) => y.m - x.m)
          if (rows.length) url = `${ctx.base}/api/marketing/media/${rows[0].f}`
        } catch { /* */ }
        if (!/^https?:/.test(url)) return { summary: 'No hay videos generados aún. Genera uno primero con "generar_video".' }
      }
      if (!/^https?:\/\//i.test(url)) return { summary: 'Pásame la URL del archivo (o di "último video").' }
      const isVideo = /\.mp4(\?|$)/i.test(url)
      // Si es un archivo local del propio dominio, usar la ruta en disco (más confiable)
      let src: string | { url: string } = { url }
      const mMedia = url.match(/\/api\/marketing\/media\/([\w.-]+\.mp4)$/i)
      if (mMedia) {
        const local = path.join(process.cwd(), 'public', 'marketing', 'videos', mMedia[1])
        const { existsSync } = await import('fs')
        if (!existsSync(local)) return { summary: `Ese video aún se está generando (no está listo). Espera ~1 minuto y vuelve a intentar, o revisa con "mis_videos".` }
        src = { url: local }
      }
      const mgr = getWhatsAppManager(ctx.workspaceId)
      if (!mgr.getStatus().connected) return { summary: 'WhatsApp no está conectado — no puedo enviar el archivo.' }
      const jid = `${c.phone.replace(/\D/g, '')}@s.whatsapp.net`
      const caption = String(a.caption || '').trim() || undefined
      const r = await mgr.sendMessageRaw(jid, isVideo ? { video: src, caption } : { image: src, caption })
      if (!r.success) return { summary: `❌ No se pudo enviar a ${contactName(c)}: ${r.error || 'error'}` }
      // registrar en la conversación
      try {
        let convo = await db.conversation.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' } })
        if (!convo) convo = await db.conversation.create({ data: { workspaceId: ctx.workspaceId, contactId: c.id, channel: 'whatsapp', status: 'active' } })
        await db.message.create({ data: { conversationId: convo.id, direction: 'outbound', senderType: 'human', content: `${isVideo ? '🎬 [Video]' : '🖼️ [Imagen]'}${caption ? ' ' + caption : ''}`, type: isVideo ? 'video' : 'image', metadata: JSON.stringify({ mediaUrl: url, sentByCopilot: true }) } })
        await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), lastMessagePreview: isVideo ? '🎬 Video' : '🖼️ Imagen' } })
      } catch { /* registro best-effort */ }
      return { summary: `✅ ${isVideo ? 'Video' : 'Imagen'} enviado a ${contactName(c)} (${c.phone})${caption ? ` con el texto: "${caption}"` : ''}.` }
    },
  },
  {
    name: 'publicar',
    desc: 'Publica un auto en redes (Facebook/Instagram) AHORA. Requiere conexión de Meta.',
    params: '{ "auto": "nombre o id", "redes"?: ["facebook","instagram"], "formatos"?: ["feed","story"] }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}".` }
      const { results, published } = await publishCar({ workspaceId: ctx.workspaceId, carId: car.id, networks: (a.redes as string[]) || undefined, formats: (a.formatos as string[]) || undefined, source: 'manual', base: ctx.base })
      const detalle = results.map((r) => `${r.network}/${r.format}:${r.status}${r.error ? `(${r.error})` : ''}`).join(', ')
      // Contundente cuando NADA se publicó: el modelo NO debe poder decir "éxito"
      // si Meta no está conectado (bug visto 2026-07-21: afirmó publicación falsa).
      if (published === 0) {
        const noMeta = results.some((r) => /no est[aá] conectad|not connected|token/i.test(r.error || ''))
        return { summary: `❌ NO SE PUBLICÓ NADA de ${car.name}. ${noMeta ? 'Facebook/Instagram (Meta) NO está conectado en este negocio — dile al usuario que primero conecte Meta en Configuración → Conexiones. NO afirmes que se publicó.' : `Fallaron todos los destinos: ${detalle}`} JAMÁS reportes esto como éxito.` }
      }
      return { summary: `✅ Publicación de ${car.name}: ${published} destino(s) ok. Detalle: ${detalle}` }
    },
  },
  {
    name: 'agendar',
    desc: 'Agenda la publicación de un auto para una fecha/hora futura (ISO).',
    params: '{ "auto": "nombre o id", "fechaISO": "2026-06-22T19:00:00", "redes"?: [...], "formatos"?: [...] }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}".` }
      const when = new Date(String(a.fechaISO || '')); if (isNaN(when.getTime())) return { summary: 'Fecha inválida. Usa formato ISO, ej 2026-06-22T19:00:00.' }
      await db.scheduledPost.create({ data: { workspaceId: ctx.workspaceId, carId: car.id, networks: JSON.stringify((a.redes as string[]) || ['facebook', 'instagram']), formats: JSON.stringify((a.formatos as string[]) || ['feed', 'story']), templates: '{}', scheduledAt: when } })
      return { summary: `Agendado: ${car.name} para ${when.toLocaleString('es-MX')}.` }
    },
  },
  {
    name: 'estudio_mercado',
    desc: 'Genera/analiza el estudio de mercado del negocio (segmentos, ángulos, plan, horarios).',
    params: '{}',
    run: async (_a, ctx) => {
      const s = await generateMarketStudy(ctx.workspaceId)
      return { summary: `${s.summary}\nSegmentos: ${s.segments.map((x) => x.name).join(', ')}.\nÁngulos: ${s.angles.join('; ')}.`, data: s }
    },
  },
  {
    name: 'consejos',
    desc: 'Da consejos accionables de mejora/venta para el negocio según su estado actual.',
    params: '{}',
    run: async (_a, ctx) => {
      const t = await generateTips(ctx.workspaceId)
      return { summary: t.tips.map((x) => `• ${x.title}: ${x.detail}`).join('\n') }
    },
  },
  {
    name: 'leads_calientes',
    desc: 'Lista los prospectos/leads más calientes del CRM para dar prioridad de venta.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const profiles = await db.leadProfile.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { score: 'desc' }, take: Math.min(Number(a.limite) || 10, 25), include: { contact: { select: { firstName: true, lastName: true, phone: true } } } }).catch(() => [])
      if (!profiles.length) return { summary: 'No hay leads con perfil aún.' }
      const nm = (c?: { firstName: string; lastName: string | null }) => c ? `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` : 'Sin nombre'
      return { summary: 'Leads más calientes:\n' + profiles.map((p) => `• ${nm(p.contact)} (score ${p.score ?? 0})${p.preferredProduct ? ` — interesado en ${p.preferredProduct}` : ''}${p.mainObjection ? ` — objeción: ${p.mainObjection}` : ''}`).join('\n') }
    },
  },

  // ─── CONTACTOS / CRM ───
  {
    name: 'buscar_contactos',
    desc: 'Busca contactos/clientes del CRM (por nombre o temperatura).',
    params: '{ "query"?: string, "temperatura"?: "hot|warm|cold", "limite"?: number }',
    run: async (a, ctx) => {
      const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
      if (a.temperatura) where.temperature = a.temperatura
      // Totales REALES primero — sin esto el modelo contaba la página (15) y
      // respondía "tienes 15 contactos" (bug visto 2026-07-21 con 159 en BD).
      const [totalWs, activosWs, totalFiltro] = await Promise.all([
        db.contact.count({ where: { workspaceId: ctx.workspaceId } }),
        db.contact.count({ where: { workspaceId: ctx.workspaceId, status: 'active' } }),
        db.contact.count({ where }),
      ])
      let list = await db.contact.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 200 })
      if (a.query) { const nq = norm(String(a.query)); list = list.filter((c) => norm(contactName(c)).includes(nq) || (c.phone || '').includes(String(a.query))) }
      const matched = a.query ? list.length : totalFiltro
      list = list.slice(0, Math.min(Number(a.limite) || 15, 40))
      const header = `TOTALES REALES DEL CRM: ${totalWs} contactos en total (${activosWs} activos).${a.temperatura || a.query ? ` Con este filtro: ${matched}.` : ''} Mostrando ${list.length}:`
      if (!list.length) return { summary: `${header}\n(ninguno coincide con esos criterios)` }
      return { summary: `${header}\n` + list.map((c) => `• ${contactName(c)}${c.phone ? ` (${c.phone})` : ''} — ${c.temperature}, score ${c.leadScore}`).join('\n') }
    },
  },
  {
    name: 'detalle_contacto',
    desc: 'Ficha completa de un contacto: perfil, interés, objeción, próxima cita y bitácora.',
    params: '{ "contacto": "nombre, teléfono o id" }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré al contacto "${a.contacto}".` }
      const [profile, appt, timeline] = await Promise.all([
        db.leadProfile.findUnique({ where: { contactId: c.id } }).catch(() => null),
        db.appointment.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id, status: 'pending', date: { gte: new Date() } }, orderBy: { date: 'asc' } }).catch(() => null),
        db.contactTimelineEvent.findMany({ where: { workspaceId: ctx.workspaceId, contactId: c.id }, orderBy: { createdAt: 'desc' }, take: 6 }).catch(() => []),
      ])
      const lines = [`${contactName(c)}${c.phone ? ` · ${c.phone}` : ''}${c.email ? ` · ${c.email}` : ''}`, `Temperatura: ${c.temperature} (score ${c.leadScore}), estatus: ${c.status}`]
      if (profile) lines.push(`Perfil: arquetipo ${profile.archetype}${profile.preferredProduct ? `, interés ${profile.preferredProduct}` : ''}${profile.budget ? `, presupuesto ${profile.budget}` : ''}${profile.mainObjection ? `, objeción ${profile.mainObjection}` : ''}`)
      if (appt) lines.push(`Próxima cita: ${appt.title} — ${new Date(appt.date).toLocaleString('es-MX')}`)
      if (timeline.length) lines.push('Bitácora reciente:\n' + timeline.map((t) => `  - ${t.title}`).join('\n'))
      return { summary: lines.join('\n') }
    },
  },
  {
    name: 'crear_contacto',
    desc: 'Crea un nuevo contacto/cliente en el CRM.',
    params: '{ "nombre": string, "telefono"?: string, "email"?: string, "notas"?: string }',
    run: async (a, ctx) => {
      const full = String(a.nombre || '').trim(); if (!full) return { summary: 'Indica el nombre del contacto.' }
      const [firstName, ...rest] = full.split(' ')
      const c = await db.contact.create({ data: { workspaceId: ctx.workspaceId, firstName, lastName: rest.join(' ') || null, phone: a.telefono ? String(a.telefono) : null, email: a.email ? String(a.email) : null, source: 'manual', notes: a.notas ? String(a.notas) : null } })
      return { summary: `Contacto creado: ${contactName(c)}${c.phone ? ` (${c.phone})` : ''}.` }
    },
  },
  {
    name: 'actualizar_contacto',
    desc: 'Actualiza un contacto: etiquetas o estatus (active/inactive/archived). Para AGREGAR una nota al expediente usa "nota_contacto" (aquí "nota" REEMPLAZA el campo notas completo).',
    params: '{ "contacto": "nombre/teléfono/id", "etiquetas"?: string[], "nota"?: string, "estatus"?: string }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      const data: Record<string, unknown> = {}
      if (Array.isArray(a.etiquetas)) data.tags = JSON.stringify(a.etiquetas)
      if (a.nota) data.notes = String(a.nota)
      if (a.estatus) data.status = String(a.estatus)
      if (!Object.keys(data).length) return { summary: 'No indicaste qué actualizar.' }
      await db.contact.update({ where: { id: c.id }, data })
      // Una nota también deja rastro en la bitácora (historial del expediente)
      if (a.nota) await logTimelineEvent({ workspaceId: ctx.workspaceId, contactId: c.id, type: 'note', title: String(a.nota).slice(0, 280), source: 'human', importance: 'normal' }).catch(() => {})
      return { summary: `Contacto ${contactName(c)} actualizado.` }
    },
  },

  // ─── WHATSAPP / MENSAJERÍA ───
  {
    name: 'enviar_whatsapp',
    desc: 'Envía un mensaje de WhatsApp a un contacto.',
    params: '{ "contacto": "nombre/teléfono/id", "mensaje": string }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      const msg = String(a.mensaje || '')
      const r = await sendWa(ctx, c, msg)
      return { summary: r.ok ? `✅ Enviado a ${contactName(c)} (${c.phone}). Texto enviado: "${msg.slice(0, 240)}"` : `❌ NO se pudo enviar a ${contactName(c)} — ${r.info}` }
    },
  },
  {
    name: 'enviar_mensajes',
    desc: 'Envía WhatsApp a VARIOS contactos de una vez, con texto personalizado por contacto. Úsalo para campañas o escribir a varios leads en una sola acción.',
    params: '{ "mensajes": [ { "contacto": "nombre/teléfono/id", "mensaje": "texto" } ] }',
    run: async (a, ctx) => {
      const arr = (Array.isArray(a.mensajes) ? a.mensajes : []) as { contacto?: string; mensaje?: string }[]
      if (!arr.length) return { summary: 'No indicaste a quién ni qué enviar (usa "mensajes": [{contacto, mensaje}]).' }
      const results: string[] = []
      let ok = 0
      for (const it of arr.slice(0, 15)) {
        const c = await findContact(ctx.workspaceId, String(it.contacto || ''))
        if (!c) { results.push(`❌ "${it.contacto}": no encontrado`); continue }
        const msg = String(it.mensaje || '')
        const r = await sendWa(ctx, c, msg)
        if (r.ok) { ok++; results.push(`✅ ${r.info} — "${msg.slice(0, 120)}"`) }
        else results.push(`❌ ${r.info}`)
      }
      const failed = arr.length - ok
      return { summary: `Resultado del envío: ${ok} enviado(s)${failed ? `, ${failed} fallido(s)` : ''} de ${arr.length}.\n${results.map((r) => '• ' + r).join('\n')}` }
    },
  },
  {
    name: 'conversaciones_recientes',
    desc: 'Lista las conversaciones recientes, con o sin mensajes sin leer.',
    params: '{ "soloNoLeidas"?: boolean, "limite"?: number }',
    run: async (a, ctx) => {
      const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
      if (a.soloNoLeidas) where.unreadCount = { gt: 0 }
      const convos = await db.conversation.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: Math.min(Number(a.limite) || 12, 30), include: { contact: { select: { firstName: true, lastName: true } } } })
      if (!convos.length) return { summary: a.soloNoLeidas ? 'No hay conversaciones sin leer.' : 'No hay conversaciones.' }
      return { summary: convos.map((cv) => `• ${cv.contact ? contactName(cv.contact) : 'Sin contacto'}${cv.unreadCount ? ` (${cv.unreadCount} sin leer)` : ''}: ${(cv.lastMessagePreview || '').slice(0, 60)}`).join('\n') }
    },
  },
  {
    name: 'historial_chat',
    desc: 'Devuelve los últimos mensajes de la conversación con un contacto (para resumir o continuar).',
    params: '{ "contacto": "nombre/teléfono/id", "limite"?: number }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      const convo = await db.conversation.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' } })
      if (!convo) return { summary: `No hay conversación con ${contactName(c)}.` }
      const msgs = await db.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(a.limite) || 12, 30) })
      if (!msgs.length) return { summary: 'Sin mensajes.' }
      return { summary: `Últimos mensajes con ${contactName(c)} (recientes arriba):\n` + msgs.map((m) => `[${m.direction === 'inbound' ? 'cliente' : 'nosotros'}] ${m.content.slice(0, 120)}`).join('\n') }
    },
  },

  // ─── PIPELINE / DEALS ───
  {
    name: 'ver_pipeline',
    desc: 'Muestra el embudo de ventas: etapas con número de deals y valor.',
    params: '{}',
    run: async (_a, ctx) => {
      const pl = await defaultPipeline(ctx.workspaceId); if (!pl) return { summary: 'No hay pipeline configurado.' }
      const deals = await db.deal.findMany({ where: { workspaceId: ctx.workspaceId, status: 'active' }, select: { stageId: true, value: true } })
      const byStage = pl.stages.map((s) => { const d = deals.filter((x) => x.stageId === s.id); return `• ${s.name}: ${d.length} deal(s), ${money(d.reduce((t, x) => t + (x.value || 0), 0))}` })
      return { summary: `Pipeline "${pl.name}":\n` + byStage.join('\n') }
    },
  },
  {
    name: 'crear_deal',
    desc: 'Crea una oportunidad de venta (deal) en el pipeline.',
    params: '{ "titulo": string, "contacto"?: string, "valor"?: number, "etapa"?: string }',
    run: async (a, ctx) => {
      const pl = await defaultPipeline(ctx.workspaceId); if (!pl || !pl.stages.length) return { summary: 'No hay pipeline/etapas configuradas.' }
      const stage = a.etapa ? pl.stages.find((s) => norm(s.name).includes(norm(String(a.etapa)))) || pl.stages[0] : pl.stages[0]
      const contact = a.contacto ? await findContact(ctx.workspaceId, String(a.contacto)) : null
      const d = await db.deal.create({ data: { workspaceId: ctx.workspaceId, pipelineId: pl.id, stageId: stage.id, contactId: contact?.id || null, title: String(a.titulo || 'Nueva oportunidad'), value: Number(a.valor) || 0, source: 'manual' } })
      return { summary: `Deal creado: "${d.title}" en etapa ${stage.name}${contact ? ` para ${contactName(contact)}` : ''}${d.value ? ` (${money(d.value)})` : ''}.` }
    },
  },
  {
    name: 'mover_deal',
    desc: 'Mueve un deal a otra etapa del pipeline.',
    params: '{ "deal": "título o id", "etapa": "nombre de etapa" }',
    run: async (a, ctx) => {
      const pl = await defaultPipeline(ctx.workspaceId); if (!pl) return { summary: 'No hay pipeline.' }
      const deals = await db.deal.findMany({ where: { workspaceId: ctx.workspaceId } })
      const deal = deals.find((d) => d.id === a.deal) || deals.find((d) => norm(d.title).includes(norm(String(a.deal || ''))))
      if (!deal) return { summary: `No encontré el deal "${a.deal}".` }
      const stage = pl.stages.find((s) => norm(s.name).includes(norm(String(a.etapa || ''))))
      if (!stage) return { summary: `No encontré la etapa "${a.etapa}". Etapas: ${pl.stages.map((s) => s.name).join(', ')}.` }
      await db.deal.update({ where: { id: deal.id }, data: { stageId: stage.id, ...(stage.isWon ? { status: 'won', wonAt: new Date() } : {}), ...(stage.isLost ? { status: 'lost', lostAt: new Date() } : {}) } })
      if (stage.isWon || stage.isLost) await recordDealOutcome({ workspaceId: ctx.workspaceId, contactId: deal.contactId, won: stage.isWon, dealId: deal.id, value: deal.value })
      // Ganado/perdido: cortar el seguimiento de VENTAS pendiente (no la postventa)
      if ((stage.isWon || stage.isLost) && deal.contactId) await db.followUpTask.updateMany({ where: { contactId: deal.contactId, status: { in: ['pending', 'processing'] }, ruleId: { not: 'post-sale' } }, data: { status: 'cancelled', error: 'trato cerrado' } }).catch(() => {})
      return { summary: `Deal "${deal.title}" movido a ${stage.name}.` }
    },
  },
  {
    name: 'cerrar_deal',
    desc: 'Cierra un deal como ganado o perdido.',
    params: '{ "deal": "título o id", "resultado": "ganado|perdido", "razon"?: string }',
    run: async (a, ctx) => {
      const deals = await db.deal.findMany({ where: { workspaceId: ctx.workspaceId } })
      const deal = deals.find((d) => d.id === a.deal) || deals.find((d) => norm(d.title).includes(norm(String(a.deal || ''))))
      if (!deal) return { summary: `No encontré el deal "${a.deal}".` }
      const won = String(a.resultado) === 'ganado'
      await db.deal.update({ where: { id: deal.id }, data: won ? { status: 'won', wonAt: new Date() } : { status: 'lost', lostAt: new Date(), lostReason: a.razon ? String(a.razon) : null } })
      await recordDealOutcome({ workspaceId: ctx.workspaceId, contactId: deal.contactId, won, dealId: deal.id, value: deal.value, reason: a.razon ? String(a.razon) : null })
      // Cerrado: cortar el seguimiento de VENTAS pendiente (no la postventa)
      if (deal.contactId) await db.followUpTask.updateMany({ where: { contactId: deal.contactId, status: { in: ['pending', 'processing'] }, ruleId: { not: 'post-sale' } }, data: { status: 'cancelled', error: 'trato cerrado' } }).catch(() => {})
      return { summary: `Deal "${deal.title}" marcado como ${won ? 'GANADO 🎉' : 'perdido'}${a.razon ? ` (${a.razon})` : ''}.` }
    },
  },

  // ─── CITAS ───
  {
    name: 'crear_cita',
    desc: 'Agenda una cita/recordatorio (opcionalmente con un contacto).',
    params: '{ "titulo": string, "fechaISO": "2026-06-22T17:00:00", "contacto"?: string, "duracion"?: number, "tipo"?: "call|meeting|followup|task" }',
    run: async (a, ctx) => {
      const when = new Date(String(a.fechaISO || '')); if (isNaN(when.getTime())) return { summary: 'Fecha inválida (usa ISO, ej 2026-06-22T17:00:00).' }
      const contact = a.contacto ? await findContact(ctx.workspaceId, String(a.contacto)) : null
      const ap = await db.appointment.create({ data: { workspaceId: ctx.workspaceId, contactId: contact?.id || null, title: String(a.titulo || 'Cita'), date: when, duration: Number(a.duracion) || 30, type: String(a.tipo || 'meeting'), status: 'pending' } })
      return { summary: `Cita agendada: "${ap.title}"${contact ? ` con ${contactName(contact)}` : ''} para ${when.toLocaleString('es-MX')}.` }
    },
  },
  {
    name: 'citas_proximas',
    desc: 'Lista las próximas citas pendientes.',
    params: '{ "dias"?: number }',
    run: async (a, ctx) => {
      const days = Number(a.dias) || 14
      const appts = await db.appointment.findMany({ where: { workspaceId: ctx.workspaceId, status: 'pending', date: { gte: new Date(), lte: new Date(Date.now() + days * 86400000) } }, orderBy: { date: 'asc' }, take: 20, include: { contact: { select: { firstName: true, lastName: true } } } })
      if (!appts.length) return { summary: `No hay citas en los próximos ${days} días.` }
      return { summary: `Citas próximas:\n` + appts.map((ap) => `• ${new Date(ap.date).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${ap.title}${ap.contact ? ` (${contactName(ap.contact)})` : ''}`).join('\n') }
    },
  },

  // ─── REPORTES ───
  {
    name: 'reporte',
    desc: 'Reporte de actividad del negocio (qué ha pasado): contactos, mensajes, deals, ventas, leads, citas.',
    params: '{ "periodo"?: "hoy|7d|30d|90d" }',
    run: async (a, ctx) => {
      const { start, label } = periodStart(String(a.periodo || 'hoy')); const ws = ctx.workspaceId
      const [newC, msgs, dealsNew, dealsWon, active, hot, appts] = await Promise.all([
        db.contact.count({ where: { workspaceId: ws, createdAt: { gte: start } } }),
        db.message.count({ where: { conversation: { workspaceId: ws }, createdAt: { gte: start } } }).catch(() => 0),
        db.deal.count({ where: { workspaceId: ws, createdAt: { gte: start } } }),
        db.deal.count({ where: { workspaceId: ws, status: 'won', wonAt: { gte: start } } }),
        db.deal.aggregate({ where: { workspaceId: ws, status: 'active' }, _sum: { value: true }, _count: true }),
        db.contact.count({ where: { workspaceId: ws, OR: [{ temperature: 'hot' }, { leadScore: { gte: 70 } }] } }),
        db.appointment.count({ where: { workspaceId: ws, date: { gte: start } } }),
      ])
      return { summary: `📊 Reporte (${label}):\n• Contactos nuevos: ${newC}\n• Mensajes: ${msgs}\n• Deals nuevos: ${dealsNew} · ganados: ${dealsWon}\n• Pipeline activo: ${active._count} deals, ${money(active._sum.value || 0)}\n• Leads calientes: ${hot}\n• Citas en el periodo: ${appts}` }
    },
  },

  // ─── PIPELINE MASIVO ───
  {
    name: 'mover_varios_deals',
    desc: 'Mueve VARIOS deals a una misma etapa del pipeline de una sola vez.',
    params: '{ "deals": ["título o id", ...], "etapa": "nombre de etapa" }',
    run: async (a, ctx) => {
      const pl = await defaultPipeline(ctx.workspaceId); if (!pl) return { summary: 'No hay pipeline.' }
      const stage = pl.stages.find((s) => norm(s.name).includes(norm(String(a.etapa || ''))))
      if (!stage) return { summary: `No encontré la etapa "${a.etapa}". Etapas: ${pl.stages.map((s) => s.name).join(', ')}.` }
      const wanted = (Array.isArray(a.deals) ? a.deals : []) as string[]
      if (!wanted.length) return { summary: 'Indica los deals a mover.' }
      const all = await db.deal.findMany({ where: { workspaceId: ctx.workspaceId } })
      const out: string[] = []
      for (const q of wanted.slice(0, 30)) {
        const deal = all.find((d) => d.id === q) || all.find((d) => norm(d.title).includes(norm(String(q))))
        if (!deal) { out.push(`"${q}": no encontrado`); continue }
        await db.deal.update({ where: { id: deal.id }, data: { stageId: stage.id, ...(stage.isWon ? { status: 'won', wonAt: new Date() } : {}), ...(stage.isLost ? { status: 'lost', lostAt: new Date() } : {}) } })
        out.push(`${deal.title}: → ${stage.name}`)
      }
      return { summary: `Movidos a ${stage.name}:\n${out.map((x) => '• ' + x).join('\n')}` }
    },
  },

  // ─── MERCADO LIBRE ───
  {
    name: 'publicar_mercadolibre',
    desc: 'Publica un auto del inventario en Mercado Libre.',
    params: '{ "auto": "nombre o id" }',
    run: async (a, ctx) => {
      const conn = await loadConnection(ctx.workspaceId)
      if (!conn || conn.status !== 'connected') return { summary: 'Mercado Libre no está conectado. Conéctalo en el módulo Mercado Libre primero.' }
      const car = await db.catalogItem.findFirst({ where: { workspaceId: ctx.workspaceId, OR: [{ id: String(a.auto || '') }, { name: { contains: String(a.auto || '') } }] } })
      if (!car) return { summary: `No encontré el auto "${a.auto}".` }
      const exists = await db.meliListing.findFirst({ where: { workspaceId: ctx.workspaceId, catalogItemId: car.id } })
      if (exists) return { summary: `${car.name} ya tiene publicación en Mercado Libre${exists.permalink ? `: ${exists.permalink}` : ''}.` }
      let meta: Record<string, unknown> = {}; try { meta = JSON.parse(car.metadata || '{}') } catch { /* */ }
      const payload = vehicleToMeliItem({ name: car.name, price: car.price, currency: car.currency, category: car.category, description: car.description, imageUrl: car.imageUrl, metadata: meta }, conn.siteId)
      try {
        const created = await meliApi.createItem(conn, payload) as { id: string; permalink?: string; status?: string; price?: number; available_quantity?: number; thumbnail?: string }
        await db.meliListing.create({ data: { workspaceId: ctx.workspaceId, catalogItemId: car.id, meliItemId: created.id, permalink: created.permalink ?? null, title: car.name, status: created.status || 'active', price: created.price ?? car.price, availableQuantity: created.available_quantity ?? 1, thumbnail: created.thumbnail ?? car.imageUrl ?? null, lastSyncedAt: new Date(), raw: JSON.stringify(created) } })
        return { summary: `Publicado en Mercado Libre: ${car.name}${created.permalink ? ` — ${created.permalink}` : ''}.` }
      } catch (e) { return { summary: `No se pudo publicar ${car.name}: ${e instanceof Error ? e.message : 'error'}` } }
    },
  },
  {
    name: 'preguntas_mercadolibre',
    desc: 'Lista preguntas sin responder de tus publicaciones de Mercado Libre.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const conn = await loadConnection(ctx.workspaceId)
      if (!conn || conn.status !== 'connected') return { summary: 'Mercado Libre no está conectado.' }
      try {
        const res = await meliApi.questions(conn, 'UNANSWERED', Math.min(Number(a.limite) || 10, 25)) as { questions?: { id: number; text: string; item_id?: string }[] }
        const qs = res.questions || []
        if (!qs.length) return { summary: 'No hay preguntas sin responder en Mercado Libre. 🎉' }
        return { summary: `Preguntas sin responder:\n${qs.map((q) => `• [${q.id}] ${q.text}`).join('\n')}`, data: { ids: qs.map((q) => q.id) } }
      } catch (e) { return { summary: `No se pudieron cargar las preguntas: ${e instanceof Error ? e.message : 'error'}` } }
    },
  },
  {
    name: 'responder_pregunta_ml',
    desc: 'Responde una pregunta de Mercado Libre por su id.',
    params: '{ "preguntaId": number, "texto": string }',
    run: async (a, ctx) => {
      const conn = await loadConnection(ctx.workspaceId)
      if (!conn || conn.status !== 'connected') return { summary: 'Mercado Libre no está conectado.' }
      if (!a.preguntaId || !String(a.texto || '').trim()) return { summary: 'Indica el id de la pregunta y el texto de respuesta.' }
      try {
        await meliApi.answer(conn, String(a.preguntaId), String(a.texto))
        return { summary: `Respondida la pregunta ${a.preguntaId} en Mercado Libre.` }
      } catch (e) { return { summary: `No se pudo responder: ${e instanceof Error ? e.message : 'error'}` } }
    },
  },
  {
    name: 'publicaciones_mercadolibre',
    desc: 'Lista tus publicaciones (autos) en Mercado Libre con su estado.',
    params: '{}',
    run: async (_a, ctx) => {
      const list = await db.meliListing.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 30 })
      if (!list.length) return { summary: 'No tienes publicaciones en Mercado Libre todavía.' }
      return { summary: `Publicaciones en ML (${list.length}):\n` + list.map((l) => `• ${l.title} — ${l.status}${l.price ? ` ${money(l.price)}` : ''}${l.permalink ? ` (${l.permalink})` : ''}`).join('\n') }
    },
  },
  {
    name: 'ordenes_mercadolibre',
    desc: 'Lista las ventas/órdenes recientes de Mercado Libre.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const conn = await loadConnection(ctx.workspaceId)
      if (!conn || conn.status !== 'connected') return { summary: 'Mercado Libre no está conectado.' }
      try {
        const res = await meliApi.orders(conn, 0, Math.min(Number(a.limite) || 10, 25)) as { results?: { id: number; total_amount?: number; status?: string; buyer?: { nickname?: string } }[] }
        const ords = res.results || []
        if (!ords.length) return { summary: 'No hay órdenes en Mercado Libre.' }
        return { summary: `Órdenes recientes:\n` + ords.map((o) => `• #${o.id} — ${o.status}${o.total_amount ? ` ${money(o.total_amount)}` : ''}${o.buyer?.nickname ? ` (${o.buyer.nickname})` : ''}`).join('\n') }
      } catch (e) { return { summary: `No se pudieron cargar las órdenes: ${e instanceof Error ? e.message : 'error'}` } }
    },
  },

  // ─── CONVERSACIONES (responder con IA) ───
  {
    name: 'responder_conversacion',
    desc: 'Redacta con IA y ENVÍA una respuesta al último mensaje de un cliente (según el historial de la conversación).',
    params: '{ "contacto": "nombre/teléfono/id", "instruccion"?: "qué quieres responder/lograr" }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      const convo = await db.conversation.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' } })
      if (!convo) return { summary: `No hay conversación con ${contactName(c)}.` }
      const msgs = await db.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: 10 })
      if (!msgs.length) return { summary: `No hay mensajes con ${contactName(c)}.` }
      const hist = msgs.reverse().map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Nosotros'}: ${m.content}`).join('\n')
      const text = await aiDraft(
        'Eres un vendedor de autos profesional y cercano de AMAD Autos. Redacta UNA respuesta breve de WhatsApp al último mensaje del cliente, natural y útil. Devuelve SOLO el texto del mensaje, sin comillas.',
        `Conversación reciente:\n${hist}\n\n${a.instruccion ? `Indicación del gerente: ${a.instruccion}.` : ''} Redacta la respuesta para el cliente:`,
      )
      if (!text) return { summary: 'No pude redactar la respuesta (IA no disponible).' }
      const r = await sendWa(ctx, c, text)
      return { summary: r.ok ? `Respondí a ${contactName(c)}:\n"${text}"` : `Redacté la respuesta pero no se envió — ${r.info}\nTexto: "${text}"` }
    },
  },
  {
    name: 'reactivar_leads',
    desc: 'Reactiva la cartera: INSCRIBE a los contactos elegibles en la escalera de seguimiento AUTÓNOMA (mensaje personalizado por IA leyendo el historial de cada uno, espaciado anti-baneo ~cada 2 min, respeta horario nocturno y OMITE solo a quien ya compró / tiene cita / pidió no escribir / IA apagada). El motor trabaja solo por días. Úsala para "reactiva mi cartera", "reactiva todos los leads/contactos", "vuelve a contactar a los fríos". Con "limite" reactivas solo N. NO listes nombres: reporta el RESUMEN de conteos que devuelve.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const { enrollPortfolioReactivation } = await import('@/lib/ai/follow-up-engine')
      const limit = Number(a.limite) > 0 ? Number(a.limite) : undefined
      const r = await enrollPortfolioReactivation(ctx.workspaceId, { limit })
      if (r.enrolled === 0) {
        const why = Object.entries(r.reasons).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${v} ${k}`).join(', ')
        return { summary: `No inscribí a nadie nuevo. Revisé ${r.total} contacto(s)${why ? ` — omitidos: ${why}` : ''}. (Los que ya están en seguimiento activo no se duplican.)` }
      }
      const omit = Object.entries(r.reasons).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${v} ${k}`).join(', ')
      return {
        summary: `✅ Reactivación de cartera en marcha: inscribí ${r.enrolled} de ${r.total} contacto(s) en la escalera de seguimiento.` +
          (r.skipped > 0 ? ` Omití ${r.skipped}${omit ? ` (${omit})` : ''}.` : '') +
          ` El primer mensaje —personalizado por IA para cada uno— empieza a salir en breve, espaciado ~cada 2 min para no saturar WhatsApp (si es de noche, arranca mañana por la mañana). Si no responden, la escalera avanza sola por días. No hace falta que hagas nada más.`,
      }
    },
  },

  // ─── INVENTARIO (crear/detalle) ───
  {
    name: 'crear_auto',
    desc: 'Registra un auto nuevo en el inventario.',
    params: '{ "nombre"?: string, "marca"?: string, "modelo"?: string, "year"?: number, "precio"?: number, "km"?: number, "transmision"?: string, "combustible"?: string, "tipo"?: string }',
    run: async (a, ctx) => {
      const name = String(a.nombre || '').trim() || [a.marca, a.modelo, a.year].filter(Boolean).join(' ').trim()
      if (!name) return { summary: 'Indica al menos el nombre o marca/modelo del auto.' }
      const meta: Record<string, unknown> = { status: 'disponible' }
      for (const k of ['marca', 'modelo', 'transmision', 'combustible'] as const) if (a[k]) meta[k] = String(a[k])
      if (a.year) meta.year = String(a.year)
      if (a.km) meta.km = String(a.km)
      const car = await db.catalogItem.create({ data: { workspaceId: ctx.workspaceId, name, price: a.precio != null ? Number(a.precio) : null, currency: 'MXN', category: a.tipo ? String(a.tipo) : null, stock: 1, isActive: true, metadata: JSON.stringify(meta) } })
      return { summary: `Auto registrado: ${car.name}${a.precio != null ? ` (${money(Number(a.precio))})` : ''}.` }
    },
  },
  {
    name: 'detalle_auto',
    desc: 'Muestra la ficha completa de un auto del inventario.',
    params: '{ "auto": "nombre o id" }',
    run: async (a, ctx) => {
      const car = await db.catalogItem.findFirst({ where: { workspaceId: ctx.workspaceId, OR: [{ id: String(a.auto || '') }, { name: { contains: String(a.auto || '') } }] } })
      if (!car) return { summary: `No encontré "${a.auto}".` }
      const m = J(car.metadata)
      const specs = [m.year && `Año ${m.year}`, m.km && `${m.km} km`, m.transmision, m.combustible, m.carroceria, m.color || m.colorExterior, m.condicion].filter(Boolean).join(' · ')
      const ml = await db.meliListing.findFirst({ where: { workspaceId: ctx.workspaceId, catalogItemId: car.id } }).catch(() => null)
      return { summary: `${car.name} — ${money(car.price, car.currency)}\nEstatus: ${m.status || 'disponible'}${car.category ? ` · ${car.category}` : ''}\n${specs}${car.description ? `\n${car.description}` : ''}${ml ? `\nEn Mercado Libre: ${ml.status}` : ''}` }
    },
  },
  {
    name: 'nota_contacto',
    desc: 'Agrega una NOTA a la bitácora/expediente de un contacto. ÚSALA SIEMPRE que pidan "agrégale una nota", "anota que…", "apunta que…" sobre un contacto.',
    params: '{ "contacto": "nombre/teléfono/id", "nota": string }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || '')); if (!c) return { summary: `No encontré "${a.contacto}".` }
      if (!String(a.nota || '').trim()) return { summary: 'Indica la nota.' }
      await logTimelineEvent({ workspaceId: ctx.workspaceId, contactId: c.id, type: 'note', title: String(a.nota).slice(0, 280), source: 'human', importance: 'normal' })
      return { summary: `Nota agregada a ${contactName(c)}.` }
    },
  },

  // ─── INVESTIGACIÓN WEB (research agent) ───
  {
    name: 'investigar_web',
    desc: 'Investiga en INTERNET (precio de mercado de un auto, datos de un modelo, competencia, noticias, financiamiento de un banco). Úsalo cuando la respuesta NO esté en los datos internos.',
    params: '{ "consulta": "qué buscar" }',
    run: async (a) => {
      const q = String(a.consulta || a.query || a.tema || '').trim()
      if (!q) return { summary: 'Dime qué quieres que investigue en internet.' }
      // 1) Tavily (búsqueda para agentes) si el servidor tiene la clave configurada
      const TAVILY = process.env.TAVILY_API_KEY
      if (TAVILY) {
        try {
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: TAVILY, query: q, max_results: 5, include_answer: true }) })
          const j = await r.json()
          if (j?.answer || j?.results?.length) {
            const lines: string[] = []
            if (j.answer) lines.push('Resumen: ' + j.answer)
            for (const res of (j.results || []).slice(0, 5)) lines.push(`• ${res.title}: ${String(res.content || '').slice(0, 180)} (${res.url})`)
            return { summary: `🔎 Investigación web sobre "${q}":\n${lines.join('\n')}` }
          }
        } catch { /* fall through */ }
      }
      // 2) Fallback SIN clave: resultados reales de DuckDuckGo (HTML)
      try {
        const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
        const html = await r.text()
        const titles = [...html.matchAll(/result__a[^>]*>([^<]{5,140})</g)].map((m) => m[1].trim())
        const snips = [...html.matchAll(/result__snippet[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim().slice(0, 160))
        const lines: string[] = []
        for (let k = 0; k < Math.min(5, titles.length); k++) lines.push(`• ${titles[k]}${snips[k] ? ` — ${snips[k]}` : ''}`)
        if (lines.length) return { summary: `🔎 Investigación web sobre "${q}":\n${lines.join('\n')}\n\n(Fuente: búsqueda web. Verifica precios/datos antes de citarlos como oficiales.)` }
      } catch { /* */ }
      return { summary: `No pude completar la búsqueda web de "${q}" en este momento. Intenta reformular la consulta.` }
    },
  },

  // ─── ANALÍTICAS ───
  {
    name: 'analiticas',
    desc: 'Analíticas del negocio: embudo de conversión, tasa de cierre y fuentes de contactos.',
    params: '{}',
    run: async (_a, ctx) => {
      const ws = ctx.workspaceId
      const [pl, deals, contacts] = await Promise.all([
        defaultPipeline(ws),
        db.deal.findMany({ where: { workspaceId: ws }, select: { stageId: true, status: true } }),
        db.contact.findMany({ where: { workspaceId: ws }, select: { source: true } }),
      ])
      const won = deals.filter((d) => d.status === 'won').length
      const lost = deals.filter((d) => d.status === 'lost').length
      const closeRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0
      const funnel = pl ? pl.stages.map((s) => `${s.name}: ${deals.filter((d) => d.stageId === s.id).length}`).join(' → ') : 'n/d'
      const src: Record<string, number> = {}; for (const c of contacts) src[c.source || 'otro'] = (src[c.source || 'otro'] || 0) + 1
      const sources = Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(', ')
      return { summary: `📈 Analíticas:\n• Embudo: ${funnel}\n• Ganados: ${won} · Perdidos: ${lost} · Tasa de cierre: ${closeRate}%\n• Fuentes de contactos: ${sources}` }
    },
  },

  // ─── TELEGRAM (enviar al equipo) ───
  {
    name: 'enviar_telegram',
    desc: 'Envía un mensaje/reporte por Telegram al equipo del negocio (usuarios con Telegram vinculado). Úsalo cuando pidan "mándalo a Telegram".',
    params: '{ "texto": string }',
    run: async (a, ctx) => {
      const text = String(a.texto || '').trim(); if (!text) return { summary: 'Indica el texto a enviar por Telegram.' }
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      let token: string | undefined; try { token = JSON.parse(ws?.settings || '{}').telegramBotToken } catch { /* */ }
      token = token || process.env.TELEGRAM_BOT_TOKEN
      if (!token) return { summary: 'Telegram no está configurado. Conecta el bot en Configuración → Notificaciones (Telegram) y vincula tu chat.' }
      const linked = await db.workspaceMember.count({ where: { workspaceId: ctx.workspaceId, user: { telegramChatId: { not: null } } } }).catch(() => 0)
      if (!linked) return { summary: 'El bot de Telegram está configurado, pero nadie ha vinculado su chat aún. Vincula tu Telegram en Configuración → Notificaciones.' }
      await broadcastToWorkspace(ctx.workspaceId, text)
      return { summary: `Enviado por Telegram a ${linked} miembro(s) del equipo.` }
    },
  },

  // ─── MEMORIA / APRENDIZAJE ───
  {
    name: 'recordar',
    desc: 'Guarda en la memoria del copiloto un dato, preferencia o regla durable que el usuario quiere que recuerdes siempre.',
    params: '{ "nota": string, "tipo"?: "preference|fact|lesson|shortcut" }',
    run: async (a, ctx) => {
      const saved = await saveMemory(ctx.workspaceId, String(a.nota || ''), { kind: String(a.tipo || 'fact'), source: 'user' })
      return { summary: saved ? `Lo recordaré: "${String(a.nota).slice(0, 160)}"` : 'Ya lo tenía guardado (lo reforcé).' }
    },
  },
  {
    name: 'ver_memoria',
    desc: 'Muestra lo que el copiloto ha aprendido del negocio y del usuario.',
    params: '{}',
    run: async (_a, ctx) => {
      const mems = await loadMemories(ctx.workspaceId, 40)
      if (!mems.length) return { summary: 'Todavía no he aprendido nada guardado. Cuéntame tus preferencias o usa "recuerda que…".' }
      return { summary: 'Esto es lo que he aprendido:\n' + mems.map((m) => `• ${m.content}${m.source === 'user' ? ' (me lo pediste)' : ''}`).join('\n') }
    },
  },
  {
    name: 'olvidar',
    desc: 'Borra de la memoria los aprendizajes que coincidan con un texto.',
    params: '{ "texto": string }',
    run: async (a, ctx) => {
      const q = norm(String(a.texto || '')); if (!q) return { summary: 'Indica qué debo olvidar.' }
      const mems = await db.copilotMemory.findMany({ where: { workspaceId: ctx.workspaceId } })
      const hit = mems.filter((m) => norm(m.content).includes(q))
      if (!hit.length) return { summary: 'No encontré nada que coincida en mi memoria.' }
      await db.copilotMemory.deleteMany({ where: { id: { in: hit.map((m) => m.id) } } })
      return { summary: `Olvidé ${hit.length} aprendizaje(s) relacionado(s) con "${a.texto}".` }
    },
  },

  // ─── EXPORTAR ───
  {
    name: 'exportar',
    desc: 'Exporta datos a Excel (contactos o inventario) y devuelve el enlace de descarga.',
    params: '{ "que": "contactos|inventario" }',
    run: async (a, ctx) => {
      const what = String(a.que || 'contactos') === 'inventario' ? 'inventario' : 'contactos'
      const XLSX = await import('xlsx')
      let rows: Record<string, unknown>[] = []
      if (what === 'inventario') {
        const items = await db.catalogItem.findMany({ where: { workspaceId: ctx.workspaceId } })
        rows = items.map((i) => { const m = J(i.metadata); return { Nombre: i.name, Precio: i.price, Marca: m.marca || '', Modelo: m.modelo || '', Año: m.year || '', Km: m.km || '', Estatus: m.status || '' } })
      } else {
        const cs = await db.contact.findMany({ where: { workspaceId: ctx.workspaceId }, take: 5000 })
        rows = cs.map((c) => ({ Nombre: contactName(c), Telefono: c.phone || '', Email: c.email || '', Temperatura: c.temperature, Score: c.leadScore, Fuente: c.source }))
      }
      if (!rows.length) return { summary: `No hay ${what} para exportar.` }
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), what)
      const { mkdir, writeFile } = await import('fs/promises'); const path = (await import('path')).default
      const dir = path.join(process.cwd(), 'public', 'exports'); await mkdir(dir, { recursive: true })
      const file = `${what}-${Date.now()}.xlsx`
      await writeFile(path.join(dir, file), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
      return { summary: `Exporté ${rows.length} ${what}: ${ctx.base}/api/exports/${file}`, data: { url: `${ctx.base}/api/exports/${file}` } }
    },
  },

  // ═══ AGENT FACTORY: crear/listar/configurar/activar agentes IA ═══
  {
    name: 'listar_plantillas',
    desc: 'Lista las plantillas de agentes IA disponibles para crear (por defecto solo las que atienden clientes por WhatsApp).',
    params: '{ "todas"?: boolean }',
    run: async (a) => {
      const all = !!a.todas
      const list = TEMPLATE_REGISTRY.filter((t) => all || isConversationalVertical(t.vertical))
      if (!list.length) return { summary: 'No hay plantillas.' }
      const live = (v: string) => (isConversationalVertical(v) ? ' (atiende clientes)' : ' (back-office)')
      return { summary: `Plantillas disponibles (${list.length}):\n` + list.map((t) => `• ${t.name} [${t.vertical}]${all ? live(t.vertical) : ''} — ${t.description.slice(0, 70)}`).join('\n') }
    },
  },
  {
    name: 'crear_agente',
    desc: 'Crea y ACTIVA un agente IA en el Agent Factory a partir de una plantilla (por id, vertical o nombre). El agente queda activo y rutea por palabras clave. Ej: crear agente cotizador, de financiamiento, de seguimiento.',
    params: '{ "plantilla": "id/vertical/nombre (ej: cotizador, financiamiento, seguimiento)", "nombre"?: string, "tono"?: string, "palabrasClave"?: ["palabra","..."], "temperatura"?: number }',
    run: async (a, ctx) => {
      const base = findTemplate(String(a.plantilla || ''))
      if (!base) {
        const opc = TEMPLATE_REGISTRY.filter((t) => isConversationalVertical(t.vertical)).map((t) => t.vertical).join(', ')
        return { summary: `No encontré la plantilla "${a.plantilla}". Verticales que atienden clientes: ${opc}.` }
      }
      const tono = String(a.tono || '').trim()
      const systemPrompt = tono ? `${base.systemPrompt}\n\nTONO Y ESTILO: ${tono}` : base.systemPrompt
      // Keywords = SIEMPRE las del vertical (rutean de verdad) + extras del usuario
      // SOLO si son términos genéricos de 1 palabra (evita meter nombres como
      // "Jonathan Vega" que ningún cliente escribiría → el agente nunca rutearía).
      const vkws = defaultKeywordsForVertical(base.vertical)
      const extra = (Array.isArray(a.palabrasClave) ? (a.palabrasClave as unknown[]) : [])
        .map(String).map((k) => k.trim().toLowerCase())
        .filter((k) => /^[a-záéíóúñ]{3,20}$/.test(k)) // 1 palabra, sin espacios/números/nombres compuestos
      const kws = [...new Set([...vkws, ...extra])]
      const created = await db.agentInstance.create({
        data: {
          name: String(a.nombre || '').trim() || base.name,
          role: roleForVertical(base.vertical),
          vertical: base.vertical,
          scope: base.description || '',
          forbiddenActions: '[]',
          systemPrompt,
          tools: JSON.stringify(base.tools || []),
          keywords: JSON.stringify(kws),
          stageMatch: '[]',
          model: 'glm-4.5-flash',
          temperature: typeof a.temperatura === 'number' ? a.temperatura : 0.3,
          priority: 100,
          status: 'activo',
          templateId: null,
          workspaceId: ctx.workspaceId,
        },
      })
      invalidateAgentInstanceCache(ctx.workspaceId)
      const liveTxt = isConversationalVertical(base.vertical)
        ? `Atenderá automáticamente los mensajes que mencionen: ${kws.slice(0, 6).join(', ')}.`
        : 'Es un agente de back-office (no atiende WhatsApp directamente).'
      return { summary: `✅ Agente "${created.name}" creado y ACTIVO (vertical: ${base.vertical}). ${liveTxt}`, data: { id: created.id } }
    },
  },
  {
    name: 'listar_agentes',
    desc: 'Lista los agentes IA del Agent Factory de este negocio, con su estado (activo/pausado) y mensajes atendidos.',
    params: '{}',
    run: async (_a, ctx) => {
      const rows = await db.agentInstance.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' } })
      if (!rows.length) return { summary: 'No hay agentes creados aún. Usa "crear_agente" para crear uno.' }
      return { summary: `Agentes (${rows.length}):\n` + rows.map((r) => `• ${r.name} [${r.vertical}] — ${r.status === 'activo' ? '🟢 activo' : '⏸️ pausado'} · ${r.totalMessagesSent} msg atendidos`).join('\n') }
    },
  },
  {
    name: 'configurar_agente',
    desc: 'Configura un agente existente: pausarlo/activarlo, cambiar tono, palabras clave, temperatura o prioridad. Identifícalo por nombre o vertical.',
    params: '{ "agente": "nombre/vertical", "estado"?: "activo|pausado", "tono"?: string, "palabrasClave"?: ["..."], "temperatura"?: number, "prioridad"?: number }',
    run: async (a, ctx) => {
      const inst = await findAgent(ctx.workspaceId, String(a.agente || ''))
      if (!inst) return { summary: `No encontré el agente "${a.agente}". Usa "listar_agentes" para ver los nombres.` }
      const data: Record<string, unknown> = {}
      const changes: string[] = []
      if (a.estado === 'activo' || a.estado === 'pausado') { data.status = a.estado; changes.push(a.estado === 'activo' ? 'activado' : 'pausado') }
      if (typeof a.tono === 'string' && a.tono.trim()) {
        const bp = inst.systemPrompt.replace(/\n\nTONO Y ESTILO:[\s\S]*$/i, '')
        data.systemPrompt = `${bp}\n\nTONO Y ESTILO: ${a.tono.trim()}`; changes.push(`tono → "${a.tono.trim()}"`)
      }
      if (Array.isArray(a.palabrasClave)) { data.keywords = JSON.stringify((a.palabrasClave as unknown[]).map(String)); changes.push('palabras clave actualizadas') }
      if (typeof a.temperatura === 'number') { data.temperature = a.temperatura; changes.push(`temperatura → ${a.temperatura}`) }
      if (typeof a.prioridad === 'number') { data.priority = a.prioridad; changes.push(`prioridad → ${a.prioridad}`) }
      if (!Object.keys(data).length) return { summary: 'No indicaste qué cambiar (estado, tono, palabrasClave, temperatura o prioridad).' }
      await db.agentInstance.update({ where: { id: inst.id }, data })
      invalidateAgentInstanceCache(ctx.workspaceId)
      return { summary: `✅ Agente "${inst.name}" actualizado: ${changes.join('; ')}.` }
    },
  },
  {
    name: 'eliminar_agente',
    desc: 'Elimina un agente IA del Agent Factory (por nombre o vertical). Acción irreversible.',
    params: '{ "agente": "nombre/vertical" }',
    run: async (a, ctx) => {
      const inst = await findAgent(ctx.workspaceId, String(a.agente || ''))
      if (!inst) return { summary: `No encontré el agente "${a.agente}".` }
      await db.agentInstance.delete({ where: { id: inst.id } })
      invalidateAgentInstanceCache(ctx.workspaceId)
      return { summary: `🗑️ Agente "${inst.name}" eliminado.` }
    },
  },
  {
    name: 'control_agentes',
    desc: 'Enciende o apaga GLOBALMENTE el ruteo del Agent Factory (kill-switch). Si lo apagas, atiende solo el vendedor base (JHON).',
    params: '{ "activar": boolean }',
    run: async (a, ctx) => {
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const s = J(ws?.settings || '{}'); s.agentFactoryEnabled = !!a.activar
      await db.workspace.update({ where: { id: ctx.workspaceId }, data: { settings: JSON.stringify(s) } })
      return { summary: a.activar ? '🟢 Agent Factory ENCENDIDO: los agentes especialistas ya rutean.' : '⏸️ Agent Factory APAGADO: atiende solo el vendedor base.' }
    },
  },

  // ═══ DEMO / SIMULACIÓN: probar al bot como si fueras un cliente ═══
  {
    name: 'simular_cliente',
    desc: 'Simula que un CLIENTE escribe un mensaje al bot y devuelve la respuesta que daría — para demos y pruebas, SIN enviar nada por WhatsApp ni tocar clientes reales.',
    params: '{ "mensaje": "lo que escribiría el cliente (ej: Hola, precio de la Creta 2024)" }',
    run: async (a, ctx) => {
      const mensaje = String(a.mensaje || '').trim()
      if (!mensaje) return { summary: 'Dime qué escribiría el cliente para simularlo.' }
      const r = await processMessageCore({
        text: mensaje,
        phone: 'demo-simulador',
        pushName: 'Cliente Demo',
        channel: 'webchat',
        workspaceId: ctx.workspaceId,
        skipMessageSave: true,
      })
      const reply = r.aiReplyText || '(el bot no generó respuesta)'
      const routed = r.engineResult?.agentRouting ? ` · atendió: ${r.engineResult.agentRouting.agentType}` : ''
      return { summary: `🧪 DEMO (no se envió nada real)\n👤 Cliente: "${mensaje}"\n🤖 Bot: ${reply}${routed}` }
    },
  },

  // ═══ CONEXIÓN DE CANALES ═══
  {
    name: 'estado_whatsapp',
    desc: 'Dice si WhatsApp está conectado y con qué número.',
    params: '{}',
    run: async (_a, ctx) => {
      const st = getWhatsAppManager(ctx.workspaceId).getStatus()
      if (st.connected) return { summary: `🟢 WhatsApp conectado${st.phone ? ` con el número ${st.phone}` : ''}.` }
      if (st.connecting) return { summary: '🟡 WhatsApp conectándose: hay un código QR esperando. Ve a Configuración → Conexiones para escanearlo.' }
      return { summary: '🔴 WhatsApp NO está conectado. Pídeme "conecta WhatsApp" o ve a Configuración → Conexiones.' }
    },
  },
  {
    name: 'conectar_whatsapp',
    desc: 'Inicia la conexión de WhatsApp y genera un código QR para escanear. El QR se escanea en Configuración → Conexiones (expira en 60s).',
    params: '{}',
    run: async (_a, ctx) => {
      const mgr = getWhatsAppManager(ctx.workspaceId)
      const st = await mgr.start(false)
      if (st.connected) return { summary: `🟢 WhatsApp ya está conectado${st.phone ? ` (${st.phone})` : ''}. No necesitas hacer nada.` }
      return { summary: '📲 Inicié la conexión de WhatsApp. Abre **Configuración → Conexiones**, ahí aparecerá el **código QR**; escanéalo desde tu teléfono (WhatsApp → Dispositivos vinculados). El QR expira en ~60s; si caduca, pídeme reconectar. Cuando termines, dime "estado de WhatsApp" para confirmar.' }
    },
  },

  // ═══ CONFIGURACIÓN DEL NEGOCIO ═══
  {
    name: 'configurar_negocio',
    desc: 'Configura datos del negocio que usa el bot: horario de atención, dirección, teléfono, zona horaria y enlace para agendar citas.',
    params: '{ "horario"?: "Lun-Vie 9am-7pm", "direccion"?: string, "telefono"?: string, "zonaHoraria"?: "America/Mexico_City", "urlCitas"?: string }',
    run: async (a, ctx) => {
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const s = J(ws?.settings || '{}')
      const ch: string[] = []
      if (a.horario) { s.businessHours = String(a.horario); ch.push(`horario: ${a.horario}`) }
      if (a.direccion) { s.businessAddress = String(a.direccion); ch.push(`dirección: ${a.direccion}`) }
      if (a.telefono) { s.businessPhone = String(a.telefono); ch.push(`teléfono: ${a.telefono}`) }
      if (a.zonaHoraria) { s.timezone = String(a.zonaHoraria); ch.push(`zona horaria: ${a.zonaHoraria}`) }
      if (a.urlCitas) { s.appointmentUrl = String(a.urlCitas); ch.push('enlace de citas') }
      if (!ch.length) return { summary: 'No indicaste qué configurar (horario, dirección, teléfono, zonaHoraria o urlCitas).' }
      await db.workspace.update({ where: { id: ctx.workspaceId }, data: { settings: JSON.stringify(s) } })
      return { summary: `✅ Configuración del negocio actualizada → ${ch.join(' · ')}.` }
    },
  },
  {
    name: 'configurar_tono',
    desc: 'Cambia el TONO y estilo del vendedor base del bot (ej: "formal pero cercano", "experto", "súper amigable y juvenil"). Afecta a JHON, el vendedor por defecto.',
    params: '{ "tono": "descripción del tono/estilo deseado" }',
    run: async (a, ctx) => {
      const tono = String(a.tono || '').trim()
      if (!tono) return { summary: 'Dime el tono que quieres (ej: "formal pero cercano").' }
      const mod = await db.workspaceModule.findFirst({ where: { workspaceId: ctx.workspaceId, moduleType: 'agent_profile' } })
      const cfg = mod ? J(mod.config) : {}
      cfg.tone = tono
      if (mod) await db.workspaceModule.update({ where: { id: mod.id }, data: { config: JSON.stringify(cfg), enabled: true } })
      else await db.workspaceModule.create({ data: { workspaceId: ctx.workspaceId, moduleType: 'agent_profile', enabled: true, config: JSON.stringify(cfg) } })
      return { summary: `✅ Tono del vendedor actualizado a: "${tono}". Aplica desde el próximo mensaje. Puedes probarlo con "simula un cliente".` }
    },
  },

  // ═══ IMPORTAR INVENTARIO (Google Sheets / Drive / CSV / JSON / enlace) ═══
  {
    name: 'importar_inventario',
    desc: 'Importa autos al inventario en lote desde un enlace de Google Sheets/Drive/CSV o desde texto pegado (CSV/JSON). La IA mapea las columnas y crea los autos.',
    params: '{ "enlace"?: "https://docs.google.com/...", "texto"?: "csv o json con los autos" }',
    run: async (a, ctx) => {
      const enlace = String(a.enlace || '').trim()
      const texto = String(a.texto || '').trim()
      if (!enlace && !texto) return { summary: 'Pásame el enlace de Google Sheets/Drive/CSV o pega el texto (CSV/JSON) con los autos a importar.' }
      let payload: { kind: 'rows'; headers: string[]; rows: Record<string, unknown>[] } | { kind: 'text'; text: string }
      let origen = 'texto'
      try {
        if (enlace) {
          if (!/^https?:\/\//i.test(enlace)) return { summary: 'El enlace no es válido (debe empezar con http/https).' }
          const { downloadUrl, kind } = resolveGoogleUrl(enlace)
          const res = await fetch(downloadUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 ValiAutoFlow' } }).catch(() => null)
          if (!res || !res.ok) return { summary: `No pude descargar el archivo del enlace (${res?.status ?? 'sin respuesta'}). Compártelo como "cualquiera con el enlace".` }
          const text = await res.text()
          if (/<!DOCTYPE html|<html/i.test(text.slice(0, 200)) && kind !== 'raw') return { summary: 'El enlace no es público. Compártelo como "cualquiera con el enlace" e intenta de nuevo.' }
          payload = textToImportPayload(text, kind === 'sheet')
          origen = kind === 'sheet' ? 'Google Sheets' : kind === 'drive' ? 'Google Drive' : 'enlace'
        } else {
          payload = textToImportPayload(texto)
        }
        const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
        const s = J(ws?.settings || '{}'); const keys = (s.apiKeys as Record<string, string>) || {}
        const ai = { provider: (s.apiProvider as string) || 'glm', apiKey: keys[(s.apiProvider as string)] || keys.glm || undefined }
        const prev = await processInventoryImport(payload, ai)
        const valid = (prev.records as NormalizedVehicle[]).filter((r) => r && r.name && String(r.name).trim())
        if (!valid.length) return { summary: 'No detecté autos válidos en el origen. Asegúrate de que tenga columnas como marca, modelo, precio, año, km.' }
        await db.catalogItem.createMany({
          data: valid.map((r) => ({
            workspaceId: ctx.workspaceId,
            name: String(r.name).trim().slice(0, 255),
            description: r.description ? String(r.description).slice(0, 5000) : null,
            price: typeof r.price === 'number' ? r.price : null,
            currency: r.currency || 'MXN',
            category: r.category || null,
            stock: typeof r.stock === 'number' ? r.stock : null,
            isActive: r.isActive !== false,
            imageUrl: r.imageUrl || null,
            metadata: JSON.stringify({ ...(r.metadata || {}), status: r.status || 'disponible', ...(r.extra && r.extra.length ? { extra: r.extra } : {}) }),
          })),
        })
        const warn = prev.warnings?.length ? `\n⚠️ ${prev.warnings.slice(0, 3).join(' ')}` : ''
        return { summary: `✅ Importé ${valid.length} auto(s) al inventario desde ${origen}.${warn}` }
      } catch (e) {
        return { summary: `No pude importar: ${e instanceof Error ? e.message : 'error desconocido'}` }
      }
    },
  },

  // ═══ MÉTRICAS POR AGENTE ═══
  {
    name: 'metricas_agentes',
    desc: 'Muestra el rendimiento por agente del Agent Factory: mensajes atendidos, CITAS generadas y VENTAS atribuidas a cada uno, estado y participación. Para saber qué agente realmente produce resultados.',
    params: '{}',
    run: async (_a, ctx) => {
      const rows = await db.agentInstance.findMany({ where: { workspaceId: ctx.workspaceId } })
      if (!rows.length) return { summary: 'No hay agentes creados. Crea uno con "crear_agente".' }
      const total = rows.reduce((s, r) => s + (r.totalMessagesSent || 0), 0)
      const totalCitas = rows.reduce((s, r) => s + (r.citasGeneradas || 0), 0)
      const totalVentas = rows.reduce((s, r) => s + (r.ventasAtribuidas || 0), 0)
      const activos = rows.filter((r) => r.status === 'activo').length
      const sorted = [...rows].sort((a, b) =>
        (b.ventasAtribuidas || 0) - (a.ventasAtribuidas || 0) ||
        (b.citasGeneradas || 0) - (a.citasGeneradas || 0) ||
        (b.totalMessagesSent || 0) - (a.totalMessagesSent || 0))
      const lines = sorted.map((r) => {
        const n = r.totalMessagesSent || 0
        const pct = total > 0 ? ` (${Math.round((n / total) * 100)}%)` : ''
        const resultados = `${r.citasGeneradas ? ` · 📅 ${r.citasGeneradas} cita(s)` : ''}${r.ventasAtribuidas ? ` · 💰 ${r.ventasAtribuidas} venta(s)` : ''}`
        return `• ${r.name} [${r.vertical}] — ${r.status === 'activo' ? '🟢' : '⏸️'} ${n} msg${pct}${resultados}`
      })
      return { summary: `📊 Métricas por agente (${rows.length} agentes, ${activos} activos · ${total} mensajes · 📅 ${totalCitas} citas · 💰 ${totalVentas} ventas atribuidas):\n${lines.join('\n')}${total === 0 ? '\n\n(Aún sin mensajes atendidos por los agentes especialistas; las cuentas suben cuando un agente rutea un mensaje entrante.)' : ''}` }
    },
  },

  // ═══ DEMO DE UN CLIC + COMPARTIR ═══
  {
    name: 'crear_demo',
    desc: 'Crea una DEMO en vivo para una industria (florería, inmobiliaria, restaurante, gym, clínica, etc.): instancia un agente vendedor ajustado a ese giro, listo para mostrarle a un prospecto. Luego pruébalo con "simular_cliente" o compártelo con "compartir_demo".',
    params: '{ "industria": "florería / inmobiliaria / restaurante / etc.", "negocio"?: "nombre del negocio", "nombre"?: "nombre del agente" }',
    run: async (a, ctx) => {
      const industria = String(a.industria || '').trim()
      if (!industria) return { summary: '¿Para qué industria armo la demo? (ej: florería, inmobiliaria, restaurante).' }
      const negocio = String(a.negocio || '').trim() || `Demo ${industria}`
      const persona = buildIndustryPersona(industria, negocio)
      const cfg = getIndustryConfig(industria)
      // keywords amplias para que el agente realmente atienda en la demo
      const kws = ['hola', 'informacion', 'precio', 'cuanto cuesta', 'cotizacion', cfg.productSingular, cfg.productPlural.split(' ')[0]].filter(Boolean).map(String)
      const created = await db.agentInstance.create({
        data: {
          name: String(a.nombre || '').trim() || `Demo · ${cfg.label}`,
          role: 'CLOSER', vertical: 'ventas', scope: `Demo de ${cfg.label}`,
          forbiddenActions: '[]', systemPrompt: persona, tools: '[]',
          keywords: JSON.stringify(kws), stageMatch: '[]', model: 'glm-4.5-flash',
          temperature: 0.5, priority: 200, status: 'activo', templateId: null, workspaceId: ctx.workspaceId,
        },
      })
      invalidateAgentInstanceCache(ctx.workspaceId)
      const ej = [`¿Qué ${cfg.productPlural.split(' ')[0]} tienen?`, '¿Cuánto cuesta?', `Quiero ${cfg.cta}`]
      return { summary: `✅ Demo de ${cfg.label} lista: agente "${created.name}" activo (rol ${cfg.agentRole}).\nPruébala ya con "simula un cliente: ${ej[0]}" — o dime "comparte la demo" para enviar el enlace al prospecto.\nIdeas para demostrar: ${ej.map((e) => `"${e}"`).join(', ')}.`, data: { id: created.id } }
    },
  },
  {
    name: 'compartir_demo',
    desc: 'Genera un enlace de WhatsApp (wa.me) al número conectado para que un prospecto chatee EN VIVO con el agente y vea la demo. Úsalo tras crear/activar el agente.',
    params: '{ "mensaje"?: "texto inicial sugerido para el prospecto" }',
    run: async (a, ctx) => {
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const s = J(ws?.settings || '{}')
      const phone = String(s.connectedPhone || s.businessPhone || '').replace(/\D/g, '')
      if (!phone) return { summary: 'Aún no hay WhatsApp conectado. Pídeme "conecta WhatsApp" primero y luego comparto la demo.' }
      const msg = String(a.mensaje || '').trim() || 'Hola, vi su negocio y quiero información 😊'
      const link = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      return { summary: `📲 Comparte esta demo en vivo con tu prospecto — al abrir el enlace chatea directo con el agente por WhatsApp:\n${link}\n\nReenvíaselo o pégalo en tu mensaje. El agente le responderá como si fuera tu equipo.`, data: { link } }
    },
  },

  // ═══ CAMBIAR PLANTILLA / VERTICAL DE UN AGENTE EXISTENTE ═══
  {
    name: 'cambiar_plantilla_agente',
    desc: 'Cambia la plantilla/vertical de un agente YA creado (ej: "cambia el agente X a bienes raíces"). Re-aplica el prompt, rol y palabras clave de la nueva plantilla, conservando el agente.',
    params: '{ "agente": "nombre/vertical actual", "plantilla": "nueva plantilla/vertical (ej: seguros, financiamiento, cotizador)" }',
    run: async (a, ctx) => {
      const inst = await findAgent(ctx.workspaceId, String(a.agente || ''))
      if (!inst) return { summary: `No encontré el agente "${a.agente}". Usa "listar_agentes".` }
      const base = findTemplate(String(a.plantilla || ''))
      if (!base) {
        const opc = TEMPLATE_REGISTRY.filter((t) => isConversationalVertical(t.vertical)).map((t) => t.vertical).join(', ')
        return { summary: `No encontré la plantilla "${a.plantilla}". Verticales que atienden clientes: ${opc}.` }
      }
      await db.agentInstance.update({
        where: { id: inst.id },
        data: {
          vertical: base.vertical, role: roleForVertical(base.vertical), scope: base.description || inst.scope,
          systemPrompt: base.systemPrompt, tools: JSON.stringify(base.tools || []),
          keywords: JSON.stringify(defaultKeywordsForVertical(base.vertical)),
        },
      })
      invalidateAgentInstanceCache(ctx.workspaceId)
      const live = isConversationalVertical(base.vertical) ? 'Atiende clientes por WhatsApp.' : 'Es de back-office (no atiende WhatsApp directo).'
      return { summary: `✅ Agente "${inst.name}" cambiado a la plantilla ${base.name} [${base.vertical}]. ${live}` }
    },
  },

  // ═══ gBRAIN: base de conocimiento unificada (vista) ═══
  {
    name: 'ver_gbrain',
    desc: 'Muestra el "gBrain": la base de conocimiento del negocio que alimenta a los agentes — catálogo, tono/persona, datos y políticas del negocio, lecciones aprendidas y agentes activos. Para saber qué sabe la IA.',
    params: '{}',
    run: async (_a, ctx) => {
      const [items, ws, mod, lessons, agents] = await Promise.all([
        db.catalogItem.count({ where: { workspaceId: ctx.workspaceId } }),
        db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true, name: true } }),
        db.workspaceModule.findFirst({ where: { workspaceId: ctx.workspaceId, moduleType: 'agent_profile' } }),
        db.aiTrainingExample.count({ where: { workspaceId: ctx.workspaceId, isActive: true } }).catch(() => 0),
        db.agentInstance.count({ where: { workspaceId: ctx.workspaceId, status: 'activo' } }),
      ])
      const s = J(ws?.settings || '{}')
      const tono = (mod ? J(mod.config).tone : '') || (s.customSystemPrompt ? 'prompt personalizado' : 'por defecto')
      const negocio = [s.businessHours && `horario: ${s.businessHours}`, s.businessAddress && 'dirección ✓', s.businessPhone && `tel: ${s.businessPhone}`, s.timezone && `zona: ${s.timezone}`].filter(Boolean).join(' · ') || 'sin configurar'
      return {
        summary: `🧠 gBrain de ${ws?.name || 'tu negocio'} (lo que saben tus agentes):\n` +
          `• 📦 Catálogo: ${items} producto(s)/auto(s)\n` +
          `• 🎙️ Tono/persona: ${tono}\n` +
          `• 🏢 Datos del negocio: ${negocio}\n` +
          `• 📚 Lecciones aprendidas (entrenamiento): ${lessons}\n` +
          `• 🤖 Agentes activos conectados: ${agents}\n\n` +
          `Para alimentarlo: "importa inventario…", "cambia el tono a…", "configura el horario…", o corrige a la IA desde el inbox/Playground.`,
      }
    },
  },

  // ═══ META ADS: campañas pagadas SIEMPRE en pausa + aprobación Telegram ═══
  {
    name: 'crear_campana_ads',
    desc: 'Crea una CAMPAÑA DE PUBLICIDAD PAGADA en Meta Ads (Facebook/Instagram) usando un auto del inventario como creativo, con tráfico a WhatsApp. SIEMPRE se crea EN PAUSA (no gasta nada) y requiere aprobación por Telegram para activarse. Presupuesto diario en MXN (mín $50).',
    params: '{ "presupuestoDiario": 150, "auto"?: "nombre o id del auto", "nombre"?: "nombre de la campaña" }',
    run: async (a, ctx) => {
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const creds = readAdsCreds(ws?.settings)
      if (!canRunAds(creds)) return { summary: 'Faltan credenciales de Ads (token de sistema con ads_management + Ad Account act_… + página conectada). Configúralas primero.' }
      const budget = Number(a.presupuestoDiario) || 0
      if (budget < 50) return { summary: 'Indica un presupuesto diario de al menos $50 MXN (ej. presupuestoDiario: 150).' }
      const car = a.auto
        ? await findCar(ctx.workspaceId, String(a.auto))
        : await db.catalogItem.findFirst({ where: { workspaceId: ctx.workspaceId, isActive: true }, orderBy: { createdAt: 'desc' } })
      if (!car) return { summary: 'No hay autos en el inventario para usar como creativo.' }
      const name = String(a.nombre || `Campaña ${car.name}`).slice(0, 80)
      const image = `${ctx.base}/api/marketing/render?workspaceId=${ctx.workspaceId}&carId=${car.id}&format=feed&template=clasica`
      let phone = ''
      try { const st = getWhatsAppManager(ctx.workspaceId).getStatus() as { connectedPhone?: string | null }; phone = st?.connectedPhone || '' } catch { /* sin tel */ }
      const link = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com')
      const r = await createPausedCampaign({ creds, name, dailyBudgetMXN: budget, linkUrl: link, message: `${car.name} — pregunta por él ahora por WhatsApp.`, imageUrl: image })
      await broadcastToWorkspace(ctx.workspaceId,
        `📢 <b>Campaña de Ads creada EN PAUSA</b> (aún no gasta nada)\n\n📋 ${name}\n🚘 ${car.name}\n💵 $${budget} MXN/día\n🔗 ${link}\n\n▶️ Activarla empieza a gastar el presupuesto. ¿Qué hacemos?`,
        { inline_keyboard: [[{ text: '▶️ Activar campaña', callback_data: `ad:on:${r.campaignId}` }, { text: '🗑️ Eliminar', callback_data: `ad:del:${r.campaignId}` }]] }
      ).catch(() => {})
      return { summary: `📢 Campaña "${name}" creada EN PAUSA ($${budget} MXN/día, destino ${link}). Te llegó a Telegram para ACTIVARLA o eliminarla — no gastará ni un peso hasta que la apruebes.`, data: r }
    },
  },

  // ═══ EDITAR PROMPT COMPLETO de un agente o del vendedor base (JHON) ═══
  {
    name: 'editar_prompt_agente',
    desc: 'Edita/cambia/reescribe el PROMPT o instrucciones de un agente (del Agent Factory o el vendedor base como JHON). ÚSALA SIEMPRE que el usuario pida AGREGAR/AÑADIR una instrucción o regla al prompt, cambiar cómo se comporta/responde, o reescribir su personalidad. NO confundir con configurar_agente (eso es solo tono/keywords/estado). modo "agregar" añade la instrucción al final; "reemplazar" cambia todo el prompt.',
    params: '{ "agente": "nombre/vertical/slug (ej: JHON, cotizador)", "prompt": "el nuevo prompt o la instrucción a agregar", "modo"?: "reemplazar|agregar" }',
    run: async (a, ctx) => {
      const nuevo = String(a.prompt || '').trim()
      if (!nuevo) return { summary: 'Dime el nuevo prompt o la instrucción que quieres ponerle al agente.' }
      // SEGURIDAD (2026-07-21): default AGREGAR, no reemplazar. Reemplazar borra
      // TODO el prompt del vendedor — un llamado accidental destruyó la persona
      // JHON. Solo se reemplaza si el usuario lo pide EXPLÍCITAMENTE (modo:reemplazar).
      const agregar = String(a.modo || 'agregar') !== 'reemplazar'
      // 1) Agente del Agent Factory (AgentInstance)
      const inst = await findAgent(ctx.workspaceId, String(a.agente || ''))
      if (inst) {
        const finalPrompt = agregar ? `${inst.systemPrompt.trim()}\n\n${nuevo}` : nuevo
        await db.agentInstance.update({ where: { id: inst.id }, data: { systemPrompt: finalPrompt } })
        invalidateAgentInstanceCache(ctx.workspaceId)
        return { summary: `✅ Prompt de "${inst.name}" ${agregar ? 'ampliado' : 'reemplazado'} (${finalPrompt.length} caracteres). Ya aplica en los próximos mensajes.` }
      }
      // 2) Persona base / vendedor (AgentPersona, ej: JHON)
      const q = String(a.agente || '').trim()
      const personas = await db.agentPersona.findMany({ where: { workspaceId: ctx.workspaceId } })
      const persona = personas.find((p) => norm(p.slug) === norm(q) || norm(p.name).includes(norm(q))) || personas.find((p) => p.isDefault) || null
      if (!persona) return { summary: `No encontré el agente "${a.agente}". Usa "listar_agentes" o indica el slug del vendedor (ej: JHON).` }
      const finalPrompt = agregar ? `${(persona.systemPrompt || '').trim()}\n\n${nuevo}` : nuevo
      await db.agentPersona.update({ where: { id: persona.id }, data: { systemPrompt: finalPrompt } })
      invalidatePersonalityCache(ctx.workspaceId)
      return { summary: `✅ Prompt del vendedor "${persona.name}" (${persona.slug}) ${agregar ? 'ampliado' : 'reemplazado'} (${finalPrompt.length} caracteres). Aplica en el próximo mensaje.` }
    },
  },

  // ═══ DIAGNÓSTICO del Revenue Engine (solo lectura) ═══
  {
    name: 'diagnosticar_lead',
    desc: 'Diagnostica el motor de conversión: si das un lead (nombre/teléfono) explica su score, temperatura y por qué no avanza, con acciones sugeridas. Sin lead, da un diagnóstico GENERAL del workspace (distribución de temperatura, leads estancados, cuellos de botella). Solo lee, no cambia reglas.',
    params: '{ "lead"?: "nombre o teléfono (opcional)" }',
    run: async (a, ctx) => {
      const ws = ctx.workspaceId
      const tempLabel = (t: string) => t === 'hot' ? '🔥 caliente' : t === 'warm' ? '🌤️ tibio' : '❄️ frío'
      const daysSince = (d: Date | null) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null

      // ── Diagnóstico de un LEAD específico ──
      if (String(a.lead || '').trim()) {
        const c = await findContact(ws, String(a.lead))
        if (!c) return { summary: `No encontré el lead "${a.lead}".` }
        const full = await db.contact.findUnique({ where: { id: c.id }, select: { lastMessageAt: true, createdAt: true, customFields: true } })
        const deal = await db.deal.findFirst({ where: { workspaceId: ws, contactId: c.id }, orderBy: { updatedAt: 'desc' }, include: { stage: { select: { name: true, isWon: true, isLost: true } } } })
        const aiOff = (() => { try { return !!(JSON.parse(full?.customFields || '{}').aiDisabled) } catch { return false } })()
        const idle = daysSince(full?.lastMessageAt ?? null)
        const temp = c.temperature || 'cold'
        const reasons: string[] = []
        const actions: string[] = []
        if (c.leadScore < 30) { reasons.push('score bajo (<30): poca señal de compra detectada en la conversación'); actions.push('hazle preguntas de calificación (presupuesto, urgencia, modelo de interés)') }
        else if (c.leadScore < 70) { reasons.push('score medio (30-69): interesado pero sin señales fuertes de cierre'); actions.push('ofrécele una demo/cita o una cotización concreta para subir la temperatura') }
        if (temp === 'hot' && idle != null && idle >= 1) { reasons.push(`está CALIENTE pero lleva ${idle} día(s) sin contacto — riesgo de enfriarse`); actions.push('contáctalo HOY: es de máxima prioridad') }
        if (aiOff) { reasons.push('la IA está DESACTIVADA para este contacto → el bot no le responde'); actions.push('reactiva la IA si quieres que el bot le dé seguimiento') }
        if (!c.phone) { reasons.push('no tiene teléfono → no se le puede dar seguimiento por WhatsApp'); actions.push('consigue/corrige su teléfono') }
        if (deal?.stage?.isWon) reasons.push('su trato ya está GANADO ✅')
        else if (deal?.stage?.isLost) { reasons.push('su trato está marcado como PERDIDO'); actions.push('si sigue interesado, reactívalo o crea un nuevo trato') }
        else if (deal) reasons.push(`trato en etapa "${deal.stage?.name}"`)
        else { reasons.push('no tiene trato en el pipeline'); actions.push('créale un trato para darle seguimiento estructurado') }
        if (idle != null && idle >= 7 && temp !== 'cold') { reasons.push(`${idle} días sin interacción → seguimiento detenido`); actions.push('manda un mensaje de reactivación') }
        return {
          summary: `🧭 Diagnóstico de ${contactName(c)}:\n` +
            `• Score: ${c.leadScore}/100 → ${tempLabel(temp)}\n` +
            `• Estado: ${c.status}${deal?.stage ? ` · trato: ${deal.stage.name}` : ' · sin trato'}${idle != null ? ` · ${idle} día(s) sin mensaje` : ''}\n` +
            `• Por qué está así:\n${reasons.map((r) => `   - ${r}`).join('\n')}\n` +
            (actions.length ? `• Qué hacer:\n${actions.map((x) => `   → ${x}`).join('\n')}` : '• Va bien, sin acciones urgentes.'),
        }
      }

      // ── Diagnóstico GENERAL del workspace ──
      const [byTemp, totalActive, stuck, hotIdle, noPhone, aiOff] = await Promise.all([
        db.contact.groupBy({ by: ['temperature'], where: { workspaceId: ws, status: 'active' }, _count: true }),
        db.contact.count({ where: { workspaceId: ws, status: 'active' } }),
        db.contact.count({ where: { workspaceId: ws, status: 'active', OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: new Date(Date.now() - 7 * 86400000) } }] } }),
        db.contact.count({ where: { workspaceId: ws, status: 'active', temperature: 'hot', lastMessageAt: { lt: new Date(Date.now() - 86400000) } } }),
        db.contact.count({ where: { workspaceId: ws, status: 'active', OR: [{ phone: null }, { phone: '' }] } }),
        db.contact.count({ where: { workspaceId: ws, customFields: { contains: '"aiDisabled":true' } } }),
      ])
      const tcount = (t: string) => byTemp.find((r) => r.temperature === t)?._count || 0
      const hot = tcount('hot'), warm = tcount('warm'), cold = tcount('cold')
      const bottlenecks: string[] = []
      if (hotIdle > 0) bottlenecks.push(`🔥 ${hotIdle} lead(s) CALIENTE(s) sin contactar en 24h → los estás dejando enfriar (lo más urgente)`)
      if (stuck > 0) bottlenecks.push(`⏳ ${stuck} lead(s) activos sin interacción en 7+ días → seguimiento detenido (usa reactivación)`)
      if (noPhone > 0) bottlenecks.push(`📵 ${noPhone} lead(s) sin teléfono → imposible darles seguimiento por WhatsApp`)
      if (aiOff > 0) bottlenecks.push(`🤖 ${aiOff} contacto(s) con la IA apagada → el bot no responde ahí`)
      if (totalActive > 0 && cold / totalActive > 0.6) bottlenecks.push(`❄️ ${Math.round(cold / totalActive * 100)}% de leads están fríos → la calificación inicial no está levantando interés (revisa el primer mensaje del bot)`)
      return {
        summary: `🧭 Diagnóstico del motor de conversión (${totalActive} leads activos):\n` +
          `• Temperatura: 🔥 ${hot} calientes · 🌤️ ${warm} tibios · ❄️ ${cold} fríos\n` +
          `• Umbral: caliente ≥70, tibio 30-69, frío <30\n\n` +
          (bottlenecks.length ? `Cuellos de botella detectados:\n${bottlenecks.map((b) => `   - ${b}`).join('\n')}` : '✅ Sin cuellos de botella evidentes. El seguimiento va al día.'),
      }
    },
  },

  // ═══ AUTOMATIZACIONES: listar/activar/pausar/ejecutar/crear ═══
  {
    name: 'listar_automatizaciones',
    desc: 'Lista las automatizaciones del negocio con su disparador, estado y ejecuciones.',
    params: '{}',
    run: async (_a, ctx) => {
      const rows = await db.automation.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' } })
      if (!rows.length) return { summary: 'No hay automatizaciones. Crea una con "crear_automatizacion".' }
      const trig: Record<string, string> = { message_received: 'mensaje recibido', schedule: 'programada', event: 'evento', webhook: 'webhook', deal_stage_change: 'cambio de etapa', inactivity: 'inactividad' }
      return { summary: `Automatizaciones (${rows.length}):\n` + rows.map((r) => `• ${r.name} — ${trig[r.triggerType] || r.triggerType} · ${r.isActive ? '🟢 activa' : '⏸️ pausada'} · ${r.runCount} ejecuciones`).join('\n') }
    },
  },
  {
    name: 'toggle_automatizacion',
    desc: 'ENCIENDE o PAUSA una automatización (interruptor on/off). NO la ejecuta — para correrla ahora usa "ejecutar_automatizacion". Para PAUSAR pasa {"activar": false}; para ACTIVAR pasa {"activar": true}.',
    params: '{ "automatizacion": "nombre", "activar": false }',
    run: async (a, ctx) => {
      const rows = await db.automation.findMany({ where: { workspaceId: ctx.workspaceId } })
      const nq = norm(String(a.automatizacion || ''))
      const auto = rows.find((r) => r.id === a.automatizacion) || rows.find((r) => norm(r.name).includes(nq))
      if (!auto) return { summary: `No encontré la automatización "${a.automatizacion}". Usa "listar_automatizaciones".` }
      await db.automation.update({ where: { id: auto.id }, data: { isActive: !!a.activar } })
      return { summary: `${a.activar ? '🟢 Activada' : '⏸️ Pausada'}: "${auto.name}".` }
    },
  },
  {
    name: 'ejecutar_automatizacion',
    desc: 'CORRE una automatización AHORA MISMO (ejecución manual inmediata) y registra la corrida. ÚSALA cuando digan "ejecútala", "córrela", "lánzala", "dispárala ahora". NO es para activar/pausar (eso es toggle_automatizacion).',
    params: '{ "automatizacion": "nombre" }',
    run: async (a, ctx) => {
      const rows = await db.automation.findMany({ where: { workspaceId: ctx.workspaceId } })
      const nq = norm(String(a.automatizacion || ''))
      const auto = rows.find((r) => r.id === a.automatizacion) || rows.find((r) => norm(r.name).includes(nq))
      if (!auto) return { summary: `No encontré la automatización "${a.automatizacion}".` }
      const acts = (() => { try { return JSON.parse(auto.actions || '[]') } catch { return [] } })() as { description?: string; type?: string }[]
      await db.automationLog.create({ data: { automationId: auto.id, workspaceId: ctx.workspaceId, status: 'success', action: auto.triggerType, message: `Ejecutada manualmente desde el Copiloto (${acts.length} acción(es))`, metadata: JSON.stringify({ manualTrigger: true, viaCopilot: true }) } })
      await db.automation.update({ where: { id: auto.id }, data: { lastRunAt: new Date(), runCount: { increment: 1 } } })
      return { summary: `▶️ Ejecuté "${auto.name}" (${acts.length} acción(es): ${acts.map((x) => x.description || x.type).filter(Boolean).slice(0, 3).join(', ')}${acts.length > 3 ? '…' : ''}). Quedó registrada la corrida.` }
    },
  },
  {
    name: 'crear_automatizacion',
    desc: 'Crea una automatización nueva: qué la dispara y qué acciones hace. Queda ACTIVA.',
    params: '{ "nombre": string, "descripcion"?: string, "disparador": "message_received|schedule|event|inactivity|deal_stage_change", "condicion"?: "texto libre (ej: cada lunes 9am, score > 80)", "acciones": ["Enviar mensaje de bienvenida", "Etiquetar como nuevo"] }',
    run: async (a, ctx) => {
      const nombre = String(a.nombre || '').trim(); if (!nombre) return { summary: 'Ponle nombre a la automatización.' }
      const trigger = ['message_received', 'schedule', 'event', 'inactivity', 'deal_stage_change', 'webhook'].includes(String(a.disparador)) ? String(a.disparador) : 'event'
      const actsIn = (Array.isArray(a.acciones) ? a.acciones : []).map(String).filter(Boolean)
      if (!actsIn.length) return { summary: 'Indica al menos una acción (qué debe hacer).' }
      const typeFor = (s: string): string => {
        const n = norm(s)
        if (/(envia|manda|escribe|mensaje|whatsapp)/.test(n)) return 'send_message'
        if (/(etiquet|tag|marca)/.test(n)) return 'tag_contact'
        if (/(notific|avisa|alerta|telegram)/.test(n)) return 'notify_team'
        if (/(score|puntaje|calif)/.test(n)) return 'update_lead_score'
        if (/(asigna|vendedor|agente)/.test(n)) return 'assign_agent'
        if (/(deal|trato|oportunidad|pipeline)/.test(n)) return 'create_deal'
        if (/(ia|inteligencia|respond)/.test(n)) return 'ai_respond'
        return 'custom'
      }
      const actions = actsIn.map((s) => ({ type: typeFor(s), description: s.slice(0, 160) }))
      const auto = await db.automation.create({ data: { workspaceId: ctx.workspaceId, name: nombre.slice(0, 120), description: a.descripcion ? String(a.descripcion).slice(0, 400) : null, triggerType: trigger, triggerConfig: JSON.stringify(a.condicion ? { condition: String(a.condicion) } : {}), actions: JSON.stringify(actions), isActive: true } })
      return { summary: `✅ Automatización "${auto.name}" creada y ACTIVA (disparador: ${trigger}${a.condicion ? `, condición: ${a.condicion}` : ''}) con ${actions.length} acción(es). La ves en el módulo Automatizaciones.` }
    },
  },

  // ═══ CONTACTOS: importación masiva desde el chat ═══
  {
    name: 'importar_contactos',
    desc: 'Importa contactos/prospectos EN LOTE desde texto pegado (CSV: nombre, teléfono, correo...) o desde un enlace de Google Sheets/Drive/CSV. Omite teléfonos duplicados.',
    params: '{ "texto"?: "csv pegado", "enlace"?: "https://docs.google.com/..." }',
    run: async (a, ctx) => {
      const enlace = String(a.enlace || '').trim()
      let texto = String(a.texto || '').trim()
      if (!enlace && !texto) return { summary: 'Pega la lista (CSV con encabezados: Nombre, Teléfono, Correo…) o pásame un enlace de Google Sheets/Drive.' }
      if (enlace) {
        if (!/^https?:\/\//i.test(enlace)) return { summary: 'El enlace no es válido.' }
        const { downloadUrl, kind } = resolveGoogleUrl(enlace)
        const res = await fetch(downloadUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 ValiAutoFlow' } }).catch(() => null)
        if (!res || !res.ok) return { summary: `No pude descargar el archivo (${res?.status ?? 'sin respuesta'}). Compártelo como "cualquiera con el enlace".` }
        texto = await res.text()
        if (/<!DOCTYPE html|<html/i.test(texto.slice(0, 200)) && kind !== 'raw') return { summary: 'El enlace no es público. Compártelo como "cualquiera con el enlace".' }
      }
      const { headers, rows } = parseCsv(texto)
      if (!headers.length || !rows.length) return { summary: 'No pude leer filas. Asegúrate de que la primera línea sean encabezados (Nombre, Teléfono, Correo…).' }
      const key = (h: string) => norm(h).replace(/\s+/g, '_')
      const hmap = new Map(headers.map((h) => [key(h), h]))
      const pick = (r: Record<string, unknown>, ...names: string[]) => { for (const n of names) { const h = hmap.get(n); if (h && r[h] != null && String(r[h]).trim()) return String(r[h]).trim() } return '' }
      const candidates = rows.map((r) => {
        let firstName = pick(r, 'nombre', 'name', 'nombre_completo', 'contacto'); let lastName = pick(r, 'apellido', 'apellidos')
        if (!lastName && firstName.includes(' ')) { const p = firstName.split(/\s+/); firstName = p.shift() || firstName; lastName = p.join(' ') }
        const phone = pick(r, 'telefono', 'phone', 'celular', 'whatsapp', 'tel', 'numero').replace(/[^\d+]/g, '')
        return { firstName, lastName, phone, email: pick(r, 'correo', 'email', 'mail'), tags: pick(r, 'etiquetas', 'tags') }
      }).filter((c) => c.firstName)
      if (!candidates.length) return { summary: 'Ninguna fila tiene nombre. Revisa los encabezados.' }
      const phones = [...new Set(candidates.map((c) => c.phone).filter(Boolean))]
      const existing = phones.length ? await db.contact.findMany({ where: { workspaceId: ctx.workspaceId, phone: { in: phones } }, select: { phone: true } }) : []
      const dup = new Set(existing.map((e) => e.phone)); const seen = new Set<string>()
      const toCreate = candidates.filter((c) => { if (c.phone && (dup.has(c.phone) || seen.has(c.phone))) return false; if (c.phone) seen.add(c.phone); return true })
      if (toCreate.length) await db.contact.createMany({ data: toCreate.map((c) => ({ workspaceId: ctx.workspaceId, firstName: c.firstName.slice(0, 191), lastName: c.lastName ? c.lastName.slice(0, 191) : null, phone: c.phone || null, email: c.email || null, source: 'importacion', tags: JSON.stringify(c.tags ? c.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : []) })) })
      const omitted = candidates.length - toCreate.length
      return { summary: `✅ Importé ${toCreate.length} contacto(s)${omitted ? ` (omití ${omitted} duplicado(s) por teléfono)` : ''}. Ya están en el CRM listos para trabajarlos.` }
    },
  },

  // ═══ INVENTARIO: eliminar ═══
  {
    name: 'eliminar_auto',
    desc: 'ELIMINA un producto del inventario (irreversible — pide confirmación al usuario antes).',
    params: '{ "auto": "nombre o id" }',
    run: async (a, ctx) => {
      const car = await findCar(ctx.workspaceId, String(a.auto || '')); if (!car) return { summary: `No encontré "${a.auto}".` }
      await db.catalogItem.delete({ where: { id: car.id } })
      return { summary: `🗑️ Eliminado del inventario: ${car.name}.` }
    },
  },

  // ═══ CITAS: completar / cancelar / reagendar ═══
  {
    name: 'gestionar_cita',
    desc: 'Completa, cancela o reagenda una cita existente (búscala por título o por el nombre del contacto).',
    params: '{ "cita": "título o nombre del contacto", "accion": "completar|cancelar|reagendar", "nuevaFechaISO"?: "2026-07-15T17:00:00" }',
    run: async (a, ctx) => {
      const q = norm(String(a.cita || ''))
      const appts = await db.appointment.findMany({ where: { workspaceId: ctx.workspaceId, status: 'pending' }, orderBy: { date: 'asc' }, take: 100, include: { contact: { select: { firstName: true, lastName: true } } } })
      const ap = appts.find((x) => x.id === a.cita) || appts.find((x) => norm(x.title).includes(q) || (x.contact && norm(contactName(x.contact)).includes(q)))
      if (!ap) return { summary: `No encontré una cita pendiente que coincida con "${a.cita}". Usa "citas_proximas".` }
      const acc = String(a.accion || '').toLowerCase()
      if (acc.startsWith('compl')) { await db.appointment.update({ where: { id: ap.id }, data: { status: 'completed' } }); return { summary: `✅ Cita "${ap.title}" marcada como completada.` } }
      if (acc.startsWith('cancel')) { await db.appointment.update({ where: { id: ap.id }, data: { status: 'cancelled' } }); return { summary: `🚫 Cita "${ap.title}" cancelada.` } }
      if (acc.startsWith('reagend') || acc.startsWith('reprogram')) {
        const when = new Date(String(a.nuevaFechaISO || '')); if (isNaN(when.getTime())) return { summary: 'Dame la nueva fecha en ISO (ej 2026-07-15T17:00:00).' }
        await db.appointment.update({ where: { id: ap.id }, data: { date: when } })
        return { summary: `📅 Cita "${ap.title}" reagendada para ${when.toLocaleString('es-MX')}.` }
      }
      return { summary: 'Indica la acción: completar, cancelar o reagendar.' }
    },
  },

  // ═══ BÚSQUEDA EN MENSAJES ═══
  {
    name: 'buscar_mensajes',
    desc: 'Busca un texto dentro de TODAS las conversaciones (ej: quién preguntó por "financiamiento", quién mencionó "factura").',
    params: '{ "texto": string, "limite"?: number }',
    run: async (a, ctx) => {
      const q = String(a.texto || '').trim(); if (!q) return { summary: '¿Qué texto busco en las conversaciones?' }
      const msgs = await db.message.findMany({
        where: { conversation: { workspaceId: ctx.workspaceId }, content: { contains: q } },
        orderBy: { createdAt: 'desc' }, take: Math.min(Number(a.limite) || 10, 25),
        include: { conversation: { include: { contact: { select: { firstName: true, lastName: true, phone: true } } } } },
      })
      if (!msgs.length) return { summary: `Nadie ha mencionado "${q}" en las conversaciones.` }
      return { summary: `Menciones de "${q}" (${msgs.length}):\n` + msgs.map((m) => `• ${m.conversation?.contact ? contactName(m.conversation.contact) : 'Desconocido'} (${m.direction === 'inbound' ? 'cliente' : 'nosotros'}, ${new Date(m.createdAt).toLocaleDateString('es-MX')}): "${m.content.slice(0, 90)}"`).join('\n') }
    },
  },

  // ═══ BRIEFING EJECUTIVO ═══
  {
    name: 'briefing',
    desc: 'Briefing ejecutivo del día EN UNA SOLA LLAMADA: qué pasó hoy, citas de hoy/mañana, leads calientes a atender, estado de WhatsApp/agentes/automatizaciones. Úsalo cuando pidan "ponme al día", "resumen del día", "cómo va el negocio".',
    params: '{}',
    run: async (_a, ctx) => {
      const data = await collectBriefing(ctx.workspaceId)
      return { summary: formatBriefing(data) + (data.whatsappConnected ? '' : ' (dime "conecta WhatsApp")') }
    },
  },
  {
    name: 'configurar_briefing',
    desc: 'Activa o desactiva el BRIEFING DIARIO AUTOMÁTICO: cada mañana el copiloto envía el resumen del día por Telegram (y WhatsApp opcional) SIN que se lo pidan. Configura la hora local (0-23).',
    params: '{ "activar": boolean, "hora"?: 8, "whatsapp"?: "521XXXXXXXXXX (opcional: también mandarlo a este WhatsApp)" }',
    run: async (a, ctx) => {
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const s = J(ws?.settings || '{}')
      const prev = (s.copilotBriefing || {}) as Record<string, unknown>
      const hora = a.hora != null ? Math.max(0, Math.min(23, Number(a.hora))) : (typeof prev.hour === 'number' ? prev.hour : 8)
      s.copilotBriefing = {
        ...prev,
        enabled: !!a.activar,
        hour: hora,
        ...(a.whatsapp ? { whatsappPhone: String(a.whatsapp).replace(/\D/g, '') } : {}),
      }
      await db.workspace.update({ where: { id: ctx.workspaceId }, data: { settings: JSON.stringify(s) } })
      if (!a.activar) return { summary: '⏸️ Briefing diario automático DESACTIVADO.' }
      const waTxt = (s.copilotBriefing as Record<string, unknown>).whatsappPhone ? ` y por WhatsApp al ${(s.copilotBriefing as Record<string, unknown>).whatsappPhone}` : ''
      return { summary: `✅ Briefing diario ACTIVADO: cada día a las ${hora}:00 (hora local del negocio) te llegará el resumen por Telegram${waTxt}. Requiere Telegram vinculado en Configuración → Notificaciones.` }
    },
  },

  // ═══ COBROS: link de pago Stripe ═══
  {
    name: 'generar_link_pago',
    desc: 'Genera un LINK DE PAGO real (Stripe) por un monto y concepto, y opcionalmente lo ENVÍA por WhatsApp a un contacto. Cuando el cliente paga, el trato se marca GANADO automáticamente. Requiere Stripe conectado en Configuración → Pagos.',
    params: '{ "monto": 5000, "concepto": "Anticipo Plan Pro", "contacto"?: "nombre/teléfono/id", "enviar"?: boolean }',
    run: async (a, ctx) => {
      const monto = Number(a.monto) || 0
      if (monto < 10) return { summary: 'Indica el monto en MXN (mínimo $10).' }
      const concepto = String(a.concepto || 'Pago').slice(0, 120)
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      const pay = (J(ws?.settings || '{}').payments || {}) as { stripeSecretKey?: string }
      const sk = pay.stripeSecretKey
      if (!sk) return { summary: 'Stripe no está conectado. Configúralo en Configuración → Pagos (clave secreta + webhook) y vuelve a pedirme el link.' }
      const contact = a.contacto ? await findContact(ctx.workspaceId, String(a.contacto)) : null
      const form = (o: Record<string, string>) => new URLSearchParams(o).toString()
      const sReq = async (path: string, body: Record<string, string>) => {
        const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error?.message || `Stripe ${r.status}`)
        return j as Record<string, unknown>
      }
      try {
        const price = await sReq('prices', {
          'currency': 'mxn', 'unit_amount': String(Math.round(monto * 100)),
          'product_data[name]': concepto,
        })
        const linkBody: Record<string, string> = {
          'line_items[0][price]': String(price.id), 'line_items[0][quantity]': '1',
          'metadata[source]': 'revenue-engine', 'metadata[workspaceId]': ctx.workspaceId,
        }
        if (contact) linkBody['metadata[contactId]'] = contact.id
        const link = await sReq('payment_links', linkBody)
        const url = String(link.url)
        let sendInfo = ''
        if (contact && a.enviar !== false) {
          const msg = `Hola ${contact.firstName} 👋 Aquí está tu link de pago seguro por ${money(monto)} (${concepto}):\n${url}\n\nCualquier duda, con gusto te apoyo.`
          const r = await sendWa(ctx, contact, msg)
          sendInfo = r.ok ? `\n📲 Enviado por WhatsApp a ${contactName(contact)} (${contact.phone}).` : `\n⚠️ No se pudo enviar por WhatsApp (${r.info}) — compártelo manualmente.`
        }
        return { summary: `💳 Link de pago listo por ${money(monto)} — ${concepto}:\n${url}${sendInfo}\n\nAl pagarlo, el trato${contact ? ` de ${contactName(contact)}` : ''} se marcará GANADO automáticamente (si el webhook de Stripe está configurado).`, data: { url } }
      } catch (e) {
        return { summary: `No pude crear el link de pago: ${e instanceof Error ? e.message : 'error de Stripe'}. Revisa la clave en Configuración → Pagos.` }
      }
    },
  },

  // ═══ PUBLICAR VIDEO (Instagram Reel + Facebook) ═══
  {
    name: 'publicar_video',
    desc: 'Publica un VIDEO en redes: Instagram (como Reel) y/o Facebook. Usa el último video generado del producto (o una URL de video que le pases). Requiere Meta conectado.',
    params: '{ "auto"?: "nombre del producto (usa su último video)", "url"?: "https://...mp4", "caption"?: string, "redes"?: ["instagram","facebook"] }',
    run: async (a, ctx) => {
      const { readMetaCreds, igPublishReel, fbPublishVideo } = await import('@/lib/marketing/meta')
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true, logo: true, settings: true } })
      const creds = readMetaCreds(ws?.settings)
      const nets = (Array.isArray(a.redes) && a.redes.length ? a.redes.map(String) : ['instagram', 'facebook'])
      // Resolver el video: URL directa o el último del producto
      let url = String(a.url || '').trim()
      let carName = ''
      if (!url) {
        const path = (await import('path')).default
        const { readdir, stat } = await import('fs/promises')
        const dir = path.join(process.cwd(), 'public', 'marketing', 'videos')
        let files: { f: string; m: number }[] = []
        try { const fs = await readdir(dir); files = await Promise.all(fs.filter((f) => f.endsWith('.mp4')).map(async (f) => ({ f, m: (await stat(path.join(dir, f))).mtimeMs }))) } catch { /* */ }
        files.sort((x, y) => y.m - x.m)
        if (a.auto) {
          const car = await findCar(ctx.workspaceId, String(a.auto))
          if (!car) return { summary: `No encontré "${a.auto}" en el inventario.` }
          carName = car.name
          const own = files.find((x) => x.f.startsWith(car.id))
          if (!own) return { summary: `${car.name} no tiene videos generados aún. Pídeme primero "genera un video de ${car.name}".` }
          url = `${ctx.base}/api/marketing/media/${own.f}`
        } else if (files.length) {
          url = `${ctx.base}/api/marketing/media/${files[0].f}`
          const car = await db.catalogItem.findFirst({ where: { id: files[0].f.split('-')[0] }, select: { name: true } })
          carName = car?.name || ''
        } else return { summary: 'No hay videos generados. Genera uno primero con "generar_video".' }
      }
      let caption = String(a.caption || '').trim()
      if (!caption) caption = carName ? `${carName} 🚀 Pregunta por él ahora.` : '🚀 Conócelo ahora.'
      const results: string[] = []
      let okCount = 0
      if (nets.includes('instagram')) {
        if (!creds.igUserId || !creds.igToken) results.push('❌ Instagram: no conectado (falta IG en Configuración → Marketing).')
        else { try { const r = await igPublishReel(creds, url, caption); okCount++; results.push(`✅ Instagram Reel publicado (post ${r.postId}).`) } catch (e) { results.push(`❌ Instagram: ${e instanceof Error ? e.message : 'error'}`) } }
      }
      if (nets.includes('facebook')) {
        if (!creds.pageId || !creds.fbToken) results.push('❌ Facebook: no conectado.')
        else { try { const r = await fbPublishVideo(creds, url, caption); okCount++; results.push(`✅ Facebook video publicado (id ${r.postId}).`) } catch (e) { results.push(`❌ Facebook: ${e instanceof Error ? e.message : 'error'}`) } }
      }
      return { summary: `📤 Publicación de video${carName ? ` (${carName})` : ''}: ${okCount}/${nets.length} red(es) ok.\n${results.join('\n')}` }
    },
  },

  // ═══ CEREBRO CENTRAL: APROBACIONES / IA GLOBAL / EXPEDIENTE / ENTRENAR AL BOT ═══
  {
    name: 'aprobaciones',
    desc: 'Lista las aprobaciones pendientes (pagos/facturas que la IA retuvo esperando el OK humano del Tablero).',
    params: '{}',
    run: async (_a, ctx) => {
      const list = await db.pendingApproval.findMany({ where: { workspaceId: ctx.workspaceId, status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 15 })
      if (!list.length) return { summary: 'No hay aprobaciones pendientes. Todo al día.' }
      return {
        summary: `${list.length} aprobación(es) pendiente(s):\n` + list.map((a, i) =>
          `${i + 1}. [${a.type === 'payment' ? 'PAGO' : a.type === 'invoice' ? 'FACTURA' : a.type}] ${a.summary} — desde ${new Date(a.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} (id ${a.id})`
        ).join('\n') + '\nPara resolver: "resolver_aprobacion" con el id (o el número de la lista si solo hay contexto de esta conversación).',
        data: { ids: list.map((a) => a.id) },
      }
    },
  },
  {
    name: 'resolver_aprobacion',
    desc: 'Aprueba o rechaza una aprobación pendiente. Aprobar EJECUTA la acción retenida (genera el link de pago/factura y se lo envía al cliente por WhatsApp).',
    params: '{ "id": "id de la aprobación (de la herramienta aprobaciones)", "accion": "aprobar|rechazar" }',
    run: async (a, ctx) => {
      const accion = norm(String(a.accion || ''))
      if (accion !== 'aprobar' && accion !== 'rechazar') return { summary: 'Indica accion: "aprobar" o "rechazar".' }
      let id = String(a.id || '').trim()
      if (!id) {
        const pend = await db.pendingApproval.findMany({ where: { workspaceId: ctx.workspaceId, status: 'pending' } })
        if (pend.length === 1) id = pend[0].id
        else return { summary: pend.length ? `Hay ${pend.length} pendientes — dime cuál (usa "aprobaciones" para ver los ids).` : 'No hay aprobaciones pendientes.' }
      }
      const { resolveApproval } = await import('@/lib/erp/approvals')
      const r = await resolveApproval({ id, action: accion === 'aprobar' ? 'approve' : 'reject', resolvedBy: 'copilot', workspaceId: ctx.workspaceId })
      if (r.error) return { summary: `No se pudo: ${r.error}.` }
      if (r.status === 'rejected') return { summary: 'Aprobación RECHAZADA. No se ejecutó nada ni se avisó al cliente.' }
      return { summary: r.ok ? `Aprobada y EJECUTADA ✓ — ${r.resultNote}` : `Se aprobó pero la ejecución FALLÓ: ${r.resultNote}` }
    },
  },
  {
    name: 'ia_global',
    desc: 'Ve o cambia el switch GLOBAL de la IA de WhatsApp (el mismo del Tablero): pausar 1h/3h, apagar indefinido o encender. Pausada, el bot NO responde a NADIE pero los mensajes se siguen guardando.',
    params: '{ "modo": "estado|encender|pausar_1h|pausar_3h|apagar" }',
    run: async (a, ctx) => {
      const modo = norm(String(a.modo || 'estado'))
      const ws = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } })
      let s: Record<string, unknown> = {}; try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
      const describe = () => {
        const until = s.aiGlobalPausedUntil ? new Date(String(s.aiGlobalPausedUntil)) : null
        const untilActive = !!(until && !isNaN(until.getTime()) && until.getTime() > Date.now())
        if (s.aiGlobalPaused === true && !untilActive) return 'APAGADA indefinidamente (nadie recibe respuestas del bot)'
        if (untilActive) return `PAUSADA hasta las ${until!.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} (se reactiva sola)`
        return 'ACTIVA (el bot responde normal)'
      }
      if (modo === 'estado' || !modo) return { summary: `IA del bot: ${describe()}.` }
      if (modo === 'encender') { s.aiGlobalPaused = false; delete s.aiGlobalPausedUntil }
      else if (modo === 'apagar') { s.aiGlobalPaused = true; delete s.aiGlobalPausedUntil }
      else if (modo === 'pausar_1h' || modo === 'pausar_3h') {
        s.aiGlobalPaused = false
        s.aiGlobalPausedUntil = new Date(Date.now() + (modo === 'pausar_3h' ? 3 : 1) * 3600000).toISOString()
      } else return { summary: 'Modo inválido. Usa: estado, encender, pausar_1h, pausar_3h o apagar.' }
      await db.workspace.update({ where: { id: ctx.workspaceId }, data: { settings: JSON.stringify(s) } })
      return { summary: `Hecho. IA del bot ahora: ${describe()}. Los mensajes entrantes se siguen guardando en el CRM.` }
    },
  },
  {
    name: 'expediente',
    desc: 'Expediente completo de un contacto: bitácora cronológica (lo que la IA fue anotando), perfil del lead, tratos abiertos y próxima cita. Úsalo para "ponme al día con X" / "qué ha pasado con X".',
    params: '{ "contacto": "nombre, teléfono o id" }',
    run: async (a, ctx) => {
      const c = await findContact(ctx.workspaceId, String(a.contacto || ''))
      if (!c) return { summary: 'No encontré ese contacto.' }
      const [events, profile, deals, appt] = await Promise.all([
        db.contactTimelineEvent.findMany({ where: { workspaceId: ctx.workspaceId, contactId: c.id }, orderBy: { createdAt: 'desc' }, take: 12 }),
        db.leadProfile.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id } }).catch(() => null),
        db.deal.findMany({ where: { workspaceId: ctx.workspaceId, contactId: c.id, status: 'active' }, include: { stage: true }, take: 5 }),
        db.appointment.findFirst({ where: { workspaceId: ctx.workspaceId, contactId: c.id, status: 'pending', date: { gte: new Date() } }, orderBy: { date: 'asc' } }),
      ])
      const lines: string[] = [`📁 Expediente de ${contactName(c)} (${c.temperature}, score ${c.leadScore})${c.phone ? ` · ${c.phone}` : ''}`]
      if (profile) lines.push(`Perfil: ${[profile.archetype && `arquetipo ${profile.archetype}`, profile.preferredProduct && `interés: ${profile.preferredProduct}`, profile.budget && `presupuesto: ${profile.budget}`, profile.mainObjection && `objeción: ${profile.mainObjection}`].filter(Boolean).join(' · ') || 'sin datos aún'}`)
      if (deals.length) lines.push(`Tratos abiertos: ${deals.map((d) => `"${d.title}" en ${d.stage?.name || '?'} (${money(d.value, d.currency || 'MXN')})`).join(' · ')}`)
      if (appt) lines.push(`Próxima cita: ${new Date(appt.date).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${appt.title}`)
      if (events.length) {
        lines.push('Bitácora (reciente → antiguo):')
        for (const e of events) lines.push(`• ${new Date(e.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} [${e.type}] ${e.title}`)
      } else lines.push('Bitácora: sin eventos aún.')
      return { summary: lines.join('\n') }
    },
  },
  {
    name: 'entrenar_bot',
    desc: 'Enséñale algo al BOT DE VENTAS de WhatsApp (no a ti): crea una lección que el bot aplicará en sus conversaciones con clientes. Úsalo cuando digan "enséñale al bot que…", "el bot debe responder…", "cuando pregunten X que diga Y".',
    params: '{ "situacion": "qué dice/pregunta el cliente", "respuesta_correcta": "cómo DEBE responder el bot", "nota"?: "por qué / la regla" }',
    run: async (a, ctx) => {
      const trigger = String(a.situacion || '').trim()
      const good = String(a.respuesta_correcta || '').trim()
      if (!trigger || !good) return { summary: 'Necesito la situación del cliente Y la respuesta correcta del bot.' }
      await db.aiTrainingExample.create({
        data: {
          workspaceId: ctx.workspaceId, type: 'example', trigger, goodResponse: good,
          note: a.nota ? String(a.nota) : null, source: 'copilot', createdBy: 'copilot',
        },
      })
      invalidatePersonalityCache(ctx.workspaceId)
      const total = await db.aiTrainingExample.count({ where: { workspaceId: ctx.workspaceId, isActive: true } })
      return { summary: `Lección guardada ✓ — el bot de ventas la aplicará desde su próxima respuesta (lecciones activas: ${total}). También puedes verlas en Playground → Entrenar.` }
    },
  },
  {
    name: 'lecciones_bot',
    desc: 'Lista las lecciones activas con las que está entrenado el bot de ventas de WhatsApp.',
    params: '{ "limite"?: number }',
    run: async (a, ctx) => {
      const list = await db.aiTrainingExample.findMany({ where: { workspaceId: ctx.workspaceId, isActive: true }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(a.limite) || 10, 25) })
      if (!list.length) return { summary: 'El bot no tiene lecciones personalizadas aún. Puedes enseñarle con "entrenar_bot".' }
      const total = await db.aiTrainingExample.count({ where: { workspaceId: ctx.workspaceId, isActive: true } })
      return { summary: `${total} lección(es) activas. Últimas:\n` + list.map((l) => `• [${l.type === 'correction' ? 'corrección' : 'ejemplo'}] Cliente: "${l.trigger.slice(0, 70)}" → Bot: "${l.goodResponse.slice(0, 90)}"`).join('\n') }
    },
  },

  // ═══ ESTADO DEL SISTEMA ═══
  {
    name: 'estado_sistema',
    desc: 'Chequeo de salud de la plataforma: WhatsApp, agentes IA, automatizaciones, actividad de hoy y últimos accesos. Úsalo cuando pregunten "¿todo bien?", "¿todo funciona?".',
    params: '{}',
    run: async (_a, ctx) => {
      const ws = ctx.workspaceId
      const dayAgo = new Date(Date.now() - 86400000)
      const [waSt, agents, agentsTotal, autosOn, autosTotal, events, logins, fails] = await Promise.all([
        Promise.resolve(getWhatsAppManager(ws).getStatus()),
        db.agentInstance.count({ where: { workspaceId: ws, status: 'activo' } }),
        db.agentInstance.count({ where: { workspaceId: ws } }),
        db.automation.count({ where: { workspaceId: ws, isActive: true } }),
        db.automation.count({ where: { workspaceId: ws } }),
        db.engineEvent.count({ where: { workspaceId: ws, createdAt: { gte: dayAgo } } }),
        db.consentLog.count({ where: { workspaceId: ws, action: 'login', createdAt: { gte: dayAgo } } }).catch(() => 0),
        db.consentLog.count({ where: { workspaceId: ws, action: 'login_failed', createdAt: { gte: dayAgo } } }).catch(() => 0),
      ])
      const okWa = waSt.connected
      return {
        summary: `🩺 Estado del sistema:\n` +
          `• WhatsApp: ${okWa ? `🟢 conectado (${waSt.phone || 's/n'})` : '🔴 DESCONECTADO'}\n` +
          `• Agentes IA: ${agents}/${agentsTotal} activos\n` +
          `• Automatizaciones: ${autosOn}/${autosTotal} activas\n` +
          `• Actividad (24h): ${events} evento(s) del motor\n` +
          `• Accesos (24h): ${logins} inicio(s) de sesión${fails ? `, ⚠️ ${fails} intento(s) fallido(s)` : ''}\n` +
          (okWa ? `✅ Todo operando con normalidad.` : `⚠️ Atiende la conexión de WhatsApp: dime "conecta WhatsApp".`),
      }
    },
  },
]

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n)
