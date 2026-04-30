// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Client Onboarding API
// POST /api/saas/onboarding — Complete client onboarding
// Updates workspace settings with business data and triggers
// optional WhatsApp connection setup.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { JHON_SYSTEM_PROMPT, PERSONALITY_PROMPTS } from '@/lib/constants'

// ─── Validation Schema ─────────────────────────────────────────

const onboardingSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
  whatsappPhone: z.string().optional(),
  businessDescription: z.string().max(2000).optional(),
  targetAudience: z.string().max(1000).optional(),
  products: z.array(z.string().max(200)).max(50).optional(),
  businessHours: z.string().max(200).optional(),
  preferredLanguage: z.enum(['es', 'en']).optional(),
})

// ─── POST Handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ─── Auth Check ──────────────────────────────────────────
    const session = await requireAuth(req)

    // ─── Validate Input ──────────────────────────────────────
    const body = await req.json()
    const parsed = onboardingSchema.safeParse(body)

    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => i.message).join('. ')
      return NextResponse.json(
        { error: errors, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const {
      workspaceId,
      whatsappPhone,
      businessDescription,
      targetAudience,
      products,
      businessHours,
      preferredLanguage,
    } = parsed.data

    // ─── Workspace Access Check ──────────────────────────────
    await requireWorkspace(workspaceId, session.userId)

    // ─── Get Current Workspace ───────────────────────────────
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        agents: {
          where: { personality: 'JHON', isActive: true },
          take: 1,
        },
      },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // ─── Update Workspace Settings ───────────────────────────
    const currentSettings = JSON.parse(workspace.settings || '{}')
    const saasSettings = currentSettings.saas || {}

    const updatedSaas = {
      ...saasSettings,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString(),
      businessDescription: businessDescription || saasSettings.businessDescription,
      targetAudience: targetAudience || saasSettings.targetAudience,
      products: products || saasSettings.products,
      businessHours: businessHours || saasSettings.businessHours || currentSettings.businessHours,
      preferredLanguage: preferredLanguage || saasSettings.preferredLanguage || 'es',
    }

    currentSettings.saas = updatedSaas
    currentSettings.businessHours = updatedSaas.businessHours

    // ─── Update JHON Agent Prompt with Business Context ──────
    let nextStep = 'dashboard'
    let whatsappSetupInitiated = false

    if (businessDescription || products || targetAudience) {
      // Personalize the JHON agent with the business info
      const jhonAgent = workspace.agents[0]
      if (jhonAgent) {
        let customizedPrompt = JHON_SYSTEM_PROMPT

        // Replace business context placeholders
        if (businessDescription) {
          customizedPrompt = customizedPrompt.replace(
            /\[EMPRESA\]/g,
            workspace.name
          )
          customizedPrompt += `\n\n# CONTEXTO DEL NEGOCIO\n${businessDescription}`
        }

        if (targetAudience) {
          customizedPrompt += `\n\n# AUDIENCIA OBJETIVO\n${targetAudience}`
        }

        if (products && products.length > 0) {
          customizedPrompt += `\n\n# PRODUCTOS/SERVICIOS\n${products.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
        }

        if (businessHours) {
          customizedPrompt += `\n\n# HORARIO DE ATENCIÓN\n${businessHours}`
        }

        try {
          await db.agent.update({
            where: { id: jhonAgent.id },
            data: {
              systemPrompt: customizedPrompt,
              description: `Agente de ventas personalizado para ${workspace.name}`,
            },
          })
        } catch (agentError) {
          console.warn('[SaaS Onboarding] Failed to update agent prompt:', agentError)
          // Non-fatal — onboarding succeeds even if agent update fails
        }
      }
    }

    // ─── WhatsApp Connection Setup ───────────────────────────
    if (whatsappPhone) {
      // Store the WhatsApp phone for later QR-code connection
      // The actual connection is handled by the WhatsApp worker
      await db.workspace.update({
        where: { id: workspaceId },
        data: {
          settings: JSON.stringify({
            ...currentSettings,
            pendingWhatsAppPhone: whatsappPhone,
          }),
        },
      })
      whatsappSetupInitiated = true
      nextStep = 'whatsapp_connect'
    } else {
      // Just update settings
      await db.workspace.update({
        where: { id: workspaceId },
        data: {
          settings: JSON.stringify(currentSettings),
          industry: currentSettings.industry || workspace.industry,
        },
      })
    }

    // ─── Determine Next Step ─────────────────────────────────
    if (whatsappSetupInitiated) {
      nextStep = 'whatsapp_connect'
    } else if (!whatsappPhone && !workspace.whatsappPhoneId) {
      nextStep = 'connect_whatsapp'
    } else {
      nextStep = 'explore_dashboard'
    }

    // ─── Success Response ───────────────────────────────────
    return NextResponse.json({
      success: true,
      nextStep,
      whatsappSetupInitiated,
      onboarding: {
        businessDescription: updatedSaas.businessDescription,
        targetAudience: updatedSaas.targetAudience,
        products: updatedSaas.products,
        businessHours: updatedSaas.businessHours,
        preferredLanguage: updatedSaas.preferredLanguage,
      },
    })
  } catch (error) {
    return errorResponse(error, 'Error al completar onboarding')
  }
}
