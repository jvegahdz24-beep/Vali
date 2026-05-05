import { NextRequest } from 'next/server'
import { orchestrator, getOrchestratorStats } from '@/lib/orchestrator'
import { errorResponse } from '@/lib/api-auth'

// POST /api/orchestrator/chat — Process a message through the dual-agent orchestrator
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      message,
      contactId,
      workspaceId,
      conversationHistory,
      contactName,
      leadScore,
      tags,
      forceMode,
      language,
      businessName,
      industry,
    } = body

    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    const result = await orchestrator.processMessage({
      message,
      contactId,
      workspaceId,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      contactName,
      leadScore,
      tags,
      forceMode,
      language,
      businessName,
      industry,
    })

    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// GET /api/orchestrator/chat — Get orchestrator stats
export async function GET() {
  try {
    const stats = getOrchestratorStats()
    return Response.json({ stats })
  } catch (error) {
    return errorResponse(error)
  }
}
