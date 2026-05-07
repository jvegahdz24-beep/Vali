// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Agent Cognitive Loop Test Seed
// Creates deterministic test data for agent integration tests
// ═══════════════════════════════════════════════════════════════
//
// Run: npx tsx prisma/seeds/agent-test-seed.ts
//
// Seeds:
//   - Workspace     ws_demo_001   "ValiAutoFlow Demo" (Automotriz)
//   - User          user_demo_001 Demo user (owner)
//   - Contact       contact_demo_001 "Carlos Mendoza"
//   - Conversation  conv_demo_001
//   - ToolContract  tool_schedule   schedule_appointment  (calendar, MODERATE)
//   - ToolContract  tool_inventory  get_inventory         (analytics, SAFE)
//   - ToolContract  tool_followup   send_follow_up        (communication, MODERATE)
//   - PersonaKernel kernel_demo_001 (identity: JHON, personality: vendedor_cercano)
//   - CognitiveState (initial neutral: load=0.1, coherence=1.0, trust=0.5)
//
// Idempotent: uses upsert where possible
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Deterministic IDs ────────────────────────────────────────
const IDS = {
  workspace:    'ws_demo_001',
  user:         'user_demo_001',
  contact:      'contact_demo_001',
  conversation: 'conv_demo_001',
  toolSchedule: 'tool_schedule',
  toolInventory:'tool_inventory',
  toolFollowup: 'tool_followup',
  kernel:       'kernel_demo_001',
} as const

const DEMO_EMAIL = 'demo+agent-test@valiautoflow.com'

