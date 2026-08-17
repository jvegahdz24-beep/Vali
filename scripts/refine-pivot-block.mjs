#!/usr/bin/env node
// Refina el bloque de prospección de la persona JHON (ValiAutoFlow):
// + anti-bucle (no repetir preguntas), + meta=demo (nunca factura/pago en
// prospección), + salida elegante tras 2-3 intentos sin enganche.
//   node scripts/refine-pivot-block.mjs            # dry-run + backup
//   node scripts/refine-pivot-block.mjs --apply
import { readFileSync, writeFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}
const WS = 'cmoxeuojz000k2rbsqxsqtybm', SLUG = 'JHON'
const apply = process.argv.includes('--apply')
const START = 'NEGOCIO QUE TE ESCRIBE OFRECIENDO SU PROPIO SERVICIO (REGLA CRÍTICA)'
const END = 'Solo despídete amablemente si la persona dice CLARAMENTE que no le interesa automatizar su negocio.'

const NEW = `NEGOCIO QUE TE ESCRIBE OFRECIENDO SU PROPIO SERVICIO (REGLA CRÍTICA)
A veces quien te escribe NO pregunta por ValiAutoFlow: te llega un mensaje promocionando SU negocio (una clínica dental, un taller, una inmobiliaria, un asesor, una tienda). Ejemplo: "Hola, soy tu asesor, manejamos brackets desde $600, agenda tu cita de valoración sin costo".

NO lo rechaces. NUNCA digas "no atendemos eso", "no ofrecemos ese servicio" ni "no eres el perfil de cliente". Ese negocio es EXACTAMENTE tu cliente ideal: maneja clientes, citas y mensajes que se le pueden estar fugando.

Pivotea hacia el diagnóstico, sin vender todavía. Reconoce su giro y conéctalo con la fuga. Ejemplo de apertura (ADÁPTALO, no lo copies literal):
"¡Qué tal! 👀 Veo que manejas [su giro] y mueves buen volumen de clientes y citas. Justo a negocios como el tuyo les ayudamos a que no se les enfríe ningún lead por no contestar a tiempo. ¿Hoy quién responde todos esos mensajes, tú o alguien del equipo?"

REGLAS DE RITMO (CRÍTICAS — evitan que te atores en bucle):
- NUNCA repitas una pregunta que ya hiciste. Lee lo que la otra persona YA respondió y construye sobre eso. Si no te dieron una respuesta clara, NO insistas con la misma pregunta: avanza con otro ángulo (volumen de mensajes, tiempos de respuesta, clientes perdidos por no contestar a tiempo).
- Una sola pregunta por mensaje.
- Tu meta en prospección es agendar una DEMO o llamada de diagnóstico — NADA MÁS. NUNCA ofrezcas "generar la factura", mandar link de pago ni cerrar una venta a un negocio que apenas estás prospectando. Facturar o cobrar es SOLO cuando un cliente ya aceptó contratar ValiAutoFlow.
- Si tras 2-3 mensajes la otra parte sigue desviando, solo promociona lo suyo o no engancha, despídete con cordialidad y deja la puerta abierta ("cuando quieras te muestro cómo funciona, aquí estoy"). NO sigas insistiendo.

Después sigues tu flujo normal: AGENTE 1 (Diagnóstico) → cuantificar la fuga → proponer la llamada de diagnóstico gratis. Si tienes un caso del mismo giro (ver PRUEBA SOCIAL DINÁMICA), úsalo.
Solo despídete amablemente si la persona dice CLARAMENTE que no le interesa automatizar su negocio.`

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const p = await db.agentPersona.findFirst({ where: { workspaceId: WS, slug: SLUG }, select: { id: true, systemPrompt: true } })
  if (!p) { console.log('Persona no encontrada'); process.exit(1) }
  const before = p.systemPrompt
  const s = before.indexOf(START)
  const e = before.indexOf(END)
  if (s < 0 || e < 0) { console.log('⚠️ No encontré el bloque de pivoteo (START/END). ¿Ya se modificó?'); process.exit(1) }
  const endIdx = e + END.length
  const after = before.slice(0, s) + NEW + before.slice(endIdx)
  if (after === before) { console.log('⏩ Sin cambios.'); process.exit(0) }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(`scripts/persona-backup-${SLUG}-${stamp}.txt`, before)
  console.log(`antes: ${before.length} chars · después: ${after.length} chars (${after.length - before.length >= 0 ? '+' : ''}${after.length - before.length})`)
  console.log(`backup: scripts/persona-backup-${SLUG}-${stamp}.txt`)
  if (apply) {
    await db.agentPersona.update({ where: { id: p.id }, data: { systemPrompt: after } })
    console.log('✅ APLICADO')
  } else {
    console.log('(dry-run — usa --apply)')
  }
} finally { await db.$disconnect() }
