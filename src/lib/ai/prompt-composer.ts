// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Prompt Composer
// Ensambla el prompt del agente inyectando fragmentos de módulos
// activos. Cada módulo aporta: bloque de contexto + tools disponibles.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Tipos ───────────────────────────────────────────────────

export type ModuleType = 'agent_profile' | 'physical_location' | 'appointments' | 'catalog'

export interface AgentProfileConfig {
  name?: string          // Nombre del agente: "Sofía", "Jhon", "Carlos"
  tone?: string          // Tono: "profesional", "amigable", "técnico", "empático"
  greeting?: string      // Saludo inicial personalizado
  closing?: string       // Cierre personalizado
  avatar?: string        // URL de avatar (para UI)
}

export interface PhysicalLocationConfig {
  address?: string       // Dirección completa
  city?: string          // Ciudad
  mapUrl?: string        // Enlace a Google Maps
  hours?: string         // Horario de atención: "Lun–Vie 9am–6pm"
  hasParking?: boolean
  extraNotes?: string    // Notas adicionales (ej: "Local 2B, segundo piso")
}

export interface AppointmentsConfig {
  durationMinutes?: number    // Duración default de citas (default: 30)
  minAdvanceHours?: number    // Mínimo de anticipación para agendar (default: 2)
  bufferMinutes?: number      // Buffer entre citas (default: 0)
  availableHours?: string     // JSON: { mon: ["09:00","18:00"], tue: [...] }
  appointmentTypes?: string   // JSON: ["call", "meeting", "visit"]
  customInstructions?: string // Instrucciones extra para el agente
}

export interface CatalogConfig {
  currency?: string         // Moneda: "MXN", "USD", "EUR"
  showPrices?: boolean      // Si mostrar precios al cliente
  searchEnabled?: boolean   // Si el agente puede buscar en el catálogo
  customInstructions?: string
}

export interface ComposedModule {
  type: ModuleType
  enabled: boolean
  config: AgentProfileConfig | PhysicalLocationConfig | AppointmentsConfig | CatalogConfig
}

export interface ComposedPrompt {
  systemPromptBlocks: string[]   // Bloques de prompt listos para concatenar
  activeTools: string[]          // Nombres de tools habilitadas
  agentName: string              // Nombre del agente resuelto
}

// ─── Carga de módulos ─────────────────────────────────────────

/**
 * Carga todos los módulos activos de un workspace desde la DB.
 * Cacheable externamente — retorna array plano de módulos.
 */
export async function loadWorkspaceModules(workspaceId: string): Promise<ComposedModule[]> {
  const rows = await db.workspaceModule.findMany({
    where: { workspaceId },
    orderBy: { moduleType: 'asc' },
  })

  return rows.map((row) => ({
    type: row.moduleType as ModuleType,
    enabled: row.enabled,
    config: safeParseJson(row.config),
  }))
}

// ─── Composición del prompt ───────────────────────────────────

/**
 * Ensambla el prompt del sistema inyectando fragmentos de módulos activos.
 *
 * @param modules        Módulos del workspace (de loadWorkspaceModules)
 * @param basePrompt     Prompt base existente (customSystemPrompt del workspace)
 * @param businessName   Nombre del negocio (workspace.name)
 * @returns              ComposedPrompt con bloques listos y tools habilitadas
 */
