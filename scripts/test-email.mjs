import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const recipient = process.env.TEST_EMAIL_TO

if (!apiKey || !recipient) {
  console.error('Configura RESEND_API_KEY y TEST_EMAIL_TO antes de ejecutar esta prueba.')
  process.exit(1)
}

const resend = new Resend(apiKey)

const { data, error } = await resend.emails.send({
  from: process.env.TEST_EMAIL_FROM || 'ValiAutoFlow <noreply@valiautoflow.com>',
  to: recipient,
  subject: 'Prueba de email - ValiAutoFlow',
  html: '<p>Si recibes este correo, el sistema de email funciona correctamente.</p>',
  text: 'Si recibes este correo, el sistema de email funciona correctamente.',
})

if (error) {
  console.error('ERROR:', JSON.stringify(error))
  process.exit(1)
}

console.log('ENVIADO OK:', data)

