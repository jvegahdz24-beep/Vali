import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const workspaces = await db.workspace.findMany({
  select: { id: true, name: true, ownerId: true, isActive: true },
  orderBy: { createdAt: 'asc' }
})
for (const w of workspaces) {
  const user = await db.user.findUnique({ where: { id: w.ownerId }, select: { email: true } })
  console.log(w.name, '|', w.id, '| owner:', user?.email, '| isActive:', w.isActive)
}

console.log('\n-- WhatsAppAuth records --')
const auth = await db.whatsAppAuth.findMany({ select: { workspace: true, updatedAt: true } })
auth.forEach(a => console.log('workspace key:', a.workspace, '| updated:', a.updatedAt))

console.log('\n-- Conversations per workspace --')
const convs = await db.conversation.groupBy({ by: ['workspaceId', 'channel'], _count: true })
convs.forEach(c => console.log(c.workspaceId, c.channel, c._count))

await db.$disconnect()
