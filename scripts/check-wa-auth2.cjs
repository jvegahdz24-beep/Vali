const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  // Check all WhatsApp auth entries
  const auths = await db.whatsAppAuth.findMany({
    select: { workspace: true, updatedAt: true }
  })
  console.log('WhatsAppAuth entries:')
  auths.forEach(a => console.log(' workspace:', a.workspace, '| updated:', a.updatedAt?.toISOString()))

  // Check Jonathan specifically  
  const jv = await db.contact.findFirst({
    where: { workspaceId: 'cmoxeuojz000k2rbsqxsqtybm', firstName: { contains: 'Jonathan' } },
    include: {
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        include: { _count: { select: { messages: true } } }
      }
    }
  })
  console.log('\nJonathan Vega:', jv?.id, '| phone:', jv?.phone)
  jv?.conversations.forEach(c => console.log(' conv:', c.id.slice(-8), c.status, c.lastMessageAt?.toISOString().slice(0,16), 'msgs:', c._count.messages))
}
main().catch(e => console.error('Error:', e.message)).finally(() => db.$disconnect())
