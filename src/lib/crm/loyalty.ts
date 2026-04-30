// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Loyalty / Clientes Frecuentes Engine
// Points, tiers, referral codes, reward redemption
// Stores loyalty data in Contact.customFields JSON
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────

export interface LoyaltyTier {
  tier: 'bronce' | 'plata' | 'oro' | 'diamante'
  points: number
  benefits: string[]
}

interface LoyaltyData {
  loyaltyPoints: number
  loyaltyTier: 'bronce' | 'plata' | 'oro' | 'diamante'
  referralCode: string
  referralBonusGiven: string[] // contactIds that have already been rewarded
  pointsHistory: { points: number; reason: string; date: string }[]
}

// ─── Constants ────────────────────────────────────────────────

const TIER_THRESHOLDS: { min: number; max: number; tier: LoyaltyTier['tier']; benefits: string[] }[] = [
  { min: 1500, max: Infinity, tier: 'diamante', benefits: ['15% descuento en próxima compra', 'Soporte prioritario', 'Add-on gratis'] },
  { min: 500, max: 1499, tier: 'oro', benefits: ['10% descuento en próxima compra', 'Soporte prioritario'] },
  { min: 100, max: 499, tier: 'plata', benefits: ['5% descuento en próxima compra'] },
  { min: 0, max: 99, tier: 'bronce', benefits: [] },
]

const POINT_RULES = {
  purchaseCompleted: 50,
  appointmentAttended: 20,
  fastResponse: 5,
  referralConversion: 100,
} as const

const MAX_LOYALTY_POINTS = 100000 // FIX MEDIUM: Cap to prevent unbounded accumulation

// ─── Helpers ──────────────────────────────────────────────────

