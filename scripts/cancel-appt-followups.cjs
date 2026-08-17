// Cancel all pending follow-up tasks for contacts who have confirmed upcoming appointments
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const now = new Date()

  // Get all future pending appointments
  const upcomingAppts = await db.appointment.findMany({
    where: { status: 'pending', date: { gte: now } },
    select: { contactId: true, date: true, title: true },
  })

  console.log(`\nFound ${upcomingAppts.length} upcoming appointment(s):`)
  upcomingAppts.forEach(a => console.log(`  contact:${a.contactId} | ${a.date.toISOString()} | ${a.title}`))

  if (upcomingAppts.length === 0) {
    console.log('Nothing to cancel.')
    await db.$disconnect()
    return
  }

  const contactIds = [...new Set(upcomingAppts.map(a => a.contactId))]
  console.log(`\nCancelling pending follow-up tasks for ${contactIds.length} contact(s)...`)

  const result = await db.followUpTask.updateMany({
    where: { contactId: { in: contactIds }, status: 'pending' },
    data: { status: 'cancelled' },
  })

  console.log(`✓ Cancelled ${result.count} pending follow-up task(s)`)

  // Verify
  const remaining = await db.followUpTask.count({
    where: { contactId: { in: contactIds }, status: 'pending' },
  })
  console.log(`Remaining pending tasks for those contacts: ${remaining}`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
