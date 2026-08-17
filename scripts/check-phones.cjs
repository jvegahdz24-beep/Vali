const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const contacts = await db.contact.findMany({
    select: { id: true, firstName: true, lastName: true, phone: true }
  })
  contacts.forEach(c => {
    console.log(`${(c.phone || '').padEnd(35)} ${c.firstName} ${c.lastName || ''}`)
  })
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
