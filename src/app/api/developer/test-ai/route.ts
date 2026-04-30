import { NextRequest, NextResponse } from 'next/server'
import { PERSONALITY_PROMPTS } from '@/lib/constants'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { addDeveloperLog } from '../logs/route'

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request)
    const body = await request.json()
    const { agentId, message } = body

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: message' },
        { status: 400 }
      )
    }

    const personality = agentId || 'JHON'
    const systemPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS['JHON']

    addDeveloperLog('info', 'debug-console', `Test AI request - Agent: ${personality}, Message: ${message.slice(0, 50)}`)

    const startTime = Date.now()

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nResponde de forma breve (máximo 2 líneas) al siguiente mensaje del cliente.',
          },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 300,
      })

      const elapsed = Date.now() - startTime
      const responseText = completion.choices?.[0]?.message?.content || 'Sin respuesta'
      const tokensUsed = completion.usage?.total_tokens || 0

      addDeveloperLog('info', 'debug-console', `AI response received - ${elapsed}ms, ${tokensUsed} tokens`)

      return NextResponse.json({
        success: true,
        response: responseText,
        tokensUsed,
        responseTime: elapsed,
        fullPrompt: systemPrompt,
        model: completion.model || 'unknown',
      })
    } catch (aiError) {
      const elapsed = Date.now() - startTime
      const errorMsg = aiError instanceof Error ? aiError.message : 'Unknown AI error'

      addDeveloperLog('error', 'debug-console', `AI error: ${errorMsg}`)

      return NextResponse.json({
        success: true,
        response: `[Modo Demo] El agente ${personality} respondería a: "${message}"\n\nError real: ${errorMsg}`,
        tokensUsed: 0,
        responseTime: elapsed,
        fullPrompt: systemPrompt,
        model: 'demo-mode',
        error: errorMsg,
      })
    }
  } catch (error) {
    return errorResponse(error, 'Error al procesar prueba de IA')
  }
}
