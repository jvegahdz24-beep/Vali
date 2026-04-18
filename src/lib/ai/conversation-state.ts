// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Conversation State Manager
// In-memory structured state per conversation (by phone number)
// Tracks extracted data, prevents repetition, detects stage
// ═══════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────

export interface ConversationState {
  // Datos extraídos del usuario
  nombre: string | null
  tipo_negocio: string | null
  interes: string | null       // qué producto/servicio le interesa
  leads_semanales: number | null
  presupuesto_ads: number | null
  dolor: string | null         // frustration/pain point principal
  vehiculo: string | null      // modelo específico mencionado
  presupuesto: string | null   // rango de presupuesto
  etapa: ConversationStage
  datos_confirmados: string[]  // campos ya confirmados/respondidos

  // Control de flujo
  ultimaPregunta: string | null   // última pregunta hecha por la IA
  preguntasHechas: string[]       // todas las preguntas ya hechas
  turnosSinProgreso: number       // turnos sin avanzar etapa
  ultimoTurnoAI: number           // timestamp del último turno IA
  estaProcesando: boolean         // lock para evitar procesamiento doble
}

export type ConversationStage =
  | 'saludo'
  | 'diagnostico'
  | 'dolor'
  | 'solucion'
  | 'cierre'
  | 'desconocido'

// ─── State Store (in-memory, per phone) ────────────────────

const states = new Map<string, ConversationState>()

// Limpieza automática cada 30 min (conversaciones inactivas > 2h)
const STATE_TTL_MS = 2 * 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  states.forEach((state, phone) => {
    if (now - state.ultimoTurnoAI > STATE_TTL_MS) {
      states.delete(phone)
    }
  })
}, 30 * 60 * 1000)

// ─── Get or Create State ───────────────────────────────────

export function getState(phone: string): ConversationState {
  let state = states.get(phone)
  if (!state) {
    state = createEmptyState()
    states.set(phone, state)
  }
  return state
}

export function createEmptyState(): ConversationState {
  return {
    nombre: null,
    tipo_negocio: null,
    interes: null,
    leads_semanales: null,
    presupuesto_ads: null,
    dolor: null,
    vehiculo: null,
    presupuesto: null,
    etapa: 'desconocido',
    datos_confirmados: [],
    ultimaPregunta: null,
    preguntasHechas: [],
    turnosSinProgreso: 0,
    ultimoTurnoAI: Date.now(),
    estaProcesando: false,
  }
}

export function clearState(phone: string): void {
  states.delete(phone)
}

// ═══════════════════════════════════════════════════════════════
// INFORMACIÓN EXTRACTOR
// Analiza texto del usuario y extrae datos clave al estado
// ═══════════════════════════════════════════════════════════════

// ─── Patrones de extracción ────────────────────────────────

