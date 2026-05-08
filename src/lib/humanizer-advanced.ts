// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Advanced Humanizer Engine v2.0
// Goes far beyond regex: per-contact style learning, AI refinement,
// emotional modulation, contextual delays, anti-detection measures.
// All message content in Spanish. Server-side only (uses Prisma + AI).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import { logWarn, logOk, logError } from '@/lib/logger'
import {
  humanizeResponse,
  enforceIdentity,
  stripMarkdown,
} from '@/lib/ai/humanizer'

// ═══════════════════════════════════════════════════════════════
// 1. TYPES
// ═══════════════════════════════════════════════════════════════

export interface ContactStyleProfile {
  contactId: string
  avgMessageLength: number          // chars
  emojiFrequency: number            // 0.0 – 1.0
  punctuationStyle: 'minimal' | 'normal' | 'excessive'
  formalityLevel: number            // 0.0 (muy casual) – 1.0 (muy formal)
  slangUsage: number                // 0.0 – 1.0
  avgResponseTimeMs: number         // milliseconds between messages
  energyLevel: number               // 0.0 (tranquilo) – 1.0 (emocionado)
  preferredGreeting: string         // most used greeting pattern
  totalMessagesAnalyzed: number
  lastAnalyzedAt: Date
}

export interface HumanizationContext {
  contactId?: string
  workspaceId?: string
  conversationId?: string
  recentMessages?: string[]         // last few inbound messages for emotional context
  isComplexQuestion?: boolean
  contactName?: string
}

export interface SplitMessagePart {
  content: string
  delayMs: number
}

// Used for personality persistence per contact
interface PersonalityState {
  usedExpressions: string[]
  usedGreetings: string[]
  warmthLevel: number               // 0.0 – 1.0
  lastResponseEnergy: number
  messagesSent: number
}

// ═══════════════════════════════════════════════════════════════
// 2. IN-MEMORY CACHES
// ═══════════════════════════════════════════════════════════════

// TTL: 30 minutes for style profiles
const STYLE_CACHE = new Map<string, { profile: ContactStyleProfile; expiresAt: number }>()
const STYLE_CACHE_TTL_MS = 30 * 60 * 1000

// Personality state per contact (persists for the session)
const PERSONALITY_CACHE = new Map<string, PersonalityState>()

// Max items to keep per personality cache entry
const MAX_USED_EXPRESSIONS = 50
const MAX_USED_GREETINGS = 15

// ═══════════════════════════════════════════════════════════════
// 3. PER-CONTACT STYLE LEARNING
// ═══════════════════════════════════════════════════════════════

/**
 * Analyzes a contact's message history to build a communication style profile.
 * Looks at inbound messages from the last 100 messages across all conversations.
 */
