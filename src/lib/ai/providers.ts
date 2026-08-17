// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Multi-Provider AI Abstraction Layer
// All providers route through z-ai-web-dev-sdk
// ═══════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk'
import crypto from 'crypto'
import { AI_PROVIDERS } from '@/lib/constants'
import type { AIProvider } from '@/lib/types'

// ─── GLM Content Extraction ──
// GLM Flash models return BOTH `content` (the actual reply) and
// `reasoning_content` (internal chain-of-thought). We want `content`
// as the real response. `reasoning_content` is only a fallback when
// `content` is empty (some edge cases with thinking-only models).

export function extractGLMContent(response: any): string {
  const message = response?.choices?.[0]?.message
  if (!message) return ''
  // Strip <think>...</think> or <thinking>...</thinking> blocks (reasoning models)
  const strip = (s: string) => s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
  const content = strip(message.content || '')
  if (content) return content
  return strip(message.reasoning_content || '')
}

// ─── Message Types ───────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AICompletionOptions {
  temperature?: number
  maxTokens?: number
  model?: string
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  /** Per-tenant API key — overrides the platform ZAI_API_KEY env var */
  tenantApiKey?: string
  /** Skip GLM fallback — use in test/validation contexts where you want a real pass/fail */
  noFallback?: boolean
  /** Disable GLM "thinking"/reasoning so the model answers directly (no chain-of-thought leaking into content) */
  disableThinking?: boolean
}

export interface AICompletionResult {
  content: string
  model: string
  provider: AIProvider
  tokensUsed: number
  latencyMs: number
  raw?: unknown
}

// ─── Provider Interface ──────────────────────────────────────

export interface AIProviderInstance {
  name: AIProvider
  displayName: string
  defaultModel: string
  availableModels: string[]
  chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>
}

// ─── GLM Direct API Fallback (bypass z.ai proxy) ──
// When the z.ai SDK proxy returns 401 (missing X-Token),
// fall back to calling the GLM API directly with JWT auth.

