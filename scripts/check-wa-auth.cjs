const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
db.whatsAppAuth.findMany().then(r => {
  console.log('WhatsAppAuth records:', r.length)
  r.forEach(w => console.log('  id:', w.id, '| workspace:', w.workspace, '| connectedPhone:', w.connectedPhone || 'none'))
}).finally(() => db.$disconnect())