export async function analyzeContactStyle(contactId: string): Promise<ContactStyleProfile> {
  // Check cache first
  const cached = STYLE_CACHE.get(contactId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile
  }

  try {
    // Get all conversations for this contact
    const conversations = await db.conversation.findMany({
      where: { contactId, status: 'active' },
      select: { id: true },
    })

    const conversationIds = conversations.map(c => c.id)
    if (conversationIds.length === 0) {
      return getDefaultProfile(contactId)
    }

    // Get last 100 inbound messages (contact's own messages)
    const messages = await db.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        direction: 'inbound',
        type: 'text',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { content: true, createdAt: true },
    })

    if (messages.length < 2) {
      return getDefaultProfile(contactId)
    }

    // ── Compute style metrics ──
    const texts = messages.map(m => m.content)
    const lengths = texts.map(t => t.length)
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length

    // Emoji frequency: count emoji characters vs total characters
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu
    let totalEmojis = 0
    let totalChars = 0
    for (const text of texts) {
      const emojis = text.match(emojiRegex)
      if (emojis) totalEmojis += emojis.length
      totalChars += text.replace(emojiRegex, '').length
    }
    const emojiFrequency = totalChars > 0 ? Math.min(totalEmojis / totalChars, 1) : 0

    // Punctuation style
    let exclamations = 0
    let questions = 0
    let periods = 0
    for (const text of texts) {
      exclamations += (text.match(/!/g) || []).length
      questions += (text.match(/\?/g) || []).length
      periods += (text.match(/\./g) || []).length
    }
    const punctPerMessage = (exclamations + questions + periods) / texts.length
    const punctuationStyle: ContactStyleProfile['punctuationStyle'] =
      punctPerMessage < 0.3 ? 'minimal'
        : punctPerMessage > 2.5 ? 'excessive'
          : 'normal'

    // Formality level: detect formal patterns
    const formalPatterns = [
      /buenos días/gi, /buenas tardes/gi, /buenas noches/gi,
      /estimado/gi, /atentamente/gi, /agradezco/gi,
      /me gustaría/gi, /quisiera/gi, /le comento/gi,
      /a la brevedad/gi, /sin embargo/gi, /no obstante/gi,
    ]
    let formalHits = 0
    for (const text of texts) {
      for (const pat of formalPatterns) {
        if (pat.test(text)) formalHits++
      }
    }
    const formalityLevel = Math.min(formalHits / texts.length, 1)

    // Slang usage
    const slangPatterns = [
      /órale/gi, /neta/gi, /chévere/gi, /chido/gi, /telate/gi,
      /carnal/gi, /wey/gi, /güey/gi, /buenardo/gi, /a huevo/gi,
      /sale/gi, /plz/gi, /xD/gi, /jaja/gi, /jeje/gi,
      /nos vemos/gi, /un chorro/gi, /fresa/gi,
    ]
    let slangHits = 0
    for (const text of texts) {
      for (const pat of slangPatterns) {
        if (pat.test(text)) slangHits++
      }
    }
    const slangUsage = Math.min(slangHits / texts.length, 1)

    // Average response time (time between consecutive inbound messages)
    const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    let responseTimes: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime()
      // Only count reasonable gaps (between 5 seconds and 24 hours)
      if (diff > 5000 && diff < 24 * 60 * 60 * 1000) {
        responseTimes.push(diff)
      }
    }
    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 120_000 // default: 2 minutes

    // Energy level: based on caps, emojis, exclamation marks
    let capsCount = 0
    for (const text of texts) {
      const upperWords = text.split(/\s+/).filter(w => w.length > 1 && w === w.toUpperCase())
      capsCount += upperWords.length
    }
    const energyLevel = Math.min(
      (capsCount / texts.length) * 0.3 +
      emojiFrequency * 0.3 +
      (exclamations / texts.length) * 0.4,
      1
    )

    // Preferred greeting: find most common opening pattern
    const greetingPatterns: Record<string, RegExp> = {
      'hola': /^hola\b/i,
      'qué onda': /^qué\s*onda/i,
      'buenos días': /^buenos\s*días/i,
      'buenas tardes': /^buenas\s*tardes/i,
      'buenas noches': /^buenas\s*noches/i,
      'buen día': /^buen\s*día/i,
      'qué tal': /^qué\s*tal/i,
      'ey': /^ey\b/i,
      'quiúbole': /^quiúbole/i,
    }
    const greetingCounts: Record<string, number> = {}
    for (const text of texts) {
      const trimmed = text.trim()
      for (const [name, regex] of Object.entries(greetingPatterns)) {
        if (regex.test(trimmed)) {
          greetingCounts[name] = (greetingCounts[name] || 0) + 1
        }
      }
    }
    const preferredGreeting = Object.entries(greetingCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'hola'

    const profile: ContactStyleProfile = {
      contactId,
      avgMessageLength: Math.round(avgLength),
      emojiFrequency: Math.round(emojiFrequency * 100) / 100,
      punctuationStyle,
      formalityLevel: Math.round(formalityLevel * 100) / 100,
      slangUsage: Math.round(slangUsage * 100) / 100,
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      energyLevel: Math.round(energyLevel * 100) / 100,
      preferredGreeting,
      totalMessagesAnalyzed: texts.length,
      lastAnalyzedAt: new Date(),
    }

    // Store in memory cache
    STYLE_CACHE.set(contactId, {
      profile,
      expiresAt: Date.now() + STYLE_CACHE_TTL_MS,
    })

    // Persist to NexusMemory (behavioral category)
    await persistStyleToMemory(profile)

    return profile
  } catch (error) {
    logWarn('AI', 'analyzeContactStyle', {
      contactId,
      error: error instanceof Error ? error.message : String(error),
    })
    return getDefaultProfile(contactId)
  }
}

/**
 * Get a default style profile for contacts with insufficient history.
 */
function getDefaultProfile(contactId: string): ContactStyleProfile {
  return {
    contactId,
    avgMessageLength: 35,
    emojiFrequency: 0.05,
    punctuationStyle: 'normal',
    formalityLevel: 0.3,
    slangUsage: 0.1,
    avgResponseTimeMs: 120_000,
    energyLevel: 0.3,
    preferredGreeting: 'hola',
    totalMessagesAnalyzed: 0,
    lastAnalyzedAt: new Date(),
  }
}

/**
 * Persist style profile to NexusMemory as behavioral data.
 */
