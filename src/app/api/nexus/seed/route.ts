import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// POST /api/nexus/seed — Seed default agents only (clean setup)
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Create default agents
    const defaultAgents = [
      {
        name: 'NEXUS',
        type: 'nexus',
        description: 'Asistente general autónomo — pensamiento independiente y proactivo',
        personality: 'professional',
        capabilities: JSON.stringify(['chat', 'reasoning', 'memory', 'task-management', 'web-search', 'code-generation']),
        isActive: true,
      },
      {
        name: 'CODEX',
        type: 'coder',
        description: 'Especialista en desarrollo de software y código',
        personality: 'analytical',
        capabilities: JSON.stringify(['code-generation', 'debugging', 'code-review', 'architecture', 'documentation']),
        isActive: true,
      },
      {
        name: 'ANALYTICA',
        type: 'analyst',
        description: 'Analista de datos y business intelligence',
        personality: 'analytical',
        capabilities: JSON.stringify(['data-analysis', 'visualization', 'reporting', 'forecasting', 'insights']),
        isActive: true,
      },
      {
        name: 'ESCRITOR',
        type: 'writer',
        description: 'Creador de contenido y redacción profesional',
        personality: 'creative',
        capabilities: JSON.stringify(['writing', 'editing', 'translation', 'summarization', 'brainstorming']),
        isActive: true,
      },
    ]

    for (const agent of defaultAgents) {
      await db.nexusAgent.upsert({
        where: {
          id: `${session.userId}-${agent.type}`,
        },
        create: {
          id: `${session.userId}-${agent.type}`,
          userId: session.userId,
          ...agent,
          systemPrompt: '',
          config: '{}',
        },
        update: agent,
      }).catch(() => {
        // Ignore unique constraint — agent already exists with different ID
      })
    }

    return Response.json({
      success: true,
      message: 'Agentes iniciales creados'
    })
  } catch (error) {
    return errorResponse(error)
  }
}
