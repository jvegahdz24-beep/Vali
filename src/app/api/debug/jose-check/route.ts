import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const results: Record<string, string> = {}
    results['jose'] = 'SKIP: jose not installed (auth-edge uses Web Crypto)'
    results['bcryptjs'] = 'SKIP: using SHA-256 fallback'

    return NextResponse.json(results)
  } catch (error) {
    return errorResponse(error, 'Error en verificación jose')
  }
}
