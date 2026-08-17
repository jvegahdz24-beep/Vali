#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Agrega al AgentPersona JHON del workspace ValiAutoFlow la rama que
// le falta: cómo reaccionar cuando un NEGOCIO le escribe ofreciendo
// SU propio servicio (en vez de preguntar por ValiAutoFlow).
// En vez de rechazar → reconoce que es el cliente ideal y pivotea al
// funnel de diagnóstico que la persona YA tiene.
//
//   node scripts/add-inbound-offer-branch.mjs            # dry-run + backup
//   node scripts/add-inbound-offer-branch.mjs --apply    # escribe a la BD
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const WORKSPACE_ID = 'cmoxeuojz000k2rbsqxsqtybm' // ValiAutoFlow
const SLUG = 'JHON'
const apply = process.argv.includes('--apply')
const MARKER = 'NEGOCIO QUE TE ESCRIBE OFRECIENDO SU PROPIO SERVICIO'

const BLOCK = `${MARKER} (REGLA CRÍTICA)
A veces quien te escribe NO pregunta por ValiAutoFlow: te llega un mensaje promocionando SU negocio (una clínica dental, un taller, una inmobiliaria, un asesor, una tienda). Ejemplo: "Hola, soy tu asesor, manejamos brackets desde $600, agenda tu cita de valoración sin costo".

NO lo rechaces. NUNCA digas "no atendemos eso", "no ofrecemos ese servicio" ni "no eres el perfil de cliente". Ese negocio es EXACTAMENTE tu cliente ideal: maneja clientes, citas y mensajes que se le pueden estar fugando.

Pivotea de inmediato hacia el diagnóstico, sin vender todavía. Reconoce su giro y conéctalo con la fuga:
"¡Qué tal! 👀 Veo que manejas [su giro] y mueves buen volumen de clientes y citas. Justo a negocios como el tuyo les ayudamos a que no se les enfríe ningún lead por no contestar a tiempo. ¿Hoy quién responde todos esos mensajes, tú o alguien del equipo?"

Después sigues tu flujo normal: AGENTE 1 (Diagnóstico) → cuantificar la fuga → proponer la llamada de diagnóstico gratis. Si tienes un caso del mismo giro (ver PRUEBA SOCIAL DINÁMICA), úsalo.
Solo despídete amablemente si la persona dice CLARAMENTE que no le interesa automatizar su negocio.

`

const ANCHOR = 'DETECCIÓN SILENCIOSA DE ARQUETIPO'

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const p = await db.agentPersona.findFirst({
    where: { workspaceId: WORKSPACE_ID, slug: SLUG },
    select: { id: true, name: true, systemPrompt: true },
  })
  if (!p) { console.log('Persona no encontrada'); process.exit(1) }

  const before = p.systemPrompt || ''
  if (before.includes(MARKER)) {
    console.log('⏩ El bloque ya existe en la persona — nada que hacer.')
    process.exit(0)
  }

  let after
  const idx = before.indexOf(ANCHOR)
  if (idx >= 0) {
    after = before.slice(0, idx) + BLOCK + before.slice(idx)
    console.log(`Insertado ANTES de "${ANCHOR}".`)
  } else {
    // Fallback: antes de INSTRUCCIÓN FINAL, o al final
    const fb = before.indexOf('INSTRUCCIÓN FINAL')
    if (fb >= 0) { after = before.slice(0, fb) + BLOCK + before.slice(fb); console.log('Insertado antes de "INSTRUCCIÓN FINAL".') }
    else { after = before.trimEnd() + '\n\n' + BLOCK; console.log('Anexado al final.') }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `scripts/persona-backup-${SLUG}-${stamp}.txt`
  writeFileSync(backupPath, before)

  console.log(`\nPersona ${SLUG} @ ValiAutoFlow (id=${p.id})`)
  console.log(`  antes:  ${before.length} chars`)
  console.log(`  después:${after.length} chars  (+${after.length - before.length})`)
  console.log(`  backup: ${backupPath}`)
  console.log(`\n----- BLOQUE QUE SE AGREGA -----\n${BLOCK}--------------------------------`)

  if (apply) {
    await db.agentPersona.update({ where: { id: p.id }, data: { systemPrompt: after } })
    console.log('\n✅ APLICADO a la BD. (El caché de personalidad expira en ~5 min, o reinicia PM2 para efecto inmediato.)')
  } else {
    console.log('\n(dry-run — vuelve a correr con --apply para escribir)')
  }
} catch (e) {
  console.log('ERR', e.message)
} finally {
  await db.$disconnect()
}
