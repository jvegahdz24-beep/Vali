// EmotionalStore — Track and analyze emotional states
//
// Key functions:
// - recordEmotion(workspaceId, data) → record an emotional event
// - getContactEmotionalTimeline(contactId, options?) → emotion history
// - getCurrentEmotionalState(contactId) → aggregate recent emotions into current state
// - getEmotionalSummary(contactId) → AI-generated summary of emotional patterns
// - detectEmotionFromText(text) → use AI to detect emotion from text

import { db } from '@/lib/db';
import { chatWithAI } from '@/lib/ai/providers';
import { logInfo, logError, logOk, logWarn } from '@/lib/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis';
import { isRedisAvailable } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmotionData {
  contactId?: string;
  conversationId?: string;
  emotion: string;
  intensity: number; // 0-1 scale
  valence: number; // -1 (negative) to 1 (positive)
  trigger?: string;
  context?: string;
  metadata?: Record<string, unknown>;
  detectedAt?: Date;
}

export type EmotionRecord = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  conversationId: string | null;
  emotion: string;
  intensity: number;
  valence: number;
  trigger: string | null;
  context: string | null;
  metadata: Record<string, unknown> | null;
  detectedAt: Date;
  createdAt: Date;
};

export interface EmotionalTimelineOptions {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  emotion?: string;
}

export interface EmotionalState {
  contactId: string;
  dominantEmotion: string;
  averageValence: number;
  averageIntensity: number;
  emotionDistribution: Record<string, number>;
  trendDirection: 'improving' | 'declining' | 'stable';
  lastUpdated: Date;
}

export interface EmotionDetectionResult {
  emotion: string;
  intensity: number;
  valence: number;
  confidence: number;
}

export interface EmotionalSummary {
  contactId: string;
  summary: string;
  dominantPatterns: string[];
  recommendations: string[];
  overallWellbeing: 'excellent' | 'good' | 'neutral' | 'concerning' | 'poor';
  generatedAt: Date;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'memory:emotional:';
const CACHE_TTL_SECONDS = 180; // 3 minutes — emotional state changes frequently

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

async function setCached(key: string, value: unknown, ttlSeconds = CACHE_TTL_SECONDS): Promise<void> {
  try {
    if (await isRedisAvailable()) {
      await cacheSet(CACHE_PREFIX, key, value, ttlSeconds);
    }
  } catch {
    // Non-fatal
  }
}

// ─── Valid emotion list for normalization ─────────────────────────────────────

const VALID_EMOTIONS = new Set([
  'happy', 'sad', 'angry', 'fearful', 'surprised', 'disgusted',
  'neutral', 'confused', 'frustrated', 'excited', 'anxious',
  'calm', 'hopeful', 'disappointed', 'grateful', 'lonely',
  'confident', 'embarrassed', 'proud', 'jealous', 'content',
  'stressed', 'relieved', 'bored', 'enthusiastic', 'worried',
]);

function normalizeEmotion(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_EMOTIONS.has(lower)) return lower;
  // Map common synonyms
  const synonyms: Record<string, string> = {
    joy: 'happy',
    happiness: 'happy',
    sadness: 'sad',
    depression: 'sad',
    rage: 'angry',
    fury: 'angry',
    irritation: 'frustrated',
    annoyance: 'frustrated',
    fear: 'fearful',
    worry: 'anxious',
    nervous: 'anxious',
    shock: 'surprised',
    peace: 'calm',
    relaxed: 'calm',
    thankful: 'grateful',
    uninterested: 'bored',
    eager: 'enthusiastic',
    upset: 'sad',
    grief: 'sad',
    tension: 'stressed',
    overwhelmed: 'stressed',
  };
  return synonyms[lower] ?? lower;
}

// ─── Main Store Class ────────────────────────────────────────────────────────

