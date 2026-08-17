// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Email Service (Resend)
// Handles transactional emails: verification codes, welcome, etc.
// ═══════════════════════════════════════════════════════════════

import { Resend } from 'resend'

// ─── Transport Configuration ──────────────────────────────────

const FROM_NAME = 'ValiAutoFlow'
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@valiautoflow.com'

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    text,
  })

  if (error) throw new Error(error.message)
}

// ─── Verification Code Email ──────────────────────────────────

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de verificación - ValiAutoFlow</title>
</head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
              <div style="width:52px;height:52px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:28px;line-height:1;">🤖</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">ValiAutoFlow</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">CRM Inteligente con IA</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:600;">Verifica tu correo</h2>
              <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">
                Hola <strong style="color:#111827;">${name}</strong>, usa el código de abajo para completar tu registro. Este código expira en <strong>10 minutos</strong>.
              </p>

              <!-- Code Box -->
              <div style="background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 6px;color:#6b7280;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Tu código de verificación</p>
                <div style="font-size:40px;font-weight:800;color:#059669;letter-spacing:12px;font-family:monospace;">${code}</div>
              </div>

              <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;text-align:center;">
                Si no solicitaste este código, ignora este mensaje.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  await sendEmail(
    to,
    `${code} — Tu código de verificación ValiAutoFlow`,
    html,
    `Hola ${name},\n\nTu código de verificación es: ${code}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este código, ignora este mensaje.\n\n— ValiAutoFlow`,
  )
}

// ─── Welcome Email (sent after plan selection) ────────────────

export async function sendWelcomeEmail(to: string, name: string, plan: string): Promise<void> {
  const planLabels: Record<string, string> = {
    free: 'Plan Free',
    trial: 'Prueba de 14 días',
    starter: 'Plan Starter',
    pro: 'Plan Pro',
    enterprise: 'Plan Enterprise',
  }
  const planLabel = planLabels[plan] || plan

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>¡Bienvenido a ValiAutoFlow!</title>
</head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">¡Bienvenido, ${name}!</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Tu cuenta de ValiAutoFlow está lista</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
                Ya tienes acceso a ValiAutoFlow con el <strong style="color:#059669;">${planLabel}</strong>. Comienza a automatizar tus ventas con IA.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">
                  Ir al Dashboard →
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ValiAutoFlow.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  await sendEmail(
    to,
    `¡Bienvenido a ValiAutoFlow! — ${planLabel}`,
    html,
    `¡Bienvenido, ${name}! Tu cuenta de ValiAutoFlow está lista con el ${planLabel}. Accede en: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`,
  )
}

// ─── Billing: Payment Confirmed ──────────────────────────────

export async function sendPaymentSuccessEmail(
  to: string,
  name: string,
  plan: string,
  amountMXN: number,
  nextRenewal: Date,
): Promise<void> {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const renewalStr = nextRenewal.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const amountStr = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amountMXN)

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Pago confirmado — ValiAutoFlow</title></head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✅</div>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Pago confirmado</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Tu suscripción está activa</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
              Hola <strong>${name}</strong>, tu pago ha sido procesado exitosamente.
            </p>
            <div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:12px;padding:20px;margin-bottom:24px;">
              <table width="100%" cellpadding="0" cellspacing="4">
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Plan</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">ValiAutoFlow ${planLabel}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Monto cobrado</td>
                  <td style="color:#059669;font-size:13px;font-weight:600;text-align:right;">${amountStr} MXN</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Próxima renovación</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${renewalStr}</td>
                </tr>
              </table>
            </div>
            <div style="text-align:center;">
              <a href="${appUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">
                Ir al Dashboard →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

  await sendEmail(
    to,
    `Pago confirmado — ValiAutoFlow ${planLabel}`,
    html,
    `Hola ${name},\n\nTu pago de ${amountStr} MXN ha sido procesado. Plan: ValiAutoFlow ${planLabel}.\nPróxima renovación: ${renewalStr}.\n\nAccede en: ${appUrl}\n\n— ValiAutoFlow`,
  )
}

// ─── Billing: Payment Failed ─────────────────────────────────

