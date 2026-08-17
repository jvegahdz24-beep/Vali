/**
 * ValiAutoFlow — WhatsApp Workspace Fix Script
 *
 * Problema: El número de WhatsApp de Jonathan (5219842084424) quedó asociado
 * al workspace de Viridiana. Este script:
 *   1. Muestra diagnóstico del estado actual
 *   2. Mueve el registro WhatsAppAuth al workspace correcto (jvega)
 *   3. Migra contactos/conversaciones/deals mal almacenados
 *   4. Limpia el workspace de Viridiana de datos de Jonathan
 *
 * Uso: node scripts/fix-whatsapp-workspace.mjs
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ─── Helpers ──────────────────────────────────────────────────

const log = (msg) => console.log(`  ${msg}`)
const sep = () => console.log('─'.repeat(60))

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ValiAutoFlow — Fix WhatsApp Workspace Association')
  console.log('═══════════════════════════════════════════════════════════\n')

  // ── STEP 1: Diagnóstico ──────────────────────────────────────
  console.log('PASO 1: Diagnóstico del estado actual')
  sep()

  const workspaces = await db.workspace.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: {
        select: { contacts: true, conversations: true, deals: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  })

  log(`Total workspaces encontrados: ${workspaces.length}`)
  console.log()

  for (const ws of workspaces) {
    let settings = {}
    try { settings = JSON.parse(ws.settings || '{}') } catch { /* ignore */ }

    log(`Workspace: "${ws.name}"`)
    log(`  ID:               ${ws.id}`)
    log(`  Slug:             ${ws.slug}`)
    log(`  Owner email:      ${ws.owner?.email || 'N/A'}`)
    log(`  Owner name:       ${ws.owner?.name || 'N/A'}`)
    log(`  whatsappPhoneId:  ${ws.whatsappPhoneId || '(vacío)'}`)
    log(`  connectedPhone:   ${settings.connectedPhone || '(vacío)'}`)
    log(`  isActive:         ${ws.isActive}`)
    log(`  Contacts:         ${ws._count.contacts}`)
    log(`  Conversations:    ${ws._count.conversations}`)
    log(`  Deals:            ${ws._count.deals}`)
    log(`  Created:          ${ws.createdAt.toISOString()}`)
    console.log()
  }

  const authRecords = await db.whatsAppAuth.findMany()
  log(`WhatsAppAuth records: ${authRecords.length}`)
  for (const auth of authRecords) {
    const ownerWs = workspaces.find(w => w.id === auth.workspace)
    log(`  workspace key: "${auth.workspace}" → ${ownerWs ? `"${ownerWs.name}" (${ownerWs.owner?.email})` : '⚠ NO WORKSPACE FOUND'}`)
    log(`  Updated: ${auth.updatedAt.toISOString()}`)
  }
  console.log()

  // ── STEP 2: Identificar workspace destino ──────────────────
  console.log('PASO 2: Identificando workspace ValiAutoFlow (Jonathan)')
  sep()

  // Jonathan's workspace is always identified by owner email or slug
  const jonathanWorkspace =
    workspaces.find(w => {
      const email = (w.owner?.email || '').toLowerCase()
      const slug = w.slug.toLowerCase()
      return email.includes('jvega') || email.includes('jvegahdz') ||
             slug.includes('valiflow') || slug.includes('valiautoflow')
    }) ||
    // If no match by email/slug, pick the one with the WhatsAppAuth record
    workspaces.find(w => authRecords.some(a => a.workspace === w.id))

  if (!jonathanWorkspace) {
    log('⚠ No se pudo identificar el workspace de Jonathan/ValiAutoFlow.')
    log('  Workspaces disponibles:')
    for (const ws of workspaces) {
      log(`    - "${ws.name}" (${ws.owner?.email}) ID: ${ws.id}`)
    }
    log('\n  Por favor edita el script y asigna manualmente:')
    log('  const JONATHAN_WS_ID = "AQUI_EL_ID_DE_VALIFLOW"')
    await db.$disconnect()
    return
  }

  log(`Workspace DESTINO: "${jonathanWorkspace.name}" (${jonathanWorkspace.owner?.email})`)
  log(`  ID: ${jonathanWorkspace.id}`)
  console.log()

  // ── STEP 3: Mover WhatsAppAuth ──────────────────────────────
  console.log('PASO 3: Actualizando WhatsAppAuth al workspace correcto')
  sep()

  for (const auth of authRecords) {
    if (auth.workspace !== jonathanWorkspace.id) {
      // Check if there's already an auth record for Jonathan's workspace
      const existing = await db.whatsAppAuth.findUnique({
        where: { workspace: jonathanWorkspace.id }
      })
      if (existing) {
        // Update Jonathan's record with the current auth data (more recent)
        await db.whatsAppAuth.update({
          where: { workspace: jonathanWorkspace.id },
          data: { authData: auth.authData }
        })
        // Delete the old record from Viridiana's workspace
        await db.whatsAppAuth.delete({ where: { workspace: auth.workspace } })
        log(`✅ Auth movida: "${auth.workspace}" → "${jonathanWorkspace.id}" (actualizada y eliminada la antigua)`)
      } else {
        // Move the record by updating the workspace key
        await db.whatsAppAuth.update({
          where: { workspace: auth.workspace },
          data: { workspace: jonathanWorkspace.id }
        })
        log(`✅ Auth movida: "${auth.workspace}" → "${jonathanWorkspace.id}"`)
      }
    } else {
      log(`✅ Auth ya apunta al workspace correcto (${auth.workspace})`)
    }
  }
  console.log()

  // ── STEP 4: Limpiar whatsappPhoneId mal asignados y guardar en Jonathan ──
  console.log('PASO 4: Verificando whatsappPhoneId en todos los workspaces')
  sep()

  const targetPhone = '5219842084424'

  // Clear the phone from any workspace that isn't Jonathan's
  for (const ws of workspaces) {
    if (ws.id === jonathanWorkspace.id) continue
    if (ws.whatsappPhoneId && ws.whatsappPhoneId.includes(targetPhone)) {
      await db.workspace.update({
        where: { id: ws.id },
        data: { whatsappPhoneId: null, whatsappToken: null }
      })
      log(`✅ Limpiado whatsappPhoneId de "${ws.name}" (era: ${ws.whatsappPhoneId})`)
    }
  }

  // Store phone in Jonathan's workspace settings
  let jonathanSettings = {}
  try { jonathanSettings = JSON.parse(jonathanWorkspace.settings || '{}') } catch { /* ignore */ }
  jonathanSettings.connectedPhone = targetPhone
  await db.workspace.update({
    where: { id: jonathanWorkspace.id },
    data: { settings: JSON.stringify(jonathanSettings) }
  })
  log(`✅ Guardado connectedPhone="${targetPhone}" en settings de Jonathan's workspace`)
  console.log()

  // ── STEP 5: Migrar contactos de múltiples workspaces → Jonathan ─
  // Migra contactos WhatsApp de Viridiana, ALEJANDRO, y cualquier otro
  // workspace que no sea ValiAutoFlow (Jonathan)
  console.log('PASO 5: Migrando contactos de WhatsApp mal almacenados → ValiAutoFlow')
  sep()

  const otherWorkspaceIds = workspaces
    .filter(w => w.id !== jonathanWorkspace.id)
    .map(w => w.id)

  let moved = 0, merged = 0, skipped = 0

  for (const wsId of otherWorkspaceIds) {
    const wsName = workspaces.find(w => w.id === wsId)?.name || wsId
    const waContacts = await db.contact.findMany({
      where: { workspaceId: wsId, source: 'whatsapp' },
      include: { conversations: true }
    })
    if (waContacts.length === 0) continue
    log(`Procesando workspace "${wsName}" — ${waContacts.length} contacto(s) WhatsApp`)

    for (const contact of waContacts) {
      if (!contact.phone) {
        log(`  ⚠ Contacto sin teléfono (id: ${contact.id}) — omitido`)
        skipped++
        continue
      }

      const existing = await db.contact.findUnique({
        where: { contact_workspace_phone_key: { workspaceId: jonathanWorkspace.id, phone: contact.phone } }
      })

      if (existing) {
        log(`  🔀 ${contact.phone} ya existe en ValiAutoFlow — fusionando`)

        // Move conversations (note: deals link to contacts, not conversations)
        await db.conversation.updateMany({
          where: { workspaceId: wsId, contactId: contact.id },
          data: { workspaceId: jonathanWorkspace.id, contactId: existing.id }
        })

        // Move deals that belong to the duplicate contact
        await db.deal.updateMany({
          where: { workspaceId: wsId, contactId: contact.id },
          data: { workspaceId: jonathanWorkspace.id, contactId: existing.id }
        })

        // Move LeadProfile
        const lp = await db.leadProfile.findUnique({ where: { contactId: contact.id } }).catch(() => null)
        if (lp) {
          const existingLP = await db.leadProfile.findUnique({ where: { contactId: existing.id } }).catch(() => null)
          if (!existingLP) {
            await db.leadProfile.update({ where: { contactId: contact.id }, data: { contactId: existing.id } }).catch(() => {})
          } else {
            await db.leadProfile.delete({ where: { contactId: contact.id } }).catch(() => {})
          }
        }

        // Move Appointments
        await db.appointment.updateMany({
          where: { contactId: contact.id },
          data: { workspaceId: jonathanWorkspace.id, contactId: existing.id }
        }).catch(() => {})

        // Move AgentMemory
        await db.agentMemory.updateMany({
          where: { contactId: contact.id },
          data: { contactId: existing.id }
        }).catch(() => {})

        await db.contact.delete({ where: { id: contact.id } })
        log(`    ✅ Fusionado`)
        merged++
      } else {
        log(`  ➡ Moviendo ${contact.phone} (${contact.firstName}) → ValiAutoFlow`)

        // Move conversations and deals first
        await db.conversation.updateMany({
          where: { workspaceId: wsId, contactId: contact.id },
          data: { workspaceId: jonathanWorkspace.id }
        })
        await db.deal.updateMany({
          where: { workspaceId: wsId, contactId: contact.id },
          data: { workspaceId: jonathanWorkspace.id }
        })
        await db.leadProfile.updateMany({
          where: { contactId: contact.id, workspaceId: wsId },
          data: { workspaceId: jonathanWorkspace.id }
        }).catch(() => {})
        await db.appointment.updateMany({
          where: { contactId: contact.id, workspaceId: wsId },
          data: { workspaceId: jonathanWorkspace.id }
        }).catch(() => {})

        await db.contact.update({
          where: { id: contact.id },
          data: { workspaceId: jonathanWorkspace.id }
        })
        log(`    ✅ Movido`)
        moved++
      }
    }
  }

  log(`\nResumen de migración de contactos:`)
  log(`  Movidos:    ${moved}`)
  log(`  Fusionados: ${merged}`)
  log(`  Omitidos:   ${skipped}`)
  console.log()

  // ── STEP 6: Migrar AnalyticsEvents de otros workspaces → Jonathan ──
  console.log('PASO 6: Migrando AnalyticsEvents → ValiAutoFlow')
  sep()

  for (const wsId of otherWorkspaceIds) {
    const wsName = workspaces.find(w => w.id === wsId)?.name || wsId
    const movedEvents = await db.analyticsEvent.updateMany({
      where: { workspaceId: wsId },
      data: { workspaceId: jonathanWorkspace.id }
    })
    if (movedEvents.count > 0) {
      log(`✅ AnalyticsEvents de "${wsName}" migrados: ${movedEvents.count}`)
    }
  }
  console.log()

  // ── STEP 7: Resultado final ──────────────────────────────────
  console.log('PASO 7: Verificación final')
  sep()

  const finalCounts = await db.workspace.findMany({
    include: { _count: { select: { contacts: true, conversations: true, deals: true } } },
    orderBy: { createdAt: 'asc' }
  })

  for (const ws of finalCounts) {
    const label = ws.id === jonathanWorkspace.id ? ' ← DESTINO' : ''
    log(`"${ws.name}"${label}: contacts=${ws._count.contacts}, conversations=${ws._count.conversations}, deals=${ws._count.deals}`)
  }

  const authFinal = await db.whatsAppAuth.findMany()
  console.log()
  log(`WhatsAppAuth records: ${authFinal.length}`)
  for (const a of authFinal) {
    const ownerWs = finalCounts.find(w => w.id === a.workspace)
    log(`  workspace: "${a.workspace}" → ${ownerWs?.name || '?'}`)
  }
  console.log()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  ✅ Migración completada.')
  console.log('  IMPORTANTE: Reinicia el servidor Next.js para que los')
  console.log('  cambios en memoria (workspaceId en el manager) tomen efecto.')
  console.log('═══════════════════════════════════════════════════════════\n')

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('\n❌ Error en el script:', e)
  await db.$disconnect()
  process.exit(1)
})
