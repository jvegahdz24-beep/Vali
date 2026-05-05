// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Seed Entry Point
// Run: npx prisma db seed  (or: npx tsx prisma/seed.ts)
// Idempotent: safe to run multiple times
// ═══════════════════════════════════════════════════════════════

import { seedCore } from './seeds/core'

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  ValiAutoFlow CRM — Database Seeding        ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log()

  const startTime = Date.now()

  try {
    // Run core seed (demo user, workspace, pipeline)
    await seedCore()

    const elapsed = Date.now() - startTime
    console.log()
    console.log(`✅ Seed completed successfully in ${elapsed}ms`)
  } catch (error) {
    console.error()
    console.error('❌ Seed failed with error:')
    console.error(error)
    process.exit(1)
  }
}

main()
