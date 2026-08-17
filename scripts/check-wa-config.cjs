const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const ws = await db.workspace.findFirst({
    where: { name: { contains: 'Vali' } },
    select: { id: true, name: true, slug: true, whatsappPhoneId: true, waChannel: true, whatsappToken: true }
  })
  console.log('Workspace:', JSON.stringify(ws, null, 2))

  // Check MetaApiConfig
  const meta = await db.metaApiConfig.findFirst({
    where: { workspaceId: ws.id }
  })
  console.log('\nMetaApiConfig:', meta ? JSON.stringify({ ...meta, accessToken: meta.accessToken?.slice(0,20)+'...' }, null, 2) : 'NONE')

  // Check workspace slug matches whatsappPhoneId
  console.log('\n=== Match check for Evolution webhook ===')
  console.log('whatsappPhoneId:', ws.whatsappPhoneId)
  console.log('slug:', ws.slug)
  console.log('id:', ws.id)
  console.log('Match slug:', ws.slug === ws.whatsappPhoneId)
  console.log('Match id:', ws.id === ws.whatsappPhoneId)
}
main().catch(e => console.error('Error:', e)).finally(() => db.$disconnect())
