// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Minimal Seed Script
// Creates: User, Workspace, Agents, Pipeline (no demo contacts)
// Real leads (Jonathan, Sonia) come from WhatsApp only.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const db = new PrismaClient()

function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

const DEFAULT_PIPELINE_STAGES = [
  { name: 'Lead Nuevo', color: '#6366f1', probability: 10 },
  { name: 'Contactado', color: '#8b5cf6', probability: 20 },
  { name: 'Interesado', color: '#a855f7', probability: 40 },
  { name: 'Calificado', color: '#d946ef', probability: 60 },
  { name: 'Propuesta Enviada', color: '#ec4899', probability: 75 },
  { name: 'Cerrado Ganado', color: '#10b981', probability: 100 },
  { name: 'Cerrado Perdido', color: '#ef4444', probability: 0 },
]

async function main() {
  console.log('[Seed] Starting minimal seed...')

  const hashedPassword = hashPassword('valiflow2026')

  // 1. Create User
  let user = await db.user.findUnique({ where: { email: 'jvegahdz24@gmail.com' } })
  if (!user) {
    user = await db.user.create({
      data: {
        name: 'JVega',
        email: 'jvegahdz24@gmail.com',
        password: hashedPassword,
        role: 'owner',
        phone: '5512340000',
        timezone: 'America/Mexico_City',
        locale: 'es-MX',
      },
    })
    console.log(`[Seed] User created: ${user.email}`)
  } else {
    console.log(`[Seed] User exists: ${user.email}`)
  }

  // 2. Create Workspace
  let workspace = await db.workspace.findFirst({ where: { slug: 'valiflow-jvega' } })
  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        name: 'ValiAutoFlow',
        slug: 'valiflow-jvega',
        ownerId: user.id,
        industry: 'services',
        plan: 'pro',
        maxContacts: 500,
        maxAgents: 10,
        maxConversations: 200,
        whatsappPhoneId: 'demo-evolution-instance',
        settings: JSON.stringify({
          businessHours: 'Lun-Sab 9:00-19:00',
          timezone: 'America/Mexico_City',
          currency: 'MXN',
          defaultPersonality: 'JHON',
          autoCreateDeals: true,
          dealDefaultStage: 'Lead Nuevo',
          aiModel: 'GLM-4.5-Flash',
          aiProvider: 'groq',
          whatsappAutoReply: true,
          followUpEnabled: true,
          evolutionApiEnabled: true,
          dibLayerEnabled: true,
          businessName: 'ValiAutoFlow',
        }),
        members: {
          create: { userId: user.id, role: 'owner' },
        },
        subscription: {
          create: {
            plan: 'pro',
            status: 'active',
            provider: 'stripe',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date('2026-05-25T12:00:00.000Z'),
            amount: 999,
            currency: 'MXN',
            interval: 'monthly',
          },
        },
      },
    })
    console.log(`[Seed] Workspace created: ${workspace.name} (${workspace.id})`)
  } else {
    console.log(`[Seed] Workspace exists: ${workspace.name} (${workspace.id})`)
  }

  // 3. Create Agents
  const agentCount = await db.agent.count({ where: { workspaceId: workspace.id } })
  if (agentCount === 0) {
    await db.agent.createMany({
      data: [
        {
          workspaceId: workspace.id,
          name: 'JHON — Calificador',
          type: 'qualifier',
          description: 'Agente principal de calificacion. Detecta necesidades de automatizacion y califica prospectos.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 10,
          isActive: true,
          systemPrompt: 'jhon-calificador',
          config: JSON.stringify({
            hooks: [],
            steering: {
              maxQuestionsPerTurn: 2,
              maxTurnsWithoutProgress: 8,
              preferredLanguage: 'es',
              urgencyLevel: 'medium',
              autoQualifyAfter: 3,
              escalateAfter: 10,
            },
            fallbackBehavior: 'default_response',
          }),
        },
        {
          workspaceId: workspace.id,
          name: 'SELLER Pro — Cierre',
          type: 'sales',
          description: 'Agente especializado en cierre de ventas y manejo de objeciones avanzadas.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.8,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 8,
          isActive: true,
          systemPrompt: 'seller-pro',
          config: JSON.stringify({
            steering: {
              maxQuestionsPerTurn: 1,
              urgencyLevel: 'high',
              autoQualifyAfter: 2,
            },
            fallbackBehavior: 'transfer_human',
          }),
        },
        {
          workspaceId: workspace.id,
          name: 'FollowUp Bot',
          type: 'followup',
          description: 'Agente de seguimiento automatico que mantiene el contacto con prospectos.',
          model: 'groq',
          modelName: 'llama-3.1-8b-instant',
          temperature: 0.5,
          maxTokens: 2048,
          personality: 'friendly',
          priority: 5,
          isActive: true,
          systemPrompt: 'followup-amigable',
          config: JSON.stringify({
            steering: {
              maxQuestionsPerTurn: 1,
              urgencyLevel: 'low',
            },
          }),
        },
      ],
    })
    console.log('[Seed] 3 agents created')
  } else {
    console.log(`[Seed] ${agentCount} agents already exist`)
  }

  // 4. Create Pipeline
  const pipelineCount = await db.pipeline.count({ where: { workspaceId: workspace.id } })
  if (pipelineCount === 0) {
    await db.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Pipeline de Ventas — ValiAutoFlow',
        description: 'Pipeline principal de servicios de automatizacion',
        order: 0,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
            name: stage.name,
            color: stage.color,
            order: index,
            probability: stage.probability,
            isWon: stage.name.toLowerCase().includes('ganado'),
            isLost: stage.name.toLowerCase().includes('perdido'),
          })),
        },
      },
    })
    console.log('[Seed] Pipeline created with 7 stages')
  } else {
    console.log(`[Seed] ${pipelineCount} pipelines already exist`)
  }

  // 5. Create Webhook Configs
  const webhookCount = await db.webhookConfig.count({ where: { workspaceId: workspace.id } })
  if (webhookCount === 0) {
    await db.webhookConfig.createMany({
      data: [
        {
          workspaceId: workspace.id,
          channel: 'whatsapp',
          webhookUrl: '/api/webhooks/whatsapp',
          secret: 'valiflow-whatsapp-secret-2026',
          isActive: true,
        },
      ],
    })
    console.log('[Seed] Webhook config created')
  }

  // 6. Summary
  const stats = {
    workspaces: await db.workspace.count(),
    users: await db.user.count(),
    agents: await db.agent.count({ where: { workspaceId: workspace.id } }),
    pipelines: await db.pipeline.count({ where: { workspaceId: workspace.id } }),
    contacts: await db.contact.count({ where: { workspaceId: workspace.id } }),
    conversations: await db.conversation.count({ where: { workspaceId: workspace.id } }),
    messages: await db.message.count(),
  }

  console.log('\n[Seed] === COMPLETE ===')
  console.log(JSON.stringify(stats, null, 2))
  console.log('\n[Seed] No demo contacts created. Real leads come from WhatsApp.')
}

main()
  .catch((e) => { console.error('[Seed Error]', e); process.exit(1) })
  .finally(() => db.$disconnect())
