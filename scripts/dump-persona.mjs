#!/usr/bin/env node
// READ-ONLY: vuelca el systemPrompt de una persona a stdout + archivo.
// Usage: node scripts/dump-persona.mjs <workspaceId> <slug>
import { readFileSync, writeFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}
const wsId = process.argv[2]
const slug = process.argv[3] || 'JHON'
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const p = await db.agentPersona.findFirst({
    where: { workspaceId: wsId, slug },
    select: { id: true, name: true, systemPrompt: true },
  })
  if (!p) { console.log('NOT FOUND'); process.exit(1) }
  const out = `scripts/_persona-${slug}-current.txt`
  writeFileSync(out, p.systemPrompt)
  console.log(`personaId=${p.id} name=${p.name} len=${p.systemPrompt.length}`)
  console.log(`written → ${out}`)
} finally { await db.$disconnect() }