async function persistStyleToMemory(profile: ContactStyleProfile): Promise<void> {
  try {
    // We store under a synthetic userId "system" since style profiles are
    // contact-level, not user-level. The key includes the contactId.
    const memoryKey = `contact_style_${profile.contactId}`
    const memoryValue = JSON.stringify({
      avgMessageLength: profile.avgMessageLength,
      emojiFrequency: profile.emojiFrequency,
      punctuationStyle: profile.punctuationStyle,
      formalityLevel: profile.formalityLevel,
      slangUsage: profile.slangUsage,
      energyLevel: profile.energyLevel,
      preferredGreeting: profile.preferredGreeting,
    })

    await db.nexusMemory.upsert({
      where: {
        userId_key: {
          userId: 'system_humanizer',
          key: memoryKey,
        },
      },
      create: {
        userId: 'system_humanizer',
        category: 'behavioral',
        key: memoryKey,
        value: memoryValue,
        source: 'system',
        importance: 3,
      },
      update: {
        value: memoryValue,
        lastAccessed: new Date(),
        accessCount: { increment: 1 },
      },
    })
  } catch {
    // Non-critical — don't let persistence failure block the flow
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. CONTEXTUAL DELAY SYSTEM
// ═══════════════════════════════════════════════════════════════

/**
 * Returns an appropriate typing delay in milliseconds based on:
 * - Response text length
 * - Contact's average response speed
 * - Whether the question is complex
 */
export async function getSendDelay(
  text: string,
  contactId?: string,
  context?: HumanizationContext,
): Promise<number> {
  let delay = 0
  const len = text.length

  // Base delay by message length
  if (len < 20) {
    delay = randomBetween(500, 2000)
  } else if (len <= 100) {
    delay = randomBetween(2000, 5000)
  } else {
    delay = randomBetween(5000, 12000)
  }

  // Add delay for complex responses (multiple paragraphs)
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0)
  if (paragraphs.length > 1) {
    delay += randomBetween(2000, 4000) * (paragraphs.length - 1)
  }

  // Adjust based on contact's typing speed
  if (contactId) {
    try {
      const profile = await analyzeContactStyle(contactId)
      const avgMs = profile.avgResponseTimeMs

      if (avgMs < 60_000) {
        // Contact types fast (< 1 min avg) → reduce delays by 30%
        delay = Math.round(delay * 0.7)
      } else if (avgMs > 300_000) {
        // Contact types slow (> 5 min avg) → increase delays by 20%
        delay = Math.round(delay * 1.2)
      }
    } catch {
      // Use default delay
    }
  }

  // Thinking pause for complex questions
  if (context?.isComplexQuestion) {
    delay += randomBetween(3000, 8000)
  }

  return Math.max(delay, 300) // minimum 300ms
}

/**
 * Returns a delay between split message parts (2-6 seconds).
 */
export function getInterPartDelay(): number {
  return randomBetween(2000, 6000)
}

// ═══════════════════════════════════════════════════════════════
// 5. NATURAL MESSAGE SPLITTING
// ═══════════════════════════════════════════════════════════════

/**
 * Splits a long message into natural WhatsApp-like parts.
 * Splits at paragraph breaks, sentences, or topic changes.
 * Returns parts with variable delays.
 */
export async function getSplitMessages(
  text: string,
  contactId?: string,
  context?: HumanizationContext,
): Promise<SplitMessagePart[]> {
  if (!text || text.trim().length === 0) return []

  // Get contact style to adapt splitting
  let profile: ContactStyleProfile | undefined
  if (contactId) {
    try {
      profile = await analyzeContactStyle(contactId)
    } catch {
      // fallback to no profile
    }
  }

  // Max chars per part — adapt to contact's preferred length
  const maxChars = profile
    ? Math.max(profile.avgMessageLength * 1.5, 120)
    : 280

  // If short enough, return as single part
  if (text.length <= maxChars) {
    const delay = await getSendDelay(text, contactId, context)
    return [{ content: text.trim(), delayMs: delay }]
  }

  // ── Split strategy ──
  const parts: SplitMessagePart[] = []
  const remaining = text.trim()

  // First split by double newlines (paragraphs)
  const paragraphs = remaining.split(/\n{2,}/).filter(p => p.trim().length > 0)

  if (paragraphs.length > 1) {
    // Each paragraph becomes a part
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim()
      // Further split if a paragraph is too long
      if (para.length > maxChars) {
        const subParts = splitAtSentenceBoundaries(para, maxChars)
        for (const sub of subParts) {
          parts.push({
            content: sub.trim(),
            delayMs: i === 0 && parts.length === 0
              ? await getSendDelay(sub, contactId, context)
              : getInterPartDelay(),
          })
        }
      } else {
        parts.push({
          content: para,
          delayMs: i === 0
            ? await getSendDelay(para, contactId, context)
            : getInterPartDelay(),
        })
      }
    }
  } else {
    // Single paragraph — split at sentence boundaries
    const sentenceParts = splitAtSentenceBoundaries(remaining, maxChars)
    for (let i = 0; i < sentenceParts.length; i++) {
      parts.push({
        content: sentenceParts[i].trim(),
        delayMs: i === 0
          ? await getSendDelay(sentenceParts[i], contactId, context)
          : getInterPartDelay(),
      })
    }
  }

  return parts.filter(p => p.content.length > 0)
}

