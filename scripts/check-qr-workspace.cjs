const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  // Find workspace by ID in QR loop
  const qrWs = await db.workspace.findUnique({
    where: { id: 'cmoxmoiq400022rag7gn8u186' },
    select: { id: true, name: true, slug: true, waChannel: true, whatsappPhoneId: true }
  }).catch(() => null)
  console.log('Workspace QR loop:', JSON.stringify(qrWs, null, 2))

  // All workspaces using Baileys
  const baileys = await db.workspace.findMany({
    where: { waChannel: 'baileys', isActive: true },
    select: { id: true, name: true, slug: true, whatsappPhoneId: true }
  })
  console.log('\nWorkspaces usando Baileys:', baileys.length)
  baileys.forEach(w => console.log(' -', w.name, '|', w.id, '| phone:', w.whatsappPhoneId))

  // Check Amad's latest messages — see from which phone/channel they came
  const amadConv = await db.conversation.findFirst({
    where: { id: 'cmp5qgaow00032r5o1yj7wnf3' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 3 }
    }
  })
  console.log('\nAmad latest msgs:')
  amadConv?.messages.forEach(m => {
    console.log(' ', m.direction, m.createdAt.toISOString().slice(0,16), m.externalId?.slice(0,20), m.content?.slice(0,50))
  })
}
main().catch(e => console.error(e)).finally(() => db.$disconnect())
