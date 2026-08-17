const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const WS = 'cmoxeuojz000k2rbsqxsqtybm';

  // Check contact lead scores
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: WS },
    select: { id: true, firstName: true, lastName: true, phone: true, leadScore: true, temperature: true, tags: true, customFields: true, status: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 15
  });

  console.log('\n=== CONTACTS (lead score & AI status) ===');
  for (const c of contacts) {
    let aiDisabled = false;
    try { aiDisabled = JSON.parse(c.customFields || '{}').aiDisabled === true; } catch {}
    const tags = JSON.parse(c.tags || '[]');
    console.log(`  ${c.firstName} ${c.lastName||''} | ${c.phone} | score=${c.leadScore} | temp=${c.temperature} | aiDisabled=${aiDisabled} | tags=[${tags.join(',')}]`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
