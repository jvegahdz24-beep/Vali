import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { validateBody, passwordResetRequestSchema, passwordResetSchema } from '@/lib/validations'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { cookies } from 'next/headers'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sendPasswordResetEmail } from '@/lib/email'

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
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

      const emailSent = await sendPasswordResetEmail({ email: user.email!, token: resetToken, name: user.name || 'Usuario' })
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
