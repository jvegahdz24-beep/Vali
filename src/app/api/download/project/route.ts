import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // Only superadmins can download the project source
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const filePath = path.join(process.cwd(), 'download', 'ValiAutoFlow.zip')
    const fileBuffer = await fs.readFile(filePath)
    const fileName = 'ValiAutoFlow.zip'

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Archivo no encontrado', code: 'FILE_NOT_FOUND' },
      { status: 404 }
    )
  }
}
