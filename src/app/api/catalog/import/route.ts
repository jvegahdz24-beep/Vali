// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Importación masiva de inventario con IA.
// POST /api/catalog/import
//   mode 'preview':
//     { kind:'rows', headers, rows } | { kind:'text', text } | { source:'url', url }
//     → la IA mapea/extrae y devuelve registros normalizados con alertas (issues).
//   mode 'commit':
//     { records: NormalizedVehicle[] } → crea los CatalogItem en lote.
// RBAC: requiere crm.write (Lector no puede importar).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import {
  processInventoryImport, parseCsv, resolveGoogleUrl, type AiOpts, type NormalizedVehicle,
} from '@/lib/erp/inventory-import'

function resolveAi(settings: string | null): AiOpts {
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(settings || '{}') } catch { /* ignore */ }
  const provider = (s.apiProvider as string) || 'glm'
  const keys = (s.apiKeys as Record<string, string>) || {}
  const apiKey = keys[provider] || keys.glm || keys.zai || Object.values(keys).find((k) => k && k.length > 10) || undefined
  return { provider, apiKey }
}

/** Convierte texto descargado (CSV/JSON/SQL/TXT) en un payload para el procesador. */
function textToPayload(text: string, forceCsv = false):
  | { kind: 'rows'; headers: string[]; rows: Record<string, unknown>[] }
  | { kind: 'text'; text: string } {
  const trimmed = text.trim()
  if (!forceCsv && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    try {
      const parsed = JSON.parse(trimmed)
      const arr = Array.isArray(parsed) ? parsed
        : Array.isArray((parsed as Record<string, unknown>).items) ? (parsed as Record<string, unknown[]>).items
        : Array.isArray((parsed as Record<string, unknown>).vehicles) ? (parsed as Record<string, unknown[]>).vehicles
        : Array.isArray((parsed as Record<string, unknown>).data) ? (parsed as Record<string, unknown[]>).data
        : null
      if (arr && arr.length && typeof arr[0] === 'object') {
        return { kind: 'rows', headers: Object.keys(arr[0] as object), rows: arr as Record<string, unknown>[] }
      }
      return { kind: 'text', text: trimmed }
    } catch { /* fall through */ }
  }
  // CSV heuristic: header line with commas
  const firstLine = trimmed.split(/\r?\n/)[0] || ''
  if (forceCsv || (firstLine.includes(',') && trimmed.split(/\r?\n/).length > 1)) {
    const { headers, rows } = parseCsv(trimmed)
    if (headers.length && rows.length) return { kind: 'rows', headers, rows }
  }
  return { kind: 'text', text: trimmed }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, mode } = body as { workspaceId: string; mode: 'preview' | 'commit' }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    // ── COMMIT: crea los CatalogItem en lote ──
    if (mode === 'commit') {
      const records = (body.records || []) as NormalizedVehicle[]
      const valid = records.filter((r) => r && r.name && String(r.name).trim())
      if (!valid.length) throw new ApiError(400, 'No hay vehículos válidos para importar')
      await db.catalogItem.createMany({
        data: valid.map((r) => ({
          workspaceId,
          name: String(r.name).trim().slice(0, 255),
          description: r.description ? String(r.description).slice(0, 5000) : null,
          price: typeof r.price === 'number' ? r.price : null,
          currency: r.currency || 'MXN',
          category: r.category || null,
          stock: typeof r.stock === 'number' ? r.stock : null,
          isActive: r.isActive !== false,
          imageUrl: r.imageUrl || null,
          metadata: JSON.stringify({
            ...(r.metadata || {}),
            status: r.status || 'disponible',
            ...(r.extra && r.extra.length ? { extra: r.extra } : {}),
          }),
        })),
      })
      return NextResponse.json({ success: true, created: valid.length })
    }

    // ── PREVIEW: la IA mapea/extrae ──
    const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const ai = resolveAi(workspace?.settings ?? null)

    let payload: { kind: 'rows'; headers: string[]; rows: Record<string, unknown>[] } | { kind: 'text'; text: string }
    let sourceNote: string | undefined

    if (body.source === 'url') {
      const url = String(body.url || '').trim()
      if (!/^https?:\/\//i.test(url)) throw new ApiError(400, 'Pega un enlace válido (http/https)')
      const { downloadUrl, kind } = resolveGoogleUrl(url)
      const res = await fetch(downloadUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 ValiAutoFlow' } }).catch(() => null)
      if (!res || !res.ok) throw new ApiError(400, `No se pudo descargar el archivo del enlace (${res?.status ?? 'sin respuesta'}). Verifica que esté compartido como "cualquiera con el enlace".`)
      const text = await res.text()
      if (/<!DOCTYPE html|<html/i.test(text.slice(0, 200)) && kind !== 'raw') {
        throw new ApiError(400, 'El enlace no es público o requiere permisos. Compártelo como "cualquiera con el enlace" e intenta de nuevo.')
      }
      payload = textToPayload(text, kind === 'sheet')
      sourceNote = kind === 'sheet' ? 'Google Sheets' : kind === 'drive' ? 'Google Drive' : 'URL'
    } else if (body.kind === 'rows') {
      payload = { kind: 'rows', headers: body.headers || [], rows: body.rows || [] }
    } else if (body.kind === 'text') {
      payload = { kind: 'text', text: String(body.text || '') }
    } else {
      throw new ApiError(400, 'Falta el origen de datos (archivo, texto o enlace)')
    }

    let result
    try {
      result = await processInventoryImport(payload, ai)
    } catch (e) {
      // Mensaje claro al usuario (si no, errorResponse lo oculta como 500 genérico).
      throw new ApiError(400, e instanceof Error ? e.message : 'No se pudo procesar el archivo')
    }
    if (sourceNote) result.warnings.unshift(`Origen: ${sourceNote}.`)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return errorResponse(error)
  }
}
