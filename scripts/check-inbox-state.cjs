const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const ws = await db.workspace.findFirst({
    where: { slug: { contains: 'vali' } },
    select: { id: true, name: true, plan: true, settings: true }
  })
  console.log('Workspace:', ws.name, '| id:', ws.id, '| plan:', ws.plan)

  const settings = JSON.parse(ws.settings || '{}')
  console.log('connectedPhone:', settings.connectedPhone || '(none)')

  const convs = await db.conversation.findMany({
    where: { workspaceId: ws.id },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, phone: true, customFields: true } },
      _count: { select: { messages: true } }
    }
  })

  console.log('\nTotal conversaciones:', convs.length)
  for (const c of convs) {
    const cf = JSON.parse(c.contact?.customFields || '{}')
    const aiDisabled = cf.aiDisabled === true ? '[AI DESACTIVADA]' : ''
    const lastMsgDate = c.lastMessageAt ? c.lastMessageAt.toISOString().slice(0, 16) : 'nunca'
    console.log(
      'conv:', c.id.slice(-8),
      '| status:', c.status,
      '| canal:', c.channel,
      '| lastMsg:', lastMsgDate,
      '| msgs:', c._count.messages,
      '| contact:', c.contact?.firstName, c.contact?.lastName || '', '(' + (c.contact?.phone || 'sin tel') + ')',
      aiDisabled
    )
  }

  // Check monthly AI usage
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const aiCount = await db.message.count({
    where: {
      conversation: { workspaceId: ws.id },
      isAiGenerated: true,
      createdAt: { gte: monthStart }
    }
  })
  console.log('\nMensajes IA este mes:', aiCount)
}

main().catch(e => console.error('Error:', e)).finally(() => db.$disconnect())
