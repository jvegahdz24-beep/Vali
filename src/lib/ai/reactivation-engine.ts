// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Reactivation Engine (DIB Layer)
// 6 psychological angles + 4 automatic cycles for cold leads
// ═══════════════════════════════════════════════════════════════

import { debug } from '@/lib/logger'
import { db } from '@/lib/db'
import { leadProfiler, type LeadProfileData } from './lead-profiler'

// ─── Types ──────────────────────────────────────────────────

export interface ReactivationAngle {
  id: string
  name: string
  description: string
  template: string
  condition: (profile: LeadProfileData) => boolean
  priority: number // 1 = highest
}

export interface ReactivationResult {
  contactId: string
  contactName: string
  phone: string | null
  angleUsed: string
  message: string
  cycle: number
  workspaceId: string
}

// ─── Reactivation Cycles ───────────────────────────────────

// Cycle 1 (24-48h): Soft touch — curiosity
// Cycle 2 (72-96h): Value delivery — social proof
// Cycle 3 (7-10 days): New information — product update
// Cycle 4 (14+ days): Last attempt — urgency + FOMO

const CYCLE_CONFIG = [
  { cycle: 1, minHoursSinceActive: 24, maxHoursSinceActive: 48, label: 'Curiosidad' },
  { cycle: 2, minHoursSinceActive: 72, maxHoursSinceActive: 96, label: 'Prueba Social' },
  { cycle: 3, minHoursSinceActive: 168, maxHoursSinceActive: 240, label: 'Nueva Info' },
  { cycle: 4, minHoursSinceActive: 336, maxHoursSinceActive: 99999, label: 'Ultimo Intento' },
]

// ─── 6 Psychological Angles ────────────────────────────────

const REACTIVATION_ANGLES: ReactivationAngle[] = [
  // Angle 1: The "Did You Know?" — curiosity trigger
  {
    id: 'curiosity_trigger',
    name: 'Gatillo de Curiosidad',
    description: 'Presenta un dato nuevo que el lead no conoce para despertar interés.',
    template: 'Hola {{name}}, algo curioso que no te conté antes: {{curiosity_fact}}. ¿Te gustaría saber más?',
    condition: (profile) => profile.communicationStyle === 'analytical' || profile.archetype === 'estrategico',
    priority: 1,
  },

  // Angle 2: Social Proof — "People Like You"
  {
    id: 'social_proof',
    name: 'Prueba Social',
    description: 'Usa testimonios o datos de otros clientes similares para generar confianza.',
    template: 'Hola {{name}}, te cuento: alguien con necesidades similares a las tuyas {{social_proof_action}}. Si te interesa, te cuento los detalles.',
    condition: (profile) => profile.archetype === 'familiar' || profile.archetype === 'consciente' || profile.communicationStyle === 'cautious',
    priority: 2,
  },

  // Angle 3: Exclusivity — Scarcity
  {
    id: 'exclusivity',
    name: 'Exclusividad / Escasez',
    description: 'Crea sensación de urgencia con disponibilidad limitada o acceso exclusivo.',
    template: '{{name}}, tengo algo que no estaba disponible la última vez que hablamos: {{exclusive_offer}}. Es limitado, así que si te interesa avísame.',
    condition: (profile) => profile.archetype === 'aspiracional' || profile.priceSensitivity === 'low',
    priority: 3,
  },

  // Angle 4: Value Add — Help without selling
  {
    id: 'value_add',
    name: 'Valor Agregado',
    description: 'Ofrece información útil sin presión de venta (guide, tip, resource).',
    template: 'Hola {{name}}, se me ocurrió algo que podría serte útil: {{value_proposition}}. Si tienes alguna duda, aquí estoy.',
    condition: (profile) => profile.archetype === 'practico' || profile.archetype === 'familiar' || profile.buyingMotivation === 'savings',
    priority: 1,
  },

  // Angle 5: Loss Aversion — "You might miss out"
  {
    id: 'loss_aversion',
    name: 'Aversión a la Pérdida',
    description: 'Apela al miedo a perder una oportunidad o beneficio.',
    template: '{{name}}, solo para avisarte: {{loss_trigger}}. No quería que te quedaras sin saber.',
    condition: (profile) => profile.temperature === 'warm' || profile.urgencyLevel === 'medium' || profile.urgencyLevel === 'high',
    priority: 2,
  },

  // Angle 6: The Reconnect — "Checking in"
  {
    id: 'reconnect',
    name: 'Reconexión Simple',
    description: 'Mensaje casual de seguimiento sin presión. El más suave de todos.',
    template: 'Hola {{name}}, ¿cómo estás? Te escribo rápido para saber si {{reconnect_question}}. Nada de presión, solo curiosidad.',
    condition: () => true, // Universal fallback
    priority: 4,
  },
]

