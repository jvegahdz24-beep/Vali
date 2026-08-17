/**
 * Switch ValiAutoFlow back to Baileys channel
 * The Meta API is still configured (demo mode, US test number) but messages
 * from Jonathan go to the old Baileys number 5219842084424, not the Meta test number.
 * Restoring waChannel='baileys' will auto-start the Baileys socket on next PM2 restart.
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const wsId = 'cmoxeuojz000k2rbsqxsqtybm'

  const ws = await db.workspace.findUnique({
    where: { id: wsId },
    select: { id: true, name: true, waChannel: true, whatsappPhoneId: true }
  })
  console.log('Current:', JSON.stringify(ws, null, 2))

  if (ws.waChannel === 'baileys') {
    console.log('\n✅ Already using Baileys. No change needed.')
    return
  }

  // Switch back to Baileys
  await db.workspace.update({
    where: { id: wsId },
    data: { waChannel: 'baileys' }
  })
  console.log('\n✅ Switched ValiAutoFlow back to Baileys.')
  console.log('\nNext steps:')
  console.log('  1. Run: .\\deploy.ps1   (or pm2 restart valiautoflow.com)')
  console.log('  2. The Baileys socket will auto-connect with stored credentials')
  console.log('  3. Jonathan can text 5219842084424 and messages will arrive again')
}

main().catch(e => console.error('Error:', e)).finally(() => db.$disconnect())