/**
 * Splits text at natural sentence boundaries within a max char limit.
 */
function splitAtSentenceBoundaries(text: string, maxChars: number): string[] {
  const result: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      result.push(remaining)
      break
    }

    // Find split point: look for sentence enders within the limit
    let splitIdx = -1

    // Look for the last period, exclamation, or question mark before maxChars
    const searchRange = remaining.slice(0, maxChars)
    const lastPeriod = searchRange.lastIndexOf('.')
    const lastExcl = searchRange.lastIndexOf('!')
    const lastQmark = searchRange.lastIndexOf('?')
    const lastNewline = searchRange.lastIndexOf('\n')

    // Pick the latest sentence boundary, but it should be after 30% of maxChars
    const minIdx = Math.floor(maxChars * 0.3)
    const candidates = [
      lastNewline > minIdx ? lastNewline + 1 : -1,
      lastPeriod > minIdx ? lastPeriod + 1 : -1,
      lastExcl > minIdx ? lastExcl + 1 : -1,
      lastQmark > minIdx ? lastQmark + 1 : -1,
    ].filter(i => i > 0)

    if (candidates.length > 0) {
      splitIdx = Math.max(...candidates)
    }

    // Fallback: split at comma or space
    if (splitIdx === -1) {
      const lastComma = searchRange.lastIndexOf(',')
      if (lastComma > minIdx) {
        splitIdx = lastComma + 1
      } else {
        const lastSpace = searchRange.lastIndexOf(' ')
        if (lastSpace > 0) {
          splitIdx = lastSpace
        } else {
          splitIdx = maxChars
        }
      }
    }

    result.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }

  return result.filter(r => r.length > 0)
}

// ═══════════════════════════════════════════════════════════════
// 6. EMOTIONAL MODULATION
// ═══════════════════════════════════════════════════════════════

interface EmotionalState {
  energy: number       // 0.0 – 1.0
  valence: number      // -1.0 (negative/sad) – 1.0 (positive/happy)
  formality: number    // 0.0 – 1.0
  isExcited: boolean
  isSad: boolean
  isFormal: boolean
  isUrgent: boolean
}

/**
 * Analyze emotional state from recent messages.
 */
function detectEmotion(messages: string[]): EmotionalState {
  if (messages.length === 0) {
    return {
      energy: 0.3, valence: 0.3, formality: 0.3,
      isExcited: false, isSad: false, isFormal: false, isUrgent: false,
    }
  }

  const lastMsgs = messages.slice(-5)
  let excCount = 0
  let capsWords = 0
  let emojiCount = 0
  let questionCount = 0
  let totalWords = 0

  const sadWords = ['triste', 'mal', 'problema', 'difícil', 'preocup', 'angustia', 'no puedo', 'frustrad', 'stress', 'estres', 'molesto', 'enojado', 'enojada']
  const formalWords = ['estimado', 'atentamente', 'agradezco', 'me gustaría', 'quisiera', 'a la brevedad', 'con gusto']
  const urgentWords = ['urgente', 'ya', 'ahora', 'rápido', 'necesito', 'please', 'plis', 'ayuda']

  let sadHits = 0
  let formalHits = 0
  let urgentHits = 0

  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu

  for (const msg of lastMsgs) {
    const words = msg.split(/\s+/)
    totalWords += words.length

    excCount += (msg.match(/!/g) || []).length
    questionCount += (msg.match(/\?/g) || []).length
    capsWords += words.filter(w => w.length > 1 && w === w.toUpperCase()).length
    const emojis = msg.match(emojiRegex)
    if (emojis) emojiCount += emojis.length

    for (const w of sadWords) {
      if (msg.toLowerCase().includes(w)) sadHits++
    }
    for (const w of formalWords) {
      if (msg.toLowerCase().includes(w)) formalHits++
    }
    for (const w of urgentWords) {
      if (msg.toLowerCase().includes(w)) urgentHits++
    }
  }

  const n = lastMsgs.length
  const energy = Math.min(
    (excCount / n) * 0.3 + (capsWords / Math.max(totalWords, 1)) * 0.3 +
    (emojiCount / n) * 0.2 + (urgentHits / n) * 0.2,
    1
  )

  const isExcited = energy > 0.5 && excCount > n * 0.5
  const isSad = sadHits > 0
  const isFormal = formalHits > 0
  const isUrgent = urgentHits > 0

  const valence = isSad ? -0.5 : isExcited ? 0.8 : 0.3
  const formality = isFormal ? 0.8 : 0.3

  return { energy, valence, formality, isExcited, isSad, isFormal, isUrgent }
}

