import { describe, it, expect } from 'vitest'
import {
  getTenantPaymentConfig,
  getTenantCFDIConfig,
  createTenantPaymentLink,
  createTenantInvoice,
} from '@/lib/erp/payments'

describe('payments — per-tenant config gating (money safety)', () => {
  it('returns null when no payment config exists', () => {
    expect(getTenantPaymentConfig(undefined)).toBeNull()
    expect(getTenantPaymentConfig('{}')).toBeNull()
    expect(getTenantPaymentConfig({ payments: {} })).toBeNull()
  })

  it('rejects a non-sk_ key', () => {
    expect(getTenantPaymentConfig({ payments: { stripeSecretKey: 'pk_live_abc' } })).toBeNull()
  })

  it('accepts a valid tenant-scoped secret key', () => {
    const cfg = getTenantPaymentConfig({ payments: { stripeSecretKey: 'sk_live_tenant123', currency: 'MXN' } })
    expect(cfg).not.toBeNull()
    expect(cfg?.stripeSecretKey).toBe('sk_live_tenant123')
    expect(cfg?.currency).toBe('mxn')
  })

  it('returns null CFDI config unless a full facturama config is present', () => {
    expect(getTenantCFDIConfig(undefined)).toBeNull()
    expect(getTenantCFDIConfig({ cfdi: { provider: 'facturama' } })).toBeNull()
    const cfg = getTenantCFDIConfig({
      cfdi: { provider: 'facturama', apiUrl: 'https://api.facturama.mx/', user: 'u', password: 'p' },
    })
    expect(cfg?.apiUrl).toBe('https://api.facturama.mx')
  })
})

describe('payments — graceful degradation when unconfigured (no charge)', () => {
  it('createTenantPaymentLink returns configured:false without hitting Stripe', async () => {
    const r = await createTenantPaymentLink({ settings: {}, amountMXN: 380000, concept: 'Enganche' })
    expect(r.configured).toBe(false)
  })

  it('createTenantInvoice returns configured:false without a CFDI provider', async () => {
    const r = await createTenantInvoice({
      settings: {}, rfc: 'XAXX010101000', razonSocial: 'Juan', amountMXN: 100, concept: 'Venta',
    })
    expect(r.configured).toBe(false)
  })
})