const PATTERNS = {
  nombre: [
    // "me llamo Juan", "soy Juan", "mi nombre es Juan", "juan aquí"
    /\b(?:me llamo|soy|mi nombre es|yo soy|me dicen)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/i,
    // "juan aquí", "pedro hablando"
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+(?:aqu[ií]|hablando|por aqu[ií])/i,
  ],

  tipo_negocio: [
    /\b(?:tengo|dirijo|manejo|soy dueño de|oper[oó]|vendo|trabajo en)\s+(?:una|un|mi)\s+(agencia|concesionaria|departamento|negocio|tienda|taller|clinica|consultorio|restaurante|hotel|inmobiliaria|despacho|oficina|auto[tl]o|consultor[ií]a)\b/i,
    /\b(?:somos|es)\s+(?:una|un)\s+(agencia|concesionaria|negocio|empresa|compañía)\b/i,
    /\b(asesor|agente|vendedor|broker|distribuidor)\b/i,
    /\bautomotriz\b/i,
    /\b(uto|max|car|dealer|auto)\w*\b/i,
  ],

  interes: [
    /\b(valiautoflow|valiflow|automatizaci[oó]n|bot|chatbot|asistente virtual|crm|ia|inteligencia artificial)\b/i,
    /\b(sistema|software|plataforma|herramienta|app|aplicaci[oó]n)\s+(?:de\s+)?(?:whatsapp|ventas|atenci[oó]n|mensajer[ií]a)\b/i,
    /\bresponder\s+(?:los\s+)?(?:clientes|leads|mensajes)\b/i,
  ],

  leads_semanales: [
    /\b(\d{2,5})\s*(?:a\s*)?(\d{2,5})?\s*(?:msj|mensaje|lead|prospecto|cliente|contacto)s?\s*(?:al\s+)?(?:d[ií]a|semana|mes)?/i,
    /\b(?:recibo|llegan|entran|tengo|me llegan)\s+(\d{2,5})\s*(?:a\s*)?(\d{2,5})?\s*(?:msj|mensaje|lead|prospecto)s?\b/i,
    /\b(\d{2,5})\s*(?:a\s*)?(\d{2,5})?\s*(?:a la semana|por semana|semanales|diarios|al d[ií]a)\b/i,
    /\bpor\s+semana\s+(?:son|son\s+mas de|recibo|tengo)\s+(\d{2,5})/i,
  ],

  presupuesto_ads: [
    /\b(?:gasto|invierto|pago|presupuesto|inversi[oó]n)\s+(?:en\s+)?(?:ads|publicidad|facebook|google|marketing|anuncios)\s+(?:de|son|aprox\.?)\s+\$?(\d{3,7})/i,
    /\$?(\d{3,7})\s*(?:pesos|mxn)?\s*(?:en\s+)?(?:ads|publicidad|marketing)\b/i,
  ],

  dolor: [
    /\bno\s+(?:puedo|alcanzo|logro|puedo)\s+(?:contestar|responder|atender)\b/i,
    /\bno\s+da\s+(?:el tiempo|abasto|suficiente)\b/i,
    /\b(saturado|abrumado|agobiado|derrumbado|overwhelmed)\b/i,
    /\b(?:pierdo|se me van|se escapan|pierden)\s+(?:ventas|clientes|leads|oportunidades)\b/i,
    /\b(?:tarde|demasiado tarde|horas despu[eé]s|d[ií]as despu[eé]s)\b/i,
    /\b(?:contestar|responder)\s+(?:a\s+)?(?:todos?|todo)\s+(?:los\s+)?(?:mensajes|clientes)\b.*\b(?:no\s+)?(?:puedo|puede)\b/i,
    /\bcuando\s+(?:ya\s+)?(?:puedo|logro|puedo)\s+contesta/i,
    /\b(?:nadie|casi nadie)\s+(?:contesta|responde|llama|contestamos)\b/i,
    /\b(?:cuesta|es dificil|es difícil|es complicado)\s+(?:trabajo|dar|mantener)\s+(?:seguimiento|abasto)\b/i,
  ],

  vehiculo: [
    /\b(sentra|versa|kicks|tsuru|marcha|frontier|np300|pathfinder|altima|maxima|murano|rogue|corolla|camry|rav4|hilux|yaris|civic|cr-v|hr-v|accord|cx-5|cx-3|jetta|golf|tiguan|taos|aveo|tracker|mustang|ranger|tucson|creta|accent|sorento|sportage)\b/i,
    /\b(suv|sedan|hatchback|pickup|camioneta|deportivo|coupe)\b/i,
  ],

  presupuesto: [
    /\b(?:presupuesto|rango|pagar[ií]a|disponible|considero|aprox\.?)\s+(?:de|son|hasta|maximo|m[aá]ximo)?\s*\$?\s*(\d[\d,.]+(?:\s*(?:a|al|hasta)\s*\d[\d,.]+)?)\s*(?:pesos|mxn|miles)?\b/i,
    /\bhasta\s+\$?(\d[\d,.]+)\b/i,
    /\b\$?(\d[\d,.]+)\s*(?:mensuales|al mes|pesos)\b/i,
  ],
}

