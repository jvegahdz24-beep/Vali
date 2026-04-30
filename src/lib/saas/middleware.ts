// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Feature Gate Middleware
// Checks if a workspace's plan includes a specific feature.
// Use in API routes to gate premium functionality.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { planHasFeature, FEATURE_DISPLAY_NAMES } from './plan-limits'
import type { SaaSPlan } from './plan-limits'

// ─── Feature Gate Result ───────────────────────────────────────

export interface FeatureGateResult {
  allowed: boolean
  currentPlan: string
  feature: string
  featureName: string
  requiredPlan?: string
  upgradeMessage?: string
}

// ─── Feature to Minimum Required Plan ─────────────────────────

export const FEATURE_MIN_PLAN: Record<string, SaaSPlan> = {
  meta_ads: 'professional',
  telegram: 'professional',
  google_calendar: 'professional',
  multiple_whatsapp: 'professional',
  api_access: 'enterprise',
  email_campaigns: 'professional',
  priority_support: 'enterprise',
  white_label: 'enterprise',
  custom_integrations: 'enterprise',
}

/**
 * Returns a middleware function that checks if the authenticated
 * user's workspace plan includes the specified feature.
 *
 * Usage in an API route:
 * ```ts
 * const gate = requirePlan('meta_ads')
 * const result = await gate(request, workspaceId)
 * if (!result.allowed) {
 *   return NextResponse.json({ error: result.upgradeMessage }, { status: 403 })
 * }
 * ```
 */
export function requirePlan(feature: string) {
  return async (
    request: NextRequest,
    workspaceId: string
  ): Promise<FeatureGateResult> => {
    try {
      const session = await requireAuth(request)

      // Look up workspace
      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { plan: true },
      })

      if (!workspace) {
        return {
          allowed: false,
          currentPlan: 'none',
          feature,
          featureName: FEATURE_DISPLAY_NAMES[feature] || feature,
          upgradeMessage: 'Workspace not found.',
        }
      }

      const featureName = FEATURE_DISPLAY_NAMES[feature] || feature
      const allowed = planHasFeature(workspace, feature)

      if (allowed) {
        return {
          allowed: true,
          currentPlan: workspace.plan,
          feature,
          featureName,
        }
      }

      // Build upgrade suggestion
      const minPlan = FEATURE_MIN_PLAN[feature] || 'professional'
      const planLabels: Record<string, string> = {
        starter: 'Starter',
        professional: 'Professional',
        enterprise: 'Enterprise',
      }

      return {
        allowed: false,
        currentPlan: workspace.plan,
        feature,
        featureName,
        requiredPlan: minPlan,
        upgradeMessage: `${featureName} requires the ${planLabels[minPlan] || minPlan} plan or higher. Your current plan does not include this feature. Please upgrade to access ${featureName}.`,
      }
    } catch {
      return {
        allowed: false,
        currentPlan: 'unknown',
        feature,
        featureName: FEATURE_DISPLAY_NAMES[feature] || feature,
        upgradeMessage: 'Unable to verify plan. Please try again.',
      }
    }
  }
}

/**
 * Convenience: Returns a 403 JSON response if feature is not allowed.
 * Returns null if allowed (so the route can proceed).
 */
export async function enforcePlan(
  request: NextRequest,
  workspaceId: string,
  feature: string
): Promise<NextResponse | null> {
  const gate = requirePlan(feature)
  const result = await gate(request, workspaceId)

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: result.upgradeMessage || 'Feature not available on your plan.',
        code: 'UPGRADE_REQUIRED',
        feature: result.feature,
        featureName: result.featureName,
        requiredPlan: result.requiredPlan,
        currentPlan: result.currentPlan,
      },
      { status: 403 }
    )
  }

  return null
}

/**
 * Check multiple features at once. Returns all missing features.
 */
export async function checkFeatures(
  request: NextRequest,
  workspaceId: string,
  features: string[]
): Promise<{ allowed: boolean; missing: string[]; upgradeMessages: string[] }> {
  const missing: string[] = []
  const upgradeMessages: string[] = []

  for (const feature of features) {
    const gate = requirePlan(feature)
    const result = await gate(request, workspaceId)
    if (!result.allowed) {
      missing.push(feature)
      if (result.upgradeMessage) {
        upgradeMessages.push(result.upgradeMessage)
      }
    }
  }

  return {
    allowed: missing.length === 0,
    missing,
    upgradeMessages,
  }
}
