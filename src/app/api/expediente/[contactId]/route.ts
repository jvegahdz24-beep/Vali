// ═══════════════════════════════════════════════════════════════
// Expediente Digital — por contacto
// GET    /api/expediente/[contactId]?workspaceId=...  → archivos + resumen
// POST   /api/expediente/[contactId]                  → registrar documento
// DELETE /api/expediente/[contactId]?fileId=...        → eliminar documento
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  linkToExpediente,
  getExpediente,
  getExpedienteSummary,
  EXPEDIENTE_CATEGORIES,
} from '@/lib/erp/expediente'

const addSchema = z.object({
  workspaceId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1),
  mimeType: z.string().max(150).optional(),
  fileSize: z.number().int().min(0).optional(),
  category: z.enum(EXPEDIENTE_CATEGORIES).optional(),
  source: z.enum(['upload', 'whatsapp', 'system']).optional(),
  mediaFileId: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireAuth(request)
    const { contactId } = await params
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') ?? ''
    await requireWorkspace(workspaceId, session.userId)

    const [files, summary] = await Promise.all([
      getExpediente(workspaceId, contactId),
      getExpedienteSummary(workspaceId, contactId),
    ])

    return NextResponse.json({ success: true, files, summary })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireAuth(request)
    const { contactId } = await params
    const body = addSchema.parse(await request.json())
    await requireWorkspace(body.workspaceId, session.userId)

    // Ensure the contact belongs to this workspace.
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId: body.workspaceId },
      select: { id: true },
    })
    if (!contact) throw new ApiError(404, 'Contacto no encontrado en este workspace')

    const result = await linkToExpediente(body.workspaceId, contactId, [
      {
        fileName: body.fileName,
        filePath: body.filePath,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
        category: body.category,
        source: body.source ?? 'upload',
        mediaFileId: body.mediaFileId,
        notes: body.notes,
        uploadedBy: session.userId,
      },
    ])

    const summary = await getExpedienteSummary(body.workspaceId, contactId)
    return NextResponse.json({ success: true, ...result, summary })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireAuth(request)
    const { contactId } = await params
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') ?? ''
    const fileId = searchParams.get('fileId') ?? ''
    await requireWorkspace(workspaceId, session.userId)
    if (!fileId) throw new ApiError(400, 'fileId es requerido')

    const file = await db.expedienteFile.findFirst({
      where: { id: fileId, contactId, workspaceId },
      select: { id: true },
    })
    if (!file) throw new ApiError(404, 'Documento no encontrado')

    await db.expedienteFile.delete({ where: { id: fileId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
