import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const members = await db.workspaceMember.findMany({
  include: {
    workspace: { select: { id: true, name: true, isActive: true } },
    user: { select: { email: true } }
  }
})
for (const m of members) {
  console.log(m.user.email, '|', m.workspaceId, '|', m.workspace.name, '| isActive:', m.workspace.isActive)
}

const convs = await db.conversation.findMany({ select: { workspaceId: true, channel: true } })
console.log('\nConversations:')
for (const c of convs) console.log(c.workspaceId, c.channel)

await db.$disconnect()
