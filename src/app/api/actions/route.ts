// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Action Execution API
// POST /api/actions — Execute actions & report outcomes
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { interpretLeadMemory } from '@/lib/engine/memory'
import type { ActionType } from '@/lib/engine/types'

// Action effects configuration
const ACTION_EFFECTS: Record<
  string,
  {
    scoreDelta: number
    tempChange?: string
    expectedOutcome: string
    deadline: number // minutes
    ifNotMet: ActionType
  }
> = {
  SEND_FOLLOW_UP: {
    scoreDelta: 5,
    expectedOutcome: 'Respuesta del lead en 2h',
    deadline: 120,
    ifNotMet: 'SEND_AGGRESSIVE_FOLLOWUP',
  },
  SEND_PROPOSAL: {
    scoreDelta: 10,
    tempChange: 'warm',
    expectedOutcome: 'Lead revisa propuesta y responde en 4h',
    deadline: 240,
    ifNotMet: 'CALL_NOW',
  },
  CALL_NOW: {
    scoreDelta: 15,
    tempChange: 'hot',
    expectedOutcome: 'Contacto directo con el lead en 30min',
    deadline: 30,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  SCHEDULE_MEETING: {
    scoreDelta: 20,
    tempChange: 'hot',
    expectedOutcome: 'Reunión confirmada en 24h',
    deadline: 1440,
    ifNotMet: 'CALL_NOW',
  },
  SEND_AGGRESSIVE_FOLLOWUP: {
    scoreDelta: 8,
    expectedOutcome: 'Respuesta inmediata o ghost confirmado',
    deadline: 60,
    ifNotMet: 'REACTIVATE',
  },
  REACTIVATE: {
    scoreDelta: 3,
    expectedOutcome: 'Lead responde o confirma desinterés',
    deadline: 180,
    ifNotMet: 'MARK_LOST',
  },
  UPDATE_SCORE: {
    scoreDelta: 0,
    expectedOutcome: 'Score actualizado',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  MARK_WON: {
    scoreDelta: 100,
    tempChange: 'hot',
    expectedOutcome: 'Venta cerrada',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  MARK_LOST: {
    scoreDelta: -100,
    tempChange: 'cold',
    expectedOutcome: 'Lead descartado',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  LOG_NOTE: {
    scoreDelta: 0,
    expectedOutcome: 'Nota registrada',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { contactId, action, workspaceId, outcome } = body as {
      contactId: string
      action: ActionType
      workspaceId: string
      outcome?: string
    }

    if (!contactId || !workspaceId) {
      return NextResponse.json(
        { error: 'contactId y workspaceId requeridos' },
        { status: 400 }
      )
    }

    const contact = await db.contact.findUnique({
      where: { id: contactId },
      include: { leadProfile: true },
    })

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      )
    }

    // Verify the contact belongs to the provided workspace
    if (contact.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: 'El contacto no pertenece a este workspace' },
        { status: 403 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    // ─── CASE 1: Reporting an action outcome ────
    if (outcome) {
      await db.engineEvent.create({
        data: {
          workspaceId,
          contactId,
          type: 'ACTION_OUTCOME',
          subType: outcome,
          metadata: JSON.stringify({
            reportedBy: session.userId,
            reportedAt: new Date().toISOString(),
          }),
          score: contact.leadScore,
          temperature: contact.temperature,
        },
      })

      // Re-evaluate memory
      const newMemory = await interpretLeadMemory(contactId, workspaceId)

      return NextResponse.json({
        success: true,
        outcome,
        memory: newMemory,
        jhonSays: newMemory.nextBestAction.jhonSays,
      })
    }

    // ─── CASE 2: Executing an action ────────────
    if (!action) {
      return NextResponse.json(
        { error: 'action o outcome requeridos' },
        { status: 400 }
      )
    }

    const effect = ACTION_EFFECTS[action] || ACTION_EFFECTS.SEND_FOLLOW_UP

    // Update contact
    const updateData: Record<string, any> = {}
    if (effect.scoreDelta !== 0) {
      updateData.leadScore = Math.max(
        0,
        Math.min(100, (contact.leadScore || 0) + effect.scoreDelta)
      )
    }
    if (effect.tempChange) {
      updateData.temperature = effect.tempChange
    }
    if (action === 'CALL_NOW' || action === 'SCHEDULE_MEETING') {
      updateData.lastMessageAt = new Date()
    }

    if (Object.keys(updateData).length > 0) {
      await db.contact.update({
        where: { id: contactId },
        data: updateData,
      })
    }

    // Log the action event
    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId,
        type: 'ACTION_EXECUTED',
        subType: action,
        metadata: JSON.stringify({
          scoreDelta: effect.scoreDelta,
          expectedOutcome: effect.expectedOutcome,
          deadline: effect.deadline,
          ifNotMet: effect.ifNotMet,
          executedBy: session.userId,
        }),
        score: updateData.leadScore ?? contact.leadScore,
        temperature: updateData.temperature ?? contact.temperature,
      },
    })

    // Also log as recommended action (for auto-action deadline tracking)
    if (effect.deadline > 0) {
      await db.engineEvent.create({
        data: {
          workspaceId,
          contactId,
          type: 'ACTION_RECOMMENDED',
          subType: effect.ifNotMet,
          metadata: JSON.stringify({
            action,
            expectedOutcome: effect.expectedOutcome,
            deadline: effect.deadline,
            ifNotMet: effect.ifNotMet,
          }),
          score: updateData.leadScore ?? contact.leadScore,
          temperature: updateData.temperature ?? contact.temperature,
        },
      })
    }

    // Re-evaluate memory
    const newMemory = await interpretLeadMemory(contactId, workspaceId)

    // Build jhon response
    let jhonResponse: string
    if (action === 'SEND_AGGRESSIVE_FOLLOWUP') {
      jhonResponse =
        'Estrategia agresiva activada. Si no hay respuesta, este lead entra en modo reactivación.'
    } else if (action === 'CALL_NOW') {
      jhonResponse =
        'Llamada registrada. Si no responde en 30 min, Jhon sugerirá seguimiento.'
    } else {
      jhonResponse =
        effect.deadline > 0
          ? `Acción ejecutada. Si no hay respuesta en ${effect.deadline >= 60 ? Math.round(effect.deadline / 60) + 'h' : effect.deadline + 'min'}, Jhon actuará automáticamente.`
          : 'Acción ejecutada.'
    }

    return NextResponse.json({
      success: true,
      action,
      scoreDelta: effect.scoreDelta,
      newScore: updateData.leadScore ?? contact.leadScore,
      expectedOutcome: effect.expectedOutcome,
      deadline: effect.deadline,
      autoActionWillTrigger: effect.deadline > 0,
      memory: newMemory,
      jhonSays: newMemory.nextBestAction.jhonSays,
      jhonResponse,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
