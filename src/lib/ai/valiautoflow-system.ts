// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — ValiAutoFlow Multi-Agent Sales System
// 3-Agent Architecture: Diagnóstico → Estrategia → Cierre
// Each agent activates based on the lead's conversation stage
// ═══════════════════════════════════════════════════════════════

import type { ValiAutoFlowStage, ValiAutoFlowAgent, ValiAutoFlowStageState } from '@/lib/types'

// ═══════════════════════════════════════════════════════════════
// VALIAUTOFLOW MASTER PROMPT
// ═══════════════════════════════════════════════════════════════

export const VALIAUTOFLOW_MASTER_PROMPT = `# VALIAUTOFLOW — SISTEMA DE VENTAS MULTI-AGENTE

## IDENTIDAD
Eres Jhon, operador comercial de ValiAutoFlow. No eres un bot. Eres un consultor comercial que convierte conversaciones en decisiones. Tu misión es que cada persona que habla contigo termine tomando una decisión — ya sea avanzar o reconocer que no está listo.

## PRINCIPIO CENTRAL
"El problema no es lo que haces. Es lo que no estás viendo."
"No es que no funcione... es que se está fugando."

## SISTEMA MULTI-AGENTE
Operas con 3 agentes que se activan según la etapa del lead:

### AGENTE 1 — DIAGNÓSTICO (Etapa: Exploración)
Se activa cuando el lead está explorando. Sus respuestas son cortas, generales, pregunta por "info", "precio", "cómo funciona".
- FUNCIÓN: Hacer preguntas que revelen la fuga (pérdida de leads/ventas)
- NO vender, NO explicar la solución completa
- Preguntas clave: "¿Cómo están atendiendo los mensajes?", "¿Quién responde?", "¿Cuántos leads reciben al mes?", "¿Tienen seguimiento?", "¿Cuántos se les pierden?"
- TONO: Curioso, punzante, consultivo
- OBJETIVO: Que el lead admita que tiene una fuga/pérdida

### AGENTE 2 — ESTRATEGIA (Etapa: Interés)
Se activa cuando el lead muestra interés. Responde con contexto, contesta preguntas, explica su situación, reconoce un problema.
- FUNCIÓN: Traducir problemas en costos visibles
- ESTRUCTURA: Volumen → Velocidad de respuesta → Seguimiento → Conversión → Valor por lead → Pérdida mensual
- FRASE CLAVE: "Déjame ver si entendí..."
- TONO: Firme, claro, orientado a negocio
- OBJETIVO: Que el lead vea la pérdida como real y cuantificable

### AGENTE 3 — CIERRE (Etapa: Intención)
SOLO se activa cuando el lead: reconoce la pérdida, muestra interés real, responde activamente.
- FUNCIÓN: Invitar a la siguiente decisión natural
- CIERRE NATURAL: "Si ya viste dónde está la fuga..." / "Tiene sentido revisarlo con números reales..."
- TONO: Seguro, simple, natural
- OBJETIVO: Que el lead tome una decisión (agendar, probar, empezar)
- REGLA DE ORO: NUNCA cerrar con presión. El cierre es la consecuencia lógica de un buen diagnóstico.

## 8 REGLAS ABSOLUTAS
1. NO avances de etapa hasta que la anterior esté completa
2. Sin dolor = no vendas
3. Sin claridad = no cierres
4. Un mensaje = una idea
5. Máximo 2 preguntas por mensaje
6. NUNCA envíes precio sin contexto
7. NUNCA cierres con presión
8. Siempre deja UNA sola próxima acción

## GATILLOS PSICOLÓGICOS
- PÉRDIDA: "Lo que no ves te cuesta más que lo que inviertes"
- OPORTUNIDAD: "Hay un margen de mejora que no estás aprovechando"
- PRUEBA SOCIAL: "El 73% de los negocios que implementaron esto duplicaron su cierre"
- AUTORIDAD: "Basado en +200 casos que hemos trabajado..."
- ESCASEZ: "Los que lo implementan primero son los que más aprovechan"
- COSTO DE OPORTUNIDAD: "Cada mes que pasa sin hacer nada, es dinero que se va"

## MANEJO DE OBJECIONES
- "No tengo presupuesto" → "Entiendo. ¿Cuánto crees que se te fuga al mes por no tener esto?"
- "Ya tengo alguien" → "Perfecto, ¿cómo está funcionando? ¿Estás contento con los resultados?"
- "Lo haré yo mismo" → "Te entiendo. ¿Tienes el tiempo para atender 50+ leads al mes consistente?"
- "¿Y si no funciona?" → "Si no funciona, sigues exactamente donde estás. ¿Pero qué pasa si sí funciona?"
- "Dame tiempo" → "Claro, tómate tu tiempo. Solo ten en cuenta que cada semana sin acción es más leads perdidos."

## FORMATO DE RESPUESTA
- WhatsApp natural, sin markdown, sin secciones
- Corto (2-3 líneas máximo)
- Español mexicano
- Emojis con moderación (máximo 1 por mensaje)
- NUNCA decir que eres IA, bot o asistente
- Si necesitas sugerir respuestas rápidas, inclúyelas al final separadas por |

## LO QUE NUNCA HARÁS
✗ Vender antes de diagnosticar
✗ Enviar precio sin contexto
✗ Hacer más de 2 preguntas por mensaje
✗ Cerrar con presión
✗ Avanzar de etapa sin completar la anterior
✗ Sonar como formulario o menú de opciones
✗ "Como IA..." / "Soy un bot..." / "Según mi entrenamiento..."
✗ Mensajes de más de 4 líneas
✗ Usar lenguaje formal corporativo`

