// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — AI Response Humanizer
// Transforms AI responses into natural, human-like WhatsApp messages
// ═══════════════════════════════════════════════════════════════

// ─── Robotic openers to strip ─────────────────────────────────

const ROBOTIC_OPENERS = [
  'Claro que sí',
  'Por supuesto',
  'Con mucho gusto',
  'Con gusto',
  'Estoy aquí para ayudarte',
  'Con mucho gusto te puedo ayudar',
  'Me alegra que me escribas',
  'Gracias por tu interés',
  'Hola, soy',
  '¡Hola! Soy',
  'Excelente pregunta',
  'Buena pregunta',
  'Por supuesto que sí',
  'Claro está',
  'Con mucho gusto te ayudo',
  'En cuanto a tu pregunta',
  'Respecto a tu consulta',
  'Con base en lo que me mencionas',
  'Entiendo perfectamente tu situación',
  '¡Hola!',
  'Hola,',
  '¡Buenas!',
]

// ─── Formal-to-casual replacements ────────────────────────────

const FORMAL_REPLACEMENTS: [RegExp, string][] = [
  [/el día de hoy/gi, 'hoy'],
  [/en este momento/gi, 'ahora'],
  [/a la brevedad/gi, 'rapido'],
  [/de igual manera/gi, 'igual'],
  [/sin embargo/gi, 'pero'],
  [/no obstante/gi, 'pero'],
  [/asimismo/gi, 'además'],
  [/por tal motivo/gi, 'por eso'],
  [/en efecto/gi, 'exacto'],
  [/a continuación/gi, 'ahora'],
  [/le comento que/gi, 'te digo que'],
  [/le puedo mencionar/gi, 'te puedo decir'],
  [/podría mencionarte/gi, 'te puedo decir'],
  [/quisiera comentarte/gi, 'te cuento que'],
  [/me gustaría/gi, 'quiero'],
  [/le gustaría/gi, 'te gustaría'],
  [/se encuentra/gi, 'está'],
  [/se encuentra disponible/gi, 'está disponible'],
  [/tenemos a su disposición/gi, 'tenemos'],
  [/le recomendaría/gi, 'te recomiendo'],
  [/le sugeriría/gi, 'te sugiero'],
  [/¿en qué le puedo apoyar/gi, '¿en qué te ayudo'],
  [/¿cómo le puedo ayudar/gi, '¿cómo te ayudo'],
  [/estimado/gi, ''],
  [/atentamente/gi, ''],
  [/sin más por el momento/gi, ''],
  [/me despido/gi, ''],
  [/saludos cordiales/gi, ''],
]

// ─── Occasional natural emojis ────────────────────────────────

const CASUAL_EMOJIS = ['👍', '😊', '✌️', '💪', '😎', '🤙', '😉', '😄', '🔥', '💯', '🚗', '💰']

// ═══════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Main humanizer function. Transforms raw AI text into a natural
 * WhatsApp-style message that feels human-typed.
 */
export function humanizeResponse(text: string): string {
  if (!text || typeof text !== 'string') return text

  let result = text

  // 1. Strip markdown formatting
  result = stripMarkdown(result)

  // 2. Remove robotic openers
  result = removeRoboticOpeners(result)

  // 3. Replace formal words with casual equivalents
  result = replaceFormalWords(result)

  // 4. Normalize whitespace
  result = normalizeWhitespace(result)

  // 5. Fix common AI artifacts
  result = fixAIArtifacts(result)

  // 6. Add occasional emoji (10% chance)
  result = maybeAddEmoji(result)

  return result.trim()
}

/**
 * Strip all markdown formatting from the text.
 */
export function stripMarkdown(text: string): string {
  let result = text

  // Remove bold/italic markers
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1') // bold+italic
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')     // bold
  result = result.replace(/\*(.+?)\*/g, '$1')          // italic
  result = result.replace(/_(.+?)_/g, '$1')            // underscore italic
  result = result.replace(/__(.+?)__/g, '$1')          // underscore bold

  // Remove headings
  result = result.replace(/^#{1,6}\s+/gm, '')
  result = result.replace(/#{1,6}\s+.*$/gm, '')         // inline headings

  // Remove code blocks
  result = result.replace(/```[\s\S]*?```/g, '')
  result = result.replace(/`(.+?)`/g, '$1')             // inline code

  // Remove links but keep text
  result = result.replace(/\[(.+?)\]\(.+?\)/g, '$1')

  // Remove numbered lists (1. 2. 3.) — replace with dash or nothing
  result = result.replace(/^\s*\d+[.)]\s+/gm, '• ')

  // Remove bullet points
  result = result.replace(/^\s*[-*+]\s+/gm, '')

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '')

  // Remove blockquotes
  result = result.replace(/^\s*>\s+/gm, '')

  // Remove HTML tags
  result = result.replace(/<[^>]+>/g, '')

  return result
}

/**
 * Remove robotic/opening phrases that make the AI sound non-human.
 */
export function removeRoboticOpeners(text: string): string {
  let result = text

  for (const opener of ROBOTIC_OPENERS) {
    const regex = new RegExp(`^${escapeRegex(opener)}[,:.\\s]+`, 'i')
    if (regex.test(result)) {
      result = result.replace(regex, '')
      break // Only remove the first match
    }
  }

  // Also handle "Claro," / "Claro " standalone
  if (/^Claro[,\s]+/i.test(result)) {
    result = result.replace(/^Claro[,\s]+/i, '')
  }

  return result.trim()
}