export class EmotionalStore {
  /**
   * Record an emotional event.
   */
  static async recordEmotion(
    workspaceId: string,
    data: EmotionData,
  ): Promise<string> {
    const id = uuidv4();
    const emotion = normalizeEmotion(data.emotion);
    const detectedAt = data.detectedAt ?? new Date();

    // Clamp values
    const intensity = Math.max(0, Math.min(1, data.intensity));
    const valence = Math.max(-1, Math.min(1, data.valence));

    try {
      const record = await db.emotionalRecord.create({
        data: {
          id,
          workspaceId,
          contactId: data.contactId ?? null,
          emotion,
          intensity,
          valence,
          context: [data.trigger, data.context].filter(Boolean).join(' | ') || null,
          detectedAt,
        },
      });

      // Invalidate caches for this contact
      if (data.contactId) {
        await cacheInvalidate(CACHE_PREFIX + `state:${data.contactId}`);
        await cacheInvalidate(CACHE_PREFIX + `summary:${data.contactId}`);
      }

      logOk(
        'EmotionalStore',
        `Recorded emotion id=${id} emotion=${emotion} intensity=${intensity.toFixed(2)} valence=${valence.toFixed(2)}`,
      );

      return record.id;
    } catch (err) {
      logError('EmotionalStore', 'record_failed', err);
      throw new Error(`Failed to record emotion: ${(err as Error).message}`);
    }
  }

