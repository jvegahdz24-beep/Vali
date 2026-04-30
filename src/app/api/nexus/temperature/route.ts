import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import ZAI from 'z-ai-web-dev-sdk'

// GET /api/nexus/temperature — Get current temperature + recent history
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })

    const temperature = profile?.temperature ?? 50.0

    // Get last 24 temperature logs
    const logs = await db.nexusTemperatureLog.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    })

    return Response.json({
      temperature,
      tempUpdatedAt: profile?.tempUpdatedAt,
      logs,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/temperature — Calculate temperature via AI analysis
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Get user's recent conversations
    const recentConvs = await db.nexusConversation.findMany({
      where: { userId: session.userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { role: true, content: true, createdAt: true },
        }
      }
    })

    // Get user profile
    let profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })
    if (!profile) {
      profile = await db.nexusProfile.create({ data: { userId: session.userId } })
    }

    // Get pending tasks
    const pendingTasks = await db.nexusTask.count({
      where: { userId: session.userId, status: 'pending' }
    })
    const completedTasks = await db.nexusTask.count({
      where: { userId: session.userId, status: 'completed' }
    })

    // Build context for AI
    const context = `
Perfil del usuario:
- Edad: ${profile.age || 'no especificada'}
- Ocupación: ${profile.occupation || 'no especificada'}
- Coach mode: ${profile.coachMode ? 'activo' : 'inactivo'}
- Temperatura anterior: ${profile.temperature}

Actividad reciente:
- Conversaciones activas: ${recentConvs.length}
- Tareas pendientes: ${pendingTasks}
- Tareas completadas: ${completedTasks}

Últimas conversaciones:
${recentConvs.map(c =>
  `[${c.agentType}] ${c.title}:
${c.messages.map(m => `${m.role}: ${m.content.slice(0, 150)}`).join('\n')}`
).join('\n---\n') || 'Sin conversaciones recientes'}
`.trim()

    const zai = await ZAI.create()
    const analysis = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un analista de bienestar emocional y productividad. Analiza el contexto del usuario y determina su "temperatura" vital en una escala de 0 a 100.

La temperatura representa:
- 0-20: Estado crítico (necesita atención inmediata, posible estrés severo o desmotivación)
- 21-40: Bajo (algo le preocupa, podría estar abrumado o estancado)
- 41-60: Neutral (estable, día normal)
- 61-80: Bueno (productivo, motivado, con energía positiva)
- 81-100: Excelente (en flow, alto rendimiento, gran bienestar)

Responde SOLO con un objeto JSON: {"value": <0-100>, "label": "<breve etiqueta>", "reason": "<razón de 1 frase>"}
NO incluyas texto adicional.`
        },
        { role: 'user', content: context }
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    const content = analysis.choices[0]?.message?.content || '{"value":50,"label":"Estable","reason":"Sin datos suficientes"}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    let newTemp = 50
    let label = 'Estable'
    let reason = 'Evaluación inicial'

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      newTemp = Math.max(0, Math.min(100, parsed.value || 50))
      label = parsed.label || 'Estable'
      reason = parsed.reason || 'Análisis completado'
    }

    // Update profile temperature
    await db.nexusProfile.update({
      where: { userId: session.userId },
      data: {
        temperature: newTemp,
        tempUpdatedAt: new Date(),
      },
    })

    // Save temperature log
    await db.nexusTemperatureLog.create({
      data: {
        userId: session.userId,
        value: newTemp,
        label: label,
        source: 'ai_analysis',
        metadata: JSON.stringify({ reason }),
      },
    })

    // Determine color category
    let category: string
    if (newTemp <= 20) category = 'critical'
    else if (newTemp <= 40) category = 'low'
    else if (newTemp <= 60) category = 'neutral'
    else if (newTemp <= 80) category = 'good'
    else category = 'excellent'

    return Response.json({
      temperature: newTemp,
      label,
      reason,
      category,
      logs: [
        { value: newTemp, label, source: 'ai_analysis', createdAt: new Date().toISOString() }
      ],
    })
  } catch (error) {
    return errorResponse(error)
  }
}
