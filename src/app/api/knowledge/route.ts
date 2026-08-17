// ═══════════════════════════════════════════════════════════════
// gBrain — Base de conocimiento (RAG-lite)
// GET    /api/knowledge?workspaceId=   — lista documentos
// POST   /api/knowledge                — crea (JSON {title,content} o archivo)
// DELETE /api/knowledge?id=            — elimina
// PATCH  /api/knowledge?id=            — activa/desactiva
// El agente consulta estos documentos antes de responder (ver prompt-composer).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { extractDocumentText } from '@/lib/ai/media-understanding'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const docs = await db.knowledgeDoc.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, sourceType: true, chars: true, isActive: true, createdAt: true },
    })
    return NextResponse.json({ success: true, docs })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const contentType = req.headers.get('content-type') || ''

    let workspaceId = ''
    let title = ''
    let content = ''
    let sourceType = 'text'

    if (contentType.includes('multipart/form-data')) {
      // Subida de archivo (PDF/Excel/CSV/TXT) → extraer texto localmente
      const form = await req.formData()
      workspaceId = String(form.get('workspaceId') || '')
      title = String(form.get('title') || '')
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
      const buf = Buffer.from(await file.arrayBuffer())
      const mime = file.type || ''
      const extracted = await extractDocumentText(buf, mime, file.name)
      if (!extracted || extracted.trim().length < 5) {
        return NextResponse.json({ error: 'No se pudo extraer texto del archivo (¿PDF escaneado o vacío?)' }, { status: 422 })
      }
      content = extracted
      title = title || file.name
      const n = file.name.toLowerCase()
      sourceType = n.endsWith('.pdf') ? 'pdf' : /\.(xlsx?|csv)$/.test(n) ? 'xlsx' : 'text'
    } else {
      const body = await req.json()
      workspaceId = body.workspaceId || ''
      title = String(body.title || '').trim()
      content = String(body.content || '').trim()
      sourceType = body.sourceType || 'faq'
    }

    await requireWorkspace(workspaceId, session.userId)
    if (!title || !content) return NextResponse.json({ error: 'Se requiere título y contenido' }, { status: 400 })

    // Límite sano por documento (evita blobs enormes en el prompt)
    content = content.slice(0, 12000)
    const doc = await db.knowledgeDoc.create({
      data: { workspaceId, title: title.slice(0, 180), sourceType, content, chars: content.length },
      select: { id: true, title: true, sourceType: true, chars: true, isActive: true, createdAt: true },
    })
    return NextResponse.json({ success: true, doc }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id') || ''
    const existing = await db.knowledgeDoc.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    await requireWorkspace(existing.workspaceId, session.userId)
    await db.knowledgeDoc.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id') || ''
    const existing = await db.knowledgeDoc.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    await requireWorkspace(existing.workspaceId, session.userId)
    const doc = await db.knowledgeDoc.update({ where: { id }, data: { isActive: !existing.isActive }, select: { id: true, isActive: true } })
    return NextResponse.json({ success: true, doc })
  } catch (error) {
    return errorResponse(error)
  }
}
