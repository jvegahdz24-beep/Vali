// WorkingMemory — Short-lived context for active conversations
// Uses Redis for persistence across requests, in-process Map for speed
//
// Key functions:
// - setContext(conversationId, key, value, ttlMs?) → set a context value
// - getContext(conversationId, key) → get a context value
// - getAllContext(conversationId) → get all context for a conversation
// - clearContext(conversationId) → clear all context
// - addMessage(conversationId, role, content, metadata?) → add to conversation buffer
// - getRecentMessages(conversationId, limit?) → get recent messages
// - getFormattedContext(conversationId, systemPrompt?) → get formatted context for AI

import { logInfo, logError, logOk, logWarn } from '@/lib/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis';
import { isRedisAvailable } from '@/lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextEntry {
  value: unknown;
  expiresAt: number; // Unix timestamp ms
}

export interface WorkingMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface FormattedContext {
  systemPrompt: string;
  conversationMessages: Array<{ role: string; content: string }>;
  contextData: Record<string, unknown>;
  messageCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_MESSAGES_PER_CONVERSATION = 200;
const REDIS_KEY_PREFIX = 'working_memory:';

// ─── In-process stores ───────────────────────────────────────────────────────

/**
 * Context store: conversationId → (key → { value, expiresAt })
 * Provides nanosecond-speed lookups within a single process.
 */
const contextStore = new Map<string, Map<string, ContextEntry>>();

/**
 * Message buffer: conversationId → WorkingMessage[]
 * Bounded at MAX_MESSAGES_PER_CONVERSATION.
 */
const messageBuffer = new Map<string, WorkingMessage[]>();

/**
 * Periodic eviction interval handle.
 */
let evictionInterval: ReturnType<typeof setInterval> | null = null;

// ─── Cleanup / eviction ───────────────────────────────────────────────────────

/**
 * Remove expired entries from the in-process context store.
 * Runs periodically and on-demand.
 */
function evictExpired(): void {
  const now = Date.now();
  let evictedKeys = 0;
  let evictedConversations = 0;

  for (const [conversationId, keyMap] of contextStore.entries()) {
    for (const [key, entry] of keyMap.entries()) {
      if (entry.expiresAt <= now) {
        keyMap.delete(key);
        evictedKeys++;
      }
    }
    if (keyMap.size === 0) {
      contextStore.delete(conversationId);
      evictedConversations++;
    }
  }

  if (evictedKeys > 0 || evictedConversations > 0) {
    logInfo('WorkingMemory', `Evicted ${evictedKeys} expired keys, ${evictedConversations} empty conversations`);
  }
}

/**
 * Ensure the periodic eviction loop is running (idempotent).
 */
function ensureEvictionLoop(): void {
  if (evictionInterval !== null) return;
  evictionInterval = setInterval(() => {
    evictExpired();
  }, 60_000); // Run every minute
}

// Start eviction on module load
ensureEvictionLoop();

// ─── Redis serialization ─────────────────────────────────────────────────────

function redisKey(conversationId: string, suffix: string): string {
  return `${REDIS_KEY_PREFIX}${conversationId}:${suffix}`;
}

async function saveContextToRedis(conversationId: string, key: string, entry: ContextEntry): Promise<void> {
  try {
    if (await isRedisAvailable()) {
      const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
      await cacheSet(
        'working_memory',
        `${conversationId}:ctx:${key}`,
        entry,
        ttlSeconds,
      );
    }
  } catch {
    // Redis write failure is non-fatal; in-process is primary
  }
}

async function loadContextFromRedis(conversationId: string, key: string): Promise<ContextEntry | null> {
  try {
    if (await isRedisAvailable()) {
      const entry = await cacheGet<ContextEntry>('working_memory', `${conversationId}:ctx:${key}`);
      if (entry) {
        // Don't return expired entries
        if (entry.expiresAt > Date.now()) return entry;
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

async function saveMessagesToRedis(conversationId: string, messages: WorkingMessage[]): Promise<void> {
  try {
    if (await isRedisAvailable()) {
      await cacheSet(
        'working_memory',
        `${conversationId}:messages`,
        messages,
        DEFAULT_TTL_MS / 1000,
      );
    }
  } catch {
    // Non-fatal
  }
}

async function loadMessagesFromRedis(conversationId: string): Promise<WorkingMessage[] | null> {
  try {
    if (await isRedisAvailable()) {
      const result = await cacheGet<WorkingMessage[]>('working_memory', `${conversationId}:messages`);
      if (result) {
        return result;
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

// ─── Main Class ───────────────────────────────────────────────────────────────

export class WorkingMemory {
  /**
   * Set a context value for a conversation.
   */
  static setContext(
    conversationId: string,
    key: string,
    value: unknown,
    ttlMs: number = DEFAULT_TTL_MS,
  ): void {
    const now = Date.now();
    const expiresAt = now + Math.max(1, ttlMs);

    // Ensure the conversation's key map exists
    if (!contextStore.has(conversationId)) {
      contextStore.set(conversationId, new Map());
    }
    const keyMap = contextStore.get(conversationId)!;
    keyMap.set(key, { value, expiresAt });

    // Fire-and-forget to Redis
    saveContextToRedis(conversationId, key, { value, expiresAt }).catch(() => {});

    logInfo('WorkingMemory', `Set context [${conversationId}] ${key} (TTL ${Math.round(ttlMs / 1000)}s)`);
  }

  /**
   * Get a context value for a conversation.
   * Checks in-process store first, then Redis as fallback.
   */
  static async getContext<T = unknown>(
    conversationId: string,
    key: string,
  ): Promise<T | null> {
    // 1. In-process store (fast path)
    const keyMap = contextStore.get(conversationId);
    if (keyMap) {
      const entry = keyMap.get(key);
      if (entry) {
        if (entry.expiresAt > Date.now()) {
          return entry.value as T;
        }
        // Expired — clean up
        keyMap.delete(key);
        if (keyMap.size === 0) contextStore.delete(conversationId);
      }
    }

    // 2. Redis fallback (populate in-process if found)
    const redisEntry = await loadContextFromRedis(conversationId, key);
    if (redisEntry) {
      // Re-hydrate in-process store
      if (!contextStore.has(conversationId)) {
        contextStore.set(conversationId, new Map());
      }
      contextStore.get(conversationId)!.set(key, redisEntry);
      return redisEntry.value as T;
    }

    return null;
  }

  /**
   * Get all non-expired context key-value pairs for a conversation.
   */
  static async getAllContext(conversationId: string): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    const now = Date.now();

    // In-process entries
    const keyMap = contextStore.get(conversationId);
    if (keyMap) {
      for (const [key, entry] of keyMap.entries()) {
        if (entry.expiresAt > now) {
          result[key] = entry.value;
        } else {
          keyMap.delete(key);
        }
      }
      if (keyMap.size === 0) contextStore.delete(conversationId);
    }

    // Try to supplement from Redis by checking known Redis keys.
    // Since we can't SCAN, we rely on the in-process store as the primary source.
    // If in-process is empty, try a bulk load.
    if (Object.keys(result).length === 0) {
      // Check if there's a bulk context stored in Redis
      try {
        if (await isRedisAvailable()) {
          const bulk = await cacheGet<Record<string, ContextEntry>>('working_memory', `${conversationId}:ctx_bulk`);
          if (bulk) {
            for (const [key, entry] of Object.entries(bulk)) {
              if (entry.expiresAt > now) {
                result[key] = entry.value;
              }
            }
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return result;
  }

  /**
   * Clear all context and messages for a conversation.
   */
  static async clearContext(conversationId: string): Promise<void> {
    // In-process cleanup
    contextStore.delete(conversationId);
    messageBuffer.delete(conversationId);

    // Redis cleanup (fire-and-forget individual keys + try bulk)
    try {
      if (await isRedisAvailable()) {
        await cacheInvalidate('working_memory', `${conversationId}:ctx_bulk`);
        await cacheInvalidate('working_memory', `${conversationId}:messages`);
        // Best-effort: clear known context keys
        // Since we may not know all individual keys, clear the bulk key handles it
      }
    } catch {
      // Non-fatal
    }

    logOk('WorkingMemory', `Cleared all context for conversation ${conversationId}`);
  }

  /**
   * Add a message to the conversation buffer.
   * Automatically trims to MAX_MESSAGES_PER_CONVERSATION.
   */
  static async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const message: WorkingMessage = {
      role,
      content,
      metadata,
      timestamp: Date.now(),
    };

    if (!messageBuffer.has(conversationId)) {
      // Try to hydrate from Redis
      const redisMessages = await loadMessagesFromRedis(conversationId);
      messageBuffer.set(conversationId, redisMessages ?? []);
    }

    const buffer = messageBuffer.get(conversationId)!;
    buffer.push(message);

    // Enforce max buffer size (keep most recent)
    if (buffer.length > MAX_MESSAGES_PER_CONVERSATION) {
      const excess = buffer.length - MAX_MESSAGES_PER_CONVERSATION;
      buffer.splice(0, excess);
    }

    // Persist to Redis (fire-and-forget)
    saveMessagesToRedis(conversationId, buffer).catch(() => {});
  }

  /**
   * Get recent messages from the conversation buffer.
   */
  static async getRecentMessages(
    conversationId: string,
    limit: number = 50,
  ): Promise<WorkingMessage[]> {
    // In-process first
    if (messageBuffer.has(conversationId)) {
      const buffer = messageBuffer.get(conversationId)!;
      return buffer.slice(-limit);
    }

    // Try Redis
    const redisMessages = await loadMessagesFromRedis(conversationId);
    if (redisMessages && redisMessages.length > 0) {
      // Rehydrate in-process
      messageBuffer.set(conversationId, redisMessages);
      return redisMessages.slice(-limit);
    }

    return [];
  }

  /**
   * Get a formatted context suitable for passing to an AI model.
   * Combines context data + recent messages into a structured object.
   */
  static async getFormattedContext(
    conversationId: string,
    systemPrompt?: string,
    messageLimit: number = 50,
  ): Promise<FormattedContext> {
    const allContext = await WorkingMemory.getAllContext(conversationId);
    const messages = await WorkingMemory.getRecentMessages(conversationId, messageLimit);

    const conversationMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const effectiveSystemPrompt = systemPrompt ?? 'You are a helpful CRM assistant with access to conversation context and memory.';

    // Inject context data into the system prompt if there's context
    let finalSystemPrompt = effectiveSystemPrompt;
    const contextKeys = Object.keys(allContext);
    if (contextKeys.length > 0) {
      const contextSection = contextKeys
        .map((key) => `- ${key}: ${JSON.stringify(allContext[key])}`)
        .join('\n');

      finalSystemPrompt += `\n\nCurrent context:\n${contextSection}`;
    }

    return {
      systemPrompt: finalSystemPrompt,
      conversationMessages,
      contextData: allContext,
      messageCount: messages.length,
    };
  }

  /**
   * Get the size of in-memory stores (for monitoring / diagnostics).
   */
  static getStats(): {
    activeConversations: number;
    totalContextEntries: number;
    totalBufferedMessages: number;
  } {
    let totalContextEntries = 0;
    for (const keyMap of contextStore.values()) {
      totalContextEntries += keyMap.size;
    }

    let totalBufferedMessages = 0;
    for (const buffer of messageBuffer.values()) {
      totalBufferedMessages += buffer.length;
    }

    return {
      activeConversations: new Set([
        ...contextStore.keys(),
        ...messageBuffer.keys(),
      ]).size,
      totalContextEntries,
      totalBufferedMessages,
    };
  }

  /**
   * Manually trigger eviction of expired entries.
   */
  static evictExpired(): void {
    evictExpired();
  }

  /**
   * Store a bulk context snapshot to Redis (for cross-process recovery).
   * Called periodically or on shutdown.
   */
  static async snapshotToRedis(conversationId: string): Promise<void> {
    const keyMap = contextStore.get(conversationId);
    if (!keyMap || keyMap.size === 0) return;

    const now = Date.now();
    const bulk: Record<string, ContextEntry> = {};
    for (const [key, entry] of keyMap.entries()) {
      if (entry.expiresAt > now) {
        bulk[key] = entry;
      }
    }

    if (Object.keys(bulk).length === 0) return;

    try {
      if (await isRedisAvailable()) {
        await cacheSet(
          'working_memory',
          `${conversationId}:ctx_bulk`,
          bulk,
          DEFAULT_TTL_MS / 1000,
        );
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Remove a specific context key.
   */
  static removeContext(conversationId: string, key: string): void {
    const keyMap = contextStore.get(conversationId);
    if (keyMap) {
      keyMap.delete(key);
      if (keyMap.size === 0) contextStore.delete(conversationId);
    }

    // Fire-and-forget Redis invalidation
    cacheInvalidate('working_memory', `${conversationId}:ctx:${key}`).catch(() => {});
  }
}

export default WorkingMemory;
