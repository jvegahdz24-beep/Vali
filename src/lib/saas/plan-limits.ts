// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Plan Limits Configuration
// Defines limits and feature flags per SaaS subscription plan.
// Separate from internal PLANS constant — this drives the
// multi-client portal selling mechanism.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Plan Type ──────────────────────────────────────────────────

export type SaaSPlan = 'starter' | 'professional' | 'enterprise'

/** Map SaaS portal plan names → internal DB plan keys */
export const SAAS_PLAN_TO_INTERNAL: Record<SaaSPlan, string> = {
  starter: 'starter',
  professional: 'pro',
  enterprise: 'enterprise',
}

/** Map internal plan keys back to SaaS portal names */
export const INTERNAL_PLAN_TO_SAAS: Record<string, SaaSPlan> = {
  starter: 'starter',
  pro: 'professional',
  enterprise: 'enterprise',
}

// ─── Plan Limits Config ────────────────────────────────────────

export interface SaaSPlanLimits {
  maxContacts: number
  maxWhatsApp: number
  maxMessages: number | null   // null = unlimited
  features: {
    meta_ads: boolean
    telegram: boolean
    google_calendar: boolean
    multiple_whatsapp: boolean
    api_access: boolean
    email_campaigns: boolean
    priority_support: boolean
    white_label: boolean
    custom_integrations: boolean
  }
  /** Monthly price in USD for display */
  priceUSD: number
  /** Stripe Price ID env var name */
  stripePriceEnvVar: string
}

export const PLAN_LIMITS: Record<SaaSPlan, SaaSPlanLimits> = {
  starter: {
    maxContacts: 100,
    maxWhatsApp: 1,
    maxMessages: 1000,
    features: {
      meta_ads: false,
      telegram: false,
      google_calendar: false,
      multiple_whatsapp: false,
      api_access: false,
      email_campaigns: false,
      priority_support: false,
      white_label: false,
      custom_integrations: false,
    },
    priceUSD: 49,
    stripePriceEnvVar: 'STRIPE_STARTER_PRICE_ID',
  },
  professional: {
    maxContacts: 2000,
    maxWhatsApp: 3,
    maxMessages: 10000,
    features: {
      meta_ads: true,
      telegram: true,
      google_calendar: true,
      multiple_whatsapp: true,
      api_access: false,
      email_campaigns: true,
      priority_support: false,
      white_label: false,
      custom_integrations: false,
    },
    priceUSD: 199,
    stripePriceEnvVar: 'STRIPE_PROFESSIONAL_PRICE_ID',
  },
  enterprise: {
    maxContacts: Infinity,  // unlimited
    maxWhatsApp: Infinity,
    maxMessages: null,      // unlimited
    features: {
      meta_ads: true,
      telegram: true,
      google_calendar: true,
      multiple_whatsapp: true,
      api_access: true,
      email_campaigns: true,
      priority_support: true,
      white_label: true,
      custom_integrations: true,
    },
    priceUSD: 499,
    stripePriceEnvVar: 'STRIPE_ENTERPRISE_PRICE_ID',
  },
}

// ─── Feature Names for Upgrade Messages ────────────────────────

export const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  meta_ads: 'Meta Ads Integration',
  telegram: 'Telegram Channel',
  google_calendar: 'Google Calendar Sync',
  multiple_whatsapp: 'Multiple WhatsApp Numbers',
  api_access: 'API Access',
  email_campaigns: 'Email Campaigns',
  priority_support: 'Priority Support',
  white_label: 'White-Label Branding',
  custom_integrations: 'Custom Integrations',
}

// ─── Usage Check Helpers ───────────────────────────────────────

export interface UsageResult {
  allowed: boolean
  current: number
  limit: number
  warning?: string
}

/**
 * Check if a workspace can use a specific feature based on its plan.
 */
