// @ts-nocheck
// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Data Migration Script
// Exports all data from SQLite to a JSON file for migration
// ═══════════════════════════════════════════════════════════════
//
// USAGE: npx tsx scripts/export-sqlite-data.ts
//
// This script reads ALL data from the existing SQLite database
// and exports it as a JSON file that can be imported into Supabase.
// ═══════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client')

const OLD_DB_URL = 'file:/home/z/my-project/db/custom.db'

async function main() {
  // Connect to SQLite using the old database URL
  const oldPrisma = new PrismaClient({
    datasources: {
      db: { url: OLD_DB_URL },
    },
    log: [],
  })

  console.log('📦 Exporting data from SQLite...')

  const data: Record<string, any[]> = {}

  const tables = [
    'User', 'Account', 'Session', 'VerificationToken',
    'Workspace', 'WorkspaceMember',
    'Contact',
    'Conversation', 'Message',
    'Agent', 'AgentPersona', 'AgentLog', 'AgentMemory',
    'Pipeline', 'PipelineStage', 'Deal',
    'FollowUpRule', 'FollowUpTask',
    'Automation',
    'Subscription',
    'AnalyticsEvent',
    'WebhookConfig',
    'MediaFile',
    'LeadProfile',
    'WhatsAppAuth',
  ]

  for (const table of tables) {
    try {
      const model = table.charAt(0).toLowerCase() + table.slice(1)
      // @ts-ignore
      const records = await oldPrisma[model].findMany()
      if (records.length > 0) {
        data[table] = records
        console.log(`  ✅ ${table}: ${records.length} rows`)
      }
    } catch (e: any) {
      console.log(`  ⚠️  ${table}: ${e.message?.substring(0, 60)}`)
    }
  }

  // Write to file
  const fs = require('fs')
  const path = require('path')
  const outputPath = path.join(__dirname, '..', 'download', 'sqlite-data-export.json')
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
  console.log(`\n📁 Exported to: ${outputPath}`)
  console.log(`📊 Total tables with data: ${Object.keys(data).length}`)
  console.log(`📊 Total rows: ${Object.values(data).reduce((s: number, r: any) => s + r.length, 0)}`)

  await oldPrisma.$disconnect()
}

main().catch(console.error)
