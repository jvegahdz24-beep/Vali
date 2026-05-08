import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/whatsapp/logs — Get WhatsApp summary logs
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const logs = await db.nexusWhatsAppLog.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
      select: {
        whatsappPhone: true,
        summaryEnabled: true,
        summaryInterval: true,
        lastSummarySent: true,
      },
    })

    const connected = !!profile?.whatsappPhone

    return Response.json({
      logs: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        phone: log.phone,
        message: log.message,
        type: log.type,
        status: log.status,
        sentAt: log.sentAt?.toISOString(),
        error: log.error,
        createdAt: log.createdAt.toISOString(),
      })),
      connected,
      settings: profile,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
