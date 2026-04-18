// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Auto Deal Creator
// Creates pipeline deals automatically when leads qualify
// Called from message-processor after CRM updates
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────

interface AutoDealInput {
  workspaceId: string
  contactId: string
  conversationId: string
  contactName: string
  leadScore: number
  tags: string[]
  channel: string
}

// ─── Vehicle Detection ────────────────────────────────────────

const VEHICLE_MODELS = [
  'sentra', 'versa', 'altima', 'kick', 'pathfinder', 'frontier', 'titan',
  'corolla', 'rav4', 'camry', 'hilux', 'prius', 'yaris',
  'silverado', 'tracker', 'equinox', 'trax', 'captiva', 'blazer', 'suburban',
  'cx-3', 'cx-5', 'cx-30', 'cx-50', 'cx-90', '3', '6', 'mx-5',
  'seltos', 'sportage', 'rio', 'k5', 'sorento', 'carnival', 'telluride',
  'cr-v', 'civic', 'hr-v', 'accord', 'fit', 'city', 'brio',
  'mustang', 'bronco', 'eco sport', 'ranger', 'maverick', 'explorer', 'escape',
  'tucson', 'creta', 'accent', 'venue', 'santa fe', 'genesis',
  'jetta', 'taos', 'golf', 'tiguan', 'v-cross', 'polo',
  'compass', 'cherokee', 'wrangler', 'grand cherokee', 'gladiator',
  'outlander', 'asx', 'l200', 'mirage', 'eclipse cross',
]

function detectVehicle(tags: string[]): string | null {
  const tagStr = tags.join(' ').toLowerCase()
  for (const model of VEHICLE_MODELS) {
    if (tagStr.includes(model)) {
      return model.charAt(0).toUpperCase() + model.slice(1)
    }
  }
  return null
}

function estimateBudget(tags: string[], score: number): number {
  const tagStr = tags.join(' ')
  for (const [model, price] of [
    ['versa', 380000], ['rio', 380000], ['accent', 380000], ['mirage', 360000],
    ['sentra', 450000], ['corolla', 470000], ['civic', 480000], ['seltos', 460000],
    ['tracker', 420000], ['creta', 430000], ['taos', 500000], ['cx-3', 460000],
    ['rav4', 560000], ['cr-v', 580000], ['cx-5', 560000], ['sportage', 540000],
    ['tucson', 520000], ['jetta', 500000], ['silverado', 850000], ['frontier', 650000],
    ['pathfinder', 750000], ['mustang', 950000],
  ] as [string, number][]) {
    if (tagStr.toLowerCase().includes(model)) return price
  }
  if (score >= 70) return 650000
  if (score >= 50) return 500000
  return 400000
}

// ─── Main Function ────────────────────────────────────────────

/**
 * Auto-create or update a Deal when a lead qualifies.
 *
 * Rules:
 * - Always create deal on first conversation (Lead Nuevo stage)
 * - Move to Cualificado when score >= 40
 * - Move to Propuesta when score >= 60
 * - Move to Negociación when score >= 80
 * - Don't move to won/lost automatically (human decision)
 */
export async function autoCreateOrUpdateDeal(input: AutoDealInput): Promise<void> {
  const { workspaceId, contactId, contactName, leadScore, tags, channel } = input

  try {
    const pipeline = await db.pipeline.findFirst({
      where: { workspaceId, isActive: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    })

    if (!pipeline) {
      console.log('[AutoDeal] No pipeline found, skipping')
      return
    }

    // Determine target stage based on score
    let targetStageName = 'Lead Nuevo'
    if (leadScore >= 80) targetStageName = 'Negociación'
    else if (leadScore >= 60) targetStageName = 'Propuesta'
    else if (leadScore >= 40) targetStageName = 'Cualificado'
    else if (leadScore >= 20) targetStageName = 'Contactado'

    const stage = pipeline.stages.find(s => s.name === targetStageName) || pipeline.stages[0]

    // Check if deal already exists
    const existingDeal = await db.deal.findFirst({
      where: { workspaceId, contactId, status: 'active' },
    })

    const vehicle = detectVehicle(tags)
    const budget = estimateBudget(tags, leadScore)

    if (existingDeal) {
      const currentStageOrder = pipeline.stages.find(s => s.id === existingDeal.stageId)?.order ?? 0
      const newStageOrder = stage.order

      if (newStageOrder > currentStageOrder || (existingDeal.value === 0 && budget > 0)) {
        await db.deal.update({
          where: { id: existingDeal.id },
          data: {
            stageId: stage.id,
            value: existingDeal.value > 0 ? existingDeal.value : budget,
            updatedAt: new Date(),
            ...(vehicle && !existingDeal.title.toLowerCase().includes(vehicle.toLowerCase()) ? {
              title: `${contactName} — ${vehicle}`,
            } : {}),
          },
        })
        console.log(`[AutoDeal] Updated: ${existingDeal.title} → ${targetStageName}`)
      }
    } else {
      const dealTitle = vehicle
        ? `${contactName} — ${vehicle}`
        : `${contactName} — Lead WhatsApp`

      await db.deal.create({
        data: {
          workspaceId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId,
          title: dealTitle,
          value: budget,
          currency: 'MXN',
          description: `Contacto por ${channel}. Score: ${leadScore}/100.${vehicle ? ` Vehículo: ${vehicle}.` : ''}`,
          source: channel,
          status: 'active',
          expectedCloseDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        },
      })
      console.log(`[AutoDeal] Created: ${dealTitle} (${targetStageName}) — $${budget.toLocaleString('es-MX')} MXN`)
    }
  } catch (err) {
    console.warn('[AutoDeal] Error (non-critical):', err instanceof Error ? err.message : err)
  }
}
