#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// READ-ONLY. Lista cada workspace y dónde vive su system prompt:
//   1) settings.customSystemPrompt   (JSON en Workspace.settings)
//   2) AgentPersona.systemPrompt      (fallback por slug)
// Marca cuáles contienen lenguaje de RECHAZO ("no atendemos",
// "perfil de cliente", etc.) para localizar el origen del problema.
//
// Usage: node scripts/inspect-prompts.mjs
// ═══════════════════════════════════════════════════════════════
import { readFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const REJECT = /no atendemos|no ofrecemos|no eres el perfil|perfil de cliente|no es mi área|fuera de (mi )?alcance|automatizaci[oó]n de ventas|plataforma para/i

function hits(text) {
  if (!text) return null
  const m = text.match(REJECT)
  return m ? m[0] : null
}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const workspaces = await db.workspace.findMany({
    select: { id: true, name: true, slug: true, industry: true, settings: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\n===== ${workspaces.length} workspace(s) =====\n`)

  for (const ws of workspaces) {
    let settings = {}
    try { settings = typeof ws.settings === 'string' ? JSON.parse(ws.settings || '{}') : (ws.settings || {}) } catch {}
    const csp = settings.customSystemPrompt || ''
    const persona = settings.defaultPersonality || '(default JHON)'

    console.log(`■ ${ws.name}  [slug=${ws.slug}, industry=${ws.industry}]`)
    console.log(`  id: ${ws.id}`)
    console.log(`  settings.defaultPersonality: ${persona}`)
    if (csp) {
      const rej = hits(csp)
      console.log(`  settings.customSystemPrompt: ${csp.length} chars${rej ? `  ⚠️ RECHAZO → "${rej}"` : ''}`)
      console.log(`     primeras 280 chars: ${JSON.stringify(csp.slice(0, 280))}`)
    } else {
      console.log(`  settings.customSystemPrompt: (vacío → usa AgentPersona o JHON de código)`)
    }

    // AgentPersona records for this workspace
    const personas = await db.agentPersona.findMany({
      where: { workspaceId: ws.id },
      select: { slug: true, name: true, isActive: true, isDefault: true, systemPrompt: true },
    })
    if (personas.length) {
      for (const p of personas) {
        const rej = hits(p.systemPrompt)
        console.log(`  · AgentPersona slug=${p.slug} (${p.name}) active=${p.isActive} default=${p.isDefault} → ${p.systemPrompt?.length || 0} chars${rej ? `  ⚠️ RECHAZO → "${rej}"` : ''}`)
      }
    } else {
      console.log(`  · AgentPersona: ninguna`)
    }
    console.log('')
  }
} catch (e) {
  console.log('ERR', e.message)
} finally {
  await db.$disconnect()
}
