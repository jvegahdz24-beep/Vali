const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const WS = 'cmoxeuojz000k2rbsqxsqtybm';

async function main() {
  const [followupTasks, activeAutomations, deals, contacts, agents, followupRules, pendingTasks] = await Promise.all([
    db.followUpTask.count({ where: { workspaceId: WS } }),
    db.automation.count({ where: { workspaceId: WS, isActive: true } }),
    db.deal.count({ where: { workspaceId: WS } }),
    db.contact.count({ where: { workspaceId: WS } }),
    db.agent.count({ where: { workspaceId: WS } }),
    db.followUpRule.count({ where: { workspaceId: WS, isActive: true } }),
    db.followUpTask.count({ where: { workspaceId: WS, status: 'pending' } }),
  ]);

  console.log(JSON.stringify({
    contacts,
    deals,
    activeAutomations,
    agents,
    activeFollowUpRules: followupRules,
    totalFollowUpTasks: followupTasks,
    pendingFollowUpTasks: pendingTasks,
  }, null, 2));

  // Recent deals
  const recentDeals = await db.deal.findMany({
    where: { workspaceId: WS },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, title: true, stage: { select: { name: true } }, status: true, createdAt: true }
  });
  console.log('\n=== DEALS ===');
  console.log(JSON.stringify(recentDeals, null, 2));

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