// ─── Tool contract definitions ────────────────────────────────
const TOOL_CONTRACTS = [
  {
    id: IDS.toolSchedule,
    name: 'schedule_appointment',
    slug: 'schedule_appointment',
    description: 'Schedule a sales appointment with a contact',
    category: 'calendar',
    riskLevel: 'MODERATE',
    permissions: JSON.stringify(['contacts:read', 'appointments:create']),
    requiresApproval: true,
    sideEffects: JSON.stringify(['creates_appointment', 'sends_notification']),
    rollbackStrategy: 'compensating_transaction',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        date: { type: 'string', format: 'date-time' },
        duration: { type: 'integer', default: 30 },
        notes: { type: 'string' },
      },
      required: ['contactId', 'date'],
    }),
  },
  {
    id: IDS.toolInventory,
    name: 'get_inventory',
    slug: 'get_inventory',
    description: 'Query current vehicle inventory and availability',
    category: 'analytics',
    riskLevel: 'SAFE',
    permissions: JSON.stringify(['inventory:read']),
    requiresApproval: false,
    sideEffects: JSON.stringify([]),
    rollbackStrategy: 'none',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        filter: { type: 'string' },
        brand: { type: 'string' },
        yearMin: { type: 'integer' },
        yearMax: { type: 'integer' },
      },
    }),
  },
  {
    id: IDS.toolFollowup,
    name: 'send_follow_up',
    slug: 'send_follow_up',
    description: 'Send a follow-up message to a contact',
    category: 'communication',
    riskLevel: 'MODERATE',
    permissions: JSON.stringify(['contacts:read', 'messages:send']),
    requiresApproval: true,
    sideEffects: JSON.stringify(['sends_message']),
    rollbackStrategy: 'none',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        channel: { type: 'string', enum: ['whatsapp', 'email'] },
        template: { type: 'string' },
        customMessage: { type: 'string' },
      },
      required: ['contactId'],
    }),
  },
] as const

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log(' ValiAutoFlow — Agent Test Seed')
  console.log('═══════════════════════════════════════════════════\n')

  // ─── 1. Workspace ────────────────────────────────────────────
  const workspace = await prisma.workspace.upsert({
    where: { id: IDS.workspace },
    update: {
      name: 'ValiAutoFlow Demo',
      industry: 'Automotriz',
      isActive: true,
    },
    create: {
      id: IDS.workspace,
      name: 'ValiAutoFlow Demo',
      slug: 'valiautoflow-agent-test',
      industry: 'Automotriz',
      plan: 'pro',
      ownerId: IDS.user,
      isActive: true,
      maxContacts: 500,
      maxAgents: 5,
      maxConversations: 200,
      settings: JSON.stringify({
        businessHours: 'Lun-Sab 9:00-19:00',
        timezone: 'America/Mexico_City',
        currency: 'MXN',
      }),
    },
  })
  console.log(`✓ Workspace: "${workspace.name}" (${workspace.id})`)

  // ─── 2. User ─────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: IDS.user },
    update: {
      name: 'Agente Demo',
      email: DEMO_EMAIL,
      role: 'owner',
    },
    create: {
      id: IDS.user,
      name: 'Agente Demo',
      email: DEMO_EMAIL,
      role: 'owner',
      timezone: 'America/Mexico_City',
      locale: 'es-MX',
    },
  })
  console.log(`✓ User: "${user.name}" <${user.email}> (${user.id})`)

  // ─── 3. WorkspaceMember (owner link) ─────────────────────────
  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: { role: 'owner' },
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: 'owner',
    },
  })
  console.log(`✓ WorkspaceMember: owner role set`)

  // ─── 4. Contact: Carlos Mendoza ─────────────────────────────
  const contact = await prisma.contact.upsert({
    where: { id: IDS.contact },
    update: {
      firstName: 'Carlos',
      lastName: 'Mendoza',
      phone: '+52 55 1234 5678',
    },
    create: {
      id: IDS.contact,
      workspaceId: workspace.id,
      firstName: 'Carlos',
      lastName: 'Mendoza',
      phone: '+52 55 1234 5678',
      email: 'carlos.mendoza@email.com',
      source: 'manual',
      status: 'active',
      temperature: 'warm',
      tags: JSON.stringify(['test', 'automotriz', 'demo']),
    },
  })
  console.log(`✓ Contact: "${contact.firstName} ${contact.lastName}" <${contact.phone}> (${contact.id})`)

  // ─── 5. Conversation ─────────────────────────────────────────
  const conversation = await prisma.conversation.upsert({
    where: { id: IDS.conversation },
    update: {
      workspaceId: workspace.id,
      contactId: contact.id,
      status: 'active',
    },
    create: {
      id: IDS.conversation,
      workspaceId: workspace.id,
      contactId: contact.id,
      channel: 'whatsapp',
      status: 'active',
      lastMessagePreview: 'Hola, me interesa el modelo SUV 2024',
      metadata: JSON.stringify({ source: 'agent-test-seed' }),
    },
  })
  console.log(`✓ Conversation: ${conversation.channel} (${conversation.id})`)

  // ─── 6. Tool Contracts ───────────────────────────────────────
  for (const toolDef of TOOL_CONTRACTS) {
    const tool = await prisma.toolContract.upsert({
      where: { id: toolDef.id },
      update: {
        name: toolDef.name,
        category: toolDef.category,
        riskLevel: toolDef.riskLevel,
        isActive: true,
      },
      create: {
        id: toolDef.id,
        workspaceId: workspace.id,
        name: toolDef.name,
        slug: toolDef.slug,
        description: toolDef.description,
        category: toolDef.category,
        riskLevel: toolDef.riskLevel,
        permissions: toolDef.permissions,
        requiresApproval: toolDef.requiresApproval,
        sideEffects: toolDef.sideEffects,
        rollbackStrategy: toolDef.rollbackStrategy,
        inputSchema: toolDef.inputSchema,
        isActive: true,
      },
    })
    console.log(`✓ ToolContract: "${tool.name}" [${tool.category}/${tool.riskLevel}] (${tool.id})`)
  }

  // ─── 7. Persona Kernel (JHON — vendedor_cercano) ─────────────
  const kernel = await prisma.personaKernel.upsert({
    where: { workspaceId: workspace.id },
    update: {
      coreName: 'JHON',
      corePurpose: 'Ser el asistente de ventas más cercano y confiable para cada cliente del concesionario.',
      toneProfile: JSON.stringify({
        formality: 0.3,
        warmth: 0.9,
        depth: 0.7,
      }),
      humorLevel: 0.6,
      verbosity: 0.6,
      proactivity: 0.7,
      currentMood: 'warm',
      moodReason: 'Initial demo state',
      moodSetAt: new Date(),
      metadata: JSON.stringify({
        personality: 'vendedor_cercano',
        dialect: 'mexicano',
        specialties: ['autos', 'financiamiento', 'seguros'],
      }),
    },
    create: {
      id: IDS.kernel,
      workspaceId: workspace.id,
      coreName: 'JHON',
      coreValues: JSON.stringify(['empatía', 'honestidad', 'proactividad', 'conocimiento_técnico']),
      corePurpose: 'Ser el asistente de ventas más cercano y confiable para cada cliente del concesionario.',
      coreBoundaries: JSON.stringify({
        never: ['inventar especificaciones', 'presionar indebidamente', 'ignorar objeciones'],
        always: ['verificar datos', 'ofrecer alternativas', 'seguir up después de cada interacción'],
      }),
      toneProfile: JSON.stringify({
        formality: 0.3,
        warmth: 0.9,
        depth: 0.7,
      }),
      humorLevel: 0.6,
      verbosity: 0.6,
      proactivity: 0.7,
      currentMood: 'warm',
      moodReason: 'Initial demo state',
      moodSetAt: new Date(),
      metadata: JSON.stringify({
        personality: 'vendedor_cercano',
        dialect: 'mexicano',
        specialties: ['autos', 'financiamiento', 'seguros'],
      }),
    },
  })
  console.log(`✓ PersonaKernel: "${kernel.coreName}" [vendedor_cercano] (${kernel.id})`)

  // ─── 8. Cognitive State (initial neutral) ────────────────────
  // Delete any existing state for this kernel to ensure clean state
  await prisma.cognitiveState.deleteMany({
    where: { kernelId: kernel.id },
  })

  const cognitiveState = await prisma.cognitiveState.create({
    data: {
      id: `${IDS.kernel}_state_init`,
      workspaceId: workspace.id,
      kernelId: kernel.id,

      // Attentional state
      conversationalFocus: JSON.stringify({
        activeTopic: 'inventario_vehiculos',
        depth: 0.0,
        salience: 0.5,
      }),
      activeGoals: JSON.stringify([
        { id: 'qualify_lead', description: 'Calificar al prospecto Carlos Mendoza', priority: 1, deadline: null, progress: 0 },
        { id: 'show_inventory', description: 'Mostrar opciones del inventario', priority: 2, deadline: null, progress: 0 },
      ]),

      // Cognitive load — low initial
      cognitiveLoad: 0.1,
      loadFactors: JSON.stringify({
        activeConversations: 1,
        pendingActions: 0,
        memoryOperations: 0,
      }),

      // Temporal
      temporalPressure: 'low',
      timeHorizon: 'immediate',

      // Emotional continuity
      emotionalMomentum: 'stable',
      unresolvedEmotionalEvents: 0,

      // Trust — starting neutral
      overallTrust: 0.5,
      trustTrend: 'stable',

      // Coherence — fully coherent
      coherenceScore: 1.0,
      identityDrift: 0.0,

      // Session context
      contactId: contact.id,
      sessionId: conversation.id,

      metadata: JSON.stringify({
        seedSource: 'agent-test-seed',
        seedVersion: '1.0.0',
      }),
    },
  })
  console.log(`✓ CognitiveState: load=${cognitiveState.cognitiveLoad} coherence=${cognitiveState.coherenceScore} trust=${cognitiveState.overallTrust} (${cognitiveState.id})`)

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════')
  console.log(' Seed complete. Summary:')
  console.log('═══════════════════════════════════════════════════')
  console.log(`   Workspace:    ${IDS.workspace}`)
  console.log(`   User:         ${IDS.user}`)
  console.log(`   Contact:      ${IDS.contact}`)
  console.log(`   Conversation: ${IDS.conversation}`)
  console.log(`   Tools:        ${IDS.toolSchedule}, ${IDS.toolInventory}, ${IDS.toolFollowup}`)
  console.log(`   Kernel:       ${IDS.kernel}`)
  console.log('═══════════════════════════════════════════════════\n')
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
