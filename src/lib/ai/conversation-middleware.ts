// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Conversation Middleware
// Capa de control ligera que NO altera el sistema base
// Arquitectura: INPUT → debounce → extractor → modelo → post-procesador → OUTPUT
// ═══════════════════════════════════════════════════════════════

import { debug } from '@/lib/logger'
import {
  type ConversationState,
  type ConversationStage,
  getState,
  extractAndUpdate,
  detectStage,
  advanceStage,
  filterRepetitions,
  buildContextBlock,
  registrarPregunta,
  detectarCorreccion,
  clearState,
} from './conversation-state'

// ─── Types ──────────────────────────────────────────────────

export interface MiddlewareInput {
  phone: string
  text: string
  pushName?: string
  remoteJid: string
  externalId: string
  conversationId: string
}

export interface MiddlewareOutput {
  /** Mensaje(s) consolidado(s) del usuario (si hubo batching) */
  consolidatedText: string
  /** Bloque de contexto a inyectar en el system prompt */
  contextBlock: string
  /** Estado actualizado */
  state: ConversationState
  /** Etapa detectada */
  detectedStage: ConversationStage
  /** Hubo corrección del usuario */
  hadCorrection: boolean
}

export interface PostProcessResult {
  /** Respuesta filtrada (sin preguntas repetidas) */
  filteredResponse: string
  /** Preguntas eliminadas (para logging) */
  removedQuestions: string[]
  /** Respuesta fue modificada */
  wasModified: boolean
}

// ═══════════════════════════════════════════════════════════════
// DEBOUNCE / BATCHING
// Cuando llegan múltiples mensajes seguidos del mismo usuario,
// los agrupamos en un solo lote y generamos UNA sola respuesta
// ═══════════════════════════════════════════════════════════════

interface PendingBatch {
  messages: Array<{ text: string; pushName?: string }>
  timer: NodeJS.Timeout
  resolve: (text: string) => void
}

const pendingBatches = new Map<string, PendingBatch>()

/** Tiempo de espera para agrupar mensajes (ms) */
const DEBOUNCE_MS = 3500

/**
 * Agrega un mensaje al batch del usuario.
 * Si es el primero, inicia un timer de DEBOUNCE_MS.
 * Cuando el timer expira, retorna el texto consolidado de todos los mensajes.
 */
export function enqueueMessage(phone: string, text: string, pushName?: string): Promise<string> {
  return new Promise((resolve) => {
    const existing = pendingBatches.get(phone)

    if (existing) {
      // Agregar al batch existente
      existing.messages.push({ text, pushName })
      debug(`[Middleware] Batch +1 para ${phone} (total: ${existing.messages.length})`)

      // Resetear timer (dar más tiempo para que lleguen más mensajes)
      clearTimeout(existing.timer)
      existing.timer = setTimeout(() => {
        const consolidated = consolidateMessages(existing.messages)
        pendingBatches.delete(phone)
        debug(`[Middleware] Batch listo para ${phone}: ${existing.messages.length} mensajes → ${consolidated.length} chars`)
        resolve(consolidated)
      }, DEBOUNCE_MS)
    } else {
      // Crear nuevo batch
      const batch: PendingBatch = {
        messages: [{ text, pushName }],
        timer: setTimeout(() => {
          const consolidated = consolidateMessages(batch.messages)
          pendingBatches.delete(phone)
          debug(`[Middleware] Batch listo para ${phone}: ${batch.messages.length} mensajes → ${consolidated.length} chars`)
          resolve(consolidated)
        }, DEBOUNCE_MS),
        resolve,
      }
      pendingBatches.set(phone, batch)
      debug(`[Middleware] Nuevo batch para ${phone}, esperando ${DEBOUNCE_MS}ms...`)
    }
  })
}

/**
 * Fuerza el envío inmediato de los mensajes pendientes de un batch
 * (útil cuando el sistema se reinicia o se necesita respuesta rápida)
 */
export function flushBatch(phone: string): string | null {
  const batch = pendingBatches.get(phone)
  if (!batch) return null

  clearTimeout(batch.timer)
  pendingBatches.delete(phone)
  const consolidated = consolidateMessages(batch.messages)
  batch.resolve(consolidated)
  return consolidated
}

/**
 * Combina múltiples mensajes en uno solo, uniendo con saltos de línea.
 */
function consolidateMessages(messages: Array<{ text: string; pushName?: string }>): string {
  if (messages.length === 1) return messages[0].text

  // Si son mensajes cortos (tipo chat rápido), unir con espacio
  // Si son mensajes largos, unir con salto de línea
  const avgLength = messages.reduce((sum, m) => sum + m.text.length, 0) / messages.length

  if (avgLength < 60) {
    // Mensajes cortos → unir como un solo párrafo
    return messages.map(m => m.text).join(' ')
  }

  // Mensajes más largos → unir con separadores
  return messages.map(m => m.text).join('\n')
}

