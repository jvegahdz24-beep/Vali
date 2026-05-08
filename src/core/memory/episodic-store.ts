// EpisodicStore — Chronological memory of interactions
//
// Key functions:
// - recordEpisode(workspaceId, data) → creates a new episode
// - getContactTimeline(contactId, options?) → get episodes for a contact, ordered by time
// - getConversationTimeline(conversationId) → episodes for a specific conversation
// - searchEpisodes(workspaceId, query, options?) → text search across episodes
// - getRecentEpisodes(workspaceId, limit?) → latest episodes across workspace
// - generateSummary(episodeIds) → AI summary of selected episodes

import { db } from '@/lib/db';
import { chatWithAI } from '@/lib/ai/providers';
import { logInfo, logError, logOk, logWarn } from '@/lib/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis';
import { isRedisAvailable } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EpisodeType =
  | 'message'
  | 'email'
  | 'call'
  | 'meeting'
  | 'interaction'
  | 'system_event'
  | 'note';

export interface EpisodeData {
  conversationId?: string;
  contactId?: string;
  type: EpisodeType;
  summary: string;
  content?: string;
  metadata?: Record<string, unknown>;
  sentiment?: 'positive' | 'negative' | 'neutral';
  tags?: string[];
  occurredAt?: Date;
}

export interface EpisodeRecord {
  id: string;
  workspaceId: string;
  conversationId: string | null;
  contactId: string | null;
  type: EpisodeType;
  summary: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  sentiment: string | null;
  tags: string[];
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineOptions {
  limit?: number;
  offset?: number;
  type?: EpisodeType;
  startDate?: Date;
  endDate?: Date;
}

export interface EpisodeSearchOptions {
  limit?: number;
  type?: EpisodeType;
  contactId?: string;
  sentiment?: string;
}

export interface EpisodeSummary {
  episodeIds: string[];
  summary: string;
  keyPoints: string[];
  overallSentiment: string;
  generatedAt: Date;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'memory:episodic:';
const CACHE_TTL_SECONDS = 300;

async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (await isRedisAvailable()) {
      const result = await cacheGet<T>(CACHE_PREFIX, key);
      if (result !== null) return result;
    }
  } catch {
    // Non-fatal
  }
  return null;
}

async function setCached(key: string, value: unknown): Promise<void> {
  try {
    if (await isRedisAvailable()) {
      await cacheSet(CACHE_PREFIX, key, value, CACHE_TTL_SECONDS);
    }
  } catch {
    // Non-fatal
  }
}

// ─── Main Store Class ────────────────────────────────────────────────────────

export class EpisodicStore {
  /**
   * Record a new interaction episode.
   */
  static async recordEpisode(
    workspaceId: string,
    data: EpisodeData,
  ): Promise<string> {
    const id = uuidv4();
    const occurredAt = data.occurredAt ?? new Date();
    const tags = data.tags ?? [];

    try {
      const episode = await db.episodicMemory.create({
        data: {
          id,
          workspaceId,
          conversationId: data.conversationId ?? null,
          contactId: data.contactId ?? null,
          episodeType: data.type,
          summary: data.summary,
          rawContent: data.content ?? null,
          emotionalTone: data.sentiment ?? null,
          keyTopics: JSON.stringify(tags),
          occurredAt,
        },
      });

      logOk(
        'EpisodicStore',
        `Recorded episode id=${id} type=${data.type} contactId=${data.contactId ?? 'none'}`,
      );

      return episode.id;
    } catch (err) {
      logError('EpisodicStore', 'record_failed', err);
      throw new Error(`Failed to record episode: ${(err as Error).message}`);
    }
  }

  /**
   * Get chronological episodes for a contact.
   */
  static async getContactTimeline(
    contactId: string,
    options: TimelineOptions = {},
  ): Promise<EpisodeRecord[]> {
    const cacheKey = `timeline:contact:${contactId}:${JSON.stringify(options)}`;
    const cached = await getCached<EpisodeRecord[]>(cacheKey);
    if (cached) return cached;

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    try {
      const where: Record<string, unknown> = {
        contactId,
      };

      if (options.type) where.type = options.type;
      if (options.startDate || options.endDate) {
        where.occurredAt = {};
        if (options.startDate) (where.occurredAt as Record<string, unknown>).gte = options.startDate;
        if (options.endDate) (where.occurredAt as Record<string, unknown>).lte = options.endDate;
      }

      const episodes = await db.episodicMemory.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const records: EpisodeRecord[] = episodes.map((ep) => ({
        id: ep.id,
        workspaceId: ep.workspaceId,
        conversationId: ep.conversationId,
        contactId: ep.contactId,
        type: ep.episodeType as EpisodeType,
        summary: ep.summary ?? '',
        content: ep.rawContent,
        metadata: null,
        sentiment: ep.emotionalTone,
        tags: ep.keyTopics ? JSON.parse(ep.keyTopics) : [],
        occurredAt: ep.occurredAt,
        createdAt: ep.createdAt,
        updatedAt: ep.createdAt,
      }));

      await setCached(cacheKey, records);
      logOk('EpisodicStore', 'contact_timeline_retrieved', { contactId, count: records.length });
      return records;
    } catch (err) {
      logError('EpisodicStore', 'contact_timeline_failed', err);
      throw new Error(`Failed to get contact timeline: ${(err as Error).message}`);
    }
  }