export async function sendPaymentFailedEmail(
  to: string,
  name: string,
  portalUrl?: string,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const updateUrl = portalUrl || `${appUrl}/select-plan`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Problema con tu pago — ValiAutoFlow</title></head>
<body style="margin:0;padding:0;background-color:#fef2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:32px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">⚠️</div>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Problema con tu pago</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Acción requerida para mantener tu acceso</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              Hola <strong>${name}</strong>, no pudimos procesar el cobro de tu suscripción a ValiAutoFlow.
            </p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
              Tu acceso puede verse afectado si no regularizas el pago. Actualiza tu método de pago lo antes posible para evitar la suspensión de tu cuenta.
            </p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:24px;">
              <p style="margin:0;color:#b91c1c;font-size:13px;line-height:1.5;">
                🔁 <strong>Reintento automático:</strong> Stripe intentará cobrar de nuevo en los próximos días. Si el pago sigue fallando, tu cuenta será suspendida temporalmente.
              </p>
            </div>
            <div style="text-align:center;">
              <a href="${updateUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">
                Actualizar método de pago →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ValiAutoFlow. Si necesitas ayuda, responde este correo.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

  await sendEmail(
    to,
    '⚠️ Problema con tu pago — ValiAutoFlow',
    html,
    `Hola ${name},\n\nNo pudimos procesar el cobro de tu suscripción a ValiAutoFlow.\n\nActualiza tu método de pago en: ${updateUrl}\n\nSi no regularizas el pago, tu cuenta será suspendida temporalmente.\n\n— ValiAutoFlow`,
  )
}

// ─── Billing: Subscription Cancelled ─────────────────────────

export async function sendSubscriptionCancelledEmail(
  to: string,
  name: string,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Suscripción cancelada — ValiAutoFlow</title></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#4b5563,#6b7280);padding:32px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">👋</div>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Suscripción cancelada</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Tus datos se conservan por 90 días</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              Hola <strong>${name}</strong>, tu suscripción a ValiAutoFlow ha sido cancelada.
            </p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
              Conservaremos tus datos durante 90 días. Si cambias de opinión, puedes reactivar tu cuenta en cualquier momento.
            </p>
            <div style="text-align:center;">
              <a href="${appUrl}/select-plan" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">
                Reactivar mi cuenta →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ValiAutoFlow.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

  await sendEmail(
    to,
    'Tu suscripción a ValiAutoFlow ha sido cancelada',
    html,
    `Hola ${name},\n\nTu suscripción a ValiAutoFlow ha sido cancelada. Tus datos se conservan por 90 días.\n\nPuedes reactivar en: ${appUrl}/select-plan\n\n— ValiAutoFlow`,
  )
}

// ─── CRM: Appointment Confirmation ───────────────────────────

export async function sendAppointmentConfirmationEmail(params: {
  to: string
  name: string
  businessName: string
  title: string
  date: Date
  durationMinutes: number
  type: string
}): Promise<void> {
  const { to, name, businessName, title, date, durationMinutes, type } = params
  const dateStr = date.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const typeLabel = type === 'meeting'
    ? 'Reunión'
    : type === 'followup'
      ? 'Seguimiento'
      : 'Llamada'

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Confirmación de cita</title></head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✅</div>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Cita confirmada</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${businessName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
              Hola <strong>${name}</strong>, tu cita quedó confirmada.
            </p>
            <div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:12px;padding:20px;margin-bottom:24px;">
              <table width="100%" cellpadding="0" cellspacing="6">
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Cita</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${title}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Fecha</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${dateStr}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Hora</td>
                  <td style="color:#059669;font-size:13px;font-weight:700;text-align:right;">${timeStr}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Duración</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${durationMinutes} minutos</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:13px;">Tipo</td>
                  <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${typeLabel}</td>
                </tr>
              </table>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
              Si necesitas reagendar, responde al mismo WhatsApp donde hiciste la cita.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} ValiAutoFlow.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

  await sendEmail(
    to,
    `Confirmación de cita — ${businessName}`,
    html,
    `Hola ${name},\n\nTu cita quedó confirmada.\n\nCita: ${title}\nFecha: ${dateStr}\nHora: ${timeStr}\nDuración: ${durationMinutes} minutos\nTipo: ${typeLabel}\n\nSi necesitas reagendar, responde al mismo WhatsApp donde hiciste la cita.\n\n— ${businessName}`,
  )
}
