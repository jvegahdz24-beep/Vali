// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — Redis Client
// Singleton connection with auto-reconnect, pooling, and prefix
// Graceful degradation: if Redis is down, operations fail softly
// ═══════════════════════════════════════════════════════════════

import Redis from 'ioredis'
import { config, isDev } from '@/lib/config'
import { logError, logWarn, logOk, logInfo } from '@/lib/logger'

// ─── Singleton ─────────────────────────────────────────────────

let _redis: Redis | null = null
let _redisSubscriber: Redis | null = null

function createRedisClient(options?: { lazy?: boolean }): Redis {
  const client = new Redis(config.REDIS_URL, {
    keyPrefix: config.REDIS_PREFIX,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000)
      return delay
    },
    reconnectOnError(err) {
      // Reconnect on READONLY errors (Redis Cluster failover)
      return err.message.includes('READONLY')
    },
    lazyConnect: options?.lazy ?? true,
    // Performance tuning
    enableReadyCheck: true,
    enableOfflineQueue: true,
  })

  client.on('ready', () => {
    logOk('REDIS', 'connected', { url: config.REDIS_URL.replace(/\/\/.*@/, '//***@') })
  })

  client.on('error', (err) => {
    logError('REDIS', 'connection_error', err)
  })

  client.on('close', () => {
    logWarn('REDIS', 'connection_closed', {})
  })

  client.on('reconnecting', () => {
    logInfo('REDIS', 'reconnecting', {})
  })

  return client
}

/**
 * Get or create the main Redis client.
 * Lazy-connects on first call.
 */
export async function getRedis(): Promise<Redis> {
  if (!_redis) {
    _redis = createRedisClient()
    await _redis.connect().catch((err) => {
      logError('REDIS', 'initial_connect_failed', err)
      _redis = null
      throw err
    })
  }
  return _redis
}

/**
 * Get or create a dedicated subscriber client.
 * Redis requires a separate connection for subscribe operations.
 */
export async function getRedisSubscriber(): Promise<Redis> {
  if (!_redisSubscriber) {
    _redisSubscriber = createRedisClient()
    await _redisSubscriber.connect().catch((err) => {
      logError('REDIS', 'subscriber_connect_failed', err)
      _redisSubscriber = null
      throw err
    })
  }
  return _redisSubscriber
}

/**
 * Check if Redis is available and connected.
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedis()
    return client.status === 'ready'
  } catch {
    return false
  }
}

// ─── Key Builders ──────────────────────────────────────────────

export const redisKeys = {
  session: (sessionId: string) => `session:${sessionId}`,
  sessionRefresh: (userId: string) => `refresh:${userId}`,
  rateLimit: (identifier: string, window: string) => `rl:${identifier}:${window}`,
  cache: (namespace: string, key: string) => `cache:${namespace}:${key}`,
  eventStream: (eventType: string) => `events:${eventType}`,
  eventDLQ: () => 'dlq:events',
  agentState: (agentId: string) => `agent:state:${agentId}`,
  whatsappConnection: (workspaceId: string) => `whatsapp:conn:${workspaceId}`,
  healthCheck: () => 'health:last-check',
  lock: (resource: string) => `lock:${resource}`,
} as const

// ─── Cache Helpers ─────────────────────────────────────────────

export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  try {
    const redis = await getRedis()
    const data = await redis.get(redisKeys.cache(namespace, key))
    if (!data) return null
    return JSON.parse(data) as T
  } catch {
    return null // Graceful degradation
  }
}

export async function cacheSet(
  namespace: string,
  key: string,
  value: unknown,
  ttlSeconds: number = config.REDIS_TTL_DEFAULT,
): Promise<void> {
  try {
    const redis = await getRedis()
    await redis.set(redisKeys.cache(namespace, key), JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // Graceful degradation
  }
}

export async function cacheInvalidate(namespace: string, key?: string): Promise<void> {
  try {
    const redis = await getRedis()
    if (key) {
      await redis.del(redisKeys.cache(namespace, key))
    } else {
      // Delete all keys in namespace using SCAN
      const pattern = redisKeys.cache(namespace, '*')
      const stream = redis.scanStream({ match: pattern, count: 100 })
      const pipeline = redis.pipeline()
      stream.on('data', (keys: string[]) => {
        for (const k of keys) pipeline.del(k)
      })
      await new Promise<void>((resolve) => {
        stream.on('end', async () => {
          await pipeline.exec()
          resolve()
        })
      })
    }
  } catch {
    // Graceful degradation
  }
}

// ─── Distributed Lock ──────────────────────────────────────────

export async function acquireLock(
  resource: string,
  ttlSeconds: number = 30,
): Promise<{ acquired: boolean; unlock: () => Promise<void> }> {
  try {
    const redis = await getRedis()
    const lockKey = redisKeys.lock(resource)
    const lockValue = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const acquired = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX')

    if (acquired === 'OK') {
      return {
        acquired: true,
        unlock: async () => {
          // Only release if we still own the lock (Lua script for atomicity)
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `
          await redis.eval(script, 1, lockKey, lockValue).catch(() => {})
        },
      }
    }

    return { acquired: false, unlock: async () => {} }
  } catch {
    return { acquired: false, unlock: async () => {} }
  }
}

// ─── Graceful Shutdown ─────────────────────────────────────────

export async function closeRedis(): Promise<void> {
  const promises: Promise<void>[] = []
  if (_redis) {
    promises.push(_redis.quit().then(() => { _redis = null }).catch(() => { _redis = null }))
  }
  if (_redisSubscriber) {
    promises.push(_redisSubscriber.quit().then(() => { _redisSubscriber = null }).catch(() => { _redisSubscriber = null }))
  }
  await Promise.allSettled(promises)
}

// ─── Health Check ──────────────────────────────────────────────

export async function redisHealthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  error?: string
}> {
  try {
    const redis = await getRedis()
    const start = Date.now()
    await redis.ping()
    const latencyMs = Date.now() - start
    return { status: 'healthy', latencyMs }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: -1,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
