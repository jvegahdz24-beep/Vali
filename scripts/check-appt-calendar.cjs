const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Check recent appointments
  const appts = await db.appointment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } }
  })
  console.log('\n=== Recent appointments ===')
  if (appts.length === 0) {
    console.log('  (none)')
  } else {
    appts.forEach(a => {
      console.log(`  [${a.status}] ${a.title} — ${a.date} — contact: ${a.contact?.firstName || 'none'} ${a.contact?.lastName || ''} — ws: ${a.workspaceId}`)
    })
  }

  // Check conversations with apptProposal in metadata
  const convs = await db.conversation.findMany({
    where: { metadata: { contains: 'apptProposal' } },
    select: { id: true, metadata: true, workspaceId: true, contactId: true }
  })
  console.log('\n=== Conversations with pending apptProposal ===')
  if (convs.length === 0) {
    console.log('  (none)')
  } else {
    convs.forEach(c => {
      let meta = {}
      try { meta = JSON.parse(c.metadata) } catch {}
      console.log(`  conv: ${c.id} | contact: ${c.contactId} | ws: ${c.workspaceId}`)
      console.log(`  proposal:`, meta.apptProposal)
    })
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