/**
 * Build an emotional modulation instruction for the AI refiner.
 */
function buildEmotionPrompt(emotion: EmotionalState): string {
  const instructions: string[] = []

  if (emotion.isExcited) {
    instructions.push(
      'El contacto está emocionado/animado. Sube la energía de tu respuesta.',
      'Puedes usar más emojis y exclamaciones, pero sin exagerar más que el contacto.',
    )
  } else if (emotion.isSad) {
    instructions.push(
      'El contacto parece triste o preocupado. Usa un tono suave y empático.',
      'Incluye marcas de empatía como "entiendo", "te entiendo", "no te preocupes".',
      'Evita respuestas entusiastas o con muchos emojis.',
    )
  } else if (emotion.isFormal) {
    instructions.push(
      'El contacto es formal. Mantén un tono profesional y respetuoso.',
      'Minimiza emojis y usa lenguaje más estructurado.',
    )
  } else if (emotion.isUrgent) {
    instructions.push(
      'El contacto tiene urgencia. Responde de forma directa y concisa.',
      'Ve al grano sin rodeos ni saludos largos.',
    )
  } else {
    instructions.push(
      'El contacto tiene un tono neutral/casual. Mantén un tono cálido y natural.',
    )
  }

  // Never be MORE emotional than the contact
  instructions.push(
    'IMPORTANTE: Nunca seas MÁS emocional que el contacto. Adapta tu nivel al suyo.',
  )

  return instructions.join('\n')
}

// ═══════════════════════════════════════════════════════════════
// 7. AI TEXT REFINEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Use a fast AI model to refine text and make it sound more human.
 * Removes robotic patterns, adds natural fillers, varies sentence length.
 */
async function refineWithAI(
  text: string,
  styleProfile?: ContactStyleProfile | null,
  emotion?: EmotionalState,
  context?: HumanizationContext,
): Promise<string> {
  // Skip AI refinement for very short messages
  if (text.length < 15) return text

  try {
    const styleInstructions = styleProfile
      ? buildStyleInstructions(styleProfile)
      : ''

    const emotionInstructions = emotion
      ? buildEmotionPrompt(emotion)
      : ''

    const antiDectectionInstructions = buildAntiDetectionInstructions()

    const systemPrompt = `Eres un refinador de texto para WhatsApp. Tu ÚNICA tarea es hacer que el siguiente texto suene como lo escribiría una persona real en WhatsApp.

Reglas:
- Todo en español (México)
- NUNCA uses markdown, asteriscos, guiones, listas numeradas
- Si el texto ya suena natural, devuélvelo casi igual (solo quita marcas de IA)
- NO inventes información nueva
- NO cambies el significado
- Mantén la misma longitud aproximada
- Varía la longitud de las oraciones
- Quita patrones robóticos: "Claro que sí", "En cuanto a", "Por supuesto", "Con mucho gusto", "Estoy aquí para ayudarte", "Excelente pregunta", "Buena pregunta"
- Agrega fillers naturales SOLO si la conversación es casual: "bueno", "mira", "osea", "o sea", "a ver", "pues"
- NO pongas saludo si el texto no lo tiene
- Si hay puntos o resumen final innecesario, quítalo
- Máximo 3 oraciones por párrafo
- Responde SOLO con el texto refinado, sin explicaciones

${styleInstructions}
${emotionInstructions}
${antiDectectionInstructions}`

    const result = await chatWithAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      'glm',            // fastest/cheapest provider
      'glm-4.5-flash',  // fastest model
      {
        temperature: 0.7,
        maxTokens: 1024,
        frequencyPenalty: 0.6,
        presencePenalty: 0.4,
      },
    )

    const refined = result.content.trim()

    // Safety: if AI returns something too different or empty, fallback
    if (!refined || refined.length < 5 || refined.length > text.length * 3) {
      return text
    }

    return refined
  } catch (error) {
    logWarn('AI', 'refineWithAI', {
      error: error instanceof Error ? error.message : String(error),
    })
    // Fallback: just use regex-based humanization
    return text
  }
}

/**
 * Build style adaptation instructions based on contact profile.
 */
