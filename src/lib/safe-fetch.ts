// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Safe API Fetchers
// Centralized fetch wrappers that NEVER throw.
// Returns safe defaults on error, timeout, or network failure.
// ═══════════════════════════════════════════════════════════════

/**
 * Safe fetch with timeout and JSON parsing.
 * NEVER throws — returns fallback on any error.
 */
export async function safeFetch<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
  fallback: T
): Promise<T> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) {
      console.warn(`[FRONTEND] safeFetch ${url} returned ${response.status}`)
      return fallback
    }
    const data = await response.json()
    return data as T
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Unknown'
    const msg = err instanceof Error ? err.message : String(err)
    if (name === 'AbortError') {
      console.warn(`[FRONTEND] safeFetch timeout: ${url} (${timeoutMs}ms)`)
    } else {
      console.warn(`[FRONTEND] safeFetch error: ${url} — ${msg}`)
    }
    return fallback
  } finally {
    clearTimeout(id)
  }
}

/**
 * Safe GET with JSON parsing and typed fallback.
 */
export async function safeGet<T>(url: string, fallback: T, timeoutMs = 10000): Promise<T> {
  return safeFetch<T>(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } }, timeoutMs, fallback)
}

/**
 * Safe POST with JSON body.
 */
export async function safePost<TReq, TRes>(
  url: string,
  body: TReq,
  fallback: TRes,
  timeoutMs = 15000
): Promise<TRes> {
  return safeFetch<TRes>(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
    fallback
  )
}