function parseCustomFields(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function getLoyaltyData(raw: string): LoyaltyData {
  const fields = parseCustomFields(raw)
  return {
    loyaltyPoints: (fields.loyaltyPoints as number) || 0,
    loyaltyTier: (fields.loyaltyTier as LoyaltyData['loyaltyTier']) || 'bronce',
    referralCode: (fields.referralCode as string) || '',
    referralBonusGiven: (fields.referralBonusGiven as string[]) || [],
    pointsHistory: (fields.pointsHistory as LoyaltyData['pointsHistory']) || [],
  }
}

function computeTier(points: number): LoyaltyTier {
  const match = TIER_THRESHOLDS.find(t => points >= t.min && points <= t.max)
  const tier = match?.tier ?? 'bronce'
  const benefits = match?.benefits ?? []
  return { tier, points, benefits }
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Add loyalty points to a contact.
 * Stores data in Contact.customFields JSON.
 */
export async function addPoints(contactId: number, points: number, reason: string, actionId?: string): Promise<void> {
  try {
    if (points <= 0) return // Guard against zero/negative point awards

    const contact = await db.contact.findUnique({ where: { id: String(contactId) } })
    if (!contact) {
      console.warn(`[Loyalty] Contact ${contactId} not found`)
      return
    }

    const data = getLoyaltyData(contact.customFields)

    // FIX HIGH: Idempotency check — prevent double-earn for same action
    if (actionId) {
      const alreadyAwarded = data.pointsHistory.some(
        (h) => h.reason === reason && h.date === actionId
      )
      if (alreadyAwarded) {
        console.log(`[Loyalty] Duplicate action ${actionId} for contact ${contactId} — skipping`)
        return
      }
    }

    // Apply points with cap
    data.loyaltyPoints = Math.min(MAX_LOYALTY_POINTS, Math.max(0, data.loyaltyPoints + points))

    // Recompute tier
    const tierInfo = computeTier(data.loyaltyPoints)
    data.loyaltyTier = tierInfo.tier

    // Track history
    data.pointsHistory.push({
      points,
      reason,
      date: new Date().toISOString(),
    })

    // Keep only last 50 history entries
    if (data.pointsHistory.length > 50) {
      data.pointsHistory = data.pointsHistory.slice(-50)
    }

    // Ensure referral code exists
    if (!data.referralCode) {
      data.referralCode = generateReferralCode()
    }

    await db.contact.update({
      where: { id: String(contactId) },
      data: { customFields: JSON.stringify(data) },
    })

    console.log(`[Loyalty] +${points} pts for contact ${contactId} → ${tierInfo.tier} (${data.loyaltyPoints} total). Reason: ${reason}`)
  } catch (err) {
    console.warn('[Loyalty] addPoints error (non-critical):', err instanceof Error ? err.message : err)
  }
}

/**
 * Get current loyalty tier and points for a contact.
 */
export async function getLoyaltyTier(contactId: number): Promise<LoyaltyTier> {
  try {
    const contact = await db.contact.findUnique({ where: { id: String(contactId) } })
    if (!contact) {
      return computeTier(0)
    }

    const data = getLoyaltyData(contact.customFields)
    return computeTier(data.loyaltyPoints)
  } catch (err) {
    console.warn('[Loyalty] getLoyaltyTier error (non-critical):', err instanceof Error ? err.message : err)
    return computeTier(0)
  }
}

/**
 * Redeem points for a reward. Deducts points and returns the reward.
 */
export async function redeemReward(
  contactId: number,
  rewardType: string,
): Promise<{ success: boolean; reward: string }> {
  try {
    const contact = await db.contact.findUnique({ where: { id: String(contactId) } })
    if (!contact) {
      return { success: false, reward: '' }
    }

    const data = getLoyaltyData(contact.customFields)

    // Reward costs
    const rewardCosts: Record<string, number> = {
      discount_5: 100,
      discount_10: 300,
      discount_15: 600,
      priority_support: 200,
      free_addon: 500,
      gift: 400,
    }

    const cost = rewardCosts[rewardType]
    if (cost === undefined) {
      return { success: false, reward: '' }
    }

    if (data.loyaltyPoints < cost) {
      return { success: false, reward: '' }
    }

    // Deduct points
    data.loyaltyPoints -= cost
    const tierInfo = computeTier(data.loyaltyPoints)
    data.loyaltyTier = tierInfo.tier
    data.pointsHistory.push({
      points: -cost,
      reason: `Canje: ${rewardType}`,
      date: new Date().toISOString(),
    })

    await db.contact.update({
      where: { id: String(contactId) },
      data: { customFields: JSON.stringify(data) },
    })

    const rewardLabels: Record<string, string> = {
      discount_5: 'Descuento 5%',
      discount_10: 'Descuento 10%',
      discount_15: 'Descuento 15%',
      priority_support: 'Soporte prioritario',
      free_addon: 'Add-on gratis',
      gift: 'Regalo sorpresa',
    }

    console.log(`[Loyalty] Contact ${contactId} redeemed ${rewardType} for ${cost} pts`)
    return { success: true, reward: rewardLabels[rewardType] || rewardType }
  } catch (err) {
    console.warn('[Loyalty] redeemReward error (non-critical):', err instanceof Error ? err.message : err)
    return { success: false, reward: '' }
  }
}

/**
 * Generate a unique referral code for a contact.
 */
export async function getReferralCode(contactId: number): Promise<string> {
  try {
    const contact = await db.contact.findUnique({ where: { id: String(contactId) } })
    if (!contact) {
      return ''
    }

    const data = getLoyaltyData(contact.customFields)
    if (data.referralCode) {
      return data.referralCode
    }

    // Generate new code and save
    const code = generateReferralCode()
    const fields = parseCustomFields(contact.customFields)
    fields.referralCode = code
    fields.loyaltyPoints = fields.loyaltyPoints || 0
    fields.loyaltyTier = fields.loyaltyTier || 'bronce'
    fields.referralBonusGiven = fields.referralBonusGiven || []
    fields.pointsHistory = fields.pointsHistory || []

    await db.contact.update({
      where: { id: String(contactId) },
      data: { customFields: JSON.stringify(fields) },
    })

    return code
  } catch (err) {
    console.warn('[Loyalty] getReferralCode error (non-critical):', err instanceof Error ? err.message : err)
    return ''
  }
}

/**
 * Process a referral: when a referred contact converts (e.g. closes a deal),
 * give bonus points to the referrer. Prevents duplicate bonuses.
 */
export async function processReferral(
  referrerId: number,
  referredPhone: string,
): Promise<{ bonus: number }> {
  try {
    const bonus = POINT_RULES.referralConversion

    // Find referrer contact
    const referrer = await db.contact.findUnique({ where: { id: String(referrerId) } })
    if (!referrer) {
      console.warn(`[Loyalty] Referrer ${referrerId} not found`)
      return { bonus: 0 }
    }

    const data = getLoyaltyData(referrer.customFields)

    // Check if this phone was already rewarded
    if (data.referralBonusGiven.includes(referredPhone)) {
      console.log(`[Loyalty] Referral bonus already given for phone ${referredPhone}`)
      return { bonus: 0 }
    }

    // Add bonus points
    data.loyaltyPoints += bonus
    const tierInfo = computeTier(data.loyaltyPoints)
    data.loyaltyTier = tierInfo.tier
    data.referralBonusGiven.push(referredPhone)
    data.pointsHistory.push({
      points: bonus,
      reason: `Referido convirtió: ${referredPhone}`,
      date: new Date().toISOString(),
    })

    await db.contact.update({
      where: { id: String(referrerId) },
      data: { customFields: JSON.stringify(data) },
    })

    console.log(`[Loyalty] +${bonus} referral bonus for contact ${referrerId}`)
    return { bonus }
  } catch (err) {
    console.warn('[Loyalty] processReferral error (non-critical):', err instanceof Error ? err.message : err)
    return { bonus: 0 }
  }
}

/**
 * Get full loyalty status for a contact (for API responses).
 */
export async function getLoyaltyStatus(contactId: number): Promise<{
  points: number
  tier: string
  benefits: string[]
  referralCode: string
  history: { points: number; reason: string; date: string }[]
}> {
  try {
    const contact = await db.contact.findUnique({ where: { id: String(contactId) } })
    if (!contact) {
      return { points: 0, tier: 'bronce', benefits: [], referralCode: '', history: [] }
    }

    const data = getLoyaltyData(contact.customFields)
    const tierInfo = computeTier(data.loyaltyPoints)

    return {
      points: data.loyaltyPoints,
      tier: tierInfo.tier,
      benefits: tierInfo.benefits,
      referralCode: data.referralCode || generateReferralCode(),
      history: data.pointsHistory,
    }
  } catch (err) {
    console.warn('[Loyalty] getLoyaltyStatus error (non-critical):', err instanceof Error ? err.message : err)
    return { points: 0, tier: 'bronce', benefits: [], referralCode: '', history: [] }
  }
}

// ─── Point Earning Constants (for external callers) ──────────

export const POINT_EARNING = {
  purchaseCompleted: POINT_RULES.purchaseCompleted,
  appointmentAttended: POINT_RULES.appointmentAttended,
  fastResponse: POINT_RULES.fastResponse,
  referralConversion: POINT_RULES.referralConversion,
} as const

export const TIER_NAMES = ['bronce', 'plata', 'oro', 'diamante'] as const