function generateGLMToken(apiKey: string): string {
  const [id, secret] = apiKey.split('.')
  const header = { alg: 'HS256', sign_type: 'SIGN' }
  const payload = {
    api_key: id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    timestamp: Date.now(),
  }
  function b64(input: string) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }
  const h = b64(JSON.stringify(header))
  const p = b64(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${h}.${p}.${sig}`
}

const GLM_DIRECT_MODELS = ['GLM-4.5-Flash', 'glm-4.7-flash']
const GLM_SDK_TIMEOUT = 8000 // 8s timeout for SDK (proxy may be slow/dead)
// Hard ceiling on the direct LLM HTTP calls. Without this a slow/hung provider
// blocks the WhatsApp reply indefinitely (observed 43s+). On abort we throw and
// the caller falls through to the next provider/fallback.
const LLM_HTTP_TIMEOUT = 25000 // 25s

// ─── Z.AI Direct (api.z.ai) — Bearer token, no JWT needed ──

async function callZAIDirect(messages: AIMessage[], options?: AICompletionOptions, overrideApiKey?: string): Promise<AICompletionResult> {
  const apiKey = overrideApiKey || process.env.ZAI_API_KEY
  if (!apiKey) throw new Error('ZAI_API_KEY not set')
  const start = Date.now()
  const model = options?.model || 'glm-5.1'

  console.log(`[AI] callZAIDirect → model: ${model}`)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), LLM_HTTP_TIMEOUT)
  let res: Response
  try {
    res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
        ...(options?.disableThinking ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: ac.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new Error(`Z.AI timeout after ${LLM_HTTP_TIMEOUT}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Z.AI returned ${res.status}: ${body.slice(0, 120)}`)
  }

  const data = await res.json()
  const content = extractGLMContent(data)
  if (!content?.trim()) throw new Error('Z.AI returned empty content')

  console.log(`[AI] callZAIDirect success (${Date.now() - start}ms, ${content.length} chars)`)
  return {
    content,
    model,
    provider: 'glm',
    tokensUsed: data.usage?.total_tokens ?? 0,
    latencyMs: Date.now() - start,
    raw: data,
  }
}

async function callGLMDirect(messages: AIMessage[], options?: AICompletionOptions, overrideApiKey?: string): Promise<AICompletionResult> {
  const apiKey = overrideApiKey || process.env.ZAI_API_KEY
  if (!apiKey) throw new Error('ZAI_API_KEY not set')
  const token = generateGLMToken(apiKey)
  const start = Date.now()

  for (const model of GLM_DIRECT_MODELS) {
    try {
      console.log(`[AI 1] Llamando modelo GLM: ${model}...`)
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), LLM_HTTP_TIMEOUT)
      let res: Response
      try {
        res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 4096,
            ...(options?.disableThinking ? { thinking: { type: 'disabled' } } : {}),
          }),
          signal: ac.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        console.warn(`[AI] GLM direct ${model} returned ${res.status}`)
        continue
      }
      const data = await res.json()
      const content = extractGLMContent(data)
      if (content && content.trim()) {
        console.log(`[AI] GLM direct ${model} success (${Date.now() - start}ms, ${content.length} chars)`)
        return {
          content,
          model,
          provider: 'glm' as const,
          tokensUsed: data.usage?.total_tokens ?? 0,
          latencyMs: Date.now() - start,
          raw: data,
        }
      }
      console.warn(`[AI] GLM direct ${model} returned empty content`)
    } catch (err) {
      console.warn(`[AI] GLM direct ${model} failed:`, err instanceof Error ? err.message : err)
    }
  }
  throw new Error('All GLM direct models failed')
}

// ─── Provider Implementations ────────────────────────────────

export class GLMProvider implements AIProviderInstance {
  name = 'glm' as const
  displayName = 'GLM (Z.AI)'
  defaultModel = AI_PROVIDERS.glm.defaultModel
  availableModels = [...AI_PROVIDERS.glm.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const targetMaxTokens = options?.maxTokens ?? 4096
    const mergedOptions = { ...options, maxTokens: targetMaxTokens }

    // PRIMARY: Z.AI direct (api.z.ai, raw Bearer token)
    try {
      console.log('[AI] GLMProvider → trying Z.AI direct (primary)...')
      const result = await callZAIDirect(messages, mergedOptions, mergedOptions.tenantApiKey)
      console.log(`[AI] GLMProvider → Z.AI direct success in ${Date.now() - start}ms`)
      return result
    } catch (zaiErr) {
      const msg = zaiErr instanceof Error ? zaiErr.message : String(zaiErr)
      console.warn(`[AI] Z.AI direct failed (${msg.slice(0, 80)}), trying GLM JWT fallback`)
    }

    // FALLBACK 1: GLM direct via open.bigmodel.cn (JWT)
    try {
      console.log('[AI] GLMProvider → trying GLM JWT fallback...')
      const result = await callGLMDirect(messages, mergedOptions, mergedOptions.tenantApiKey)
      console.log(`[AI] GLMProvider → GLM JWT success in ${Date.now() - start}ms`)
      return result
    } catch (glmErr) {
      const msg = glmErr instanceof Error ? glmErr.message : String(glmErr)
      console.warn(`[AI] GLM JWT failed (${msg.slice(0, 80)}), trying SDK fallback`)
    }

    // FALLBACK 2: z.ai SDK
    try {
      const zai = await ZAI.create()
      const model = options?.model || this.defaultModel

      const completion = await Promise.race([
        zai.chat.completions.create({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          model,
          temperature: options?.temperature ?? 0.7,
          max_tokens: targetMaxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK timeout')), GLM_SDK_TIMEOUT)
        ),
      ])

      const content = extractGLMContent(completion)
      if (content && content.trim()) {
        console.log(`[AI] SDK fallback success in ${Date.now() - start}ms`)
        return {
          content,
          model,
          provider: 'glm',
          tokensUsed: completion.usage?.total_tokens ?? 0,
          latencyMs: Date.now() - start,
          raw: completion,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[AI] SDK fallback also failed (${msg.slice(0, 80)})`)
    }

    throw new Error('All GLM providers failed: Z.AI direct + JWT + SDK')
  }
}

