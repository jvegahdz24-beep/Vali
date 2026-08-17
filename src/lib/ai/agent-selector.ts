// gBrain Agent Factory — Selector de agentes en el pipeline de generación.
//
// Dado un workspace y el mensaje entrante, elige el AgentInstance activo que
// mejor atiende la conversación (routing por palabra clave + score + etapa).
// Devuelve el systemPrompt ya resuelto para que `message-processor` lo use en
// lugar de la persona JHON por defecto.
//
// GATING (clave para no romper tenants productivos):
//   - Si el workspace no tiene NINGÚN AgentInstance activo  → null (JHON intacto).
//   - Si `workspace.settings.agentFactoryEnabled === false`  → null (kill-switch).
//   - Si ningún agente matchea el mensaje                    → null (JHON fallback).
// Es decir: el comportamiento solo cambia cuando el cliente instancia agentes.

import { db } from '@/lib/db'
import { isConversationalVertical } from '@/lib/agent-verticals'
export { isConversationalVertical, CONVERSATIONAL_VERTICALS } from '@/lib/agent-verticals'

export interface AgentRouteResult {
  instanceId: string
  name: string
  role: string
  vertical: string
  systemPrompt: string
  temperature: number
  keywordsMatched: string[]
  /** Acciones prohibidas del agente (ficha técnica "NO puede"), p.ej. ["createInvoice","updateDealStage"] */
  forbiddenActions: string[]
  /** Herramientas permitidas declaradas ("SÍ puede"); vacío = sin restricción explícita de allow-list */
  allowedTools: string[]
  reason: string
}

interface SelectArgs {
  workspaceId: string
  incomingText: string
  leadScore?: number
  /** Etapa actual del pipeline (Lead Nuevo|Contactado|Cualificado|Propuesta|Negociación|Cerrado) */
  stage?: string
  /** settings del workspace ya parseados (para el kill-switch) */
  workspaceSettings?: Record<string, unknown>
  /** El contacto YA es cliente (ganó un trato) → priorizar Agente de Soporte (post-venta). */
  isClient?: boolean
  /** Intención clasificada del mensaje (compra|credito|cita|info|queja|reclamo|saludo).
   *  Rutea por INTENCIÓN aunque el cliente no use la palabra clave exacta
   *  ("¿cuánto sale al mes?" → financiamiento sin decir "crédito"). */
  intent?: string | null
}

// ─── Intención → verticales que la atienden (ruteo semántico, 2026-07-20) ───
const INTENT_VERTICALS: Record<string, string[]> = {
  credito: ['financiamiento', 'planes-pago', 'precalificacion'],
  compra: ['ventas', 'cotizador'],
  cita: ['ventas'],
  queja: ['soporte'],
  reclamo: ['soporte'],
}

