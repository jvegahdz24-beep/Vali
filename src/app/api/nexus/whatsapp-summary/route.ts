import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/nexus/whatsapp-summary — Generate and log a WhatsApp summary
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Get user profile with WhatsApp
    let profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })
    if (!profile) {
      return Response.json({ error: 'Perfil no encontrado. Configura tu perfil primero.' }, { status: 404 })
    }

    if (!profile.whatsappPhone) {
      return Response.json({ error: 'No hay número de WhatsApp configurado' }, { status: 400 })
    }

    // Get recent activity
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
Genera un resumen de coaching de vida para WhatsApp. Debe ser conciso, motivador y en español.

Datos del usuario:
- Nombre: ${session.name}
- Ocupación: ${profile.occupation || 'No especificada'}
- Temperatura actual: ${profile.temperature}/100
- Hijos: ${profile.children}
- Metas: ${profile.goals || 'Sin metas definidas'}

Actividad reciente:
${recentConvs.map(c => `- ${c.title}: ${(c.messages[0]?.content || '').slice(0, 100)}`).join('\n') || 'Sin conversaciones recientes'}

Tareas pendientes:
${pendingTasks.map(t => `- [${t.priority}] ${t.title}${t.dueDate ? ` (vence: ${new Date(t.dueDate).toLocaleDateString('es-MX')})` : ''}`).join('\n') || 'Sin tareas pendientes'}

Memorias recientes:
${recentMemories.map(m => `- ${m.key}: ${m.value}`).join('\n') || 'Sin memorias'}

REGLAS:
- Máximo 300 palabras
- Tono: cálido, motivador, directivo
- Incluir emoji relevantes
- Mencionar la temperatura vital actual
- Sugerir 1 acción concreta para las próximas horas
- Formato: WhatsApp friendly (sin markdown complejo)
`.trim()

    const zai = await ZAI.create()
    const summary = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un coach de vida empático y directivo. Generas resúmenes breves y motivadores para WhatsApp.'
        },
        { role: 'user', content: context }
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    const summaryText = summary.choices[0]?.message?.content || 'No se pudo generar el resumen.'

    // Log the WhatsApp message (in production, this would call WhatsApp API)
    await db.nexusWhatsAppLog.create({
      data: {
        userId: session.userId,
        phone: profile.whatsappPhone,
        message: summaryText,
        type: 'summary',
        status: 'logged', // logged = generated but not sent (no WhatsApp API connected)
      },
    })

    // Update last summary sent time
    await db.nexusProfile.update({
      where: { userId: session.userId },
      data: { lastSummarySent: new Date() },
    })

    return Response.json({
      success: true,
      message: summaryText,
      phone: profile.whatsappPhone,
      status: 'logged',
      nextSummaryAt: new Date(Date.now() + (profile.summaryInterval || 15) * 60 * 1000).toISOString(),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// GET /api/nexus/whatsapp-summary — Get WhatsApp logs
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const logs = await db.nexusWhatsAppLog.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
      select: { whatsappPhone: true, summaryEnabled: true, summaryInterval: true, lastSummarySent: true },
    })

    return Response.json({ logs, settings: profile })
  } catch (error) {
    return errorResponse(error)
  }
}
