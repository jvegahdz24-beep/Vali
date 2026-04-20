// ═══════════════════════════════════════════════════════
// ValiAutoFlow — Auth Routes (Custom JWT)
// Uses custom auth system from auth-edge.ts (NOT NextAuth)
// This file kept for backward compatibility with /api/auth/* routes
// ═══════════════════════════════════════════════════════

import { NextResponse } from 'next/server'

// All auth is handled by dedicated routes:
// POST /api/auth/login — Login with email/password
// GET  /api/auth/me    — Get current user
// POST /api/auth/reset-password — Reset password
// GET  /api/auth/google/callback — Google OAuth

export async function GET() {
  return NextResponse.json({
    message: 'ValiAutoFlow Auth API',
    endpoints: {
      login: 'POST /api/auth/login',
      me: 'GET /api/auth/me',
      resetPassword: 'POST /api/auth/reset-password',
      googleCallback: 'GET /api/auth/google/callback',
    },
  })
}

export async function POST() {
  return NextResponse.json({
    message: 'ValiAutoFlow Auth API',
    login: 'POST /api/auth/login',
  })
}
