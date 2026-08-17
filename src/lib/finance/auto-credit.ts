// ═══════════════════════════════════════════════════════════════
// Motor de financiamiento automotriz (México).
// Cálculo PRECISO de mensualidad por amortización francesa, tabla de
// plazos, MSI, y CAT estimado (tasa efectiva anual). El SERVIDOR
// calcula — el LLM solo pide la cotización; nunca hace la matemática.
// ═══════════════════════════════════════════════════════════════

export interface FinancingConfig {
  /** Tasa de interés ANUAL en % (ej. 13.9) */
  annualRatePct: number
  /** Plazos ofrecidos en meses */
  terms: number[]
  /** Enganche mínimo como % del precio (ej. 10) */
  minDownPct: number
  /** Plazos a Meses Sin Intereses disponibles (ej. [12, 18]) */
  msiTerms: number[]
}

export const DEFAULT_FINANCING: FinancingConfig = {
  annualRatePct: 13.9,
  terms: [12, 24, 36, 48, 60, 72],
  minDownPct: 10,
  msiTerms: [],
}

/** Mezcla la config guardada del workspace con los defaults. */
export function getFinancingConfig(settings: unknown): FinancingConfig {
  let s: Record<string, unknown> = {}
  try { s = typeof settings === 'string' ? JSON.parse(settings) : (settings as Record<string, unknown>) || {} } catch { s = {} }
  const f = (s.financing as Partial<FinancingConfig>) || {}
  const terms = Array.isArray(f.terms) && f.terms.length ? f.terms.filter((n) => Number.isFinite(n) && n > 0) : DEFAULT_FINANCING.terms
  const msiTerms = Array.isArray(f.msiTerms) ? f.msiTerms.filter((n) => Number.isFinite(n) && n > 0) : DEFAULT_FINANCING.msiTerms
  return {
    annualRatePct: Number.isFinite(f.annualRatePct) ? Number(f.annualRatePct) : DEFAULT_FINANCING.annualRatePct,
    terms,
    minDownPct: Number.isFinite(f.minDownPct) ? Number(f.minDownPct) : DEFAULT_FINANCING.minDownPct,
    msiTerms,
  }
}

/** Mensualidad por amortización francesa (pago fijo). */
export function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0
  const r = annualRatePct / 100 / 12
  if (r === 0) return principal / months
  const factor = Math.pow(1 + r, months)
  return (principal * r * factor) / (factor - 1)
}

/** CAT estimado = tasa efectiva anual de la tasa nominal (sin comisiones). */
export function effectiveAnnualRate(annualRatePct: number): number {
  const r = annualRatePct / 100 / 12
  return (Math.pow(1 + r, 12) - 1) * 100
}

export interface QuoteOption {
  termMonths: number
  monthly: number
  totalToPay: number
  totalInterest: number
  isMsi: boolean
}

export interface AutoQuote {
  price: number
  downPayment: number
  downPct: number
  financedAmount: number
  annualRatePct: number
  catPct: number
  options: QuoteOption[]
}

/**
 * Interpreta el enganche: "20%" o "20" (≤100 ⇒ porcentaje) ⇒ % del precio;
 * cualquier otro número ⇒ monto en pesos. Aplica el mínimo configurado.
 */
export function resolveDownPayment(price: number, raw: string | number | undefined, minDownPct: number): number {
  const minDown = price * (minDownPct / 100)
  if (raw === undefined || raw === null || raw === '') return minDown
  const str = String(raw).trim()
  const num = parseFloat(str.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(num) || num <= 0) return minDown
  const isPercent = str.includes('%') || num <= 100
  const down = isPercent ? price * (num / 100) : num
  return Math.max(down, 0) // permitimos por debajo del mínimo si el lead insiste; el bot avisa
}

/** Construye la cotización completa con tabla de plazos. */
export function computeAutoQuote(params: {
  price: number
  downPayment?: string | number
  termMonths?: number
  config: FinancingConfig
}): AutoQuote {
  const { price, config } = params
  const down = resolveDownPayment(price, params.downPayment, config.minDownPct)
  const financed = Math.max(price - down, 0)
  const downPct = price > 0 ? (down / price) * 100 : 0

  const terms = params.termMonths ? [params.termMonths] : config.terms
  const options: QuoteOption[] = terms.map((termMonths) => {
    const isMsi = config.msiTerms.includes(termMonths)
    const rate = isMsi ? 0 : config.annualRatePct
    const monthly = monthlyPayment(financed, rate, termMonths)
    const totalToPay = monthly * termMonths + down
    const totalInterest = monthly * termMonths - financed
    return { termMonths, monthly, totalToPay, totalInterest, isMsi }
  })

  return {
    price,
    downPayment: down,
    downPct,
    financedAmount: financed,
    annualRatePct: config.annualRatePct,
    catPct: effectiveAnnualRate(config.annualRatePct),
    options,
  }
}

const mxn = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

/**
 * Formatea la cotización como mensaje natural de WhatsApp (corto y claro).
 * Si hay un solo plazo, da el detalle; si hay varios, da una mini-tabla.
 */
export function formatQuoteMessage(q: AutoQuote, modelName?: string): string {
  const head = modelName ? `💳 Cotización ${modelName}` : '💳 Cotización de financiamiento'
  const lines: string[] = [
    head,
    `Precio: ${mxn(q.price)}`,
    `Enganche: ${mxn(q.downPayment)} (${Math.round(q.downPct)}%)`,
    `A financiar: ${mxn(q.financedAmount)}`,
  ]
  if (q.options.length === 1) {
    const o = q.options[0]
    lines.push(`Mensualidad: ${mxn(o.monthly)} x ${o.termMonths} meses${o.isMsi ? ' (MSI)' : ''}`)
  } else {
    lines.push('Mensualidades:')
    for (const o of q.options) {
      lines.push(`• ${o.termMonths} meses: ${mxn(o.monthly)}/mes${o.isMsi ? ' (MSI)' : ''}`)
    }
  }
  lines.push(`Tasa ${q.annualRatePct}% anual · CAT estimado ${q.catPct.toFixed(1)}% (sin comisiones, informativo)`)
  return lines.join('\n')
}