// ─── Dynamic Content Generators ────────────────────────────

function generateCuriosityFact(profile: LeadProfileData): string {
  const facts: Record<string, string[]> = {
    practico: [
      'hemos encontrado una forma de reducir costos en un 30% para clientes como tú',
      'recientemente cambió algo importante en las opciones disponibles que podría beneficiarte',
    ],
    familiar: [
      'tenemos una opción nueva que varios padres de familia están eligiendo por su seguridad',
      'agregamos características que las familias están pidiendo mucho últimamente',
    ],
    aspiracional: [
      'llegó algo exclusivo que no se había visto antes — solo una unidad disponible',
      'acabamos de recibir opciones en un nivel que normalmente no tenemos',
    ],
    estrategico: [
      'los números de este trimestre muestran un cambio que podría afectar tu decisión',
      'calculamos que hay una ventana de oportunidad que cierra esta semana',
    ],
    consciente: [
      'hay una nueva alternativa sustentable que redujo costos operativos un 25%',
      'llegó una opción que cumple con los estándares más altos del mercado',
    ],
    desconocido: [
      'algo cambió recientemente que podría interesarte',
      'hay una novedad que pensé te gustaría saber',
    ],
  }
  const archFacts = facts[profile.archetype] || facts.desconocido
  return archFacts[Math.floor(Math.random() * archFacts.length)]
}

function generateSocialProofAction(profile: LeadProfileData): string {
  const actions = [
    'tomó la decisión de avanzar y está muy contento',
    'preguntó por algo similar y al final encontró la opción perfecta',
    'empezó con las mismas dudas que tú y hoy ya disfruta los beneficios',
    'nos comentó que al principio dudaba, pero ahora está convencido',
  ]
  return actions[Math.floor(Math.random() * actions.length)]
}

function generateExclusiveOffer(profile: LeadProfileData): string {
  if (profile.priceSensitivity === 'high') {
    return 'una opción con promoción especial que no estaba disponible antes'
  }
  if (profile.archetype === 'aspiracional') {
    return 'una opción premium que apenas llegó y tiene alta demanda'
  }
  return 'una opción nueva con condiciones especiales para clientes que ya habíamos platicado'
}

function generateValueProposition(profile: LeadProfileData): string {
  const props: Record<string, string[]> = {
    practico: ['una guía rápida de comparación que te puede ahorrar tiempo y dinero', 'unos tips que te ayudan a tomar la mejor decisión'],
    familiar: ['unos datos de seguridad que a las familias les sirven mucho', 'una guía que muchas familias están usando para decidir'],
    estrategico: ['una comparativa de costos que te puede dar claridad', 'un análisis que muestra el ROI real de cada opción'],
  }
  const archProps = props[profile.archetype] || props.practico
  return archProps[Math.floor(Math.random() * archProps.length)]
}

function generateLossTrigger(profile: LeadProfileData): string {
  const triggers = [
    'la opción que te interesaba tiene mucha demanda y está bajando disponibilidad',
    'una promoción que aplica justo a lo que buscas termina pronto',
    'los precios se ajustan este mes y la ventana actual se cierra en pocos días',
  ]
  return triggers[Math.floor(Math.random() * triggers.length)]
}

