// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Daily Analytics Snapshot
// GET /api/cron/snapshot — Aggregate yesterday's metrics into DailyAnalytics
// Called once per day at midnight (00:05 UTC) by external cron
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  const cronH = req.headers.get('x-cron-secret')
  return auth === `Bearer ${cronSecret}` || cronH === cronSecret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Calculate yesterday's window
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const todayMidnight = new Date(yesterday)
  todayMidnight.setDate(todayMidnight.getDate() + 1)

  const startTime = Date.now()

  try {
    const workspaces = await db.workspace.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    let snapshots = 0

    for (const ws of workspaces) {
      try {
        // Aggregate metrics for yesterday
        const [
          totalMessages,
          aiMessages,
          newContacts,
          activeConversations,
          dealsCreated,
          dealsWon,
          pipelineValue,
          hotLeads,
          avgResponseMs,
        ] = await Promise.all([
          db.message.count({
            where: { conversation: { workspaceId: ws.id }, createdAt: { gte: yesterday, lt: todayMidnight } },
          }),
          db.message.count({
            where: {
              conversation: { workspaceId: ws.id },
              isAiGenerated: true,
              createdAt: { gte: yesterday, lt: todayMidnight },
            },
          }),
          db.contact.count({
            where: { workspaceId: ws.id, createdAt: { gte: yesterday, lt: todayMidnight } },
          }),
          db.conversation.count({
            where: { workspaceId: ws.id, status: 'active', updatedAt: { gte: yesterday, lt: todayMidnight } },
          }),
          db.deal.count({
            where: { workspaceId: ws.id, createdAt: { gte: yesterday, lt: todayMidnight } },
          }),
          db.deal.count({
            where: {
              workspaceId: ws.id,
              status: 'won',
              wonAt: { gte: yesterday, lt: todayMidnight },
            },
          }),
          db.deal.aggregate({
            where: { workspaceId: ws.id, status: 'active' },
            _sum: { value: true },
          }),
          db.contact.count({
            where: { workspaceId: ws.id, leadScore: { gte: 70 } },
          }),
          db.agentLog.aggregate({
            where: { conversation: { workspaceId: ws.id }, createdAt: { gte: yesterday, lt: todayMidnight } },
            _avg: { latencyMs: true },
          }),
        ])

        // Upsert the daily snapshot (idempotent)
        await db.dailyAnalytics.upsert({
          where: {
            workspaceId_date: {
              workspaceId: ws.id,
              date: yesterday,
            },
          },
          create: {
            workspaceId: ws.id,
            date: yesterday,
            totalMessages,
            aiMessages,
            newContacts,
            activeConversations,
            dealsCreated,
            dealsWon,
            pipelineValue: pipelineValue._sum.value ?? 0,
            hotLeads,
            avgResponseMs: Math.round(avgResponseMs._avg.latencyMs ?? 0),
          },
          update: {
            totalMessages,
            aiMessages,
            newContacts,
            activeConversations,
            dealsCreated,
            dealsWon,
            pipelineValue: pipelineValue._sum.value ?? 0,
            hotLeads,
            avgResponseMs: Math.round(avgResponseMs._avg.latencyMs ?? 0),
          },
        })

        snapshots++
      } catch (wsErr) {
        console.error(`[Snapshot] workspace ${ws.id} failed:`, wsErr)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      snapshotDate: yesterday.toISOString().split('T')[0],
      workspacesSnapped: snapshots,
      workspacesTotal: workspaces.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
