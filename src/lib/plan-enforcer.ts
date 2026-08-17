// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Plan Enforcement
// Checks workspace plan limits before resource creation
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { PLANS } from '@/lib/constants'

export type ResourceType = 'contacts' | 'agents' | 'conversations' | 'automations'

export interface PlanLimitResult {
  allowed: boolean
  current: number
  max: number
  plan: string
  resourceType: ResourceType
}

/**
 * Check if a workspace can create more of a given resource based on its plan limits.
 *
 * Usage:
 *   const check = await checkPlanLimit(workspaceId, 'contacts')
 *   if (!check.allowed) {
 *     return Response.json({ error: `Plan limit reached: ${check.current}/${check.max} contacts` }, { status: 403 })
 *   }
 */
export async function checkPlanLimit(
  workspaceId: string,
  resourceType: ResourceType
): Promise<PlanLimitResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      plan: true,
      maxContacts: true,
      maxAgents: true,
      maxConversations: true,
    },
  })

  if (!workspace) {
    return {
      allowed: false,
      current: 0,
      max: 0,
      plan: 'unknown',
      resourceType,
    }
  }

  let current = 0
  let max = 0

  switch (resourceType) {
    case 'contacts':
      current = await db.contact.count({ where: { workspaceId } })
      max = workspace.maxContacts
      break
    case 'agents':
      current = await db.agent.count({ where: { workspaceId } })
      max = workspace.maxAgents
      break
    case 'conversations':
      current = await db.conversation.count({ where: { workspaceId } })
      max = workspace.maxConversations
      break
    case 'automations':
      current = await db.automation.count({ where: { workspaceId } })
      max = PLANS[workspace.plan]?.limits.maxAutomations ?? 0
      break
  }

  return {
    allowed: current < max,
    current,
    max,
    plan: workspace.plan,
    resourceType,
  }
}

/**
 * Convenience: throw a 403 ApiError if plan limit is exceeded.
 * Returns void if allowed.
 */
export async function enforcePlanLimit(
  workspaceId: string,
  resourceType: ResourceType
): Promise<void> {
  const result = await checkPlanLimit(workspaceId, resourceType)

  if (!result.allowed) {
    const resourceNames: Record<ResourceType, string> = {
      contacts: 'contactos',
      agents: 'agentes',
      conversations: 'conversaciones',
      automations: 'automatizaciones',
    }

    throw new PlanLimitError(
      `Límite del plan alcanzado: ${result.current}/${result.max} ${resourceNames[resourceType]}. ` +
      `Actualiza tu plan para crear más ${resourceNames[resourceType]}.`,
      result
    )
  }
}

/**
 * Custom error class for plan limit violations.
 */
export class PlanLimitError extends Error {
  public readonly statusCode = 403
  public readonly code = 'PLAN_LIMIT_EXCEEDED'
  public readonly limitResult: PlanLimitResult

  constructor(message: string, limitResult: PlanLimitResult) {
    super(message)
    this.name = 'PlanLimitError'
    this.limitResult = limitResult
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      current: this.limitResult.current,
      max: this.limitResult.max,
      plan: this.limitResult.plan,
      resourceType: this.limitResult.resourceType,
    }
  }
}
