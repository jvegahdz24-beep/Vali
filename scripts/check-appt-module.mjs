#!/usr/bin/env node
// READ-ONLY: módulo appointments + citas recientes del workspace ValiAutoFlow
import { readFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}
const WS = 'cmoxeuojz000k2rbsqxsqtybm'
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const mods = await db.workspaceModule.findMany({ where: { workspaceId: WS }, select: { moduleType: true, enabled: true, config: true } })
  console.log('MÓDULOS:')
  for (const m of mods) console.log(`  ${m.moduleType}: enabled=${m.enabled}` + (m.moduleType === 'appointments' ? `  config=${m.config}` : ''))
  const appts = await db.appointment.findMany({ where: { workspaceId: WS }, orderBy: { createdAt: 'desc' }, take: 8, select: { title: true, date: true, status: true, type: true, createdAt: true, contact: { select: { firstName: true, phone: true } } } })
  console.log(`\nÚLTIMAS ${appts.length} CITAS:`)
  for (const a of appts) console.log(`  ${a.date?.toISOString()} [${a.status}/${a.type}] ${a.title} — ${a.contact?.firstName ?? '?'} ${a.contact?.phone ?? ''}`)
} finally { await db.$disconnect() }