export async function checkUsage(
  workspaceId: string,
  feature: 'contacts' | 'whatsapp' | 'messages'
): Promise<UsageResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      plan: true,
      maxContacts: true,
      whatsappPhoneId: feature === 'whatsapp',
      settings: feature === 'whatsapp',
    },
  })

  if (!workspace) {
    return { allowed: false, current: 0, limit: 0 }
  }

  const saasPlan = getPlanFromWorkspace(workspace)
  const limits = PLAN_LIMITS[saasPlan]
  if (!limits) {
    return { allowed: false, current: 0, limit: 0 }
  }

  switch (feature) {
    case 'contacts': {
      const current = await db.contact.count({
        where: { workspaceId, status: { in: ['active', 'inactive'] } },
      })
      const limit = limits.maxContacts
      const allowed = current < limit
      return {
        allowed,
        current,
        limit: limit === Infinity ? -1 : limit, // -1 = unlimited
        warning: allowed && limit !== Infinity && current >= limit * 0.8
          ? `You've used ${Math.round((current / limit) * 100)}% of your contact limit. Consider upgrading.`
          : undefined,
      }
    }

    case 'whatsapp': {
      // Count active WhatsApp connections: main whatsappPhoneId + any extras in settings
      const current = countWhatsAppConnections(workspace as any)
      const limit = limits.maxWhatsApp
      const allowed = current < limit
      return {
        allowed,
        current,
        limit: limit === Infinity ? -1 : limit,
        warning: allowed && limit !== Infinity && current >= limit
          ? 'All WhatsApp connections are in use. Upgrade to add more.'
          : undefined,
      }
    }

    case 'messages': {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const current = await db.message.count({
        where: {
          conversation: { workspaceId },
          direction: 'outbound',
          createdAt: { gte: monthStart },
        },
      })
      const limit = limits.maxMessages
      if (limit === null) {
        return { allowed: true, current, limit: -1 } // unlimited
      }
      const allowed = current < limit
      return {
        allowed,
        current,
        limit,
        warning: allowed && current >= limit * 0.8
          ? `You've sent ${Math.round((current / limit) * 100)}% of your monthly message limit.`
          : undefined,
      }
    }

    default:
      return { allowed: false, current: 0, limit: 0 }
  }
}

/**
 * Check if a workspace can send email campaigns.
 */
export async function canSendEmail(workspaceId: string): Promise<boolean> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  })
  if (!workspace) return false
  const saasPlan = getPlanFromWorkspace(workspace)
  return PLAN_LIMITS[saasPlan]?.features.email_campaigns ?? false
}

/**
 * Get the SaaS plan key from a workspace record.
 */
export function getPlanFromWorkspace(workspace: { plan: string }): SaaSPlan {
  return (INTERNAL_PLAN_TO_SAAS[workspace.plan] as SaaSPlan) || 'starter'
}

/**
 * Check if a workspace's plan includes a given feature.
 */
export function planHasFeature(
  workspace: { plan: string },
  feature: string
): boolean {
  const saasPlan = getPlanFromWorkspace(workspace)
  const limits = PLAN_LIMITS[saasPlan]
  return (limits?.features as Record<string, boolean>)[feature] ?? false
}

// ─── Internal Helpers ──────────────────────────────────────────

/**
 * Count WhatsApp connections for a workspace.
 * Checks whatsappPhoneId on workspace + any additional connections
 * stored in settings.
 */
export function countWhatsAppConnections(
  workspace: { whatsappPhoneId: string | null; settings?: string }
): number {
  let count = workspace.whatsappPhoneId ? 1 : 0

  try {
    const settings = workspace.settings ? JSON.parse(workspace.settings) : {}
    if (settings?.additionalWhatsAppConnections) {
      count += Array.isArray(settings.additionalWhatsAppConnections)
        ? settings.additionalWhatsAppConnections.length
        : 0
    }
  } catch {
    // settings parse failure — non-fatal
  }

  return count
}
