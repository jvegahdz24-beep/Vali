// BehavioralStore — Detect and store behavioral patterns
//
// Key functions:
// - updatePattern(workspaceId, contactId, patternType, patternValue, confidence) → upsert pattern
// - getPatterns(contactId) → all patterns for a contact
// - analyzeResponseTime(workspaceId, contactId) → analyze message response times
// - analyzeEngagement(workspaceId, contactId) → analyze engagement level
// - detectPatterns(workspaceId, contactId) → run all pattern analyses

import { db } from '@/lib/db';
import { logInfo, logError, logOk, logWarn } from '@/lib/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis';
import { isRedisAvailable } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PatternType =
  | 'response_time'
  | 'engagement_level'
  | 'communication_style'
  | 'preferred_channel'
  | 'availability_pattern'
  | 'topic_preference'
  | 'decision_speed'
  | 'follow_up_pattern';

export interface BehavioralPattern {
  id: string;
  workspaceId: string;
  contactId: string | null;
  patternType: PatternType;
  patternValue: Record<string, unknown>;
  confidence: number;
  sampleSize: number;
  detectedAt: Date;
  updatedAt: Date;
}

export interface ResponseTimeAnalysis {
  averageResponseTimeMs: number;
  medianResponseTimeMs: number;
  fastestResponseTimeMs: number;
  slowestResponseTimeMs: number;
  p90ResponseTimeMs: number;
  stdDevResponseTimeMs: number;
  sampleSize: number;
  trend: 'faster' | 'slower' | 'stable';
  averageResponseTimeHuman: string;
}

export interface EngagementAnalysis {
  overallScore: number; // 0-100
  messageFrequency: number; // messages per week
  averageMessageLength: number; // characters
  initiationRate: number; // 0-1 how often contact initiates
  responseRate: number; // 0-1 how often they respond
  activeDaysCount: number; // days with activity in last 30 days
  preferredTimeOfDay: string;
  scoreLabel: 'highly_engaged' | 'engaged' | 'moderate' | 'low' | 'disengaged';
}

export interface DetectedPatterns {
  responseTime: ResponseTimeAnalysis | null;
  engagement: EngagementAnalysis | null;
  patterns: BehavioralPattern[];
  analyzedAt: Date;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'memory:behavioral:';
const CACHE_TTL_SECONDS = 600; // 10 minutes

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// ─── Main Store Class ────────────────────────────────────────────────────────

export class BehavioralStore {
  /**
   * Upsert a behavioral pattern.
   */
  static async updatePattern(
    workspaceId: string,
    contactId: string,
    patternType: PatternType,
    patternValue: Record<string, unknown>,
    confidence: number,
    sampleSize: number = 1,
  ): Promise<string> {
    // Clamp confidence
    const clampedConfidence = Math.max(0, Math.min(1, confidence));

    try {
      // Check for existing pattern
      const existing = await db.behavioralPattern.findFirst({
        where: {
          workspaceId,
          contactId,
          patternType,
        },
      });

      let patternId: string;

      if (existing) {
        patternId = existing.id;
        await db.behavioralPattern.update({
          where: { id: existing.id },
          data: {
            patternValue: JSON.stringify(patternValue),
            confidence: clampedConfidence,
            sampleSize,
            updatedAt: new Date(),
          },
        });
      } else {
        patternId = uuidv4();
        await db.behavioralPattern.create({
          data: {
            id: patternId,
            workspaceId,
            contactId,
            patternType,
            patternValue: JSON.stringify(patternValue),
            confidence: clampedConfidence,
            sampleSize,
          },
        });
      }

      await cacheInvalidate(CACHE_PREFIX + `patterns:${contactId}`);
      await cacheInvalidate(CACHE_PREFIX + `detected:${contactId}`);

      logOk(
        'BehavioralStore',
        `Updated pattern id=${patternId} type=${patternType} confidence=${clampedConfidence.toFixed(2)}`,
      );

      return patternId;
    } catch (err) {
      logError('BehavioralStore', 'update_failed', err);
      throw new Error(`Failed to update behavioral pattern: ${(err as Error).message}`);
    }
  }

  /**
   * Get all behavioral patterns for a contact.
   */
  static async getPatterns(contactId: string): Promise<BehavioralPattern[]> {
    const cacheKey = `patterns:${contactId}`;
    const cached = await getCached<BehavioralPattern[]>(cacheKey);
    if (cached) return cached;

    try {
      const records = await db.behavioralPattern.findMany({
        where: { contactId },
        orderBy: { updatedAt: 'desc' },
      });

      const patterns: BehavioralPattern[] = records.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        contactId: r.contactId,
        patternType: r.patternType as PatternType,
        patternValue: JSON.parse(r.patternValue),
        confidence: r.confidence,
        sampleSize: r.sampleSize,
        detectedAt: r.firstObserved,
        updatedAt: r.updatedAt,
      }));

