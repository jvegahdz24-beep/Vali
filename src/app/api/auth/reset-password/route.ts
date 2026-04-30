import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { validateBody, passwordResetRequestSchema, passwordResetSchema } from '@/lib/validations'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { cookies } from 'next/headers'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

async function sendPasswordResetEmail(email: string, resetToken: string, userName: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

  // Try sending via Resend API (if configured)
  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'ValiAutoFlow <noreply@valiflow.com>',
          to: email,
          subject: '🔑 Restablece tu contraseña — ValiAutoFlow',
          html: `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #059669, #0d9488); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: white; margin: 0; font-size: 24px;">ValiAutoFlow</h1>
              </div>
              <p style="font-size: 16px; color: #374151;">Hola ${userName},</p>
              <p style="font-size: 16px; color: #374151;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva:</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background: #059669; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; font-size: 16px;">
                  Restablecer Contraseña
                </a>
              </div>
              <p style="font-size: 14px; color: #6b7280;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
              <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="font-size: 12px; color: #9ca3af;">ValiAutoFlow — Automatización inteligente con WhatsApp + IA para Pymes</p>
              </div>
            </div>
          `,
        }),
      })
      if (response.ok) {
        console.log('[Reset Password] Email sent via Resend to:', email)
        return true
      }
      console.error('[Reset Password] Resend API error:', await response.text())
    } catch (error) {
      console.error('[Reset Password] Failed to send email via Resend:', error)
    }
  }

  // Fallback: log the reset URL (dev mode)
  console.log(`[Reset Password] EMAIL NOT CONFIGURED. Reset URL: ${resetUrl}`)
  return false
}

// POST /api/auth/reset-password — Request password reset
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 password reset requests per minute per IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = rateLimit(`reset-pw:${clientIp}`, RATE_LIMITS.auth.limit, RATE_LIMITS.auth.windowMs)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera un momento.', code: 'RATE_LIMITED', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const body = await req.json()

    // Check if this is a reset request (has email) or actual reset (has token)
    if (body.email && !body.token) {
      // Reset request
      const validation = validateBody(passwordResetRequestSchema, body)
      if (!validation.success) {
        return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
      }

      const user = await db.user.findUnique({
        where: { email: validation.data.email.toLowerCase().trim() },
      })

      if (!user) {
        // Don't reveal if email exists (security)
        return NextResponse.json({
          success: true,
          message: 'Si el correo existe, recibirás un enlace de restablecimiento.',
        })
      }

      // Generate reset token (valid for 1 hour)
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Store token in VerificationToken table
      await db.verificationToken.create({
        data: {
          identifier: user.email!,
          token: resetToken,
          expires: resetExpires,
        },
      })

      const emailSent = await sendPasswordResetEmail(user.email!, resetToken, user.name || 'Usuario')
      const isDev = process.env.NODE_ENV === 'development'

      return NextResponse.json({
        success: true,
        message: 'Si el correo existe, recibirás un enlace de restablecimiento.',
        ...(isDev && { devToken: resetToken }),
      })
    }

    if (body.token && body.password) {
      // Actual password reset
      const validation = validateBody(passwordResetSchema, body)
      if (!validation.success) {
        return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
      }

      const { token, password } = validation.data

      // Find valid token
      const verificationToken = await db.verificationToken.findUnique({
        where: { token },
      })

      if (!verificationToken || verificationToken.expires < new Date()) {
        return NextResponse.json(
          { error: 'Token inválido o expirado. Solicita un nuevo enlace.', code: 'INVALID_TOKEN' },
          { status: 400 }
        )
      }

      // Find user
      const user = await db.user.findUnique({
        where: { email: verificationToken.identifier },
      })

      if (!user) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
      }

      // Hash new password and update
      const hashedPassword = hashPassword(password)
      await db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })

      // Delete used token
      await db.verificationToken.delete({
        where: { token },
      })

      // Create new session
      const payload = {
        userId: user.id,
        email: user.email!,
        name: user.name || 'Usuario',
        role: user.role,
      }
      const sessionToken = await createSessionToken(payload)

      // Set cookie
      const cookieStore = await cookies()
      cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: false, // Behind Caddy reverse proxy (SSL terminated at proxy level)
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      })

      return NextResponse.json({ success: true, message: 'Contraseña actualizada correctamente' })
    }

    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  } catch (error) {
    console.error('[Reset Password Error]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
