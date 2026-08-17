/**
 * ValiAutoFlow — Tenant Isolation DB Audit Script
 * Checks all models for cross-workspace data contamination
 */

import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  ValiAutoFlow — Tenant Isolation Audit')
  console.log('═══════════════════════════════════════════════\n')

  // 1. Count all data per workspace
  const workspaces = await db.workspace.findMany({
    include: {
      _count: {
        select: {
          contacts: true,
          conversations: true,
          deals: true,
          pipelines: true,
          agents: true,
          automations: true,
          analyticsEvents: true,
        },
      },
      owner: { select: { email: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log('📊 DATA PER WORKSPACE:')
  console.log('─────────────────────────────────────────────')
  for (const ws of workspaces) {
    const c = ws._count
    console.log(`\n[${ws.name}] (${ws.slug})`)
    console.log(`  Owner: ${ws.owner.email}`)
    console.log(`  Contacts: ${c.contacts}, Conversations: ${c.conversations}, Deals: ${c.deals}`)
    console.log(`  Pipelines: ${c.pipelines}, Agents: ${c.agents}, Automations: ${c.automations}`)
    console.log(`  AnalyticsEvents: ${c.analyticsEvents}`)
  }

  // 2. Check for Deals in wrong workspace (deal.workspaceId !== deal.pipeline.workspaceId)
  console.log('\n\n🔍 CHECK: Deals with pipeline from different workspace')
  console.log('─────────────────────────────────────────────')
  const allDeals = await db.deal.findMany({
    include: {
      pipeline: { select: { workspaceId: true, name: true } },
    },
  })
  const crossWorkspaceDeals = allDeals.filter(d => d.workspaceId !== d.pipeline.workspaceId)
  if (crossWorkspaceDeals.length === 0) {
    console.log('✅ No deals with cross-workspace pipelines')
  } else {
    console.log(`❌ FOUND ${crossWorkspaceDeals.length} cross-workspace deals:`)
    for (const d of crossWorkspaceDeals) {
      console.log(`  Deal "${d.title}" (${d.id}): deal.workspaceId=${d.workspaceId}, pipeline.workspaceId=${d.pipeline.workspaceId}`)
    }
  }

  // 3. Check for Deals in wrong workspace (deal.workspaceId !== deal.contact?.workspaceId)
  console.log('\n🔍 CHECK: Deals with contact from different workspace')
  console.log('─────────────────────────────────────────────')
  const dealsWithContact = await db.deal.findMany({
    where: { contactId: { not: null } },
    include: {
      contact: { select: { workspaceId: true, firstName: true, lastName: true } },
    },
  })
  const crossContactDeals = dealsWithContact.filter(d => d.contact && d.workspaceId !== d.contact.workspaceId)
  if (crossContactDeals.length === 0) {
    console.log('✅ No deals with cross-workspace contacts')
  } else {
    console.log(`❌ FOUND ${crossContactDeals.length} cross-workspace deal-contact links:`)
    for (const d of crossContactDeals) {
      console.log(`  Deal "${d.title}": deal.workspaceId=${d.workspaceId}, contact.workspaceId=${d.contact.workspaceId}`)
    }
  }

  // 4. Check for Conversations with contact from different workspace
  console.log('\n🔍 CHECK: Conversations with contact from different workspace')
  console.log('─────────────────────────────────────────────')
  const conversations = await db.conversation.findMany({
    include: {
      contact: { select: { workspaceId: true } },
    },
  })
  const crossConvs = conversations.filter(c => c.workspaceId !== c.contact?.workspaceId)
  if (crossConvs.length === 0) {
    console.log('✅ No conversations with cross-workspace contacts')
  } else {
    console.log(`❌ FOUND ${crossConvs.length} cross-workspace conversation-contact links:`)
    for (const c of crossConvs) {
      console.log(`  Conversation ${c.id}: conv.workspaceId=${c.workspaceId}, contact.workspaceId=${c.contact?.workspaceId}`)
    }
  }

  // 5. Check Pipeline Stages: stage.pipeline.workspaceId should match stage deals
  console.log('\n🔍 CHECK: PipelineStage consistency')
  console.log('─────────────────────────────────────────────')
  const stages = await db.pipelineStage.findMany({
    include: {
      pipeline: { select: { workspaceId: true } },
      deals: { select: { workspaceId: true, title: true } },
    },
  })
  let stageIssues = 0
  for (const stage of stages) {
    const wrongDeals = stage.deals.filter(d => d.workspaceId !== stage.pipeline.workspaceId)
    if (wrongDeals.length > 0) {
      stageIssues++
      console.log(`  ❌ Stage "${stage.name}" has ${wrongDeals.length} deals from wrong workspace`)
      for (const d of wrongDeals) {
        console.log(`    Deal "${d.title}": workspaceId=${d.workspaceId}`)
      }
    }
  }
  if (stageIssues === 0) console.log('✅ All pipeline stages have consistent workspace data')

  // 6. Check AgentMemory: agent.workspaceId should match contact.workspaceId
  console.log('\n🔍 CHECK: AgentMemory cross-workspace')
  console.log('─────────────────────────────────────────────')
  const memories = await db.agentMemory.findMany({
    include: {
      agent: { select: { workspaceId: true } },
      contact: { select: { workspaceId: true, firstName: true, lastName: true } },
    },
  })
  const crossMemories = memories.filter(m => m.agent.workspaceId !== m.contact.workspaceId)
  if (crossMemories.length === 0) {
    console.log('✅ No cross-workspace agent memories')
  } else {
    console.log(`❌ FOUND ${crossMemories.length} cross-workspace agent memories`)
    for (const m of crossMemories) {
      console.log(`  Memory for ${m.contact.firstName}: agent.workspaceId=${m.agent.workspaceId}, contact.workspaceId=${m.contact.workspaceId}`)
    }
  }

  // 7. Check LeadProfiles: should match contact.workspaceId
  console.log('\n🔍 CHECK: LeadProfile cross-workspace')
  console.log('─────────────────────────────────────────────')
  const leads = await db.leadProfile.findMany({
    include: {
      contact: { select: { workspaceId: true, firstName: true, lastName: true } },
    },
  })
  const crossLeads = leads.filter(l => l.workspaceId !== l.contact?.workspaceId)
  if (crossLeads.length === 0) {
    console.log('✅ No cross-workspace lead profiles')
  } else {
    console.log(`❌ FOUND ${crossLeads.length} cross-workspace lead profiles`)
    for (const l of crossLeads) {
      console.log(`  Lead ${l.id}: lead.workspaceId=${l.workspaceId}, contact.workspaceId=${l.contact?.workspaceId}`)
    }
  }

  // 8. Check Appointments: should match contact.workspaceId
  console.log('\n🔍 CHECK: Appointment cross-workspace')
  console.log('─────────────────────────────────────────────')
  const appointments = await db.appointment.findMany({
    include: {
      contact: { select: { workspaceId: true, firstName: true } },
    },
  })
  const crossAppts = appointments.filter(a => a.workspaceId !== a.contact?.workspaceId)
  if (crossAppts.length === 0) {
    console.log('✅ No cross-workspace appointments')
  } else {
    console.log(`❌ FOUND ${crossAppts.length} cross-workspace appointments`)
  }

  // 9. WhatsApp Auth check
  console.log('\n🔍 CHECK: WhatsAppAuth records')
  console.log('─────────────────────────────────────────────')
  const waAuths = await db.whatsAppAuth.findMany({
    include: {
      workspace: { select: { name: true, slug: true } },
    },
  })
  console.log(`  Total WhatsAppAuth records: ${waAuths.length}`)
  for (const wa of waAuths) {
    console.log(`  ✅ Workspace: ${wa.workspace.name} (${wa.workspace.slug}), Phone: ${wa.connectedPhone || 'not connected'}`)
  }

  // 10. WorkspaceMember — list members per workspace
  console.log('\n🔍 CHECK: WorkspaceMembers')
  console.log('─────────────────────────────────────────────')
  const members = await db.workspaceMember.findMany({
    include: {
      user: { select: { email: true } },
      workspace: { select: { name: true } },
    },
    orderBy: { workspaceId: 'asc' },
  })
  let lastWs = ''
  for (const m of members) {
    if (m.workspace.name !== lastWs) {
      lastWs = m.workspace.name
      console.log(`  [${m.workspace.name}]`)
    }
    console.log(`    ${m.user.email} — role: ${m.role}`)
  }

  console.log('\n═══════════════════════════════════════════════')
  console.log('  Audit Complete')
  console.log('═══════════════════════════════════════════════\n')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
