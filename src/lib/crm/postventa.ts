// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Postventa Automatizado
// Post-sale sequence automation engine
// Creates FollowUpRule + FollowUpTask entries for timed outreach
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────

interface PostventaContact {
  id: string
  firstName: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  customFields: string
}

interface PostventaDeal {
  id: string
  workspaceId: string
  title: string
  value: number
  currency: string
  description?: string | null
  metadata?: string
}

interface SequenceStep {
  label: string
  delayMs: number
  template: (contact: PostventaContact, deal: PostventaDeal) => string
}

// ─── Cross-sell product map ──────────────────────────────────

const CROSS_SELL_MAP: Record<string, string[]> = {
  'seguro': ['Seguro de vida', 'Seguro contra todo riesgo', 'Asistencia vial premium'],
  'gps': ['GPS Premium con monitoreo en vivo', 'Rastreo satelital avanzado'],
  'auto': ['Seguro de auto', 'GPS para vehículos', 'Mantenimiento preventivo plan'],
  'crédito': ['Seguro de vida', 'Protección financiera', 'Asesoría fiscal'],
  'vehículo': ['Seguro de auto', 'GPS para vehículos', 'Accesorios premium'],
  'carro': ['Seguro de auto', 'GPS para vehículos', 'Accesorios premium'],
  'coche': ['Seguro de auto', 'GPS para vehículos', 'Accesorios premium'],
}

// ─── Sequence Steps ──────────────────────────────────────────

const POSTVENTA_SEQUENCE: SequenceStep[] = [
  {
    label: 'thank_you',
    delayMs: 0, // Immediately
    template: generateThankYouMessage,
  },
  {
    label: 'satisfaction_survey',
    delayMs: 24 * 60 * 60 * 1000, // 24 hours
    template: generateSurveyMessage,
  },
  {
    label: 'getting_started_tips',
    delayMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    template: generateTipsMessage,
  },
  {
    label: 'review_request',
    delayMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    template: generateReviewRequest,
  },
  {
    label: 'cross_sell',
    delayMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    template: generateCrossSellSuggestion,
  },
  {
    label: 're_engagement',
    delayMs: 60 * 24 * 60 * 60 * 1000, // 60 days
    template: generateReEngagementMessage,
  },
]

// ─── Message Generators ──────────────────────────────────────

function generateThankYouMessage(contact: PostventaContact, deal: PostventaDeal): string {
  const name = contact.firstName
  const dealTitle = deal.title
  return `🎉 ¡Gracias por tu compra, ${name}!

Estamos emocionados de que hayas elegido ${dealTitle}. Tu satisfacción es nuestra prioridad.

📋 Próximos pasos:
1. Recibirás un correo de confirmación
2. Tu producto/servicio estará listo pronto
3. Si tienes dudas, responde a este mensaje

¡Esperamos verte pronto! 🙌`
}

/**
 * Generate personalized satisfaction survey message.
 */
export function generateSurveyMessage(contact: PostventaContact, deal: PostventaDeal): string {
  const name = contact.firstName
  const dealTitle = deal.title
  return `Hola ${name} 👋

Ya pasaron 24 horas desde tu compra de "${dealTitle}" y queremos saber: ¿cómo fue tu experiencia?

Califica del 1 al 5:
⭐ Excelente
⭐⭐ Muy buena
⭐⭐⭐ Buena
⭐⭐⭐⭐ Regular
⭐⭐⭐⭐⭐ Necesita mejorar

Tu opinión nos ayuda a mejorar. ¡Gracias por tomarte el tiempo! 📊`
}

function generateTipsMessage(contact: PostventaContact, deal: PostventaDeal): string {
  const name = contact.firstName
  const dealTitle = deal.title
  return `💡 Tips para aprovechar al máximo "${dealTitle}"

Hola ${name}, aquí van algunos consejos:

1️⃣ Familiarízate con todas las funciones
2️⃣ Configura las preferencias según tus necesidades
3️⃣ Revisa la guía de inicio rápido que enviamos por email
4️⃣ No dudes en contactarnos si necesitas ayuda

¿Tienes alguna pregunta? Estamos para ayudarte 😊`
}

/**
 * Generate review/testimonial request message.
 */
export function generateReviewRequest(contact: PostventaContact): string {
  const name = contact.firstName
  return `🌟 ${name}, tu opinión importa mucho

Si estás disfrutando tu compra, ¿nos ayudarías dejando una reseña?

Solo toma 1 minuto y nos ayuda a llegar a más personas como tú.

✅ Google Reviews
✅ Facebook
✅ WhatsApp (¡comparte tu experiencia!)

Tu testimonio es la mejor publicidad. ¡Gracias de antemano! 🙏`
}

/**
 * Generate cross-sell / upsell suggestion based on deal products.
 */
export function generateCrossSellSuggestion(contact: PostventaContact, deal: PostventaDeal): string {
  const name = contact.firstName
  const dealText = `${deal.title} ${deal.description || ''} ${deal.metadata || ''}`.toLowerCase()

  // Find relevant cross-sell products
  let suggestions: string[] = []
  for (const [keyword, products] of Object.entries(CROSS_SELL_MAP)) {
    if (dealText.includes(keyword)) {
      suggestions.push(...products)
    }
  }

  // Default suggestions if no match
  if (suggestions.length === 0) {
    suggestions = [
      'Servicio de mantenimiento premium',
      'Extensión de garantía',
      'Paquete de soporte prioritario',
    ]
  }

  // Pick up to 2 suggestions
  const topSuggestions = suggestions.slice(0, 2)

  return `🎁 Exclusivo para clientes como tú, ${name}

Basado en tu compra reciente, tenemos recomendaciones especiales:

${topSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

¿Te interesa conocer más? Responde a este mensaje y te damos detalles.

🏆 Como cliente frecuente, obtén beneficios especiales en tu próxima compra.`
}

