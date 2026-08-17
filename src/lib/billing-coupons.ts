import { db } from '@/lib/db'
import { stripe } from '@/lib/stripe'

export const COUPON_PLAN_KEYS = ['starter', 'pro', 'enterprise'] as const
export const COUPON_DISCOUNT_TYPES = ['percent', 'fixed'] as const
export const COUPON_DURATIONS = ['once', 'forever', 'repeating'] as const

export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number]
export type CouponDuration = (typeof COUPON_DURATIONS)[number]

export class CouponValidationError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'COUPON_INVALID',
  ) {
    super(message)
    this.name = 'CouponValidationError'
  }
}

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export function parseCouponPlans(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function formatCouponDiscount(coupon: { discountType: string; discountValue: number; currency: string }) {
  if (coupon.discountType === 'percent') return `${coupon.discountValue}%`
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: coupon.currency || 'MXN',
    maximumFractionDigits: 0,
  }).format(coupon.discountValue)
}

export function calculateCouponDiscount(total: number, coupon: { discountType: string; discountValue: number }) {
  if (total <= 0) return 0
  if (coupon.discountType === 'percent') {
    return Math.min(total, Math.round(total * (coupon.discountValue / 100)))
  }
  return Math.min(total, coupon.discountValue)
}

export async function validateCouponForCheckout({
  code,
  workspaceId,
  planKey,
}: {
  code: string
  workspaceId: string
  planKey?: string
}) {
  const normalizedCode = normalizeCouponCode(code)
  if (!normalizedCode) {
    throw new CouponValidationError(400, 'Ingresa un código de cupón.')
  }

  const coupon = await db.coupon.findUnique({
    where: { code: normalizedCode },
    include: {
      _count: { select: { redemptions: true } },
    },
  })

  if (!coupon) {
    throw new CouponValidationError(404, 'Cupón no encontrado.')
  }

  const now = new Date()
  if (!coupon.isActive) {
    throw new CouponValidationError(400, 'Este cupón está desactivado.')
  }
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new CouponValidationError(400, 'Este cupón todavía no está disponible.')
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw new CouponValidationError(400, 'Este cupón ya expiró.')
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    throw new CouponValidationError(400, 'Este cupón alcanzó su límite de usos.')
  }

  const plans = parseCouponPlans(coupon.appliesToPlans)
  if (planKey && plans.length > 0 && !plans.includes(planKey)) {
    throw new CouponValidationError(400, `Este cupón no aplica al plan ${planKey}.`)
  }

  if (coupon.maxRedemptionsPerWorkspace > 0) {
    const workspaceUses = await db.couponRedemption.count({
      where: {
        couponId: coupon.id,
        workspaceId,
        status: 'redeemed',
      },
    })
    if (workspaceUses >= coupon.maxRedemptionsPerWorkspace) {
      throw new CouponValidationError(400, 'Este workspace ya usó el máximo permitido para este cupón.')
    }
  }

  return {
    coupon,
    plans,
    label: formatCouponDiscount(coupon),
  }
}

export async function ensureStripeCouponForCheckout(coupon: {
  id: string
  code: string
  name: string
  discountType: string
  discountValue: number
  currency: string
  duration: string
  durationInMonths: number | null
  stripeCouponId: string | null
}) {
  if (coupon.stripeCouponId) return coupon.stripeCouponId
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY no está configurado para crear cupones en Stripe.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeCouponParams: any = {
    name: `${coupon.name} (${coupon.code})`,
    duration: coupon.duration,
    metadata: {
      couponId: coupon.id,
      code: coupon.code,
      source: 'valiautoflow-admin',
    },
  }

  if (coupon.duration === 'repeating') {
    stripeCouponParams.duration_in_months = coupon.durationInMonths || 1
  }

  if (coupon.discountType === 'percent') {
    stripeCouponParams.percent_off = coupon.discountValue
  } else {
    stripeCouponParams.amount_off = Math.round(coupon.discountValue * 100)
    stripeCouponParams.currency = (coupon.currency || 'MXN').toLowerCase()
  }

  const stripeCoupon = await stripe.coupons.create(stripeCouponParams)
  await db.coupon.update({
    where: { id: coupon.id },
    data: { stripeCouponId: stripeCoupon.id },
  })

  return stripeCoupon.id
}
