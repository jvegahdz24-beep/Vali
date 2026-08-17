// ═══════════════════════════════════════════════════════════════
// WIDGET WEBCHAT EMBEBIBLE — canal público de chat para sitios web
// de los clientes. POST /api/widget/chat { ws, sid, message, name? }
// El visitante se registra como contacto webchat (phone = web:<sid>)
// y lo atiende el MISMO asesor IA del pipeline real → lead directo al CRM.
// Seguridad: rate-limit propio por sesión e IP, tamaño acotado, sin auth
// (es público a propósito — igual que el chat de cualquier SaaS).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processMessageCore } from '@/lib/ai/message-processor'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Rate limit en memoria: por sesión (8/min) y por IP (30/min)
const hits = new Map<string, number[]>()
function limited(key: string, max: number): boolean {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter((t) => now - t < 60000)
  if (arr.length >= max) { hits.set(key, arr); return true }
  arr.push(now); hits.set(key, arr)
  if (hits.size > 5000) { // poda simple
    for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k)
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { ws?: string; sid?: string; message?: string; name?: string } | null
    const ws = String(body?.ws || '')
    const sid = String(body?.sid || '')
    const message = String(body?.message || '').trim().slice(0, 1000)
    const name = String(body?.name || '').trim().slice(0, 60)
    if (!ws || !message || !/^[a-zA-Z0-9_-]{8,64}$/.test(sid)) {
      return NextResponse.json({ error: 'parámetros inválidos' }, { status: 400, headers: CORS })
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    if (limited(`sid:${sid}`, 8) || limited(`ip:${ip}`, 30)) {
      return NextResponse.json({ error: 'Demasiados mensajes, espera un momento.' }, { status: 429, headers: CORS })
    }
    const workspace = await db.workspace.findUnique({ where: { id: ws }, select: { id: true, isActive: true, settings: true } })
    if (!workspace || !workspace.isActive) return NextResponse.json({ error: 'no disponible' }, { status: 404, headers: CORS })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(workspace.settings || '{}') } catch { /* */ }
    if (s.webWidget === false) return NextResponse.json({ error: 'widget desactivado' }, { status: 404, headers: CORS })

    const result = await processMessageCore({
      text: message,
      phone: `web:${sid}`,
      pushName: name || 'Visitante Web',
      channel: 'webchat',
      workspaceId: ws,
    })
    return NextResponse.json({
      reply: result.aiReplyText || null,
      // sin respuesta = IA pausada o silencio intencional: el widget muestra un aviso amable
      note: result.aiReplyText ? undefined : 'Un asesor te responderá en breve.',
    }, { headers: CORS })
  } catch (err) {
    console.error('[Widget Chat]', err)
    return NextResponse.json({ error: 'error interno' }, { status: 500, headers: CORS })
  }
}
