import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

// In-memory log store for developer panel
interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

const logs: LogEntry[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    level: 'info',
    source: 'whatsapp',
    message: 'Conexión establecida - WhatsApp Business API',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 240000).toISOString(),
    level: 'info',
    source: 'ai-engine',
    message: 'Revenue Engine procesó mensaje - Conversación activa',
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 180000).toISOString(),
    level: 'warn',
    source: 'rate-limit',
    message: 'Rate limit alcanzado para API de IA - 429 Too Many Requests',
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    level: 'info',
    source: 'crm',
    message: 'Lead calificado: Jonathan Vega - Score: 95 - Etapa: Cierre',
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    level: 'error',
    source: 'ai-engine',
    message: 'Timeout al conectar con API de IA - 30000ms excedido',
  },
  {
    id: '6',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    level: 'info',
    source: 'automation',
    message: 'Seguimiento automático - Reactivación para Sonia Rendón',
  },
  {
    id: '7',
    timestamp: new Date(Date.now() - 15000).toISOString(),
    level: 'info',
    source: 'webhook',
    message: 'Webhook delivery successful - POST https://hooks.example.com/valiflow - 200 OK',
  },
  {
    id: '8',
    timestamp: new Date(Date.now() - 5000).toISOString(),
    level: 'info',
    source: 'conv-state',
    message: 'Estado de conversación restaurado desde BD (L2 cache hit)',
  },
]

// Add a log entry (can be called from other routes)
export function addDeveloperLog(level: 'info' | 'warn' | 'error', source: string, message: string) {
  const entry: LogEntry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  }
  logs.unshift(entry)
  // Keep max 200 entries
  if (logs.length > 200) logs.length = 200
  return entry
}

// Expose logs for the test-ai route
export function getDeveloperLogs(): LogEntry[] {
  return logs
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level') as 'info' | 'warn' | 'error' | null
    const limit = parseInt(searchParams.get('limit') || '50')

    let filtered = [...logs]
    if (level && ['info', 'warn', 'error'].includes(level)) {
      filtered = filtered.filter(l => l.level === level)
    }

    return Response.json({
      success: true,
      logs: filtered.slice(0, limit),
      total: filtered.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request)
    const body = await request.json()
    const { level, source, message } = body

    if (!level || !source || !message) {
      return Response.json(
        { success: false, error: 'Missing required fields: level, source, message' },
        { status: 400 }
      )
    }

    const entry = addDeveloperLog(level, source, message)

    return Response.json({ success: true, log: entry })
  } catch (error) {
    return errorResponse(error)
  }
}
