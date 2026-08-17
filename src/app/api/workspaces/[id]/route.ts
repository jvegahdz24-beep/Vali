import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { publish } from '@/lib/event-bus'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.url.split('/workspaces/')[1]?.split('/')[0]
    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } }
        },
        _count: { select: { contacts: true, conversations: true, deals: true, agents: true } }
      }
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, workspace })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.url.split('/workspaces/')[1]?.split('/')[0]
    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'settings.manage')

    const body = await req.json()
    const {
      name, industry, timezone, locale, logo,
      agentPersonality, agentTemperature,
      businessAddress, businessPhone, businessHours, appointmentUrl, aiHours, financing, reminders,
      commissionRate, requireApproval, cfdi, autoCfdi, payments,
    } = body

    // Read existing settings to merge agent settings
    const existing = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(existing?.settings || '{}') } catch { settings = {} }
    if (agentPersonality !== undefined) settings.agentPersonality = agentPersonality
    if (agentTemperature !== undefined) settings.agentTemperature = agentTemperature
    if (businessAddress !== undefined) settings.businessAddress = businessAddress
    if (businessPhone !== undefined) settings.businessPhone = businessPhone
    if (businessHours !== undefined) settings.businessHours = businessHours
    if (appointmentUrl !== undefined) settings.appointmentUrl = appointmentUrl
    // Horario de atención de la IA: { mode: '24h' | 'custom', start: 'HH:mm', end: 'HH:mm' }
    if (aiHours !== undefined) settings.aiHours = aiHours
    // Financiamiento automotriz: { annualRatePct, minDownPct, terms[], msiTerms[] }
    if (financing !== undefined) settings.financing = financing
    // Business timezone — anchors appointment storage + calendar display.
    if (timezone !== undefined && timezone) settings.timezone = timezone
    // Recordatorios automáticos: { appointment: bool, followup: bool } — respetados por el cron.
    if (reminders !== undefined) settings.reminders = { ...(settings.reminders as object || {}), ...reminders }
    // Comisión de vendedores: % del valor del trato ganado que se le acredita al asesor asignado.
    if (commissionRate !== undefined) settings.commissionRate = Math.max(0, Math.min(100, Number(commissionRate) || 0))
    // Aprobación humana para acciones críticas (pago/factura).
    if (requireApproval !== undefined) settings.requireApproval = requireApproval === true
    // ERP: config del PAC (Facturama) + factura automática al cierre.
    if (cfdi !== undefined) settings.cfdi = { ...(settings.cfdi as object || {}), ...cfdi }
    if (autoCfdi !== undefined) settings.autoCfdi = autoCfdi === true
    // Pagos (Stripe del tenant): clave secreta + secreto de webhook para la "última milla".
    if (payments !== undefined) settings.payments = { ...(settings.payments as object || {}), ...payments }
    const needsSettingsUpdate = agentPersonality !== undefined || agentTemperature !== undefined
      || businessAddress !== undefined || businessPhone !== undefined
      || businessHours !== undefined || appointmentUrl !== undefined || aiHours !== undefined
      || financing !== undefined || reminders !== undefined || commissionRate !== undefined
      || requireApproval !== undefined || cfdi !== undefined || autoCfdi !== undefined || payments !== undefined
      || (timezone !== undefined && !!timezone)

    const workspace = await db.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(industry && { industry }),
        ...(logo !== undefined && { logo }),
        ...(needsSettingsUpdate && { settings: JSON.stringify(settings) }),
      }
    })

    // timezone and locale belong to the User model, not Workspace
    if (timezone || locale) {
      await db.user.update({
        where: { id: session.userId },
        data: {
          ...(timezone && { timezone }),
          ...(locale && { locale }),
        }
      })
    }

    // Section 14: Broadcast settings.updated so other services can react
    await publish('settings.updated', { workspaceId, settings })

    return NextResponse.json({ success: true, workspace })
  } catch (error) {
    return errorResponse(error)
  }
}
