import { describe, it, expect } from 'vitest'
import { canUseTool } from '@/lib/ai/agent-permissions'

describe('agent-permissions — per-agent tool matrix (spec Paso 6)', () => {
  it('only SELLER/CERRADOR can generate payment links or invoices', () => {
    expect(canUseTool('SELLER', 'generatePaymentLink')).toBe(true)
    expect(canUseTool('CERRADOR', 'generatePaymentLink')).toBe(true)
    expect(canUseTool('JHON', 'generatePaymentLink')).toBe(false)
    expect(canUseTool('EXPERTO', 'createInvoice')).toBe(false)
    expect(canUseTool('CERRADOR', 'createInvoice')).toBe(true)
  })

  it('JHON/SELLER/CERRADOR can update the deal stage', () => {
    expect(canUseTool('JHON', 'updateDealStage')).toBe(true)
    expect(canUseTool('SELLER', 'updateDealStage')).toBe(true)
    expect(canUseTool('SERVICIO', 'updateDealStage')).toBe(false)
  })

  it('everyone can send WhatsApp messages', () => {
    expect(canUseTool('JHON', 'sendWhatsAppMessage')).toBe(true)
    expect(canUseTool('SERVICIO', 'sendWhatsAppMessage')).toBe(true)
  })

  it('is case-insensitive and defaults unknown agents to JHON', () => {
    expect(canUseTool('seller', 'generatePaymentLink')).toBe(true)
    expect(canUseTool('randomBot', 'generatePaymentLink')).toBe(false) // → JHON
    expect(canUseTool(undefined, 'updateDealStage')).toBe(true)        // → JHON
  })
})
