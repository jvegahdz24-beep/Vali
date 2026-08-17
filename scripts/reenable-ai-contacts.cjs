const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const WS = 'cmoxeuojz000k2rbsqxsqtybm';

  // Re-enable AI for real prospects (keep Amad disabled - internal/test)
  const toReEnable = [
    'cmphm02wx001q2rjgnkd7flfd', // Fer Robledo
    'cmphq6e5i00052rusofrf6nbt',  // PSICOTERAPIA
    'cmpq229hn001q2rh852kz8hv9',  // Cliniodent
  ];

  for (const id of toReEnable) {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) { console.log(`Contact ${id} not found`); continue; }

    let cf = {};
    try { cf = JSON.parse(contact.customFields || '{}'); } catch {}
    delete cf.aiDisabled;

    await prisma.contact.update({
      where: { id },
      data: { customFields: JSON.stringify(cf) }
    });
    console.log(`✅ Re-enabled AI for: ${contact.firstName} ${contact.lastName||''} (${contact.phone})`);
  }

  // Also re-enable AI at conversation level for these contacts
  for (const contactId of toReEnable) {
    const convs = await prisma.conversation.findMany({
      where: { workspaceId: WS, contactId },
      select: { id: true, metadata: true }
    });
    for (const conv of convs) {
      let meta = {};
      try { meta = JSON.parse(conv.metadata || '{}'); } catch {}
      if (meta.aiDisabled) {
        delete meta.aiDisabled;
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { metadata: JSON.stringify(meta) }
        });
        console.log(`  ↪ Also cleared conversation aiDisabled for conv ${conv.id}`);
      }
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
