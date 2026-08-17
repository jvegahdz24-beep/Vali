// GET /api/marketing/metrics?workspaceId= — métricas reales (Meta) de las
// publicaciones del negocio: alcance, likes, comentarios por post. F2 2026-07-22.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { readMetaCreds, fbPostMetrics, igMediaMetrics } from '@/lib/marketing/meta'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const creds = readMetaCreds(ws?.settings)
    const connected = !!(creds.fbToken || creds.igToken)

    const posts = await db.marketingPost.findMany({
      where: { workspaceId, status: 'ok', postId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, network: true, format: true, caption: true, postId: true, permalink: true, carId: true, createdAt: true },
    })

    if (!connected) {
      return Response.json({ connected: false, message: 'Conecta Facebook/Instagram en Configuración para ver métricas reales.', posts: [], totals: null })
    }

    // Trae métricas en vivo (en paralelo, con límite razonable)
    const withMetrics = await Promise.all(posts.map(async (p) => {
      const m = p.network === 'instagram'
        ? await igMediaMetrics(creds, p.postId!)
        : await fbPostMetrics(creds, p.postId!)
      return { ...p, metrics: m || { likes: 0, comments: 0, shares: 0, reach: 0 } }
    }))

    const totals = withMetrics.reduce((t, p) => ({
      posts: t.posts + 1,
      reach: t.reach + p.metrics.reach,
      likes: t.likes + p.metrics.likes,
      comments: t.comments + p.metrics.comments,
      shares: t.shares + p.metrics.shares,
    }), { posts: 0, reach: 0, likes: 0, comments: 0, shares: 0 })

    // Top creativo por engagement (likes+comments+shares)
    const eng = (m: { likes: number; comments: number; shares: number }) => m.likes + m.comments + m.shares
    const top = [...withMetrics].sort((a, b) => eng(b.metrics) - eng(a.metrics))[0] || null

    return Response.json({
      connected: true,
      totals,
      topPost: top ? { caption: (top.caption || '').slice(0, 80), network: top.network, engagement: eng(top.metrics), permalink: top.permalink } : null,
      posts: withMetrics,
    })
  } catch (error) { return errorResponse(error) }
}
