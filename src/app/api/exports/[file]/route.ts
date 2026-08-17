// GET /api/exports/<file>.xlsx — descarga un export generado por el copiloto.
// Servido por ruta dinámica (Next no sirve archivos creados en /public tras
// el arranque). Auth requerida (el usuario lo abre logueado).

import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  try {
    await requireAuth(req)
    const { file } = await params
    const safe = path.basename(file)
    if (!/\.(xlsx|xls|csv)$/i.test(safe)) return new Response('No encontrado', { status: 404 })
    const buf = await readFile(path.join(process.cwd(), 'public', 'exports', safe)).catch(() => null)
    if (!buf) return new Response('No encontrado', { status: 404 })
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safe}"`,
      },
    })
  } catch (error) { return errorResponse(error) }
}