// ═══════════════════════════════════════════════════════════════
// AGENTE 1 — DIAGNÓSTICO
// ═══════════════════════════════════════════════════════════════

export const AGENTE_DIAGNOSTICO_PROMPT = `# AGENTE 1 — DIAGNÓSTICO
Ahora operas como AGENTE DE DIAGNÓSTICO de ValiAutoFlow.

## TU FUNCIÓN
Descubrir el problema oculto. Hacer que el lead admita que tiene una fuga de ventas/leads. NO vendes nada. Solo preguntas y escuchas.

## TONO
Curioso, punzante, consultivo. Como un doctor que hace preguntas antes de dar diagnóstico. Corto, directo, sin rodeos.

## PREGUNTAS QUE DEBES USAR (una a la vez, nunca más de 2 por mensaje)
- "¿Cómo están atendiendo los mensajes que llegan?"
- "¿Quién responde actualmente? ¿Es una persona o varios?"
- "¿Cuántos leads reciben al mes aproximadamente?"
- "¿Tienen algún sistema de seguimiento o lo hacen manual?"
- "¿Cuántos leads crees que se les escapan sin atención?"
- "¿Cuánto tiempo pasa entre que un lead escribe y alguien responde?"
- "De 10 leads que llegan, ¿cuántos terminan comprando?"

## LO QUE BUSCAS DETECTAR
1. Volumen de leads mensual
2. Tiempo de respuesta actual
3. Sistema de seguimiento (o falta del mismo)
4. Tasa de conversión actual
5. Quién atiende (o si nadie atiende)
6. El lead reconoce que hay pérdida

## OBJETIVO
Que el lead diga algo como: "Sí, se nos pierden muchos leads" o "No tenemos sistema de seguimiento" o "Respondemos muy lento".

## REGLAS EN ESTA ETAPA
- NO menciones ValiAutoFlow como solución
- NO des precio
- NO ofrezcas demo
- NO expliques el producto
- SOLO pregunta y escucha
- Cada pregunta debe llevar al lead a ver su propia fuga
- Si el lead intenta cambiar de tema a precio/solución, redirige: "Antes de hablar de soluciones, ¿me cuentas cómo están atendiendo ahora?"

## RESPUESTA
Tu respuesta es UN SOLO MENSAJE de WhatsApp. Corto, curioso, consultivo. Sin etiquetas, sin secciones.
Si necesitas sugerir opciones de respuesta rápida, inclúyelas al final separadas por | .`

// ═══════════════════════════════════════════════════════════════
// AGENTE 2 — ESTRATEGIA
// ═══════════════════════════════════════════════════════════════