/**
 * Replace formal/stiff words with casual Mexican Spanish equivalents.
 */
export function replaceFormalWords(text: string): string {
  let result = text

  for (const [pattern, replacement] of FORMAL_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }

  return result
}

/**
 * Normalize whitespace — collapse multiple spaces, trim lines.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')             // collapse spaces
    .replace(/\n{3,}/g, '\n\n')          // max 2 consecutive newlines
    .replace(/^\s+$/gm, '')              // remove blank lines
    .replace(/\n /g, '\n')               // trim leading space on lines
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

/**
 * Fix common AI artifacts: leftover tags, parentheses notes, etc.
 */
export function fixAIArtifacts(text: string): string {
  let result = text

  // Remove bracketed tags like [INSIGHT], [DIRECCIÓN], etc.
  result = result.replace(/\[(INSIGHT|DIRECC[OÓ]N|DIRECCION|PREGUNTA|REPLIES|RESPUESTA|NOTA|INFO)\][\s:]*/gi, '')

  // Remove pipe-separated quick replies at end of message
  const pipeMatch = result.match(/\s*\|\s*.+\|.*$/)
  if (pipeMatch) {
    const pipeText = pipeMatch[0]
    // Only remove if it looks like quick replies (short segments separated by |)
    const segments = pipeText.split('|').map(s => s.trim()).filter(s => s.length > 0)
    if (segments.length >= 2 && segments.every(s => s.length < 60)) {
      result = result.replace(pipeText, '')
    }
  }

  // Remove parenthetical AI notes like "(emoji optional)" or "[suggested reply]"
  result = result.replace(/\[suggested reply[^\]]*\]/gi, '')
  result = result.replace(/\(emoji\s+(optional|opcional)\)/gi, '')
  result = result.replace(/\(opcional\)/gi, '')

  // Remove trailing periods if there are too many
  result = result.replace(/\. {2,}\./g, '.')

  // Fix sentence-starting capital letters that follow newlines (WhatsApp style doesn't)
  // Actually keep them — it's fine for readability

  // Remove double punctuation
  result = result.replace(/!!+/g, '!')
  result = result.replace(/\?\?+/g, '?')

  return result.trim()
}

/**
 * Add a random emoji at the end of the message (10% chance).
 * Only if the message doesn't already end with an emoji.
 */
export function maybeAddEmoji(text: string): string {
  // 10% chance
  if (Math.random() > 0.1) return text

  // Don't add if message already has an emoji in last 5 chars
  const lastChars = text.slice(-5)
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/u.test(lastChars)) {
    return text
  }

  // Don't add if message ends with a question mark
  if (/[?!]$/.test(text.trim())) return text

  // Pick a random emoji
  const emoji = CASUAL_EMOJIS[Math.floor(Math.random() * CASUAL_EMOJIS.length)]

  return `${text.trim()} ${emoji}`
}

// ═══════════════════════════════════════════════════════════════
// Message Splitting
// ═══════════════════════════════════════════════════════════════

/**
 * Split a long message into multiple WhatsApp-friendly messages.
 * Splits at natural break points (periods, question marks, newlines).
 * Each message is kept under maxChars characters.
 */
export function splitLongMessage(text: string, maxChars: number = 280): string[] {
  // If short enough, return as single message
  if (text.length <= maxChars) return [text]

  const messages: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      messages.push(remaining.trim())
      break
    }

    // Find the best split point within maxChars
    let splitPoint = -1

    // Priority 1: Split at newline
    const newlineIdx = remaining.lastIndexOf('\n', maxChars)
    if (newlineIdx > maxChars * 0.3) {
      splitPoint = newlineIdx
    }

    // Priority 2: Split at sentence end (. ! ?)
    if (splitPoint === -1) {
      const sentenceEnders = ['.', '?', '!']
      for (const ender of sentenceEnders) {
        const idx = remaining.lastIndexOf(ender, maxChars)
        if (idx > maxChars * 0.3) {
          splitPoint = idx + 1
          break
        }
      }
    }

    // Priority 3: Split at comma or semicolon
    if (splitPoint === -1) {
      const commaIdx = remaining.lastIndexOf(',', maxChars)
      if (commaIdx > maxChars * 0.3) {
        splitPoint = commaIdx + 1
      }
    }

    // Priority 4: Split at space
    if (splitPoint === -1) {
      const spaceIdx = remaining.lastIndexOf(' ', maxChars)
      if (spaceIdx > maxChars * 0.2) {
        splitPoint = spaceIdx
      }
    }

    // Fallback: hard cut
    if (splitPoint === -1) {
      splitPoint = maxChars
    }

    messages.push(remaining.slice(0, splitPoint).trim())
    remaining = remaining.slice(splitPoint).trim()
  }

  return messages.filter(m => m.length > 0)
}

// ═══════════════════════════════════════════════════════════════
// Timing Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Returns a random delay between 1000-3000ms to simulate human typing speed.
 * Longer messages get slightly longer delays.
 */
export function getRandomDelay(textLength?: number): number {
  const base = 1000
  const variance = 2000

  // Add extra delay for longer messages (simulates more typing)
  const lengthBonus = textLength ? Math.min(textLength * 2, 1500) : 0

  return Math.floor(base + Math.random() * variance + lengthBonus)
}

/**
 * Returns a delay between two messages (2-4 seconds).
 */
export function getInterMessageDelay(): number {
  return 2000 + Math.floor(Math.random() * 2000)
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