function buildStyleInstructions(profile: ContactStyleProfile): string {
  const instructions: string[] = ['Adapta tu estilo al del contacto:']

  if (profile.formalityLevel > 0.6) {
    instructions.push('El contacto es formal. Usa "usted" y lenguaje profesional.')
  } else if (profile.formalityLevel < 0.2) {
    instructions.push('El contacto es muy casual. Puedes usar "tú", lenguaje coloquial y abreviaciones.')
  }

  if (profile.emojiFrequency > 0.1) {
    instructions.push('El contacto usa emojis frecuentemente. Puedes incluir 1-2 emojis relevantes.')
  } else {
    instructions.push('El contacto rara vez usa emojis. Minimiza o elimina emojis.')
  }

  if (profile.slangUsage > 0.2) {
    instructions.push('El contacto usa jerga mexicana. Puedes usar expresiones como "órale", "neta", "chido" si encajan.')
  }

  if (profile.avgMessageLength < 25) {
    instructions.push('El contacto escribe mensajes cortos. Tu respuesta debe ser CONCISA (1-2 oraciones).')
  } else if (profile.avgMessageLength > 80) {
    instructions.push('El contacto escribe mensajes largos. Puedes ser más detallado, pero sin exagerar.')
  }

  if (profile.punctuationStyle === 'minimal') {
    instructions.push('El contacto usa poca puntuación. Reduce comas y puntos innecesarios.')
  } else if (profile.punctuationStyle === 'excessive') {
    instructions.push('El contacto usa mucha puntuación y exclamaciones. Puedes reflejar algo de esa energía.')
  }

  return instructions.join('\n')
}

/**
 * Anti-detection instructions to avoid AI patterns.
 */
function buildAntiDetectionInstructions(): string {
  return `Anti-detección:
- No empieces con "Claro", "Claro que sí", "Por supuesto", "Con gusto", "¡Hola!", "Hola,"
- No termines con un resumen o conclusión innecesaria
- No uses estructura simétrica (punto 1, punto 2, punto 3)
- A veces deja una idea incompleta o haz una autocorrección natural como "o mejor dicho..."
- Varía los conectores: a veces usa "y", a veces "además", a veces nada
- No siempre respondas todo — a veces puedes ser breve
- Los mensajes de WhatsApp no siempre son perfectos
- Puedes usar minúsculas al inicio de una oración si es casual
- No repitas la estructura "frase + frase + frase"`
}

// ═══════════════════════════════════════════════════════════════
// 8. PERSONALITY PERSISTENCE
// ═══════════════════════════════════════════════════════════════

// Expression pools for rotation
const GREETING_POOL = [
  'Buenos días', 'Buenas tardes', 'Buenas noches',
  'Hola', 'Qué onda', 'Qué tal', 'Hola, qué tal',
  'Buen día', 'Ey', 'Quiúbole',
]

const WARMTH_FILLERS = [
  'mira', 'bueno', 'osea', 'o sea', 'a ver',
  'pues mira', 'te digo', 'la neta', 'en serio',
]

const EMPATHY_MARKERS = [
  'entiendo', 'te entiendo', 'ya veo', 'claro', 'ah ok',
  'te entiendo perfecto', 'sé lo que dices', 'totalmente',
]

const CLOSING_POOL = [
  // intentionally empty sometimes — just stop
  '', '', '',
  'Avísame si necesitas algo más',
  'Cualquier duda me dices',
  'Si tienes preguntas, aquí estoy',
  'Ya me dices cómo te va',
]

/**
 * Get or create personality state for a contact.
 */
function getPersonalityState(contactId: string): PersonalityState {
  let state = PERSONALITY_CACHE.get(contactId)
  if (!state) {
    state = {
      usedExpressions: [],
      usedGreetings: [],
      warmthLevel: 0.5,
      lastResponseEnergy: 0.3,
      messagesSent: 0,
    }
    PERSONALITY_CACHE.set(contactId, state)
  }
  return state
}

/**
 * Get a greeting that hasn't been used recently for this contact.
 */
function getRotatedGreeting(contactId: string, preferredGreeting: string): string {
  const state = getPersonalityState(contactId)

  // Filter out recently used greetings
  const available = GREETING_POOL.filter(g =>
    !state.usedGreetings.includes(g) || state.usedGreetings.length >= GREETING_POOL.length
  )

  // Prefer the contact's preferred greeting
  if (available.includes(preferredGreeting)) {
    state.usedGreetings.push(preferredGreeting)
    if (state.usedGreetings.length > MAX_USED_GREETINGS) {
      state.usedGreetings.shift()
    }
    return preferredGreeting
  }

  // Random from available
  const pick = available[Math.floor(Math.random() * available.length)]
  state.usedGreetings.push(pick)
  if (state.usedGreetings.length > MAX_USED_GREETINGS) {
    state.usedGreetings.shift()
  }
  return pick
}

