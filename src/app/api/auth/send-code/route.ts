// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Send Verification Code
// POST /api/auth/send-code
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setPending } from '@/lib/verification-store'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { registerSchema, validateBody } from '@/lib/validations'

function generate6DigitCode(): string {
  // Use cryptographically secure random source (CSPRNG)
  return String(crypto.randomInt(100000, 1000000))
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: same as registration
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = rateLimit(`send-code:${clientIp}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera un momento.', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const body = await req.json()
    const validation = validateBody(registerSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { name, email, password } = validation.data
    const normalizedEmail = email.trim().toLowerCase()

    // Check email not already registered
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'Este correo ya está registrado. Intenta iniciar sesión.' },
        { status: 409 }
      )
    }

    // Hash password and store pending registration
    const hashedPassword = bcrypt.hashSync(password, 10)
    const code = generate6DigitCode()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes

    await setPending(normalizedEmail, {
      name: name.trim(),
      email: normalizedEmail,
      hashedPassword,
      code,
      expiresAt,
    })

    // Send verification email
    try {
      await sendVerificationEmail(normalizedEmail, name.trim(), code)
    } catch (emailErr) {
      console.error('[send-code] Email send failed:', emailErr)
    }

    return NextResponse.json({
      success: true,
      message: `Código enviado a ${normalizedEmail}. Revisa tu bandeja de entrada.`,
    })
  } catch (error) {
    console.error('[send-code] Error:', error)
    return NextResponse.json({ error: 'Error al enviar el código. Intenta de nuevo.' }, { status: 500 })
  }
}