  /**
   * Get episodes for a specific conversation ordered by time.
   */
  static async getConversationTimeline(
    conversationId: string,
    limit: number = 100,
  ): Promise<EpisodeRecord[]> {
    const cacheKey = `timeline:conversation:${conversationId}:${limit}`;
    const cached = await getCached<EpisodeRecord[]>(cacheKey);
    if (cached) return cached;

    try {
      const episodes = await db.episodicMemory.findMany({
        where: { conversationId },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      });

      const records: EpisodeRecord[] = episodes.map((ep) => ({
        id: ep.id,
        workspaceId: ep.workspaceId,
        conversationId: ep.conversationId,
        contactId: ep.contactId,
        type: ep.episodeType as EpisodeType,
        summary: ep.summary ?? '',
        content: ep.rawContent,
        metadata: null,
        sentiment: ep.emotionalTone,
        tags: ep.keyTopics ? JSON.parse(ep.keyTopics) : [],
        occurredAt: ep.occurredAt,
        createdAt: ep.createdAt,
        updatedAt: ep.createdAt,
      }));

      await setCached(cacheKey, records);
      logOk('EpisodicStore', 'conversation_timeline_retrieved', { conversationId, count: records.length });
      return records;
    } catch (err) {
      logError('EpisodicStore', 'conversation_timeline_failed', err);
      throw new Error(`Failed to get conversation timeline: ${(err as Error).message}`);
    }
  }

  /**
   * Text search across episodes using PostgreSQL full-text search (Prisma mode).
   */
  static async searchEpisodes(
    workspaceId: string,
    query: string,
    options: EpisodeSearchOptions = {},
  ): Promise<EpisodeRecord[]> {
    const limit = options.limit ?? 20;

    try {
      // Build search conditions with case-insensitive matching on summary and content
      const where: Record<string, unknown> = {
        workspaceId,
        OR: [
          { summary: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      };

      if (options.type) where.type = options.type;
      if (options.contactId) where.contactId = options.contactId;
      if (options.sentiment) where.sentiment = options.sentiment;

      const episodes = await db.episodicMemory.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit,
      });

      const records: EpisodeRecord[] = episodes.map((ep) => ({
        id: ep.id,
        workspaceId: ep.workspaceId,
        conversationId: ep.conversationId,
        contactId: ep.contactId,
        type: ep.episodeType as EpisodeType,
        summary: ep.summary ?? '',
        content: ep.rawContent,
        metadata: null,
        sentiment: ep.emotionalTone,
        tags: ep.keyTopics ? JSON.parse(ep.keyTopics) : [],
        occurredAt: ep.occurredAt,
        createdAt: ep.createdAt,
        updatedAt: ep.createdAt,
      }));

      logOk('EpisodicStore', 'episodes_searched', { query, count: records.length });
      return records;
    } catch (err) {
      logError('EpisodicStore', 'search_failed', err);
      throw new Error(`Failed to search episodes: ${(err as Error).message}`);
    }
  }

  /**
   * Get the most recent episodes across the workspace.
   */
  static async getRecentEpisodes(
    workspaceId: string,
    limit: number = 20,
  ): Promise<EpisodeRecord[]> {
    const cacheKey = `recent:${workspaceId}:${limit}`;
    const cached = await getCached<EpisodeRecord[]>(cacheKey);
    if (cached) return cached;

    try {
      const episodes = await db.episodicMemory.findMany({
        where: { workspaceId },
        orderBy: { occurredAt: 'desc' },
        take: limit,
      });

      const records: EpisodeRecord[] = episodes.map((ep) => ({
        id: ep.id,
        workspaceId: ep.workspaceId,
        conversationId: ep.conversationId,
        contactId: ep.contactId,
        type: ep.episodeType as EpisodeType,
        summary: ep.summary ?? '',
        content: ep.rawContent,
        metadata: null,
        sentiment: ep.emotionalTone,
        tags: ep.keyTopics ? JSON.parse(ep.keyTopics) : [],
        occurredAt: ep.occurredAt,
        createdAt: ep.createdAt,
        updatedAt: ep.createdAt,
      }));

      await setCached(cacheKey, records);
      logOk('EpisodicStore', 'recent_episodes_retrieved', { workspaceId, count: records.length });
      return records;
    } catch (err) {
      logError('EpisodicStore', 'recent_episodes_failed', err);
      throw new Error(`Failed to get recent episodes: ${(err as Error).message}`);
    }
  }

