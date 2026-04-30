import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/api-auth'

// FIX C7: Added requireAuth — project download no longer public
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
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
