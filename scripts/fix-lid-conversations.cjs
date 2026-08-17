// Update conversation externalId from @lid to @s.whatsapp.net
// Uses the same LID-to-phone mappings from WhatsApp auth session
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const authPath = 'C:\\Users\\Administrador\\Desktop\\auth-full.txt'
  const rawData = fs.readFileSync(authPath, 'utf8')
  const authData = JSON.parse(rawData)

  // Build LID→phone map from auth data
  const lidToPhone = {}
  for (const [key, value] of Object.entries(authData)) {
    const rev = key.match(/^lid-mapping-(\d+)_reverse\.json$/)
    if (rev && typeof value === 'string') {
      lidToPhone[rev[1]] = value
      continue
    }
    const fwd = key.match(/^lid-mapping-(\d+)\.json$/)
    if (fwd && typeof value === 'string') {
      lidToPhone[value] = fwd[1]
    }
  }

  console.log(`LID mappings loaded: ${Object.keys(lidToPhone).length}`)

  // Get all conversations with @lid externalId
  const convs = await db.conversation.findMany({
    where: { externalId: { endsWith: '@lid' } },
    select: { id: true, externalId: true, metadata: true }
  })

  console.log(`Found ${convs.length} conversations with @lid externalId`)

  let updated = 0
  for (const conv of convs) {
    const lid = (conv.externalId || '').replace('@lid', '')
    const phone = lidToPhone[lid]
    if (!phone) {
      console.log(`  No mapping for ${lid}`)
      continue
    }
    const newExternalId = `${phone}@s.whatsapp.net`
    let newMeta = conv.metadata
    try {
      const meta = JSON.parse(conv.metadata || '{}')
      meta.remoteJid = newExternalId
      newMeta = JSON.stringify(meta)
    } catch { /* keep old metadata */ }

    await db.conversation.update({
      where: { id: conv.id },
      data: { externalId: newExternalId, metadata: newMeta }
    })
    console.log(`  ${conv.externalId} → ${newExternalId}`)
    updated++
  }

  console.log(`\nUpdated ${updated} conversations.`)
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect() })
