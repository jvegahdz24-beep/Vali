// Check the WA auth state in the database for contact mappings
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Find the workspace with whatsapp configured
  const ws = await db.workspace.findFirst({ select: { id: true, name: true } })
  console.log('Workspace:', ws)

  // Check WhatsApp auth table
  try {
    const raw = await db.$queryRaw`SHOW TABLES LIKE '%whatsapp%'`
    console.log('WA Tables:', JSON.stringify(raw))
  } catch(e) { console.log('query error:', e.message) }

  try {
    const raw = await db.$queryRaw`SHOW TABLES LIKE '%auth%'`
    console.log('Auth Tables:', JSON.stringify(raw))
  } catch(e) { console.log('query error:', e.message) }

  try {
    const raw = await db.$queryRaw`SHOW TABLES`
    console.log('All Tables:', JSON.stringify(raw))
  } catch(e) { console.log('query error:', e.message) }
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
