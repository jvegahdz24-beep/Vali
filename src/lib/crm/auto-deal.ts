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
  /** If the AI emitted [CRM:stage:X], override score-based stage selection */
  overrideStage?: string
}

// ─── Stage name normalization ─────────────────────────────────

/** Canonical pipeline stage names (must match the seeded pipeline stages). */
export const CANONICAL_STAGES = [
  'Lead Nuevo', 'Contactado', 'Cualificado', 'Propuesta', 'Negociación', 'Cerrado',
] as const

/**
 * Maps a stage value emitted by the AI (e.g. via [CRM:stage:X]) to a canonical
 * pipeline stage name. Tolerant of casing, missing accents and common synonyms
 * (e.g. "cierre" / "cerrar" → "Cerrado"). Returns undefined if it can't be resolved,
 * so the caller can fall back to score-based logic instead of silently writing garbage.
 */
export function normalizeStageName(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents

  const SYNONYMS: Record<string, string> = {
    'lead nuevo': 'Lead Nuevo', 'nuevo': 'Lead Nuevo', 'new': 'Lead Nuevo',
    'contactado': 'Contactado', 'contacto': 'Contactado',
    'cualificado': 'Cualificado', 'calificado': 'Cualificado', 'qualified': 'Cualificado',
    'propuesta': 'Propuesta', 'proposal': 'Propuesta', 'cotizacion': 'Propuesta',
    'negociacion': 'Negociación', 'negotiation': 'Negociación', 'negociando': 'Negociación',
    'cerrado': 'Cerrado', 'cierre': 'Cerrado', 'cerrar': 'Cerrado', 'closed': 'Cerrado',
    'ganado': 'Cerrado', 'won': 'Cerrado', 'vendido': 'Cerrado',
  }
  return SYNONYMS[key]
}

// ─── Product / Value Detection ────────────────────────────────

type CatalogCandidate = {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  category: string | null
}

