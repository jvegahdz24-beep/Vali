#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Lossless persona compressor.
// Removes decorative separator lines (---- / ==== / ____) and
// collapses excess blank lines from an AgentPersona.systemPrompt.
// Keeps ALL selling content and section headings intact.
//
// Usage:
//   node scripts/optimize-persona.mjs <workspaceName> <slug>            # dry-run + backup
//   node scripts/optimize-persona.mjs <workspaceName> <slug> --apply    # write to DB
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const wsName = process.argv[2] || 'ValiAutoFlow'
const slug = process.argv[3] || 'JHON'
const apply = process.argv.includes('--apply')
const tok = n => Math.round(n / 4)

/** Remove decorative separators and collapse blank lines. Lossless for meaning. */
function compress(text) {
  const lines = text.split('\n')
  const kept = lines.filter(l => {
    const s = l.trim()
    // drop lines made only of separator characters (dashes, equals, underscores, dots)
    if (s.length >= 3 && /^[-=_·.*~]+$/.test(s)) return false
    return true
  }).map(l => l.replace(/[ \t]+$/g, '')) // trim trailing whitespace
  // collapse 3+ consecutive blank lines into 1 blank line
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const ws = await db.workspace.findFirst({ where: { name: wsName }, select: { id: true } })
  if (!ws) { console.log(`Workspace "${wsName}" not found`); process.exit(1) }
  const persona = await db.agentPersona.findFirst({
    where: { workspaceId: ws.id, slug },
    select: { id: true, systemPrompt: true },
  })
  if (!persona) { console.log(`Persona slug=${slug} not found for ${wsName}`); process.exit(1) }

  const before = persona.systemPrompt || ''
  const after = compress(before)
  const stamp = process.env.STAMP || 'manual'
  const backupPath = `scripts/persona-backup-${slug}-${stamp}.txt`
  writeFileSync(backupPath, before)

  console.log(`Persona ${slug} @ ${wsName}`)
  console.log(`  before: ${before.length} chars ~${tok(before.length)} tok`)
  console.log(`  after:  ${after.length} chars ~${tok(after.length)} tok`)
  console.log(`  saved:  ${before.length - after.length} chars ~${tok(before.length - after.length)} tok/msg (${Math.round((1 - after.length / before.length) * 100)}%)`)
  console.log(`  backup written: ${backupPath}`)

  if (apply) {
    await db.agentPersona.update({ where: { id: persona.id }, data: { systemPrompt: after } })
    console.log('  ✅ APPLIED to DB')
  } else {
    console.log('  (dry-run — re-run with --apply to write)')
  }
} catch (e) {
  console.log('ERR', e.message)
} finally {
  await db.$disconnect()
}
