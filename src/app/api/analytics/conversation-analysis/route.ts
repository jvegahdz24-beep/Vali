// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Conversation Analysis API
// GET /api/analytics/conversation-analysis?workspaceId=X
// Scans all conversations: cold leads, lost opportunities, reactivation candidates
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

    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1. Cold leads: last message > 3 days ago, status still active
    const coldLeads = (await db.conversation.findMany({
      where: {
        workspaceId: workspaceId!,
        status: 'active',
        lastMessageAt: { lte: threeDaysAgo },
        channel: 'whatsapp',
      },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })) as Array<any>

    // 2. Lost opportunities: high score contacts with no recent activity
    const lostOpportunities = (await db.contact.findMany({
      where: {
        workspaceId: workspaceId!,
        leadScore: { gte: 50 },
        lastMessageAt: { lte: sevenDaysAgo },
        status: { not: 'archived' },
      },
      include: {
        conversations: {
          where: { status: 'active' },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
          include: { messages: { orderBy: { createdAt: 'desc' }, take: 2 } },
        },
      },
      orderBy: { leadScore: 'desc' },
    })) as Array<any>

    // 3. Reactivation candidates: contacts with score 30-70, last activity 7-30 days ago
    const reactivationCandidates = (await db.contact.findMany({
      where: {
        workspaceId: workspaceId!,
        leadScore: { gte: 30, lte: 70 },
        lastMessageAt: { gte: thirtyDaysAgo, lte: sevenDaysAgo },
        status: { not: 'archived' },
      },
      include: {
        conversations: {
          where: { channel: 'whatsapp', status: 'active' },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { leadScore: 'desc' },
    })) as Array<any>

    // 4. Conversation health metrics
    const totalConversations = await db.conversation.count({
      where: { workspaceId: workspaceId!, channel: 'whatsapp' },
    })

    const activeConversations = await db.conversation.count({
      where: {
        workspaceId: workspaceId!,
        channel: 'whatsapp',
        status: 'active',
        lastMessageAt: { gte: threeDaysAgo },
      },
    })

    const messageCount = await db.message.count({
      where: {
        conversation: { workspaceId: workspaceId!, channel: 'whatsapp' },
      },
    })

    return Response.json({
      summary: {
        totalConversations,
        activeConversations,
        coldLeadsCount: coldLeads.length,
        lostOpportunitiesCount: lostOpportunities.length,
        reactivationCandidatesCount: reactivationCandidates.length,
        totalMessages: messageCount,
        healthScore: totalConversations > 0 ? Math.round((activeConversations / totalConversations) * 100) : 0,
      },
      coldLeads: coldLeads.map((c: any) => ({
        conversationId: c.id,
        contact: {
          id: c.contact?.id,
          name: `${c.contact?.firstName || ''} ${c.contact?.lastName || ''}`.trim(),
          phone: c.contact?.phone,
          leadScore: c.contact?.leadScore,
        },
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        daysSinceLastMessage: Math.floor((now.getTime() - c.lastMessageAt.getTime()) / (1000 * 60 * 60 * 24)),
        messageCount: (c.messages || []).length,
        suggestedAction: 'follow_up_3day',
      })),
      lostOpportunities: lostOpportunities.map((c: any) => ({
        contactId: c.id,
        contact: {
          name: `${c.firstName} ${c.lastName || ''}`.trim(),
          phone: c.phone,
          leadScore: c.leadScore,
          source: c.source,
        },
        lastMessageAt: c.lastMessageAt,
        daysSinceLastMessage: Math.floor(
          (now.getTime() - (c.lastMessageAt?.getTime() || now.getTime())) / (1000 * 60 * 60 * 24)
        ),
        conversationId: (c.conversations || [])[0]?.id,
        suggestedAction: 'reactivation_high_value',
      })),
      reactivationCandidates: reactivationCandidates.map((c: any) => ({
        contactId: c.id,
        contact: {
          name: `${c.firstName} ${c.lastName || ''}`.trim(),
          phone: c.phone,
          leadScore: c.leadScore,
        },
        lastMessageAt: c.lastMessageAt,
        daysSinceLastMessage: Math.floor(
          (now.getTime() - (c.lastMessageAt?.getTime() || now.getTime())) / (1000 * 60 * 60 * 24)
        ),
        suggestedAction: 'reactivation_warm',
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
