import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const WORKSPACE_ID = 'cmo5xwehf0002qvte94snjv6d'

function randomPick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randomBetween(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function randomDate(daysBack: number): Date { return new Date(Date.now() - Math.random() * daysBack * 86400000) }

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

  // Create deals
  const SERVICES = ['Automatización', 'Consultoría IA', 'CRM', 'Desarrollo Web', 'Marketing Digital', 'Análisis de Datos']

  let dealCount = 0
  for (let i = 0; i < 12; i++) {
    const contact = contacts[i]
    if (!contact) continue
    const service = randomPick(SERVICES)
    let stageIdx: number, dealStatus: string
    if (contact.leadScore >= 85) { stageIdx = randomBetween(0, 1) === 0 ? 5 : 4; dealStatus = stageIdx === 5 ? 'won' : 'active' }
    else if (contact.leadScore >= 60) { stageIdx = randomBetween(3, 4); dealStatus = 'active' }
    else if (contact.leadScore >= 40) { stageIdx = randomBetween(2, 3); dealStatus = 'active' }
    else { stageIdx = randomBetween(0, 1); dealStatus = 'active' }

    await db.deal.create({
      data: {
        workspaceId: WORKSPACE_ID,
        pipelineId: pipeline.id,
        stageId: stages[stageIdx].id,
        contactId: contact.id,
        title: `${contact.firstName} ${contact.lastName} — ${service}`,
        value: randomBetween(5000, 50000),
        currency: 'MXN',
        description: `Interés en ${service}`,
        source: randomPick(['whatsapp', 'facebook', 'google', 'manual']),
        status: dealStatus,
        wonAt: dealStatus === 'won' ? randomDate(15) : null,
        expectedCloseDate: randomDate(30),
        order: randomBetween(0, 5),
        createdAt: randomDate(25),
      },
    })
    dealCount++
  }
  console.log(`${dealCount} deals created`)

  // Create agent logs
  for (let i = 0; i < 20; i++) {
    await db.agentLog.create({
      data: {
        agentId: randomPick(agents).id,
        conversationId: randomPick(conversations).id,
        inputMessage: 'Necesito información',
        outputMessage: 'Con gusto te ayudo',
        model: 'llama-3.3-70b-versatile',
        tokensUsed: randomBetween(200, 1500),
        latencyMs: randomBetween(500, 3000),
        confidence: randomBetween(60, 99) / 100,
        intent: randomPick(['greeting', 'question', 'buy_signal', 'objection']),
        action: randomPick(['question', 'educate', 'follow_up', 'close']),
        createdAt: randomDate(10),
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
