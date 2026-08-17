'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Bot,
  Zap,
  Star,
  Building2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
  Info,
  CreditCard,
  Tag,
} from 'lucide-react'
import { PLANS as PLAN_CATALOG } from '@/lib/constants'

// ─── Plan metadata ─────────────────────────────────────────────
// monthlyBase/implBase salen de la ÚNICA fuente de verdad (constants.ts).

const IVA = 0.16

interface PlanInfo {
  name: string
  monthlyBase: number   // MXN sin IVA
  implBase: number      // MXN sin IVA
  icon: React.ElementType
  iconColor: string
  iconBg: string
  accentBg: string
  accentBorder: string
  accentText: string
  ctaBg: string
  features: string[]
}

const PLAN_INFO: Record<string, PlanInfo> = {
  starter: {
    name: PLAN_CATALOG.starter.name,
    monthlyBase: PLAN_CATALOG.starter.price,
    implBase: PLAN_CATALOG.starter.implementationCost ?? 0,
    icon: Zap,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    accentBg: 'bg-blue-50',
    accentBorder: 'border-blue-200',
    accentText: 'text-blue-700',
    ctaBg: 'bg-blue-600 hover:bg-blue-700',
    features: [
      '5,000 mensajes IA/mes',
      '2 canales (WhatsApp + 1)',
      '500 contactos',
      'Seguimiento 30 días',
      'Dashboard básico',
      'Soporte por email',
    ],
  },
  pro: {
    name: PLAN_CATALOG.pro.name,
    monthlyBase: PLAN_CATALOG.pro.price,
    implBase: PLAN_CATALOG.pro.implementationCost ?? 0,
    icon: Star,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
    accentText: 'text-violet-700',
    ctaBg: 'bg-violet-600 hover:bg-violet-700',
    features: [
      '20,000 mensajes IA/mes',
      '3 canales',
      'Contactos ilimitados',
      'Arquetipos psicológicos',
      'Lead scoring avanzado',
      'Seguimiento 90 días',
      'Analytics completos',
      'Soporte prioritario',
    ],
  },
  enterprise: {
    name: PLAN_CATALOG.enterprise.name,
    monthlyBase: PLAN_CATALOG.enterprise.price,
    implBase: PLAN_CATALOG.enterprise.implementationCost ?? 0,
    icon: Building2,
    iconColor: 'text-gray-700',
    iconBg: 'bg-gray-100',
    accentBg: 'bg-gray-50',
    accentBorder: 'border-gray-200',
    accentText: 'text-gray-700',
    ctaBg: 'bg-gray-900 hover:bg-gray-800',
    features: [
      'Mensajes ilimitados',
      'Todos los canales',
      'IA entrenada por industria',
      'ValiGuard completo',
      'White-label disponible',
      'Aprendizaje automático',
      'Soporte dedicado 24/7',
      'Onboarding personalizado',
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Page ─────────────────────────────────────────────────────

export default function CheckoutPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const planKey = typeof params.plan === 'string' ? params.plan : ''
  const plan = PLAN_INFO[planKey]

  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [couponCode, setCouponCode] = useState(searchParams.get('coupon') || '')
  const [couponLoading, setCouponLoading] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    name: string
    label: string
    duration: string
    preview: { todayDiscount: number; monthlyDiscount: number }
  } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user?.workspaceId) setWorkspaceId(data.user.workspaceId)
        if (data.user?.email) setUserEmail(data.user.email)
      })
      .catch(() => {})
      .finally(() => setLoadingUser(false))
  }, [])

  // ─── Computed amounts ──────────────────────────────────────
  const implNet   = plan?.implBase ?? 0
  const implIVA   = Math.round(implNet * IVA)
  const implTotal = implNet + implIVA

  const monthlyNet   = plan?.monthlyBase ?? 0
  const monthlyIVA   = Math.round(monthlyNet * IVA)
  const monthlyTotal = monthlyNet + monthlyIVA

  // Today = implementation fee only (month 1 is free; subscription starts on month 2)
  const todayTotal = implTotal
  const todayDiscount = appliedCoupon?.preview.todayDiscount || 0
  const monthlyDiscount = appliedCoupon?.preview.monthlyDiscount || 0
  const todayDue = Math.max(todayTotal - todayDiscount, 0)
  const monthlyDue = Math.max(monthlyTotal - monthlyDiscount, 0)

  const validateCoupon = async (code = couponCode) => {
    if (!workspaceId) { setError('Error de sesión. Recarga la página.'); return }
    if (!code.trim()) { setError('Ingresa un código de cupón.'); return }
    setCouponLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          code,
          planKey,
          totals: { todayTotal, monthlyTotal },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) throw new Error(data.error || 'Cupón inválido')
      setAppliedCoupon({
        code: data.coupon.code,
        name: data.coupon.name,
        label: data.coupon.label,
        duration: data.coupon.duration,
        preview: data.coupon.preview,
      })
      setCouponCode(data.coupon.code)
    } catch (err) {
      setAppliedCoupon(null)
      setError(err instanceof Error ? err.message : 'Cupón inválido')
    } finally {
      setCouponLoading(false)
    }
  }

  useEffect(() => {
    const codeFromUrl = searchParams.get('coupon')
    if (!workspaceId || !plan || !codeFromUrl || appliedCoupon) return
    validateCoupon(codeFromUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, planKey])

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Plan no encontrado.</p>
          <a href="/select-plan" className="text-emerald-600 hover:underline">← Volver a planes</a>
        </div>
      </div>
    )
  }

  // ─── Payment handler ───────────────────────────────────────
  const handlePay = async () => {
    if (!workspaceId) { setError('Error de sesión. Recarga la página.'); return }
    setPaying(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          planKey,
          billingPeriod: 'monthly',
          ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al crear sesión de pago.'); return }
      window.location.href = data.checkoutUrl
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setPaying(false)
    }
  }

  const Icon = plan.icon

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href="/select-plan"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mr-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Elegir otro plan
          </a>
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-gray-900">ValiAutoFlow</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* ── LEFT: Plan summary ─────────────────────────────── */}
        <div className="space-y-6">
          {/* Plan card */}
          <div className={`rounded-2xl border-2 ${plan.accentBorder} bg-white p-6`}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`p-2.5 rounded-xl ${plan.iconBg}`}>
                <Icon className={`h-6 w-6 ${plan.iconColor}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Plan seleccionado</p>
                <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              </div>
            </div>
            <ul className="space-y-2.5">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Info box */}
          <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">¿Cómo funciona la facturación?</p>
              <p>La <strong>cuota de implementación</strong> cubre la configuración inicial de tus canales, agentes IA y flujos de automatización. Se cobra <strong>una sola vez</strong> hoy.</p>
              <p>El <strong>primer mes es gratuito</strong>. A partir del segundo mes se cobra la suscripción mensual automáticamente.</p>
            </div>
          </div>

          {userEmail && (
            <p className="text-xs text-gray-400 text-center">
              Factura y recibo serán enviados a <strong>{userEmail}</strong>
            </p>
          )}
        </div>

        {/* ── RIGHT: Breakdown + pay button ───────────────────── */}
        <div className="space-y-5">
          {/* Today's charge */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cobro de hoy (primer pago)</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Cuota de implementación</span>
                <span className="font-medium">${fmt(implNet)} MXN</span>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between text-sm text-gray-500">
                <span>IVA (16%)</span>
                <span>${fmt(implIVA)} MXN</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900">
                <span>Total hoy</span>
                <span className="text-lg">${fmt(todayTotal)} MXN</span>
              </div>
              {appliedCoupon && todayDiscount > 0 && (
                <>
                  <div className="flex justify-between text-sm text-emerald-700">
                    <span>Cupón {appliedCoupon.code}</span>
                    <span>- ${fmt(todayDiscount)} MXN</span>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900">
                    <span>Total con cupón</span>
                    <span className="text-lg">${fmt(todayDue)} MXN</span>
                  </div>
                </>
              )}
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                ✓ El primer mes de suscripción es <strong>gratuito</strong>
              </p>
            </div>
          </div>

          {/* Monthly from month 2 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">A partir del 2° mes (mensual)</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Plan {plan.name} mensual</span>
                <span className="font-medium">${fmt(monthlyNet)} MXN</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>IVA (16%)</span>
                <span>${fmt(monthlyIVA)} MXN</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900">
                <span>Total mensual</span>
                <span>${fmt(monthlyTotal)} MXN</span>
              </div>
              {appliedCoupon && monthlyDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>Con cupón {appliedCoupon.duration === 'forever' ? 'permanente' : 'recurrente'}</span>
                  <span>${fmt(monthlyDue)} MXN</span>
                </div>
              )}
            </div>
          </div>

          {/* Coupon */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-500" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cupón de descuento</p>
            </div>
            <div className="px-5 py-4">
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">{appliedCoupon.code} aplicado</p>
                    <p className="text-xs text-emerald-700">{appliedCoupon.label} · {appliedCoupon.name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-emerald-700 hover:bg-emerald-100"
                    onClick={() => setAppliedCoupon(null)}
                  >
                    Quitar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={e => { setCouponCode(e.target.value.toUpperCase().replace(/\s+/g, '')); setError(null) }}
                    placeholder="VALI-PRO-20"
                    className="h-10 text-sm border-gray-200 focus:border-emerald-500"
                    onKeyDown={e => e.key === 'Enter' && validateCoupon()}
                  />
                  <Button
                    variant="outline"
                    onClick={() => validateCoupon()}
                    disabled={couponLoading || !couponCode.trim() || !workspaceId}
                    className="h-10 shrink-0"
                  >
                    {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Pay button */}
          <Button
            onClick={handlePay}
            disabled={paying || loadingUser || !workspaceId}
            className={`w-full h-14 text-base font-semibold text-white gap-2 ${plan.ctaBg}`}
          >
            {paying ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirigiendo a pago seguro…
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Pagar ${fmt(todayDue)} MXN con tarjeta
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </>
            )}
          </Button>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Lock className="h-3.5 w-3.5" />
            <span>Pago 100% seguro procesado por <strong>Stripe</strong>. No almacenamos datos de tu tarjeta.</span>
          </div>

          <p className="text-center text-xs text-gray-400">
            Al pagar aceptas nuestros{' '}
            <a href="/terms" className="underline hover:text-gray-600">Términos de Servicio</a>.
            Puedes cancelar tu suscripción en cualquier momento.
          </p>
        </div>
      </div>
    </div>
  )
}
