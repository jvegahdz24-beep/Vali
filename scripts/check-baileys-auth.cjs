const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  // Check WhatsApp auth/keys for ValiAutoFlow (they may use Baileys too)
  const wsId = 'cmoxeuojz000k2rbsqxsqtybm'

  // Check any auth keys table
  const tables = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`.catch(() => [])
  console.log('Tables:', JSON.stringify(tables))

  // Or check via Prisma if there's a baileys auth model
  const waAuth = await db.whatsAppAuth.findMany({
    where: { workspaceId: wsId },
    select: { id: true, key: true, createdAt: true }
  }).catch(() => null)

  if (waAuth === null) {
    console.log('\nwhatsAppAuth model does not exist')
    // Try alternative model names
    const auth2 = await db.baileysCreds.findMany({ where: { workspaceId: wsId } }).catch(() => null)
    if (auth2 === null) console.log('baileysCreds model does not exist')
    else console.log('baileysCreds:', JSON.stringify(auth2.slice(0,3), null, 2))
  } else {
    console.log('\nWhatsApp auth entries:', waAuth.length)
    waAuth.slice(0,5).forEach(a => console.log(' -', a.key, '|', a.createdAt?.toISOString()))
  }

  // Check what workspace Jonathan is SUPPOSED to be chatting in
  console.log('\n=== Jonathan Vega details ===')
  const jv = await db.contact.findFirst({
    where: { workspaceId: wsId, firstName: { contains: 'Jonathan' } },
    include: {
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        include: { _count: { select: { messages: true } } }
      }
    }
  })
  console.log('Contact:', jv?.id, jv?.firstName, jv?.phone)
  console.log('Conversations:')
  jv?.conversations.forEach(c => {
    console.log(' ', c.id.slice(-8), c.status, c.lastMessageAt?.toISOString().slice(0,16), 'msgs:', c._count.messages)
  })
}
main().catch(e => console.error('Error:', e.message)).finally(() => db.$disconnect())