export function composePrompt(
  modules: ComposedModule[],
  basePrompt: string,
  businessName: string
): ComposedPrompt {
  const blocks: string[] = []
  const tools: string[] = []
  let agentName = 'Jhon' // default

  const moduleMap = new Map(modules.map((m) => [m.type, m]))

  // ── Módulo: agent_profile ──────────────────────────────────
  const agentProfileMod = moduleMap.get('agent_profile')
  if (agentProfileMod?.enabled) {
    const cfg = agentProfileMod.config as AgentProfileConfig
    agentName = cfg.name || 'Jhon'
    const tone = cfg.tone || 'profesional y amigable'
    const greeting = cfg.greeting || ''
    const closing = cfg.closing || ''

    const lines = [
      `Tu nombre es ${agentName}, eres el asistente virtual de ${businessName}.`,
      `Tu tono debe ser ${tone}.`,
    ]
    if (greeting) lines.push(`Al iniciar una conversación nueva, saluda con: "${greeting}"`)
    if (closing) lines.push(`Para cerrar una conversación, usa: "${closing}"`)

    blocks.push(lines.join('\n'))
  }

  // ── Módulo: physical_location ─────────────────────────────
  const locationMod = moduleMap.get('physical_location')
  if (locationMod?.enabled) {
    const cfg = locationMod.config as PhysicalLocationConfig
    const lines: string[] = ['UBICACIÓN FÍSICA:']
    if (cfg.address) lines.push(`- Dirección: ${cfg.address}`)
    if (cfg.city) lines.push(`- Ciudad: ${cfg.city}`)
    if (cfg.hours) lines.push(`- Horario de atención: ${cfg.hours}`)
    if (cfg.mapUrl) lines.push(`- Mapa: ${cfg.mapUrl}`)
    if (cfg.hasParking) lines.push('- Cuenta con estacionamiento.')
    if (cfg.extraNotes) lines.push(`- Nota: ${cfg.extraNotes}`)
    lines.push(
      'Cuando el cliente pregunte por dirección, ubicación, horario o cómo llegar, usa estos datos exactos — NUNCA inventes ni uses placeholders.'
    )

    blocks.push(lines.join('\n'))
  } else if (locationMod && !locationMod.enabled) {
    // Módulo desactivado = negocio 100% en línea
    blocks.push('Operamos 100% en línea, sin sucursal física. No tenemos dirección para visitas.')
  }

  // ── Módulo: appointments ──────────────────────────────────
  const apptMod = moduleMap.get('appointments')
  if (apptMod?.enabled) {
    const cfg = apptMod.config as AppointmentsConfig
    const duration = cfg.durationMinutes || 30
    const minAdvance = cfg.minAdvanceHours || 2
    const instructions = cfg.customInstructions || ''

    const lines = [
      'GESTIÓN DE CITAS:',
      `Las citas (llamada/reunión) duran ${duration} minutos y se agendan con al menos ${minAdvance} hora(s) de anticipación.`,
      'IMPORTANTE: NO tienes una cola de verificación asíncrona. NUNCA digas "voy a verificar disponibilidad y te confirmo", "déjame checar y te aviso" ni dejes al cliente esperando una confirmación posterior — esa confirmación no llegará.',
      'Cuando el cliente pida una cita: si el horario cae dentro del horario de atención, CONFÍRMALO en el MISMO mensaje. Si no lo da o cae fuera de horario, ofrece 2 horarios concretos válidos y pídele que elija — todo en el mismo mensaje.',
      'Cuando el cliente elija o confirme un horario, dalo por agendado en ese momento (el sistema lo registra automáticamente al confirmar). NO vuelvas a preguntar el horario que ya eligió.',
      'Si el cliente reagenda ("ese día no puedo", "mejor el martes"), el NUEVO horario REEMPLAZA al anterior: confirma únicamente el nuevo y nunca regreses al horario viejo.',
    ]
    if (instructions) lines.push(`Reglas de agenda del negocio: ${instructions}`)

    blocks.push(lines.join('\n'))
  }

  // ── Módulo: catalog ───────────────────────────────────────
  const catalogMod = moduleMap.get('catalog')
  if (catalogMod?.enabled) {
    const cfg = catalogMod.config as CatalogConfig
    const currency = cfg.currency || 'MXN'
    const showPrices = cfg.showPrices !== false
    const instructions = cfg.customInstructions || ''

    const lines = [
      'CATÁLOGO DE PRODUCTOS/SERVICIOS:',
      `El inventario REAL del negocio se inyecta aparte (lista "INVENTARIO REAL DISPONIBLE"). Usa SOLO esos productos y precios; NUNCA inventes modelos, precios ni disponibilidad.`,
      showPrices
        ? `Puedes compartir precios con los clientes (moneda: ${currency}).`
        : 'No compartas precios directamente; invita al cliente a solicitar una cotización.',
    ]
    if (instructions) lines.push(instructions)

    blocks.push(lines.join('\n'))
  }

  // ── PLAYBOOK DE OBJECIONES (B4, 2026-07-20) ────────────────
  // Método fijo de 4 pasos para CADA objeción — antes el bot improvisaba y
  // solía rendirse ("ok, aquí estoy si algo se ofrece") en vez de trabajarla.
  blocks.push(`MANEJO DE OBJECIONES — MÉTODO OBLIGATORIO (4 pasos, en un solo mensaje natural):
1) VALIDA sin discutir ("te entiendo, es normal pensarlo").
2) AÍSLA con una pregunta: "¿es lo único que te detiene, o hay algo más?" — descubre la objeción REAL.
3) REENCUADRA según el tipo:
   • "ESTÁ CARO / no me alcanza" → nunca defiendas el precio; muévete a MENSUALIDAD y enganche ("¿qué mensualidad te acomodaría?"), u ofrece una alternativa real del inventario en su rango.
   • "LO VOY A PENSAR" → es cortesía, no una razón. Aísla QUÉ va a pensar exactamente y resuélvelo hoy; ofrece apartar/ver la unidad sin compromiso.
   • "ME RECHAZARON EL CRÉDITO / mal buró" → no lo descartes: pregunta si fue reciente, menciona que hay opciones con mayor enganche o financieras alternas, y ofrece precalificarlo.
   • "ESTOY VIENDO OTRAS OPCIONES / otra agencia" → no hables mal del competidor; pregunta QUÉ está comparando y posiciona tu diferencial concreto (garantía, historial, respaldo).
   • "NO ES BUEN MOMENTO / luego te busco" → valida y baja la apuesta: en vez de la venta, ofrece el paso pequeño (guardarle la ficha, avisarle si baja de precio, una visita de 15 min).
4) MICRO-CIERRE: termina SIEMPRE con una pregunta pequeña que avance (elegir horario, monto de enganche, ver fotos) — nunca cierres con "aquí estoy para lo que necesites".
Si la ficha del lead trae "Objeción principal", trabájala PROACTIVAMENTE con este método sin esperar a que la repita. Tras 2 intentos sobre la MISMA objeción, respeta la decisión y deja la puerta abierta con elegancia.`)

  return {
    systemPromptBlocks: blocks,
    activeTools: tools,
    agentName,
  }
}

