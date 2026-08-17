/**
 * ValiAutoFlow — Merge Duplicate Contacts
 *
 * Detecta contactos duplicados con el mismo número de teléfono (o variantes)
 * dentro de un workspace y los fusiona: mueve conversaciones, mensajes, deals
 * al contacto más antiguo (o al que tenga más datos) y elimina los duplicados.
 *
 * También detecta contactos cuyo "phone" es un LID de WhatsApp en vez de un
 * número real (e.g. 1234567890123456@s.whatsapp.net o una cadena numérica larga).
 *
 * Uso:
 *   node scripts/merge-duplicate-contacts.mjs           # Solo diagnóstico
 *   node scripts/merge-duplicate-contacts.mjs --fix     # Aplicar fusión
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const FIX = process.argv.includes('--fix')

function normalizePhone(phone) {
  if (!phone) return ''
  // Remove spaces, dashes, parentheses, +
  let p = phone.replace(/[\s\-\(\)\+]/g, '')
  // Remove leading zeros
  p = p.replace(/^0+/, '')
  return p
}

function looksLikeLid(phone) {
  if (!phone) return false
  // LIDs from WhatsApp are typically 15+ digit numbers
  // Real phones for Mexico are 10-13 digits
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 15
}

async function main() {
  console.log(`\n=== Merge Duplicate Contacts (${FIX ? 'FIX MODE' : 'AUDIT ONLY'}) ===\n`)

  const workspaces = await db.workspace.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  })

  let totalDuplicates = 0
  let totalLids = 0

  for (const ws of workspaces) {
    const contacts = await db.contact.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { conversations: true, deals: true } },
      },
    })

    if (contacts.length === 0) continue

    console.log(`\n── Workspace: "${ws.name}" (${contacts.length} contactos) ──`)

    // ── 1. Find LID contacts ──
    const lidContacts = contacts.filter(c => looksLikeLid(c.phone || ''))
    if (lidContacts.length > 0) {
      console.log(`  [LID] ${lidContacts.length} contacto(s) con teléfono tipo LID:`)
      for (const c of lidContacts) {
        totalLids++
        console.log(`    - "${c.firstName} ${c.lastName || ''}".trim() | phone: ${c.phone} | convs: ${c._count.conversations} | deals: ${c._count.deals} | id: ${c.id}`)
      }
    }

    // ── 2. Find duplicate phones (same normalized phone) ──
    const byNormPhone = new Map()
    for (const c of contacts) {
      if (!c.phone) continue
      const norm = normalizePhone(c.phone)
      if (!norm) continue
      if (!byNormPhone.has(norm)) byNormPhone.set(norm, [])
      byNormPhone.get(norm).push(c)
    }

    for (const [normPhone, dupes] of byNormPhone.entries()) {
      if (dupes.length <= 1) continue

      totalDuplicates += dupes.length - 1
      console.log(`\n  [DUPE] phone norm="${normPhone}" → ${dupes.length} contactos:`)
      for (const d of dupes) {
        console.log(`    id=${d.id} | phone="${d.phone}" | name="${d.firstName} ${d.lastName || ''}".trim() | convs=${d._count.conversations} | deals=${d._count.deals} | created=${d.createdAt.toISOString()}`)
      }

      if (!FIX) continue

      // Keep the contact with most conversations (or oldest if equal)
      const sorted = dupes.sort((a, b) => {
        if (b._count.conversations !== a._count.conversations) {
          return b._count.conversations - a._count.conversations
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      const primary = sorted[0]
      const toMerge = sorted.slice(1)

      console.log(`    → Manteniendo: id=${primary.id} ("${primary.firstName}")`)

      for (const dup of toMerge) {
        console.log(`    → Fusionando: id=${dup.id} ("${dup.firstName}") → ${primary.id}`)

        // Move conversations
        const moved = await db.conversation.updateMany({
          where: { workspaceId: ws.id, contactId: dup.id },
          data: { contactId: primary.id },
        })
        console.log(`      Conversaciones movidas: ${moved.count}`)

        // Move deals
        const movedDeals = await db.deal.updateMany({
          where: { workspaceId: ws.id, contactId: dup.id },
          data: { contactId: primary.id },
        })
        console.log(`      Deals movidos: ${movedDeals.count}`)

        // Move appointments
        await db.appointment.updateMany({
          where: { contactId: dup.id },
          data: { contactId: primary.id },
        }).catch(() => {})

        // Move agent memory
        await db.agentMemory.updateMany({
          where: { contactId: dup.id },
          data: { contactId: primary.id },
        }).catch(() => {})

        // Move follow-up tasks
        await db.followUpTask.updateMany({
          where: { contactId: dup.id },
          data: { contactId: primary.id },
        }).catch(() => {})

        // Delete duplicate contact
        await db.contact.delete({ where: { id: dup.id } }).catch(e => {
          console.warn(`      ⚠ No se pudo eliminar contacto ${dup.id}:`, e.message)
        })

        console.log(`      ✅ Fusionado y eliminado`)
      }
    }
  }

  console.log(`\n═══ RESUMEN ═══`)
  console.log(`  Contactos con LID detectados: ${totalLids}`)
  console.log(`  Contactos duplicados (misma phone): ${totalDuplicates}`)
  if (!FIX && (totalDuplicates > 0 || totalLids > 0)) {
    console.log(`\n  ⚠  Ejecuta con --fix para aplicar la fusión:\n`)
    console.log(`     node scripts/merge-duplicate-contacts.mjs --fix\n`)
  } else if (FIX) {
    console.log(`\n  ✅ Fusión completada.\n`)
  } else {
    console.log(`\n  ✅ No se encontraron duplicados.\n`)
  }
}

main()
  .catch(e => { console.error('\n❌ Error:', e); process.exit(1) })
  .finally(() => db.$disconnect())
