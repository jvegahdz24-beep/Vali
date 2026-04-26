import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { requireAuth } from '@/lib/api-auth'

// FIX C7: Added requireAuth — SQL schema no longer public
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
  }

  try {
    const sqlPath = join(process.cwd(), 'download', 'supabase-migration-complete.sql')
    const fullSql = readFileSync(sqlPath, 'utf8')

    const rlsStart = fullSql.indexOf('-- RLS')
    const dataStart = fullSql.indexOf('-- DATA MIGRATION')

    const part1 = fullSql.substring(0, rlsStart).trim()
    const part2Content = fullSql.substring(rlsStart, dataStart).trim()
    const part3 = fullSql.substring(dataStart).trim()

    const parts = [
      {
        name: 'Parte 1: Tablas + Indices + FK',
        sql: part1 + '\n\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;\n',
      },
      { name: 'Parte 2: RLS + Triggers', sql: part2Content },
      { name: 'Parte 3: Datos (256 registros)', sql: part3 },
    ]

    return NextResponse.json({ parts, totalLines: fullSql.split('\n').length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read SQL file', parts: [] }, { status: 500 })
  }
}
