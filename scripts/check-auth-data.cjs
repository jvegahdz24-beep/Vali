// Check whatsappauth table for contact/session data
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const cols = await db.$queryRaw`DESCRIBE whatsappauth`
  console.log('Columns:', JSON.stringify(cols))

  const rows = await db.$queryRaw`SELECT id, LENGTH(authData) as authLen FROM whatsappauth LIMIT 5`
  console.log('Rows:', JSON.stringify(rows))

  const first = await db.$queryRaw`SELECT authData FROM whatsappauth LIMIT 1`
  if (first[0]?.authData) {
    const raw = first[0].authData.toString()
    try {
      const parsed = JSON.parse(raw)
      const keys = Object.keys(parsed)
      console.log('\nTop keys:', keys)
      for (const k of keys) {
        if (/contact|lid|phone/i.test(k)) {
          console.log('Key', k, ':', JSON.stringify(parsed[k]).slice(0, 300))
        }
      }
      if (parsed.files) {
        console.log('\nFile keys:', Object.keys(parsed.files).slice(0, 30))
      }
    } catch(e) {
      console.log('First 500:', raw.slice(0, 500))
    }
  }
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
