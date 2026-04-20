// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Lead Profiler (DIB Layer)
// Silent profiling: runs on every message, builds rich contact profile
// No LLM calls — 100% keyword + heuristic based for speed
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { detectArchetype, type Archetype, type ArchetypeDetection } from './archetype-detector'

// ─── Types ──────────────────────────────────────────────────

export interface LeadProfileData {
  id: string
  contactId: string
  workspaceId: string
  archetype: string
  archetypeConfidence: number
  temperature: 'cold' | 'warm' | 'hot'
  score: number
  totalMessages: number
  avgResponseTimeMs: number
  lastActiveAt: Date | null
  firstSeenAt: Date
  reactivateCount: number
  lastReactivateAt: Date | null
  lastAngleUsed: string | null
  reactivationCycle: number
  isReactivable: boolean
  budget: string | null
  preferredProduct: string | null
  mainObjection: string | null
  decisionMaker: string | null
  timeline: string | null
  communicationStyle: string
  painPoints: string[]
  interests: string[]
  buyingMotivation: string | null
  priceSensitivity: string
  urgencyLevel: string
}

// ─── Spanish NFD Normalization ─────────────────────────────

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// ─── Budget Detection ──────────────────────────────────────

const BUDGET_PATTERNS: { patterns: string[]; range: string }[] = [
  { patterns: ['5000', 'cinco mil', '5 mil', 'barat', 'económico', 'economico', 'menos de 10000', 'mas barato', 'precios bajos', 'menos de 10 mil'], range: 'bajo' },
  { patterns: ['10000', 'diez mil', '10 mil', '15000', 'quince mil', 'medio', 'normal', 'precios accesibles', 'menos de 20000'], range: 'medio' },
  { patterns: ['20000', 'veinte mil', '20 mil', '30000', 'treinta mil', '30 mil', '50000', 'cincuenta mil', 'premio', 'alto', 'mas de 20000'], range: 'alto' },
]

function detectBudget(text: string): string | null {
  const normalized = normalize(text)
  for (const bp of BUDGET_PATTERNS) {
    for (const pattern of bp.patterns) {
      if (normalized.includes(normalize(pattern))) {
        return bp.range
      }
    }
  }
  return null
}

// ─── Objection Detection ───────────────────────────────────

const OBJECTION_PATTERNS: { keywords: string[]; objection: string }[] = [
  { keywords: ['caro', 'carisimo', 'no tengo dinero', 'no me alcanza', 'presupuesto', 'costoso', 'muy caro', 'no puedo pagar', 'fuera de presupuesto', 'es mucho dinero', 'no me sale'], objection: 'precio' },
  { keywords: ['pensar', 'despues', 'mas tarde', 'no es buen momento', 'no ahora', 'mas adelante', 'cuando tenga tiempo', 'ya vere', 'no tengo prisa', 'esperar', 'luego'], objection: 'tiempo' },
  { keywords: ['esposa', 'esposo', 'pareja', 'familia', 'preguntar', 'consultar', 'hablar con', 'deciden juntos', 'dueño', 'dueña', 'no decido yo', 'mi jefe'], objection: 'autoridad' },
  { keywords: ['no confio', 'dudo', 'estafa', 'mentira', 'engaño', 'no creo', 'desconfio', 'no me convence', 'falso'], objection: 'confianza' },
  { keywords: ['no necesito', 'no me interesa', 'ya tengo', 'no busco', 'estoy bien', 'no quiero'], objection: 'necesidad' },
]

