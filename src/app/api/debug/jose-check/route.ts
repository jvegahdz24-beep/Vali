import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, string> = {}

  results['jose'] = 'SKIP: jose not installed (auth-edge uses Web Crypto)'
  results['bcryptjs'] = 'SKIP: using SHA-256 fallback'

  return NextResponse.json(results)
}
