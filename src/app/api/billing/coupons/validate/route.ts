import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import {
  calculateCouponDiscount,
  CouponValidationError,
  parseCouponPlans,
  validateCouponForCheckout,
} from '@/lib/billing-coupons'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, code, planKey, totals } = body

    if (!workspaceId || !code) {
      return NextResponse.json({ error: 'workspaceId y code son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId, { allowSuspended: true })
    const validation = await validateCouponForCheckout({ code, workspaceId, planKey })
    const coupon = validation.coupon
    const todayTotal = typeof totals?.todayTotal === 'number' ? totals.todayTotal : 0
    const monthlyTotal = typeof totals?.monthlyTotal === 'number' ? totals.monthlyTotal : 0

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        currency: coupon.currency,
        duration: coupon.duration,
        durationInMonths: coupon.durationInMonths,
        appliesToPlans: parseCouponPlans(coupon.appliesToPlans),
        label: validation.label,
        preview: {
          todayDiscount: calculateCouponDiscount(todayTotal, coupon),
          monthlyDiscount: coupon.duration === 'once' ? 0 : calculateCouponDiscount(monthlyTotal, coupon),
        },
      },
    })
  } catch (error) {
    if (error instanceof CouponValidationError) {
      return NextResponse.json({ valid: false, error: error.message, code: error.code }, { status: error.statusCode })
    }
    return errorResponse(error, 'Error al validar cupón')
  }
}
