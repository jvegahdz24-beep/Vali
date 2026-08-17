// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Per-Tenant Payments & CFDI (Revenue Engine)
//
// IMPORTANT — money safety:
// The platform Stripe client in `src/lib/stripe.ts` belongs to
// ValiAutoFlow itself (it charges tenants their SaaS subscription).
// It must NEVER be used to collect a tenant's END customer (the car
// buyer), or the money would land in the WRONG account.
//
// These helpers therefore read PER-TENANT credentials from the
// workspace settings JSON. If a tenant has not configured its own
// Stripe key (and CFDI provider), the helpers return
// `{ configured: false }` and NOTHING is charged or invoiced — the
// caller degrades gracefully instead of misdirecting funds.
//
// Expected workspace.settings shape (all optional):
//   {
//     "payments": {
//       "stripeSecretKey": "sk_live_...",   // the DEALERSHIP's own key
//       "currency": "mxn",
//       "successUrl": "https://...",
//       "cancelUrl": "https://..."
//     },
//     "cfdi": {
//       "provider": "facturama",            // only "facturama" supported today
//       "apiUrl": "https://api.facturama.mx",
//       "user": "...",                        // basic-auth user / token
//       "password": "...",
//       "serie": "A",
//       "lugarExpedicion": "76000"
//     }
//   }
// ═══════════════════════════════════════════════════════════════

import Stripe from 'stripe'

// ─── Config extraction ───────────────────────────────────────

export interface TenantPaymentConfig {
  stripeSecretKey: string
  currency: string
  successUrl?: string
  cancelUrl?: string
}

export interface TenantCFDIConfig {
  provider: 'facturama'
  apiUrl: string
  user: string
  password: string
  serie?: string
  lugarExpedicion?: string
}

/** Parse workspace.settings (string or object) into a plain record. */
function asRecord(settings: unknown): Record<string, unknown> {
  if (!settings) return {}
  if (typeof settings === 'string') {
    try { return JSON.parse(settings || '{}') } catch { return {} }
  }
  if (typeof settings === 'object') return settings as Record<string, unknown>
  return {}
}

/** Returns the tenant's own Stripe config, or null if not configured. */
export function getTenantPaymentConfig(settings: unknown): TenantPaymentConfig | null {
  const root = asRecord(settings)
  const p = asRecord(root.payments)
  const key = typeof p.stripeSecretKey === 'string' ? p.stripeSecretKey.trim() : ''
  // Guard: must be a real, tenant-scoped secret key. Refuse anything empty
  // or that looks like the platform key falling through from env.
  if (!key || !key.startsWith('sk_')) return null
  if (process.env.STRIPE_SECRET_KEY && key === process.env.STRIPE_SECRET_KEY) {
    // Same key as the platform → would misdirect funds. Treat as unconfigured.
    return null
  }
  return {
    stripeSecretKey: key,
    currency: (typeof p.currency === 'string' && p.currency) ? p.currency.toLowerCase() : 'mxn',
    successUrl: typeof p.successUrl === 'string' ? p.successUrl : undefined,
    cancelUrl: typeof p.cancelUrl === 'string' ? p.cancelUrl : undefined,
  }
}

/** Returns the tenant's CFDI provider config, or null if not configured. */
export function getTenantCFDIConfig(settings: unknown): TenantCFDIConfig | null {
  const root = asRecord(settings)
  const c = asRecord(root.cfdi)
  if (c.provider !== 'facturama') return null
  const apiUrl = typeof c.apiUrl === 'string' ? c.apiUrl.trim() : ''
  const user = typeof c.user === 'string' ? c.user.trim() : ''
  const password = typeof c.password === 'string' ? c.password.trim() : ''
  if (!apiUrl || !user || !password) return null
  return {
    provider: 'facturama',
    apiUrl: apiUrl.replace(/\/$/, ''),
    user,
    password,
    serie: typeof c.serie === 'string' ? c.serie : undefined,
    lugarExpedicion: typeof c.lugarExpedicion === 'string' ? c.lugarExpedicion : undefined,
  }
}

// ─── Payment link (Stripe Checkout, per-tenant) ───────────────

export type PaymentLinkResult =
  | { configured: false; reason: string }
  | { configured: true; url: string; sessionId: string }

