const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const WS = 'cmoxeuojz000k2rbsqxsqtybm';

  // 1. Check pipelines
  const pipelines = await prisma.pipeline.findMany({
    where: { workspaceId: WS },
    include: { stages: { orderBy: { order: 'asc' } } }
  });
  console.log('\n=== PIPELINES ===');
  for (const p of pipelines) {
    console.log(`  [${p.isActive ? 'ACTIVE' : 'inactive'}] ${p.name} (${p.id})`);
    for (const s of p.stages) {
      console.log(`    Stage #${s.order}: "${s.name}" (${s.id})`);
    }
  }

  // 2. Check deals
  const deals = await prisma.deal.findMany({
    where: { workspaceId: WS },
    include: { stage: true, contact: { select: { firstName: true, lastName: true, phone: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
  console.log('\n=== RECENT DEALS (last 10) ===');
  for (const d of deals) {
    console.log(`  ${d.contact?.firstName} ${d.contact?.lastName||''} | Stage: ${d.stage?.name} | Score: ${d.value} | ${d.status} | ${d.updatedAt.toISOString().slice(0,16)}`);
  }

  // 3. Check agents
  const agents = await prisma.agent.findMany({
    where: { workspaceId: WS },
    select: { id: true, name: true, isActive: true, type: true }
  });
  console.log('\n=== AGENTS ===');
  for (const a of agents) {
    console.log(`  [${a.isActive ? 'ACTIVE' : 'inactive'}] ${a.name} (${a.type})`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
