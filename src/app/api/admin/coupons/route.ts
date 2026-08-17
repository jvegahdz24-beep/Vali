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

const couponSchema = z.object({
  code: z.string().min(3).max(40),
  name: z.string().min(3).max(120),
  description: z.string().max(2000).optional().nullable(),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.number().positive(),
  currency: z.string().min(3).max(3).default('MXN'),
  duration: z.enum(COUPON_DURATIONS).default('once'),
  durationInMonths: z.number().int().min(1).max(36).optional().nullable(),
  appliesToPlans: z.array(z.enum(COUPON_PLAN_KEYS)).default([]),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  maxRedemptionsPerWorkspace: z.number().int().min(0).max(50).default(1),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((data, ctx) => {
  if (data.discountType === 'percent' && data.discountValue > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'El porcentaje no puede superar 100%.' })
  }
  if (data.duration === 'repeating' && !data.durationInMonths) {
    ctx.addIssue({ code: 'custom', path: ['durationInMonths'], message: 'La duración recurrente requiere meses.' })
  }
  if (data.startsAt && data.expiresAt && new Date(data.expiresAt) <= new Date(data.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'La expiración debe ser posterior al inicio.' })
  }
})

function serializeCoupon(coupon: any) {
  return {
    ...coupon,
    appliesToPlans: parseCouponPlans(coupon.appliesToPlans),
    metadata: safeJson(coupon.metadata),
  }
}

function safeJson(value: string | null | undefined) {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const plan = searchParams.get('plan') || ''
    const discountType = searchParams.get('discountType') || ''
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)
    const skip = (page - 1) * limit

    const where: Record<string, any> = {}

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (status === 'active') where.isActive = true
    if (status === 'inactive') where.isActive = false
    if (status === 'expired') where.expiresAt = { lt: new Date() }
    if (discountType) where.discountType = discountType
    if (plan) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { appliesToPlans: '[]' },
            { appliesToPlans: { contains: `"${plan}"` } },
          ],
        },
      ]
    }

    const [coupons, total, activeCount, expiredCount, totalRedemptions] = await Promise.all([
      db.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { redemptions: true } },
        },
      }),
      db.coupon.count({ where }),
      db.coupon.count({ where: { isActive: true } }),
      db.coupon.count({ where: { expiresAt: { lt: new Date() } } }),
      db.couponRedemption.count({ where: { status: 'redeemed' } }),
    ])

    return NextResponse.json({
      coupons: coupons.map(serializeCoupon),
      stats: {
        total: await db.coupon.count(),
        active: activeCount,
        expired: expiredCount,
        redemptions: totalRedemptions,
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/coupons GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const parsed = couponSchema.parse(await request.json())
    const code = normalizeCouponCode(parsed.code)

    const existing = await db.coupon.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un cupón con ese código.' }, { status: 409 })
    }

    const coupon = await db.coupon.create({
      data: {
        code,
        name: parsed.name,
        description: parsed.description || null,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue,
        currency: parsed.currency.toUpperCase(),
        duration: parsed.duration,
        durationInMonths: parsed.duration === 'repeating' ? parsed.durationInMonths : null,
        appliesToPlans: JSON.stringify(parsed.appliesToPlans),
        maxRedemptions: parsed.maxRedemptions || null,
        maxRedemptionsPerWorkspace: parsed.maxRedemptionsPerWorkspace,
        startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        isActive: parsed.isActive,
        metadata: JSON.stringify(parsed.metadata || {}),
        createdById: session.userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { redemptions: true } },
      },
    })

    return NextResponse.json({ coupon: serializeCoupon(coupon), message: 'Cupón creado' }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    console.error('[admin/coupons POST]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
