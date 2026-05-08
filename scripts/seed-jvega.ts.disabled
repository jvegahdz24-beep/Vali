import { PrismaClient } from '@prisma/client'
import { randomPick, randomInt, randomDaysBack } from '../src/lib/seeded-random'

const db = new PrismaClient()
const WORKSPACE_ID = 'cmo5xwehf0002qvte94snjv6d'

async function seed() {
  // Get existing data
  const stages = await db.pipelineStage.findMany({
    where: { pipeline: { workspaceId: WORKSPACE_ID } },
    orderBy: { order: 'asc' }
  })
  const agents = await db.agent.findMany({ where: { workspaceId: WORKSPACE_ID } })
  const contacts = await db.contact.findMany({ where: { workspaceId: WORKSPACE_ID } })

  console.log('Stages:', stages.length, '| Agents:', agents.length, '| Contacts:', contacts.length)

  if (stages.length === 0) { console.log('No pipeline stages found!'); return }

  const pipeline = await db.pipeline.findFirst({ where: { workspaceId: WORKSPACE_ID } })
  if (!pipeline) { console.log('No pipeline found!'); return }

  const conversations = await db.conversation.findMany({ where: { workspaceId: WORKSPACE_ID } })

  // Create deals (deterministic)
  const SERVICES = ['Automatización', 'Consultoría IA', 'CRM', 'Desarrollo Web', 'Marketing Digital', 'Análisis de Datos']

  let dealCount = 0
  for (let i = 0; i < 12; i++) {
    const contact = contacts[i]
    if (!contact) continue
    const service = randomPick(SERVICES)
    let stageIdx: number, dealStatus: string
    if (contact.leadScore >= 85) { stageIdx = randomInt(0, 1) === 0 ? 5 : 4; dealStatus = stageIdx === 5 ? 'won' : 'active' }
    else if (contact.leadScore >= 60) { stageIdx = randomInt(3, 4); dealStatus = 'active' }
    else if (contact.leadScore >= 40) { stageIdx = randomInt(2, 3); dealStatus = 'active' }
    else { stageIdx = randomInt(0, 1); dealStatus = 'active' }

    await db.deal.create({
      data: {
        workspaceId: WORKSPACE_ID,
        pipelineId: pipeline.id,
        stageId: stages[stageIdx].id,
        contactId: contact.id,
        title: `${contact.firstName} ${contact.lastName} — ${service}`,
        value: randomInt(5000, 50000),
        currency: 'MXN',
        description: `Interés en ${service}`,
        source: randomPick(['whatsapp', 'facebook', 'google', 'manual']),
        status: dealStatus,
        wonAt: dealStatus === 'won' ? randomDaysBack(15) : null,
        expectedCloseDate: randomDaysBack(30),
        order: randomInt(0, 5),
        createdAt: randomDaysBack(25),
      },
    })
    dealCount++
  }
  console.log(`${dealCount} deals created`)

  // Create agent logs (deterministic)
  for (let i = 0; i < 20; i++) {
    await db.agentLog.create({
      data: {
        agentId: randomPick(agents).id,
        conversationId: randomPick(conversations).id,
        inputMessage: 'Necesito información',
        outputMessage: 'Con gusto te ayudo',
        model: 'llama-3.3-70b-versatile',
        tokensUsed: randomInt(200, 1500),
        latencyMs: randomInt(500, 3000),
        confidence: randomInt(60, 99) / 100,
        intent: randomPick(['greeting', 'question', 'buy_signal', 'objection']),
        action: randomPick(['question', 'educate', 'follow_up', 'close']),
        createdAt: randomDaysBack(10),
      },
    })
  }
  console.log('20 agent logs created')

  // Verify totals
  const [cContacts, cConvos, cMessages, cDeals, cAgents, cLogs] = await Promise.all([
    db.contact.count({ where: { workspaceId: WORKSPACE_ID } }),
    db.conversation.count({ where: { workspaceId: WORKSPACE_ID } }),
    db.message.count({ where: { conversation: { workspaceId: WORKSPACE_ID } } }),
    db.deal.count({ where: { workspaceId: WORKSPACE_ID } }),
    db.agent.count({ where: { workspaceId: WORKSPACE_ID } }),
    db.agentLog.count({ where: { agent: { workspaceId: WORKSPACE_ID } } }),
  ])
  console.log('\nFinal counts:')
  console.log('  Contacts:', cContacts)
  console.log('  Conversations:', cConvos)
  console.log('  Messages:', cMessages)
  console.log('  Deals:', cDeals)
  console.log('  Agents:', cAgents)
  console.log('  Agent Logs:', cLogs)
  console.log('\nDone!')
}

seed().catch(console.error).finally(() => db.$disconnect())
