// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cleanup script for tenant isolation
// Deletes orphaned 'default' WhatsAppAuth, audits duplicate phones,
// and clears stale connectedPhone settings.
// Usage: node scripts/cleanup-tenant-isolation.mjs [--fix]
// ═══════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const FIX = process.argv.includes('--fix')

function normalize(p) {
  return (p || '').replace(/\D/g, '')
}

async function main() {
  console.log(`\n=== Tenant Isolation Cleanup (${FIX ? 'FIX MODE' : 'AUDIT ONLY'}) ===\n`)

  // 1. Orphaned 'default' WhatsAppAuth records
  const orphans = await prisma.whatsAppAuth.findMany({ where: { workspace: 'default' } })
  console.log(`[1] Orphaned WhatsAppAuth(workspace='default'): ${orphans.length}`)
  if (FIX && orphans.length > 0) {
    const r = await prisma.whatsAppAuth.deleteMany({ where: { workspace: 'default' } })
    console.log(`    Deleted ${r.count}`)
  }

  // 2. WhatsAppAuth records pointing to non-existent workspaces
  const allAuths = await prisma.whatsAppAuth.findMany()
  const orphanedAuths = []
  for (const a of allAuths) {
    const ws = await prisma.workspace.findUnique({ where: { id: a.workspace } })
    if (!ws) orphanedAuths.push(a)
  }
  console.log(`[2] WhatsAppAuth pointing to non-existent workspace: ${orphanedAuths.length}`)
  for (const a of orphanedAuths) console.log(`    - ${a.workspace}`)
  if (FIX && orphanedAuths.length > 0) {
    for (const a of orphanedAuths) {
      await prisma.whatsAppAuth.delete({ where: { workspace: a.workspace } })
    }
    console.log(`    Deleted ${orphanedAuths.length}`)
  }

  // 3. Workspace.settings.connectedPhone duplicates across tenants
  const workspaces = await prisma.workspace.findMany()
  const phoneMap = new Map() // phone → [{id,name}]
  for (const ws of workspaces) {
    try {
      const s = JSON.parse(ws.settings || '{}')
      if (s.connectedPhone) {
        const k = normalize(s.connectedPhone)
        if (!k) continue
        if (!phoneMap.has(k)) phoneMap.set(k, [])
        phoneMap.get(k).push({ id: ws.id, name: ws.name, phone: s.connectedPhone, updatedAt: ws.updatedAt })
      }
    } catch { /* ignore */ }
  }
  const dups = [...phoneMap.entries()].filter(([_, v]) => v.length > 1)
  console.log(`[3] Duplicate connectedPhone across workspaces: ${dups.length} phone(s)`)
  for (const [phone, ws] of dups) {
    console.log(`    phone=${phone}`)
    for (const w of ws) console.log(`      → ${w.name} (${w.id}) updatedAt=${w.updatedAt.toISOString()}`)
  }
  if (FIX && dups.length > 0) {
    for (const [_phone, ws] of dups) {
      // Keep newest, clear others
      const sorted = ws.sort((a, b) => b.updatedAt - a.updatedAt)
      for (let i = 1; i < sorted.length; i++) {
        const stale = sorted[i]
        const wRow = await prisma.workspace.findUnique({ where: { id: stale.id } })
        const s = JSON.parse(wRow.settings || '{}')
        delete s.connectedPhone
        await prisma.workspace.update({
          where: { id: stale.id },
          data: { settings: JSON.stringify(s) }
        })
        console.log(`    Cleared connectedPhone from ${stale.name} (${stale.id})`)
      }
    }
  }

  // 4. Audit: connectedPhone with no matching WhatsAppAuth record
  console.log(`\n[4] connectedPhone with no matching active WhatsAppAuth:`)
  let mismatchCount = 0
  const toClear = []
  for (const ws of workspaces) {
    try {
      const s = JSON.parse(ws.settings || '{}')
      if (!s.connectedPhone) continue
      const auth = await prisma.whatsAppAuth.findUnique({ where: { workspace: ws.id } })
      if (!auth) {
        mismatchCount++
        console.log(`    - ${ws.name} (${ws.id}) phone=${s.connectedPhone} has NO WhatsAppAuth row`)
        toClear.push(ws)
      }
    } catch { /* ignore */ }
  }
  if (mismatchCount === 0) console.log(`    (none)`)
  if (FIX && toClear.length > 0) {
    for (const ws of toClear) {
      const s = JSON.parse(ws.settings || '{}')
      delete s.connectedPhone
      await prisma.workspace.update({ where: { id: ws.id }, data: { settings: JSON.stringify(s) } })
      console.log(`    Cleared stale connectedPhone from ${ws.name} (${ws.id})`)
    }
  }

  console.log(`\n=== Done ===\n`)
  if (!FIX) console.log(`Run again with --fix to apply changes.\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
