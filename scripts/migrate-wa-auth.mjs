// Migrates WhatsAppAuth key from 'default' to the actual workspace ID
// Determines owner by: most recent user to connect WhatsApp (ALEJANDRO = dani.loco5@hotmail.com)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const ALEJANDRO_WS = 'cmoxmoiq400022rag7gn8u186' // ALEJANDRO Workspace (dani.loco5)

const authRecord = await db.whatsAppAuth.findUnique({ where: { workspace: 'default' } })
if (authRecord) {
  await db.whatsAppAuth.update({
    where: { workspace: 'default' },
    data: { workspace: ALEJANDRO_WS }
  })
  console.log('Migrated WhatsAppAuth workspace: default →', ALEJANDRO_WS)
} else {
  const existing = await db.whatsAppAuth.findUnique({ where: { workspace: ALEJANDRO_WS } })
  if (existing) {
    console.log('Auth already bound to ALEJANDRO Workspace:', ALEJANDRO_WS)
  } else {
    console.log('No WhatsAppAuth record found with key "default"')
  }
}

// Show final state
const all = await db.whatsAppAuth.findMany({ select: { workspace: true, updatedAt: true } })
console.log('Final WhatsAppAuth records:', JSON.stringify(all))

await db.$disconnect()
