import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

// In-memory log store for developer panel — starts empty, populated at runtime
interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

const logs: LogEntry[] = []

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