function detectObjection(text: string): string | null {
  const normalized = normalize(text)
  let bestMatch = ''
  let bestScore = 0
  for (const op of OBJECTION_PATTERNS) {
    let score = 0
    for (const kw of op.keywords) {
      if (normalized.includes(normalize(kw))) {
        score++
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = op.objection
    }
  }
  return bestScore > 0 ? bestMatch : null
}

// ─── Decision Maker Detection ──────────────────────────────

const DECISION_MAKER_PATTERNS = [
  { keywords: ['yo solo', 'yo decido', 'mi decision', 'depende de mi', 'solo yo'], maker: 'self' },
  { keywords: ['mi esposa', 'mi esposo', 'mi pareja', 'mi novia', 'mi novio', 'mi compañera', 'mi compañero'], maker: 'partner' },
  { keywords: ['mi jefe', 'mi gerente', 'la empresa', 'mi director', 'recursos humanos', 'comité', 'junta'], maker: 'boss' },
  { keywords: ['mi familia', 'mis hijos', 'mis papás', 'mis papas', 'mi mamá', 'mi papa', 'mis padres'], maker: 'family' },
]

function detectDecisionMaker(text: string): string | null {
  const normalized = normalize(text)
  for (const dp of DECISION_MAKER_PATTERNS) {
    for (const kw of dp.keywords) {
      if (normalized.includes(normalize(kw))) {
        return dp.maker
      }
    }
  }
  return null
}

// ─── Timeline Detection ────────────────────────────────────

const TIMELINE_PATTERNS = [
  { keywords: ['ya', 'ahora', 'hoy', 'inmediato', 'urgente', 'necesito', 'lo antes posible', 'cuanto antes', 'esta semana'], timeline: 'now' },
  { keywords: ['próximo', 'proximo', 'semana que entra', 'quincena', 'este mes', 'en un par de semanas', 'dentro de poco'], timeline: 'soon' },
  { keywords: ['mas tarde', 'mas adelante', 'futuro', 'cuando pueda', 'en unos meses', 'después', 'despues'], timeline: 'later' },
  { keywords: ['no se', 'no lo sé', 'no lo se', 'ni idea', 'no tengo prisa', 'sin prisa', 'cuando sea'], timeline: 'none' },
]

function detectTimeline(text: string): string | null {
  const normalized = normalize(text)
  for (const tp of TIMELINE_PATTERNS) {
    for (const kw of tp.keywords) {
      if (normalized.includes(normalize(kw))) {
        return tp.timeline
      }
    }
  }
  return null
}

// ─── Communication Style Detection ─────────────────────────

function detectCommunicationStyle(text: string): string {
  const normalized = normalize(text)
  let style = 'neutral'

  // Direct: short messages, imperative
  if (/\b(cuanto|quiero|dame|pasa|ya|vamos|ok|si|no|claro)\b/.test(normalized) && text.split(/\s+/).length < 10) {
    style = 'direct'
  }
  // Cautious: questions, doubts, hedging
  if (/\b(cuál|cual|podría|podria|quizá|quizas|tal vez|creo|no sé|no se|me da igual|no estoy seguro|estoy dudando)\b/.test(normalized)) {
    style = 'cautious'
  }
  // Emotional: exclamation marks, emojis, expressive words
  if (/[!]{2,}|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(text) || /\b(genial|excelente|increíble|increible|perfecto|amo|me encanta|me fascina|wow|no mames|órale|orale)\b/.test(normalized)) {
    style = 'emotional'
  }
  // Analytical: data-driven words
  if (/\b(precio|costo|tasa|porcentaje|métrica|metrica|comparar|análisis|analisis|dato|estadística|estadistica|roi|retorno|inversión|inversion)\b/.test(normalized)) {
    style = 'analytical'
  }

  return style
}

// ─── Pain Points Detection ─────────────────────────────────

const PAIN_POINT_PATTERNS: { keywords: string[]; pain: string }[] = [
  { keywords: ['pierdo tiempo', 'mucho tiempo', 'lento', 'tarda', 'desperdicio', 'ineficiente'], pain: 'perdida_de_tiempo' },
  { keywords: ['dinero', 'caro', 'no puedo pagar', 'presupuesto ajustado', 'no me alcanza', 'cuesta mucho'], pain: 'limitacion_financiera' },
  { keywords: ['estres', 'dolor de cabeza', 'complicado', 'difícil', 'dificil', 'frustración', 'frustracion', 'problem'], pain: 'estres_complicacion' },
  { keywords: ['mala atención', 'no responden', 'lento el servicio', 'mal servicio', 'no me ayudan', 'ignoran'], pain: 'mal_servicio' },
  { keywords: ['no sé', 'no se', 'confundido', 'no entiendo', 'complicado', 'muchas opciones', 'no entiendo nada'], pain: 'confusion_informacion' },
]

function detectPainPoints(text: string): string[] {
  const normalized = normalize(text)
  const points: string[] = []
  for (const pp of PAIN_POINT_PATTERNS) {
    for (const kw of pp.keywords) {
      if (normalized.includes(normalize(kw))) {
        if (!points.includes(pp.pain)) points.push(pp.pain)
        break
      }
    }
  }
  return points
}

// ─── Buying Motivation Detection ───────────────────────────

const MOTIVATION_PATTERNS: { keywords: string[]; motivation: string }[] = [
  { keywords: ['estatus', 'imagen', 'luj', 'premium', 'mejor', 'éxito', 'exito', 'imprimir', 'demostrar', 'vecinos'], motivation: 'status' },
  { keywords: ['cómodo', 'comodo', 'comodidad', 'familia', 'hijos', 'seguridad', 'tranquilidad', 'paz', 'descanso'], motivation: 'comfort' },
  { keywords: ['seguro', 'garantía', 'garantia', 'protección', 'proteccion', 'confiable', 'duradero', 'confianza', 'resistente'], motivation: 'security' },
  { keywords: ['ahorro', 'barato', 'económico', 'economico', 'oferta', 'descuento', 'promoción', 'promocion', 'invertir', 'rentable'], motivation: 'savings' },
  { keywords: ['rápido', 'rapido', 'potente', 'emoción', 'emocion', 'deporte', 'deportivo', 'diversión', 'diversion', 'experiencia', 'nuevo'], motivation: 'excitement' },
]

function detectBuyingMotivation(text: string): string | null {
  const normalized = normalize(text)
  let bestMatch: string | null = null
  let bestScore = 0
  for (const mp of MOTIVATION_PATTERNS) {
    let score = 0
    for (const kw of mp.keywords) {
      if (normalized.includes(normalize(kw))) {
        score++
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = mp.motivation
    }
  }
  return bestScore >= 1 ? bestMatch : null
}

// ─── Price Sensitivity Detection ───────────────────────────

function detectPriceSensitivity(text: string): string {
  const normalized = normalize(text)
  let score = 0

  // High sensitivity indicators
  const highKeywords = ['caro', 'barato', 'precio', 'cuanto cuesta', 'presupuesto', 'no me alcanza', 'mas economico', 'descuento', 'oferta', 'promocion', 'msi', 'meses sin intereses', 'enganche']
  for (const kw of highKeywords) {
    if (normalized.includes(normalize(kw))) score++
  }

  // Low sensitivity indicators
  const lowKeywords = ['no importa el precio', 'lo que sea', 'quality', 'calidad', 'mejor', 'premium', 'lo mejor']
  for (const kw of lowKeywords) {
    if (normalized.includes(normalize(kw))) score -= 2
  }

  if (score >= 3) return 'high'
  if (score >= 1) return 'medium'
  return 'low'
}

// ─── Urgency Level Detection ───────────────────────────────

function detectUrgencyLevel(text: string): string {
  const normalized = normalize(text)
  let score = 0

  const highKeywords = ['ya', 'ahora', 'hoy', 'urgente', 'inmediato', 'necesito', 'lo antes posible', 'semana que entra', 'mañana']
  for (const kw of highKeywords) {
    if (normalized.includes(normalize(kw))) score++
  }

  const lowKeywords = ['despues', 'mas tarde', 'no tengo prisa', 'cuando pueda', 'sin prisa', 'luego', 'no es urgente']
  for (const kw of lowKeywords) {
    if (normalized.includes(normalize(kw))) score--
  }

  if (score >= 3) return 'high'
  if (score >= 1) return 'medium'
  return 'low'
}

// ─── Lead Profiler Class ───────────────────────────────────

export class LeadProfiler {
  /**
   * Profile a contact silently. Called from message-processor on every message.
   * Uses upsert: creates profile if missing, updates if exists.
   * Returns the full profile data for use by Revenue Engine and Closing Engine.
   */
  async profileContact(params: {
    contactId: string
    workspaceId: string
    messageText: string
    allMessages: { role: string; content: string; createdAt?: Date }[]
    currentScore: number
  }): Promise<LeadProfileData | null> {
    const { contactId, workspaceId, messageText, allMessages, currentScore } = params

    try {
      // ── Run all detectors ──
      const userMessages = allMessages.filter((m) => m.role === 'user' || m.role === 'contact')
      const userTexts = userMessages.map((m) => m.content)
      const allText = userTexts.join(' ')

      // Archetype detection
      const archResult = detectArchetype(userTexts)

      // Temperature from score
      const temperature = this.mapScoreToTemperature(currentScore)

      // All behavioral detections
      const budget = detectBudget(messageText)
      const mainObjection = detectObjection(messageText)
      const decisionMaker = detectDecisionMaker(messageText)
      const timeline = detectTimeline(messageText)
      const communicationStyle = detectCommunicationStyle(messageText)
      const buyingMotivation = detectBuyingMotivation(messageText)
      const priceSensitivity = detectPriceSensitivity(messageText)
      const urgencyLevel = detectUrgencyLevel(messageText)

      // Aggregate pain points and interests from all messages
      const allPainPoints = new Set<string>()
      const allInterests = new Set<string>()
      for (const t of userTexts) {
        for (const pp of detectPainPoints(t)) allPainPoints.add(pp)
      }

      // Calculate avg response time
      const avgResponseTimeMs = this.calculateAvgResponseTime(allMessages)

      // Determine if reactivable
      const now = new Date()
      const lastActive = userMessages.length > 0 ? userMessages[userMessages.length - 1].createdAt : null
      const hoursSinceActive = lastActive ? (now.getTime() - new Date(lastActive).getTime()) / (1000 * 60 * 60) : 999

      // ── Upsert profile ──
      const profile = await db.leadProfile.upsert({
        where: { contactId },
        create: {
          contactId,
          workspaceId,
          archetype: archResult.archetype,
          archetypeConfidence: archResult.confidence,
          temperature,
          score: currentScore,
          totalMessages: userMessages.length,
          avgResponseTimeMs,
          lastActiveAt: new Date(),
          firstSeenAt: new Date(),
          budget,
          preferredProduct: this.detectPreferredProduct(messageText),
          mainObjection,
          decisionMaker,
          timeline,
          communicationStyle,
          painPoints: JSON.stringify([...allPainPoints]),
          interests: JSON.stringify([...allInterests]),
          buyingMotivation,
          priceSensitivity,
          urgencyLevel,
          isReactivable: currentScore < 30 && hoursSinceActive > 24,
        },
        update: {
          archetype: archResult.archetype !== 'desconocido' ? archResult.archetype : undefined,
          archetypeConfidence: archResult.confidence,
          temperature,
          score: currentScore,
          totalMessages: userMessages.length,
          avgResponseTimeMs,
          lastActiveAt: new Date(),
          budget: budget || undefined,
          preferredProduct: this.detectPreferredProduct(messageText) || undefined,
          mainObjection: mainObjection || undefined,
          decisionMaker: decisionMaker || undefined,
          timeline: timeline || undefined,
          communicationStyle,
          painPoints: JSON.stringify([...allPainPoints]),
          buyingMotivation: buyingMotivation || undefined,
          priceSensitivity,
          urgencyLevel,
          isReactivable: currentScore < 30 && hoursSinceActive > 24,
        },
      })

      console.log(`[LeadProfiler] Profile updated: contact=${contactId} archetype=${archResult.archetype} temp=${temperature} score=${currentScore}`)

      return this.toProfileData(profile)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[LeadProfiler] Error profiling contact:', errMsg)
      return null
    }
  }

  /**
   * Get existing profile for a contact without updating.
   */
  async getProfile(contactId: string): Promise<LeadProfileData | null> {
    try {
      const profile = await db.leadProfile.findUnique({
        where: { contactId },
      })
      return profile ? this.toProfileData(profile) : null
    } catch (error) {
      console.error('[LeadProfiler] Error getting profile:', error)
      return null
    }
  }

  /**
   * Get all reactivable leads for a workspace.
   */
  async getReactivableLeads(workspaceId: string): Promise<LeadProfileData[]> {
    try {
      const profiles = await db.leadProfile.findMany({
        where: { workspaceId, isReactivable: true },
        orderBy: { lastActiveAt: 'asc' },
        take: 50,
      })
      return profiles.map((p) => this.toProfileData(p))
    } catch (error) {
      console.error('[LeadProfiler] Error getting reactivable leads:', error)
      return []
    }
  }

  /**
   * Mark a profile as reactivated (after DIB sends a reactivation message).
   */
  async markReactivated(contactId: string, angleUsed: string): Promise<void> {
    try {
      await db.leadProfile.update({
        where: { contactId },
        data: {
          isReactivable: false,
          reactivateCount: { increment: 1 },
          lastReactivateAt: new Date(),
          lastAngleUsed: angleUsed,
          reactivationCycle: { increment: 1 },
        },
      })
    } catch (error) {
      console.error('[LeadProfiler] Error marking reactivated:', error)
    }
  }

  /**
   * Build a context string for injection into system prompts.
   * This is what the Revenue Engine uses to personalize responses.
   */
  buildProfileContext(profile: LeadProfileData): string {
    if (!profile) return ''

    const parts: string[] = []

    parts.push(`PERFIL DEL LEAD (DIB Intelligence):`)

    if (profile.archetype !== 'desconocido') {
      parts.push(`- Arquetipo: ${profile.archetype} (confianza: ${(profile.archetypeConfidence * 100).toFixed(0)}%)`)
    }

    parts.push(`- Temperatura: ${profile.temperature} (score: ${profile.score}/100)`)
    parts.push(`- Estilo de comunicación: ${profile.communicationStyle}`)
    parts.push(`- Sensibilidad al precio: ${profile.priceSensitivity}`)
    parts.push(`- Nivel de urgencia: ${profile.urgencyLevel}`)

    if (profile.budget) parts.push(`- Presupuesto detectado: ${profile.budget}`)
    if (profile.preferredProduct) parts.push(`- Producto de interés: ${profile.preferredProduct}`)
    if (profile.mainObjection) parts.push(`- Objección principal: ${profile.mainObjection}`)
    if (profile.decisionMaker) parts.push(`- Decisor: ${profile.decisionMaker}`)
    if (profile.timeline) parts.push(`- Timeline: ${profile.timeline}`)
    if (profile.buyingMotivation) parts.push(`- Motivación de compra: ${profile.buyingMotivation}`)

    const painPoints: string[] = typeof profile.painPoints === 'string' ? JSON.parse(profile.painPoints) : profile.painPoints
    if (painPoints.length > 0) {
      parts.push(`- Puntos de dolor: ${painPoints.join(', ')}`)
    }

    // Behavioral signals
    if (profile.totalMessages > 0) {
      parts.push(`- Mensajes totales: ${profile.totalMessages}`)
    }
    if (profile.avgResponseTimeMs > 0) {
      const minutes = Math.round(profile.avgResponseTimeMs / 60000)
      parts.push(`- Tiempo promedio de respuesta: ${minutes} min`)
    }
    if (profile.reactivateCount > 0) {
      parts.push(`- Reactivaciones previas: ${profile.reactivateCount}`)
    }

    // Archetype-specific tone advice
    const toneAdvice = this.getArchetypeToneAdvice(profile.archetype)
    if (toneAdvice) {
      parts.push(`\nTONO RECOMENDADO para ${profile.archetype}: ${toneAdvice}`)
    }

    return parts.join('\n')
  }

  // ─── Private helpers ─────────────────────────────────────

  private mapScoreToTemperature(score: number): 'cold' | 'warm' | 'hot' {
    if (score >= 70) return 'hot'
    if (score >= 35) return 'warm'
    return 'cold'
  }

  private calculateAvgResponseTime(messages: { role: string; content: string; createdAt?: Date }[]): number {
    if (!messages || messages.length < 2) return 0
    const withDates = messages.filter((m) => m.createdAt)
    if (withDates.length < 2) return 0

    let totalDiff = 0
    let count = 0

    for (let i = 1; i < withDates.length; i++) {
      if (withDates[i].role === 'user' && withDates[i - 1].role === 'assistant') {
        const diff = new Date(withDates[i].createdAt!).getTime() - new Date(withDates[i - 1].createdAt!).getTime()
        if (diff > 0 && diff < 24 * 60 * 60 * 1000) { // Ignore gaps > 24h
          totalDiff += diff
          count++
        }
      }
    }

    return count > 0 ? Math.round(totalDiff / count) : 0
  }

  private detectPreferredProduct(text: string): string | null {
    const normalized = normalize(text)
    const productKeywords = [
      'servicio', 'paquete', 'plan', 'consultoria', 'asesoria', 'capacitacion',
      'automatizacion', 'software', 'sistema', 'plataforma', 'app', 'pagina', 'tienda',
      'auto', 'carro', 'vehiculo', 'suv', 'sedan', 'camioneta', 'pickup',
      'casa', 'departamento', 'terreno', 'local', 'oficina',
      'seguro', 'poliza', 'inversion', 'credito',
    ]
    for (const kw of productKeywords) {
      if (normalized.includes(normalize(kw))) return kw
    }
    return null
  }

  private getArchetypeToneAdvice(archetype: string): string {
    const advice: Record<string, string> = {
      practico: 'Enfócate en datos concretos, números, comparativas de costo-beneficio. Evita lenguaje emocional.',
      familiar: 'Menciona beneficios para la familia, seguridad, tranquilidad. Usa un tono cálido.',
      aspiracional: 'Habla de exclusividad, diseño, experiencia, estatus. Usa lenguaje aspiracional.',
      estrategico: 'Preséntale ROI, retorno de inversión, ventajas fiscales. Datos y análisis.',
      consciente: 'Menciona sostenibilidad, eficiencia, tecnología limpia. Tono informado.',
    }
    return advice[archetype] || ''
  }

  private toProfileData(profile: {
    id: string; contactId: string; workspaceId: string
    archetype: string; archetypeConfidence: number
    temperature: string; score: number
    totalMessages: number; avgResponseTimeMs: number
    lastActiveAt: Date | null; firstSeenAt: Date
    reactivateCount: number; lastReactivateAt: Date | null
    lastAngleUsed: string | null; reactivationCycle: number; isReactivable: boolean
    budget: string | null; preferredProduct: string | null; mainObjection: string | null
    decisionMaker: string | null; timeline: string | null; communicationStyle: string
    painPoints: string; interests: string; buyingMotivation: string | null
    priceSensitivity: string; urgencyLevel: string
  }): LeadProfileData {
    return {
      ...profile,
      temperature: profile.temperature as 'cold' | 'warm' | 'hot',
      painPoints: JSON.parse(profile.painPoints || '[]'),
      interests: JSON.parse(profile.interests || '[]'),
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const leadProfiler = new LeadProfiler()
