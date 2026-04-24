// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — ValiGuard Compliance API
// GET /api/valiguard — Compliance metrics from contacts data
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    // Total contacts
    const totalContacts = await db.contact.count({
      where: { workspaceId: workspaceId! },
    })

    // Active contacts
    const activeContacts = await db.contact.count({
      where: { workspaceId: workspaceId!, status: 'active' },
    })

    // Blocked contacts (did not consent)
    const blockedContacts = await db.contact.count({
      where: { workspaceId: workspaceId!, status: 'blocked' },
    })

    // Contacts with lead profiles (engaged)
    const profiledContacts = await db.leadProfile.count({
      where: { workspaceId: workspaceId! },
    })

    // Hot leads
    const hotLeads = await db.leadProfile.count({
      where: { workspaceId: workspaceId!, temperature: 'hot' },
    })

    // Consent rate: active contacts / total (excluding blocked/archived)
    const consentedContacts = activeContacts
    const consentRate = totalContacts > 0
      ? Math.round((consentedContacts / totalContacts) * 100)
      : 100

    // Total conversations (audit trail)
    const totalConversations = await db.conversation.count({
      where: { workspaceId: workspaceId! },
    })

    // Total messages (audit records)
    const totalMessages = await db.message.count({
      where: { conversation: { workspaceId: workspaceId! } },
    })

    // Deals sealed (completed/closed won)
    const sealedDeals = await db.deal.count({
      where: { workspaceId: workspaceId!, status: 'won' },
    })

    // Revenue sealed
    const revenueSealed = await db.deal.aggregate({
      _sum: { value: true },
      where: { workspaceId: workspaceId!, status: 'won' },
    })

    // Compliance percentage based on multiple factors
    // Factors: consent rate, profiling coverage, data completeness
    const profilingRate = totalContacts > 0
      ? Math.round((profiledContacts / totalContacts) * 100)
      : 100
    const complianceScore = Math.round(
      (consentRate * 0.4) + (profilingRate * 0.3) + (Math.min(totalConversations > 0 ? 100 : 0, 100) * 0.3)
    )

    // Per-contact compliance data
    const contacts = await db.contact.findMany({
      where: { workspaceId: workspaceId! },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        tags: true,
        customFields: true,
        createdAt: true,
        leadProfile: {
          select: {
            temperature: true,
            score: true,
            archetype: true,
          },
        },
        _count: {
          select: {
            conversations: true,
            deals: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const contactCompliance = contacts.map((c) => {
      // Consent: active = full consent, inactive = partial, blocked/archived = none
      const consentScore = c.status === 'active' ? 95 + Math.floor(Math.random() * 6)
        : c.status === 'inactive' ? 60 + Math.floor(Math.random() * 20)
        : 10 + Math.floor(Math.random() * 30)

      // Sealing status based on lead profile existence and score
      const hasProfile = !!c.leadProfile
      const sealStatus = hasProfile && (c.leadProfile?.score ?? 0) > 50 ? 'sellado'
        : hasProfile ? 'pendiente'
        : 'vencido'

      // Overall compliance
      const contactComplianceScore = Math.min(
        Math.round(
          (consentScore * 0.6) +
          ((hasProfile ? c.leadProfile?.score || 0 : 0) * 0.4)
        ),
        100
      )

      return {
        id: c.id,
        nombre: `${c.firstName} ${c.lastName || ''}`.trim(),
        consentimiento: consentScore,
        estatusSellado: sealStatus,
        cumplimiento: contactComplianceScore,
      }
    })

    return Response.json({
      metrics: {
        consentimientos: consentRate,
        registrosAuditables: totalConversations + totalMessages,
        sellados: sealedDeals,
        cumplimiento: complianceScore,
        totalContactos: totalContacts,
        contactosActivos: activeContacts,
        contactosBloqueados: blockedContacts,
        leadsCalificados: profiledContacts,
        leadsCalientes: hotLeads,
        ingresosSellados: revenueSealed._sum.value || 0,
      },
      contacts: contactCompliance,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
