const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  console.log('\n═══════ WORKSPACE DATA COUNTS ═══════')
  const workspaces = await db.workspace.findMany({
    include: {
      _count: {
        select: {
          contacts: true,
          conversations: true,
          deals: true,
          pipelines: true,
          agents: true,
          automations: true,
          analyticsEvents: true,
        },
      },
      owner: { select: { email: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const ws of workspaces) {
    const c = ws._count
    console.log(`\n[${ws.name}] slug=${ws.slug}`)
    console.log(`  owner: ${ws.owner.email}`)
    console.log(`  contacts=${c.contacts} | conversations=${c.conversations} | deals=${c.deals}`)
    console.log(`  pipelines=${c.pipelines} | agents=${c.agents} | automations=${c.automations}`)
    console.log(`  analyticsEvents=${c.analyticsEvents}`)
  }

  console.log('\n═══════ CROSS-WORKSPACE DEAL CHECK ═══════')
  const deals = await db.deal.findMany({
    include: {
      pipeline: { select: { workspaceId: true, name: true } },
      contact: { select: { workspaceId: true, firstName: true, lastName: true } },
    },
  })
  let dealIssues = 0
  for (const d of deals) {
    if (d.workspaceId !== d.pipeline.workspaceId) {
      console.log(`❌ Deal "${d.title}" (${d.id}): deal.ws=${d.workspaceId} vs pipeline.ws=${d.pipeline.workspaceId}`)
      dealIssues++
    }
    if (d.contact && d.workspaceId !== d.contact.workspaceId) {
      console.log(`❌ Deal "${d.title}" (${d.id}): deal.ws=${d.workspaceId} vs contact.ws=${d.contact.workspaceId}`)
      dealIssues++
    }
  }
  if (dealIssues === 0) console.log('✅ All deals have consistent workspace data')

  console.log('\n═══════ CROSS-WORKSPACE CONVERSATION CHECK ═══════')
  const convs = await db.conversation.findMany({
    include: {
      contact: { select: { workspaceId: true } },
    },
  })
  let convIssues = 0
  for (const c of convs) {
    if (c.workspaceId !== c.contact.workspaceId) {
      console.log(`❌ Conv ${c.id}: conv.ws=${c.workspaceId} vs contact.ws=${c.contact.workspaceId}`)
      convIssues++
    }
  }
  if (convIssues === 0) console.log('✅ All conversations have consistent workspace data')

  console.log('\n═══════ WHATSAPPAUTH ═══════')
  const waAuths = await db.whatsAppAuth.findMany()
  console.log(`Total WhatsAppAuth: ${waAuths.length}`)
  for (const wa of waAuths) {
    const ws = await db.workspace.findUnique({ where: { id: wa.workspaceId }, select: { name: true, slug: true } })
    console.log(`  ws=${ws ? ws.name : 'UNKNOWN'} (${ws ? ws.slug : wa.workspaceId}) phone=${wa.connectedPhone || 'none'}`)
  }

  console.log('\n═══════ WORKSPACE MEMBERS ═══════')
  const members = await db.workspaceMember.findMany({
    include: {
      user: { select: { email: true } },
      workspace: { select: { name: true } },
    },
    orderBy: [{ workspaceId: 'asc' }],
  })
  let lastWs = ''
  for (const m of members) {
    if (m.workspace.name !== lastWs) {
      lastWs = m.workspace.name
      console.log(`  [${m.workspace.name}]`)
    }
    console.log(`    ${m.user.email} — ${m.role}`)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