function generateReconnectQuestion(profile: LeadProfileData): string {
  if (profile.timeline === 'later' || profile.timeline === 'none') {
    return 'ya tuviste oportunidad de pensarlo o sigues en la misma etapa'
  }
  if (profile.mainObjection === 'tiempo') {
    return 'ya pasaron unos días y quería saber si el momento es mejor ahora'
  }
  if (profile.mainObjection === 'precio') {
    return 'encontramos algunas opciones que podrían ajustarse mejor a lo que buscabas'
  }
  return 'sigues buscando opciones o ya te decidiste por algo'
}

// ─── Reactivation Engine Class ─────────────────────────────

export class ReactivationEngine {
  /**
   * Find and reactivate cold leads for a workspace.
   * Returns a list of messages ready to send.
   */
  async findAndReactivate(workspaceId: string): Promise<ReactivationResult[]> {
    const results: ReactivationResult[] = []

    try {
      // Get all reactivable leads
      const profiles = await leadProfiler.getReactivableLeads(workspaceId)
      if (profiles.length === 0) {
        debug('[ReactivationEngine] No reactivable leads found')
        return []
      }

      debug(`[ReactivationEngine] Found ${profiles.length} reactivable leads`)

      const now = new Date()

      for (const profile of profiles) {
        try {
          // Check if enough time has passed since last activity
          if (!profile.lastActiveAt) continue

          const hoursSinceActive = (now.getTime() - new Date(profile.lastActiveAt).getTime()) / (1000 * 60 * 60)

          // Don't reactivate if last reactivation was < 24h ago
          if (profile.lastReactivateAt) {
            const hoursSinceReactivation = (now.getTime() - new Date(profile.lastReactivateAt).getTime()) / (1000 * 60 * 60)
            if (hoursSinceReactivation < 24) {
              debug(`[ReactivationEngine] Skipping ${profile.contactId}: reactivated ${hoursSinceReactivation.toFixed(0)}h ago (< 24h)`)
              continue
            }
          }

          // Determine which cycle this lead is in
          const cycleConfig = CYCLE_CONFIG.find(
            (c) => hoursSinceActive >= c.minHoursSinceActive && hoursSinceActive < c.maxHoursSinceActive
          ) || CYCLE_CONFIG[CYCLE_CONFIG.length - 1]

          // After cycle 4, mark as non-reactivable (max 4 cycles)
          if (profile.reactivationCycle >= 4) {
            debug(`[ReactivationEngine] Skipping ${profile.contactId}: max cycles reached (4)`)
            await db.leadProfile.update({
              where: { contactId: profile.contactId },
              data: { isReactivable: false },
            })
            continue
          }

          // Select the best angle for this profile
          const angle = this.selectAngle(profile, cycleConfig.cycle)
          if (!angle) continue

          // Get contact info for personalization
          const contact = await db.contact.findUnique({
            where: { id: profile.contactId },
            select: { firstName: true, lastName: true, phone: true },
          })
          if (!contact) continue

          // Generate the personalized message
          const message = this.generateMessage(angle, profile, contact.firstName)

          // Create follow-up task in DB
          const conversation = await db.conversation.findFirst({
            where: { contactId: profile.contactId, workspaceId, status: 'active' },
            orderBy: { lastMessageAt: 'desc' },
          })

          if (conversation) {
            await db.followUpTask.create({
              data: {
                workspaceId,
                ruleId: 'dib-reactivation',
                contactId: profile.contactId,
                conversationId: conversation.id,
                status: 'pending',
                scheduledAt: new Date(), // Send immediately
              },
            })
          }

          results.push({
            contactId: profile.contactId,
            contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(),
            phone: contact.phone,
            angleUsed: angle.id,
            message,
            cycle: cycleConfig.cycle,
            workspaceId,
          })

          debug(`[ReactivationEngine] Reactivation prepared: ${contact.firstName} | angle: ${angle.name} | cycle: ${cycleConfig.cycle}`)
        } catch (err) {
          console.error(`[ReactivationEngine] Error processing profile ${profile.contactId}:`, err)
        }
      }

      debug(`[ReactivationEngine] Prepared ${results.length} reactivation messages`)
      return results

    } catch (error) {
      console.error('[ReactivationEngine] Error in findAndReactivate:', error)
      return []
    }
  }

