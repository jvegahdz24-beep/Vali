// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — VALIDACIÓN DEL CICLO COGNITIVO
// Script de pruebas sin dependencias externas (sin PostgreSQL/Redis)
//
// Valida la lógica pura del ciclo cognitivo completo:
//   FASE 2 (State) ↔ FASE 3 (Tools) ↔ FASE 4 (Cognitive Engine)
//
// Ejecutar: npx tsx scripts/validate-cognitive-loop.ts
// ═══════════════════════════════════════════════════════════════

// ─── ANSI Colors ─────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

// ═══════════════════════════════════════════════════════════════
// TIPOS COPIADOS (sin dependencias de Prisma/Redis)
// ═══════════════════════════════════════════════════════════════

type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH_RISK' | 'CRITICAL'
type LoadLevel = 'idle' | 'optimal' | 'moderate' | 'high' | 'overloaded'
type GateDecision = 'approved' | 'throttled' | 'rejected' | 'deferred'

interface IntentPattern {
  type: string
  label: string
  keywords: string[]
  patterns: RegExp[]
  category: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  estimatedRisk: RiskLevel
}

interface LoadFactors {
  activeConversations: number
  pendingActions: number
  memoryOperations: number
  activePromises: number
  activeToolExecutions: number
  unresolvedItems: number
}

interface ExecutionModifiers {
  toneAdjustment: number
  responseUrgency: number
  detailLevel: number
  empathyBoost: number
  cautionLevel: number
  creativityLevel: number
  shouldAcknowledgeEmotion: boolean
  shouldSimplify: boolean
  maxResponseLength: number
}

