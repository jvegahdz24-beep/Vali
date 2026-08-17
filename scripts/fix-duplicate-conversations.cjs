/**
 * Fix duplicate conversations — close old ones, keep the most recent per contact
 * Usage: node scripts/fix-duplicate-conversations.cjs [--fix]
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const FIX = process.argv.includes('--fix')

async function main() {
  console.log(`\n=== Fix Duplicate Conversations (${FIX ? 'FIX MODE' : 'AUDIT ONLY'}) ===\n`)

  const workspaceId = 'cmoxeuojz000k2rbsqxsqtybm' // ValiAutoFlow

  // Get all active conversations grouped by contactId + channel
  const convs = await db.conversation.findMany({
    where: { workspaceId },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true } },
      _count: { select: { messages: true } }
    }
  })

  // Group by contactId + channel
  const groups = {}
  for (const c of convs) {
    const key = `${c.contactId}::${c.channel}`
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }

  let dupGroups = 0
  for (const [key, list] of Object.entries(groups)) {
    if (list.length <= 1) continue
    dupGroups++
    const name = `${list[0].contact?.firstName} ${list[0].contact?.lastName || ''}`.trim()
    console.log(`\nContacto: ${name} (${list[0].contact?.phone}) | canal: ${list[0].channel}`)
    list.forEach((c, i) => {
      console.log(`  [${i === 0 ? 'KEEP' : 'CLOSE'}] id: ${c.id} | status: ${c.status} | lastMsg: ${c.lastMessageAt?.toISOString().slice(0,16)} | msgs: ${c._count.messages}`)
    })

    if (!FIX) continue

    // Keep the first (most recent lastMessageAt), close/archive the rest
    const toClose = list.slice(1)
    for (const old of toClose) {
      if (old.status === 'closed') continue
      await db.conversation.update({
        where: { id: old.id },
        data: { status: 'closed' }
      })
      console.log(`    -> Cerrada: ${old.id}`)
    }
  }

  // Show last 10 messages from Jonathan's most recent conversation
  console.log('\n\n=== Últimos mensajes de Jonathan Vega (conv más reciente) ===')
  const jvConv = await db.conversation.findFirst({
    where: { workspaceId, contact: { phone: '5219844498785' } },
    orderBy: { lastMessageAt: 'desc' }
  })
  if (jvConv) {
    console.log('Conversación ID:', jvConv.id, '| status:', jvConv.status, '| lastMsg:', jvConv.lastMessageAt?.toISOString().slice(0, 16))
    const msgs = await db.message.findMany({
      where: { conversationId: jvConv.id },
      orderBy: { createdAt: 'desc' },
      take: 15
    })
    for (const m of msgs) {
      console.log(`  ${m.direction} | ${m.createdAt.toISOString().slice(0,16)} | ${(m.content || '').slice(0,80)}`)
    }
  }

  if (!FIX && dupGroups > 0) {
    console.log(`\n  Ejecuta con --fix para cerrar las conversaciones antiguas:`)
    console.log(`  node scripts/fix-duplicate-conversations.cjs --fix\n`)
  } else if (FIX) {
    console.log('\n  Listo. Recarga el inbox para ver la conversacion correcta.\n')
  }
}

main().catch(e => console.error('Error:', e)).finally(() => db.$disconnect())
