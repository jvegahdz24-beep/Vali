// SemanticStore — Vector-based memory storage and retrieval using pgvector
//
// Key functions:
// - store(workspaceId, content, category, contactId?, source?, importance?) → stores content with embedding
// - search(workspaceId, query, limit?, filters?) → returns similar memories by vector distance
// - searchByContact(contactId, query, limit?) → search within a specific contact's memories
// - delete(id) → soft delete
// - getStats(workspaceId) → memory count by category

import { db } from '@/lib/db';
import {
  generateEmbedding,
  contentHash,
  EMBEDDING_DIMENSIONS,
} from '@/lib/embeddings';
import { logInfo, logError, logOk, logWarn } from '@/lib/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis';
import { isRedisAvailable } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryCategory {
  conversation: 'conversation';
  document: 'document';
  preference: 'preference';
  fact: 'fact';
  instruction: 'instruction';
  context: 'context';
}

export type Category = MemoryCategory[keyof MemoryCategory];

export interface MemorySource {
  chat: 'chat';
  email: 'email';
  document: 'document';
  system: 'system';
  manual: 'manual';
  api: 'api';
}

export type Source = MemorySource[keyof MemorySource];

export interface StoreOptions {
  contactId?: string;
  source?: Source;
  importance?: number; // 0-1 scale
}

export interface SearchFilters {
  category?: Category;
  contactId?: string;
  source?: Source;
  minImportance?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface MemoryResult {
  id: string;
  workspaceId: string;
  contactId: string | null;
  content: string;
  contentHash: string;
  category: string;
  source: string;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  distance: number;
  similarity: number;
}

export interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  recentCount: number;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'memory:semantic:';
const CACHE_TTL_SECONDS = 300; // 5 minutes

async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (await isRedisAvailable()) {
      const result = await cacheGet<T>(CACHE_PREFIX, key);
      if (result !== null) return result;
    }
  } catch {
    // Cache miss is non-fatal
  }
  return null;
}

