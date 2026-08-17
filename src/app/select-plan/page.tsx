'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Bot,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Star,
  Building2,
  Gift,
  Tag,
  ArrowRight,
} from 'lucide-react'
import { PLANS as PLAN_CATALOG } from '@/lib/constants'

// ─── Plan definitions ─────────────────────────────────────────
// Precios/implementación desde la ÚNICA fuente de verdad (constants.ts).
const fmtMXN = (n: number) => n.toLocaleString('es-MX')
const implLabelFor = (k: 'starter' | 'pro' | 'enterprise') =>
  `Implementación: ${PLAN_CATALOG[k].implementationLabel ?? `$${fmtMXN(PLAN_CATALOG[k].implementationCost ?? 0)} MXN`}`

const PLANS = [
  {
    key: 'trial',
    name: 'Prueba Gratis',
    badge: '30 días',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    price: 0,
    priceLabel: 'Gratis',
    implLabel: null,
    period: '30 días sin costo',
    noCC: true,
    icon: Gift,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    highlight: true,
    features: [
      '5,000 mensajes IA',
      '2 canales (WhatsApp + 1)',
      '500 contactos',
      'Dashboard completo',
      'Soporte por email',
    ],
    cta: 'Comenzar prueba gratuita',
    ctaStyle: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  {
    key: 'starter',
    name: 'Starter',
    badge: null,
    badgeColor: '',
    price: PLAN_CATALOG.starter.price,
    priceLabel: `$${fmtMXN(PLAN_CATALOG.starter.price)}`,
    implLabel: implLabelFor('starter'),
    period: 'MXN/mes',
    noCC: false,
    icon: Zap,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    borderColor: 'border-gray-200',
    highlight: false,
    features: [
      '5,000 mensajes IA/mes',
      '2 canales (WhatsApp + 1)',
      '500 contactos',
      'Seguimiento 30 días',
      'Dashboard básico',
      'Soporte por email',
    ],
    cta: 'Suscribirme',
    ctaStyle: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  {
    key: 'pro',
    name: 'Pro',
    badge: 'Más popular',
    badgeColor: 'bg-violet-100 text-violet-700',
    price: PLAN_CATALOG.pro.price,
    priceLabel: `$${fmtMXN(PLAN_CATALOG.pro.price)}`,
    implLabel: implLabelFor('pro'),
    period: 'MXN/mes',
    noCC: false,
    icon: Star,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    borderColor: 'border-violet-300',
    highlight: true,
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
    cta: 'Suscribirme',
    ctaStyle: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    badge: null,
    badgeColor: '',
    price: PLAN_CATALOG.enterprise.price,
    priceLabel: `$${fmtMXN(PLAN_CATALOG.enterprise.price)}`,
    implLabel: implLabelFor('enterprise'),
    period: 'MXN/mes',
    noCC: false,
    icon: Building2,
    iconColor: 'text-gray-700',
    iconBg: 'bg-gray-100',
    borderColor: 'border-gray-200',
    highlight: false,
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
    cta: 'Suscribirme',
    ctaStyle: 'bg-gray-900 hover:bg-gray-800 text-white',
  },
]

// ─── Page ─────────────────────────────────────────────────────

export default function SelectPlanPage() {
  const searchParams = useSearchParams()
  const billingStatus = searchParams.get('billing') // 'success' | 'cancelled' | null

  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [discountCode, setDiscountCode] = useState('')
  const [discountApplied, setDiscountApplied] = useState<{ code: string; label: string; name: string } | null>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [pollCount, setPollCount] = useState(0)

  const fetchUser = useCallback(() => {
    return fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user?.workspaceId) setWorkspaceId(data.user.workspaceId)
        if (data.user?.plan) setCurrentPlan(data.user.plan)
        return data.user?.plan
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchUser().finally(() => setLoadingUser(false))
  }, [fetchUser])

  // After successful payment, poll until plan activates (webhook may take a few seconds)
  useEffect(() => {
    if (billingStatus !== 'success') return
    if (currentPlan !== 'free' && currentPlan !== 'trial') return // already activated
    if (pollCount >= 10) return // give up after ~20s

    const timer = setTimeout(async () => {
      const plan = await fetchUser()
      if (plan && plan !== 'free' && plan !== 'trial') return // activated!
      setPollCount(c => c + 1)
    }, 2000)

    return () => clearTimeout(timer)
  }, [billingStatus, currentPlan, pollCount, fetchUser])

  const applyDiscount = async () => {
    const upper = discountCode.trim().toUpperCase()
    if (!workspaceId) {
      setError('Espera a que cargue tu sesión para validar el cupón.')
      return
    }
    if (!upper) {
      setError('Ingresa un código de descuento.')
      return
    }
    setValidatingDiscount(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, code: upper }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) throw new Error(data.error || 'Código de descuento inválido.')
      setDiscountApplied({ code: data.coupon.code, label: data.coupon.label, name: data.coupon.name })
      setDiscountCode(data.coupon.code)
    } catch (err) {
      setDiscountApplied(null)
      setError(err instanceof Error ? err.message : 'Código de descuento inválido.')
    } finally {
      setValidatingDiscount(false)
    }
  }

  const handleSelectPlan = async (planKey: string) => {
    setError(null)
    setLoadingPlan(planKey)

    try {
      // ── Trial: no payment needed ──────────────────────────
      if (planKey === 'trial') {
        const res = await fetch('/api/billing/trial', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Error al activar la prueba.'); return }
        window.location.href = '/'
        return
      }

      // ── Paid plan: go to checkout breakdown ──────────────
      const couponQuery = discountApplied ? `?coupon=${encodeURIComponent(discountApplied.code)}` : ''
      window.location.href = `/checkout/${planKey}${couponQuery}`
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-gray-900">ValiAutoFlow</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Billing status banners */}
        {billingStatus === 'success' && (
          <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle className="h-5 w-5 shrink-0" />
              ¡Pago realizado con éxito!
            </div>
            {currentPlan === 'free' || currentPlan === 'trial' ? (
              <p className="text-sm text-emerald-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Activando tu plan… esto puede tardar unos segundos.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-emerald-700">
                  Tu plan <strong className="capitalize">{currentPlan}</strong> está activo.
                </p>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => { window.location.href = '/' }}
                >
                  Ir al panel
                </Button>
              </div>
            )}
          </div>
        )}
        {billingStatus === 'cancelled' && (
          <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-amber-700 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            El pago fue cancelado. Puedes elegir otro plan o intentarlo de nuevo.
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Planes ValiAutoFlow</h1>
          <p className="text-gray-500 text-lg">Elige el plan perfecto para tu negocio</p>
          {!loadingUser && (
            <p className="mt-3 text-sm text-gray-500">
              Estás en el{' '}
              <span className="font-semibold text-emerald-700 capitalize">{currentPlan === 'free' ? 'Plan Free' : currentPlan === 'trial' ? 'Prueba de 30 días' : `Plan ${currentPlan}`}</span>
              {currentPlan === 'free' && ' — Actualiza para desbloquear todo el poder de ValiAutoFlow.'}
            </p>
          )}
        </div>

        {/* Global error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm max-w-xl mx-auto mb-8">
            <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Discount code */}
        <div className="max-w-sm mx-auto mb-10">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">¿Tienes un código de descuento?</span>
          </div>
          {discountApplied ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Código <strong>{discountApplied.code}</strong> aplicado ({discountApplied.label}). El descuento se verá en el checkout.</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="EJ: VALIFLOW-ABC123"
                value={discountCode}
                onChange={e => { setDiscountCode(e.target.value.toUpperCase().replace(/\s+/g, '')); setError(null) }}
                className="h-10 text-sm border-gray-200 focus:border-emerald-500"
                onKeyDown={e => e.key === 'Enter' && applyDiscount()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={applyDiscount}
                disabled={!discountCode.trim() || validatingDiscount || !workspaceId}
                className="h-10 px-4 shrink-0"
              >
                {validatingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => {
            const Icon = plan.icon
            const isCurrentPlan = currentPlan === plan.key
            const isLoading = loadingPlan === plan.key

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border-2 bg-white p-6 flex flex-col shadow-sm transition-shadow hover:shadow-md ${
                  plan.highlight ? `${plan.borderColor} shadow-md` : plan.borderColor
                } ${isCurrentPlan ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${plan.badgeColor}`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-emerald-600 text-white text-xs">Plan actual</Badge>
                  </div>
                )}

                {/* Icon + Name */}
                <div className={`w-10 h-10 rounded-xl ${plan.iconBg} flex items-center justify-center mb-4`}>
                  <Icon className={`h-5 w-5 ${plan.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>

                {/* Price */}
                <div className="mb-1">
                  {plan.price === 0 ? (
                    <span className="text-2xl font-bold text-emerald-600">Gratis</span>
                  ) : (
                    <div>
                      <span className="text-2xl font-bold text-gray-900">{plan.priceLabel}</span>
                      <span className="text-sm text-gray-500 ml-1">MXN/mes</span>
                    </div>
                  )}
                </div>
                {plan.implLabel && (
                  <p className="text-xs text-gray-400 mb-4">{plan.implLabel}</p>
                )}
                {plan.noCC && (
                  <p className="text-xs font-medium text-emerald-600 mb-4">{plan.period} — sin tarjeta</p>
                )}
                {!plan.implLabel && !plan.noCC && <div className="mb-4" />}

                {/* Features */}
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={() => handleSelectPlan(plan.key)}
                  disabled={isCurrentPlan || isLoading || loadingPlan !== null}
                  className={`w-full font-semibold ${plan.ctaStyle} disabled:opacity-60`}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{plan.key === 'trial' ? 'Activando...' : 'Redirigiendo...'}</>
                  ) : isCurrentPlan ? (
                    'Plan actual'
                  ) : (
                    <><span>{plan.cta}</span><ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-10">
          Todos los precios son en MXN + IVA. La implementación se cobra una sola vez al inicio.
          Descuentos disponibles para contratos anuales.
        </p>

        {/* Skip link */}
        <div className="text-center mt-4">
          <button
            onClick={() => { window.location.href = '/' }}
            className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            Continuar con plan gratuito por ahora
          </button>
        </div>
      </div>
    </div>
  )
}
