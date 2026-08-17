export interface ExtractedContactInfo {
  fullName?: string
  firstName?: string
  lastName?: string
  email?: string
  /** Teléfono que el cliente DIJO en el chat. Solo para UNIFICAR perfiles
   *  multi-canal — NUNCA sobrescribe contact.phone (llave de identidad del canal). */
  statedPhone?: string
  company?: string
  rfc?: string
  location?: string
  budget?: string
  productInterest?: string
}

export interface ContactInfoUpdateInput {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  customFields?: string | Record<string, unknown> | null
}

export interface ContactInfoUpdateResult {
  data: Record<string, unknown>
  changedFields: string[]
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const RFC_RE = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/i

const FIELD_LABELS: Record<keyof ExtractedContactInfo, string> = {
  fullName: 'nombre_detectado',
  firstName: 'nombre',
  lastName: 'apellido',
  email: 'correo_detectado',
  company: 'empresa_detectada',
  rfc: 'rfc_detectado',
  location: 'ubicacion_detectada',
  budget: 'presupuesto_detectado',
  productInterest: 'interes_detectado',
  statedPhone: 'telefono_dicho', // solo para unificación multi-canal (no persiste en contact.phone)
}

const BAD_NAME_STARTS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'un',
  'una',
  'por',
  'favor',
  'correo',
  'email',
  'cita',
])

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function titleCase(value: string): string {
  // Capitalize the first letter of each word. Uses a Unicode lookbehind instead
  // of \b because \b is ASCII-only and would treat accented letters (é, ñ…) as
  // word boundaries, mangling names like "Méndez" → "MÉNdez".
  return normalizeSpaces(value)
    .toLocaleLowerCase('es-MX')
    .replace(/(?<![\p{L}\p{M}])\p{L}/gu, (char) => char.toLocaleUpperCase('es-MX'))
}

function cleanCapture(value: string): string {
  return normalizeSpaces(value)
    .replace(/[,:;.!?]+$/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
}

function cleanNameCapture(value: string): string {
  return cleanCapture(value).split(/\s+(?:y|mi|me|correo|email)\b/i)[0].trim()
}

function parseCustomFields(raw: ContactInfoUpdateInput['customFields']): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function isUsableName(value: string): boolean {
  const clean = cleanCapture(value)
  const parts = clean.split(' ').filter(Boolean)
  if (parts.length === 0 || parts.length > 4) return false
  if (parts.some((part) => /\d|@/.test(part))) return false
  if (BAD_NAME_STARTS.has(parts[0].toLocaleLowerCase('es-MX'))) return false
  return clean.length >= 3
}

function splitName(fullName: string): { firstName: string; lastName?: string } {
  const parts = titleCase(fullName).split(' ').filter(Boolean)
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || undefined,
  }
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1] ? cleanCapture(match[1]) : ''
    if (value) return value
  }
  return undefined
}

// Honoríficos comunes (con punto opcional) que preceden al nombre real.
// Ej. "Mi nombre es Dr. Roberto Méndez" → debe capturar "Roberto Méndez", no "Dr".
const HONORIFIC = '(?:dr|dra|lic|ing|sr|sra|srta|srita|mtro|mtra|c|don|do[ñn]a|profe?|q\\.?f\\.?b)\\.?\\s+'

function extractName(text: string): string | undefined {
  const withoutEmail = text.replace(EMAIL_RE, ' ')
  const patterns = [
    new RegExp(`\\b(?:mi\\s+nombre\\s+es|me\\s+llamo|soy|habla)\\s+(?:${HONORIFIC})?([a-záéíóúüñ]+(?:\\s+[a-záéíóúüñ]+){0,3})(?=\\s+(?:y|de|del|para|con|mi|me|creo|cree|puedo|puede|quiero|necesito|busco|correo|email)\\b|[,.;!?]|$)`, 'i'),
    new RegExp(`\\bnombre\\s*[:=]\\s*(?:${HONORIFIC})?([a-záéíóúüñ]+(?:\\s+[a-záéíóúüñ]+){0,3})`, 'i'),
    /\bcon\s+([a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+){0,3})(?=\s+(?:cree|creo|puede|puedes|me|mi|por|para)\b|[,.;!?]|$)/i,
  ]
  for (const pattern of patterns) {
    const match = withoutEmail.match(pattern)
    const candidate = match?.[1] ? cleanNameCapture(match[1]) : ''
    if (candidate && isUsableName(candidate)) return titleCase(candidate)
  }
  return undefined
}