export const AGENTE_ESTRATEGIA_PROMPT = `# AGENTE 2 — ESTRATEGIA
Ahora operas como AGENTE DE ESTRATEGIA de ValiAutoFlow.

## TU FUNCIÓN
Traducir los problemas del lead en costos visibles y cuantificables. Que el lead VEA cuánto le cuesta NO tener una solución.

## TONO
Firme, claro, orientado a negocio. Hablas de números, de dinero, de pérdidas reales. No eres agresivo, eres honesto.

## ESTRUCTURA DE CONVERSACIÓN
1. VOLUMEN: "Déjame ver si entendí... Recibes X leads al mes"
2. VELOCIDAD: "¿Y cuánto tardan en responder? Porque cada minuto cuenta"
3. SEGUIMIENTO: "¿Y de esos leads, cuántos reciben seguimiento?"
4. CONVERSIÓN: "O sea que de cada 10 leads, solo X compran..."
5. VALOR POR LEAD: "¿Cuál es el valor promedio de una venta?"
6. PÉRDIDA MENSUAL: "Entonces... están dejando de ganar aproximadamente $X al mes"

## FRASES CLAVE
- "Déjame ver si entendí..."
- "O sea que..."
- "Esto significa que..."
- "Solo para que lo veas en números..."
- "Si sumamos..."

## LO QUE CONSTRUYES
Una narrativa de pérdida que el lead no puede ignorar. No exageras, solo conectas los puntos que el lead ya te dio.

## OBJETIVO
Que el lead diga algo como: "Es verdad, estamos perdiendo mucho" o "¿Cómo puedo mejorar eso?" o "¿Qué me recomiendas?"

## REGLAS EN ESTA ETAPA
- Puedes MENCIONAR que existe una solución (ValiAutoFlow) pero sin explicar detalles
- NO des precio todavía
- NO cierres
- Sigue haciendo preguntas para cuantificar la pérdida
- Cada mensaje debe avanzar la narrativa de costo
- Si el lead pregunta por precio, responde: "Antes de darte un número, déjame mostrarte cuánto estás perdiendo sin esto"

## OBJECIONES FRECUENTES
- "No es tanto" → "Incluso si solo es 5 leads al mes, a $X cada uno, son $X/mes. ¿Te parece poco?"
- "Tenemos equipo" → "Perfecto, ¿y están atendiendo todos los leads o se les acumulan?"
- "No tenemos presupuesto" → "La pregunta no es si tienes presupuesto para esto, es cuánto te cuesta NO tenerlo"

## RESPUESTA
Tu respuesta es UN SOLO MENSAJE de WhatsApp. Firmes, con números, orientado a negocio. Sin etiquetas, sin secciones.
Si necesitas sugerir opciones de respuesta rápida, inclúyelas al final separadas por | .`

// ═══════════════════════════════════════════════════════════════
// AGENTE 3 — CIERRE
// ═══════════════════════════════════════════════════════════════

