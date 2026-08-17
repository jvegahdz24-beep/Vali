// Desconecta todos los números de WhatsApp: borra WhatsAppAuth + limpia connectedPhone
// Usage: node scripts/disconnect-all-wa.mjs [--fix]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const FIX = process.argv.includes('--fix')

async function main() {
  console.log(`\n=== Disconnect All WhatsApp (${FIX ? 'FIX MODE' : 'AUDIT ONLY'}) ===\n`)

  const auths = await prisma.whatsAppAuth.findMany({ select: { id: true, workspace: true } })
  console.log(`WhatsAppAuth records: ${auths.length}`)
  for (const a of auths) console.log(`  - ${a.workspace}`)

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, settings: true },
  })
  const withPhone = workspaces.filter(w => {
    try { return !!JSON.parse(w.settings ?? '{}').connectedPhone } catch { return false }
  })
  console.log(`\nWorkspaces with connectedPhone: ${withPhone.length}`)
  for (const w of withPhone) {
    const phone = JSON.parse(w.settings).connectedPhone
    console.log(`  - ${w.name} (${w.id}): ${phone}`)
  }

  if (FIX) {
    if (auths.length > 0) {
      await prisma.whatsAppAuth.deleteMany({})
      console.log(`\n✅ Deleted ${auths.length} WhatsAppAuth record(s)`)
    }
    for (const w of withPhone) {
      const settings = JSON.parse(w.settings ?? '{}')
      delete settings.connectedPhone
      await prisma.workspace.update({
        where: { id: w.id },
        data: { settings: JSON.stringify(settings) },
      })
      console.log(`✅ Cleared connectedPhone from ${w.name}`)
    }
    if (auths.length === 0 && withPhone.length === 0) {
      console.log('\nNothing to clean — already disconnected.')
    }
  } else {
    console.log('\nRun again with --fix to apply disconnection.')
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
