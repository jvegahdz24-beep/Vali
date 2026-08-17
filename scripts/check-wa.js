const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const convs = await p.conversation.count();
  const contacts = await p.contact.count();
  const msgs = await p.message.count();
  const workspaces = await p.workspace.findMany({ select: { id: true, name: true } });
  const waAuth = await p.whatsAppAuth.findMany({ select: { workspace: true } });
  console.log('Conversations:', convs, '| Contacts:', contacts, '| Messages:', msgs);
  console.log('Workspaces:', JSON.stringify(workspaces, null, 2));
  console.log('WA Auth records:', JSON.stringify(waAuth, null, 2));
  await p.$disconnect();
}
main().catch(console.error);