// ═══════════════════════════════════════════════════════════════
// PRE-PROCESAMIENTO (antes de enviar al modelo)
// ═══════════════════════════════════════════════════════════════

/**
 * Pipeline de pre-procesamiento:
 * 1. Obtener/crear estado de conversación
 * 2. Detectar correcciones del usuario
 * 3. Extraer información del texto consolidado
 * 4. Detectar etapa de la conversación
 * 5. Generar bloque de contexto
 *
 * @returns MiddlewareOutput con todo lo necesario para el modelo
 */
export function preProcess(input: MiddlewareInput): MiddlewareOutput {
  const state = getState(input.phone)

  // 1. Detectar si el usuario está corrigiendo información previa
  const hadCorrection = detectarCorreccion(state, input.text)
  if (hadCorrection) {
    // Si el usuario corrige, no retroceder etapa pero permitir sobrescritura de datos
    debug(`[Middleware] Corrección detectada para ${input.phone}, permitiendo sobrescritura de datos`)
  }

  // 2. Extraer información del texto consolidado
  extractAndUpdate(state, input.text)

  // 3. Actualizar nombre si viene del pushName y no lo tenemos
  if (input.pushName && !state.nombre && input.pushName.length >= 3) {
    // Solo si parece un nombre real (no emoji, no número)
    if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+$/.test(input.pushName)) {
      state.nombre = input.pushName.trim()
    }
  }

  // 4. Detectar y avanzar etapa
  const detectedStage = detectStage(state, input.text)
  if (detectedStage !== state.etapa) {
    debug(`[Middleware] Etapa avanzó: ${state.etapa} → ${detectedStage} para ${input.phone}`)
    advanceStage(state, detectedStage)
  }

  // 5. Generar bloque de contexto
  const contextBlock = buildContextBlock(state)

  // 6. Incrementar turnos sin progreso si seguimos en la misma etapa
  if (state.etapa !== 'saludo' && state.etapa !== 'desconocido') {
    state.turnosSinProgreso++
  }

  debug(`[Middleware] Pre-procesamiento completo para ${input.phone}:`, {
    etapa: state.etapa,
    datosConfirmados: state.datos_confirmados.length,
    nombre: state.nombre,
    dolor: state.dolor ? 'sí' : 'no',
    turnosSinProgreso: state.turnosSinProgreso,
  })

  return {
    consolidatedText: input.text,
    contextBlock,
    state,
    detectedStage,
    hadCorrection,
  }
}

// ═══════════════════════════════════════════════════════════════
// POST-PROCESAMIENTO (después de la respuesta del modelo)
// ═══════════════════════════════════════════════════════════════

/**
 * Pipeline de post-procesamiento:
 * 1. Filtrar preguntas repetidas
 * 2. Eliminar contradicciones
 * 3. Asegurar continuidad con contexto previo
 * 4. Evitar regresar a preguntas ya respondidas
 *
 * @returns Respuesta filtrada lista para enviar
 */
export function postProcess(response: string, state: ConversationState): PostProcessResult {
  if (!response || response.trim().length === 0) {
    return { filteredResponse: response, removedQuestions: [], wasModified: false }
  }

  let filtered = response
  const removedQuestions: string[] = []
  const original = response

  // 1. Filtrar preguntas repetidas usando el estado
  filtered = filterRepetitions(filtered, state)

  // 2. Eliminar saludos repetidos si ya estamos avanzados
  if (state.etapa !== 'saludo' && state.etapa !== 'desconocido') {
    filtered = removeRepeatedGreeting(filtered)
  }

  // 3. Evitar respuestas que contradigan datos confirmados
  filtered = removeContradictions(filtered, state)

  // 4. Si después de todo el filtrado queda muy corto (< 20 chars),
  // devolver la respuesta original (es mejor que nada)
  if (filtered.trim().length < 20 && original.trim().length > 30) {
    debug('[Middleware] Post-proceso filtró demasiado, usando original')
    filtered = original
  }

  const wasModified = filtered !== original
  if (wasModified) {
    debug(`[Middleware] Respuesta post-procesada (${original.length} → ${filtered.length} chars)`)
  }

  // 5. Registrar la pregunta de la respuesta final para futuro anti-repetición
  registrarPregunta(state, filtered)

  return {
    filteredResponse: filtered.trim(),
    removedQuestions,
    wasModified,
  }
}