/**
 * Get a filler word that hasn't been overused.
 */
function getRotatedFiller(contactId: string): string {
  const state = getPersonalityState(contactId)
  const available = WARMTH_FILLERS.filter(f =>
    !state.usedExpressions.includes(f) || state.usedExpressions.length >= WARMTH_FILLERS.length
  )
  const pick = available[Math.floor(Math.random() * available.length)]
  state.usedExpressions.push(pick)
  if (state.usedExpressions.length > MAX_USED_EXPRESSIONS) {
    state.usedExpressions.shift()
  }
  return pick
}

/**
 * Maybe add a natural closing — sometimes just don't close at all.
 */
function maybeAddNaturalClosing(contactId: string): string {
  // 40% chance to add a closing
  if (Math.random() > 0.4) return ''

  const state = getPersonalityState(contactId)
  const pick = CLOSING_POOL[Math.floor(Math.random() * CLOSING_POOL.length)]
  if (!pick) return ''

  state.usedExpressions.push(pick)
  if (state.usedExpressions.length > MAX_USED_EXPRESSIONS) {
    state.usedExpressions.shift()
  }

  return pick
}

/**
 * Update personality state after sending a response.
 */
function updatePersonalityAfterSend(
  contactId: string,
  responseEnergy: number,
): void {
  const state = getPersonalityState(contactId)
  state.lastResponseEnergy = responseEnergy
  state.messagesSent++

  // Slowly adapt warmth to match contact's energy
  state.warmthLevel = state.warmthLevel * 0.8 + responseEnergy * 0.2
}

// ═══════════════════════════════════════════════════════════════
// 9. ANTI-DETECTION MEASURES (Non-AI)
// ═══════════════════════════════════════════════════════════════

/**
 * Post-processing to remove patterns that scream "AI generated".
 * Applied AFTER AI refinement as a final safety net.
 */
function applyAntiDetection(text: string): string {
  let result = text

  // Remove overly symmetric list patterns ("1. ... 2. ... 3. ...")
  result = result.replace(/^\s*\d+[.)]\s+.*$/gm, (match) => {
    // Keep the content but remove the number
    return match.replace(/^\s*\d+[.)]\s+/, '')
  })

  // Remove concluding summary patterns
  const summaryPatterns = [
    /En resumen[,:.]\s*/gi,
    /En conclusión[,:.]\s*/gi,
    /Para resumir[,:.]\s*/gi,
    /En síntesis[,:.]\s*/gi,
    /Como conclusión[,:.]\s*/gi,
  ]
  for (const pat of summaryPatterns) {
    result = result.replace(pat, '')
  }

  // Sometimes remove the last sentence if it's a generic closing
  const sentences = result.split(/(?<=[.!?])\s+/)
  if (sentences.length > 2) {
    const lastSentence = sentences[sentences.length - 1].toLowerCase()
    const genericClosings = [
      'espero que esta información te sea útil',
      'si necesitas algo más, no dudes en contactarme',
      'estoy aquí para lo que necesites',
      'quedo atento a tus comentarios',
      'no dudes en escribirme',
      'si tienes alguna otra pregunta',
      'cualquier otra duda con gusto te resuelvo',
    ]
    if (genericClosings.some(gc => lastSentence.includes(gc)) && Math.random() > 0.5) {
      sentences.pop()
      result = sentences.join(' ')
    }
  }

  // Add occasional natural imperfection (self-correction)
  if (Math.random() < 0.08 && result.length > 50) {
    // Insert a mild self-correction somewhere
    const connectors = ['o mejor dicho', 'digo, ', 'o sea, ', 'es que ']
    const connector = connectors[Math.floor(Math.random() * connectors.length)]
    const words = result.split(/\s+/)
    if (words.length > 10) {
      // Insert near the middle
      const idx = Math.floor(words.length * 0.4) + Math.floor(Math.random() * words.length * 0.2)
      words.splice(idx, 0, connector)
      result = words.join(' ')
    }
  }

  // Ensure no triple punctuation
  result = result.replace(/!!+/g, '!')
  result = result.replace(/\?\?+/g, '?')
  result = result.replace(/\.\.\.+/g, '...')

  return result.trim()
}

// ═══════════════════════════════════════════════════════════════
// 10. MAIN HUMANIZE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Main humanization function.
 * Takes raw AI text and transforms it into natural, human-like WhatsApp messages.
 *
 * @param text - Raw AI-generated text to humanize
 * @param contactId - Contact ID (optional, enables style learning)
 * @param context - Additional context for humanization
 * @returns Humanized text ready for WhatsApp
 */
