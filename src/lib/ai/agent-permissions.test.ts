import { describe, it, expect } from 'vitest'
import { canRunToolForAgent, canUseTool } from '@/lib/ai/agent-permissions'

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

  it('allows a tool declared in the routed agent allow-list', () => {
    expect(canRunToolForAgent('SELLER', 'generatePaymentLink', ['generatePaymentLink'])).toBe(true)
  })

  it('blocks a base-permitted tool missing from the routed agent allow-list', () => {
    expect(canRunToolForAgent('SELLER', 'createInvoice', ['generatePaymentLink'])).toBe(false)
  })

  it('falls back to the base matrix when allow-list is empty', () => {
    expect(canRunToolForAgent('SELLER', 'createInvoice', [])).toBe(true)
    expect(canRunToolForAgent('JHON', 'createInvoice', [])).toBe(false)
  })

  it('keeps forbiddenActions as a hard deny even when allow-listed', () => {
    expect(canRunToolForAgent('SELLER', 'createInvoice', ['createInvoice'], ['facturación'])).toBe(false)
  })
})
