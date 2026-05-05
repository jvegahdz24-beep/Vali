// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0.0 — Embeddings Service
// Generates vector embeddings using GLM embedding API
// Falls back to deterministic hash-based vectors if API unavailable
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto'
import { config } from '@/lib/config'
import { logInfo, logError, logWarn } from '@/lib/logger'

// Vector dimensions (must match pgvector column)
export const EMBEDDING_DIMENSIONS = 768

// In-memory cache for embeddings (avoid regenerating)
const embeddingCache = new Map<string, number[]>()
const CACHE_MAX_SIZE = 5000

// ─── GLM Embedding API ────────────────────────────────────────

async function generateGLMToken(): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) throw new Error('ZAI_API_KEY not set')
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

/**
 * Generate embedding vector using GLM embedding-3 model.
 * Returns a normalized float array of EMBEDDING_DIMENSIONS dimensions.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check cache
  const cacheKey = text.slice(0, 500) // Use first 500 chars as cache key
  const cached = embeddingCache.get(cacheKey)
  if (cached) return cached

  try {
    const token = await generateGLMToken()
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embedding-3',
        input: text.slice(0, 2000), // GLM embedding supports up to ~8k tokens
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`GLM embedding API ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const rawEmbedding = data?.data?.[0]?.embedding

    if (!rawEmbedding || !Array.isArray(rawEmbedding)) {
      throw new Error('Invalid embedding response from GLM')
    }

    // Normalize the vector
    const vector = normalizeVector(rawEmbedding)

    // Cache it
    if (embeddingCache.size < CACHE_MAX_SIZE) {
      embeddingCache.set(cacheKey, vector)
    }

    return vector
  } catch (err) {
    logWarn('EMBEDDINGS', 'glm_api_failed', { error: err instanceof Error ? err.message : String(err) })
    // Fall back to hash-based embedding
    return generateHashEmbedding(text)
  }
}

/**
 * Generate a batch of embeddings (up to 20 texts at once).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // For now, generate one at a time (GLM supports batching but keep it simple)
  return Promise.all(texts.map(t => generateEmbedding(t)))
}

/**
 * Hash-based fallback embedding.
 * Deterministic, not semantically meaningful, but allows the system to work
 * without an embedding API. Produces vectors in the same dimensionality.
 */
function generateHashEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0)
  // Create multiple hash segments for different dimensions
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const segment = `${text}:${i}`
    const hash = crypto.createHash('sha256').update(segment).digest()
    // Convert first 4 bytes to a float between -1 and 1
    const intVal = hash.readUInt32BE(0)
    vector[i] = (intVal / 4294967295) * 2 - 1
  }
  return normalizeVector(vector)
}

/**
 * Normalize a vector to unit length (required for cosine similarity).
 */
export function normalizeVector(vector: number[]): number[] {
  let magnitude = 0
  for (let i = 0; i < vector.length; i++) {
    magnitude += vector[i] * vector[i]
  }
  magnitude = Math.sqrt(magnitude)
  if (magnitude === 0) return vector
  return vector.map(v => v / magnitude)
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dotProduct = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
  }
  // Both vectors should already be normalized
  return dotProduct
}

/**
 * Generate a content hash for deduplication.
 */
export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
}

/**
 * Clear the embedding cache (useful for memory management).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear()
}
