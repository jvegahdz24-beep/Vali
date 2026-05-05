// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Core Seed Script
// Creates: Demo user, workspace, pipeline with stages
// Idempotent: uses upsert where possible
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@valiautoflow.com'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo123456'

const PIPELINE_STAGES = [
  { name: 'Nuevo Contacto', color: '#6366f1', probability: 10, isWon: false, isLost: false },
  { name: 'Calificado', color: '#8b5cf6', probability: 40, isWon: false, isLost: false },
  { name: 'Propuesta', color: '#a855f7', probability: 60, isWon: false, isLost: false },
  { name: 'Negociación', color: '#ec4899', probability: 80, isWon: false, isLost: false },
  { name: 'Cerrado', color: '#10b981', probability: 100, isWon: true, isLost: false },
]

export async function seedCore() {
  console.log('[Core Seed] Starting...')
  console.log(`[Core Seed] Demo email: ${DEMO_EMAIL}`)

  // ─── 1. Create / update demo user ────────────────────────────
  const hashedPassword = bcrypt.hashSync(DEMO_PASSWORD, 12)

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      name: 'Demo User',
      password: hashedPassword,
      role: 'owner',
    },
    create: {
      name: 'Demo User',
      email: DEMO_EMAIL,
      password: hashedPassword,
      role: 'owner',
      timezone: 'America/Mexico_City',
      locale: 'es-MX',
    },
  })
  console.log(`[Core Seed] User: ${user.email} (${user.id})`)

  // ─── 2. Create / update workspace ────────────────────────────
  const workspaceSlug = 'valiautoflow-demo'

  const workspace = await prisma.workspace.upsert({
    where: { slug: workspaceSlug },
    update: {
      name: 'ValiAutoFlow Demo',
      ownerId: user.id,
      maxContacts: 500,
      maxAgents: 5,
      maxConversations: 200,
    },
    create: {
      name: 'ValiAutoFlow Demo',
      slug: workspaceSlug,
      ownerId: user.id,
      industry: 'services',
      plan: 'pro',
      maxContacts: 500,
      maxAgents: 5,
      maxConversations: 200,
      isActive: true,
      settings: JSON.stringify({
        businessHours: 'Lun-Sab 9:00-19:00',
        timezone: 'America/Mexico_City',
        currency: 'MXN',
        autoCreateDeals: true,
      }),
    },
  })
  console.log(`[Core Seed] Workspace: ${workspace.name} (${workspace.id})`)

  // ─── 3. Ensure WorkspaceMember with owner role ──────────────
  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: {
      role: 'owner',
    },
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: 'owner',
    },
  })
  console.log('[Core Seed] WorkspaceMember: owner role set')

  // ─── 4. Create default pipeline "Ventas" with stages ─────────
  const pipeline = await prisma.pipeline.upsert({
    where: {
      id: `${workspace.id}-ventas`, // won't match — use findFirst pattern
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'Ventas',
      description: 'Pipeline de ventas por defecto',
      order: 0,
      isActive: true,
    },
  }).catch(async () => {
    // Pipeline with that id doesn't exist, find by name+workspace
    const existing = await prisma.pipeline.findFirst({
      where: {
        workspaceId: workspace.id,
        name: 'Ventas',
      },
    })
    if (existing) {
      return existing
    }
    // Create fresh
    return prisma.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Ventas',
        description: 'Pipeline de ventas por defecto',
        order: 0,
        isActive: true,
      },
    })
  })

  // Create stages only if pipeline has none
  const existingStages = await prisma.pipelineStage.count({
    where: { pipelineId: pipeline.id },
  })

  if (existingStages === 0) {
    await prisma.pipelineStage.createMany({
      data: PIPELINE_STAGES.map((stage, index) => ({
        pipelineId: pipeline.id,
        name: stage.name,
        color: stage.color,
        order: index,
        probability: stage.probability,
        isWon: stage.isWon,
        isLost: stage.isLost,
      })),
    })
    console.log(`[Core Seed] Pipeline "Ventas" created with ${PIPELINE_STAGES.length} stages`)
  } else {
    console.log(`[Core Seed] Pipeline "Ventas" already has ${existingStages} stages`)
  }

  console.log('[Core Seed] Done.')
  return { user, workspace, pipeline }
}
