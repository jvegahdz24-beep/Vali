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
  return (
    message.content ||
    message.reasoning_content ||
    ''
  )
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

async function callGLMDirect(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) throw new Error('ZAI_API_KEY not set')
  const token = generateGLMToken(apiKey)
  const start = Date.now()

  for (const model of GLM_DIRECT_MODELS) {
    try {
      console.log(`[AI 1] Llamando modelo GLM: ${model}...`)
      const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
      })
      if (!res.ok) {
        console.warn(`[AI] GLM direct ${model} returned ${res.status}`)
        continue
      }
      const data = await res.json()
      console.log(`[AI 2] Response RAW (${model}):`, JSON.stringify(data, null, 2))
      const content = extractGLMContent(data)
      if (content && content.trim()) {
        console.log(`[AI] GLM direct ${model} success (${Date.now() - start}ms, ${content.length} chars)`)
        return {
          content,
          model,
          provider: 'groq' as const,
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

export class GroqProvider implements AIProviderInstance {
  name = 'groq' as const
  displayName = 'Groq'
  defaultModel = AI_PROVIDERS.groq.defaultModel
  availableModels = [...AI_PROVIDERS.groq.models]

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const start = Date.now()
    const targetMaxTokens = options?.maxTokens ?? 4096

    // PRIMARY: Call GLM API directly (free models, reliable, no proxy dependency)
    try {
      console.log('[AI] GroqProvider → trying GLM direct (primary)...')
      const result = await callGLMDirect(messages, { ...options, maxTokens: targetMaxTokens })
      console.log(`[AI] GroqProvider → GLM direct success in ${Date.now() - start}ms`)
      return result
    } catch (glmErr) {
      const msg = glmErr instanceof Error ? glmErr.message : String(glmErr)
      console.warn(`[AI] GLM direct failed (${msg.slice(0, 80)}), trying SDK fallback`)
    }

    // FALLBACK: Try z.ai SDK (may work if proxy gets X-Token configured)
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

    throw new Error('All providers failed: GLM direct + SDK')
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
  groq: new GroqProvider(),
  deepseek: new DeepSeekProvider(),
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
}

/**
 * Get a provider instance by name.
 * Returns Groq as default if provider not found.
 */
export function getProvider(providerName: string): AIProviderInstance {
  const provider = providerInstances[providerName.toLowerCase()]
  if (!provider) {
    console.warn(`[AI] Unknown provider "${providerName}", falling back to Groq`)
    return providerInstances.groq
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
  provider: string = 'groq',
  model?: string,
  options?: AICompletionOptions
): Promise<AICompletionResult> {
  const providerInstance = getProvider(provider)

  const mergedOptions: AICompletionOptions = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    model: model || options?.model,
    topP: options?.topP,
    frequencyPenalty: options?.frequencyPenalty,
    presencePenalty: options?.presencePenalty,
  }

  try {
    const result = await providerInstance.chat(messages, mergedOptions)
    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[AI] Provider "${provider}" failed:`, errMsg)

    // Fallback to Groq if primary provider fails
    if (provider !== 'groq') {
      console.warn('[AI] Falling back to Groq...')
      try {
        const fallback = await providerInstances.groq.chat(messages, mergedOptions)
        return fallback
      } catch (fallbackError) {
        const fallbackErrMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        console.error('[AI] Groq fallback also failed:', fallbackErrMsg)
        throw new Error(`All AI providers failed. Primary: ${errMsg}. Fallback: ${fallbackErrMsg}`)
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
  provider: string = 'groq',
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