export const AGENTE_CIERRE_PROMPT = `# AGENTE 3 — CIERRE
Ahora operas como AGENTE DE CIERRE de ValiAutoFlow.

## CONDICIÓN DE ACTIVACIÓN
SOLO te activas cuando:
✓ El lead reconoce que tiene una pérdida/pérdida
✓ El lead muestra interés real en solucionar
✓ El lead responde de forma activa (no monosílabos)
✓ La pérdida ha sido cuantificada

Si NO se cumplen estas condiciones, regresa al agente anterior.

## TU FUNCIÓN
Invitar a la siguiente decisión natural. El cierre es la consecuencia lógica de un buen diagnóstico y estrategia. NO es una venta forzada.

## TONO
Seguro, simple, natural. Hablas como alguien que sabe que su producto funciona y no necesita presionar. Confianza silenciosa.

## TIPOS DE CIERRE
1. CIERRE LÓGICO: "Si ya viste dónde está la fuga... ¿tiene sentido revisarlo con números reales de tu negocio?"
2. CIERRE DE PRÓXIMO PASO: "Perfecto. El siguiente paso es revisar tu caso real. ¿Agendamos 15 minutos esta semana?"
3. CIERRE DE VALOR: "Entonces... en lugar de seguir perdiendo $X al mes, ¿qué te parece probar si podemos reducir esa pérdida?"
4. CIERRE SUAVE: "Tiene sentido. ¿Cuándo te vendría bien revisarlo? Puedo mostrártelo en 15 minutos."
5. CIERRE DE CURIOSIDAD: "¿Quieres ver cómo se vería en tu caso específico? Con tus números reales."

## REGLAS DE CIERRE
- NUNCA presiones ("tienes que decidir hoy", "se acaba la oferta")
- NUNCA uses miedo artificial
- El cierre fluye de la conversación, no se impone
- Solo UNA llamada a la acción por mensaje
- La acción debe ser simple y natural (agendar, revisar, probar)
- Si el lead pone objeción nueva, REGRESA al agente de estrategia
- Deja que el lead sienta que fue SU decisión

## OBJECIONES EN ETAPA DE CIERRE
- "Dame tiempo" → "Claro. ¿Te parece si te escribo en 3 días con un ejercicio rápido para que lo veas?"
- "Tengo que hablar con mi socio" → "Mejor. ¿Quieres que prepare algo para que lo vean juntos? Les toma 15 minutos."
- "¿Cuánto cuesta?" → "Depende de tu volumen. ¿Me cuentas cuántos leads manejas al mes para darte un número real?"
- "No estoy seguro" → "Totalmente válido. ¿Qué te hace dudar? Así te ayudo a resolver esa duda."

## RESPUESTA
Tu respuesta es UN SOLO MENSAJE de WhatsApp. Seguro, simple, natural. Sin etiquetas, sin secciones.
Si necesitas sugerir opciones de respuesta rápida, inclúyelas al final separadas por | .`

// ═══════════════════════════════════════════════════════════════
// STAGE DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════

// Keyword patterns for each stage
const EXPLORATION_PATTERNS: { patterns: RegExp[]; weight: number } = {
  patterns: [
    /\b(info|informaci[oó]n|informacion)\b/i,
    /\b(precio|cuanto cuesta|cuanto vale|costo)\b/i,
    /\b(c[oó]mo funciona|c[oó]mo trabaja|c[oó]mo es|qu[eé] es)\b/i,
    /\b(qu[eé] ofrecen|qu[eé] hacen|de qu[eé] se trata)\b/i,
    /\b(necesito|m[eé] interesa\b)/i,
    /\b(hola|buenos d[ií]as|buenas tardes|buenas noches|hey)\b/i,
  ],
  weight: 1.0,
}

const INTEREST_PATTERNS: { patterns: RegExp[]; weight: number } = {
  patterns: [
    /\b(s[ií] tengo|tengo|tenemos)\b.*\b(problema|fuga|p[eé]rdida|issue|dificultad)\b/i,
    /\b(mi negocio|mi empresa|mi agencia|mi concesionario)\b/i,
    /\b(estoy invirtiendo|estamos invirtiendo|gastamos en)\b/i,
    /\b(recibimos\s+\d+|como\s+\d+\s+leads|alrededor de \d+)\b/i,
    /\b(no tenemos|no contamos|carecemos)\b.*\b(sistema|proceso|herramienta)\b/i,
    /\b(respondemos|contestamos|tardamos|demoramos)\b/i,
    /\b(s[ií]\s+me\s+pasa|nos\s+pasa\s+lo\s+mismo|exacto|correcto|as[ií] es)\b/i,
    /\b(lead|prospecto|cliente)\b/i,
    /\b(se\s+nos\s+pierden|se\s+nos\s+escapan|perdemos|se\nos van)\b/i,
  ],
  weight: 1.2,
}

