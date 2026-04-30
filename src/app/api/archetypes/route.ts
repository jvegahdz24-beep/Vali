// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Business Archetypes API
// GET /api/archetypes — List all 9 business archetypes
// POST /api/archetypes/apply — Apply archetype to workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { BUSINESS_ARCHETYPES } from '@/lib/archetypes'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET() {
  return NextResponse.json({
    success: true,
    archetypes: BUSINESS_ARCHETYPES.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      color: a.color,
      gradientFrom: a.gradientFrom,
      gradientTo: a.gradientTo,
      industry: a.industry,
      stageCount: a.pipelineStages.length,
      contactCount: a.contacts.length,
      dealCount: a.deals.length,
    })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { archetypeId, workspaceId } = body

    if (!archetypeId) {
      return NextResponse.json({ error: 'archetypeId es requerido' }, { status: 400 })
    }

    const archetype = BUSINESS_ARCHETYPES.find(a => a.id === archetypeId)
    if (!archetype) {
      return NextResponse.json({ error: 'Arquetipo no encontrado' }, { status: 404 })
    }

    const wsId = workspaceId || (await getDefaultWorkspace(session.userId))
    if (!wsId) {
      return NextResponse.json({ error: 'No se encontró workspace' }, { status: 400 })
    }

    // Update workspace industry
    await db.workspace.update({
      where: { id: wsId },
      data: { industry: archetype.industry },
    })

    // Delete existing pipeline stages and recreate
    const existingPipeline = await db.pipeline.findFirst({ where: { workspaceId: wsId, isActive: true } })
    if (existingPipeline) {
      await db.pipelineStage.deleteMany({ where: { pipelineId: existingPipeline.id } })
      await db.pipelineStage.createMany({
        data: archetype.pipelineStages.map((stage, index) => ({
          pipelineId: existingPipeline.id,
          name: stage.name,
          color: stage.color,
          order: index,
          probability: stage.probability,
          isWon: stage.isWon || false,
          isLost: stage.isLost || false,
        })),
      })
    }

    // Create archetype contacts
    const contactsCreated = []
    for (const contact of archetype.contacts) {
      const c = await db.contact.create({
        data: {
          workspaceId: wsId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email,
          source: contact.source,
          tags: contact.tags,
          leadScore: contact.leadScore,
          temperature: contact.temperature,
        },
      })
      contactsCreated.push(c.id)
    }

    // Create archetype deals
    for (const deal of archetype.deals) {
      const stage = await db.pipelineStage.findFirst({
        where: { pipelineId: existingPipeline!.id, name: deal.stageName },
      })
      await db.deal.create({
        data: {
          workspaceId: wsId,
          pipelineId: existingPipeline!.id,
          stageId: stage?.id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          status: deal.stageName.includes('Ganado') || deal.stageName.includes('Completado') || deal.stageName.includes('Activo') || deal.stageName.includes('Entregado') || deal.stageName.includes('VIP') || deal.stageName.includes('Cerrada') ? 'active' : 'active',
          source: deal.source,
          expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
    }

    return NextResponse.json({
      success: true,
      archetype: archetype.name,
      contactsCreated: contactsCreated.length,
      dealsCreated: archetype.deals.length,
      stagesCreated: archetype.pipelineStages.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

async function getDefaultWorkspace(userId: string): Promise<string | null> {
  const member = await db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: { select: { id: true, isActive: true } } },
  })
  const activeWs = member?.workspace?.isActive ? member : null
  return activeWs?.workspaceId || member?.workspaceId || null
}
