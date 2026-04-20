import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, string> = {}

  // Test 1: Check if jose can be imported
  try {
    const jose = require('jose')
    results['require_jose'] = 'OK: ' + typeof jose.jwtVerify
  } catch (e: any) {
    results['require_jose'] = 'FAIL: ' + e.message?.slice(0, 200)
  }

  // Test 2: Check if jose-667150fbc2d12bc0 can be imported
  try {
    const jose2 = require('jose-667150fbc2d12bc0')
    results['require_jose_hashed'] = 'OK: ' + typeof jose2.jwtVerify
  } catch (e: any) {
    results['require_jose_hashed'] = 'FAIL: ' + e.message?.slice(0, 200)
  }

  // Test 3: Check bcryptjs
  try {
    const bcrypt = require('bcryptjs')
    results['require_bcryptjs'] = 'OK: ' + typeof bcrypt.compare
  } catch (e: any) {
    results['require_bcryptjs'] = 'FAIL: ' + e.message?.slice(0, 200)
  }

  // Test 4: Check if node_modules/jose has dist
  try {
    const fs = require('fs')
    const path = require('path')
    const distPath = path.join(process.cwd(), 'node_modules/jose/dist/node/cjs')
    results['jose_cjs_exists'] = fs.existsSync(distPath) ? 'YES' : 'NO'
  } catch (e: any) {
    results['jose_cjs_exists'] = 'ERROR: ' + e.message?.slice(0, 200)
  }

  // Test 5: Check if jose-667150fbc2d12bc0 has dist
  try {
    const fs = require('fs')
    const path = require('path')
    const distPath = path.join(process.cwd(), 'node_modules/jose-667150fbc2d12bc0/dist/node/cjs')
    results['jose_hashed_cjs_exists'] = fs.existsSync(distPath) ? 'YES' : 'NO'
  } catch (e: any) {
    results['jose_hashed_cjs_exists'] = 'ERROR: ' + e.message?.slice(0, 200)
  }

  return NextResponse.json(results)
}