const INTENTION_PATTERNS: { patterns: RegExp[]; weight: number } = {
  patterns: [
    /\b(me\s+interesa\s+mucho|mucho\s+me\s+interesa)\b/i,
    /\b(cu[aá]nto\s+cuesta|cu[aá]l\s+es\s+el\s+precio|cu[aá]nto\s+ser[ií]a)\b/i,
    /\b(c[oó]mo\s+empezamos|c[oó]mo\s+comenzamos|qu[eé]\s+hago|d[oó]nde\s+empiezo)\b/i,
    /\b(agendar|agendamos|cita|reuni[oó]n|llamada)\b/i,
    /\b(quiero\s+probar|quiero\s+ver|mu[eé]strame|prueba)\b/i,
    /\b(c[oó]mo\s+puedo|me\s+puedes|pueden\s+ayudar)\b/i,
    /\b(escrib[ií] al|hablar con|contactar)\b/i,
    /\b(empleo|auto|negocio|m[ií]\s+caso)\b/i,
  ],
  weight: 1.5,
}

// Negation patterns that signal the lead is NOT ready to advance
const NEGATION_PATTERNS = [
  /\b(no\s+tengo\s+tiempo|estoy\s+ocupado)\b/i,
  /\b(no\s+me\s+interesa|no\s+busco)\b/i,
  /\b(no\s+ahora|despu[eé]s|luego|ya\s+vere)\b/i,
  /\b(no\s+es\s+para\s+m[ií])\b/i,
  /\b(solo\s+estaba\s+mirando|curiosidad)\b/i,
]

// Confirmation patterns that validate the current stage
const DIAGNOSTIC_COMPLETE_PATTERNS = [
  /\b(s[ií](\s+me)?\s+pasa|nos\s+pasa)\b/i,
  /\b(s[ií],\s*tengo|tenemos)\s+\w+/i,
  /\b(no\s+tenemos\s+(sistema|proceso|nada))\b/i,
  /\b(pérdida|fuga|perdida)\b/i,
]

const STRATEGY_COMPLETE_PATTERNS = [
  /\b(es\s+verdad|as[ií]\s+es|tiene\s+raz[oó]n|cierto)\b/i,
  /\b(cu[aá]nto\s+estoy\s+perdiendo|cu[aá]nto\s+cuesta\s+eso)\b/i,
  /\b(¿c[oó]mo\s+mejoro|¿qu[eé]\s+puedo\s+hacer|¿c[oó]mo\s+lo\s+soluciono)\b/i,
  /\b(¿me\s+ayudas|quiero\s+resolver|necesito\s+solucionar)\b/i,
]

// ─── Stage Detection Functions ────────────────────────────────

/**
 * Detect the lead's conversation stage based on message content
 * and conversation history.
 */
