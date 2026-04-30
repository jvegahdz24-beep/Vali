// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Usage API
// GET /api/saas/usage — Check usage against plan limits
// Returns current usage, limits, and warnings for approaching limits
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import {
  checkUsage,
  getPlanFromWorkspace,
  PLAN_LIMITS,
  type SaaSPlan,
} from '@/lib/saas/plan-limits'

// ─── GET Handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // ─── Auth Check ──────────────────────────────────────────
    const session = await requireAuth(req)

    // ─── Get workspaceId from query ─────────────────────────
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required', code: 'MISSING_PARAM' },
        { status: 400 }
      )
    }

    // ─── Workspace Access Check ──────────────────────────────
    await requireWorkspace(workspaceId, session.userId)

    // ─── Get Workspace ───────────────────────────────────────
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        whatsappPhoneId: true,
        settings: true,
      },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // ─── Determine SaaS Plan ────────────────────────────────
    const saasPlan = getPlanFromWorkspace(workspace)
    const planLimits = PLAN_LIMITS[saasPlan]

    // ─── Calculate Reset Date (start of next month) ─────────
    const now = new Date()
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // ─── Check Usage for Each Feature ───────────────────────
    const [contactsUsage, whatsappUsage, messagesUsage] = await Promise.all([
      checkUsage(workspaceId, 'contacts'),
      checkUsage(workspaceId, 'whatsapp'),
      checkUsage(workspaceId, 'messages'),
    ])

    // ─── Build Warnings Array ────────────────────────────────
    const warnings: string[] = []

    if (contactsUsage.warning) warnings.push(contactsUsage.warning)
    if (whatsappUsage.warning) warnings.push(whatsappUsage.warning)
    if (messagesUsage.warning) warnings.push(messagesUsage.warning)

    // Additional warnings for blocked features
    if (!contactsUsage.allowed) {
      warnings.push(
        `Contact limit reached (${contactsUsage.current}/${contactsUsage.limit}). Upgrade your plan to add more contacts.`
      )
    }
    if (!whatsappUsage.allowed) {
      warnings.push(
        `WhatsApp connection limit reached. Upgrade to add more WhatsApp numbers.`
      )
    }
    if (!messagesUsage.allowed) {
      warnings.push(
        `Monthly message limit reached. Your messages will reset on ${resetDate.toISOString().split('T')[0]}.`
      )
    }

    // ─── Format Response ────────────────────────────────────
    return NextResponse.json({
      plan: saasPlan,
      limits: {
        contacts: {
          current: contactsUsage.current,
          limit: contactsUsage.limit === -1 ? 'unlimited' : contactsUsage.limit,
          allowed: contactsUsage.allowed,
        },
        whatsapp: {
          current: whatsappUsage.current,
          limit: whatsappUsage.limit === -1 ? 'unlimited' : whatsappUsage.limit,
          allowed: whatsappUsage.allowed,
        },
        messages: {
          current: messagesUsage.current,
          limit: messagesUsage.limit === -1 ? 'unlimited' : messagesUsage.limit,
          allowed: messagesUsage.allowed,
          resetDate: resetDate.toISOString(),
        },
      },
      features: planLimits.features,
      warnings: warnings.length > 0 ? warnings : undefined,
      usagePercent: {
        contacts: contactsUsage.limit > 0
          ? Math.round((contactsUsage.current / contactsUsage.limit) * 100)
          : 0,
        whatsapp: whatsappUsage.limit > 0
          ? Math.round((whatsappUsage.current / whatsappUsage.limit) * 100)
          : 0,
        messages: messagesUsage.limit > 0
          ? Math.round((messagesUsage.current / messagesUsage.limit) * 100)
          : 0,
      },
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener uso del plan')
  }
}