export interface CreatePaymentLinkParams {
  settings: unknown
  amountMXN: number          // amount in MXN units (e.g. 380000), NOT centavos
  concept: string
  customerEmail?: string
  metadata?: Record<string, string>
}

/**
 * Create a one-time Stripe Checkout payment link using the TENANT's own
 * Stripe account. Returns { configured: false } if the tenant has not
 * wired its key — the caller must then NOT promise a link to the customer.
 */
export async function createTenantPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const cfg = getTenantPaymentConfig(params.settings)
  if (!cfg) {
    return { configured: false, reason: 'tenant_stripe_not_configured' }
  }

  const amount = Math.round(Number(params.amountMXN) || 0)
  if (amount <= 0) {
    return { configured: false, reason: 'invalid_amount' }
  }

  const concept = (params.concept || 'Pago').slice(0, 250)

  const stripe = new Stripe(cfg.stripeSecretKey, {
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionParams: any = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: cfg.currency,
          product_data: { name: concept },
          unit_amount: amount * 100, // centavos
        },
        quantity: 1,
      },
    ],
    success_url: cfg.successUrl || 'https://valiautoflow.com/pago/exito',
    cancel_url: cfg.cancelUrl || 'https://valiautoflow.com/pago/cancelado',
    ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
    metadata: { source: 'revenue-engine', ...(params.metadata || {}) },
  }

  const session = await stripe.checkout.sessions.create(sessionParams)
  if (!session.url) {
    return { configured: false, reason: 'stripe_no_url' }
  }
  return { configured: true, url: session.url, sessionId: session.id }
}

// ─── CFDI invoice (Facturama adapter, per-tenant) ─────────────

export type InvoiceResult =
  | { configured: false; reason: string }
  | { configured: true; id: string; folio?: string; pdfUrl?: string; xmlUrl?: string }

export interface CreateInvoiceParams {
  settings: unknown
  rfc: string
  razonSocial: string
  usoCFDI?: string
  amountMXN: number
  concept: string
}

/**
 * Create a CFDI invoice through the tenant's Facturama account.
 * Returns { configured: false } if no CFDI provider is wired (the common
 * case today — there is no platform-level PAC). The Facturama HTTP call
 * only runs when real credentials exist, so this is dormant until then.
 */
export async function createTenantInvoice(params: CreateInvoiceParams): Promise<InvoiceResult> {
  const cfg = getTenantCFDIConfig(params.settings)
  if (!cfg) {
    return { configured: false, reason: 'tenant_cfdi_not_configured' }
  }

  const amount = Math.round((Number(params.amountMXN) || 0) * 100) / 100
  if (amount <= 0) return { configured: false, reason: 'invalid_amount' }
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(params.rfc.trim())) {
    return { configured: false, reason: 'invalid_rfc' }
  }

  const auth = Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')
  const subtotal = Math.round((amount / 1.16) * 100) / 100
  const iva = Math.round((amount - subtotal) * 100) / 100

  // Facturama CFDI 4.0 minimal payload.
  const body = {
    Serie: cfg.serie || 'A',
    Currency: 'MXN',
    ExpeditionPlace: cfg.lugarExpedicion || '00000',
    PaymentForm: '99',
    PaymentMethod: 'PUE',
    CfdiType: 'I',
    Receiver: {
      Rfc: params.rfc.trim().toUpperCase(),
      Name: params.razonSocial.trim(),
      CfdiUse: params.usoCFDI || 'G03',
    },
    Items: [
      {
        ProductCode: '01010101',
        Description: params.concept.slice(0, 250),
        UnitCode: 'E48',
        Quantity: 1,
        UnitPrice: subtotal,
        Subtotal: subtotal,
        TaxObject: '02',
        Taxes: [
          { Total: iva, Name: 'IVA', Base: subtotal, Rate: 0.16, IsRetention: false },
        ],
        Total: amount,
      },
    ],
  }

  const res = await fetch(`${cfg.apiUrl}/3/cfdis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { configured: false, reason: `facturama_error_${res.status}: ${txt.slice(0, 200)}` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}))
  return {
    configured: true,
    id: String(data.Id || data.id || ''),
    folio: data.Folio ? String(data.Folio) : undefined,
  }
}