export function detectLeadStage(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): { stage: ValiAutoFlowStage; confidence: number; signals: string[] } {
  if (!message || message.trim().length === 0) {
    return { stage: 'exploration', confidence: 0.3, signals: [] }
  }

  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const signals: string[] = []

  // Check for negation patterns first (regression signals)
  const hasNegation = NEGATION_PATTERNS.some(p => p.test(normalized))

  // Score each stage
  let explorationScore = 0
  let interestScore = 0
  let intentionScore = 0

  // Check exploration patterns
  for (const pattern of EXPLORATION_PATTERNS.patterns) {
    if (pattern.test(message)) {
      explorationScore += 1.5
      signals.push('exploration_keyword')
    }
  }

  // Check interest patterns
  for (const pattern of INTEREST_PATTERNS.patterns) {
    if (pattern.test(message)) {
      interestScore += 2
      signals.push('interest_keyword')
    }
  }

  // Check intention patterns
  for (const pattern of INTENTION_PATTERNS.patterns) {
    if (pattern.test(message)) {
      intentionScore += 2.5
      signals.push('intention_keyword')
    }
  }

  // Message length factor
  const wordCount = message.split(/\s+/).length
  if (wordCount <= 4) {
    explorationScore += 1 // Short messages = still exploring
  } else if (wordCount > 15) {
    interestScore += 1 // Long messages = more engaged
  }

  // Conversation depth factor
  const userMessages = conversationHistory.filter(m => m.role === 'user' || m.role === 'contact')
  const exchangeCount = userMessages.length

  if (exchangeCount >= 6) {
    // Deep conversation: less likely to be pure exploration
    explorationScore -= 0.5
    interestScore += 0.5
  }
  if (exchangeCount >= 10) {
    interestScore += 0.5
    intentionScore += 0.3
  }

  // Pain detection from history
  const allText = conversationHistory.map(m => m.content).join(' ').toLowerCase()
  const hasPain = allText.includes('pérdida') || allText.includes('perdida') ||
    allText.includes('fuga') || allText.includes('se nos pierden') ||
    allText.includes('se nos escapan') || allText.includes('perdemos')

  if (hasPain) {
    interestScore += 2
    signals.push('pain_detected_in_history')
  }

  // Check diagnostic completion in history
  const diagnosticComplete = DIAGNOSTIC_COMPLETE_PATTERNS.some(p =>
    conversationHistory.slice(-6).some(m => p.test(m.content))
  )
  if (diagnosticComplete) {
    explorationScore -= 1
    interestScore += 1.5
    signals.push('diagnostic_complete')
  }

  // Check strategy completion in history
  const strategyComplete = STRATEGY_COMPLETE_PATTERNS.some(p =>
    conversationHistory.slice(-4).some(m => p.test(m.content))
  )
  if (strategyComplete) {
    intentionScore += 2
    signals.push('strategy_complete')
  }

  // Negation penalty
  if (hasNegation) {
    intentionScore -= 2
    interestScore -= 1
    explorationScore += 0.5
    signals.push('negation_detected')
  }

  // Apply weights
  explorationScore *= EXPLORATION_PATTERNS.weight
  interestScore *= INTEREST_PATTERNS.weight
  intentionScore *= INTENTION_PATTERNS.weight

  // Ensure minimum scores
  explorationScore = Math.max(0, explorationScore)
  interestScore = Math.max(0, interestScore)
  intentionScore = Math.max(0, intentionScore)

  // Determine winning stage
  const scores = {
    exploration: explorationScore,
    interest: interestScore,
    intention: intentionScore,
  }

  const maxScore = Math.max(explorationScore, interestScore, intentionScore)
  const totalScore = explorationScore + interestScore + intentionScore
  const confidence = totalScore > 0 ? Math.min(maxScore / totalScore, 1) : 0.3

  let stage: ValiAutoFlowStage = 'exploration'
  if (maxScore === interestScore && interestScore > explorationScore) {
    stage = 'interest'
  }
  if (maxScore === intentionScore && intentionScore > interestScore) {
    stage = 'intention'
  }

  // Special: If intention scores high but there's no pain in history, downgrade to interest
  if (stage === 'intention' && !hasPain && !diagnosticComplete && exchangeCount < 6) {
    stage = 'interest'
    signals.push('downgraded_intention_to_interest')
  }

  return {
    stage,
    confidence: Math.round(confidence * 100) / 100,
    signals: [...new Set(signals)],
  }
}

// ─── Agent Selection ──────────────────────────────────────────

/**
 * Get the appropriate agent prompt based on the detected stage.
 */
export function getAgentPrompt(stage: ValiAutoFlowStage): string {
  switch (stage) {
    case 'exploration':
      return AGENTE_DIAGNOSTICO_PROMPT
    case 'interest':
      return AGENTE_ESTRATEGIA_PROMPT
    case 'intention':
      return AGENTE_CIERRE_PROMPT
    default:
      return AGENTE_DIAGNOSTICO_PROMPT
  }
}

/**
 * Get the agent name based on the detected stage.
 */
export function getAgentName(stage: ValiAutoFlowStage): ValiAutoFlowAgent {
  switch (stage) {
    case 'exploration':
      return 'diagnostico'
    case 'interest':
      return 'estrategia'
    case 'intention':
      return 'cierre'
    default:
      return 'diagnostico'
  }
}

/**
 * Get a human-readable label for the stage.
 */
export function getStageLabel(stage: ValiAutoFlowStage): string {
  switch (stage) {
    case 'exploration':
      return '🔍 Exploración'
    case 'interest':
      return '💡 Interés'
    case 'intention':
      return '🎯 Intención'
    default:
      return '🔍 Exploración'
  }
}

/**
 * Get a human-readable label for the agent.
 */
export function getAgentLabel(agent: ValiAutoFlowAgent): string {
  switch (agent) {
    case 'diagnostico':
      return '🩺 Agente Diagnóstico'
    case 'estrategia':
      return '📊 Agente Estrategia'
    case 'cierre':
      return '🤝 Agente Cierre'
    default:
      return '🩺 Agente Diagnóstico'
  }
}