  /**
   * Get the emotional timeline for a contact.
   */
  static async getContactEmotionalTimeline(
    contactId: string,
    options: EmotionalTimelineOptions = {},
  ): Promise<EmotionRecord[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    try {
      const where: Record<string, unknown> = { contactId };

      if (options.emotion) where.emotion = options.emotion;
      if (options.startDate || options.endDate) {
        where.detectedAt = {};
        if (options.startDate) (where.detectedAt as Record<string, unknown>).gte = options.startDate;
        if (options.endDate) (where.detectedAt as Record<string, unknown>).lte = options.endDate;
      }

      const records = await db.emotionalRecord.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const result: EmotionRecord[] = records.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        contactId: r.contactId,
        conversationId: null,
        emotion: r.emotion,
        intensity: r.intensity,
        valence: r.valence,
        trigger: null,
        context: r.context,
        metadata: null,
        detectedAt: r.detectedAt,
        createdAt: r.createdAt,
      }));

      logOk('EmotionalStore', `Retrieved ${result.length} emotion records for contact ${contactId}`);
      return result;
    } catch (err) {
      logError('EmotionalStore', 'timeline_failed', err);
      throw new Error(`Failed to get emotional timeline: ${(err as Error).message}`);
    }
  }

  /**
   * Aggregate recent emotions to compute a current emotional state.
   */
  static async getCurrentEmotionalState(contactId: string): Promise<EmotionalState> {
    const cacheKey = `state:${contactId}`;
    const cached = await getCached<EmotionalState>(cacheKey);
    if (cached) return cached;

    try {
      // Get last 50 emotion records
      const recent = await db.emotionalRecord.findMany({
        where: { contactId },
        orderBy: { detectedAt: 'desc' },
        take: 50,
      });

      if (recent.length === 0) {
        const emptyState: EmotionalState = {
          contactId,
          dominantEmotion: 'neutral',
          averageValence: 0,
          averageIntensity: 0,
          emotionDistribution: {},
          trendDirection: 'stable',
          lastUpdated: new Date(),
        };
        return emptyState;
      }

      // Compute aggregates
      const emotionCounts: Record<string, number> = {};
      const valences: number[] = [];
      const intensities: number[] = [];

      for (const record of recent) {
        emotionCounts[record.emotion] = (emotionCounts[record.emotion] ?? 0) + 1;
        valences.push(record.valence);
        intensities.push(record.intensity);
      }

      // Dominant emotion
      let dominantEmotion = 'neutral';
      let maxCount = 0;
      for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantEmotion = emotion;
        }
      }

      const averageValence = valences.reduce((a, b) => a + b, 0) / valences.length;
      const averageIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;

      // Normalize distribution to percentages
      const totalRecords = recent.length;
      const emotionDistribution: Record<string, number> = {};
      for (const [emotion, count] of Object.entries(emotionCounts)) {
        emotionDistribution[emotion] = Math.round((count / totalRecords) * 100);
      }

      // Determine trend: compare first half vs second half of recent records
      let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
      if (recent.length >= 6) {
        const mid = Math.floor(recent.length / 2);
        const olderHalf = recent.slice(mid);
        const newerHalf = recent.slice(0, mid);

        const olderAvgValence = olderHalf.reduce((s, r) => s + r.valence, 0) / olderHalf.length;
        const newerAvgValence = newerHalf.reduce((s, r) => s + r.valence, 0) / newerHalf.length;

        const diff = newerAvgValence - olderAvgValence;
        if (diff > 0.15) trendDirection = 'improving';
        else if (diff < -0.15) trendDirection = 'declining';
        else trendDirection = 'stable';
      }

      const state: EmotionalState = {
        contactId,
        dominantEmotion,
        averageValence: Math.round(averageValence * 100) / 100,
        averageIntensity: Math.round(averageIntensity * 100) / 100,
        emotionDistribution,
        trendDirection,
        lastUpdated: new Date(),
      };

      await setCached(cacheKey, state);
      logOk('EmotionalStore', `Computed emotional state for contact ${contactId}: ${dominantEmotion} (${trendDirection})`);
      return state;
    } catch (err) {
      logError('EmotionalStore', 'state_failed', err);
      throw new Error(`Failed to compute emotional state: ${(err as Error).message}`);
    }
  }

  /**
   * Generate an AI-powered emotional summary for a contact.
   */
  static async getEmotionalSummary(contactId: string): Promise<EmotionalSummary> {
    const cacheKey = `summary:${contactId}`;
    const cached = await getCached<EmotionalSummary>(cacheKey);
    if (cached) return cached;

    try {
      // Get the contact info
      const contact = await db.contact.findUnique({
        where: { id: contactId },
        select: { id: true, firstName: true, lastName: true },
      });

      if (!contact) {
        throw new Error(`Contact not found: ${contactId}`);
      }

      // Get last 100 emotion records
      const records = await db.emotionalRecord.findMany({
        where: { contactId },
        orderBy: { detectedAt: 'desc' },
        take: 100,
      });

      if (records.length === 0) {
        const emptySummary: EmotionalSummary = {
          contactId,
          summary: `No emotional data available for ${contact.firstName} ${contact.lastName}.`,
          dominantPatterns: [],
          recommendations: ['Start recording emotional events to build a profile.'],
          overallWellbeing: 'neutral',
          generatedAt: new Date(),
        };
        return emptySummary;
      }

      // Build a data summary for the AI
      const emotionTimeline = records
        .reverse()
        .map(
          (r) =>
            `(${r.detectedAt.toISOString()}) emotion=${r.emotion}, intensity=${r.intensity.toFixed(2)}, valence=${r.valence.toFixed(2)}${r.context ? `, context="${r.context.slice(0, 200)}"` : ''}`,
        )
        .join('\n');

      const prompt = `You are a CRM emotional intelligence assistant. Analyze the emotional data for ${contact.firstName} ${contact.lastName} and provide a summary.

Emotional timeline (oldest → newest):
${emotionTimeline}

Respond with ONLY valid JSON with these fields:
- "summary": 2-3 sentence narrative of the person's emotional journey
- "dominantPatterns": Array of 3-5 strings describing emotional patterns observed
- "recommendations": Array of 3-5 actionable suggestions for improving the relationship
- "overallWellbeing": One of "excellent", "good", "neutral", "concerning", "poor"`;

      const aiResponse = await chatWithAI(
        [
          { role: 'system', content: 'You are a helpful assistant that produces only valid JSON. No markdown.' },
          { role: 'user', content: prompt },
        ],
        'glm',
        undefined,
        { temperature: 0.3 },
      );

      let parsed: {
        summary?: string;
        dominantPatterns?: string[];
        recommendations?: string[];
        overallWellbeing?: string;
      };
      try {
        const rawText = aiResponse.content.trim();
        const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        parsed = JSON.parse(jsonStr);
      } catch {
        logWarn('EmotionalStore', 'AI response was not valid JSON; creating fallback summary');
        parsed = {
          summary: `Emotional analysis of ${records.length} recorded events.`,
          dominantPatterns: ['Insufficient data for pattern analysis'],
          recommendations: ['Continue tracking emotions for better insights'],
          overallWellbeing: 'neutral',
        };
      }

      const validWellbeing = ['excellent', 'good', 'neutral', 'concerning', 'poor'] as const;

      const result: EmotionalSummary = {
        contactId,
        summary: parsed.summary ?? 'Unable to generate emotional summary.',
        dominantPatterns: parsed.dominantPatterns ?? [],
        recommendations: parsed.recommendations ?? [],
        overallWellbeing: validWellbeing.includes(parsed.overallWellbeing as typeof validWellbeing[number])
          ? (parsed.overallWellbeing as EmotionalSummary['overallWellbeing'])
          : 'neutral',
        generatedAt: new Date(),
      };

      await setCached(cacheKey, result, 600); // Cache summaries longer: 10 min
      logOk('EmotionalStore', `Generated emotional summary for contact ${contactId}: ${result.overallWellbeing}`);
      return result;
    } catch (err) {
      logError('EmotionalStore', 'summary_failed', err);
      throw new Error(`Failed to generate emotional summary: ${(err as Error).message}`);
    }
  }

  /**
   * Use AI to detect emotions from text.
   */
  static async detectEmotionFromText(text: string): Promise<EmotionDetectionResult> {
    if (!text || text.trim().length === 0) {
      return {
        emotion: 'neutral',
        intensity: 0,
        valence: 0,
        confidence: 0,
      };
    }

    try {
      const prompt = `Analyze the emotional content of the following text. Respond with ONLY valid JSON.

Text: "${text.slice(0, 1000)}"

JSON fields:
- "emotion": One of: ${Array.from(VALID_EMOTIONS).join(', ')}
- "intensity": Number from 0.0 (no intensity) to 1.0 (maximum intensity)
- "valence": Number from -1.0 (very negative) to 1.0 (very positive)
- "confidence": Number from 0.0 to 1.0 indicating how confident you are in this analysis`;

      const aiResponse = await chatWithAI(
        [
          { role: 'system', content: 'You are an emotion detection system that produces only valid JSON. No markdown.' },
          { role: 'user', content: prompt },
        ],
        'glm',
        undefined,
        { temperature: 0.1 },
      );

      let parsed: { emotion?: string; intensity?: number; valence?: number; confidence?: number };
      try {
        const rawText = aiResponse.content.trim();
        const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        parsed = JSON.parse(jsonStr);
      } catch {
        logWarn('EmotionalStore', 'AI emotion detection returned invalid JSON; defaulting to neutral');
        return {
          emotion: 'neutral',
          intensity: 0.3,
          valence: 0,
          confidence: 0.2,
        };
      }

      const emotion = normalizeEmotion(parsed.emotion ?? 'neutral');
      const intensity = Math.max(0, Math.min(1, parsed.intensity ?? 0));
      const valence = Math.max(-1, Math.min(1, parsed.valence ?? 0));
      const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0));

      logInfo(
        'EmotionalStore',
        `Detected emotion: ${emotion} (intensity=${intensity.toFixed(2)}, valence=${valence.toFixed(2)}, confidence=${confidence.toFixed(2)})`,
      );

      return { emotion, intensity, valence, confidence };
    } catch (err) {
      logError('EmotionalStore', 'emotion_detection_failed', err);
      return {
        emotion: 'neutral',
        intensity: 0,
        valence: 0,
        confidence: 0,
      };
    }
  }
}

export default EmotionalStore;
