import { describe, it, expect } from 'vitest'
import { parseCsv, resolveGoogleUrl, normalizeVehicle, rowToRaw } from './inventory-import'

describe('parseCsv', () => {
  it('parses headers + rows and handles quoted commas', () => {
    const csv = 'marca,modelo,precio\nToyota,"Hilux, SR",620000\nKIA,Rio,265000'
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(['marca', 'modelo', 'precio'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ marca: 'Toyota', modelo: 'Hilux, SR', precio: '620000' })
  })
  it('returns empty for blank input', () => {
    expect(parseCsv('').rows).toHaveLength(0)
  })
})

describe('resolveGoogleUrl', () => {
  it('converts a Sheets URL to a CSV export URL (with gid)', () => {
    const r = resolveGoogleUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=42')
    expect(r.kind).toBe('sheet')
    expect(r.downloadUrl).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=42')
  })
  it('converts a Drive file URL to a direct download', () => {
    const r = resolveGoogleUrl('https://drive.google.com/file/d/XYZ789/view?usp=sharing')
    expect(r.kind).toBe('drive')
    expect(r.downloadUrl).toBe('https://drive.google.com/uc?export=download&id=XYZ789')
  })
  it('passes through a raw URL', () => {
    const r = resolveGoogleUrl('https://example.com/data.csv')
    expect(r.kind).toBe('raw')
  })
})

describe('rowToRaw + normalizeVehicle', () => {
  it('maps known fields, routes unknown to extra, and builds name from parts', () => {
    const mapping = { Marca: 'marca', Modelo: 'modelo', 'Año': 'year', Color: 'colorExterior', IdViejo: '__ignore', Promo: '__extra' }
    const raw = rowToRaw({ Marca: 'Toyota', Modelo: 'Hilux', 'Año': '2023', Color: 'Rojo', IdViejo: '99', Promo: 'Bono $10k' }, mapping)
    const v = normalizeVehicle(raw)
    expect(v.name).toBe('Toyota Hilux 2023')
    expect(v.metadata.marca).toBe('Toyota')
    expect(v.metadata.colorExterior).toBe('Rojo')
    expect(v.extra).toEqual([{ etiqueta: 'Promo', valor: 'Bono $10k' }])
    expect(v.issues).toHaveLength(0)
  })

  it('flags missing name as error', () => {
    const v = normalizeVehicle({ price: 100000 })
    expect(v.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true)
  })

  it('flags an unusual price', () => {
    const v = normalizeVehicle({ name: 'Auto', price: 50 })
    expect(v.issues.some((i) => i.field === 'price')).toBe(true)
  })

  it('flags out-of-range year and Nuevo-with-km', () => {
    const v = normalizeVehicle({ name: 'X', year: '1700', category: 'Nuevo', km: '50000' } as Record<string, unknown>)
    expect(v.issues.some((i) => i.field === 'year')).toBe(true)
    expect(v.issues.some((i) => i.field === 'km')).toBe(true)
  })

  it('normalizes category, status, transmission, fuel', () => {
    const v = normalizeVehicle({ name: 'X', category: 'usado', status: 'reservado', transmision: 'std', combustible: 'diesel' } as Record<string, unknown>)
    expect(v.category).toBe('Usado')
    expect(v.status).toBe('apartado')
    expect(v.metadata.transmision).toBe('Manual')
    expect(v.metadata.combustible).toBe('Diésel')
  })

  it('flags a malformed VIN', () => {
    const v = normalizeVehicle({ name: 'X', vin: 'ABC123' } as Record<string, unknown>)
    expect(v.issues.some((i) => i.field === 'vin')).toBe(true)
  })
})
