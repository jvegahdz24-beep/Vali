// ═══════════════════════════════════════════════════════════════
// GET /api/conversations/[id]/quick-replies
// Respuestas rápidas SUGERIDAS POR IA según la conversación (para el
// operador humano en el inbox). Analiza los últimos mensajes y propone
// 4 chips contextuales {label, text}. Si la IA falla, cae a defaults.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { chatWithAIJson } from '@/lib/ai/providers'

export const runtime = 'nodejs'
export const maxDuration = 30

// Defaults genéricos (respaldo si la IA no está disponible o hay pocos datos)
const DEFAULTS: { label: string; text: string }[] = [
  { label: 'Agendar cita', text: '¿Le gustaría agendar una cita? Podemos coordinar el día y horario que mejor le convenga 📅' },
  { label: 'Enviar precios', text: 'Con gusto le comparto nuestra información de precios y paquetes. ¿Qué es lo que más le interesa?' },
  { label: 'Seguimiento', text: 'Le contactamos para dar seguimiento a nuestra conversación. ¿Pudo revisar la información?' },
  { label: 'Agradecer', text: '¡Gracias por escribirnos! Es un placer atenderle. ¿En qué más puedo ayudarle? 😊' },
]

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id: conversationId } = await params

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, workspaceId: true, contact: { select: { firstName: true, lastName: true, leadScore: true } } },
    })
    if (!conversation) throw new ApiError(404, 'Conversación no encontrada')
    await requireWorkspace(conversation.workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({ where: { id: conversation.workspaceId }, select: { name: true, industry: true } })

    // Últimos 12 mensajes (orden cronológico) para dar contexto a la IA
    const recent = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { content: true, senderType: true, direction: true },
    })
    recent.reverse()

    if (recent.length === 0) {
      return Response.json({ replies: DEFAULTS, ai: false })
    }

    const transcript = recent
      .map((m) => `${m.direction === 'inbound' ? 'CLIENTE' : 'NEGOCIO'}: ${String(m.content).replace(/\s+/g, ' ').slice(0, 220)}`)
      .join('\n')
    const contactName = `${conversation.contact?.firstName ?? ''} ${conversation.contact?.lastName ?? ''}`.trim() || 'el cliente'

    const sys = 'Eres asistente de un vendedor que atiende WhatsApp. Analizas la conversación y propones respuestas rápidas que el vendedor podría ENVIAR AHORA para avanzar la venta. Respondes SOLO JSON válido.'
    const user = `Negocio: ${workspace?.name || 'ValiAutoFlow'} (giro: ${workspace?.industry || 'ventas'}). Cliente: ${contactName}.

Conversación reciente:
${transcript}

Genera EXACTAMENTE 4 respuestas rápidas DISTINTAS y ÚTILES para el PRÓXIMO mensaje del vendedor, basadas en lo último que dijo el cliente y el punto de la conversación. Cada una debe ser un mensaje listo para enviar (natural, en español mexicano, cordial, 1-2 frases, con emoji si aplica). El "label" es un texto MUY corto (1-3 palabras) para el botón; el "text" es el mensaje completo.

Responde SOLO con este JSON: {"replies":[{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."},{"label":"...","text":"..."}]}`

    try {
      const { data } = await chatWithAIJson<{ replies: { label: string; text: string }[] }>(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        'minimax', undefined,
        { temperature: 0.7, maxTokens: 900, disableThinking: true },
      )
      const replies = (data?.replies || [])
        .filter((r) => r && typeof r.label === 'string' && typeof r.text === 'string' && r.text.trim().length > 0)
        .slice(0, 4)
        .map((r) => ({ label: r.label.trim().slice(0, 24), text: r.text.trim().slice(0, 500) }))
      if (replies.length >= 2) return Response.json({ replies, ai: true })
      return Response.json({ replies: DEFAULTS, ai: false })
    } catch {
      return Response.json({ replies: DEFAULTS, ai: false })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
