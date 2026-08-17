/**
 * Diagnose: check WhatsApp connection state and today's messages
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const wsId = 'cmoxeuojz000k2rbsqxsqtybm'

  // Check workspace WhatsApp state from settings
  const ws = await db.workspace.findUnique({
    where: { id: wsId },
    select: { settings: true, whatsappPhoneId: true, waChannel: true }
  })
  const settings = JSON.parse(ws?.settings || '{}')
  console.log('\n=== WhatsApp Session ===')
  console.log('Canal:', ws?.waChannel)
  console.log('Phone (phoneId):', ws?.whatsappPhoneId || '(none)')
  console.log('connectedPhone:', settings.connectedPhone || '(none)')
  console.log('waStatus:', settings.waStatus || 'unknown')
  console.log('waLastConnected:', settings.waLastConnected || 'unknown')

  // Check today's messages across all conversations
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  console.log('\n=== Mensajes de hoy (' + today.toLocaleDateString() + ') ===')
  const msgs = await db.message.findMany({
    where: {
      conversation: { workspaceId: wsId },
      createdAt: { gte: today }
    },
    orderBy: { createdAt: 'asc' },
    include: {
      conversation: {
        include: { contact: { select: { firstName: true, phone: true } } }
      }
    }
  })

  if (msgs.length === 0) {
    console.log('  ⚠ NINGÚN mensaje recibido hoy — posible desconexión de WhatsApp')
  } else {
    for (const m of msgs) {
      const contactName = m.conversation.contact?.firstName || 'Desconocido'
      const phone = m.conversation.contact?.phone || '?'
      console.log(`  ${m.direction} | ${m.createdAt.toISOString().slice(0,16)} | ${contactName} (${phone}) | ${(m.content || '').slice(0,60)}`)
    }
  }

  // Check last 24h
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const count24h = await db.message.count({
    where: { conversation: { workspaceId: wsId }, createdAt: { gte: last24h } }
  })
  console.log(`\nMensajes últimas 24h: ${count24h}`)
}

main().catch(e => console.error('Error:', e)).finally(() => db.$disconnect())
