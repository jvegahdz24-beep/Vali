// Check conversations for real phone numbers vs LIDs stored in contacts
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const contacts = await db.contact.findMany({
    select: { id: true, firstName: true, phone: true },
    where: { NOT: { phone: 'webchat_user' } }
  })

  for (const c of contacts) {
    const convs = await db.conversation.findMany({
      where: { contactId: c.id },
      select: { externalId: true, metadata: true, channel: true },
      orderBy: { createdAt: 'asc' }
    })

    const externalIds = convs.map(cv => cv.externalId).filter(Boolean)
    const metaPhones = convs.map(cv => {
      try { const m = JSON.parse(cv.metadata || '{}'); return m.remoteJid || null } catch { return null }
    }).filter(Boolean)

    console.log(`\n${c.firstName}`)
    console.log(`  stored phone : ${c.phone}`)
    console.log(`  externalIds  : ${[...new Set(externalIds)].join(', ')}`)
    console.log(`  meta remoteJid: ${[...new Set(metaPhones)].join(', ')}`)
  }
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