// ─── Extractor principal ───────────────────────────────────

export function extractAndUpdate(state: ConversationState, text: string): void {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  // 1. Nombre
  for (const pattern of PATTERNS.nombre) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match && match[1]) {
      const nombreExtraido = match[1].trim()
      // Solo actualizar si es razonable (3+ chars, no es una palabra común)
      if (nombreExtraido.length >= 3 && !['aquí', 'hablando', 'esto', 'este', 'auto', 'cars'].includes(nombreExtraido.toLowerCase())) {
        if (state.nombre !== nombreExtraido) {
          state.nombre = nombreExtraido
          confirmarDato(state, 'nombre')
        }
        break
      }
    }
  }

  // 2. Tipo de negocio
  for (const pattern of PATTERNS.tipo_negocio) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      const negocio = match[1] || match[0]
      if (negocio.length >= 4) {
        state.tipo_negocio = negocio.toLowerCase()
        confirmarDato(state, 'tipo_negocio')
        break
      }
    }
  }

  // 3. Interés (producto/servicio)
  for (const pattern of PATTERNS.interes) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      state.interes = match[0].toLowerCase()
      confirmarDato(state, 'interes')
      break
    }
  }

  // 4. Leads semanales / volumen
  for (const pattern of PATTERNS.leads_semanales) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      const num1 = parseInt(match[1], 10)
      const num2 = match[2] ? parseInt(match[2], 10) : null
      if (!isNaN(num1) && num1 >= 5) {
        // Si menciona rango (ej "20 a 25"), usar el promedio
        if (num2 && !isNaN(num2) && num2 > num1) {
          state.leads_semanales = Math.round((num1 + num2) / 2)
        } else {
          state.leads_semanales = num1
        }
        confirmarDato(state, 'leads_semanales')
        break
      }
    }
  }

  // 5. Presupuesto en ads
  for (const pattern of PATTERNS.presupuesto_ads) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      const monto = parseInt(match[1], 10)
      if (!isNaN(monto) && monto >= 100) {
        state.presupuesto_ads = monto
        confirmarDato(state, 'presupuesto_ads')
        break
      }
    }
  }

  // 6. Dolor / frustración
  for (const pattern of PATTERNS.dolor) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      // Solo actualizar si no hay dolor ya registrado, o si el usuario
      // lo está repitiendo / ampliando (no sobrescribir, acumular)
      if (!state.dolor) {
        state.dolor = match[0].toLowerCase()
        confirmarDato(state, 'dolor')
      } else if (!state.dolor.includes(match[0].toLowerCase().slice(0, 20))) {
        // Añadir si es un dolor diferente
        state.dolor += `, ${match[0].toLowerCase()}`
      }
      break
    }
  }

  // 7. Vehículo
  for (const pattern of PATTERNS.vehiculo) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      const vehiculo = match[1] || match[0]
      if (vehiculo.length >= 3) {
        state.vehiculo = vehiculo.toLowerCase()
        confirmarDato(state, 'vehiculo')
        break
      }
    }
  }

  // 8. Presupuesto
  for (const pattern of PATTERNS.presupuesto) {
    const match = normalized.match(pattern) || text.match(pattern)
    if (match) {
      state.presupuesto = match[1]?.trim() || match[0].trim()
      confirmarDato(state, 'presupuesto')
      break
    }
  }
}

// ─── Confirmar dato extraído ──────────────────────────────

function confirmarDato(state: ConversationState, campo: string): void {
  if (!state.datos_confirmados.includes(campo)) {
    state.datos_confirmados.push(campo)
  }
  // Resetear contador de turnos sin progreso cuando hay avance
  state.turnosSinProgreso = 0
}