const LEGACY_AUTOMOTIVE_TITLES = [
  'sentra', 'versa', 'altima', 'kick', 'pathfinder', 'frontier', 'titan',
  'corolla', 'rav4', 'camry', 'hilux', 'prius', 'yaris', 'silverado',
  'tracker', 'equinox', 'trax', 'captiva', 'blazer', 'suburban', 'cx-3',
  'cx-5', 'cx-30', 'cx-50', 'cx-90', 'seltos', 'sportage', 'rio', 'k5',
  'sorento', 'carnival', 'telluride', 'cr-v', 'civic', 'hr-v', 'accord',
  'fit', 'city', 'brio', 'mustang', 'bronco', 'ranger', 'maverick',
  'explorer', 'escape', 'tucson', 'creta', 'accent', 'venue', 'santa fe',
  'jetta', 'taos', 'golf', 'tiguan', 'polo', 'compass', 'cherokee',
  'wrangler', 'gladiator', 'outlander', 'asx', 'l200', 'mirage',
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJsonArray(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function parseJsonObjectValues(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.values(parsed)
      .flatMap((item) => Array.isArray(item) ? item : [item])
      .filter((item) => item !== null && item !== undefined)
      .map(String)
      .filter(Boolean)
  } catch {
    return []
  }
}

function extractTaggedProduct(tags: string[]): string | null {
  for (const tag of tags) {
    const clean = tag.trim()
    const lower = clean.toLowerCase()
    const match = clean.match(/^(?:producto|product|interes|interesado|interesado-en|servicio|service)[:\s-]+(.+)$/i)
    if (match?.[1]?.trim()) return match[1].trim()
    if (lower.startsWith('interesado-') || lower.startsWith('interesado_')) {
      return clean.replace(/^interesado[-_]/i, '').replace(/[-_]/g, ' ').trim()
    }
  }
  return null
}

function parseBudgetValue(value?: string | null): number {
  if (!value) return 0
  const numbers = value.match(/\d[\d,.\s]*/g)
  if (!numbers?.length) return 0
  const parsed = numbers
    .map((raw) => Number(raw.replace(/[,\s]/g, '')))
    .filter((num) => Number.isFinite(num) && num > 0)
  if (parsed.length === 0) return 0
  return Math.max(...parsed)
}

function findCatalogMatch(catalog: CatalogCandidate[], explicitProduct: string | null, contextText: string): CatalogCandidate | null {
  if (catalog.length === 0) return null

  const explicit = explicitProduct ? normalizeText(explicitProduct) : ''
  const context = normalizeText(contextText)
  const haystack = explicit || context
  if (!haystack) return null

  let best: { item: CatalogCandidate; score: number } | null = null
  for (const item of catalog) {
    const name = normalizeText(item.name)
    const category = item.category ? normalizeText(item.category) : ''
    const description = item.description ? normalizeText(item.description) : ''
    const words = name.split(' ').filter((word) => word.length >= 4)

    let score = 0
    if (explicit) {
      if (explicit === name || explicit.includes(name) || name.includes(explicit)) score += 10
      score += words.filter((word) => explicit.includes(word)).length * 3
    }
    if (context.includes(name)) score += 6
    score += words.filter((word) => context.includes(word)).length
    if (category && context.includes(category)) score += 1
    if (description) {
      score += description
        .split(' ')
        .filter((word) => word.length >= 5 && context.includes(word))
        .slice(0, 2).length
    }

    if (score > 0 && (!best || score > best.score)) best = { item, score }
  }

  if (!best) return null
  return best.score >= (explicit ? 3 : 2) ? best.item : null
}

function isLegacyGenericDeal(title: string): boolean {
  const normalized = normalizeText(title)
  return normalized.endsWith('lead whatsapp') ||
    normalized.endsWith('oportunidad') ||
    LEGACY_AUTOMOTIVE_TITLES.some((model) => normalized.endsWith(` ${model}`) || normalized.endsWith(`- ${model}`))
}

function buildDealDescription(input: {
  channel: string
  leadScore: number
  productName?: string | null
  budget?: string | null
  objection?: string | null
  timeline?: string | null
  tags: string[]
  notes?: string | null
}): string {
  const lines = [
    `Contacto por ${input.channel}. Score: ${input.leadScore}/100.`,
    input.productName ? `Interés detectado: ${input.productName}.` : null,
    input.budget ? `Presupuesto mencionado: ${input.budget}.` : null,
    input.timeline ? `Tiempo estimado de compra: ${input.timeline}.` : null,
    input.objection ? `Objeción principal: ${input.objection}.` : null,
    input.tags.length > 0 ? `Etiquetas: ${input.tags.slice(0, 8).join(', ')}.` : null,
    input.notes ? `Notas del contacto: ${input.notes.slice(0, 500)}` : null,
  ].filter(Boolean)

  return lines.join('\n')
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
  const { workspaceId, contactId, contactName, leadScore, tags, channel, overrideStage } = input

  try {
    const [pipeline, contact, catalog] = await Promise.all([
      db.pipeline.findFirst({
        where: { workspaceId, isActive: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      }),
      db.contact.findUnique({
        where: { id: contactId },
        select: {
          tags: true,
          customFields: true,
          notes: true,
          leadProfile: {
            select: {
              preferredProduct: true,
              budget: true,
              mainObjection: true,
              timeline: true,
              interests: true,
            },
          },
        },
      }),
      db.catalogItem.findMany({
        where: { workspaceId, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          currency: true,
          category: true,
        },
        take: 200,
      }),
    ])

    if (!pipeline) {
      console.log('[AutoDeal] No pipeline found, skipping')
      return
    }

    const contactTags = parseJsonArray(contact?.tags)
    const profileInterests = parseJsonArray(contact?.leadProfile?.interests)
    const allTags = Array.from(new Set([...tags, ...contactTags, ...profileInterests].filter(Boolean)))
    const explicitProduct = contact?.leadProfile?.preferredProduct || extractTaggedProduct(allTags)
    const contextText = [
      explicitProduct,
      contact?.leadProfile?.budget,
      contact?.leadProfile?.mainObjection,
      contact?.leadProfile?.timeline,
      contact?.notes,
      ...allTags,
      ...parseJsonObjectValues(contact?.customFields),
    ].filter(Boolean).join(' ')
    // ⚠️ Solo la EVIDENCIA DEL CLIENTE (LeadProfile.preferredProduct, extraído de
    // SUS mensajes) fija producto y precio del trato. Antes el contexto incluía
    // etiquetas que pone el PROPIO bot al pitchear ('Pro') y TODOS los deals
    // nacían "Plan Pro ⭐ $54,000" con probabilidad inflada — sin importar si el
    // cliente era un asesor novato explorando (caso real Jesús Molina 2026-07-13).
    const clientProduct = contact?.leadProfile?.preferredProduct || null
    const matchedProduct = clientProduct ? findCatalogMatch(catalog, clientProduct, contextText) : null
    const productName = matchedProduct?.name || clientProduct || null
    const estimatedValue = matchedProduct?.price ?? parseBudgetValue(contact?.leadProfile?.budget)
    const currency = matchedProduct?.currency || 'MXN'
    const dealDescription = buildDealDescription({
      channel,
      leadScore,
      productName,
      budget: contact?.leadProfile?.budget,
      objection: contact?.leadProfile?.mainObjection,
      timeline: contact?.leadProfile?.timeline,
      tags: allTags,
      notes: contact?.notes,
    })

    // Determine target stage: explicit AI CRM override takes priority over score-based logic.
    // Valid stage names (must match pipeline stage names exactly).
    const VALID_STAGES = ['Lead Nuevo', 'Contactado', 'Cualificado', 'Propuesta', 'Negociación', 'Cerrado']
    let targetStageName = 'Lead Nuevo'
    const resolvedOverride = overrideStage ? normalizeStageName(overrideStage) : undefined
    if (overrideStage && !resolvedOverride) {
      console.warn(`[autoDeal] Ignoring unrecognized [CRM:stage:${overrideStage}] for contact ${contactId} — not a valid pipeline stage`)
    }
    if (resolvedOverride) {
      targetStageName = resolvedOverride
    } else if (leadScore >= 80) targetStageName = 'Negociación'
    else if (leadScore >= 60) targetStageName = 'Propuesta'
    else if (leadScore >= 40) targetStageName = 'Cualificado'
    else if (leadScore >= 20) targetStageName = 'Contactado'

    const stage = pipeline.stages.find(s => s.name === targetStageName) || pipeline.stages[0]

    // Find ALL active deals for this contact (handles race-condition duplicates)
    const existingDeals = await db.deal.findMany({
      where: { workspaceId, contactId, status: 'active' },
      orderBy: { createdAt: 'asc' },
    })

    if (existingDeals.length > 0) {
      // Keep the deal at the most advanced stage; delete the rest (deduplicate)
      const sortedByStage = existingDeals.sort((a, b) => {
        const aOrder = pipeline.stages.find(s => s.id === a.stageId)?.order ?? 0
        const bOrder = pipeline.stages.find(s => s.id === b.stageId)?.order ?? 0
        return bOrder - aOrder // highest order first
      })
      const existingDeal = sortedByStage[0]

      // Delete duplicates silently
      if (sortedByStage.length > 1) {
        const duplicateIds = sortedByStage.slice(1).map(d => d.id)
        await db.deal.deleteMany({ where: { id: { in: duplicateIds } } })
        console.log(`[AutoDeal] Removed ${duplicateIds.length} duplicate deal(s) for contact ${contactId}`)
      }

      const currentStageOrder = pipeline.stages.find(s => s.id === existingDeal.stageId)?.order ?? 0
      const newStageOrder = stage.order
      const shouldUpdateTitle = isLegacyGenericDeal(existingDeal.title)
      const shouldUpdateValue = existingDeal.value === 0 ||
        (isLegacyGenericDeal(existingDeal.title) && existingDeal.value > 0)

      if (newStageOrder > currentStageOrder || shouldUpdateTitle || shouldUpdateValue || !existingDeal.description) {
        await db.deal.update({
          where: { id: existingDeal.id },
          data: {
            stageId: stage.id,
            title: shouldUpdateTitle
              ? `${contactName} — ${productName || 'Oportunidad'}`
              : existingDeal.title,
            value: shouldUpdateValue ? estimatedValue : existingDeal.value,
            currency,
            description: existingDeal.description || dealDescription,
            updatedAt: new Date(),
          },
        })
        console.log(`[AutoDeal] Updated: ${existingDeal.title} → ${targetStageName}`)
      }
    } else {
      const dealTitle = `${contactName} — ${productName || 'Oportunidad'}`

      await db.deal.create({
        data: {
          workspaceId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId,
          title: dealTitle,
          value: estimatedValue,
          currency,
          description: dealDescription,
          source: channel,
          status: 'active',
          expectedCloseDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        },
      })
      console.log(`[AutoDeal] Created: ${dealTitle} (${targetStageName}) — $${estimatedValue.toLocaleString('es-MX')} ${currency}`)
    }
  } catch (err) {
    console.warn('[AutoDeal] Error (non-critical):', err instanceof Error ? err.message : err)
  }
}