// ─── MiniMax (api.minimax.io, Bearer token) ──
// Endpoint chat: /v1/text/chatcompletion_v2. M3 es de razonamiento: pone su
// cadena en reasoning_content y la respuesta en content (usamos content).
async function callMiniMax(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
  // Usa la key de MiniMax (global env) o una tenantApiKey SOLO si es de MiniMax (sk-...).
  const tk = options?.tenantApiKey
  const apiKey = (tk && /^sk-/.test(tk) && tk.length > 30) ? tk : process.env.MINIMAX_API_KEY
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set')
  const model = options?.model || process.env.MINIMAX_CHAT_MODEL || 'MiniMax-M3'
  const start = Date.now()
  const reqBody = JSON.stringify({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
    top_p: options?.topP ?? 0.95,
  })
  // Reintenta ante overload/5xx transitorio (529) para NO caer a GLM y mantener
  // todo en MiniMax. 2 intentos con backoff corto.
  let res!: Response
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 45000)
    try {
      res = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: reqBody,
        signal: ac.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error)?.name === 'AbortError') throw new Error('MiniMax timeout after 45000ms')
      throw err
    }
    clearTimeout(timer)
    if (res.ok) break
    const b = await res.text().catch(() => '')
    if ((res.status === 529 || res.status >= 500) && attempt === 0) {
      console.warn(`[AI] MiniMax ${res.status} (overload), reintentando en 1.2s…`)
      await new Promise((r) => setTimeout(r, 1200))
      continue
    }
    throw new Error(`MiniMax returned ${res.status}: ${b.slice(0, 120)}`)
  }
  const data = await res.json()
  const msg = data?.choices?.[0]?.message || {}
  const finish = data?.choices?.[0]?.finish_reason
  const strip = (s: string) => (s || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
  // CRÍTICO: para el cliente usamos SOLO `content`. NUNCA caemos a
  // `reasoning_content` — es la cadena de pensamiento (inglés/meta) y filtrarla
  // al cliente fue el bug de las respuestas con "Let me think..."/"- Stage:".
  const content = strip(msg.content)
  const reasoningLen = (msg.reasoning_content || '').length
  console.log(`[AI] MiniMax ${model} finish=${finish} prompt=${data.usage?.prompt_tokens} compl=${data.usage?.completion_tokens} content=${content.length}ch reasoning=${reasoningLen}ch`)
  if (!content) {
    // content vacío = el razonamiento consumió todo el budget (o finish=length).
    // No emitimos reasoning_content; señalamos para reintento/fallback limpio.
    throw new Error(`MiniMax empty content (finish=${finish}, reasoning=${reasoningLen}ch) — razonamiento sin respuesta`)
  }
  return { content, model, provider: 'minimax', tokensUsed: data.usage?.total_tokens ?? 0, latencyMs: Date.now() - start, raw: data }
}

export class MiniMaxProvider implements AIProviderInstance {
  name = 'minimax' as const
  displayName = 'MiniMax'
  defaultModel = process.env.MINIMAX_CHAT_MODEL || 'MiniMax-M3'
  availableModels = ['MiniMax-M3', 'MiniMax-Text-01', 'abab6.5s-chat']

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    try {
      const r = await callMiniMax(messages, options)
      console.log(`[AI] MiniMaxProvider success in ${Date.now() - start}ms`)
      return r
    } catch (mmErr) {
      const msg = mmErr instanceof Error ? mmErr.message : String(mmErr)
      if (options?.noFallback) throw mmErr
      // 1) Reintento en MiniMax con Text-01 (no-razonador → siempre emite
      //    `content`, nunca cae a reasoning). Mantiene todo en MiniMax.
      const usedModel = options?.model || process.env.MINIMAX_CHAT_MODEL || 'MiniMax-M3'
      if (usedModel !== 'MiniMax-Text-01') {
        try {
          console.warn(`[AI] MiniMax ${usedModel} failed (${msg.slice(0, 60)}), reintento con MiniMax-Text-01`)
          const r = await callMiniMax(messages, { ...options, model: 'MiniMax-Text-01' })
          console.log(`[AI] MiniMax Text-01 retry success in ${Date.now() - start}ms`)
          return r
        } catch { /* cae a GLM */ }
      }
      // 2) Último reintento en MiniMax-Text-01 (GLM/Z.AI RETIRADOS 2026-07-22:
      //    ya NO hay fallback a GLM). Si todo MiniMax falla, se propaga el error.
      if (usedModel !== 'MiniMax-Text-01') {
        const r = await callMiniMax(messages, { ...options, model: 'MiniMax-Text-01', temperature: Math.min(0.7, options?.temperature ?? 0.7) })
        return { ...r, provider: 'minimax' }
      }
      throw mmErr
    }
  }
}