// ═══════════════════════════════════════════════════════════════
// DETECCIÓN DE ETAPA (SOFT)
// Solo para evitar retrocesos, NO cambia personalidad
// ═══════════════════════════════════════════════════════════════

const STAGE_KEYWORDS: Record<ConversationStage, string[]> = {
  saludo: [
    'hola', 'buenos días', 'buenas tardes', 'buenas noches', 'qué onda',
    'ey', 'hi', 'hey', 'saludos', 'qué tal', 'buen día',
  ],
  diagnostico: [
    'tengo', 'trabajo', 'manejo', 'operamos', 'nos dedicamos',
    'mi negocio', 'agencia', 'cuántos', 'volumen', 'leads',
    'clientes', 'prospectos', 'msj', 'mensajes',
  ],
  dolor: [
    'no puedo', 'difícil', 'imposible', 'saturado', 'agobiado',
    'pierdo', 'se escapan', 'tarde', 'demasiado', 'abrumado',
    'no da abasto', 'no alcanzo', 'frustrado',
  ],
  solucion: [
    'cómo funciona', 'cuánto cuesta', 'precio', 'demo', 'probar',
    'interesa', 'quiero', 'me gusta', 'suena bien', 'perfecto',
    'genial', 'excelente', 'dime más',
  ],
  cierre: [
    'agendar', 'cita', 'empezar', 'contratar', 'comprar',
    'iniciar', 'ya quiero', 'vamos', 'trato', 'comenzar',
    'quiero probar', '¿cómo inicio',
  ],
  desconocido: [],
}

export function detectStage(state: ConversationState, text: string): ConversationStage {
  const normalized = text.toLowerCase()

  // Si ya está en una etapa avanzada, no retroceder a menos que haya señales claras
  const etapaActual = state.etapa
  const etapaOrden: ConversationStage[] = ['desconocido', 'saludo', 'diagnostico', 'dolor', 'solucion', 'cierre']
  const idxActual = etapaOrden.indexOf(etapaActual)

  for (const [etapa, keywords] of Object.entries(STAGE_KEYWORDS) as [ConversationStage, string[]][]) {
    const idxNuevo = etapaOrden.indexOf(etapa)

    // Solo avanzar o mantener, no retroceder (salvo si es desconocido)
    if (idxNuevo <= idxActual && etapaActual !== 'desconocido') continue

    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return etapa
      }
    }
  }

  return etapaActual
}

