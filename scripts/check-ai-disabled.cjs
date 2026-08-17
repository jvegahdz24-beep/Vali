const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: 'cmoxeuojz000k2rbsqxsqtybm' },
    select: { id: true, firstName: true, lastName: true, phone: true, customFields: true }
  });

  const disabled = contacts.filter(c => {
    try { const cf = JSON.parse(c.customFields || '{}'); return cf.aiDisabled === true; }
    catch { return false; }
  });

  console.log('Contacts with aiDisabled=true:', JSON.stringify(disabled.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName||''}`.trim(), phone: c.phone })), null, 2));
  console.log('Total with aiDisabled:', disabled.length);

  // Also check conversations with aiDisabled in metadata
  const convs = await prisma.conversation.findMany({
    where: { workspaceId: 'cmoxeuojz000k2rbsqxsqtybm' },
    select: { id: true, contactId: true, metadata: true }
  });
  const disabledConvs = convs.filter(c => {
    try { const m = JSON.parse(c.metadata || '{}'); return m.aiDisabled === true; }
    catch { return false; }
  });
  console.log('Conversations with aiDisabled=true:', disabledConvs.length);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