// ─── Stage Transition Logic ───────────────────────────────────

/**
 * Determine if the conversation should advance to the next stage.
 * Returns whether to advance, and to which stage.
 */
export function shouldAdvanceStage(
  currentState: ValiAutoFlowStageState | null,
  currentStage: ValiAutoFlowStage,
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): { advance: boolean; newStage?: ValiAutoFlowStage; confidence: number } {
  // No current state: start at detected stage
  if (!currentState) {
    return { advance: false, confidence: 0.5 }
  }

  const existingStage = currentState.currentStage
  const messagesInStage = currentState.messagesInStage

  // Need minimum messages in current stage before advancing
  if (messagesInStage < 2 && existingStage !== currentStage) {
    // If we haven't had enough exchanges, don't advance yet
    return { advance: false, confidence: 0.2 }
  }

  // Forward transition rules (only forward, never backward)
  const stageOrder: ValiAutoFlowStage[] = ['exploration', 'interest', 'intention']
  const currentIndex = stageOrder.indexOf(existingStage)
  const detectedIndex = stageOrder.indexOf(currentStage)

  // Only advance forward
  if (detectedIndex <= currentIndex) {
    return { advance: false, confidence: 0 }
  }

  // Specific transition checks
  if (existingStage === 'exploration' && currentStage === 'interest') {
    // Transition from Exploration → Interest
    // Require: pain detected or diagnostic complete
    const allText = conversationHistory.map(m => m.content).join(' ').toLowerCase()
    const hasPain = allText.includes('pérdida') || allText.includes('perdida') ||
      allText.includes('fuga') || allText.includes('se nos pierden') ||
      allText.includes('se nos escapan') || allText.includes('perdemos') ||
      allText.includes('no tenemos') || allText.includes('no contamos') ||
      allText.includes('respondemos') || allText.includes('tardamos')

    if (hasPain && messagesInStage >= 2) {
      return { advance: true, newStage: 'interest', confidence: 0.8 }
    }
    return { advance: false, confidence: 0.3 }
  }

  if (existingStage === 'interest' && currentStage === 'intention') {
    // Transition from Interest → Intention
    // Require: cost acknowledged or solution sought
    const allText = conversationHistory.map(m => m.content).join(' ').toLowerCase()
    const costAcknowledged = allText.includes('es verdad') || allText.includes('así es') ||
      allText.includes('tiene razón') || allText.includes('cierto') ||
      allText.includes('cuánto estoy perdiendo') || allText.includes('cuánto cuesta eso') ||
      allText.includes('cómo mejoro') || allText.includes('qué puedo hacer')

    if (costAcknowledged && messagesInStage >= 2) {
      return { advance: true, newStage: 'intention', confidence: 0.85 }
    }
    return { advance: false, confidence: 0.3 }
  }

  // Leapfrog transitions (exploration → intention) are blocked
  if (existingStage === 'exploration' && currentStage === 'intention') {
    return { advance: false, confidence: 0 }
  }

  return { advance: false, confidence: 0 }
}

// ─── Full System Prompt Builder ──────────────────────────────

/**
 * Build the complete system prompt for the ValiAutoFlow system.
 * Combines the master prompt with the active agent prompt.
 */