  /**
   * Use AI to generate a summary of selected episodes.
   */
  static async generateSummary(episodeIds: string[]): Promise<EpisodeSummary> {
    if (episodeIds.length === 0) {
      throw new Error('At least one episode ID is required for summarization');
    }

    try {
      const episodes = await db.episodicMemory.findMany({
        where: { id: { in: episodeIds } },
        orderBy: { occurredAt: 'asc' },
      });

      if (episodes.length === 0) {
        logWarn('EpisodicStore', `No episodes found for IDs: ${episodeIds.join(', ')}`);
        throw new Error('No episodes found for the provided IDs');
      }

      // Build a chronological transcript for the AI
      const transcript = episodes
        .map(
          (ep, idx) =>
            `[${idx + 1}] (${ep.episodeType} @ ${ep.occurredAt.toISOString()}) ${ep.summary ?? ''}${ep.rawContent ? `\n   Details: ${ep.rawContent.slice(0, 500)}` : ''}${ep.emotionalTone ? `\n   Sentiment: ${ep.emotionalTone}` : ''}`,
        )
        .join('\n\n');

      const prompt = `You are a CRM memory assistant. Summarize the following interaction episodes into a concise overview.
Identify 3-5 key points and determine the overall sentiment.

Format your response as JSON with these fields:
- "summary": A 2-3 sentence narrative summary
- "keyPoints": Array of 3-5 bullet-point strings
- "overallSentiment": One of "positive", "negative", "neutral", or "mixed"

Episodes:
${transcript}

Respond with ONLY valid JSON, no markdown.`;

      const aiResponse = await chatWithAI(
        [
          { role: 'system', content: 'You are a helpful assistant that produces only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        'glm',
        undefined,
        { temperature: 0.3 },
      );

      // Parse the AI response
      let parsed: { summary?: string; keyPoints?: string[]; overallSentiment?: string };
      try {
        // Strip potential markdown code fences
        const rawText = aiResponse.content.trim();
        const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        parsed = JSON.parse(jsonStr);
      } catch {
        logWarn('EpisodicStore', 'AI response was not valid JSON; creating fallback summary');
        parsed = {
          summary: `Summary of ${episodes.length} interaction episodes.`,
          keyPoints: episodes.map((ep) => ep.summary ?? '').filter(Boolean),
          overallSentiment: 'neutral',
        };
      }

      const result: EpisodeSummary = {
        episodeIds: episodes.map((ep) => ep.id),
        summary: parsed.summary ?? 'Unable to generate summary.',
        keyPoints: parsed.keyPoints ?? [],
        overallSentiment: parsed.overallSentiment ?? 'neutral',
        generatedAt: new Date(),
      };

      logOk('EpisodicStore', `Generated summary for ${episodes.length} episodes`);
      return result;
    } catch (err) {
      logError('EpisodicStore', 'summary_failed', err);
      throw new Error(`Failed to generate episode summary: ${(err as Error).message}`);
    }
  }

  /**
   * Get a single episode by ID.
   */
  static async getById(id: string): Promise<EpisodeRecord | null> {
    try {
      const ep = await db.episodicMemory.findUnique({ where: { id } });
      if (!ep) return null;

      return {
        id: ep.id,
        workspaceId: ep.workspaceId,
        conversationId: ep.conversationId,
        contactId: ep.contactId,
        type: ep.episodeType as EpisodeType,
        summary: ep.summary ?? '',
        content: ep.rawContent,
        metadata: null,
        sentiment: ep.emotionalTone,
        tags: ep.keyTopics ? JSON.parse(ep.keyTopics) : [],
        occurredAt: ep.occurredAt,
        createdAt: ep.createdAt,
        updatedAt: ep.createdAt,
      };
    } catch (err) {
      logError('EpisodicStore', 'get_by_id_failed', err, { id });
      throw new Error(`Failed to get episode: ${(err as Error).message}`);
    }
  }

  /**
   * Delete an episode by ID.
   */
  static async delete(id: string): Promise<void> {
    try {
      await db.episodicMemory.delete({ where: { id } });
      logOk('EpisodicStore', 'episode_deleted', { id });
    } catch (err) {
      logError('EpisodicStore', 'delete_failed', err, { id });
      throw new Error(`Failed to delete episode: ${(err as Error).message}`);
    }
  }
}

export default EpisodicStore;
