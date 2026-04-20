import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Split the full migration SQL into 3 parts for easy copy-paste
export async function GET() {
  try {
    const sqlPath = join(process.cwd(), 'download', 'supabase-migration-complete.sql')
    const fullSql = readFileSync(sqlPath, 'utf8')

    // Find split points
    const rlsStart = fullSql.indexOf('-- RLS')
    const dataStart = fullSql.indexOf('-- DATA MIGRATION')

    // Part 1: BEGIN + CREATE TABLE + INDEXES + FK (no COMMIT)
    const part1 = fullSql.substring(0, rlsStart).trim()
    // Part 2: RLS + Triggers
    const part2Content = fullSql.substring(rlsStart, dataStart).trim()
    // Part 3: Data INSERT + GRANT + COMMIT
    const part3 = fullSql.substring(dataStart).trim()

    // Ensure each part is a valid transaction
    const parts = [
      {
        name: 'Parte 1: Tablas + Indices + FK',
        sql: part1 + '\n\n-- Temporarily disable RLS for bulk insert\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;\n',
      },
      {
        name: 'Parte 2: RLS + Triggers',
        sql: part2Content,
      },
      {
        name: 'Parte 3: Datos (256 registros)',
        sql: part3,
      },
    ]

    return NextResponse.json({ parts, totalLines: fullSql.split('\n').length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read SQL file', parts: [] }, { status: 500 })
  }
}
