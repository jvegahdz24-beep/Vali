import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_DURATIONS,
  COUPON_PLAN_KEYS,
  normalizeCouponCode,
  parseCouponPlans,
} from '@/lib/billing-coupons'
import { z } from 'zod'

const updateCouponSchema = z.object({
  code: z.string().min(3).max(40).optional(),
  name: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  discountType: z.enum(COUPON_DISCOUNT_TYPES).optional(),
  discountValue: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  duration: z.enum(COUPON_DURATIONS).optional(),
  durationInMonths: z.number().int().min(1).max(36).optional().nullable(),
  appliesToPlans: z.array(z.enum(COUPON_PLAN_KEYS)).optional(),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  maxRedemptionsPerWorkspace: z.number().int().min(0).max(50).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((data, ctx) => {
  if (data.discountType === 'percent' && data.discountValue !== undefined && data.discountValue > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'El porcentaje no puede superar 100%.' })
  }
  if (data.startsAt && data.expiresAt && new Date(data.expiresAt) <= new Date(data.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'La expiración debe ser posterior al inicio.' })
  }
})

function safeJson(value: string | null | undefined) {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function serializeCoupon(coupon: any) {
  return {
    ...coupon,
    appliesToPlans: parseCouponPlans(coupon.appliesToPlans),
    metadata: safeJson(coupon.metadata),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const coupon = await db.coupon.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 25,
        },
        _count: { select: { redemptions: true } },
      },
    })

    if (!coupon) {
      return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ coupon: serializeCoupon(coupon) })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/coupons/[id] GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const existing = await db.coupon.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 })
    }

    const parsed = updateCouponSchema.parse(await request.json())
    const updateData: Record<string, unknown> = {}

    if (parsed.code !== undefined) {
      const code = normalizeCouponCode(parsed.code)
      const conflict = await db.coupon.findUnique({ where: { code } })
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ error: 'Ya existe un cupón con ese código.' }, { status: 409 })
      }
      updateData.code = code
    }
    if (parsed.name !== undefined) updateData.name = parsed.name
    if (parsed.description !== undefined) updateData.description = parsed.description || null
    if (parsed.discountType !== undefined) updateData.discountType = parsed.discountType
    if (parsed.discountValue !== undefined) updateData.discountValue = parsed.discountValue
    if (parsed.currency !== undefined) updateData.currency = parsed.currency.toUpperCase()
    if (parsed.duration !== undefined) updateData.duration = parsed.duration
    if (parsed.durationInMonths !== undefined) updateData.durationInMonths = parsed.durationInMonths
    if (parsed.appliesToPlans !== undefined) updateData.appliesToPlans = JSON.stringify(parsed.appliesToPlans)
    if (parsed.maxRedemptions !== undefined) updateData.maxRedemptions = parsed.maxRedemptions || null
    if (parsed.maxRedemptionsPerWorkspace !== undefined) updateData.maxRedemptionsPerWorkspace = parsed.maxRedemptionsPerWorkspace
    if (parsed.startsAt !== undefined) updateData.startsAt = parsed.startsAt ? new Date(parsed.startsAt) : null
    if (parsed.expiresAt !== undefined) updateData.expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : null
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive
    if (parsed.metadata !== undefined) updateData.metadata = JSON.stringify(parsed.metadata)

    if (
      parsed.code !== undefined ||
      parsed.discountType !== undefined ||
      parsed.discountValue !== undefined ||
      parsed.currency !== undefined ||
      parsed.duration !== undefined ||
      parsed.durationInMonths !== undefined
    ) {
      updateData.stripeCouponId = null
    }

    const coupon = await db.coupon.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { redemptions: true } },
      },
    })

    return NextResponse.json({ coupon: serializeCoupon(coupon), message: 'Cupón actualizado' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    console.error('[admin/coupons/[id] PATCH]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const coupon = await db.coupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    })
    if (!coupon) {
      return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 })
    }

    if (coupon._count.redemptions > 0) {
      const updated = await db.coupon.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({
        coupon: serializeCoupon(updated),
        message: 'El cupón tiene redenciones; se desactivó para conservar historial.',
      })
    }

    await db.coupon.delete({ where: { id } })
    return NextResponse.json({ message: 'Cupón eliminado' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/coupons/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