export function advanceStage(state: ConversationState, newStage: ConversationStage): void {
  const etapaOrden: ConversationStage[] = ['desconocido', 'saludo', 'diagnostico', 'dolor', 'solucion', 'cierre']
  const idxActual = etapaOrden.indexOf(state.etapa)
  const idxNuevo = etapaOrden.indexOf(newStage)

  // Solo avanzar, nunca retroceder
  if (idxNuevo > idxActual) {
    state.etapa = newStage
    state.turnosSinProgreso = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// FILTRO ANTI-REPETICIÓN
// Elimina preguntas ya hechas de la respuesta AI
// ═══════════════════════════════════════════════════════════════

// ─── Mapeo de campos confirmados a preguntas típicas ───────

const CAMPO_A_PREGUNTAS: Record<string, string[]> = {
  nombre: [
    'cómo te llamas', 'tu nombre', '¿cómo te llamas?', '¿cuál es tu nombre?',
    '¿con quién hablo?', '¿quién eres?',
  ],
  tipo_negocio: [
    'a qué te dedicas', 'qué vendes', 'qué tipo de negocio', 'tu negocio',
    'en qué trabajas', 'tu agencia', 'tu empresa',
  ],
  interes: [
    'qué servicio te interesa', 'qué producto te interesa', 'qué buscas',
    'qué estás buscando', '¿qué necesitas?',
  ],
  leads_semanales: [
    'cuántos mensajes', 'cuántos leads', 'cuántos clientes', 'cuántos prospectos',
    'volumen de mensajes', 'cuántos recibes',
  ],
  dolor: [
    'cuál es tu mayor problema', 'qué te frustra', 'cuál es tu dolor',
    'qué se te dificulta', 'cuál es tu reto principal',
  ],
  presupuesto: [
    'cuál es tu presupuesto', 'cuánto quieres invertir', 'cuánto puedes pagar',
    'rango de precio', 'cuánto estás dispuesto',
  ],
}

/**
 * Filtra la respuesta AI para eliminar preguntas sobre datos ya conocidos.
 * Retorna la respuesta limpia o null si no queda nada útil.
 */
export function filterRepetitions(response: string, state: ConversationState): string {
  let filtered = response

  for (const campo of state.datos_confirmados) {
    const preguntasEvitar = CAMPO_A_PREGUNTAS[campo]
    if (!preguntasEvitar) continue

    for (const pregunta of preguntasEvitar) {
      // Buscar si la respuesta contiene variaciones de esta pregunta
      const preguntaNorm = pregunta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

      // Dividir en oraciones y verificar
      const sentences = filtered.split(/(?<=[.!?\n])/)
      const filteredSentences: string[] = []

      for (const sentence of sentences) {
        const sentenceNorm = sentence.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

        // Si la oración contiene la pregunta completa o muy similar (70%+ match)
        if (sentenceNorm.includes(preguntaNorm) || 
            preguntaNorm.includes(sentenceNorm.trim()) ||
            similarity(sentenceNorm, preguntaNorm) > 0.7) {
          console.log(`[Middleware] Anti-repetición: eliminada pregunta sobre "${campo}"`)
          continue
        }
        filteredSentences.push(sentence)
      }

      filtered = filteredSentences.join('')
    }
  }

  // Si después de filtrar queda vacío o solo whitespace
  if (!filtered.trim()) {
    return response // Devolver original si filtramos todo
  }

  // Limpiar espacios dobles y newlines consecutivos
  filtered = filtered.replace(/\s+/g, ' ').replace(/\n{2,}/g, '\n').trim()

  return filtered
}

// ─── Similitud simple entre strings ────────────────────────

function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0

  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1.0

  const matches = longer.split('').filter((char, i) => char === shorter[i] || shorter.includes(char))
  return matches.length / longer.length
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTO PARA INYECCIÓN
// Genera resumen del estado para inyectar en el system prompt
// SIN cambiar el prompt base
// ═══════════════════════════════════════════════════════════════

export function buildContextBlock(state: ConversationState): string {
  const parts: string[] = []

  parts.push('[CONTEXTO ACTUAL DE LA CONVERSACIÓN - NO PREGUNTAR NUEVAMENTE SOBRE ESTO]')

  if (state.nombre) {
    parts.push(`• Nombre del contacto: ${state.nombre}`)
  }
  if (state.tipo_negocio) {
    parts.push(`• Tipo de negocio: ${state.tipo_negocio}`)
  }
  if (state.interes) {
    parts.push(`• Interés expresado: ${state.interes}`)
  }
  if (state.leads_semanales !== null) {
    parts.push(`• Volumen de mensajes/semana: ~${state.leads_semanales}`)
  }
  if (state.presupuesto_ads !== null) {
    parts.push(`• Presupuesto en publicidad: ~$${state.presupuesto_ads} MXN`)
  }
  if (state.dolor) {
    parts.push(`• Dolor/frustración principal: ${state.dolor}`)
  }
  if (state.vehiculo) {
    parts.push(`• Vehículo mencionado: ${state.vehiculo}`)
  }
  if (state.presupuesto) {
    parts.push(`• Presupuesto: ${state.presupuesto}`)
  }

  if (state.datos_confirmados.length > 0) {
    parts.push(`\n⚠️ DATOS YA CONFIRMADOS (NO volver a preguntar): ${state.datos_confirmados.join(', ')}`)
  }

  if (state.ultimaPregunta) {
    parts.push(`\n⚠️ ÚLTIMA PREGUNTA HECHA: "${state.ultimaPregunta}" — NO repetirla.`)
  }

  if (state.preguntasHechas.length > 0) {
    parts.push(`⚠️ PREGUNTAS YA HECHAS: ${state.preguntasHechas.map(p => `"${p}"`).join(', ')}`)
  }

  // Instrucción de avance según etapa
  const instruccionesEtapa: Record<ConversationStage, string> = {
    saludo: 'El contacto acaba de saludar. Presentarse brevemente y pasar a diagnóstico.',
    diagnostico: 'Estamos en fase de diagnóstico. Hacer preguntas específicas para entender el negocio del contacto. Avanzar naturalmente.',
    dolor: 'El contacto ya compartió su frustración. Empatizar y presentar solución. NO volver a preguntar sobre el dolor.',
    solucion: 'El contacto está interesado en la solución. Enfocarse en beneficios específicos y avanzar hacia cierre.',
    cierre: 'El contacto está listo para avanzar. Proponer siguiente paso concreto (demo, cita, etc.).',
    desconocido: 'Inicio de conversación. Saludar y comenzar diagnóstico natural.',
  }
  parts.push(`\n[ETAPA ACTUAL: ${state.etapa.toUpperCase()}] ${instruccionesEtapa[state.etapa]}`)

  parts.push('[FIN DEL CONTEXTO]')

  return parts.join('\n')
}

// ─── Registrar pregunta hecha por la IA ────────────────────

export function registrarPregunta(state: ConversationState, response: string): void {
  // Extraer la pregunta de la respuesta (última oración que termine en ?)
  const questions = response.split(/(?<=[?])\s*/).filter(s => s.trim().endsWith('?'))
  
  if (questions.length > 0) {
    const ultimaPregunta = questions[questions.length - 1].trim()
    state.ultimaPregunta = ultimaPregunta

    // Solo registrar si no es muy similar a una ya hecha
    const yaExiste = state.preguntasHechas.some(p => similarity(p.toLowerCase(), ultimaPregunta.toLowerCase()) > 0.6)
    if (!yaExiste) {
      state.preguntasHechas.push(ultimaPregunta)
      // Mantener solo las últimas 10 preguntas
      if (state.preguntasHechas.length > 10) {
        state.preguntasHechas = state.preguntasHechas.slice(-10)
      }
    }
  }

  state.ultimoTurnoAI = Date.now()
}

// ─── Resetear etapa si el usuario corrige información ──────

export function detectarCorreccion(state: ConversationState, text: string): boolean {
  const normalized = text.toLowerCase()
  
  // Patrones de corrección
  const correccionPatterns = [
    /no\s+(?:es|era|fue|ser[aá])\s+/i,
    /más\s+bien\b/i,
    /corr[ií]ge(?:mos|te|lo)\b/i,
    /olvida(?:r|da|mos)\b.*\b(?:que|lo)/i,
    /cambio\b/i,
    /mejor\s+(?:dije|explico)/i,
    /no\s+(?:es|era)\s+(?:un|una)\s+/i,
  ]

  for (const pattern of correccionPatterns) {
    if (pattern.test(text)) {
      console.log(`[Middleware] Corrección detectada en: "${text.slice(0, 60)}"`)
      return true
    }
  }

  return false
}

// ─── Para debugging ────────────────────────────────────────

export function getStateSummary(phone: string): string {
  const state = getState(phone)
  return JSON.stringify({
    nombre: state.nombre,
    tipo_negocio: state.tipo_negocio,
    interes: state.interes,
    leads_semanales: state.leads_semanales,
    dolor: state.dolor,
    etapa: state.etapa,
    datos_confirmados: state.datos_confirmados,
    preguntasHechas_count: state.preguntasHechas.length,
  }, null, 2)
}