export function buildValiAutoFlowSystemPrompt(
  stage: ValiAutoFlowStage,
  agent: ValiAutoFlowAgent,
  context?: {
    businessName?: string
    contactName?: string
    lastMessage?: string
    painDetected?: boolean
    costAcknowledged?: boolean
    messagesInStage?: number
    conversationSummary?: string
  }
): string {
  const agentPrompt = getAgentPrompt(stage)
  let prompt = `${VALIAUTOFLOW_MASTER_PROMPT}\n\n---\n\nESTADO ACTUAL DEL SISTEMA:\n- Agente activo: ${getAgentLabel(agent)}\n- Etapa del lead: ${getStageLabel(stage)}\n- Mensajes en esta etapa: ${context?.messagesInStage || 1}`

  if (context?.businessName) {
    prompt += `\n- Empresa del lead: ${context.businessName}`
  }

  if (context?.contactName) {
    prompt += `\n- Nombre del contacto: ${context.contactName}`
  }

  if (context?.painDetected) {
    prompt += `\n- ✅ Dolor/pérdida detectado`
  } else {
    prompt += `\n- ❌ Dolor/pérdida NO detectado aún`
  }

  if (context?.costAcknowledged) {
    prompt += `\n- ✅ Costo reconocido por el lead`
  } else {
    prompt += `\n- ❌ Costo NO reconocido aún`
  }

  if (context?.conversationSummary) {
    prompt += `\n\nRESUMEN DE CONVERSACIÓN:\n${context.conversationSummary}`
  }

  prompt += `\n\n---\n\n${agentPrompt}`

  // Add time context
  const hour = new Date().getHours()
  const timeOfDay = hour >= 6 && hour < 12 ? 'mañana' : hour >= 12 && hour < 19 ? 'tarde' : 'noche'
  prompt += `\n\nHORA ACTUAL: ${hour} (${timeOfDay})`

  // Add response format reminder
  prompt += `\n\nFORMATO DE RESPUESTA OBLIGATORIO:
Tu respuesta es UN SOLO MENSAJE de WhatsApp. Sin etiquetas. Sin secciones. Sin markdown.
Como si un consultor humano lo escribiera desde su celular.
Corto (máximo 3 líneas). Natural. Conversacional.
Si necesitas sugerir opciones de respuesta rápida, inclúyelas al final separadas por | .`

  return prompt
}

// ─── Pain Detection ──────────────────────────────────────────

/**
 * Detect if the lead has acknowledged a pain point or loss.
 */
export function detectPain(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): boolean {
  const allText = [
    ...conversationHistory.map(m => m.content),
    message,
  ].join(' ').toLowerCase()

  const painKeywords = [
    'pérdida', 'perdida', 'fuga', 'se nos pierden', 'se nos escapan',
    'perdemos', 'no llegamos', 'se nos van', 'no cerramos',
    'no tenemos sistema', 'no tenemos proceso', 'sin sistema',
    'respondemos lento', 'tardamos mucho', 'demoramos',
    'no tenemos seguimiento', 'sin seguimiento',
    'no contestamos', 'no respondemos', 'se acumulan',
    'es un problema', 'tenemos un problema', 'nos pasa',
    'estamos perdiendo', 'dejamos de ganar', 'se nos va',
  ]

  return painKeywords.some(kw => allText.includes(kw))
}

/**
 * Detect if the lead has acknowledged the cost of their problem.
 */
export function detectCostAcknowledgment(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): boolean {
  const allText = [
    ...conversationHistory.map(m => m.content),
    message,
  ].join(' ').toLowerCase()

  const costKeywords = [
    'es verdad', 'así es', 'tiene razón', 'tiene razon', 'cierto',
    'es mucho', 'es mucho dinero', 'bastante', 'es grave',
    'estoy perdiendo', 'estamos perdiendo', 'cuánto estoy perdiendo',
    'cuánto cuesta eso', 'cómo lo soluciono', 'cómo mejoro',
    'qué puedo hacer', 'me ayudas', 'necesito solucionar',
    'wow', 'increíble', 'no sabía', 'no me había dado cuenta',
    'es real', 'no lo había visto así',
  ]

  return costKeywords.some(kw => allText.includes(kw))
}

/**
 * Generate a conversation summary from the history.
 */
export function generateConversationSummary(
  conversationHistory: Array<{ role: string; content: string }>
): string {
  const userMessages = conversationHistory
    .filter(m => m.role === 'user' || m.role === 'contact')
    .map(m => m.content)

  const assistantMessages = conversationHistory
    .filter(m => m.role === 'assistant')
    .map(m => m.content)

  // Take last 6 exchanges
  const recent = conversationHistory.slice(-12)

  if (recent.length === 0) return 'Conversación nueva'

  const summaryParts: string[] = []
  for (const msg of recent) {
    const role = msg.role === 'user' || msg.role === 'contact' ? 'Lead' : 'Jhon'
    summaryParts.push(`${role}: "${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}"`)
  }

  return summaryParts.join('\n')
}
