import { NextRequest, NextResponse } from 'next/server'
import { PERSONALITY_PROMPTS } from '@/lib/constants'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { addDeveloperLog } from '../logs/route'
import { chatWithAI } from '@/lib/ai/providers'
import { db } from '@/lib/db'

// ─── Per-provider key validation via their native APIs ──────────
async function validateProviderKey(provider: string, key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    let url: string
    const headers: Record<string, string> = { 'Authorization': `Bearer ${key}` }

    switch (provider) {
      case 'glm':
        url = 'https://api.z.ai/api/paas/v4/models'
        break
      case 'groq':
        url = 'https://api.groq.com/openai/v1/models'
        break
      case 'openai':
        url = 'https://api.openai.com/v1/models'
        break
      case 'deepseek':
        url = 'https://api.deepseek.com/models'
        break
      case 'gemini':
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
        delete headers['Authorization']
        break
      default:
        return { valid: false, error: 'Proveedor desconocido' }
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    })

    // 200 = valid key, 429 = rate-limited but key is valid
    if (res.status === 200 || res.status === 429) return { valid: true }

    const body = await res.text().catch(() => '')
    return { valid: false, error: `HTTP ${res.status}` + (body ? `: ${body.slice(0, 80)}` : '') }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message.slice(0, 100) : 'Error de red' }
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const workspaceId = session.workspaceId
    if (workspaceId) {
      const { requireWorkspace } = await import('@/lib/api-auth')
      await requireWorkspace(workspaceId, session.userId)
    }
    const body = await request.json()
    const { agentId, personality: personalityField, message, apiKey: passedApiKey } = body

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: message' },
        { status: 400 }
      )
    }

    const personality = agentId || personalityField || 'JHON'
    // When agentId looks like a provider key (glm/groq/openai/deepseek/gemini),
    // treat it as a provider test rather than a personality/debug call.
    const KNOWN_PROVIDERS = ['glm', 'groq', 'openai', 'deepseek', 'gemini', 'anthropic']
    const isProviderTest = KNOWN_PROVIDERS.includes((agentId || '').toLowerCase())
    const targetProvider = isProviderTest ? (agentId as string).toLowerCase() : 'glm'

    // For provider tests, prefer the key passed in the request body (from the input field),
    // then fall back to the key stored in DB.
    let tenantApiKey: string | undefined = typeof passedApiKey === 'string' && passedApiKey.trim() ? passedApiKey.trim() : undefined
    if (!tenantApiKey && workspaceId) {
      try {
        const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
        const settings: Record<string, unknown> = JSON.parse(ws?.settings || '{}')
        const apiKeys = (settings.apiKeys as Record<string, string>) || {}
        tenantApiKey = apiKeys[targetProvider] || undefined
      } catch { /* non-critical */ }
    }

    // If testing a specific provider but no key found anywhere, return error immediately
    if (isProviderTest && !tenantApiKey) {
      return NextResponse.json(
        { success: false, error: `No hay API key configurada para ${targetProvider}` },
        { status: 400 }
      )
    }

    // For provider tests: validate the key directly against the provider's native API
    if (isProviderTest && tenantApiKey) {
      const startTime = Date.now()
      addDeveloperLog('info', 'debug-console', `Validando API key para ${targetProvider}...`, workspaceId || undefined)

      const validation = await validateProviderKey(targetProvider, tenantApiKey)
      const elapsed = Date.now() - startTime

      if (!validation.valid) {
        addDeveloperLog('warn', 'debug-console', `API key inválida para ${targetProvider}: ${validation.error}`, workspaceId || undefined)
        return NextResponse.json(
          { success: false, error: validation.error || 'API key inválida' },
          { status: 422 }
        )
      }

      addDeveloperLog('info', 'debug-console', `API key válida para ${targetProvider} (${elapsed}ms)`, workspaceId || undefined)
      return NextResponse.json({
        success: true,
        response: `API key de ${targetProvider.toUpperCase()} válida ✓`,
        tokensUsed: 0,
        responseTime: elapsed,
        model: targetProvider,
        provider: targetProvider,
        promptSource: 'key-validation',
      })
    }

    // ── Non-provider test: regular AI debug call ──────────────────
    let systemPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS['JHON'] || ''
    let promptSource = 'fallback'
    if (workspaceId) {
      try {
        const persona = await db.agentPersona.findFirst({
          where: { workspaceId, slug: personality, isActive: true },
          select: { systemPrompt: true },
        })
        if (persona?.systemPrompt) { systemPrompt = persona.systemPrompt; promptSource = 'db' }
      } catch { /* non-critical */ }
    }

    // Reemplaza placeholders para que el PREVIEW (onboarding) no muestre
    // literales como [NOMBRE] o [EMPRESA] al usuario.
    let wsName = 'la agencia'
    if (workspaceId) {
      try {
        const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
        if (ws?.name) wsName = ws.name
      } catch { /* non-critical */ }
    }
    systemPrompt = systemPrompt
      .replace(/\[NOMBRE\]/g, 'Jhon')
      .replace(/\[EMPRESA\]|\[AGENCIA\]|\[NOMBRE_AGENCIA\]/g, wsName)

    addDeveloperLog('info', 'debug-console', `Test AI — Agent: ${personality}, Message: ${message.slice(0, 50)}`, workspaceId || undefined)

    const startTime = Date.now()

    const result = await chatWithAI(
      [
        { role: 'system', content: systemPrompt + '\n\nResponde de forma breve (máximo 2 líneas) al siguiente mensaje del cliente.' },
        { role: 'user', content: message },
      ],
      'glm',
      undefined,
      { temperature: 0.7, maxTokens: 300 }
    )

    const elapsed = Date.now() - startTime
    const responseText = result.content || 'Sin respuesta'
    const tokensUsed = result.tokensUsed || 0

    addDeveloperLog('info', 'debug-console', `AI response — ${elapsed}ms, ${tokensUsed} tokens`, workspaceId || undefined)

    return NextResponse.json({
      success: true,
      response: responseText,
      tokensUsed,
      responseTime: elapsed,
      fullPrompt: systemPrompt,
      model: result.model || 'glm',
      provider: result.provider || 'glm',
      promptSource,
    })
  } catch (error) {
    return errorResponse(error, 'Error al procesar prueba de IA')
  }
}