  /**
   * Select the best reactivation angle based on profile and cycle.
   */
  private selectAngle(profile: LeadProfileData, cycle: number): ReactivationAngle | null {
    // Filter applicable angles
    const applicable = REACTIVATION_ANGLES.filter((a) => a.condition(profile))
    if (applicable.length === 0) return null

    // Cycle-based angle selection
    switch (cycle) {
      case 1: // Soft touch — prefer curiosity and value add
        return applicable.find((a) => a.id === 'value_add') ||
          applicable.find((a) => a.id === 'curiosity_trigger') ||
          applicable[0]

      case 2: // Social proof
        return applicable.find((a) => a.id === 'social_proof') ||
          applicable.find((a) => a.id === 'reconnect') ||
          applicable[0]

      case 3: // New info — exclusivity or curiosity
        return applicable.find((a) => a.id === 'exclusivity') ||
          applicable.find((a) => a.id === 'curiosity_trigger') ||
          applicable[0]

      case 4: // Last attempt — loss aversion
        return applicable.find((a) => a.id === 'loss_aversion') ||
          applicable.find((a) => a.id === 'exclusivity') ||
          applicable[0]

      default:
        return applicable.sort((a, b) => a.priority - b.priority)[0]
    }
  }

  /**
   * Generate a personalized reactivation message.
   */
  private generateMessage(angle: ReactivationAngle, profile: LeadProfileData, name: string): string {
    let message = angle.template.replace(/\{\{name\}\}/g, name)

    // Replace angle-specific placeholders
    switch (angle.id) {
      case 'curiosity_trigger':
        message = message.replace('{{curiosity_fact}}', generateCuriosityFact(profile))
        break
      case 'social_proof':
        message = message.replace('{{social_proof_action}}', generateSocialProofAction(profile))
        break
      case 'exclusivity':
        message = message.replace('{{exclusive_offer}}', generateExclusiveOffer(profile))
        break
      case 'value_add':
        message = message.replace('{{value_proposition}}', generateValueProposition(profile))
        break
      case 'loss_aversion':
        message = message.replace('{{loss_trigger}}', generateLossTrigger(profile))
        break
      case 'reconnect':
        message = message.replace('{{reconnect_question}}', generateReconnectQuestion(profile))
        break
    }

    return message
  }

  /**
   * Get stats about reactivation performance.
   */
  async getReactivationStats(workspaceId: string): Promise<{
    totalProfiles: number
    reactivableNow: number
    reactivatedThisWeek: number
    totalReactivations: number
    byCycle: Record<number, number>
  }> {
    const [totalProfiles, reactivableNow, stats] = await Promise.all([
      db.leadProfile.count({ where: { workspaceId } }),
      db.leadProfile.count({ where: { workspaceId, isReactivable: true } }),
      db.leadProfile.aggregate({
        where: { workspaceId },
        _sum: { reactivateCount: true },
      }),
    ])

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const reactivatedThisWeek = await db.leadProfile.count({
      where: {
        workspaceId,
        lastReactivateAt: { gte: weekAgo },
      },
    })

    const byCycle: Record<number, number> = {}
    for (let c = 1; c <= 4; c++) {
      byCycle[c] = await db.leadProfile.count({
        where: { workspaceId, reactivationCycle: c },
      })
    }

    return {
      totalProfiles,
      reactivableNow,
      reactivatedThisWeek,
      totalReactivations: stats._sum.reactivateCount || 0,
      byCycle,
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const reactivationEngine = new ReactivationEngine()
