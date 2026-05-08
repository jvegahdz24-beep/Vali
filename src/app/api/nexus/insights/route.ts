import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// GET /api/nexus/insights — Get AI-generated insights
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') || undefined

    const where: Record<string, unknown> = {
      userId: session.userId,
      // If workspaceId is provided, scope NEXUS insights to that workspace
      ...(workspaceId ? { workspaceId } : {}),
    }

    const insights = await db.nexusInsight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return Response.json({ insights })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/insights — Generate new insights from recent conversations
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Get recent conversations
    const recentConvs = await db.nexusConversation.findMany({
      where: { userId: session.userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        }
      }
    })

    if (recentConvs.length === 0) {
      return Response.json({ insights: [], message: 'No hay conversaciones para analizar' })
    }

    // Build conversation summary for AI analysis
    const convSummary = recentConvs.map(c => ({
      title: c.title,
      messages: c.messages.map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n'),
    })).join('\n---\n')

    const zai = await ZAI.create()
    const analysis = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Analiza las siguientes conversaciones del usuario y genera insights útiles.
Responde SOLO en formato JSON array con objetos: {type, title, content, confidence (0-1)}
Tipos: "pattern" (patrones de comportamiento), "suggestion" (sugerencias), "learning" (aprendizajes).
Genera máximo 5 insights. NO incluyas texto adicional.`
        },
        {
          role: 'user',
          content: convSummary
        }
      ],
      temperature: 0.4,
      max_tokens: 1000,
    })

    const content = analysis.choices[0]?.message?.content || '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)

    let newInsights = 0
    if (jsonMatch) {
      const insights = JSON.parse(jsonMatch[0]) as Array<{type: string; title: string; content: string; confidence: number}>

      for (const insight of insights) {
        if (insight.title && insight.content) {
          await db.nexusInsight.create({
            data: {
              userId: session.userId,
              type: insight.type || 'pattern',
              title: insight.title,
              content: insight.content,
              confidence: insight.confidence || 0.5,
            }
          })
          newInsights++
        }
      }
    }

    return Response.json({ newInsights, message: `Se generaron ${newInsights} insights` })
  } catch (error) {
    return errorResponse(error)
  }
}
