import { describe, it, expect } from 'vitest'
import { detectExpedienteCategory, isAllowedDocument } from './expediente'

describe('detectExpedienteCategory', () => {
  it('detects identity documents', () => {
    expect(detectExpedienteCategory('INE_frente.jpg')).toBe('ine')
    expect(detectExpedienteCategory('credencial de elector.png')).toBe('ine')
    expect(detectExpedienteCategory('mi licencia de conducir.pdf')).toBe('identificacion')
  })

  it('detects fiscal / RFC documents', () => {
    expect(detectExpedienteCategory('Constancia de Situacion Fiscal.pdf')).toBe('rfc')
    expect(detectExpedienteCategory('RFC.pdf')).toBe('rfc')
  })

  it('detects proof of address', () => {
    expect(detectExpedienteCategory('comprobante de domicilio.pdf')).toBe('comprobante_domicilio')
    expect(detectExpedienteCategory('recibo CFE marzo.jpg')).toBe('comprobante_domicilio')
  })

  it('detects contracts, quotes and invoices', () => {
    expect(detectExpedienteCategory('Contrato_firmado.pdf')).toBe('contrato')
    expect(detectExpedienteCategory('cotizacion sedan.pdf')).toBe('cotizacion')
    expect(detectExpedienteCategory('factura_A123.xml')).toBe('factura')
    expect(detectExpedienteCategory('CFDI.pdf')).toBe('factura')
  })

  it('falls back to otro for unknown names', () => {
    expect(detectExpedienteCategory('foto_random.jpg')).toBe('otro')
    expect(detectExpedienteCategory('')).toBe('otro')
  })
})

describe('isAllowedDocument', () => {
  it('accepts document and image extensions', () => {
    for (const f of ['a.pdf', 'b.jpg', 'c.PNG', 'd.docx', 'e.xml']) {
      expect(isAllowedDocument(f)).toBe(true)
    }
  })
  it('rejects executables and unknown extensions', () => {
    for (const f of ['a.exe', 'b.sh', 'c.zip', 'noextension']) {
      expect(isAllowedDocument(f)).toBe(false)
    }
  })
})