async function setCached(key: string, value: unknown): Promise<void> {
  try {
    if (await isRedisAvailable()) {
      await cacheSet(CACHE_PREFIX, key, value, CACHE_TTL_SECONDS);
    }
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Main Store Class ────────────────────────────────────────────────────────

export class SemanticStore {
  /**
   * Store content with an embedding for later semantic retrieval.
   * De-duplicates by content hash within the same workspace.
   */
  static async store(
    workspaceId: string,
    content: string,
    category: Category,
    options: StoreOptions = {},
  ): Promise<string> {
    const id = uuidv4();
    const hash = contentHash(content);

    // Check for duplicates
    try {
      const existing: Array<{ id: string }> = await db.$queryRawUnsafe(
        `SELECT id FROM "MemoryEmbedding"
         WHERE "workspaceId" = $1 AND "contentHash" = $2 AND "deletedAt" IS NULL
         LIMIT 1`,
        workspaceId,
        hash,
      );

      if (existing.length > 0) {
        logInfo(`SemanticStore`, `Duplicate content hash ${hash} — skipping store, existing id=${existing[0].id}`);
        return existing[0].id;
      }
    } catch (err) {
      logError('SemanticStore', 'duplicate_check_failed', err);
      // Continue — we'd rather store a duplicate than lose data
    }

    // Generate embedding
    let embedding: number[];
    try {
      embedding = await generateEmbedding(content);
    } catch (err) {
      logError('SemanticStore', 'embedding_generation_failed', err, { content: content.slice(0, 80) });
      throw new Error(`Failed to generate embedding: ${(err as Error).message}`);
    }

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      logError('SemanticStore', 'embedding_dimension_mismatch', new Error(`got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`));
      throw new Error(`Embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`);
    }

    const embeddingStr = `[${embedding.join(',')}]`;
    const importance = options.importance ?? 0.5;
    const source = options.source ?? 'system';

    try {
      await db.$queryRawUnsafe(
        `INSERT INTO "MemoryEmbedding"
           (id, "workspaceId", "contactId", content, "contentHash", category, source, importance, "createdAt", "updatedAt", embedding)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9::vector)`,
        id,
        workspaceId,
        options.contactId ?? null,
        content,
        hash,
        category,
        source,
        importance,
        embeddingStr,
      );

      // Invalidate stats cache
      await cacheInvalidate(CACHE_PREFIX, `stats:${workspaceId}`);

      logOk('SemanticStore', 'stored_memory', { id, category, source, importance });
      return id;
    } catch (err) {
      logError('SemanticStore', 'insert_failed', err);
      throw new Error(`Failed to store memory: ${(err as Error).message}`);
    }
  }

  /**
   * Search memories by vector similarity to a natural-language query.
   */
  static async search(
    workspaceId: string,
    query: string,
    limit: number = 10,
    filters: SearchFilters = {},
  ): Promise<MemoryResult[]> {
    // Check cache
    const cacheKey = `${workspaceId}:${contentHash(query)}:${limit}:${JSON.stringify(filters)}`;
    const cached = await getCached<MemoryResult[]>(cacheKey);
    if (cached) {
      logInfo('SemanticStore', `Cache hit for search query (first 40 chars): ${query.slice(0, 40)}…`);
      return cached;
    }

    // Generate embedding for the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      logError('SemanticStore', 'query_embedding_failed', err);
      throw new Error(`Failed to generate query embedding: ${(err as Error).message}`);
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build dynamic WHERE clauses
    const conditions: string[] = [`"workspaceId" = $2`, `"deletedAt" IS NULL`, `embedding IS NOT NULL`];
    const params: unknown[] = [embeddingStr, workspaceId];
    let paramIndex = 3;

    if (filters.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.contactId) {
      conditions.push(`"contactId" = $${paramIndex}`);
      params.push(filters.contactId);
      paramIndex++;
    }

    if (filters.source) {
      conditions.push(`source = $${paramIndex}`);
      params.push(filters.source);
      paramIndex++;
    }

    if (filters.minImportance !== undefined) {
      conditions.push(`importance >= $${paramIndex}`);
      params.push(filters.minImportance);
      paramIndex++;
    }

    if (filters.createdAfter) {
      conditions.push(`"createdAt" >= $${paramIndex}`);
      params.push(filters.createdAfter);
      paramIndex++;
    }

    if (filters.createdBefore) {
      conditions.push(`"createdAt" <= $${paramIndex}`);
      params.push(filters.createdBefore);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT *, embedding <=> $1::vector AS distance
      FROM "MemoryEmbedding"
      WHERE ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    try {
      const rows = await db.$queryRawUnsafe<
        Array<{
          id: string;
          workspaceId: string;
          contactId: string | null;
          content: string;
          contentHash: string;
          category: string;
          source: string;
          importance: number;
          createdAt: Date;
          updatedAt: Date;
          distance: number;
        }>
      >(sql, ...params);

      const results: MemoryResult[] = rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        contactId: row.contactId,
        content: row.content,
        contentHash: row.contentHash,
        category: row.category,
        source: row.source,
        importance: row.importance,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        distance: row.distance,
        similarity: 1 - row.distance,
      }));

      // Cache results
      await setCached(cacheKey, results);

      logOk('SemanticStore', `Search returned ${results.length} results for query (first 40 chars): ${query.slice(0, 40)}…`);
      return results;
    } catch (err) {
      logError('SemanticStore', 'search_failed', err);
      throw new Error(`Semantic search failed: ${(err as Error).message}`);
    }
  }

  /**
   * Search memories scoped to a specific contact.
   */
  static async searchByContact(
    contactId: string,
    query: string,
    limit: number = 10,
  ): Promise<MemoryResult[]> {
    // First resolve the contact's workspaceId
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: { workspaceId: true },
    });

    if (!contact) {
      logWarn('SemanticStore', `Contact not found: ${contactId}`);
      throw new Error(`Contact not found: ${contactId}`);
    }

    return SemanticStore.search(contact.workspaceId, query, limit, {
      contactId,
    });
  }

  /**
   * Soft-delete a memory by ID.
   */
  static async delete(id: string): Promise<void> {
    try {
      // First look up the workspaceId for cache invalidation
      const memory = await db.$queryRawUnsafe<Array<{ workspaceId: string }>>(
        `SELECT "workspaceId" FROM "MemoryEmbedding" WHERE id = $1 AND "deletedAt" IS NULL`,
        id,
      );

      if (memory.length === 0) {
        logWarn('SemanticStore', `Memory not found or already deleted: ${id}`);
        return;
      }

      await db.$queryRawUnsafe(
        `UPDATE "MemoryEmbedding" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        id,
      );

      await cacheInvalidate(CACHE_PREFIX, `stats:${memory[0].workspaceId}`);

      logOk('SemanticStore', 'memory_deleted', { id });
    } catch (err) {
      logError('SemanticStore', 'delete_failed', err, { id });
      throw new Error(`Failed to delete memory: ${(err as Error).message}`);
    }
  }

  /**
   * Get memory statistics for a workspace.
   */
  static async getStats(workspaceId: string): Promise<MemoryStats> {
    const cacheKey = `stats:${workspaceId}`;
    const cached = await getCached<MemoryStats>(cacheKey);
    if (cached) return cached;

    try {
      // Total count
      const totalRows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "MemoryEmbedding"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        workspaceId,
      );
      const total = Number(totalRows[0].count);

      // By category
      const categoryRows = await db.$queryRawUnsafe<Array<{ category: string; count: bigint }>>(
        `SELECT category, COUNT(*)::bigint AS count FROM "MemoryEmbedding"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
         GROUP BY category
         ORDER BY count DESC`,
        workspaceId,
      );
      const byCategory: Record<string, number> = {};
      for (const row of categoryRows) {
        byCategory[row.category] = Number(row.count);
      }

      // By source
      const sourceRows = await db.$queryRawUnsafe<Array<{ source: string; count: bigint }>>(
        `SELECT source, COUNT(*)::bigint AS count FROM "MemoryEmbedding"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
         GROUP BY source
         ORDER BY count DESC`,
        workspaceId,
      );
      const bySource: Record<string, number> = {};
      for (const row of sourceRows) {
        bySource[row.source] = Number(row.count);
      }

      // Recent count (last 7 days)
      const recentRows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "MemoryEmbedding"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= NOW() - INTERVAL '7 days'`,
        workspaceId,
      );
      const recentCount = Number(recentRows[0].count);

      const stats: MemoryStats = { total, byCategory, bySource, recentCount };
      await setCached(cacheKey, stats);

      logOk('SemanticStore', `Stats for workspace ${workspaceId}: ${total} total memories`);
      return stats;
    } catch (err) {
      logError('SemanticStore', 'stats_failed', err);
      throw new Error(`Failed to get memory stats: ${(err as Error).message}`);
    }
  }

  /**
   * Retrieve a single memory by ID.
   */
  static async getById(id: string): Promise<MemoryResult | null> {
    try {
      const rows = await db.$queryRawUnsafe<
        Array<{
          id: string;
          workspaceId: string;
          contactId: string | null;
          content: string;
          contentHash: string;
          category: string;
          source: string;
          importance: number;
          createdAt: Date;
          updatedAt: Date;
        }>
      >(
        `SELECT id, "workspaceId", "contactId", content, "contentHash", category, source, importance, "createdAt", "updatedAt"
         FROM "MemoryEmbedding"
         WHERE id = $1 AND "deletedAt" IS NULL`,
        id,
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        contactId: row.contactId,
        content: row.content,
        contentHash: row.contentHash,
        category: row.category,
        source: row.source,
        importance: row.importance,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        distance: 0,
        similarity: 1,
      };
    } catch (err) {
      logError('SemanticStore', 'get_by_id_failed', err, { id });
      throw new Error(`Failed to get memory: ${(err as Error).message}`);
    }
  }
}

export default SemanticStore;
