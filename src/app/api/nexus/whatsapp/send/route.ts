import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/nexus/whatsapp/send — Generate and send a WhatsApp summary now
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Get user profile with WhatsApp
    let profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })
    if (!profile) {
      profile = await db.nexusProfile.create({ data: { userId: session.userId } })
    }

    if (!profile.whatsappPhone) {
      return Response.json(
        { error: 'No hay numero de WhatsApp configurado' },
        { status: 400 }
      )
    }

    // Get recent activity for summary context
    const recentConvs = await db.nexusConversation.findMany({
      where: { userId: session.userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { role: true, content: true, createdAt: true },
        }
      }
    })

    const pendingTasks = await db.nexusTask.findMany({
      where: { userId: session.userId, status: 'pending' },
      orderBy: { priority: 'desc' },
      take: 5,
      select: { title: true, priority: true, dueDate: true },
    })

    const recentMemories = await db.nexusMemory.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { key: true, value: true, category: true },
    })

    // Build summary context
    const context = `
Genera un resumen de coaching de vida para WhatsApp. Debe ser conciso, motivador y en espanol.

Datos del usuario:
- Nombre: ${session.name || 'Usuario'}
- Ocupacion: ${profile.occupation || 'No especificada'}
- Temperatura actual: ${profile.temperature}/100
- Hijos: ${profile.children || 0}
- Metas: ${profile.goals || 'Sin metas definidas'}

Actividad reciente:
${recentConvs.map(c => `- ${c.title}: ${(c.messages[0]?.content || '').slice(0, 100)}`).join('\n') || 'Sin conversaciones recientes'}

Tareas pendientes:
${pendingTasks.map(t => `- [${t.priority}] ${t.title}${t.dueDate ? ` (vence: ${new Date(t.dueDate).toLocaleDateString('es-MX')})` : ''}`).join('\n') || 'Sin tareas pendientes'}

Memorias recientes:
${recentMemories.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'Sin memorias'}

REGLAS:
- Maximo 300 palabras
- Tono: calido, motivador, directivo
- Incluir emoji relevantes
- Mencionar la temperatura vital actual
- Sugerir 1 accion concreta para las proximas horas
- Formato: WhatsApp friendly (sin markdown complejo)
`.trim()

    const zai = await ZAI.create()
    const summary = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un coach de vida empatico y directivo. Generas resumenes breves y motivadores para WhatsApp.',
        },
        { role: 'user', content: context },
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    const summaryText = summary.choices[0]?.message?.content || 'No se pudo generar el resumen.'

    // Log the WhatsApp message
    const log = await db.nexusWhatsAppLog.create({
      data: {
        userId: session.userId,
        phone: profile.whatsappPhone,
        message: summaryText,
        type: 'summary',
        status: 'sent',
        sentAt: new Date(),
      },
    })

    // Update last summary sent time
    await db.nexusProfile.update({
      where: { userId: session.userId },
      data: { lastSummarySent: new Date() },
    })

    return Response.json({
      log: {
        id: log.id,
        userId: log.userId,
        phone: log.phone,
        message: log.message,
        type: log.type,
        status: log.status,
        sentAt: log.sentAt?.toISOString(),
        error: log.error,
        createdAt: log.createdAt.toISOString(),
      },
      success: true,
      nextSummaryAt: new Date(
        Date.now() + (profile.summaryInterval || 15) * 60 * 1000
      ).toISOString(),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
