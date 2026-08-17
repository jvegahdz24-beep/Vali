import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// GET /api/marketing/audience?workspaceId=xxx
// Returns CRM-based audience data for marketing analysis
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''

    await requireWorkspace(workspaceId, session.userId)

    const [
      totalContacts,
      hotLeads,
      warmLeads,
      coldLeads,
      sourceBreakdown,
      tagCloud,
      reactivable,
      channels,
      archetypes,
      topObjections,
      conversionData,
    ] = await Promise.all([
      db.contact.count({ where: { workspaceId } }),
      db.leadProfile.count({ where: { workspaceId, temperature: 'hot' } }),
      db.leadProfile.count({ where: { workspaceId, temperature: 'warm' } }),
      db.leadProfile.count({ where: { workspaceId, temperature: 'cold' } }),

      // Source breakdown
      db.contact.groupBy({
        by: ['source'],
        where: { workspaceId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Sample tags from contacts for cloud
      db.contact.findMany({
        where: { workspaceId, NOT: { tags: '[]' } },
        select: { tags: true },
        take: 200,
      }),

      // Reactivable leads
      db.leadProfile.count({ where: { workspaceId, isReactivable: true } }),

      // Channel breakdown (conversations)
      db.conversation.groupBy({
        by: ['channel'],
        where: { workspaceId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Archetype distribution
      db.leadProfile.groupBy({
        by: ['archetype'],
        where: { workspaceId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Top objections / pain points
      db.leadProfile.findMany({
        where: { workspaceId, NOT: { mainObjection: null } },
        select: { mainObjection: true },
        take: 100,
      }),

      // Conversion funnel
      db.deal.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { id: true },
      }),
    ])

    // Build tag frequency map
    const tagFrequency: Record<string, number> = {}
    for (const c of tagCloud) {
      try {
        const tags = JSON.parse(c.tags) as string[]
        for (const t of tags) {
          tagFrequency[t] = (tagFrequency[t] || 0) + 1
        }
      } catch { /* ignore malformed */ }
    }
    const topTags = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }))

    // Objection frequency
    const objectionFreq: Record<string, number> = {}
    for (const lp of topObjections) {
      if (lp.mainObjection) {
        objectionFreq[lp.mainObjection] = (objectionFreq[lp.mainObjection] || 0) + 1
      }
    }
    const objectionList = Object.entries(objectionFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([objection, count]) => ({ objection, count }))

    const won = conversionData.find(d => d.status === 'won')?._count.id || 0
    const total = conversionData.reduce((sum, d) => sum + d._count.id, 0)
    const winRate = total > 0 ? Math.round((won / total) * 100) : 0

    return Response.json({
      overview: {
        totalContacts,
        hotLeads,
        warmLeads,
        coldLeads,
        reactivable,
        winRate,
        totalDeals: total,
        wonDeals: won,
      },
      sources: sourceBreakdown.map(s => ({ source: s.source, count: s._count.id })),
      channels: channels.map(c => ({ channel: c.channel, count: c._count.id })),
      archetypes: archetypes.map(a => ({ archetype: a.archetype, count: a._count.id })),
      topTags,
      topObjections: objectionList,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
