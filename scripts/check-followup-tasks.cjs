// Check pending follow-up tasks and automation rules in production
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const workspaceId = 'cmoxeuojz000k2rbsqxsqtybm'

  // All pending follow-up tasks
  const tasks = await db.followUpTask.findMany({
    where: { workspaceId, status: 'pending' },
    orderBy: { scheduledAt: 'asc' },
  })
  // Enrich with contact names
  const contactIds = [...new Set(tasks.map(t => t.contactId))]
  const contacts = await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, phone: true } })
  const cMap = new Map(contacts.map(c => [c.id, c]))
  console.log('\n=== Pending FollowUpTasks ===', tasks.length)
  tasks.forEach(t => {
    const c = cMap.get(t.contactId)
    console.log(`  [${t.status}] contact:${c?.firstName}(${t.contactId.slice(-8)}) | scheduled:${t.scheduledAt} | rule:${t.ruleId}`)
  })

  // Recent sent tasks (last 24h)
  const sent = await db.followUpTask.findMany({
    where: { workspaceId, status: 'sent', sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { sentAt: 'desc' },
  })
  console.log('\n=== Sent in last 24h ===', sent.length)
  sent.forEach(t => {
    const c = cMap.get(t.contactId)
    console.log(`  contact:${c?.firstName}(${t.contactId.slice(-8)}) | sentAt:${t.sentAt} | rule:${t.ruleId}`)
  })

  // Active follow-up rules
  const rules = await db.followUpRule.findMany({
    where: { workspaceId, isActive: true }
  })
  console.log('\n=== Active FollowUpRules ===', rules.length)
  rules.forEach(r => {
    console.log(`  [${r.id}] "${r.name}" | trigger:${r.triggerType} | delay:${r.delayHours}h | msg:"${r.messageTemplate?.slice(0,60)}"`)
  })

  // Contacts with pending appointments
  const appts = await db.appointment.findMany({
    where: { workspaceId, status: 'pending', date: { gte: new Date() } },
    select: { contactId: true, date: true, title: true }
  })
  console.log('\n=== Future pending appointments ===', appts.length)
  appts.forEach(a => console.log(`  contact:${a.contactId} | ${a.date} | ${a.title}`))

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
