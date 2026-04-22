// @ts-nocheck
// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SQLite → Supabase Data Migration Script
// Reads ALL data via Prisma (SQLite), inserts ALL into Supabase
// Handles FK order (parent tables first), batches of 100
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ffxppvsdunvsmotxkdiy.supabase.co'
const SUPABASE_KEY = 'sb_publishable__2rI8TlQnRen_d4HXqQZMA_jEp1mCP2'
const BATCH_SIZE = 100

const prisma = new PrismaClient()
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Helpers ───────────────────────────────────────────────────
function dateToISO(d: Date | undefined | null): string | null {
  if (!d) return null
  return new Date(d).toISOString()
}

function toPlain(obj: any): any {
  // Convert Prisma Date objects to ISO strings recursively
  const plain: any = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val instanceof Date) {
      plain[key] = val.toISOString()
    } else if (ArrayBuffer.isView(val) || Buffer.isBuffer(val)) {
      plain[key] = val.toString('base64')
    } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
      plain[key] = val // nested objects / arrays kept as-is
    } else {
      plain[key] = val
    }
  }
  return plain
}

interface MigrationResult {
  table: string
  total: number
  inserted: number
  errors: string[]
  errorCount: number
}

async function migrateTable<T extends { id: string }>(
  tableName: string,
  records: T[],
  transform: (rec: T) => any = (r) => toPlain(r),
): Promise<MigrationResult> {
  const result: MigrationResult = {
    table: tableName,
    total: records.length,
    inserted: 0,
    errors: [],
    errorCount: 0,
  }

  if (records.length === 0) {
    console.log(`  ✓ ${tableName}: 0 records (skipped)`)
    return result
  }

  // Process in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const rows = batch.map(transform)

    const { data, error } = await supabase
      .from(tableName)
      .insert(rows)

    if (error) {
      // Try one-by-one to isolate failures
      for (const row of rows) {
        const { error: singleError } = await supabase
          .from(tableName)
          .insert(row)
        if (singleError) {
          result.errorCount++
          const msg = `  ✗ ${tableName}[${row.id}]: ${singleError.message}`
          result.errors.push(msg)
          console.error(msg)
        } else {
          result.inserted++
        }
      }
    } else {
      result.inserted += batch.length
    }
  }

  const status = result.errorCount === 0 ? '✓' : '⚠'
  console.log(
    `  ${status} ${tableName}: ${result.inserted}/${result.total} migrated` +
    (result.errorCount > 0 ? ` (${result.errorCount} errors)` : '')
  )

  return result
}

