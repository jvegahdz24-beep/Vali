// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Invoices API
// GET /api/billing/invoices — List workspace invoices
// POST /api/billing/invoices — Generate a new invoice
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PLANS } from '@/lib/constants'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// ─── Generate sequential invoice number ──────────────────────
async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `VAF-${year}`

  // Find the last invoice for this workspace this year
  const lastInvoice = await db.invoice.findFirst({
    where: {
      workspaceId,
      invoiceNumber: { startsWith: prefix },
    },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  })

  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-')
    const seq = parseInt(parts[parts.length - 1], 10) || 0
    return `${prefix}-${String(seq + 1).padStart(4, '0')}`
  }

  return `${prefix}-0001`
}

// ─── GET: List invoices ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const invoices = await db.invoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ success: true, invoices })
  } catch (error) {
    return errorResponse(error, 'Error al obtener facturas')
  }
}

// ─── POST: Generate a new invoice ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, subscriptionId, plan, amount, currency = 'MXN', description, billingEmail, billingName } = body

    if (!workspaceId || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, amount' },
        { status: 400 }
      )
    }
    await requireWorkspace(workspaceId, session.userId)

    // Check for duplicate invoice for same period
    const existingInvoice = await db.invoice.findFirst({
      where: {
        workspaceId,
        subscriptionId: subscriptionId || undefined,
        status: { in: ['pending', 'paid'] },
        createdAt: {
          gte: new Date(new Date().setDate(1)), // First of current month
        },
      },
    })

    if (existingInvoice) {
      return NextResponse.json(
        { error: 'Ya existe una factura activa para este periodo', invoiceId: existingInvoice.id },
        { status: 409 }
      )
    }

    const invoiceNumber = await generateInvoiceNumber(workspaceId)
    const taxRate = 0.16 // 16% IVA MX
    const tax = Math.round(amount * taxRate * 100) / 100
    const total = Math.round((amount + tax) * 100) / 100

    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 30)

    const planConfig = PLANS[plan || 'free']
    const planName = planConfig?.name || plan || 'Free'
    const desc = description || `Suscripción ${planName} - ValiAutoFlow CRM`

    // Get subscription period if available
    let periodStart: Date | undefined
    let periodEnd: Date | undefined

    if (subscriptionId) {
      const sub = await db.subscription.findUnique({
        where: { id: subscriptionId },
        select: { currentPeriodStart: true, currentPeriodEnd: true },
      })
      if (sub) {
        periodStart = sub.currentPeriodStart
        periodEnd = sub.currentPeriodEnd
      }
    }

    const invoice = await db.invoice.create({
      data: {
        workspaceId,
        subscriptionId: subscriptionId || null,
        invoiceNumber,
        amount,
        tax,
        total,
        currency,
        status: 'pending',
        description: desc,
        billingEmail: billingEmail || null,
        billingName: billingName || null,
        dueDate,
        invoicePeriodStart: periodStart,
        invoicePeriodEnd: periodEnd,
      },
    })

    return NextResponse.json({ success: true, invoice })
  } catch (error) {
    return errorResponse(error, 'Error al generar factura')
  }
}