/**
 * Genera el bloque final de instrucciones de módulos para inyectar
 * en el sistema de prompts. Retorna string vacío si no hay módulos activos.
 */
export function buildModuleContext(composed: ComposedPrompt): string {
  if (composed.systemPromptBlocks.length === 0) return ''

  return composed.systemPromptBlocks.join('\n\n')
}

// ─── Reemplaza placeholders usando datos de módulos ───────────

/**
 * Reemplaza los placeholders legacy [PLACEHOLDER] del customSystemPrompt
 * usando datos de los módulos activos (si están disponibles) o los fallbacks
 * del workspace.settings tradicional.
 */
export function resolvePlaceholders(
  template: string,
  params: {
    businessName?: string
    agentName?: string
    address?: string
    phone?: string
    hours?: string
    appointmentUrl?: string
    currentDate?: string
  }
): string {
  const {
    businessName = 'nuestro negocio',
    agentName = 'Jhon',
    address = 'nuestra oficina',
    phone = 'nuestro número de contacto',
    hours = 'nuestro horario de atención',
    appointmentUrl = 'contáctanos para agendar',
    currentDate = new Date().toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  } = params

  return template
    .replace(/\[EMPRESA\]/gi, businessName)
    .replace(/\[NOMBRE_AGENCIA\]/gi, businessName)
    .replace(/\[AGENCIA\]/gi, businessName)
    .replace(/\[NOMBRE\]/gi, agentName)
    .replace(/\[DIRECCIÓN CONCRETA\]/gi, address)
    .replace(/\[DIRECCIÓN\]/gi, address)
    .replace(/\[TELÉFONO\]/gi, phone)
    .replace(/\[HORARIO\]/gi, hours)
    .replace(/\[LINK_CITAS\]/gi, appointmentUrl)
    .replace(/\[FECHA ACTUAL\]/gi, currentDate)
}

// ─── Helpers ──────────────────────────────────────────────────

function safeParseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─── Psychological Hooks ──────────────────────────────────────

/**
 * Loads active psychological hooks for a workspace and returns a prompt block.
 * The block is grouped by category and appended to the system prompt so the
 * AI can naturally weave them into the conversation.
 *
 * Returns empty string if no hooks are configured.
 */
export async function loadHooksBlock(workspaceId: string): Promise<string> {
  try {
    const hooks = await db.hook.findMany({
      where: { workspaceId, isActive: true },
      orderBy: [{ winCount: 'desc' }, { usageCount: 'desc' }],
      take: 30,
    })

    if (hooks.length === 0) return ''

    const grouped: Record<string, string[]> = {}
    for (const hook of hooks) {
      if (!grouped[hook.category]) grouped[hook.category] = []
      grouped[hook.category].push(hook.text)
    }

    const CATEGORY_LABELS: Record<string, string> = {
      scarcity: 'Escasez',
      urgency: 'Urgencia',
      social_proof: 'Prueba social',
      reciprocity: 'Reciprocidad',
      microclose: 'Microcierre',
      objection: 'Manejo de objeciones',
    }

    const lines: string[] = [
      'RECURSOS PSICOLÓGICOS DE VENTA — úsalos cuando sea natural y oportuno:',
    ]

    for (const [cat, texts] of Object.entries(grouped)) {
      lines.push(`\n[${CATEGORY_LABELS[cat] ?? cat}]`)
      for (const text of texts.slice(0, 5)) {
        lines.push(`• ${text}`)
      }
    }

    lines.push(
      '\nNota: integra estos recursos de forma fluida en la conversación, nunca como listas literales.',
    )

    return lines.join('\n')
  } catch {
    return '' // non-critical
  }
}

