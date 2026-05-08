import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import { extractMemoriesFromConversation, searchMemories } from '@/lib/memory-engine'

// POST /api/nexus/chat — Send message and get AI streaming response
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { message, conversationId, agentType, contactId } = body

    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

        const workspaceId = body.workspaceId || undefined

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const conv = await db.nexusConversation.create({
        data: {
          userId: session.userId,
          workspaceId: workspaceId || null,
          agentType: agentType || 'nexus',
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        }
      })
      convId = conv.id
    } else {
      // Verify ownership
      const conv = await db.nexusConversation.findFirst({
        where: { id: convId, userId: session.userId }
      })
      if (!conv) {
        return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
      }
    }

    // Save user message
    await db.nexusMessage.create({
      data: {
        conversationId: convId,
        role: 'user',
        content: message,
      }
    })

    // Get conversation history (last 20 messages)
    const history = await db.nexusMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    // ─── NEW: Use Memory Engine for semantic relevance ───
    let memoryContext = 'Sin memorias aún.'
    if (contactId) {
      try {
        const { getRelevantMemories } = await import('@/lib/memory-engine')
        const relevantMemories = await getRelevantMemories(contactId, message, 10)
        if (relevantMemories.length > 0) {
          memoryContext = relevantMemories
            .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
            .join('\n')
        }
      } catch {
        // Fallback to basic memories if engine fails
        const basicMemories = await db.nexusMemory.findMany({
          where: {
            userId: session.userId,
            contactId,
            status: 'active',
          },
          orderBy: { importance: 'desc' },
          take: 10,
        })
        if (basicMemories.length > 0) {
          memoryContext = basicMemories
            .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
            .join('\n')
        }
      }
    } else {
      // No contactId — use global user memories
      const userMemories = await db.nexusMemory.findMany({
        where: {
          userId: session.userId,
          status: 'active',
        },
        orderBy: { importance: 'desc' },
        take: 10,
      })
      if (userMemories.length > 0) {
        memoryContext = userMemories
          .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
          .join('\n')
      }
    }

    // Build system prompt with agent personality and memories
    const agentType_val = agentType || 'nexus'
    const agentConfigs: Record<string, string> = {
      nexus: `Eres NEXUS, un asistente virtual 100% autónomo. Eres inteligente, proactivo y capacitado para ayudar en cualquier tarea.
Piensa de forma independiente, toma initiative cuando sea necesario, y recuerda información importante sobre el usuario.
Respondes en español por defecto a menos que el usuario hable otro idioma.
Memorias del usuario que debes tener en cuenta:
${memoryContext}`,
      coder: `Eres CODEX, un asistente especializado en programación y desarrollo de software.
Eres experto en múltiples lenguajes y frameworks. Proporcionas código limpio, bien documentado y optimizado.
Memorias del usuario:
${memoryContext}`,
      analyst: `Eres ANALYTICA, un asistente especializado en análisis de datos y business intelligence.
Ayudas a interpretar datos, crear reportes y encontrar insights accionables.
Memorias del usuario:
${memoryContext}`,
      writer: `Eres ESCRITOR, un asistente especializado en redacción y creación de contenido.
Dominas múltiples formatos: artículos, correos, guiones, documentación técnica y creativa.
Memorias del usuario:
${memoryContext}`,
    }

    const systemPrompt = agentConfigs[agentType_val] || agentConfigs.nexus

    // Build messages array for AI
    const aiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))
    ]

    // Call AI via chatWithAI
    const startTime = Date.now()

    try {
      const result = await chatWithAI(
        aiMessages,
        'glm',
        undefined,
        {
          temperature: agentType_val === 'coder' ? 0.3 : 0.7,
          maxTokens: 4096,
        }
      )

      const latencyMs = Date.now() - startTime
      const aiContent = result.content
      const tokensUsed = result.tokensUsed

      // Save assistant message
      await db.nexusMessage.create({
        data: {
          conversationId: convId,
          role: 'assistant',
          content: aiContent,
          tokens: tokensUsed,
          model: result.model,
          latencyMs,
        }
      })

      // ─── NEW: Use Memory Engine for auto-extraction ───
      // Extract memories from conversation asynchronously (don't block response)
      extractMemoriesFromConversation(
        session.userId,
        [
          { role: 'user', content: message },
          { role: 'assistant', content: aiContent },
        ],
        contactId
      ).catch((err) => {
        console.error('[NEXUS Memory Engine] Background extraction error:', err instanceof Error ? err.message : String(err))
      })

      return Response.json({
        message: aiContent,
        conversationId: convId,
        tokensUsed,
        latencyMs,
      })
    } catch (aiError: unknown) {
      const errMsg = aiError instanceof Error ? aiError.message : String(aiError)
      console.error('[NEXUS AI Error]', errMsg)

      // Save error as system message
      await db.nexusMessage.create({
        data: {
          conversationId: convId,
          role: 'system',
          content: `Error de IA: ${errMsg}`,
          metadata: JSON.stringify({ error: true }),
        }
      })

      return Response.json({
        error: 'Error al comunicarse con la IA. Intenta de nuevo.',
        conversationId: convId,
      }, { status: 503 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}

// GET /api/nexus/chat — List conversations
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') || undefined

    const where: Record<string, unknown> = {
      userId: session.userId,
      status: 'active',
      // If workspaceId is provided, scope NEXUS conversations to that workspace
      ...(workspaceId ? { workspaceId } : {}),
    }

    const conversations = await db.nexusConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true },
        }
      }
    })

    return Response.json({ conversations })
  } catch (error) {
    return errorResponse(error)
  }
}