export function extractContactInfoFromText(text: string): ExtractedContactInfo {
  const cleanText = normalizeSpaces(text)
  const info: ExtractedContactInfo = {}

  const email = cleanText.match(EMAIL_RE)?.[0]
  if (email) info.email = email.toLocaleLowerCase('es-MX')

  // Teléfono dicho en el chat ("mi número es 55 1234 5678", "márcame al 811...")
  // — 10+ dígitos MX (tolerando espacios/guiones). Solo con CONTEXTO de teléfono
  // para no confundir precios/cantidades con números telefónicos.
  const phoneCtx = cleanText.match(/(?:tel[eé]fono|n[uú]mero|cel(?:ular)?|whats?app?|m[aá]rcame|ll[aá]mame|contactame|comun[ií]cate)[^0-9]{0,20}((?:\+?52\s?)?(?:1\s?)?(?:\d[\s.-]?){10,13})/i)
  if (phoneCtx?.[1]) {
    const digits = phoneCtx[1].replace(/\D/g, '')
    if (digits.length >= 10 && digits.length <= 13) info.statedPhone = digits
  }

  const rfc = cleanText.match(RFC_RE)?.[0]
  if (rfc) info.rfc = rfc.toLocaleUpperCase('es-MX')

  const fullName = extractName(cleanText)
  if (fullName) {
    const split = splitName(fullName)
    info.fullName = fullName
    info.firstName = split.firstName
    if (split.lastName) info.lastName = split.lastName
  }

  const company = firstMatch(cleanText, [
    /\b(?:mi\s+empresa|mi\s+negocio|la\s+empresa|el\s+negocio)\s+(?:es|se\s+llama)\s+([^,.!?]{2,80})/i,
    /\b(?:trabajo\s+en|soy\s+de)\s+([^,.!?]{2,80})/i,
  ])
  if (company && !EMAIL_RE.test(company)) info.company = titleCase(company)

  const location = firstMatch(cleanText, [
    /\b(?:estoy\s+en|vivo\s+en|me\s+ubico\s+en|ubicado\s+en|ubicada\s+en)\s+([^,.!?]{2,80})/i,
    /\b(?:mi\s+ubicaci[oó]n|mi\s+direcci[oó]n)\s+(?:es|:)\s+([^,.!?]{2,120})/i,
  ])
  if (location) info.location = titleCase(location)

  const budget = firstMatch(cleanText, [
    /\b(?:mi\s+presupuesto|presupuesto|budget)\s+(?:es|de|aprox(?:imado)?\.?|:)?\s*([$]?\s*\d[\d,.\s]*(?:mxn|pesos|usd|d[oó]lares)?)/i,
  ])
  if (budget) info.budget = normalizeSpaces(budget)

  const productInterest = firstMatch(cleanText, [
    /\b(?:me\s+interesa|estoy\s+interesad[oa]\s+en|busco|quiero\s+cotizar|necesito\s+informaci[oó]n\s+de)\s+([^,.!?]{3,80})/i,
  ])
  if (productInterest && !/\b(que|si|cuando|correo|email)\b/i.test(productInterest)) {
    info.productInterest = titleCase(productInterest)
  }

  return info
}

function isGenericContactName(firstName?: string | null, lastName?: string | null): boolean {
  const current = normalizeSpaces(`${firstName || ''} ${lastName || ''}`)
  const normalized = current.toLocaleLowerCase('es-MX')
  const GENERIC = new Set([
    'contacto whatsapp', 'contacto', 'cliente', 'lead', 'leads', 'prospecto',
    'sin nombre', 'desconocido', 'usuario', 'cliente potencial', 'nuevo lead',
    'whatsapp', 'wa', 'anonimo', 'anónimo',
  ])
  return !current ||
    current === '.' ||
    GENERIC.has(normalized) ||
    /^\+?\d[\d\s()-]+$/.test(current)
}

function hasValidEmail(email?: string | null): boolean {
  return Boolean(email && EMAIL_RE.test(email))
}

export function buildContactInfoUpdate(
  contact: ContactInfoUpdateInput,
  info: ExtractedContactInfo,
  now = new Date()
): ContactInfoUpdateResult {
  const data: Record<string, unknown> = {}
  const changedFields: string[] = []
  const customFields = parseCustomFields(contact.customFields)

  if (info.firstName && isGenericContactName(contact.firstName, contact.lastName)) {
    data.firstName = info.firstName
    data.lastName = info.lastName || null
    changedFields.push('nombre')
  }

  if (info.email && !hasValidEmail(contact.email)) {
    data.email = info.email
    changedFields.push('correo')
  }

  const detected = { ...customFields }
  let customChanged = false
  ;(Object.keys(FIELD_LABELS) as Array<keyof ExtractedContactInfo>).forEach((key) => {
    const value = info[key]
    if (!value) return
    const fieldName = FIELD_LABELS[key]
    if (detected[fieldName] !== value) {
      detected[fieldName] = value
      customChanged = true
    }
  })

  if (Object.keys(info).length > 0) {
    detected.datos_actualizados_en = now.toISOString()
    customChanged = true
  }

  if (customChanged) {
    data.customFields = JSON.stringify(detected)
    changedFields.push('datos_detectados')
  }

  return { data, changedFields: Array.from(new Set(changedFields)) }
}