export class GroqProvider implements AIProviderInstance {
  name = 'groq' as const
  displayName = 'Groq'
  defaultModel = AI_PROVIDERS.groq.defaultModel
  availableModels = [...AI_PROVIDERS.groq.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const targetMaxTokens = options?.maxTokens ?? 4096

    // PRIMARY: Z.AI direct (api.z.ai)
    try {
      console.log('[AI] GroqProvider → trying Z.AI direct (primary)...')
      const result = await callZAIDirect(messages, { ...options, maxTokens: targetMaxTokens }, options?.tenantApiKey)
      console.log(`[AI] GroqProvider → Z.AI direct success in ${Date.now() - start}ms`)
      return { ...result, provider: 'groq' }
    } catch (zaiErr) {
      const msg = zaiErr instanceof Error ? zaiErr.message : String(zaiErr)
      console.warn(`[AI] Z.AI direct failed (${msg.slice(0, 80)}), trying GLM JWT fallback`)
    }

    // FALLBACK 1: GLM JWT
    try {
      const result = await callGLMDirect(messages, { ...options, maxTokens: targetMaxTokens }, options?.tenantApiKey)
      return { ...result, provider: 'groq' }
    } catch (glmErr) {
      const msg = glmErr instanceof Error ? glmErr.message : String(glmErr)
      console.warn(`[AI] GLM JWT failed (${msg.slice(0, 80)}), trying SDK fallback`)
    }

    // FALLBACK 2: z.ai SDK
    try {
      const zai = await ZAI.create()
      const model = options?.model || this.defaultModel

      // Race SDK call against timeout
      const completion = await Promise.race([
        zai.chat.completions.create({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          model,
          temperature: options?.temperature ?? 0.7,
          max_tokens: targetMaxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK timeout')), GLM_SDK_TIMEOUT)
        ),
      ])

      const content = extractGLMContent(completion)
      if (content && content.trim()) {
        console.log(`[AI] SDK fallback success in ${Date.now() - start}ms`)
        return {
          content,
          model,
          provider: 'groq',
          tokensUsed: completion.usage?.total_tokens ?? 0,
          latencyMs: Date.now() - start,
          raw: completion,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[AI] SDK fallback also failed (${msg.slice(0, 80)})`)
    }

    throw new Error('All providers failed: Z.AI direct + GLM JWT + SDK')
  }
}

export class DeepSeekProvider implements AIProviderInstance {
  name = 'deepseek' as const
  displayName = 'DeepSeek'
  defaultModel = AI_PROVIDERS.deepseek.defaultModel
  availableModels = [...AI_PROVIDERS.deepseek.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const zai = await ZAI.create()
    const model = options?.model || this.defaultModel

    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      model,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
    })

    const content = extractGLMContent(completion)
    const latencyMs = Date.now() - start

    return {
      content,
      model,
      provider: 'deepseek',
      tokensUsed: completion.usage?.total_tokens ?? 0,
      latencyMs,
      raw: completion,
    }
  }
}

export class GeminiProvider implements AIProviderInstance {
  name = 'gemini' as const
  displayName = 'Google Gemini'
  defaultModel = AI_PROVIDERS.gemini.defaultModel
  availableModels = [...AI_PROVIDERS.gemini.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const zai = await ZAI.create()
    const model = options?.model || this.defaultModel

    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      model,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP,
    })

    const content = extractGLMContent(completion)
    const latencyMs = Date.now() - start

    return {
      content,
      model,
      provider: 'gemini',
      tokensUsed: completion.usage?.total_tokens ?? 0,
      latencyMs,
      raw: completion,
    }
  }
}

export class OpenAIProvider implements AIProviderInstance {
  name = 'openai' as const
  displayName = 'OpenAI'
  defaultModel = AI_PROVIDERS.openai.defaultModel
  availableModels = [...AI_PROVIDERS.openai.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const zai = await ZAI.create()
    const model = options?.model || this.defaultModel

    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      model,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
    })

    const content = extractGLMContent(completion)
    const latencyMs = Date.now() - start

    return {
      content,
      model,
      provider: 'openai',
      tokensUsed: completion.usage?.total_tokens ?? 0,
      latencyMs,
      raw: completion,
    }
  }
}

// ─── Provider Registry ───────────────────────────────────────

const providerInstances: Record<string, AIProviderInstance> = {
  glm: new GLMProvider(),
  groq: new GroqProvider(),
  deepseek: new DeepSeekProvider(),
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
  minimax: new MiniMaxProvider(),
}

/**
 * Get a provider instance by name.
 * Returns GLM as default if provider not found.
 */
export function getProvider(providerName: string): AIProviderInstance {
  const name = (providerName || '').toLowerCase()
  // GLM/Z.AI RETIRADOS (2026-07-22, decisión de Jhon): sin saldo y ya no se usan.
  // Cualquier petición a 'glm'/'zai' se sirve con MiniMax. (Groq sigue vivo solo
  // para transcripción de audio, que MiniMax no hace.)
  if (name === 'glm' || name === 'zai' || name === 'z.ai') return providerInstances.minimax
  const provider = providerInstances[name]
  if (!provider) {
    console.warn(`[AI] Proveedor desconocido "${providerName}", usando MiniMax`)
    return providerInstances.minimax
  }
  return provider
}

/**
 * Get all available provider instances.
 */
export function getAllProviders(): AIProviderInstance[] {
  return Object.values(providerInstances)
}

/**
 * Unified chat function with automatic provider selection and fallback.
 *
 * Usage:
 *   const result = await chatWithAI([
 *     { role: 'system', content: 'You are JHON...' },
 *     { role: 'user', content: 'Hola, quiero info sobre el Sentra' }
 *   ], 'groq')
 */
export async function chatWithAI(
  messages: AIMessage[],
  provider: string = 'minimax',
  model?: string,
  options?: AICompletionOptions
): Promise<AICompletionResult> {
  // Override global: fuerza TODA la IA del producto a un proveedor (MiniMax).
  // Se omite en pruebas de proveedor (noFallback) para no romper el panel de dev.
  let effModel = model || options?.model
  if (process.env.AI_PROVIDER_OVERRIDE && !options?.noFallback) {
    const overridden = process.env.AI_PROVIDER_OVERRIDE
    // Si el caller pidió un modelo de OTRO proveedor (ej. clasificadores que
    // piden 'glm-4.5-flash'), descártalo: con el override el modelo no aplica y
    // forzarlo haría fallar la 1ª llamada a MiniMax (modelo desconocido).
    if (provider !== overridden) effModel = undefined
    provider = overridden
  }
  const providerInstance = getProvider(provider)

  const mergedOptions: AICompletionOptions = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    model: effModel,
    topP: options?.topP,
    frequencyPenalty: options?.frequencyPenalty,
    presencePenalty: options?.presencePenalty,
    tenantApiKey: options?.tenantApiKey,
  }

  try {
    const result = await providerInstance.chat(messages, mergedOptions)
    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[AI] Provider "${provider}" failed:`, errMsg)

    // Reintento con MiniMax si el intento falla (GLM/Z.AI retirados 2026-07-22:
    // el fallback ya NO va a GLM, reintenta MiniMax una vez ante fallos transitorios).
    if (!options?.noFallback) {
      console.warn('[AI] Reintentando con MiniMax...')
      try {
        const fallback = await providerInstances.minimax.chat(messages, mergedOptions)
        return fallback
      } catch (fallbackError) {
        const fallbackErrMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        console.error('[AI] Reintento MiniMax también falló:', fallbackErrMsg)
        throw new Error(`MiniMax falló. Intento 1: ${errMsg}. Reintento: ${fallbackErrMsg}`)
      }
    }

    throw new Error(`AI provider failed: ${errMsg}`)
  }
}

/**
 * Chat with AI and parse structured JSON from the response.
 * Expects the model to return valid JSON in its content.
 */
export async function chatWithAIJson<T>(
  messages: AIMessage[],
  provider: string = 'minimax',
  model?: string,
  options?: AICompletionOptions
): Promise<{ data: T; result: AICompletionResult }> {
  const result = await chatWithAI(messages, provider, model, options)

  // Try to extract JSON from the response (handles markdown code blocks)
  let content = result.content.trim()

  // Remove markdown code fences if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    content = jsonMatch[1].trim()
  }

  // Find JSON object in the response
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.slice(firstBrace, lastBrace + 1)
  }

  try {
    const data = JSON.parse(content) as T
    return { data, result }
  } catch {
    throw new Error(`Failed to parse AI response as JSON. Content: ${content.slice(0, 500)}`)
  }
}
