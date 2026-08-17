// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Dashboard Priorities API
// GET /api/dashboard/priorities
//
// Returns top-5 prioritized leads scored by:
//   1. AI prompt with last 10 messages (< 2s) 
//   2. Fallback determinista: (score×0.4) + (1/(horasInactividad+1)×0.3) + (etapaFactor×0.3)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { chatWithAI } from '@/lib/ai/providers'

interface PriorityLead {
  contactId: string
  contactName: string
  contactPhone: string | null
  leadScore: number
  priorityScore: number
  hoursInactive: number
  currentStage: string | null
  lastMessage: string | null
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  suggestedAction: string
  justification: string
}

// ─── Deterministic fallback scoring ──────────────────────────
function deterministicScore(
  leadScore: number,
  hoursInactive: number,
  stageIndex: number
): number {
  const scorePart = (leadScore / 100) * 0.4
  const inactivityPart = (1 / (hoursInactive + 1)) * 0.3
  const stagePart = (stageIndex / 5) * 0.3 // 0-5 normalized
  return Math.round((scorePart + inactivityPart + stagePart) * 100)
}

function priorityToUrgency(score: number): PriorityLead['urgency'] {
  if (score >= 75) return 'CRITICAL'
  if (score >= 55) return 'HIGH'
  if (score >= 35) return 'MEDIUM'
  return 'LOW'
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const now = new Date()

    // ─── 1. Fetch active contacts with last conversation ───────
    const contacts = await db.contact.findMany({
      where: {
        workspaceId: workspaceId!,
        leadScore: { gte: 10 }, // Skip completely cold leads
      },
      orderBy: { leadScore: 'desc' },
      take: 20, // Pool to rank from
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        leadScore: true,
        lastMessageAt: true,
        tags: true,
        conversations: {
          where: { status: 'active' },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: { content: true, senderType: true, createdAt: true },
            },
          },
        },
      },
    })

    if (contacts.length === 0) {
      return Response.json({ priorities: [], generatedAt: now.toISOString() })
    }

    // ─── 2. Try to get tenant API key ──────────────────────────
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId! },
      select: { settings: true, plan: true },
    })

    let tenantApiKey: string | undefined
    try {
      const raw = typeof workspace?.settings === 'string'
        ? JSON.parse(workspace?.settings || '{}')
        : (workspace?.settings || {})
      const keys = (raw.apiKeys as Record<string, string>) || {}
      for (const p of ['glm', 'groq', 'openai']) {
        if (keys[p] && keys[p].length > 10) { tenantApiKey = keys[p]; break }
      }
    } catch { /* ignore */ }

    // ─── 3. Compute inactivity hours for each contact ──────────
    const stageNames = ['Lead Nuevo', 'Contactado', 'Cualificado', 'Propuesta', 'Negociación', 'Cerrado Ganado']

    const enriched = contacts.map((c) => {
      const lastMsg = c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(0)
      const hoursInactive = Math.floor((now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60))
      const lastConv = c.conversations[0]
      const lastMessage = lastConv?.messages[0]?.content ?? null
      return { ...c, hoursInactive, lastConv, lastMessage }
    })

    // ─── 4. AI ranking (with 2s timeout) or deterministic ─────
    let priorities: PriorityLead[] = []

    if (tenantApiKey) {
      try {
        const snippets = enriched.slice(0, 10).map((c) => {
          const msgs = c.lastConv?.messages
            .slice()
            .reverse()
            .map((m) => `${m.senderType === 'contact' ? 'Cliente' : 'Agente'}: ${m.content.slice(0, 80)}`)
            .join('\n') ?? '(sin mensajes)'

          return `Contact ${c.id} | ${c.firstName} ${c.lastName || ''} | Score:${c.leadScore} | Inactivo:${c.hoursInactive}h\n${msgs}`
        }).join('\n---\n')

        const prompt = [
          {
            role: 'system' as const,
            content: `Eres un sistema de CRM. Analiza estos leads y devuelve un JSON con los 5 más urgentes.
Formato EXACTO (sin texto adicional):
[{"contactId":"id","priorityScore":85,"urgency":"CRITICAL|HIGH|MEDIUM|LOW","suggestedAction":"texto corto","justification":"1 frase"}]
Criterios: score alto + inactividad + señales de cierre = prioridad máxima.`,
          },
          { role: 'user' as const, content: snippets },
        ]

        const aiResponse = await Promise.race([
          chatWithAI(prompt, 'glm', undefined, { tenantApiKey, maxTokens: 400 }),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ])

        if (aiResponse && typeof aiResponse === 'object' && 'content' in aiResponse) {
          // Extract JSON from response
          const jsonMatch = (aiResponse.content as string).match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              contactId: string
              priorityScore: number
              urgency: PriorityLead['urgency']
              suggestedAction: string
              justification: string
            }>

            priorities = parsed.map((p) => {
              const contact = enriched.find((c) => c.id === p.contactId)
              if (!contact) return null
              return {
                contactId: contact.id,
                contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(),
                contactPhone: contact.phone,
                leadScore: contact.leadScore,
                priorityScore: p.priorityScore,
                hoursInactive: contact.hoursInactive,
                currentStage: null,
                lastMessage: contact.lastMessage,
                urgency: p.urgency,
                suggestedAction: p.suggestedAction,
                justification: p.justification,
              } as PriorityLead
            }).filter(Boolean) as PriorityLead[]
          }
        }
      } catch {
        // AI failed or timed out — fall through to deterministic
        priorities = []
      }
    }

    // ─── 5. Fallback deterministic if AI produced nothing ─────
    if (priorities.length === 0) {
      priorities = enriched
        .map((c) => {
          const stageIndex = 1 // Default, no stage lookup for speed
          const ps = deterministicScore(c.leadScore, c.hoursInactive, stageIndex)
          return {
            contactId: c.id,
            contactName: `${c.firstName} ${c.lastName || ''}`.trim(),
            contactPhone: c.phone,
            leadScore: c.leadScore,
            priorityScore: ps,
            hoursInactive: c.hoursInactive,
            currentStage: null,
            lastMessage: c.lastMessage,
            urgency: priorityToUrgency(ps),
            suggestedAction:
              c.hoursInactive < 2 ? 'Responder ahora' :
              c.hoursInactive < 24 ? 'Enviar seguimiento' :
              c.leadScore >= 70 ? 'Reactivar urgente' : 'Nutrir lead',
            justification: `Score ${c.leadScore}, inactivo ${c.hoursInactive}h`,
          } as PriorityLead
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 5)
    }

    return Response.json({
      priorities: priorities.slice(0, 5),
      generatedAt: now.toISOString(),
      method: tenantApiKey && priorities.length > 0 ? 'ai' : 'deterministic',
    })
  } catch (error) {
    return errorResponse(error)
  }
}