// ─── Palabras clave por vertical (fallback cuando el instance no define las suyas) ───
// Se normalizan sin acentos y en minúsculas. Cubren los verticales del registry.
export const VERTICAL_KEYWORDS: Record<string, string[]> = {
  ventas: ['quiero comprar', 'me interesa', 'lo quiero', 'comprar', 'me lo llevo', 'cerrar trato'],
  seguimiento: ['seguimiento', 'sigues ahi', 'sigues interesado', 'retomamos', 'novedades', 'sigues con la duda', 'quedamos en'],
  seguros: ['seguro', 'asegurar', 'aseguranza', 'poliza', 'cobertura', 'deducible', 'qualitas', 'gnp', 'axa'],
  financiamiento: ['financiamiento', 'financiar', 'credito', 'mensualidad', 'enganche', 'a meses', 'plazo', 'tasa', 'prestamo'],
  'planes-pago': ['plan de pago', 'planes de pago', 'pagar a plazos', 'parcialidades', 'apartado'],
  'precalificacion': ['precalificar', 'pre-calificar', 'precalificacion', 'buro', 'soy candidato', 'califico'],
  cotizador: ['cotizacion', 'cotizar', 'cuanto cuesta', 'precio', 'presupuesto', 'cuanto vale'],
  'recordatorio-pagos': ['recordatorio de pago', 'fecha de pago', 'me toca pagar', 'pago vencido', 'mensualidad vencida'],
  inventario: ['inventario', 'disponibilidad', 'tienen en existencia', 'hay stock', 'modelo disponible'],
  soporte: ['soporte', 'no funciona', 'falla', 'error', 'problema tecnico', 'ayuda tecnica', 'garantia'],
  logistica: ['envio', 'entrega', 'rastreo', 'guia', 'paqueteria', 'cuando llega', 'logistica'],
  eventos: ['evento', 'invitacion', 'rsvp', 'asistir al evento', 'registro al evento'],
  nps: ['encuesta', 'satisfaccion', 'calificar servicio', 'nps', 'recomendarias'],
  'cross-selling': ['ademas de', 'tambien me interesa', 'complemento', 'accesorio', 'que mas tienen'],
  'lead-recovery': ['ya no me interesa', 'lo dejo', 'mejor despues', 'quiza luego'],
  reputacion: ['resena', 'review', 'opinion', 'calificacion en google', 'reputacion'],
  rh: ['vacante', 'empleo', 'trabajo', 'reclutamiento', 'cv', 'curriculum', 'postular'],
  cumplimiento: ['cumplimiento', 'compliance', 'aviso de privacidad', 'datos personales', 'regulacion'],
  franquicia: ['franquicia', 'abrir sucursal', 'modelo de negocio', 'invertir en franquicia'],
  alianzas: ['alianza', 'colaboracion', 'partnership', 'distribuidor', 'mayoreo'],
  marca: ['mencion de marca', 'hablan de nosotros', 'monitoreo de marca'],
  influencer: ['influencer', 'colaboracion de contenido', 'embajador', 'creador de contenido'],
  video: ['video', 'reel', 'tiktok', 'contenido en video'],
  'social-media': ['publicacion', 'post', 'redes sociales', 'instagram', 'facebook'],
  ads: ['campana de anuncios', 'pauta', 'meta ads', 'google ads', 'publicidad pagada'],
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
}

/** Palabras clave por defecto del vertical (para instanciar agentes que sí rutean). */
export function defaultKeywordsForVertical(vertical: string): string[] {
  return VERTICAL_KEYWORDS[(vertical || '').toLowerCase()] || []
}

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

// ─── Cache de instances por workspace (evita query en cada mensaje) ───
interface CachedInstances {
  instances: SelectableInstance[]
  timestamp: number
}
interface SelectableInstance {
  id: string
  name: string
  role: string
  vertical: string
  systemPrompt: string
  temperature: number
  keywords: string[]
  stageMatch: string[]
  forbiddenActions: string[]
  allowedTools: string[]
  priority: number
}
const _instanceCache = new Map<string, CachedInstances>()
const INSTANCE_CACHE_TTL = 60_000 // 60s

/** Limpia el cache de un workspace (llamar tras crear/editar/eliminar instances). */
export function invalidateAgentInstanceCache(workspaceId: string): void {
  _instanceCache.delete(workspaceId)
}

async function loadActiveInstances(workspaceId: string): Promise<SelectableInstance[]> {
  const cached = _instanceCache.get(workspaceId)
  const now = Date.now()
  if (cached && now - cached.timestamp < INSTANCE_CACHE_TTL) return cached.instances

  const rows = await db.agentInstance.findMany({
    where: { workspaceId, status: 'activo' },
    select: {
      id: true, name: true, role: true, vertical: true, systemPrompt: true,
      temperature: true, keywords: true, stageMatch: true, priority: true,
      forbiddenActions: true, tools: true,
    },
    orderBy: { priority: 'desc' },
  })
  const instances: SelectableInstance[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    vertical: r.vertical,
    systemPrompt: r.systemPrompt,
    temperature: r.temperature,
    keywords: safeParseArray(r.keywords),
    stageMatch: safeParseArray(r.stageMatch),
    forbiddenActions: safeParseArray(r.forbiddenActions),
    allowedTools: safeParseArray(r.tools),
    priority: r.priority,
  }))
  _instanceCache.set(workspaceId, { instances, timestamp: now })
  return instances
}

/**
 * Selecciona el agente instanciado que debe responder este mensaje, o null para
 * dejar el comportamiento por defecto (JHON) intacto.
 */
