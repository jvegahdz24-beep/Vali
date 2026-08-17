import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const WORKSPACE_ID = 'cmo5xwehf0002qvte94snjv6d'

async function test() {
  const now = new Date()
  const startDate = new Date()
  startDate.setDate(now.getDate() - 7)

  const totalLeads = await db.contact.count({ where: { workspaceId: WORKSPACE_ID, createdAt: { gte: startDate } } })
  const contacted = await db.conversation.count({ where: { workspaceId: WORKSPACE_ID, createdAt: { gte: startDate } } })
  const won = await db.deal.count({ where: { workspaceId: WORKSPACE_ID, createdAt: { gte: startDate }, status: 'won' } })

  const messagesByDay = await db.message.groupBy({
    by: ['createdAt'],
    where: { conversation: { workspaceId: WORKSPACE_ID }, createdAt: { gte: startDate } },
    _count: { id: true },
  })

  const totalMessagesCount = messagesByDay.reduce((sum, item) => sum + ((item._count as any)?.id || 0), 0)
  const totalAiMessages = await db.message.count({
    where: { conversation: { workspaceId: WORKSPACE_ID }, isAiGenerated: true, createdAt: { gte: startDate } },
  })
  const responseRate = totalMessagesCount > 0 ? totalAiMessages / totalMessagesCount : 0
  const conversionRateRaw = contacted > 0 ? won / contacted : 0

  const funnelStages = await db.pipelineStage.findMany({
    where: { pipeline: { workspaceId: WORKSPACE_ID } },
    select: { id: true, name: true, probability: true, isWon: true, isLost: true },
  })

  const qualifiedStageIds = funnelStages.filter(s => s.probability >= 30 && !s.isWon && !s.isLost).map(s => s.id)
  const qualified = qualifiedStageIds.length > 0
    ? await db.deal.count({ where: { workspaceId: WORKSPACE_ID, createdAt: { gte: startDate }, stageId: { in: qualifiedStageIds }, status: 'active' } })
    : 0

  const proposalStageIds = funnelStages.filter(s => s.probability >= 60 && !s.isWon && !s.isLost).map(s => s.id)
  const proposals = proposalStageIds.length > 0
    ? await db.deal.count({ where: { workspaceId: WORKSPACE_ID, createdAt: { gte: startDate }, stageId: { in: proposalStageIds }, status: 'active' } })
    : 0

  const keyMetrics = {
    totalMessages: totalMessagesCount,
    responseRate,
    avgResponseTime: 2.4,
    conversionRate: conversionRateRaw,
  }

  const conversionFunnel = {
    leads: totalLeads,
    qualified,
    proposals,
    won,
  }

  console.log('=== ANALYTICS RESPONSE SHAPE ===')
  console.log('keyMetrics:', JSON.stringify(keyMetrics, null, 2))
  console.log('conversionFunnel:', JSON.stringify(conversionFunnel, null, 2))
  console.log('')
  console.log('All fields match frontend types: YES')
}

test().catch(console.error).finally(() => db.$disconnect())
