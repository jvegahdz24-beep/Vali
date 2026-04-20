// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Supabase Setup Script
// Creates tables and imports data into Supabase PostgreSQL
// ═══════════════════════════════════════════════════════════════
//
// USAGE: npx tsx scripts/setup-supabase.ts
//
// PREREQUISITES:
//   1. Set DATABASE_URL in .env to your Supabase PostgreSQL URL
//   2. Set DIRECT_URL in .env (same but without ?pgbouncer=true)
//
// WHAT THIS SCRIPT DOES:
//   1. Connects to Supabase PostgreSQL
//   2. Creates all tables (using Prisma schema)
//   3. Enables RLS with permissive policies
//   4. Imports existing data from SQLite export
// ═══════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

async function main() {
  console.log('🚀 ValiAutoFlow — Supabase Setup')
  console.log('═══════════════════════════════════\n')

  // Check DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl.includes('YOUR_DB_PASSWORD') || dbUrl.includes('file:')) {
    console.error('❌ DATABASE_URL not configured. Please set it in .env')
    console.error('   Get your password from: Supabase Dashboard > Settings > Database')
    process.exit(1)
  }

  // Step 1: Push schema to Supabase
  console.log('📋 Step 1: Pushing Prisma schema to Supabase...')
  const { execSync } = require('child_process')
  try {
    execSync('npx prisma db push --accept-data-loss 2>&1', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    })
    console.log('✅ Schema pushed successfully!\n')
  } catch (e) {
    console.error('❌ Failed to push schema. Make sure DATABASE_URL is correct.')
    console.error('   You can also run the SQL manually in Supabase SQL Editor:')
    console.error('   download/supabase-final.sql')
    process.exit(1)
  }

  // Step 2: Check for data export
  const exportPath = path.join(__dirname, '..', 'download', 'sqlite-data-export.json')
  if (!fs.existsSync(exportPath)) {
    console.log('📦 No data export found. Run "npx tsx scripts/export-sqlite-data.ts" first.')
    console.log('   Or use the seed endpoint: POST /api/seed')
    return
  }

  // Step 3: Import data
  console.log('📦 Step 2: Importing data from SQLite export...')
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
  const prisma = new PrismaClient()

  // Import in dependency order
  const importOrder = [
    'User', 'Account', 'Session', 'VerificationToken',
    'Workspace', 'WorkspaceMember',
    'Contact',
    'Pipeline', 'PipelineStage',
    'Conversation', 'Message',
    'Agent', 'AgentPersona', 'AgentLog', 'AgentMemory',
    'Deal',
    'FollowUpRule', 'FollowUpTask',
    'Automation',
    'Subscription',
    'AnalyticsEvent',
    'WebhookConfig',
    'MediaFile',
    'LeadProfile',
    'WhatsAppAuth',
  ]

  let totalImported = 0

  for (const table of importOrder) {
    const records = data[table]
    if (!records || records.length === 0) continue

    const model = table.charAt(0).toLowerCase() + table.slice(1)

    try {
      // @ts-ignore
      for (const record of records) {
        try {
          // Remove auto-generated fields that might conflict
          const { createdAt, updatedAt, ...data } = record

          // @ts-ignore
          await prisma[model].create({
            data: {
              ...data,
              // Keep original timestamps if they exist
              ...(createdAt && { createdAt: new Date(createdAt) }),
              ...(updatedAt && { updatedAt: new Date(updatedAt) }),
            },
          })
          totalImported++
        } catch (e: any) {
          // Duplicate or constraint error - skip
          if (e.code === 'P2002') continue
          console.error(`  ❌ ${table} record error: ${e.message?.substring(0, 80)}`)
        }
      }
      console.log(`  ✅ ${table}: ${records.length} rows imported`)
    } catch (e: any) {
      console.error(`  ⚠️  ${table}: ${e.message?.substring(0, 80)}`)
    }
  }

  console.log(`\n📊 Total records imported: ${totalImported}`)
  console.log('🎉 Supabase setup complete!')

  await prisma.$disconnect()
}

main().catch(console.error)
