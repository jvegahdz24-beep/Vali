// Migra las conversaciones/contactos creados erróneamente en ALEJANDRO Workspace
// hacia el workspace correcto (ValiAutoFlow), y deja ALEJANDRO limpio.
// Usage: node scripts/fix-cross-tenant-data.mjs [--fix]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const FIX = process.argv.includes('--fix')

const ALEJANDRO_WS   = 'cmoxmoiq400022rag7gn8u186'
const VALIAUTOFLOW_WS = 'cmoxeuojz000k2rbsqxsqtybm'

async function main() {
  console.log(`\n=== Cross-Tenant Data Fix (${FIX ? 'FIX MODE' : 'AUDIT ONLY'}) ===\n`)

  // Get all conversations in ALEJANDRO that don't belong there
  const convs = await prisma.conversation.findMany({
    where: { workspaceId: ALEJANDRO_WS },
    include: {
      contact: true,
      messages: { select: { id: true } },
    },
  })

  console.log(`Conversations in ALEJANDRO workspace: ${convs.length}`)

  for (const conv of convs) {
    const phone = conv.contact?.phone
    console.log(`\nConversation ${conv.id}:`)
    console.log(`  Contact: ${conv.contact?.firstName} ${conv.contact?.lastName} (${phone})`)
    console.log(`  Messages: ${conv.messages.length}`)
    console.log(`  Channel: ${conv.channel}  Status: ${conv.status}  Created: ${conv.createdAt.toISOString()}`)

    // Find matching contact in ValiAutoFlow
    let targetContact = null
    if (phone) {
      targetContact = await prisma.contact.findFirst({
        where: { workspaceId: VALIAUTOFLOW_WS, phone },
      })
    }

    if (targetContact) {
      console.log(`  → Matching contact found in ValiAutoFlow: ${targetContact.id} (${targetContact.firstName} ${targetContact.lastName})`)
      if (FIX) {
        // Re-assign conversation to ValiAutoFlow and correct contact
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { workspaceId: VALIAUTOFLOW_WS, contactId: targetContact.id },
        })
        console.log(`  ✅ Conversation moved to ValiAutoFlow → contact ${targetContact.id}`)

        // Delete the erroneous duplicate contact in ALEJANDRO (only if no other convs reference it)
        const remaining = await prisma.conversation.count({ where: { contactId: conv.contact.id } })
        if (remaining === 0) {
          await prisma.contact.delete({ where: { id: conv.contact.id } })
          console.log(`  ✅ Erroneous contact ${conv.contact.id} deleted from ALEJANDRO`)
        } else {
          console.log(`  ⚠ Contact ${conv.contact.id} still has ${remaining} conversations, skipping delete`)
        }
      }
    } else {
      console.log(`  → No matching contact in ValiAutoFlow — will create one and move conversation`)
      if (FIX) {
        // Create contact in ValiAutoFlow and move conversation
        const newContact = await prisma.contact.create({
          data: {
            workspaceId: VALIAUTOFLOW_WS,
            phone: conv.contact?.phone,
            firstName: conv.contact?.firstName,
            lastName: conv.contact?.lastName,
            email: conv.contact?.email,
            source: conv.contact?.source ?? 'whatsapp',
            status: conv.contact?.status ?? 'active',
          },
        })
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { workspaceId: VALIAUTOFLOW_WS, contactId: newContact.id },
        })
        console.log(`  ✅ Created new contact ${newContact.id} in ValiAutoFlow and moved conversation`)

        // Delete erroneous contact in ALEJANDRO
        const remaining = await prisma.conversation.count({ where: { contactId: conv.contact.id } })
        if (remaining === 0) {
          await prisma.contact.delete({ where: { id: conv.contact.id } })
          console.log(`  ✅ Erroneous contact deleted from ALEJANDRO`)
        }
      }
    }
  }

  // Final state check
  console.log('\n=== Final state ===')
  const alejandroConvs = await prisma.conversation.count({ where: { workspaceId: ALEJANDRO_WS } })
  const alejandroContacts = await prisma.contact.count({ where: { workspaceId: ALEJANDRO_WS } })
  const valiautoflowConvs = await prisma.conversation.count({ where: { workspaceId: VALIAUTOFLOW_WS } })
  const valiautoflowContacts = await prisma.contact.count({ where: { workspaceId: VALIAUTOFLOW_WS } })
  console.log(`ALEJANDRO   → conversations: ${alejandroConvs}, contacts: ${alejandroContacts}`)
  console.log(`ValiAutoFlow → conversations: ${valiautoflowConvs}, contacts: ${valiautoflowContacts}`)
  if (!FIX) console.log('\nRun again with --fix to apply changes.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
