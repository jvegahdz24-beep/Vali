// Inspecciona conversaciones/contactos/mensajes en un workspace
// Usage: node scripts/inspect-workspace-data.mjs <workspaceId>
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const workspaceId = process.argv[2]
if (!workspaceId) {
  console.error('Usage: node scripts/inspect-workspace-data.mjs <workspaceId>')
  process.exit(1)
}

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } })
  console.log(`\n=== Workspace: ${ws?.name ?? 'NOT FOUND'} (${workspaceId}) ===\n`)

  const contacts = await prisma.contact.count({ where: { workspaceId } })
  const conversations = await prisma.conversation.count({ where: { workspaceId } })
  const messages = await prisma.message.count({ where: { conversation: { workspaceId } } })

  console.log(`Contacts:      ${contacts}`)
  console.log(`Conversations: ${conversations}`)
  console.log(`Messages:      ${messages}`)

  if (conversations > 0) {
    const convs = await prisma.conversation.findMany({
      where: { workspaceId },
      select: { id: true, channel: true, status: true, createdAt: true, contact: { select: { phone: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    console.log('\nRecent conversations:')
    for (const c of convs) {
      console.log(`  - [${c.channel}] ${c.contact?.firstName ?? ''} ${c.contact?.lastName ?? ''} (${c.contact?.phone ?? 'no phone'}) status=${c.status} createdAt=${c.createdAt.toISOString()}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