// ─── Base de conocimiento (RAG-lite) ─────────────────────────
// Recupera los fragmentos de los documentos de la empresa (KnowledgeDoc) más
// relevantes al mensaje del cliente y los inyecta para que el agente responda
// con datos REALES y no invente. Recuperación por solapamiento de palabras
// clave (sin base vectorial): suficiente para catálogos, manuales y FAQs.

interface KChunk { docId: string; title: string; sourceType: string; text: string }
const _kbCache = new Map<string, { chunks: KChunk[]; ts: number }>()
const KB_TTL = 60_000

function kbNormalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
function kbChunk(text: string, size = 650): string[] {
  const out: string[] = []
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size))
  return out.slice(0, 20) // tope por documento
}
async function loadKbChunks(workspaceId: string): Promise<KChunk[]> {
  const cached = _kbCache.get(workspaceId)
  if (cached && Date.now() - cached.ts < KB_TTL) return cached.chunks
  let chunks: KChunk[] = []
  try {
    const docs = await db.knowledgeDoc.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, title: true, sourceType: true, content: true },
    })
    for (const d of docs) for (const t of kbChunk(d.content)) chunks.push({ docId: d.id, title: d.title, sourceType: d.sourceType, text: t })
  } catch { chunks = [] }
  _kbCache.set(workspaceId, { chunks, ts: Date.now() })
  return chunks
}

/**
 * Bloque de conocimiento relevante al mensaje. Devuelve '' si no hay documentos
 * o ninguno matchea. No-throwing.
 */
export async function loadKnowledgeBlock(workspaceId: string, query: string): Promise<string> {
  try {
    const chunks = await loadKbChunks(workspaceId)
    if (chunks.length === 0) return ''
    const qTokens = Array.from(new Set(kbNormalize(query).split(' ').filter((w) => w.length >= 4)))
    if (qTokens.length === 0) return ''
    const scored = chunks.map((c) => {
      const norm = kbNormalize(c.text)
      let score = 0
      for (const t of qTokens) if (norm.includes(t)) score++
      return { c, score }
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
    if (scored.length === 0) return ''
    const lines: string[] = ['BASE DE CONOCIMIENTO DE LA EMPRESA (responde con base en ESTO; si la respuesta está aquí, úsala tal cual y NO inventes):']
    for (const s of scored) lines.push(`\n[${s.c.title}]\n${s.c.text.trim()}`)
    return lines.join('\n')
  } catch {
    return ''
  }
}

// ─── Lecciones / correcciones (entrenamiento in-context) ──────

/**
 * Construye el bloque de "lecciones del vendedor" a partir de las correcciones
 * y ejemplos que el operador enseñó (AiTrainingExample). Se inyecta en el prompt
 * para que la IA deje de repetir errores corregidos e imite al vendedor humano.
 * No-throwing — si falla devuelve cadena vacía.
 */
export async function loadTrainingBlock(workspaceId: string): Promise<string> {
  try {
    const examples = await db.aiTrainingExample.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })
    if (examples.length === 0) return ''

    const corrections = examples.filter((e) => e.type === 'correction')
    const goodExamples = examples.filter((e) => e.type === 'example')
    const lines: string[] = []

    if (corrections.length > 0) {
      lines.push('LECCIONES DEL VENDEDOR (correcciones reales — respétalas SIEMPRE, no repitas estos errores):')
      for (const c of corrections) {
        lines.push(`\n• Cuando el cliente diga o el contexto sea: "${c.trigger.trim()}"`)
        if (c.badResponse?.trim()) lines.push(`  ❌ NO respondas como: "${c.badResponse.trim()}"`)
        lines.push(`  ✅ Responde en este sentido: "${c.goodResponse.trim()}"`)
        if (c.note?.trim()) lines.push(`  (Motivo: ${c.note.trim()})`)
      }
    }

    if (goodExamples.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('EJEMPLOS DE BUENAS RESPUESTAS DEL VENDEDOR HUMANO (imita este estilo y enfoque):')
      for (const e of goodExamples) {
        lines.push(`• Cliente: "${e.trigger.trim()}" → Vendedor: "${e.goodResponse.trim()}"`)
      }
    }

    lines.push('\nNota: adapta estas lecciones al contexto real; no las cites de forma literal ni las menciones al cliente.')
    return lines.join('\n')
  } catch {
    return '' // non-critical
  }
}

