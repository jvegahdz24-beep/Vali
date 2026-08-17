import { NextResponse } from 'next/server'

export async function GET() {
  // SEC-004: Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const results: Record<string, string> = {}

  results['jose'] = 'SKIP: jose not installed (auth-edge uses Web Crypto)'
  results['bcryptjs'] = 'SKIP: using SHA-256 fallback'

  return NextResponse.json(results)
}
