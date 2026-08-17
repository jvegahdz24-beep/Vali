import { type NextRequest } from 'next/server'
import { requireAuth, requireWorkspace } from '@/lib/api-auth'
import { subscribeToLogs } from '../route'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') ?? ''

    if (!workspaceId) {
      return new Response('workspaceId is required', { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send a keepalive comment immediately so the browser knows the stream is open
        controller.enqueue(encoder.encode(': connected\n\n'))

        const unsubscribe = subscribeToLogs(workspaceId, controller)

        // Keepalive every 20s to prevent proxy timeouts
        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { /* closed */ }
        }, 20_000)

        request.signal.addEventListener('abort', () => {
          clearInterval(keepalive)
          unsubscribe()
          try { controller.close() } catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized'
    return new Response(msg, { status: 401 })
  }
}
