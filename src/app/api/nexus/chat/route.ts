import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/nexus/chat — Send message and get AI streaming response
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { message, conversationId, agentType } = body

    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const conv = await db.nexusConversation.create({
        data: {
          userId: session.userId,
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

    // Get user memories for context
    const memories = await db.nexusMemory.findMany({
      where: { userId: session.userId },
      orderBy: { importance: 'desc' },
      take: 10,
    })

    // Build system prompt with agent personality and memories
    const agentType_val = agentType || 'nexus'
    const agentConfigs: Record<string, string> = {
      nexus: `Eres NEXUS, un asistente virtual 100% autónomo. Eres inteligente, proactivo y capacitado para ayudar en cualquier tarea.
Piensa de forma independiente, toma initiative cuando sea necesario, y recuerda información importante sobre el usuario.
Respondes en español por defecto a menos que el usuario hable otro idioma.
Memorias del usuario que debes tener en cuenta:
${memories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n') || 'Sin memorias aún.'}`,
      coder: `Eres CODEX, un asistente especializado en programación y desarrollo de software.
Eres experto en múltiples lenguajes y frameworks. Proporcionas código limpio, bien documentado y optimizado.
Memorias del usuario: ${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`,
      analyst: `Eres ANALYTICA, un asistente especializado en análisis de datos y business intelligence.
Ayudas a interpretar datos, crear reportes y encontrar insights accionables.
Memorias del usuario: ${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`,
      writer: `Eres ESCRITOR, un asistente especializado en redacción y creación de contenido.
Dominas múltiples formatos: artículos, correos, guiones, documentación técnica y creativa.
Memorias del usuario: ${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`,
    }

    const systemPrompt = agentConfigs[agentType_val] || agentConfigs.nexus

    // Build messages array for AI
    const aiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))
    ]

    // Call AI via z-ai-web-dev-sdk
    const zai = await ZAI.create()
    const startTime = Date.now()

    try {
      const completion = await zai.chat.completions.create({
        messages: aiMessages,
        temperature: agentType_val === 'coder' ? 0.3 : 0.7,
        max_tokens: 4096,
      })

      const latencyMs = Date.now() - startTime
      const aiContent = completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.'
      const tokensUsed = completion.usage?.total_tokens || 0

      // Save assistant message
      await db.nexusMessage.create({
        data: {
          conversationId: convId,
          role: 'assistant',
          content: aiContent,
          tokens: tokensUsed,
          model: completion.model || 'unknown',
          latencyMs,
        }
      })

      // Extract and save memories from the conversation
      await extractMemories(session.userId, message, aiContent)

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

    const conversations = await db.nexusConversation.findMany({
      where: {
        userId: session.userId,
        status: 'active',
      },
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

// Auto-extract memories from conversations
async function extractMemories(userId: string, userMessage: string, aiResponse: string) {
  try {
    const zai = await ZAI.create()
    const extraction = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Extrae hechos importantes del usuario del siguiente diálogo.
Responde SOLO en formato JSON array, cada objeto con: key (breve identificador), value (el hecho), category (preference/fact/instruction/context), importance (1-10).
Si no hay información notable, responde con [].
Ejemplo: [{"key":"nombre","value":"Juan","category":"fact","importance":8}]
NO incluyas texto adicional, solo el JSON array.`
        },
        {
          role: 'user',
          content: `Usuario: ${userMessage}\nAsistente: ${aiResponse}`
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
    })

    const content = extraction.choices[0]?.message?.content || '[]'
    // Clean response - extract JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const memories = JSON.parse(jsonMatch[0]) as Array<{key: string; value: string; category: string; importance: number}>

      for (const mem of memories) {
        if (mem.key && mem.value) {
          await db.nexusMemory.upsert({
            where: {
              userId_key: {
                userId,
                key: mem.key,
              }
            },
            create: {
              userId,
              key: mem.key,
              value: mem.value,
              category: mem.category || 'general',
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              source: 'conversation',
            },
            update: {
              value: mem.value,
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              lastAccessed: new Date(),
              accessCount: { increment: 1 },
            }
          })
        }
      }
    }
  } catch (e) {
    // Memory extraction failure should not block the response
    console.error('[NEXUS Memory Extraction Error]', e instanceof Error ? e.message : String(e))
  }
}