      await setCached(cacheKey, patterns);
      logOk('BehavioralStore', `Retrieved ${patterns.length} patterns for contact ${contactId}`);
      return patterns;
    } catch (err) {
      logError('BehavioralStore', 'get_patterns_failed', err);
      throw new Error(`Failed to get behavioral patterns: ${(err as Error).message}`);
    }
  }

  /**
   * Analyze message response times using raw SQL.
   */
  static async analyzeResponseTime(
    workspaceId: string,
    contactId: string,
  ): Promise<ResponseTimeAnalysis> {
    try {
      // Use raw SQL to compute response times by pairing consecutive messages
      // between the contact and other participants in conversations
      const rows = await db.$queryRawUnsafe<
        Array<{
          response_time_ms: number;
        }>
      >(
        `WITH conversation_messages AS (
           SELECT
             m.id,
             m."conversationId",
             m."senderId",
             m."createdAt"
           FROM "Message" m
           JOIN "Conversation" c ON m."conversationId" = c.id
           WHERE c."workspaceId" = $1
             AND (
               m."senderId" = $2
               OR m."recipientId" = $2
             )
             AND m."createdAt" >= NOW() - INTERVAL '90 days'
         ),
         paired_messages AS (
           SELECT
             curr."createdAt" AS current_time,
             prev."createdAt" AS prev_time,
             EXTRACT(EPOCH FROM (curr."createdAt" - prev."createdAt")) * 1000 AS response_time_ms
           FROM conversation_messages curr
           JOIN conversation_messages prev
             ON curr."conversationId" = prev."conversationId"
             AND curr."createdAt" > prev."createdAt"
             AND curr."senderId" != prev."senderId"
             AND (curr."senderId" = $2 OR prev."senderId" = $2)
           WHERE EXTRACT(EPOCH FROM (curr."createdAt" - prev."createdAt")) * 1000
                 BETWEEN 1000 AND 86400000
         )
         SELECT response_time_ms FROM paired_messages`,
        workspaceId,
        contactId,
      );

      if (rows.length === 0) {
        return {
          averageResponseTimeMs: 0,
          medianResponseTimeMs: 0,
          fastestResponseTimeMs: 0,
          slowestResponseTimeMs: 0,
          p90ResponseTimeMs: 0,
          stdDevResponseTimeMs: 0,
          sampleSize: 0,
          trend: 'stable',
          averageResponseTimeHuman: 'N/A',
        };
      }

      const times = rows.map((r) => r.response_time_ms).sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);
      const avg = sum / times.length;
      const mid = Math.floor(times.length / 2);
      const median = times.length % 2 !== 0 ? times[mid] : (times[mid - 1] + times[mid]) / 2;

      // Determine trend: compare first half vs second half
      let trend: 'faster' | 'slower' | 'stable' = 'stable';
      if (times.length >= 6) {
        const halfIdx = Math.floor(times.length / 2);
        // First half = older responses (already sorted, so smaller values are first)
        // But we need chronological order, so compare recent vs older by using original order
        const recentHalf = rows.slice(Math.floor(rows.length / 2)).map((r) => r.response_time_ms);
        const olderHalf = rows.slice(0, Math.floor(rows.length / 2)).map((r) => r.response_time_ms);
        const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
        const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
        const diff = olderAvg - recentAvg; // positive means getting faster

        if (diff > avg * 0.15) trend = 'faster';
        else if (diff < -avg * 0.15) trend = 'slower';
        else trend = 'stable';
      }

      const analysis: ResponseTimeAnalysis = {
        averageResponseTimeMs: Math.round(avg),
        medianResponseTimeMs: Math.round(median),
        fastestResponseTimeMs: Math.round(times[0]),
        slowestResponseTimeMs: Math.round(times[times.length - 1]),
        p90ResponseTimeMs: Math.round(percentile(times, 90)),
        stdDevResponseTimeMs: Math.round(standardDeviation(times)),
        sampleSize: times.length,
        trend,
        averageResponseTimeHuman: formatDuration(avg),
      };

      logOk(
        'BehavioralStore',
        `Response time analysis for contact ${contactId}: avg=${analysis.averageResponseTimeHuman}, n=${times.length}, trend=${trend}`,
      );

      return analysis;
    } catch (err) {
      logError('BehavioralStore', 'response_time_failed', err);
      throw new Error(`Failed to analyze response time: ${(err as Error).message}`);
    }
  }

  /**
   * Analyze engagement level for a contact.
   */
  static async analyzeEngagement(
    workspaceId: string,
    contactId: string,
  ): Promise<EngagementAnalysis> {
    try {
      // Get message stats from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Message count and average length
      const msgStats = await db.$queryRawUnsafe<
        Array<{ count: bigint; avg_length: number }>
      >(
        `SELECT
           COUNT(*)::bigint AS count,
           AVG(LENGTH(content))::numeric AS avg_length
         FROM "Message" m
         JOIN "Conversation" c ON m."conversationId" = c.id
         WHERE c."workspaceId" = $1
           AND (m."senderId" = $2 OR m."recipientId" = $2)
           AND m."createdAt" >= $3`,
        workspaceId,
        contactId,
        thirtyDaysAgo,
      );

      const totalMessages = Number(msgStats[0].count);
      const averageMessageLength = msgStats[0].avg_length ? Math.round(Number(msgStats[0].avg_length)) : 0;

      // Messages sent BY the contact
      const sentStats = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM "Message" m
         JOIN "Conversation" c ON m."conversationId" = c.id
         WHERE c."workspaceId" = $1
           AND m."senderId" = $2
           AND m."createdAt" >= $3`,
        workspaceId,
        contactId,
        thirtyDaysAgo,
      );
      const sentCount = Number(sentStats[0].count);

      // Messages received BY the contact (sent by someone else to the contact)
      const receivedStats = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM "Message" m
         JOIN "Conversation" c ON m."conversationId" = c.id
         WHERE c."workspaceId" = $1
           AND m."recipientId" = $2
           AND m."createdAt" >= $3`,
        workspaceId,
        contactId,
        thirtyDaysAgo,
      );
      const receivedCount = Number(receivedStats[0].count);

      // Active days
      const activeDays = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(DISTINCT DATE(m."createdAt"))::bigint AS count
         FROM "Message" m
         JOIN "Conversation" c ON m."conversationId" = c.id
         WHERE c."workspaceId" = $1
           AND (m."senderId" = $2 OR m."recipientId" = $2)
           AND m."createdAt" >= $3`,
        workspaceId,
        contactId,
        thirtyDaysAgo,
      );
      const activeDaysCount = Number(activeDays[0].count);

      // Preferred time of day
      const timeOfDay = await db.$queryRawUnsafe<
        Array<{ hour: number; count: bigint }>
      >(
        `SELECT EXTRACT(HOUR FROM m."createdAt")::int AS hour, COUNT(*)::bigint AS count
         FROM "Message" m
         JOIN "Conversation" c ON m."conversationId" = c.id
         WHERE c."workspaceId" = $1
           AND m."senderId" = $2
           AND m."createdAt" >= $3
         GROUP BY EXTRACT(HOUR FROM m."createdAt")
         ORDER BY count DESC
         LIMIT 1`,
        workspaceId,
        contactId,
        thirtyDaysAgo,
      );

      let preferredTimeOfDay = 'unknown';
      if (timeOfDay.length > 0) {
        const hour = timeOfDay[0].hour;
        if (hour >= 5 && hour < 12) preferredTimeOfDay = 'morning';
        else if (hour >= 12 && hour < 17) preferredTimeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) preferredTimeOfDay = 'evening';
        else preferredTimeOfDay = 'night';
      }

      // Compute derived metrics
      const messageFrequency = totalMessages / 4.286; // per week (30/7 ≈ 4.286)
      const initiationRate = totalMessages > 0 ? sentCount / totalMessages : 0;
      const responseRate = receivedCount > 0 ? Math.min(sentCount / receivedCount, 1) : 0;

      // Engagement score (0-100): weighted composite
      const frequencyScore = Math.min(messageFrequency / 10, 1) * 30; // up to 30 pts
      const responseScore = responseRate * 25; // up to 25 pts
      const initiationScore = initiationRate * 20; // up to 20 pts
      const consistencyScore = Math.min(activeDaysCount / 20, 1) * 25; // up to 25 pts

      const overallScore = Math.round(frequencyScore + responseScore + initiationScore + consistencyScore);

      // Score label
      let scoreLabel: EngagementAnalysis['scoreLabel'];
      if (overallScore >= 80) scoreLabel = 'highly_engaged';
      else if (overallScore >= 60) scoreLabel = 'engaged';
      else if (overallScore >= 40) scoreLabel = 'moderate';
      else if (overallScore >= 20) scoreLabel = 'low';
      else scoreLabel = 'disengaged';

      const analysis: EngagementAnalysis = {
        overallScore,
        messageFrequency: Math.round(messageFrequency * 10) / 10,
        averageMessageLength,
        initiationRate: Math.round(initiationRate * 100) / 100,
        responseRate: Math.round(responseRate * 100) / 100,
        activeDaysCount,
        preferredTimeOfDay,
        scoreLabel,
      };

      logOk(
        'BehavioralStore',
        `Engagement analysis for contact ${contactId}: score=${overallScore}/100 (${scoreLabel})`,
      );

      return analysis;
    } catch (err) {
      logError('BehavioralStore', 'engagement_failed', err);
      throw new Error(`Failed to analyze engagement: ${(err as Error).message}`);
    }
  }

  /**
   * Run all behavioral pattern analyses and store results.
   */
  static async detectPatterns(
    workspaceId: string,
    contactId: string,
  ): Promise<DetectedPatterns> {
    const cacheKey = `detected:${contactId}`;
    const cached = await getCached<DetectedPatterns>(cacheKey);
    if (cached) {
      logInfo('BehavioralStore', `Using cached detected patterns for contact ${contactId}`);
      return cached;
    }

    let responseTime: ResponseTimeAnalysis | null = null;
    let engagement: EngagementAnalysis | null = null;

    // Analyze response time
    try {
      responseTime = await BehavioralStore.analyzeResponseTime(workspaceId, contactId);

      if (responseTime.sampleSize > 0) {
        await BehavioralStore.updatePattern(
          workspaceId,
          contactId,
          'response_time',
          {
            averageMs: responseTime.averageResponseTimeMs,
            medianMs: responseTime.medianResponseTimeMs,
            p90Ms: responseTime.p90ResponseTimeMs,
            trend: responseTime.trend,
            averageHuman: responseTime.averageResponseTimeHuman,
          },
          Math.min(responseTime.sampleSize / 10, 1),
          responseTime.sampleSize,
        );
      }
    } catch (err) {
      logWarn('BehavioralStore', `Response time analysis failed: ${(err as Error).message}`);
    }

    // Analyze engagement
    try {
      engagement = await BehavioralStore.analyzeEngagement(workspaceId, contactId);

      await BehavioralStore.updatePattern(
        workspaceId,
        contactId,
        'engagement_level',
        {
          overallScore: engagement.overallScore,
          scoreLabel: engagement.scoreLabel,
          messageFrequency: engagement.messageFrequency,
          preferredTimeOfDay: engagement.preferredTimeOfDay,
        },
        Math.min(engagement.activeDaysCount / 15, 1),
        engagement.activeDaysCount,
      );
    } catch (err) {
      logWarn('BehavioralStore', `Engagement analysis failed: ${(err as Error).message}`);
    }

    // Communication style analysis
    try {
      if (engagement && engagement.averageMessageLength > 0) {
        let style = 'concise';
        if (engagement.averageMessageLength > 500) style = 'verbose';
        else if (engagement.averageMessageLength > 200) style = 'detailed';
        else if (engagement.averageMessageLength < 50) style = 'terse';

        await BehavioralStore.updatePattern(
          workspaceId,
          contactId,
          'communication_style',
          {
            style,
            averageMessageLength: engagement.averageMessageLength,
          },
          0.5,
          engagement.activeDaysCount,
        );
      }
    } catch (err) {
      logWarn('BehavioralStore', `Communication style analysis failed: ${(err as Error).message}`);
    }

    // Get all stored patterns
    const patterns = await BehavioralStore.getPatterns(contactId);

    const result: DetectedPatterns = {
      responseTime,
      engagement,
      patterns,
      analyzedAt: new Date(),
    };

    await setCached(cacheKey, result);
    logOk('BehavioralStore', `Completed pattern detection for contact ${contactId}`);

    return result;
  }

  /**
   * Get a single pattern by ID.
   */
  static async getPatternById(id: string): Promise<BehavioralPattern | null> {
    try {
      const record = await db.behavioralPattern.findUnique({ where: { id } });
      if (!record) return null;

      return {
        id: record.id,
        workspaceId: record.workspaceId,
        contactId: record.contactId,
        patternType: record.patternType as PatternType,
        patternValue: JSON.parse(record.patternValue),
        confidence: record.confidence,
        sampleSize: record.sampleSize,
        detectedAt: record.firstObserved,
        updatedAt: record.updatedAt,
      };
    } catch (err) {
      logError('BehavioralStore', 'get_pattern_failed', err, { id });
      throw new Error(`Failed to get pattern: ${(err as Error).message}`);
    }
  }

  /**
   * Delete a pattern by ID.
   */
  static async deletePattern(id: string): Promise<void> {
    try {
      const pattern = await db.behavioralPattern.findUnique({
        where: { id },
        select: { contactId: true },
      });

      if (pattern) {
        await db.behavioralPattern.delete({ where: { id } });
        await cacheInvalidate(CACHE_PREFIX + `patterns:${pattern.contactId}`);
        await cacheInvalidate(CACHE_PREFIX + `detected:${pattern.contactId}`);
        logOk('BehavioralStore', `Deleted pattern id=${id}`);
      }
    } catch (err) {
      logError('BehavioralStore', 'delete_failed', err, { id });
      throw new Error(`Failed to delete pattern: ${(err as Error).message}`);
    }
  }
}

export default BehavioralStore;
