// Extract LID→phone mappings from WhatsApp auth session and update contacts
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Read the already-exported auth file
  const authPath = 'C:\\Users\\Administrador\\Desktop\\auth-full.txt'
  if (!fs.existsSync(authPath)) {
    console.error('auth-full.txt not found. Run the MySQL export first.')
    process.exit(1)
  }
  
  const rawData = fs.readFileSync(authPath, 'utf8')
  
  // Parse JSON from the raw data
  let authData
  try {
    authData = JSON.parse(rawData)
  } catch (e) {
    console.error('Failed to parse auth JSON:', e.message)
    console.log('First 200:', rawData.slice(0, 200))
    process.exit(1)
  }
  
  const keys = Object.keys(authData)
  console.log(`Auth data has ${keys.length} keys`)
  
  // Extract _reverse.json mappings: lid-mapping-<LID>_reverse.json → <phone>
  const lidToPhone = {}
  for (const key of keys) {
    const match = key.match(/^lid-mapping-(\d+)_reverse\.json$/)
    if (match) {
      const lid = match[1]
      const phone = authData[key]
      if (typeof phone === 'string') {
        lidToPhone[lid] = phone
      }
    }
  }
  
  // Also forward: lid-mapping-<phone>.json → <LID>
  const phoneToLid = {}
  for (const key of keys) {
    const match = key.match(/^lid-mapping-(\d+)\.json$/)
    if (match) {
      const phone = match[1]
      const lid = authData[key]
      if (typeof lid === 'string') {
        phoneToLid[phone] = lid
        lidToPhone[lid] = phone // reverse lookup
      }
    }
  }
  
  console.log(`\nFound ${Object.keys(lidToPhone).length} LID→phone mappings`)
  
  // Get all contacts with LID phones (14-15 digit numbers not standard)
  const contacts = await db.contact.findMany({
    select: { id: true, firstName: true, phone: true }
  })
  
  let updated = 0
  for (const contact of contacts) {
    const phone = contact.phone || ''
    if (!phone || phone === 'webchat_user') continue
    
    // Check if this phone is a LID (has a reverse mapping)
    if (lidToPhone[phone]) {
      const realPhone = lidToPhone[phone]
      console.log(`${contact.firstName}: ${phone} → ${realPhone}`)
      
      await db.contact.update({
        where: { id: contact.id },
        data: { phone: realPhone }
      })
      updated++
    } else {
      console.log(`${contact.firstName}: ${phone} (no mapping found)`)
    }
  }
  
  console.log(`\nUpdated ${updated} contacts.`)
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
