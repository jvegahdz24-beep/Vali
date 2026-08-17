// ═══════════════════════════════════════════════════════════════
// INYECCIÓN PROACTIVA DE COTIZACIÓN (2026-07-20)
// La matemática y la config viven en @/lib/finance/auto-credit (motor
// existente que también usa el tag [CRM:cotiza]). Este módulo solo:
//   1) detecta que el mensaje habla de financiamiento,
//   2) extrae un enganche mencionado por el cliente,
//   3) arma el bloque de "números oficiales" para el prompt — así el bot
//      tiene las cifras EXACTAS aunque el modelo olvide emitir el tag.
// ═══════════════════════════════════════════════════════════════

import { getFinancingConfig, monthlyPayment, type FinancingConfig } from '@/lib/finance/auto-credit'

export { getFinancingConfig }

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')

/** ¿El mensaje habla de financiamiento/mensualidades? */
export function mentionsFinancing(text: string): boolean {
  return /financ|cr[eé]dito|mensualidad|enganche|a meses|plazo|cu[aá]nto (sale|queda|pago) al mes|pagos? mensual|msi\b/i.test(text || '')
}

/** Extrae un monto de enganche dicho por el cliente ("80 mil", "$80,000 de enganche"). */
export function parseDownPayment(text: string): number | null {
  const t = (text || '').toLowerCase()
  const mMil = t.match(/(\d{1,3}(?:\.\d)?)\s*mil\b/)
  if (mMil) {
    const v = Math.round(parseFloat(mMil[1]) * 1000)
    if (v >= 5000 && v <= 5_000_000) return v
  }
  if (/enganche|entrada|anticipo|inicial|de contado doy|tengo/.test(t)) {
    const mAbs = t.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,7})/)
    if (mAbs) {
      const v = Math.round(Number(mAbs[1].replace(/[.,]/g, '')))
      if (v >= 5000 && v <= 5_000_000) return v
    }
  }
  return null
}

/** Bloque de cifras EXACTAS para el prompt (grid enganches × plazos). */
export function buildFinancingBlock(
  carName: string,
  price: number,
  cfg: FinancingConfig,
  downPayment?: number | null
): string {
  if (!price || price <= 0) return ''
  // Plazos representativos (máx 4) y enganches típicos empezando por el mínimo.
  const terms = (cfg.terms.length > 4 ? cfg.terms.filter((t) => [24, 36, 48, 60].includes(t)) : cfg.terms).slice(0, 4)
  const usableTerms = terms.length ? terms : cfg.terms.slice(0, 4)
  const pcts = [cfg.minDownPct, 20, 30, 40].filter((v, i, a) => a.indexOf(v) === i && v > 0 && v < 100).sort((a, b) => a - b)

  const rows: string[] = []
  if (downPayment && downPayment < price) {
    const fin = price - downPayment
    const opts = usableTerms.map((m) => `${m}m: ${money(monthlyPayment(fin, cfg.annualRatePct, m))}/mes`).join(' · ')
    rows.push(`→ CON EL ENGANCHE QUE DIO EL CLIENTE (${money(downPayment)}): financia ${money(fin)} → ${opts}`)
  }
  for (const pct of pcts) {
    const dp = Math.round(price * (pct / 100))
    const fin = price - dp
    const opts = usableTerms.map((m) => `${m}m: ${money(monthlyPayment(fin, cfg.annualRatePct, m))}`).join(' · ')
    rows.push(`- Enganche ${pct}% (${money(dp)}): ${opts}`)
  }
  return `\n\n💰 COTIZACIÓN FINANCIERA OFICIAL — ${carName} (precio ${money(price)}, tasa ${cfg.annualRatePct}% anual referencial):
${rows.join('\n')}
⛔ REGLA ABSOLUTA: usa SOLO estas mensualidades EXACTAS (elige la fila de enganche/plazo que aplique). JAMÁS calcules números tú mismo ni inventes otros. Si el enganche del cliente no está en la tabla, usa la fila más cercana y di "aproximadamente". Aclara que la tasa es referencial y sujeta a aprobación de crédito.`
}