export async function humanize(
  text: string,
  contactId?: string,
  context?: HumanizationContext,
): Promise<string> {
  if (!text || typeof text !== 'string') return text

  let result = text

  // ── Step 1: Basic regex humanization (existing pipeline) ──
  result = humanizeResponse(result)

  // ── Step 2: Analyze contact style ──
  let styleProfile: ContactStyleProfile | null = null
  if (contactId) {
    try {
      styleProfile = await analyzeContactStyle(contactId)
    } catch {
      // Continue without profile
    }
  }

  // ── Step 3: Detect emotion from recent messages ──
  const recentMsgs = context?.recentMessages || []
  const emotion = detectEmotion(recentMsgs)

  // ── Step 4: AI refinement ──
  try {
    result = await refineWithAI(result, styleProfile, emotion, context)
  } catch {
    // Fallback: the regex pipeline already ran
  }

  // ── Step 5: Post-processing ──
  result = applyAntiDetection(result)

  // ── Step 6: Enforce identity (JHON) ──
  result = enforceIdentity(result)

  // ── Step 7: Strip any remaining markdown ──
  result = stripMarkdown(result)

  // ── Step 8: Final cleanup ──
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // ── Step 9: Maybe add natural closing ──
  if (contactId && result.length > 30) {
    const closing = maybeAddNaturalClosing(contactId)
    if (closing) {
      result = `${result} ${closing}`
    }
  }

  // ── Step 10: Update personality state ──
  if (contactId) {
    updatePersonalityAfterSend(contactId, emotion.energy)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// 11. UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get the time-aware greeting based on Mexico City timezone.
 */
export function getTimeGreeting(): string {
  const now = new Date()
  const hour = parseInt(
    now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false })
  )

  if (hour >= 6 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  if (hour >= 19 && hour < 24) return 'Buenas noches'
  return 'Hola' // midnight to 6am
}

/**
 * Build a full humanized response with greeting for a first message.
 */
export async function buildFirstMessage(
  contactId: string,
  contactName?: string,
  context?: HumanizationContext,
): Promise<string> {
  const greeting = getTimeGreeting()
  const nameQuestion = contactName
    ? `¿En qué te puedo ayudar, ${contactName}?`
    : '¿Con quién tengo el gusto?'

  // Rotate greeting style
  const rotatedGreeting = contactId
    ? getRotatedGreeting(contactId, greeting.toLowerCase().includes('días') ? 'buenos días'
      : greeting.toLowerCase().includes('tardes') ? 'buenas tardes'
        : greeting.toLowerCase().includes('noches') ? 'buenas noches'
          : 'hola')
    : greeting

  // Add a filler for naturalness
  const filler = contactId && Math.random() > 0.5
    ? getRotatedFiller(contactId)
    : ''

  const msg = filler
    ? `${rotatedGreeting} 👋 ${filler}... Soy Jhon del equipo. ${nameQuestion}`
    : `${rotatedGreeting} 👋 Soy Jhon del equipo. ${nameQuestion}`

  return humanize(msg, contactId, context)
}

/**
 * Clear cached style profile for a contact (e.g., after new messages).
 */
export function invalidateStyleCache(contactId?: string): void {
  if (contactId) {
    STYLE_CACHE.delete(contactId)
  } else {
    STYLE_CACHE.clear()
  }
}

/**
 * Clear personality state for a contact.
 */
export function invalidatePersonalityCache(contactId?: string): void {
  if (contactId) {
    PERSONALITY_CACHE.delete(contactId)
  } else {
    PERSONALITY_CACHE.clear()
  }
}

/**
 * Get a greeting adapted to the contact's style.
 */
export async function getAdaptedGreeting(contactId: string): Promise<string> {
  try {
    const profile = await analyzeContactStyle(contactId)
    return getRotatedGreeting(contactId, profile.preferredGreeting)
  } catch {
    return getTimeGreeting()
  }
}

/**
 * Get an empathy marker that hasn't been overused.
 */
export function getEmpathyMarker(contactId?: string): string {
  if (!contactId) {
    return EMPATHY_MARKERS[Math.floor(Math.random() * EMPATHY_MARKERS.length)]
  }
  const state = getPersonalityState(contactId)
  const available = EMPATHY_MARKERS.filter(m =>
    !state.usedExpressions.includes(m)
  )
  const pick = (available.length > 0 ? available : EMPATHY_MARKERS)[
    Math.floor(Math.random() * (available.length > 0 ? available : EMPATHY_MARKERS).length)
  ]
  state.usedExpressions.push(pick)
  if (state.usedExpressions.length > MAX_USED_EXPRESSIONS) {
    state.usedExpressions.shift()
  }
  return pick
}

// ═══════════════════════════════════════════════════════════════
// 12. HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Random integer between min and max (inclusive).
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