// ─── Helpers de post-procesamiento ─────────────────────────

/**
 * Elimina saludos repetidos en conversaciones avanzadas.
 * "¡Hola! ¿Cómo estás?" → "" si ya llevamos 3+ turnos
 */
function removeRepeatedGreeting(text: string): string {
  const greetings = [
    /^¡?\s*Hola[,!]?\s*/i,
    /^¡?\s*Buenos d[ií]as[,!]?\s*/i,
    /^¡?\s*Buenas tardes[,!]?\s*/i,
    /^¡?\s*Buenas noches[,!]?\s*/i,
    /^¡?\s*Qué tal[,!]?\s*/i,
    /^¡?\s*Buen d[ií]a[,!]?\s*/i,
  ]

  let result = text
  for (const pattern of greetings) {
    result = result.replace(pattern, '')
  }

  return result.trim() || text // Devolver original si queda vacío
}

/**
 * Detecta y elimina contradicciones con datos confirmados.
 * Ej: Si el usuario dijo "recibo 150 msj", no decir "cuántos mensajes recibes"
 */
function removeContradictions(text: string, state: ConversationState): string {
  let result = text
  const normalized = text.toLowerCase()

  // Si sabemos su negocio y la respuesta pregunta qué hace
  if (state.tipo_negocio) {
    const patron = /\b(?:a qué te dedicas|qué tipo de negocio tienes|en qué sector estás)\b/i
    if (patron.test(normalized)) {
      result = result.replace(new RegExp(patron.source, 'gi'), '')
      debug(`[Middleware] Contradicción eliminada: preguntaba tipo de negocio pero ya sabemos "${state.tipo_negocio}"`)
    }
  }

  // Si sabemos su volumen y pregunta cuántos mensajes recibe
  if (state.leads_semanales !== null) {
    const patron = /\b(?:cuántos mensajes recibes|cuál es tu volumen|cuántos leads tienes)\b/i
    if (patron.test(normalized)) {
      result = result.replace(new RegExp(patron.source, 'gi'), '')
      debug(`[Middleware] Contradicción eliminada: preguntaba volumen pero ya sabemos ~${state.leads_semanales}`)
    }
  }

  // Si sabemos su dolor y pregunta cuál es su problema
  if (state.dolor) {
    const patron = /\b(?:cuál es tu mayor (?:problema|desafío|reto|dolor)|qué se te dificulta más)\b/i
    if (patron.test(normalized)) {
      result = result.replace(new RegExp(patron.source, 'gi'), '')
      debug(`[Middleware] Contradicción eliminada: preguntaba dolor pero ya sabemos "${state.dolor?.slice(0, 40)}"`)
    }
  }

  // Limpiar espacios dobles
  result = result.replace(/\s+/g, ' ').trim()

  return result || text
}

// ═══════════════════════════════════════════════════════════════
// INYECCIÓN DE CONTEXTO EN MENSAJES
// Inyecta el bloque de contexto como primer mensaje 'system'
// DESPUÉS del system prompt original, SIN modificar el original
// ═══════════════════════════════════════════════════════════════

/**
 * Inyecta el bloque de contexto del middleware en los mensajes
 * que se enviarán al modelo. Se agrega DESPUÉS del primer system message.
 */
export function injectContext(
  messages: Array<{ role: string; content: string }>,
  contextBlock: string
): Array<{ role: string; content: string }> {
  if (!contextBlock || contextBlock.trim().length === 0) return messages

  // Buscar el primer mensaje 'system' y agregar el contexto DESPUÉS de él
  const systemIdx = messages.findIndex(m => m.role === 'system')

  if (systemIdx === -1) {
    // No hay system message, agregar al inicio
    return [
      { role: 'system', content: contextBlock },
      ...messages,
    ]
  }

  // Insertar después del system message original
  const result = [...messages]
  result.splice(systemIdx + 1, 0, { role: 'system', content: contextBlock })

  return result
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════

/**
 * Limpia el estado de una conversación (para testing o reset manual)
 */
export function resetConversation(phone: string): void {
  flushBatch(phone)
  clearState(phone)
  debug(`[Middleware] Estado reseteado para ${phone}`)
}

/**
 * Obtiene el número de conversations activas en memoria
 */
export function getActiveConversationsCount(): number {
  const globalForState = globalThis as unknown as { _conversationStates?: Map<string, unknown> }
  return pendingBatches.size
}

/**
 * Limpia batches pendientes (para shutdown limpio)
 */
export function flushAllBatches(): void {
  pendingBatches.forEach((_, phone) => {
    flushBatch(phone)
  })
}
