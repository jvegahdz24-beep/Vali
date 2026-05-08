// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Email Service (Resend)
// Transactional emails: verification, password reset, notifications
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'ValiAutoFlow <noreply@valiautoflow.com>'
const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export interface SendPasswordResetParams {
  email: string
  token: string
  name?: string
}

export interface SendVerificationParams {
  email: string
  token: string
  name?: string
}

// ─── Core Send Function ─────────────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not configured. Email sending disabled.')
    console.warn('[Email] Would have sent to:', params.to, '| Subject:', params.subject)
    return { success: true } // Don't block flow when email is not configured
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || EMAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Email] Send failed:', response.status, error)
      return { success: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json()
    console.log('[Email] Sent successfully:', data.id)
    return { success: true }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Email] Send error:', errMsg)
    return { success: false, error: errMsg }
  }
}

// ─── Password Reset Email ──────────────────────────────────

export async function sendPasswordResetEmail(params: SendPasswordResetParams): Promise<{ success: boolean; error?: string }> {
  const { email, token, name } = params
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Restablecer Contraseña</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f9fafb;font-family:system-ui,-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;">
        <!-- Header -->
        <tr>
          <td style="text-align:center;padding:20px 0;">
            <div style="width:48px;height:48px;background:#059669;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:24px;font-weight:bold;">V</span>
            </div>
            <h1 style="margin:12px 0 0;color:#111827;font-size:22px;font-weight:700;">ValiAutoFlow</h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="background:#ffffff;border-radius:12px;padding:32px;margin:0 16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
              Hola${name ? ` ${name}` : ''},
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.5;">
              Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva contraseña:
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:16px;">
                Restablecer Contraseña
              </a>
            </div>
            <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.5;">
              Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña seguirá siendo la misma.
            </p>
            <p style="margin:8px 0 0;color:#6b7280;font-size:14px;line-height:1.5;">
              Este enlace expira en 1 hora por seguridad.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="text-align:center;padding:24px 0;color:#9ca3af;font-size:13px;">
            <p style="margin:0;">
              &copy; ${new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return sendEmail({
    to: email,
    subject: 'Restablece tu contraseña — ValiAutoFlow',
    html,
  })
}

// ─── Email Verification ────────────────────────────────────

export async function sendVerificationEmail(params: SendVerificationParams): Promise<{ success: boolean; error?: string }> {
  const { email, token, name } = params
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verificar Correo Electrónico</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f9fafb;font-family:system-ui,-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;">
        <tr>
          <td style="text-align:center;padding:20px 0;">
            <div style="width:48px;height:48px;background:#059669;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:24px;font-weight:bold;">V</span>
            </div>
            <h1 style="margin:12px 0 0;color:#111827;font-size:22px;font-weight:700;">ValiAutoFlow</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:12px;padding:32px;margin:0 16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
              Hola${name ? ` ${name}` : ''},
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.5;">
              Gracias por registrarte en ValiAutoFlow. Verifica tu correo electrónico para activar tu cuenta:
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${verifyUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:16px;">
                Verificar Correo
              </a>
            </div>
            <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.5;">
              Si no creaste esta cuenta, puedes ignorar este correo.
            </p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:24px 0;color:#9ca3af;font-size:13px;">
            <p style="margin:0;">&copy; ${new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return sendEmail({
    to: email,
    subject: 'Verifica tu correo — ValiAutoFlow',
    html,
  })
}

// ─── Welcome Email ─────────────────────────────────────────

export async function sendWelcomeEmail(email: string, name?: string): Promise<{ success: boolean; error?: string }> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bienvenido a ValiAutoFlow</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f9fafb;font-family:system-ui,-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;">
        <tr>
          <td style="text-align:center;padding:20px 0;">
            <div style="width:48px;height:48px;background:#059669;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:24px;font-weight:bold;">V</span>
            </div>
            <h1 style="margin:12px 0 0;color:#111827;font-size:22px;font-weight:700;">ValiAutoFlow</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:12px;padding:32px;margin:0 16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Bienvenido${name ? `, ${name}` : ''}!</h2>
            <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
              Tu cuenta de ValiAutoFlow está lista. Aquí tienes algunos pasos para empezar:
            </p>
            <ul style="color:#374151;font-size:16px;line-height:2;padding-left:20px;margin:0 0 16px;">
              <li>Conecta tu WhatsApp desde Configuración</li>
              <li>Configura tu agente de IA (JHON)</li>
              <li>Importa tus contactos o deja que el CRM los cree automáticamente</li>
              <li>Activa las automatizaciones de seguimiento</li>
            </ul>
            <div style="text-align:center;margin:32px 0;">
              <a href="${APP_URL}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:16px;">
                Ir al Dashboard
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:24px 0;color:#9ca3af;font-size:13px;">
            <p style="margin:0;">&copy; ${new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return sendEmail({
    to: email,
    subject: `Bienvenido a ValiAutoFlow${name ? `, ${name}` : ''}!`,
    html,
  })
}

// ─── Status Check ──────────────────────────────────────────

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY && RESEND_API_KEY.length > 10
}
