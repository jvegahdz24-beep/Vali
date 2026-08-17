// GET  /api/marketing/music?workspaceId= — lista de pistas (biblioteca + subidas)
// POST /api/marketing/music — sube una pista (multipart: file). RBAC crm.write.

import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { listMusic } from '@/lib/marketing/music'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    await requireWorkspace(req.nextUrl.searchParams.get('workspaceId') || '', session.userId)
    return Response.json({ tracks: await listMusic() })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const form = await req.formData()
    const workspaceId = String(form.get('workspaceId') || '')
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const file = form.get('file') as File | null
    if (!file) throw new ApiError(400, 'Falta el archivo')
    if (!/\.(mp3|m4a|aac|wav)$/i.test(file.name)) throw new ApiError(400, 'Formato no soportado (usa mp3/m4a/aac/wav)')
    if (file.size > 15 * 1024 * 1024) throw new ApiError(400, 'La pista supera 15 MB')
    const dir = path.join(process.cwd(), 'public', 'marketing', 'music')
    await mkdir(dir, { recursive: true })
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    await writeFile(path.join(dir, safe), Buffer.from(await file.arrayBuffer()))
    return Response.json({ success: true, file: safe, tracks: await listMusic() })
  } catch (error) { return errorResponse(error) }
}