function generateReEngagementMessage(contact: PostventaContact, deal: PostventaDeal): string {
  const name = contact.firstName
  return `Hola ${name} 👋

Hace tiempo que no nos contactas y queríamos saber cómo estás con "${deal.title}".

¿Todo bien? Si necesitas:
🔧 Soporte técnico
📦 Renovación
🎁 Nuevas promociones exclusivas

No dudes en escribirnos. Te extrañamos! 😊`
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Trigger the full post-sale sequence for a contact/deal pair.
 * Creates a FollowUpRule for the sequence and FollowUpTasks for each step.
 */
export async function triggerPostSaleSequence(contactId: number, dealId: number): Promise<void> {
  try {
    // Fetch contact and deal
    const contact = await db.contact.findUnique({ where: { id: String(contactId) } }) as PostventaContact | null
    const deal = await db.deal.findUnique({ where: { id: String(dealId) } }) as PostventaDeal | null

    if (!contact) {
      console.warn(`[Postventa] Contact ${contactId} not found`)
      return
    }
    if (!deal) {
      console.warn(`[Postventa] Deal ${dealId} not found`)
      return
    }

    // FIX HIGH: Check for opt-out / marketing consent before sending postventa
    const contactFields = typeof contact.customFields === 'string'
      ? JSON.parse(contact.customFields || '{}') : (contact.customFields || {})
    if (contactFields.optedOut === true || contactFields.marketingConsent === false) {
      console.log(`[Postventa] Contact ${contactId} opted out — skipping postventa sequence`)
      return
    }

    // FIX MEDIUM: Deduplicate — check if postventa sequence already exists for this contact+deal
    // CORREGIDO: se elimina la segunda propiedad triggerConfig duplicada
    const existingRule = await db.followUpRule.findFirst({
      where: {
        workspaceId: deal.workspaceId,
        triggerConfig: { contains: `"dealId":"${deal.id}"` },
      },
    })
    if (existingRule) {
      console.log(`[Postventa] Sequence already exists for contact ${contactId}, deal ${dealId} — skipping`)
      return
    }

    // Find or create a conversation for the task references
    let conversation = await db.conversation.findFirst({
      where: { contactId: contact.id, workspaceId: deal.workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          workspaceId: deal.workspaceId,
          contactId: contact.id,
          channel: 'whatsapp',
          status: 'active',
        },
      })
    }

    // Create the parent FollowUpRule for this postventa sequence
    const rule = await db.followUpRule.create({
      data: {
        workspaceId: deal.workspaceId,
        name: `Postventa: ${contact.firstName} - ${deal.title}`,
        description: `Secuencia post-venta para ${contact.firstName} ${contact.lastName || ''}`.trim(),
        triggerType: 'scheduled',
        triggerConfig: JSON.stringify({
          type: 'postventa_sequence',
          contactId: contact.id,
          dealId: deal.id,
          dealTitle: deal.title,
        }),
        channel: 'whatsapp',
        messageTemplate: '',
        isActive: true,
        maxRetries: 3,
        cooldownHours: 24,
        priority: 10,
      },
    })

    // Create FollowUpTasks for each sequence step
    const now = new Date()

    for (const step of POSTVENTA_SEQUENCE) {
      const scheduledAt = new Date(now.getTime() + step.delayMs)
      const messageBody = step.template(contact, deal)

      await db.followUpTask.create({
        data: {
          workspaceId: deal.workspaceId,
          ruleId: rule.id,
          contactId: contact.id,
          conversationId: conversation.id,
          status: 'pending',
          scheduledAt,
        },
      })

      console.log(
        `[Postventa] Task "${step.label}" scheduled for ${scheduledAt.toISOString()} ` +
        `(contact: ${contact.id}, deal: ${deal.id})`
      )
    }

    console.log(`[Postventa] Sequence started: ${POSTVENTA_SEQUENCE.length} tasks for contact ${contact.id}`)
  } catch (err) {
    console.warn('[Postventa] triggerPostSaleSequence error (non-critical):', err instanceof Error ? err.message : err)
  }
}

/**
 * Get the sequence step messages (without creating tasks).
 * Useful for preview or manual review.
 */
export function getSequenceMessages(contact: PostventaContact, deal: PostventaDeal): {
  label: string
  delayLabel: string
  message: string
}[] {
  const delayLabels = [
    'Inmediato',
    '24 horas después',
    '3 días después',
    '7 días después',
    '30 días después',
    '60 días después',
  ]

  return POSTVENTA_SEQUENCE.map((step, i) => ({
    label: step.label,
    delayLabel: delayLabels[i] || `${step.delayMs / (24 * 60 * 60 * 1000)} días`,
    message: step.template(contact, deal),
  }))
}

// ─── Sequence config (for template system) ──────────────────

export const POSTVENTA_STEPS = POSTVENTA_SEQUENCE.map((s, i) => ({
  order: i,
  label: s.label,
  delayHours: s.delayMs / (60 * 60 * 1000),
}))