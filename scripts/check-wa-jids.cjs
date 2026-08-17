// Check WhatsApp session / contact resolution via messages
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Check messages for @s.whatsapp.net JIDs in externalId
  const convSample = await db.conversation.findMany({
    select: { externalId: true, contactId: true, channel: true },
    where: { channel: { in: ['whatsapp', 'WHATSAPP'] } },
    take: 30
  })
  console.log('=== Conversations (whatsapp) ===')
  convSample.forEach(c => console.log(c.externalId))

  // Check WaAccount table
  try {
    const accounts = await db.waAccount.findMany({
      select: { id: true, phone: true, workspaceId: true },
      take: 5
    })
    console.log('\n=== WaAccount ===')
    console.log(JSON.stringify(accounts, null, 2))
  } catch (e) {
    console.log('waAccount error:', e.message)
  }
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