// ── Main Migration ────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  ValiAutoFlow: SQLite → Supabase Migration')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Supabase: ${SUPABASE_URL}`)
  console.log(`  Batch size: ${BATCH_SIZE}`)
  console.log('')

  // Verify Supabase connection
  try {
    const { error } = await supabase.from('User').select('id').limit(1)
    if (error && error.code === '42P01') {
      console.error('❌ ERROR: Tables do not exist in Supabase yet.')
      console.error('   Please run migration.sql in the Supabase SQL Editor first.')
      console.error(`   Details: ${error.message}`)
      process.exit(1)
    }
    if (error) {
      console.error(`⚠ Warning: Supabase connection test: ${error.message}`)
    } else {
      console.log('✓ Supabase connection OK')
    }
  } catch (err: any) {
    console.error(`❌ Cannot connect to Supabase: ${err.message}`)
    process.exit(1)
  }

  const startTime = Date.now()
  const allResults: MigrationResult[] = []

  // ─────────────────────────────────────────────────────────────
  // 1. User
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 1. User ──')
  const users = await prisma.user.findMany()
  allResults.push(await migrateTable('User', users))

  // ─────────────────────────────────────────────────────────────
  // 2. VerificationToken
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 2. VerificationToken ──')
  const verificationTokens = await prisma.verificationToken.findMany()
  allResults.push(await migrateTable('VerificationToken', verificationTokens, (r) => toPlain(r)))

  // ─────────────────────────────────────────────────────────────
  // 3. Workspace (depends on User)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 3. Workspace ──')
  const workspaces = await prisma.workspace.findMany()
  allResults.push(await migrateTable('Workspace', workspaces))

  // ─────────────────────────────────────────────────────────────
  // 4. WorkspaceMember (depends on User, Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 4. WorkspaceMember ──')
  const workspaceMembers = await prisma.workspaceMember.findMany()
  allResults.push(await migrateTable('WorkspaceMember', workspaceMembers))

  // ─────────────────────────────────────────────────────────────
  // 5. Account, Session (depend on User)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5a. Account ──')
  const accounts = await prisma.account.findMany()
  allResults.push(await migrateTable('Account', accounts))

  console.log('\n── 5b. Session ──')
  const sessions = await prisma.session.findMany()
  allResults.push(await migrateTable('Session', sessions))

  // ─────────────────────────────────────────────────────────────
  // 6. Contact (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 6. Contact ──')
  const contacts = await prisma.contact.findMany()
  allResults.push(await migrateTable('Contact', contacts))

  // ─────────────────────────────────────────────────────────────
  // 7. Conversation (depends on Workspace, Contact)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 7. Conversation ──')
  const conversations = await prisma.conversation.findMany()
  allResults.push(await migrateTable('Conversation', conversations))

  // ─────────────────────────────────────────────────────────────
  // 8. Message (depends on Conversation)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 8. Message ──')
  const messages = await prisma.message.findMany()
  allResults.push(await migrateTable('Message', messages))

  // ─────────────────────────────────────────────────────────────
  // 9. Agent (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 9. Agent ──')
  const agents = await prisma.agent.findMany()
  allResults.push(await migrateTable('Agent', agents))

  // ─────────────────────────────────────────────────────────────
  // 10. AgentPersona (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 10. AgentPersona ──')
  const agentPersonas = await prisma.agentPersona.findMany()
  allResults.push(await migrateTable('AgentPersona', agentPersonas))

  // ─────────────────────────────────────────────────────────────
  // 11. AgentLog (depends on Agent, Conversation)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 11. AgentLog ──')
  const agentLogs = await prisma.agentLog.findMany()
  allResults.push(await migrateTable('AgentLog', agentLogs))

  // ─────────────────────────────────────────────────────────────
  // 12. AgentMemory (depends on Agent, Contact)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 12. AgentMemory ──')
  const agentMemories = await prisma.agentMemory.findMany()
  allResults.push(await migrateTable('AgentMemory', agentMemories))

  // ─────────────────────────────────────────────────────────────
  // 13. Pipeline (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 13. Pipeline ──')
  const pipelines = await prisma.pipeline.findMany()
  allResults.push(await migrateTable('Pipeline', pipelines))

  // ─────────────────────────────────────────────────────────────
  // 14. PipelineStage (depends on Pipeline)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 14. PipelineStage ──')
  const pipelineStages = await prisma.pipelineStage.findMany()
  allResults.push(await migrateTable('PipelineStage', pipelineStages))

  // ─────────────────────────────────────────────────────────────
  // 15. Deal (depends on Workspace, Pipeline, PipelineStage, Contact)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 15. Deal ──')
  const deals = await prisma.deal.findMany()
  allResults.push(await migrateTable('Deal', deals))

  // ─────────────────────────────────────────────────────────────
  // 16. FollowUpRule (depends on Workspace, Agent)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 16. FollowUpRule ──')
  const followUpRules = await prisma.followUpRule.findMany()
  allResults.push(await migrateTable('FollowUpRule', followUpRules))

  // ─────────────────────────────────────────────────────────────
  // 17. FollowUpTask
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 17. FollowUpTask ──')
  const followUpTasks = await prisma.followUpTask.findMany()
  allResults.push(await migrateTable('FollowUpTask', followUpTasks))

  // ─────────────────────────────────────────────────────────────
  // 18. Automation (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 18. Automation ──')
  const automations = await prisma.automation.findMany()
  allResults.push(await migrateTable('Automation', automations))

  // ─────────────────────────────────────────────────────────────
  // 19. Subscription (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 19. Subscription ──')
  const subscriptions = await prisma.subscription.findMany()
  allResults.push(await migrateTable('Subscription', subscriptions))

  // ─────────────────────────────────────────────────────────────
  // 20. AnalyticsEvent (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 20. AnalyticsEvent ──')
  const analyticsEvents = await prisma.analyticsEvent.findMany()
  allResults.push(await migrateTable('AnalyticsEvent', analyticsEvents))

  // ─────────────────────────────────────────────────────────────
  // 21. WebhookConfig (depends on Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 21. WebhookConfig ──')
  const webhookConfigs = await prisma.webhookConfig.findMany()
  allResults.push(await migrateTable('WebhookConfig', webhookConfigs))

  // ─────────────────────────────────────────────────────────────
  // 22. MediaFile (depends on Message, Conversation)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 22. MediaFile ──')
  const mediaFiles = await prisma.mediaFile.findMany()
  allResults.push(await migrateTable('MediaFile', mediaFiles))

  // ─────────────────────────────────────────────────────────────
  // 23. LeadProfile (depends on Contact, Workspace)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 23. LeadProfile ──')
  const leadProfiles = await prisma.leadProfile.findMany()
  allResults.push(await migrateTable('LeadProfile', leadProfiles))

  // ─────────────────────────────────────────────────────────────
  // 24. WhatsAppAuth
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 24. WhatsAppAuth ──')
  const whatsAppAuths = await prisma.whatsAppAuth.findMany()
  allResults.push(await migrateTable('WhatsAppAuth', whatsAppAuths))

  // ── Summary ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  MIGRATION SUMMARY')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Time: ${elapsed}s`)
  console.log('')

  let totalRecords = 0
  let totalInserted = 0
  let totalErrors = 0

  for (const r of allResults) {
    const status = r.errorCount === 0 ? '✓' : '⚠'
    console.log(
      `  ${status} ${r.table.padEnd(22)} ${String(r.inserted).padStart(5)}/${String(r.total).padStart(5)}` +
      (r.errorCount > 0 ? `  (${r.errorCount} errors)` : '')
    )
    totalRecords += r.total
    totalInserted += r.inserted
    totalErrors += r.errorCount
  }

  console.log('')
  console.log(`  TOTAL: ${totalInserted}/${totalRecords} records migrated`)
  if (totalErrors > 0) {
    console.log(`  ERRORS: ${totalErrors}`)
  }
  console.log('═══════════════════════════════════════════════════')

  // Print first 10 error details
  if (totalErrors > 0) {
    console.log('\n  First error details:')
    let count = 0
    for (const r of allResults) {
      for (const err of r.errors) {
        if (count >= 10) break
        console.log(err)
        count++
      }
      if (count >= 10) break
    }
    if (totalErrors > 10) {
      console.log(`  ... and ${totalErrors - 10} more errors`)
    }
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
