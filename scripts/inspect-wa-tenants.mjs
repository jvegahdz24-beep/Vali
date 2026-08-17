// Inspección de estado multi-tenant WhatsApp
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

function norm(p) { return (p || '').replace(/\D/g, '') }

async function main() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, slug: true, isActive: true, settings: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const auths = await prisma.whatsAppAuth.findMany({
    select: { workspace: true, updatedAt: true, authData: true },
  })

  console.log('\n=== WORKSPACES ===')
  for (const w of workspaces) {
    let phone = ''
    try { phone = JSON.parse(w.settings || '{}').connectedPhone || '' } catch {}
    console.log(`- ${w.name.padEnd(50)} id=${w.id}  active=${w.isActive}  connectedPhone=${phone || '(none)'}`)
  }

  console.log('\n=== WHATSAPP AUTH RECORDS ===')
  for (const a of auths) {
    let me = null
    try {
      const data = JSON.parse(a.authData || '{}')
      me = data?.creds?.me?.id || null
    } catch {}
    const ws = workspaces.find(w => w.id === a.workspace)
    console.log(`- workspace=${a.workspace} (${ws?.name || 'UNKNOWN'})  me=${me}  updatedAt=${a.updatedAt.toISOString()}`)
  }

  console.log('\n=== CHECK: ¿algún teléfono de WhatsAppAuth coincide con el connectedPhone del workspace? ===')
  for (const a of auths) {
    let me = ''
    try { me = JSON.parse(a.authData || '{}')?.creds?.me?.id || '' } catch {}
    const phoneFromAuth = norm(me.split(':')[0])
    const ws = workspaces.find(w => w.id === a.workspace)
    let phoneFromWs = ''
    try { phoneFromWs = norm(JSON.parse(ws?.settings || '{}').connectedPhone || '') } catch {}
    const match = phoneFromAuth && phoneFromWs && phoneFromAuth === phoneFromWs
    console.log(`- ${ws?.name}:  auth_me=${phoneFromAuth || '(none)'}  ws.connectedPhone=${phoneFromWs || '(none)'}  ${match ? 'OK' : 'MISMATCH'}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