export async function selectAgentForConversation(
  args: SelectArgs,
): Promise<AgentRouteResult | null> {
  // Kill-switch explícito
  if (args.workspaceSettings && args.workspaceSettings.agentFactoryEnabled === false) {
    return null
  }

  let instances: SelectableInstance[]
  try {
    instances = await loadActiveInstances(args.workspaceId)
  } catch {
    return null // si la tabla/cliente no está listo, no rompas el pipeline
  }
  if (instances.length === 0) return null // GATE: sin agentes instanciados → JHON

  // Post-venta: si el contacto YA es cliente (ganó un trato), lo atiende el
  // Agente de Soporte, no el de ventas. Si hay uno activo, gana de inmediato.
  if (args.isClient) {
    const support = instances.find((i) => i.vertical === 'soporte' && isConversationalVertical(i.vertical))
    if (support) {
      return {
        instanceId: support.id,
        name: support.name,
        role: support.role,
        vertical: support.vertical,
        systemPrompt: support.systemPrompt,
        temperature: support.temperature,
        keywordsMatched: [],
        forbiddenActions: support.forbiddenActions,
        allowedTools: support.allowedTools,
        reason: 'cliente(post-venta)→soporte',
      }
    }
  }

  const text = normalize(args.incomingText || '')
  const stage = args.stage
  const score = args.leadScore ?? 0

  let best: { inst: SelectableInstance; score: number; matched: string[]; reason: string } | null = null

  for (const inst of instances) {
    // Solo agentes conversacionales atienden mensajes entrantes. Los de
    // back-office (sin runtime) nunca secuestran una respuesta de WhatsApp.
    // Empleados de PACK (vertical = 'pack-…'): su vertical es el marcador de
    // instalación, no el giro; los conversacionales se distinguen porque la
    // biblioteca SOLO a ellos les guarda keywords (analistas/backoffice = []).
    // Fix 2026-07-20: antes NINGÚN empleado de pack ruteaba por esto.
    const isPackConversational = inst.vertical.startsWith('pack-') && inst.keywords.length > 0
    if (!isConversationalVertical(inst.vertical) && !isPackConversational) continue
    // Palabras clave: las propias del instance + fallback por vertical
    const kws = inst.keywords.length > 0 ? inst.keywords : VERTICAL_KEYWORDS[inst.vertical] || []
    const matched: string[] = []
    for (const kw of kws) {
      if (kw && text.includes(normalize(kw))) matched.push(kw)
    }

    let matchScore = matched.length * 10

    // Ruteo por INTENCIÓN (más fuerte que una keyword suelta): el clasificador
    // del pipeline ya entendió QUÉ quiere el cliente, sin depender del vocabulario.
    const intentVerticals = args.intent ? INTENT_VERTICALS[args.intent] || [] : []
    const intentMatched = intentVerticals.includes(inst.vertical.toLowerCase())
    if (intentMatched) matchScore += 12

    // Refuerzo por etapa del pipeline
    if (stage && inst.stageMatch.length > 0 && inst.stageMatch.includes(stage)) {
      matchScore += 6
    }

    // Refuerzo por score del lead para roles de cierre
    const closerRoles = ['CLOSER', 'CIERRE', 'SELLER']
    if (score >= 60 && closerRoles.includes(inst.role.toUpperCase())) {
      matchScore += 5
    }

    if (matchScore <= 0) continue

    // Empata por prioridad del instance (orderBy ya la respeta, pero comparamos score primero)
    if (!best || matchScore > best.score) {
      best = {
        inst,
        score: matchScore,
        matched,
        reason: intentMatched
          ? `intent(${args.intent})${matched.length ? `+kw(${matched.join(', ')})` : ''}`
          : matched.length
            ? `keyword(${matched.join(', ')})`
            : stage && inst.stageMatch.includes(stage)
              ? `stage(${stage})`
              : `score(${score})`,
      }
    }
  }

  if (!best) return null // ningún agente matchea → JHON fallback

  return {
    instanceId: best.inst.id,
    name: best.inst.name,
    role: best.inst.role,
    vertical: best.inst.vertical,
    systemPrompt: best.inst.systemPrompt,
    temperature: best.inst.temperature,
    keywordsMatched: best.matched,
    forbiddenActions: best.inst.forbiddenActions,
    allowedTools: best.inst.allowedTools,
    reason: best.reason,
  }
}