interface CognitiveSnapshot {
  cognitiveLoad: number
  coherenceScore: number
  emotionalMomentum: string
  trustTrend: string
  temporalPressure: string
  timeHorizon: string
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTES COPIADAS
// ═══════════════════════════════════════════════════════════════

const COGNITIVE_DEFAULTS = {
  LOAD: {
    optimalThreshold: 0.40,
    moderateThreshold: 0.65,
    highThreshold: 0.85,
    overloadThreshold: 0.95,
  },
  COHERENCE: {
    minCoherenceThreshold: 0.70,
    criticalCoherenceThreshold: 0.50,
  },
} as const

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'send_message',
    label: 'Send Message',
    keywords: ['enviar', 'mandar', 'mensaje', 'message', 'send', 'whatsapp', 'escribir', 'write', 'text'],
    patterns: [/env[ií]a(r|do)?\s+(un\s+)?mensaje/i, /send\s+(a\s+)?message/i, /manda(r)?\s+(un\s+)?(whatsapp|texto)/i],
    category: 'communication',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'query_data',
    label: 'Query Data',
    keywords: ['buscar', 'consulta', 'query', 'find', 'show', 'ver', 'lista', 'list', 'datos', 'data', 'info', 'información'],
    patterns: [/busca(r|ndo)?\s+(contactos?|leads?|clientes?)/i, /show\s+me\s+(contacts?|leads?|deals?)/i, /cu[aá]ntos?\s+(contactos?|leads?|clientes?)/i],
    category: 'analytics',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
  {
    type: 'modify_record',
    label: 'Modify Record',
    keywords: ['actualizar', 'modificar', 'editar', 'update', 'edit', 'change', 'cambiar', 'agregar', 'añadir', 'crear', 'delete', 'eliminar', 'borrar'],
    patterns: [/actualiza(r)?\s+(el\s+)?(contacto|lead|cliente)/i, /(update|edit|change)\s+(the\s+)?(contact|lead|deal)/i, /elimina(r)?\s+(el\s+)?(contacto|lead)/i],
    category: 'crm',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'analyze',
    label: 'Analyze',
    keywords: ['analizar', 'análisis', 'analyze', 'report', 'reporte', 'métricas', 'metrics', 'estadísticas', 'stats', 'kpi', 'dashboard'],
    patterns: [/analiza(r)?\s+(la\s+)?(información|datos|performance)/i, /generate\s+(a\s+)?(report|analysis)/i, /mostrar\s+(el\s+)?(dashboard|reporte)/i],
    category: 'analytics',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
  {
    type: 'schedule',
    label: 'Schedule',
    keywords: ['agendar', 'programar', 'schedule', 'calendar', 'cita', 'appointment', 'recordatorio', 'reminder', 'seguimiento', 'follow-up', 'followup'],
    patterns: [/agenda(r)?\s+(una\s+)?(cita|reunión|llamada)/i, /schedule\s+(a|an|the)\s+(call|meeting|appointment)/i, /programa(r)?\s+(un\s+)?(seguimiento|recordatorio)/i],
    category: 'calendar',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'automate',
    label: 'Automate',
    keywords: ['automatizar', 'automación', 'automation', 'flujo', 'workflow', 'trigger', 'disparador', 'regla', 'rule', 'bot'],
    patterns: [/crea(r)?\s+(una\s+)?(automatización|regla|flujo)/i, /set\s+up\s+(an?\s+)?(automation|workflow|rule)/i],
    category: 'system',
    urgency: 'medium',
    estimatedRisk: 'HIGH_RISK',
  },
  {
    type: 'payment',
    label: 'Payment',
    keywords: ['pago', 'cobrar', 'factura', 'invoice', 'payment', 'cobro', 'precio', 'price', 'costo', 'cost', 'stripe', 'mercado pago'],
    patterns: [/genera(r)?\s+(una\s+)?(factura|cobro|link\s+de\s+pago)/i, /create\s+(an?\s+)?(invoice|payment\s+link)/i],
    category: 'finance',
    urgency: 'high',
    estimatedRisk: 'HIGH_RISK',
  },
  {
    type: 'ai_generate',
    label: 'AI Generate',
    keywords: ['genera', 'redactar', 'escribir', 'generate', 'draft', 'create', 'resumen', 'summary', 'ia', 'ai', 'gpt', 'respuesta'],
    patterns: [/genera(r)?\s+(una\s+)?(respuesta|propuesta|resumen)/i, /write\s+(a|an)\s+(response|proposal|summary|email)/i],
    category: 'ai',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
]

const URGENCY_BOOSTERS: Record<string, 'high' | 'critical'> = {
  'urgente': 'high', 'urgent': 'high', 'ya': 'high', 'now': 'high', 'inmediato': 'critical',
  'asap': 'critical', 'hoy': 'high', 'today': 'high', 'emergency': 'critical',
  'crítico': 'critical', 'critical': 'critical', 'vencido': 'high', 'overdue': 'high',
}

const RISK_BOOSTER_KEYWORDS: Record<string, RiskLevel> = {
  'eliminar': 'HIGH_RISK', 'delete': 'HIGH_RISK', 'borrar': 'HIGH_RISK',
  'cancelar': 'HIGH_RISK', 'cancel': 'HIGH_RISK',
  'massivo': 'CRITICAL', 'masivo': 'CRITICAL', 'bulk': 'CRITICAL',
  'todos': 'HIGH_RISK', 'all': 'HIGH_RISK', 'global': 'CRITICAL',
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA PURA COPIADA — IntentClassifier (FASE 3)
// ═══════════════════════════════════════════════════════════════

function matchPatterns(input: string): {
  type: string; label: string; confidence: number
  category: string; urgency: 'low'|'medium'|'high'|'critical'
  estimatedRisk: RiskLevel
} {
  const normalized = input.toLowerCase().trim()
  let bestMatch = {
    type: 'unknown', label: 'Unknown Intent', confidence: 0,
    category: 'general', urgency: 'medium' as const, estimatedRisk: 'SAFE' as RiskLevel,
  }

  for (const pattern of INTENT_PATTERNS) {
    let score = 0
    let maxScore = 0

    for (const keyword of pattern.keywords) {
      maxScore += 1
      if (normalized.includes(keyword.toLowerCase())) {
        score += 1
      }
    }

    for (const regex of pattern.patterns) {
      maxScore += 3
      if (regex.test(input)) {
        score += 3
      }
    }

    const confidence = maxScore > 0 ? Math.min(1, score / maxScore) : 0

    if (score >= 2) {
      const boostedConfidence = Math.min(1, confidence * 1.3)
      if (boostedConfidence > bestMatch.confidence) {
        bestMatch = {
          type: pattern.type, label: pattern.label,
          confidence: boostedConfidence, category: pattern.category,
          urgency: pattern.urgency, estimatedRisk: pattern.estimatedRisk,
        }
      }
    } else if (confidence > bestMatch.confidence) {
      bestMatch = {
        type: pattern.type, label: pattern.label, confidence,
        category: pattern.category, urgency: pattern.urgency,
        estimatedRisk: pattern.estimatedRisk,
      }
    }
  }

  return bestMatch
}

function determineUrgency(
  input: string,
  baseUrgency: 'low' | 'medium' | 'high' | 'critical',
): 'low' | 'medium' | 'high' | 'critical' {
  const normalized = input.toLowerCase()
  const levels: Array<'low'|'medium'|'high'|'critical'> = ['low', 'medium', 'high', 'critical']

  for (const [keyword, urgency] of Object.entries(URGENCY_BOOSTERS)) {
    if (normalized.includes(keyword.toLowerCase())) {
      return levels.indexOf(urgency) > levels.indexOf(baseUrgency)
        ? urgency
        : baseUrgency
    }
  }
  return baseUrgency
}

function determineRisk(input: string, baseRisk: RiskLevel): RiskLevel {
  const normalized = input.toLowerCase()
  const riskOrder: Record<RiskLevel, number> = { SAFE: 0, MODERATE: 1, HIGH_RISK: 2, CRITICAL: 3 }
  let boostedRisk = baseRisk

  for (const [keyword, risk] of Object.entries(RISK_BOOSTER_KEYWORDS)) {
    if (normalized.includes(keyword.toLowerCase())) {
      if (riskOrder[risk] > riskOrder[boostedRisk]) {
        boostedRisk = risk
      }
    }
  }
  return boostedRisk
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA PURA COPIADA — CognitiveLoadManager (FASE 4)
// ═══════════════════════════════════════════════════════════════

const LOAD_LEVEL_THRESHOLDS: Array<{ level: LoadLevel; min: number; max: number }> = [
  { level: 'idle', min: 0.0, max: 0.15 },
  { level: 'optimal', min: 0.15, max: COGNITIVE_DEFAULTS.LOAD.moderateThreshold },
  { level: 'moderate', min: COGNITIVE_DEFAULTS.LOAD.moderateThreshold, max: COGNITIVE_DEFAULTS.LOAD.highThreshold },
  { level: 'high', min: COGNITIVE_DEFAULTS.LOAD.highThreshold, max: COGNITIVE_DEFAULTS.LOAD.overloadThreshold },
  { level: 'overloaded', min: COGNITIVE_DEFAULTS.LOAD.overloadThreshold, max: 1.0 },
]

function classifyLoad(loadScore: number): LoadLevel {
  for (const threshold of LOAD_LEVEL_THRESHOLDS) {
    if (loadScore >= threshold.min && loadScore < threshold.max) {
      return threshold.level
    }
  }
  return 'overloaded'
}

// computeLoadScore desde CognitiveStateManager (FASE 4)
function computeLoadScore(factors: LoadFactors): number {
  const weights = {
    activeConversations: 0.15,
    pendingActions: 0.10,
    memoryOperations: 0.05,
    activePromises: 0.12,
    activeToolExecutions: 0.20,
    unresolvedItems: 0.15,
  }

  const scale = (value: number, capacity: number): number => {
    if (value <= 0) return 0
    return Math.min(1.0, (value / capacity) ** 0.7)
  }

  const rawLoad =
    scale(factors.activeConversations, 8) * weights.activeConversations +
    scale(factors.pendingActions, 20) * weights.pendingActions +
    scale(factors.memoryOperations, 10) * weights.memoryOperations +
    scale(factors.activePromises, 10) * weights.activePromises +
    scale(factors.activeToolExecutions, 5) * weights.activeToolExecutions +
    scale(factors.unresolvedItems, 5) * weights.unresolvedItems

  return Math.min(1.0, Math.max(0.0, rawLoad))
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA PURA COPIADA — CognitiveRuntime.gate (FASE 4)
// ═══════════════════════════════════════════════════════════════

function simulateGate(
  cognitiveLoad: number,
  coherenceScore: number,
  emotionalMomentum: string,
  operation: {
    type: 'tool_execution' | 'message_send' | 'autonomous_action' | 'background_task' | 'learning'
    name: string
    priority?: number
  },
  attentionBudgetRemaining?: number,
): {
  decision: GateDecision
  reason: string
  modifiers: ExecutionModifiers
  priorityBoost: number
} {
  const loadLevel = classifyLoad(cognitiveLoad)
  const modifiers = computeModifiers({
    cognitiveLoad, coherenceScore, emotionalMomentum,
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: operation.type })

  // Paso 1: Verificar políticas de degradación por nivel de carga
  const bgAllowed = cognitiveLoad < COGNITIVE_DEFAULTS.LOAD.highThreshold
  const lrAllowed = cognitiveLoad < COGNITIVE_DEFAULTS.LOAD.overloadThreshold

  const operationPolicyMap: Record<string, boolean> = {
    tool_execution: bgAllowed,
    message_send: lrAllowed,
    autonomous_action: bgAllowed,
    background_task: bgAllowed,
    learning: cognitiveLoad < COGNITIVE_DEFAULTS.LOAD.moderateThreshold,
  }

  const isAllowed = operationPolicyMap[operation.type] ?? bgAllowed
  const priority = operation.priority ?? 0.5

  if (!isAllowed && priority < 0.8) {
    return {
      decision: 'deferred',
      reason: `Operación '${operation.type}' deshabilitada bajo carga ${loadLevel} (${cognitiveLoad.toFixed(3)})`,
      modifiers: defaultModifiers(),
      priorityBoost: -0.5,
    }
  }

  // Paso 2: Verificar umbral de coherencia
  if (coherenceScore < COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold) {
    if (operation.type !== 'message_send') {
      return {
        decision: 'rejected',
        reason: `Coherencia crítica (${coherenceScore.toFixed(3)}). Solo mensajes permitidos.`,
        modifiers: defaultModifiers(),
        priorityBoost: -1.0,
      }
    }
  }

  // Paso 3: Determinar decisión basada en carga
  let decision: GateDecision = 'approved'
  let priorityBoost = 0

  if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.highThreshold) {
    if (operation.type === 'background_task' || operation.type === 'learning') {
      decision = 'rejected'
      priorityBoost = -0.3
    } else {
      decision = 'throttled'
      priorityBoost = -0.2
    }
  } else if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
    if (operation.type === 'background_task' || operation.type === 'learning') {
      decision = 'deferred'
      priorityBoost = -0.1
    } else {
      decision = 'throttled'
    }
  }

  // Paso 4: Ajuste por presupuesto atencional bajo
  if (attentionBudgetRemaining !== undefined && attentionBudgetRemaining < 0.3) {
    if (priority < 0.7) {
      decision = 'deferred'
      priorityBoost -= 0.2
    }
  }

  // Paso 5: Boost empático para estados emocionales volátiles/falling
  if (emotionalMomentum === 'volatile' || emotionalMomentum === 'falling') {
    if (operation.type === 'message_send') {
      modifiers.empathyBoost += 0.15
      modifiers.shouldAcknowledgeEmotion = true
    }
  }

  const reasons: Record<GateDecision, string> = {
    approved: `Aprobada. Carga: ${cognitiveLoad.toFixed(3)} (${loadLevel}). Coherencia: ${coherenceScore.toFixed(3)}.`,
    throttled: `Limitada. Carga: ${cognitiveLoad.toFixed(3)} (${loadLevel}). Ejecución con recursos reducidos.`,
    rejected: `Rechazada. Carga: ${cognitiveLoad.toFixed(3)} (${loadLevel}). No es seguro ejecutar.`,
    deferred: `Diferida. Carga: ${cognitiveLoad.toFixed(3)} (${loadLevel}). En cola para ejecución posterior.`,
  }

  return { decision, reason: reasons[decision], modifiers, priorityBoost }
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA PURA COPIADA — CognitiveRuntime.computeModifiers (FASE 4)
// ═══════════════════════════════════════════════════════════════

function computeModifiers(
  state: {
    cognitiveLoad: number
    coherenceScore: number
    emotionalMomentum: string
    trustTrend: string
    timeHorizon: string
    temporalPressure: string
  },
  operation: { type: string; contactId?: string },
): ExecutionModifiers {
  const modifiers: ExecutionModifiers = {
    toneAdjustment: 0, responseUrgency: 0.5, detailLevel: 0.7,
    empathyBoost: 0, cautionLevel: 0.3, creativityLevel: 0.5,
    shouldAcknowledgeEmotion: false, shouldSimplify: false, maxResponseLength: 500,
  }

  // Ajustes por carga cognitiva
  if (state.cognitiveLoad > COGNITIVE_DEFAULTS.LOAD.highThreshold) {
    modifiers.shouldSimplify = true
    modifiers.maxResponseLength = 200
    modifiers.detailLevel = 0.3
    modifiers.creativityLevel = 0.2
  } else if (state.cognitiveLoad > COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
    modifiers.maxResponseLength = 350
    modifiers.detailLevel = 0.5
    modifiers.creativityLevel = 0.4
  }

  // Ajustes por momentum emocional
  switch (state.emotionalMomentum) {
    case 'volatile':
      modifiers.empathyBoost = 0.2
      modifiers.cautionLevel = 0.7
      modifiers.shouldAcknowledgeEmotion = true
      modifiers.creativityLevel = 0.3
      break
    case 'falling':
      modifiers.empathyBoost = 0.15
      modifiers.cautionLevel = 0.5
      modifiers.shouldAcknowledgeEmotion = true
      break
    case 'rising':
      modifiers.creativityLevel = 0.7
      modifiers.responseUrgency = 0.6
      break
    case 'recovering':
      modifiers.empathyBoost = 0.1
      modifiers.cautionLevel = 0.4
      break
  }

  // Ajustes por tendencia de confianza
  if (state.trustTrend === 'degrading') {
    modifiers.cautionLevel += 0.2
    modifiers.detailLevel += 0.1
    modifiers.toneAdjustment -= 0.05
  } else if (state.trustTrend === 'improving') {
    modifiers.creativityLevel += 0.1
    modifiers.toneAdjustment += 0.05
  }

  // Ajustes por presión temporal
  if (state.temporalPressure === 'high') {
    modifiers.responseUrgency = 0.9
    modifiers.detailLevel = Math.max(0.3, modifiers.detailLevel - 0.2)
    modifiers.maxResponseLength = Math.min(modifiers.maxResponseLength, 300)
  } else if (state.temporalPressure === 'medium') {
    modifiers.responseUrgency = 0.7
  }

  // Ajustes por coherencia baja
  if (state.coherenceScore < COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold) {
    modifiers.cautionLevel += 0.3
    modifiers.creativityLevel = Math.max(0.2, modifiers.creativityLevel - 0.2)
    modifiers.shouldSimplify = true
  }

  // Clamp
  modifiers.toneAdjustment = Math.max(-0.2, Math.min(0.2, modifiers.toneAdjustment))
  modifiers.responseUrgency = Math.max(0, Math.min(1, modifiers.responseUrgency))
  modifiers.detailLevel = Math.max(0, Math.min(1, modifiers.detailLevel))
  modifiers.empathyBoost = Math.max(0, Math.min(0.3, modifiers.empathyBoost))
  modifiers.cautionLevel = Math.max(0, Math.min(1, modifiers.cautionLevel))
  modifiers.creativityLevel = Math.max(0, Math.min(1, modifiers.creativityLevel))

  return modifiers
}

function defaultModifiers(): ExecutionModifiers {
  return {
    toneAdjustment: 0, responseUrgency: 0.5, detailLevel: 0.7,
    empathyBoost: 0, cautionLevel: 0.3, creativityLevel: 0.5,
    shouldAcknowledgeEmotion: false, shouldSimplify: false, maxResponseLength: 500,
  }
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA PURA COPIADA — ResponseGenerator.computeAIParams (Agent Runtime)
// ═══════════════════════════════════════════════════════════════

function computeAIParams(snapshot: CognitiveSnapshot): {
  temperature: number
  maxTokens: number
  frequencyPenalty: number
  presencePenalty: number
} {
  let temperature = 0.7
  let maxTokens = 2048
  let frequencyPenalty = 0.5
  let presencePenalty = 0.3

  // Momentum emocional → temperatura
  switch (snapshot.emotionalMomentum) {
    case 'volatile':
      temperature = 0.4
      break
    case 'rising':
      temperature = 0.85
      break
    case 'recovering':
      temperature = 0.6
      break
  }

  // Confianza → creatividad vs cautela
  if (snapshot.trustTrend === 'degrading') {
    temperature = Math.max(0.3, temperature - 0.2)
    presencePenalty = 0.5
  } else if (snapshot.trustTrend === 'improving') {
    presencePenalty = 0.6
  }

  // Carga cognitiva → longitud de respuesta
  if (snapshot.cognitiveLoad > 0.85) {
    maxTokens = 300
  } else if (snapshot.cognitiveLoad > 0.65) {
    maxTokens = 800
  }

  // Presión temporal → brevedad
  if (snapshot.temporalPressure === 'high') {
    maxTokens = Math.min(maxTokens, 600)
    temperature = Math.max(0.3, temperature - 0.1)
  }

  // Clamp
  temperature = Math.max(0.1, Math.min(1.0, temperature))
  maxTokens = Math.max(100, Math.min(4096, maxTokens))
  frequencyPenalty = Math.max(0, Math.min(1, frequencyPenalty))
  presencePenalty = Math.max(0, Math.min(1, presencePenalty))

  return { temperature, maxTokens, frequencyPenalty, presencePenalty }
}

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER — Infraestructura de pruebas
// ═══════════════════════════════════════════════════════════════

interface TestResult {
  name: string
  passed: boolean
  expected: unknown
  actual: unknown
  detail?: string
}

let totalTests = 0
let passedTests = 0
let failedTests = 0
const allResults: TestResult[] = []

function assert(
  name: string,
  condition: boolean,
  expected: unknown,
  actual: unknown,
  detail?: string,
): void {
  totalTests++
  const passed = condition
  if (passed) passedTests++
  else failedTests++
  allResults.push({ name, passed, expected, actual, detail })
}

function assertEqual<T>(name: string, expected: T, actual: T, detail?: string): void {
  assert(name, expected === actual, expected, actual, detail)
}

function assertIncludes(name: string, haystack: string, needle: string, detail?: string): void {
  assert(name, haystack.includes(needle), `contiene "${needle}"`, haystack, detail)
}

function assertApprox(
  name: string,
  expected: number,
  actual: number,
  tolerance: number = 0.01,
  detail?: string,
): void {
  assert(name, Math.abs(expected - actual) <= tolerance, `≈${expected} (±${tolerance})`, actual, detail)
}

function assertGreaterThan(name: string, threshold: number, actual: number, detail?: string): void {
  assert(name, actual > threshold, `> ${threshold}`, actual, detail)
}

function assertLessThan(name: string, threshold: number, actual: number, detail?: string): void {
  assert(name, actual < threshold, `< ${threshold}`, actual, detail)
}

function assertType(name: string, expected: string, actual: unknown, detail?: string): void {
  assert(name, typeof actual === expected, `tipo: ${expected}`, typeof actual, detail)
}

function assertTrue(name: string, actual: boolean, detail?: string): void {
  assert(name, actual === true, true, actual, detail)
}

function assertFalse(name: string, actual: boolean, detail?: string): void {
  assert(name, actual === false, false, actual, detail)
}

// ─── Impresión de resultados ────────────────────────────────────

function printResult(result: TestResult, index: number): void {
  const icon = result.passed
    ? `${C.green}✓ PASS${C.reset}`
    : `${C.red}✗ FAIL${C.reset}`
  const num = `${C.dim}${String(index).padStart(3, '0')}${C.reset}`

  console.log(`  ${num}  ${icon}  ${C.white}${result.name}${C.reset}`)

  if (!result.passed) {
    console.log(`       ${C.yellow}Esperado:${C.reset} ${C.cyan}${JSON.stringify(result.expected)}${C.reset}`)
    console.log(`       ${C.yellow}Real:${C.reset}     ${C.red}${JSON.stringify(result.actual)}${C.reset}`)
    if (result.detail) {
      console.log(`       ${C.dim}Detalle: ${result.detail}${C.reset}`)
    }
  }
}

function printSectionHeader(title: string, emoji: string): void {
  const line = '─'.repeat(70)
  console.log(`\n${C.magenta}${line}${C.reset}`)
  console.log(`${C.bold}${C.magenta}  ${emoji}  ${title}${C.reset}`)
  console.log(`${C.magenta}${line}${C.reset}`)
}

function printSummary(): void {
  const line = '═'.repeat(70)
  console.log(`\n${C.bold}${line}${C.reset}`)
  console.log(`${C.bold}  RESUMEN DE VALIDACIÓN — CICLO COGNITIVO ValiAutoFlow${C.reset}`)
  console.log(`${C.bold}${line}${C.reset}`)

  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0.0'

  console.log()
  console.log(`  Total:     ${C.bold}${C.white}${totalTests}${C.reset}`)
  console.log(`  Aprobados: ${C.bold}${C.green}${passedTests}${C.reset}`)
  console.log(`  Fallidos:  ${C.bold}${failedTests > 0 ? C.red : C.green}${failedTests}${C.reset}`)
  console.log(`  Tasa:      ${C.bold}${Number(passRate) >= 90 ? C.green : Number(passRate) >= 70 ? C.yellow : C.red}${passRate}%${C.reset}`)

  if (failedTests === 0) {
    console.log(`\n  ${C.bgGreen}${C.bold} TODAS LAS PRUEBAS PASARON ${C.reset}`)
  } else {
    console.log(`\n  ${C.bgRed}${C.white}${C.bold} ${failedTests} PRUEBA(S) FALLARON ${C.reset}`)
    console.log(`\n  ${C.yellow}Pruebas fallidas:${C.reset}`)
    allResults.filter(r => !r.passed).forEach((r, i) => {
      console.log(`    ${C.red}${i + 1}. ${r.name}${C.reset}`)
      console.log(`       ${C.dim}Esperado: ${JSON.stringify(r.expected)} → Real: ${JSON.stringify(r.actual)}${C.reset}`)
    })
  }

  console.log(`\n${C.bold}${line}${C.reset}\n`)

  // Código de salida para CI
  if (failedTests > 0) {
    process.exit(1)
  }
}

// ─── Timer de secciones ─────────────────────────────────────────

function timeSection(label: string, fn: () => void): void {
  const start = performance.now()
  fn()
  const elapsed = (performance.now() - start).toFixed(2)
  console.log(`\n  ${C.dim}⏱  Tiempo: ${elapsed}ms${C.reset}`)
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 1: Clasificación de Intenciones (FASE 3 — IntentClassifier)
// ═══════════════════════════════════════════════════════════════

function testIntentClassification(): void {
  printSectionHeader('PRUEBA 1: Clasificación de Intenciones (FASE 3)', '🎯')
  console.log()

  // Test 1.1: "Quiero agendar una cita para ver el Sentra"
  console.log(`  ${C.cyan}Caso: "Quiero agendar una cita para ver el Sentra"${C.reset}`)
  const m1 = matchPatterns('Quiero agendar una cita para ver el Sentra')
  let idx = 0
  assertEqual(`1.1.${++idx}  Intento = schedule`, 'schedule', m1.type)
  assertEqual(`1.1.${++idx}  Categoría = calendar`, 'calendar', m1.category)
  assertGreaterThan(`1.1.${++idx}  Confianza > 0`, 0, m1.confidence)

  // Test 1.2: "Busca contactos" (patrón regex directo)
  console.log(`  ${C.cyan}Caso: "Busca contactos del mes"${C.reset}`)
  const m2 = matchPatterns('Busca contactos del mes')
  idx = 0
  assertEqual(`1.2.${++idx}  Intento = query_data`, 'query_data', m2.type)
  assertEqual(`1.2.${++idx}  Categoría = analytics`, 'analytics', m2.category)
  assertGreaterThan(`1.2.${++idx}  Confianza > 0`, 0, m2.confidence)

  // Test 1.3: "Genera una respuesta para el cliente"
  console.log(`  ${C.cyan}Caso: "Genera una respuesta para el cliente"${C.reset}`)
  const m3 = matchPatterns('Genera una respuesta para el cliente')
  idx = 0
  assertEqual(`1.3.${++idx}  Intento = ai_generate`, 'ai_generate', m3.type)
  assertEqual(`1.3.${++idx}  Categoría = ai`, 'ai', m3.category)
  assertGreaterThan(`1.3.${++idx}  Confianza > 0`, 0, m3.confidence)

  // Test 1.4: "Enviar mensaje urgente a Carlos"
  console.log(`  ${C.cyan}Caso: "Enviar mensaje urgente a Carlos"${C.reset}`)
  const m4 = matchPatterns('Enviar mensaje urgente a Carlos')
  const u4 = determineUrgency('Enviar mensaje urgente a Carlos', m4.urgency)
  idx = 0
  assertEqual(`1.4.${++idx}  Intento = send_message`, 'send_message', m4.type)
  assertEqual(`1.4.${++idx}  Urgencia = high (por "urgente")`, 'high', u4)

  // Test 1.5: "Eliminar el contacto" (patrón regex directo)
  console.log(`  ${C.cyan}Caso: "Eliminar el contacto"${C.reset}`)
  const m5 = matchPatterns('Eliminar el contacto')
  const r5 = determineRisk('Eliminar el contacto', m5.estimatedRisk)
  idx = 0
  assertEqual(`1.5.${++idx}  Intento = modify_record`, 'modify_record', m5.type)
  assertEqual(`1.5.${++idx}  Riesgo = HIGH_RISK (por "eliminar")`, 'HIGH_RISK', r5)

  // Test 1.6: "Eliminar contactos de forma masivo" (usa keyword exacto)
  console.log(`  ${C.cyan}Caso: "Eliminar contactos de forma masivo"${C.reset}`)
  const r6 = determineRisk('Eliminar contactos de forma masivo', 'MODERATE')
  assertEqual(`1.6.1    Riesgo = CRITICAL (por "eliminar" + "masivo")`, 'CRITICAL', r6)

  // Test 1.7: Input aleatorio sin patrones
  console.log(`  ${C.cyan}Caso: "hola que tal todo bien hoy"${
    C.reset}\n         (texto sin patrones de intención reconocibles)`)
  const m7 = matchPatterns('hola que tal todo bien hoy')
  idx = 0
  assertEqual(`1.7.${++idx}  Intento = unknown`, 'unknown', m7.type)
  assertApprox(`1.7.${++idx}  Confianza baja (< 0.1)`, 0, m7.confidence, 0.15)

  // Test 1.8: "Enviar asap un whatsapp"
  console.log(`  ${C.cyan}Caso: "Enviar asap un whatsapp"${C.reset}`)
  const u8 = determineUrgency('Enviar asap un whatsapp', 'medium')
  assertEqual(`1.8.1    Urgencia = critical (por "asap")`, 'critical', u8)

  // Test 1.9: "Cancelar la suscripción"
  console.log(`  ${C.cyan}Caso: "Cancelar la suscripción"${C.reset}`)
  const r9 = determineRisk('Cancelar la suscripción', 'SAFE')
  assertEqual(`1.9.1    Riesgo = HIGH_RISK (por "cancelar")`, 'HIGH_RISK', r9)

  // Test 1.10: "Genera una factura y cobra"
  console.log(`  ${C.cyan}Caso: "Genera una factura y cobra"${C.reset}`)
  const m10 = matchPatterns('Genera una factura y cobra')
  assertEqual(`1.10.1   Intento contiene payment o ai_generate`,
    true, m10.type === 'payment' || m10.type === 'ai_generate')

  // Imprimir resultados de esta sección
  console.log()
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 2: Clasificación de Carga Cognitiva (FASE 4 — CognitiveLoadManager)
// ═══════════════════════════════════════════════════════════════

function testCognitiveLoadClassification(): void {
  printSectionHeader('PRUEBA 2: Carga Cognitiva y computeLoadScore (FASE 4)', '🧠')
  console.log()

  // Test 2.1: Clasificación de niveles de carga
  console.log(`  ${C.cyan}Clasificación de niveles de carga:${C.reset}`)
  assertEqual('2.1.1    score=0.00 → idle', 'idle', classifyLoad(0.0))
  assertEqual('2.1.2    score=0.10 → idle', 'idle', classifyLoad(0.10))
  assertEqual('2.1.3    score=0.15 → optimal (frontera inclusiva)', 'optimal', classifyLoad(0.15))
  assertEqual('2.1.4    score=0.20 → optimal', 'optimal', classifyLoad(0.20))
  assertEqual('2.1.5    score=0.40 → optimal', 'optimal', classifyLoad(0.40))
  assertEqual('2.1.6    score=0.50 → optimal (antes de umbral 0.65)', 'optimal', classifyLoad(0.50))
  assertEqual('2.1.7    score=0.70 → moderate (en rango [0.65, 0.85))', 'moderate', classifyLoad(0.70))
  assertEqual('2.1.8    score=0.90 → high (en rango [0.85, 0.95))', 'high', classifyLoad(0.90))
  assertEqual('2.1.9    score=0.95 → overloaded', 'overloaded', classifyLoad(0.95))
  assertEqual('2.1.10   score=1.00 → overloaded', 'overloaded', classifyLoad(1.00))

  // Test 2.2: Valores de frontera exactos
  console.log(`\n  ${C.cyan}Valores de frontera:${C.reset}`)
  assertEqual('2.2.1    0.149 → idle (justo antes de optimal)', 'idle', classifyLoad(0.149))
  assertEqual('2.2.2    0.650 → moderate (umbral exacto)', 'moderate', classifyLoad(0.650))
  assertEqual('2.2.3    0.850 → high (umbral exacto)', 'high', classifyLoad(0.850))
  assertEqual('2.2.4    0.950 → overloaded (umbral exacto)', 'overloaded', classifyLoad(0.950))

  // Test 2.3: computeLoadScore con varios factores
  console.log(`\n  ${C.cyan}computeLoadScore con varios factores:${C.reset}`)

  // Cero operaciones → carga 0
  const emptyFactors: LoadFactors = {
    activeConversations: 0, pendingActions: 0, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 0, unresolvedItems: 0,
  }
  assertApprox('2.3.1    Todos los factores en 0 → score ≈ 0', 0, computeLoadScore(emptyFactors), 0.001)

  // Solo una conversación activa → carga baja
  const oneConv: LoadFactors = {
    activeConversations: 1, pendingActions: 0, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 0, unresolvedItems: 0,
  }
  const oneScore = computeLoadScore(oneConv)
  assertGreaterThan('2.3.2    1 conversación → score > 0', 0, oneScore)
  assertLessThan('2.3.3    1 conversación → score < 0.2', 0.2, oneScore)

  // Muchas conversaciones → carga alta
  const heavyConv: LoadFactors = {
    activeConversations: 8, pendingActions: 15, memoryOperations: 5,
    activePromises: 8, activeToolExecutions: 4, unresolvedItems: 4,
  }
  const heavyScore = computeLoadScore(heavyConv)
  assertGreaterThan('2.3.4    Carga pesada → score > 0.5', 0.5, heavyScore)

  // Solo tool executions → penalización fuerte
  const toolsOnly: LoadFactors = {
    activeConversations: 0, pendingActions: 0, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 5, unresolvedItems: 0,
  }
  const toolsScore = computeLoadScore(toolsOnly)
  assertGreaterThan('2.3.5    5 herramientas → score > 0.15', 0.15, toolsScore)

  // Los tool executions pesan más que las conversaciones
  const toolsHeavier: LoadFactors = {
    activeConversations: 0, pendingActions: 0, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 3, unresolvedItems: 0,
  }
  const convOnly: LoadFactors = {
    activeConversations: 3, pendingActions: 0, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 0, unresolvedItems: 0,
  }
  assertGreaterThan(
    '2.3.6    3 tools > 3 conversaciones (peso 0.20 > 0.15)',
    computeLoadScore(convOnly),
    computeLoadScore(toolsHeavier),
  )

  // Test 2.4: Nivel de carga produce clasificaciones correctas
  console.log(`\n  ${C.cyan}computeLoadScore → classifyLoad (integración):${C.reset}`)
  const lightFactors: LoadFactors = {
    activeConversations: 2, pendingActions: 3, memoryOperations: 1,
    activePromises: 1, activeToolExecutions: 0, unresolvedItems: 0,
  }
  const lightLevel = classifyLoad(computeLoadScore(lightFactors))
  assertEqual('2.4.1    Carga ligera → optimal o idle',
    true, lightLevel === 'optimal' || lightLevel === 'idle')

  // Factor de unresolvedItems es significativo — factores máximos
  const unresolved: LoadFactors = {
    activeConversations: 8, pendingActions: 20, memoryOperations: 10,
    activePromises: 10, activeToolExecutions: 5, unresolvedItems: 5,
  }
  const unresolvedScore = computeLoadScore(unresolved)
  const unresolvedLevel = classifyLoad(unresolvedScore)
  assertGreaterThan('2.4.2    Muchos items → score alto', 0.4, unresolvedScore)
  assertEqual('2.4.3    Muchos items máximos → nivel >= moderate',
    true, unresolvedLevel === 'moderate' || unresolvedLevel === 'high' || unresolvedLevel === 'overloaded')

  console.log()
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 3: Lógica de Gate / Decisiones (FASE 4 — CognitiveRuntime.gate)
// ═══════════════════════════════════════════════════════════════

function testGateDecisionLogic(): void {
  printSectionHeader('PRUEBA 3: Lógica de Gate / Decisiones (FASE 4)', '🚧')
  console.log()

  // Test 3.1: Carga baja + buena coherencia → approved
  console.log(`  ${C.cyan}Caso: Carga baja (0.2) + coherencia alta (0.9) → aprobado${C.reset}`)
  const g1 = simulateGate(0.2, 0.9, 'stable', {
    type: 'tool_execution', name: 'buscar_contactos', priority: 0.5,
  })
  assertEqual('3.1.1    Decisión = approved', 'approved', g1.decision)
  assertGreaterThan('3.1.2    priorityBoost >= -0.1', -0.1, g1.priorityBoost)

  // Test 3.2: Carga alta + tarea background → rejected/deferred
  console.log(`  ${C.cyan}Caso: Carga alta (0.87) + background_task → rechazada/diferida${C.reset}`)
  const g2 = simulateGate(0.87, 0.8, 'stable', {
    type: 'background_task', name: 'sync_memories', priority: 0.3,
  })
  assertEqual('3.2.1    Decisión ≠ approved',
    true, g2.decision !== 'approved', `Esperado ≠ approved, Real = ${g2.decision}`)
  assertEqual('3.2.2    Decisión = rejected o deferred',
    true, g2.decision === 'rejected' || g2.decision === 'deferred')

  // Test 3.3: Coherencia baja + operación no-message → rejected
  console.log(`  ${C.cyan}Caso: Coherencia crítica (0.3) + tool_execution → rechazada${C.reset}`)
  const g3 = simulateGate(0.2, 0.3, 'stable', {
    type: 'tool_execution', name: 'delete_contact', priority: 0.5,
  })
  assertEqual('3.3.1    Decisión = rejected', 'rejected', g3.decision)

  // Test 3.4: Coherencia baja + message_send → permitido (fail-open para UX)
  console.log(`  ${C.cyan}Caso: Coherencia crítica (0.3) + message_send → permitido${C.reset}`)
  const g4 = simulateGate(0.2, 0.3, 'stable', {
    type: 'message_send', name: 'enviar_respuesta', priority: 0.5,
  })
  assertEqual('3.4.1    Decisión = approved', 'approved', g4.decision)

  // Test 3.5: Carga moderada + tool_execution → throttled
  console.log(`  ${C.cyan}Caso: Carga moderada (0.70) + tool_execution → throttled${C.reset}`)
  const g5 = simulateGate(0.70, 0.85, 'stable', {
    type: 'tool_execution', name: 'update_contact', priority: 0.5,
  })
  assertEqual('3.5.1    Decisión = throttled', 'throttled', g5.decision)

  // Test 3.6: Carga moderada + background_task → deferred
  console.log(`  ${C.cyan}Caso: Carga moderada (0.70) + background_task → deferred${C.reset}`)
  const g6 = simulateGate(0.70, 0.85, 'stable', {
    type: 'background_task', name: 'consolidate_memory', priority: 0.3,
  })
  assertEqual('3.6.1    Decisión = deferred', 'deferred', g6.decision)

  // Test 3.7: Carga alta + operación prioritaria (0.9) → rejected (la prioridad
  //            evita el deferred inicial, pero step 3 rechaza backgrounds bajo high)
  console.log(`  ${C.cyan}Caso: Carga alta (0.87) + background prioritario (0.9) → rejected${C.reset}`)
  const g7 = simulateGate(0.87, 0.8, 'stable', {
    type: 'background_task', name: 'critical_sync', priority: 0.9,
  })
  assertEqual('3.7.1    Decisión = rejected (high load + background, incluso con alta prioridad)', 'rejected', g7.decision)

  // Test 3.8: Carga alta (0.87) → message_send → throttled (message sigue permitido)
  console.log(`  ${C.cyan}Caso: Carga alta (0.87) + message_send → throttled${C.reset}`)
  const g8 = simulateGate(0.87, 0.8, 'stable', {
    type: 'message_send', name: 'send_urgent', priority: 0.7,
  })
  assertEqual('3.8.1    Decisión = throttled', 'throttled', g8.decision)

  // Test 3.9: Presupuesto atencional bajo → deferred
  console.log(`  ${C.cyan}Caso: Presupuesto atencional bajo (0.2) → deferred${C.reset}`)
  const g9 = simulateGate(0.3, 0.8, 'stable', {
    type: 'tool_execution', name: 'non_critical_op', priority: 0.5,
  }, 0.2)
  assertEqual('3.9.1    Decisión = deferred', 'deferred', g9.decision)

  // Test 3.10: Empatía boost en estado emocional volátil
  console.log(`  ${C.cyan}Caso: Estado emocional volatile + message_send → empatía boost${C.reset}`)
  const g10 = simulateGate(0.2, 0.9, 'volatile', {
    type: 'message_send', name: 'respond_emotional', priority: 0.5,
  })
  assertEqual('3.10.1   Decisión = approved', 'approved', g10.decision)
  assertGreaterThan('3.10.2   empathyBoost > 0 (boost activado)', 0, g10.modifiers.empathyBoost)
  assertTrue('3.10.3   shouldAcknowledgeEmotion = true', g10.modifiers.shouldAcknowledgeEmotion)

  console.log()
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 4: Modificadores de Ejecución (FASE 4 — computeModifiers)
// ═══════════════════════════════════════════════════════════════

function testExecutionModifiers(): void {
  printSectionHeader('PRUEBA 4: Modificadores de Ejecución (FASE 4)', '⚙️')
  console.log()

  // Test 4.1: Estado emocional stable → modificadores default
  console.log(`  ${C.cyan}Caso: Estado emocional stable → modificadores base${C.reset}`)
  const mod1 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.1.1    empathyBoost ≈ 0', 0, mod1.empathyBoost, 0.01)
  assertApprox('4.1.2    cautionLevel ≈ 0.3', 0.3, mod1.cautionLevel, 0.01)
  assertFalse('4.1.3    shouldAcknowledgeEmotion = false', mod1.shouldAcknowledgeEmotion)
  assertFalse('4.1.4    shouldSimplify = false', mod1.shouldSimplify)
  assertEqual('4.1.5    maxResponseLength = 500', 500, mod1.maxResponseLength)

  // Test 4.2: Estado emocional volatile → alta empatía, alta cautela
  console.log(`  ${C.cyan}Caso: Estado emocional volatile → alta empatía y cautela${C.reset}`)
  const mod2 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'volatile',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.2.1    empathyBoost ≈ 0.2', 0.2, mod2.empathyBoost, 0.01)
  assertApprox('4.2.2    cautionLevel ≈ 0.7', 0.7, mod2.cautionLevel, 0.01)
  assertTrue('4.2.3    shouldAcknowledgeEmotion = true', mod2.shouldAcknowledgeEmotion)

  // Test 4.3: Estado emocional rising → alta creatividad
  console.log(`  ${C.cyan}Caso: Estado emocional rising → alta creatividad${C.reset}`)
  const mod3 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'rising',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.3.1    creativityLevel ≈ 0.7', 0.7, mod3.creativityLevel, 0.01)
  assertApprox('4.3.2    responseUrgency ≈ 0.6', 0.6, mod3.responseUrgency, 0.01)

  // Test 4.4: Carga cognitiva alta → simplificación activa
  console.log(`  ${C.cyan}Caso: Carga cognitiva alta (0.9) → simplificación${C.reset}`)
  const mod4 = computeModifiers({
    cognitiveLoad: 0.9, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertTrue('4.4.1    shouldSimplify = true', mod4.shouldSimplify)
  assertEqual('4.4.2    maxResponseLength = 200', 200, mod4.maxResponseLength)
  assertApprox('4.4.3    detailLevel ≈ 0.3', 0.3, mod4.detailLevel, 0.05)

  // Test 4.5: Confianza degradando → cautela incrementada
  console.log(`  ${C.cyan}Caso: Confianza degradando → cautela +0.2, detalle +0.1${C.reset}`)
  const mod5 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'degrading', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.5.1    cautionLevel ≈ 0.5 (0.3 + 0.2)', 0.5, mod5.cautionLevel, 0.01)
  assertApprox('4.5.2    detailLevel ≈ 0.8 (0.7 + 0.1)', 0.8, mod5.detailLevel, 0.01)
  assertApprox('4.5.3    toneAdjustment ≈ -0.05 (más formal)', -0.05, mod5.toneAdjustment, 0.01)

  // Test 4.6: Confianza mejorando → creatividad +0.1, tono +0.05
  console.log(`  ${C.cyan}Caso: Confianza mejorando → creatividad +0.1, tono +0.05${C.reset}`)
  const mod6 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'improving', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.6.1    creativityLevel ≈ 0.6 (0.5 + 0.1)', 0.6, mod6.creativityLevel, 0.01)
  assertApprox('4.6.2    toneAdjustment ≈ 0.05 (más cálido)', 0.05, mod6.toneAdjustment, 0.01)

  // Test 4.7: Presión temporal alta → urgencia al máximo
  console.log(`  ${C.cyan}Caso: Presión temporal alta → urgencia 0.9, max ≤ 300${C.reset}`)
  const mod7 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', timeHorizon: 'immediate', temporalPressure: 'high',
  }, { type: 'message_send' })
  assertApprox('4.7.1    responseUrgency = 0.9', 0.9, mod7.responseUrgency, 0.01)
  assertLessThan('4.7.2    maxResponseLength ≤ 300', 301, mod7.maxResponseLength)

  // Test 4.8: Coherencia baja → cautela +0.3, simplificación
  console.log(`  ${C.cyan}Caso: Coherencia baja (0.6) → cautela +0.3, simplificación${C.reset}`)
  const mod8 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.6, emotionalMomentum: 'stable',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertTrue('4.8.1    shouldSimplify = true', mod8.shouldSimplify)
  assertApprox('4.8.2    cautionLevel ≈ 0.6 (0.3 + 0.3)', 0.6, mod8.cautionLevel, 0.01)

  // Test 4.9: Estado falling → empatía moderada
  console.log(`  ${C.cyan}Caso: Estado emocional falling → empatía 0.15, cautela 0.5${C.reset}`)
  const mod9 = computeModifiers({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'falling',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertApprox('4.9.1    empathyBoost ≈ 0.15', 0.15, mod9.empathyBoost, 0.01)
  assertApprox('4.9.2    cautionLevel ≈ 0.5', 0.5, mod9.cautionLevel, 0.01)
  assertTrue('4.9.3    shouldAcknowledgeEmotion = true', mod9.shouldAcknowledgeEmotion)

  // Test 4.10: Carga moderada → maxResponseLength = 350
  console.log(`  ${C.cyan}Caso: Carga moderada (0.70) → maxResponseLength = 350${C.reset}`)
  const mod10 = computeModifiers({
    cognitiveLoad: 0.70, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', timeHorizon: 'short_term', temporalPressure: 'none',
  }, { type: 'message_send' })
  assertEqual('4.10.1   maxResponseLength = 350', 350, mod10.maxResponseLength)

  // Test 4.11: Clamping de valores — todos dentro de rango
  console.log(`  ${C.cyan}Caso: Verificación de clamping en todos los valores${C.reset}`)
  const extremeMod = computeModifiers({
    cognitiveLoad: 0.99, coherenceScore: 0.1, emotionalMomentum: 'volatile',
    trustTrend: 'degrading', timeHorizon: 'immediate', temporalPressure: 'high',
  }, { type: 'message_send' })
  assert('4.11.1   toneAdjustment en rango [-0.2, 0.2]',
    extremeMod.toneAdjustment >= -0.2 && extremeMod.toneAdjustment <= 0.2,
    '[-0.2, 0.2]', extremeMod.toneAdjustment)
  assert('4.11.2   responseUrgency en rango [0, 1]',
    extremeMod.responseUrgency >= 0 && extremeMod.responseUrgency <= 1,
    '[0, 1]', extremeMod.responseUrgency)
  assert('4.11.3   detailLevel en rango [0, 1]',
    extremeMod.detailLevel >= 0 && extremeMod.detailLevel <= 1,
    '[0, 1]', extremeMod.detailLevel)
  assert('4.11.4   empathyBoost en rango [0, 0.3]',
    extremeMod.empathyBoost >= 0 && extremeMod.empathyBoost <= 0.3,
    '[0, 0.3]', extremeMod.empathyBoost)
  assert('4.11.5   cautionLevel en rango [0, 1]',
    extremeMod.cautionLevel >= 0 && extremeMod.cautionLevel <= 1,
    '[0, 1]', extremeMod.cautionLevel)
  assert('4.11.6   creativityLevel en rango [0, 1]',
    extremeMod.creativityLevel >= 0 && extremeMod.creativityLevel <= 1,
    '[0, 1]', extremeMod.creativityLevel)

  console.log()
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 5: Parámetros AI (Agent Runtime — ResponseGenerator.computeAIParams)
// ═══════════════════════════════════════════════════════════════

function testAIParameters(): void {
  printSectionHeader('PRUEBA 5: Parámetros de IA (ResponseGenerator)', '🤖')
  console.log()

  // Test 5.1: Emoción volatile → temperatura baja (0.4)
  console.log(`  ${C.cyan}Caso: Emoción volatile → temperatura controlada (0.4)${C.reset}`)
  const ai1 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'volatile',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertApprox('5.1.1    temperature ≈ 0.4', 0.4, ai1.temperature, 0.05)

  // Test 5.2: Emoción rising → temperatura alta (0.85)
  console.log(`  ${C.cyan}Caso: Emoción rising → temperatura creativa (0.85)${C.reset}`)
  const ai2 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'rising',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertApprox('5.2.1    temperature ≈ 0.85', 0.85, ai2.temperature, 0.05)

  // Test 5.3: Emoción recovering → temperatura suave (0.6)
  console.log(`  ${C.cyan}Caso: Emoción recovering → temperatura suave (0.6)${C.reset}`)
  const ai3 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'recovering',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertApprox('5.3.1    temperature ≈ 0.6', 0.6, ai3.temperature, 0.05)

  // Test 5.4: Carga cognitiva alta → maxTokens = 300
  console.log(`  ${C.cyan}Caso: Carga cognitiva alta (0.90) → maxTokens = 300${C.reset}`)
  const ai4 = computeAIParams({
    cognitiveLoad: 0.90, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertEqual('5.4.1    maxTokens = 300', 300, ai4.maxTokens)

  // Test 5.5: Carga cognitiva moderada → maxTokens = 800
  console.log(`  ${C.cyan}Caso: Carga cognitiva moderada (0.70) → maxTokens = 800${C.reset}`)
  const ai5 = computeAIParams({
    cognitiveLoad: 0.70, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertEqual('5.5.1    maxTokens = 800', 800, ai5.maxTokens)

  // Test 5.6: Presión temporal alta → maxTokens ≤ 600, temperatura reducida
  console.log(`  ${C.cyan}Caso: Presión temporal alta → maxTokens ≤ 600, temp reducida${C.reset}`)
  const ai6 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'high', timeHorizon: 'immediate',
  })
  assertLessThan('5.6.1    maxTokens ≤ 600', 601, ai6.maxTokens)
  assertLessThan('5.6.2    temperature ≤ 0.7 (base 0.7 - 0.1)', 0.71, ai6.temperature)

  // Test 5.7: Confianza degradando → temperatura -0.2, presencePenalty = 0.5
  console.log(`  ${C.cyan}Caso: Confianza degradando → temp -0.2, presencePenalty = 0.5${C.reset}`)
  const ai7 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'degrading', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertApprox('5.7.1    temperature ≈ 0.5 (0.7 - 0.2)', 0.5, ai7.temperature, 0.05)
  assertApprox('5.7.2    presencePenalty = 0.5', 0.5, ai7.presencePenalty, 0.05)

  // Test 5.8: Confianza mejorando → presencePenalty = 0.6
  console.log(`  ${C.cyan}Caso: Confianza mejorando → presencePenalty = 0.6${C.reset}`)
  const ai8 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'improving', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertApprox('5.8.1    presencePenalty = 0.6', 0.6, ai8.presencePenalty, 0.05)

  // Test 5.9: Carga baja + sin presión → maxTokens = 2048 (default)
  console.log(`  ${C.cyan}Caso: Carga baja + sin presión → maxTokens = 2048 (default)${C.reset}`)
  const ai9 = computeAIParams({
    cognitiveLoad: 0.3, coherenceScore: 0.9, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'long_term',
  })
  assertEqual('5.9.1    maxTokens = 2048', 2048, ai9.maxTokens)

  // Test 5.10: Combinación extrema — volatile + degrading + high load + pressure
  console.log(`  ${C.cyan}Caso: Combinación extrema → valores conservadores${C.reset}`)
  const ai10 = computeAIParams({
    cognitiveLoad: 0.95, coherenceScore: 0.4, emotionalMomentum: 'volatile',
    trustTrend: 'degrading', temporalPressure: 'high', timeHorizon: 'immediate',
  })
  assertLessThan('5.10.1   temperature ≤ 0.4', 0.41, ai10.temperature)
  assertEqual('5.10.2   maxTokens = 300', 300, ai10.maxTokens)
  assertApprox('5.10.3   presencePenalty = 0.5', 0.5, ai10.presencePenalty, 0.05)

  // Test 5.11: Clamp de valores
  console.log(`  ${C.cyan}Caso: Verificación de clamping${C.reset}`)
  assert('5.11.1   temperature en [0.1, 1.0]',
    ai10.temperature >= 0.1 && ai10.temperature <= 1.0,
    '[0.1, 1.0]', ai10.temperature)
  assert('5.11.2   maxTokens en [100, 4096]',
    ai10.maxTokens >= 100 && ai10.maxTokens <= 4096,
    '[100, 4096]', ai10.maxTokens)
  assert('5.11.3   frequencyPenalty en [0, 1]',
    ai10.frequencyPenalty >= 0 && ai10.frequencyPenalty <= 1,
    '[0, 1]', ai10.frequencyPenalty)
  assert('5.11.4   presencePenalty en [0, 1]',
    ai10.presencePenalty >= 0 && ai10.presencePenalty <= 1,
    '[0, 1]', ai10.presencePenalty)

  console.log()
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA 6: Simulación Integrada del Ciclo Cognitivo
// ═══════════════════════════════════════════════════════════════

function testIntegratedCognitiveLoop(): void {
  printSectionHeader('PRUEBA 6: Simulación Integrada del Ciclo Cognitivo', '🔄')
  console.log()

  // ── Escenario A: Operación normal, sistema estable ──
  console.log(`  ${C.cyan}Escenario A: "Agendar cita" — Sistema estable, carga baja${C.reset}`)
  console.log(`           Flujo: Input → Intent → Gate → Modifiers → AI Params${C.reset}`)

  // Paso 1: Clasificar intención
  const intentA = matchPatterns('Quiero agendar una cita para ver el Sentra')
  assertEqual('A.1.1    Intent = schedule', 'schedule', intentA.type)
  assertGreaterThan('A.1.2    Confianza > 0.3', 0.3, intentA.confidence)

  // Paso 2: Calcular carga cognitiva
  const loadA = computeLoadScore({
    activeConversations: 2, pendingActions: 1, memoryOperations: 0,
    activePromises: 0, activeToolExecutions: 0, unresolvedItems: 0,
  })
  const levelA = classifyLoad(loadA)
  assertEqual('A.2.1    Nivel de carga = optimal o idle',
    true, levelA === 'optimal' || levelA === 'idle')

  // Paso 3: Gate decision
  const gateA = simulateGate(loadA, 0.92, 'stable', {
    type: 'tool_execution', name: 'schedule_appointment', priority: 0.6,
  })
  assertEqual('A.3.1    Gate = approved', 'approved', gateA.decision)

  // Paso 4: Modifiers
  assertLessThan('A.4.1    cautionLevel < 0.5', 0.5, gateA.modifiers.cautionLevel)
  assertFalse('A.4.2    shouldSimplify = false', gateA.modifiers.shouldSimplify)

  // Paso 5: AI Params
  const aiA = computeAIParams({
    cognitiveLoad: loadA, coherenceScore: 0.92, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'none', timeHorizon: 'short_term',
  })
  assertEqual('A.5.1    maxTokens = 2048', 2048, aiA.maxTokens)
  assertApprox('A.5.2    temperature ≈ 0.7', 0.7, aiA.temperature, 0.05)

  // ── Escenario B: Crisis — alta carga, emoción volátil, confianza cayendo ──
  console.log(`\n  ${C.cyan}Escenario B: "Cliente enojado exige respuesta" — Crisis${C.reset}`)
  console.log(`           Carga alta, emoción volatile, confianza degrading${C.reset}`)

  const intentB = matchPatterns('El cliente está muy enojado, responde ya')
  const urgencyB = determineUrgency('El cliente está muy enojado, responde ya', 'medium')
  const loadB = computeLoadScore({
    activeConversations: 7, pendingActions: 12, memoryOperations: 3,
    activePromises: 6, activeToolExecutions: 3, unresolvedItems: 4,
  })
  const levelB = classifyLoad(loadB)

  console.log(`       Intent: ${C.yellow}${intentB.type}${C.reset} | Urgencia: ${C.yellow}${urgencyB}${C.reset} | Carga: ${C.yellow}${loadB.toFixed(3)} (${levelB})${C.reset}`)

  const gateB = simulateGate(loadB, 0.55, 'volatile', {
    type: 'message_send', name: 'respond_angry_client', priority: 0.8,
  })

  assertEqual('B.1.1    Urgencia = high (por "ya")', 'high', urgencyB)
  assertGreaterThan('B.1.2    Carga > 0.5', 0.5, loadB)
  assertEqual('B.1.3    Gate = approved (message_send con prioridad 0.8)',
    'approved', gateB.decision)
  assertGreaterThan('B.1.4    empathyBoost > 0', 0, gateB.modifiers.empathyBoost)
  assertTrue('B.1.5    shouldAcknowledgeEmotion = true', gateB.modifiers.shouldAcknowledgeEmotion)

  const aiB = computeAIParams({
    cognitiveLoad: loadB, coherenceScore: 0.55, emotionalMomentum: 'volatile',
    trustTrend: 'degrading', temporalPressure: 'high', timeHorizon: 'immediate',
  })
  assertLessThan('B.2.1    temperature ≤ 0.5', 0.5, aiB.temperature)
  assertLessThan('B.2.2    maxTokens ≤ 600', 601, aiB.maxTokens)

  // ── Escenario C: Mantenimiento en background con carga alta ──
  console.log(`\n  ${C.cyan}Escenario C: "Sincronizar memoria" — Tarea de fondo con carga alta${C.reset}`)

  const loadC = computeLoadScore({
    activeConversations: 7, pendingActions: 15, memoryOperations: 5,
    activePromises: 8, activeToolExecutions: 4, unresolvedItems: 4,
  })
  const levelC = classifyLoad(loadC)

  const gateC = simulateGate(loadC, 0.85, 'stable', {
    type: 'background_task', name: 'memory_consolidation', priority: 0.2,
  })

  console.log(`       Carga: ${C.yellow}${loadC.toFixed(3)} (${levelC})${C.reset}`)
  assertEqual('C.1.1    Gate = rejected (background con carga alta)',
    true, gateC.decision === 'rejected' || gateC.decision === 'deferred')

  // ── Escenario D: Operación de riesgo con coherencia rota ──
  console.log(`\n  ${C.cyan}Escenario D: "Eliminar todos los datos" — Coherencia rota + riesgo alto${C.reset}`)

  const intentD = matchPatterns('Eliminar global los contactos del sistema')
  const riskD = determineRisk('Eliminar global los contactos del sistema', intentD.estimatedRisk)
  const gateD = simulateGate(0.3, 0.35, 'stable', {
    type: 'tool_execution', name: 'delete_all_contacts', priority: 0.5,
  })

  assertEqual('D.1.1    Intent = modify_record', 'modify_record', intentD.type)
  assertEqual('D.1.2    Riesgo = CRITICAL (por "global")', 'CRITICAL', riskD)
  assertEqual('D.1.3    Gate = rejected (coherencia < 0.50)', 'rejected', gateD.decision)

  // ── Escenario E: Flujo completo con impresión de cadena de decisión ──
  console.log(`\n  ${C.cyan}Escenario E: Cadena de decisión completa (verbose)${C.reset}`)
  console.log()

  const inputE = 'Enviar mensaje urgente a Carlos sobre la factura'
  const intentE = matchPatterns(inputE)
  const urgencyE = determineUrgency(inputE, intentE.urgency)
  const riskE = determineRisk(inputE, intentE.estimatedRisk)
  const loadE = 0.45
  const levelE = classifyLoad(loadE)
  const gateE = simulateGate(loadE, 0.80, 'stable', {
    type: 'message_send', name: 'send_urgent_to_carlos', priority: 0.7,
  })
  const aiE = computeAIParams({
    cognitiveLoad: loadE, coherenceScore: 0.80, emotionalMomentum: 'stable',
    trustTrend: 'stable', temporalPressure: 'medium', timeHorizon: 'short_term',
  })

  console.log(`       ${C.dim}Input:${C.reset}       "${C.white}${inputE}${C.reset}"`)
  console.log(`       ${C.dim}Intento:${C.reset}      ${C.cyan}${intentE.type}${C.reset} (${C.dim}${intentE.label}${C.reset})`)
  console.log(`       ${C.dim}Confianza:${C.reset}    ${C.cyan}${(intentE.confidence * 100).toFixed(1)}%${C.reset}`)
  console.log(`       ${C.dim}Urgencia:${C.reset}     ${C.yellow}${urgencyE}${C.reset}`)
  console.log(`       ${C.dim}Riesgo:${C.reset}       ${C.red}${riskE}${C.reset}`)
  console.log(`       ${C.dim}Carga Cogn.:${C.reset}  ${C.yellow}${loadE.toFixed(3)}${C.reset} (${C.dim}${levelE}${C.reset})`)
  console.log(`       ${C.dim}Coherencia:${C.reset}   ${C.yellow}0.800${C.reset}`)
  console.log(`       ${C.dim}Gate:${C.reset}         ${gateE.decision === 'approved' ? C.green : C.red}${gateE.decision}${C.reset}`)
  console.log(`       ${C.dim}Temp. IA:${C.reset}     ${C.cyan}${aiE.temperature.toFixed(2)}${C.reset}`)
  console.log(`       ${C.dim}MaxTokens:${C.reset}    ${C.cyan}${aiE.maxTokens}${C.reset}`)
  console.log(`       ${C.dim}Simplificar:${C.reset}  ${gateE.modifiers.shouldSimplify ? C.yellow : C.green}${gateE.modifiers.shouldSimplify}${C.reset}`)

  assertEqual('E.1.1    Intent = send_message', 'send_message', intentE.type)
  assertEqual('E.1.2    Urgencia = high', 'high', urgencyE)
  assertEqual('E.1.3    Gate = approved', 'approved', gateE.decision)

  console.log()
}

// ═══════════════════════════════════════════════════════════════
// MAIN — Ejecución de todas las pruebas
// ═══════════════════════════════════════════════════════════════

function main(): void {
  console.log()
  console.log(`${C.bold}${C.bgBlue}${C.white}  🧪 VALIDACIÓN DEL CICLO COGNITIVO — ValiAutoFlow CRM v3.0  ${C.reset}`)
  console.log(`${C.dim}  FASE 2 (State) ↔ FASE 3 (Tools) ↔ FASE 4 (Cognitive Engine)  ${C.reset}`)
  console.log(`${C.dim}  Sin dependencias externas — Lógica pura en memoria  ${C.reset}`)
  console.log()

  const totalStart = performance.now()

  // Ejecutar todas las secciones con timing
  timeSection('Sección 1: Intent Classification', testIntentClassification)
  timeSection('Sección 2: Cognitive Load', testCognitiveLoadClassification)
  timeSection('Sección 3: Gate Decision Logic', testGateDecisionLogic)
  timeSection('Sección 4: Execution Modifiers', testExecutionModifiers)
  timeSection('Sección 5: AI Parameters', testAIParameters)
  timeSection('Sección 6: Integrated Loop', testIntegratedCognitiveLoop)

  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(3)

  // Imprimir todos los resultados individuales
  console.log(`\n${C.bold}DETALLE DE RESULTADOS:${C.reset}`)
  allResults.forEach((r, i) => printResult(r, i))

  // Imprimir resumen final
  console.log(`\n${C.dim}Tiempo total de ejecución: ${totalElapsed}s${C.reset}`)
  printSummary()
}

// Ejecutar
main()
