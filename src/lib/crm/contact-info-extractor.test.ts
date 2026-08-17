import { describe, expect, it } from 'vitest'
import { buildContactInfoUpdate, extractContactInfoFromText } from './contact-info-extractor'

describe('contact-info-extractor', () => {
  it('detecta nombre y correo en el mensaje del cliente', () => {
    const info = extractContactInfoFromText(
      'Con alejandro gonzalez, cree que me pueda enviar la confirmacion de la cita a este correo dani.loco5@hotmail.com'
    )

    expect(info.fullName).toBe('Alejandro Gonzalez')
    expect(info.firstName).toBe('Alejandro')
    expect(info.lastName).toBe('Gonzalez')
    expect(info.email).toBe('dani.loco5@hotmail.com')
  })

  it('no inventa nombre desde confirmaciones cortas', () => {
    const info = extractContactInfoFromText('Si por favor agendamelo')

    expect(info.fullName).toBeUndefined()
    expect(info.email).toBeUndefined()
  })

  it('actualiza nombre y correo cuando el contacto tiene datos genericos', () => {
    const info = extractContactInfoFromText('Mi nombre es Maria Lopez y mi correo es maria.lopez@example.com')
    const update = buildContactInfoUpdate({
      firstName: '.',
      lastName: null,
      email: null,
      customFields: '{}',
    }, info, new Date('2026-06-03T16:00:00.000Z'))

    expect(update.data.firstName).toBe('Maria')
    expect(update.data.lastName).toBe('Lopez')
    expect(update.data.email).toBe('maria.lopez@example.com')
    expect(JSON.parse(String(update.data.customFields))).toMatchObject({
      nombre_detectado: 'Maria Lopez',
      correo_detectado: 'maria.lopez@example.com',
      datos_actualizados_en: '2026-06-03T16:00:00.000Z',
    })
  })

  it('no reemplaza un nombre existente no generico, pero guarda el dato detectado', () => {
    const info = extractContactInfoFromText('Soy Carlos Perez, mi RFC es ABCD9912311A1')
    const update = buildContactInfoUpdate({
      firstName: 'Alejandro',
      lastName: 'Gonzalez',
      email: 'alejandro@example.com',
      customFields: '{}',
    }, info)

    expect(update.data.firstName).toBeUndefined()
    expect(update.data.lastName).toBeUndefined()
    expect(JSON.parse(String(update.data.customFields))).toMatchObject({
      nombre_detectado: 'Carlos Perez',
      rfc_detectado: 'ABCD9912311A1',
    })
  })

  it('extrae el nombre saltando honorificos (Dr./Lic./Ing.)', () => {
    expect(extractContactInfoFromText('Mi nombre es Dr. Roberto Méndez').fullName).toBe('Roberto Méndez')
    expect(extractContactInfoFromText('me llamo Lic. Ana Torres').fullName).toBe('Ana Torres')
    expect(extractContactInfoFromText('soy Ing. Juan Pablo Ramirez').fullName).toBe('Juan Pablo Ramirez')
  })

  it('reemplaza nombres placeholder genericos como "Lead" con el nombre real', () => {
    const info = extractContactInfoFromText('Mi nombre es Dr. Roberto Méndez')
    const update = buildContactInfoUpdate({
      firstName: 'Lead',
      lastName: '',
      email: null,
      customFields: '{}',
    }, info)

    expect(update.data.firstName).toBe('Roberto')
    expect(update.data.lastName).toBe('Méndez')
    expect(update.changedFields).toContain('nombre')
  })
})
