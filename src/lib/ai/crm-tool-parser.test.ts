import { describe, it, expect } from 'vitest'
import { parseCRMActions, stripCRMActions, buildCRMToolsInstruction } from '@/lib/ai/crm-tool-parser'

describe('crm-tool-parser — pago/factura actions', () => {
  it('parses a [CRM:pago:monto|concepto] tag', () => {
    const actions = parseCRMActions('Listo 🚗[CRM:score:85][CRM:temp:hot][CRM:pago:380000|Enganche Sedán 2026]')
    const pago = actions.find(a => a.type === 'pago')
    expect(pago).toBeTruthy()
    expect(pago?.value).toBe('380000|Enganche Sedán 2026')
  })

  it('parses a [CRM:factura:rfc|razon|uso] tag', () => {
    const actions = parseCRMActions('Gracias[CRM:factura:XAXX010101000|Juan Pérez|G03]')
    const f = actions.find(a => a.type === 'factura')
    expect(f?.value).toBe('XAXX010101000|Juan Pérez|G03')
  })

  it('strips pago/factura tags from the customer-facing reply', () => {
    const raw = 'Te paso el link 👇[CRM:pago:380000|Enganche][CRM:close:ganado]'
    expect(stripCRMActions(raw)).toBe('Te paso el link 👇')
  })

  it('documents both new tools in the system instruction', () => {
    const inst = buildCRMToolsInstruction()
    expect(inst).toContain('[CRM:pago:')
    expect(inst).toContain('[CRM:factura:')
  })
})
