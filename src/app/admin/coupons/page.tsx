'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  MoreHorizontal,
  Percent,
  Plus,
  Power,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

type Coupon = {
  id: string
  code: string
  name: string
  description: string | null
  discountType: 'percent' | 'fixed'
  discountValue: number
  currency: string
  duration: 'once' | 'forever' | 'repeating'
  durationInMonths: number | null
  appliesToPlans: string[]
  maxRedemptions: number | null
  maxRedemptionsPerWorkspace: number
  redeemedCount: number
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  stripeCouponId: string | null
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; name: string | null; email: string } | null
  _count?: { redemptions: number }
}

type Pagination = { total: number; page: number; limit: number; pages: number }
type Stats = { total: number; active: number; expired: number; redemptions: number }

type CouponForm = {
  code: string
  name: string
  description: string
  discountType: 'percent' | 'fixed'
  discountValue: string
  duration: 'once' | 'forever' | 'repeating'
  durationInMonths: string
  appliesToPlans: string[]
  maxRedemptions: string
  maxRedemptionsPerWorkspace: string
  startsAt: string
  expiresAt: string
  isActive: boolean
}

const PLAN_OPTIONS = ['starter', 'pro', 'enterprise']

const emptyForm: CouponForm = {
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: '15',
  duration: 'once',
  durationInMonths: '',
  appliesToPlans: [],
  maxRedemptions: '',
  maxRedemptionsPerWorkspace: '1',
  startsAt: '',
  expiresAt: '',
  isActive: true,
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDiscount(coupon: Coupon) {
  if (coupon.discountType === 'percent') return `${coupon.discountValue}%`
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: coupon.currency || 'MXN',
    maximumFractionDigits: 0,
  }).format(coupon.discountValue)
}

function getCouponStatus(coupon: Coupon) {
  const now = Date.now()
  if (!coupon.isActive) return { label: 'Inactivo', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { label: 'Programado', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
    return { label: 'Expirado', className: 'bg-red-500/20 text-red-300 border-red-500/30' }
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { label: 'Agotado', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
  }
  return { label: 'Activo', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
}

function toForm(coupon: Coupon): CouponForm {
  return {
    code: coupon.code,
    name: coupon.name,
    description: coupon.description || '',
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    duration: coupon.duration,
    durationInMonths: coupon.durationInMonths ? String(coupon.durationInMonths) : '',
    appliesToPlans: coupon.appliesToPlans || [],
    maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : '',
    maxRedemptionsPerWorkspace: String(coupon.maxRedemptionsPerWorkspace ?? 1),
    startsAt: coupon.startsAt ? coupon.startsAt.substring(0, 10) : '',
    expiresAt: coupon.expiresAt ? coupon.expiresAt.substring(0, 10) : '',
    isActive: coupon.isActive,
  }
}

function CouponDialog({
  open,
  coupon,
  onClose,
  onSaved,
}: {
  open: boolean
  coupon: Coupon | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CouponForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(coupon ? toForm(coupon) : emptyForm)
  }, [coupon, open])

  const setField = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const togglePlan = (plan: string, checked: boolean) => {
    setForm(prev => ({
      ...prev,
      appliesToPlans: checked
        ? [...prev.appliesToPlans, plan]
        : prev.appliesToPlans.filter(item => item !== plan),
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        currency: 'MXN',
        duration: form.duration,
        durationInMonths: form.duration === 'repeating' && form.durationInMonths ? Number(form.durationInMonths) : null,
        appliesToPlans: form.appliesToPlans,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        maxRedemptionsPerWorkspace: Number(form.maxRedemptionsPerWorkspace || '1'),
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        isActive: form.isActive,
      }

      const res = await fetch(coupon ? `/api/admin/coupons/${coupon.id}` : '/api/admin/coupons', {
        method: coupon ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el cupón')

      toast.success(coupon ? 'Cupón actualizado' : 'Cupón creado')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{coupon ? 'Editar cupón' : 'Nuevo cupón de membresía'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Código</Label>
            <Input
              value={form.code}
              onChange={e => setField('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="VALI-PRO-20"
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Nombre interno</Label>
            <Input
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="Campaña cierre de mes"
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Tipo de descuento</Label>
            <Select value={form.discountType} onValueChange={(value: 'percent' | 'fixed') => setField('discountType', value)}>
              <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="percent" className="text-white">Porcentaje</SelectItem>
                <SelectItem value="fixed" className="text-white">Monto fijo MXN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">
              {form.discountType === 'percent' ? 'Porcentaje' : 'Monto MXN'}
            </Label>
            <Input
              type="number"
              min="0"
              max={form.discountType === 'percent' ? 100 : undefined}
              value={form.discountValue}
              onChange={e => setField('discountValue', e.target.value)}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Duración en Stripe</Label>
            <Select value={form.duration} onValueChange={(value: 'once' | 'forever' | 'repeating') => setField('duration', value)}>
              <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="once" className="text-white">Solo primer pago</SelectItem>
                <SelectItem value="forever" className="text-white">Permanente</SelectItem>
                <SelectItem value="repeating" className="text-white">Por meses definidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Meses si es recurrente</Label>
            <Input
              type="number"
              min="1"
              max="36"
              value={form.durationInMonths}
              onChange={e => setField('durationInMonths', e.target.value)}
              disabled={form.duration !== 'repeating'}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white disabled:opacity-50"
            />
          </div>

          <div className="md:col-span-2">
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Planes aplicables</Label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300">
                <Checkbox
                  checked={form.appliesToPlans.length === 0}
                  onCheckedChange={checked => checked && setField('appliesToPlans', [])}
                  className="border-gray-600"
                />
                Todos
              </label>
              {PLAN_OPTIONS.map(plan => (
                <label key={plan} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300 capitalize">
                  <Checkbox
                    checked={form.appliesToPlans.includes(plan)}
                    onCheckedChange={checked => togglePlan(plan, checked === true)}
                    className="border-gray-600"
                  />
                  {plan}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Usos totales máximos</Label>
            <Input
              type="number"
              min="1"
              value={form.maxRedemptions}
              onChange={e => setField('maxRedemptions', e.target.value)}
              placeholder="Sin límite"
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Usos por workspace</Label>
            <Input
              type="number"
              min="0"
              value={form.maxRedemptionsPerWorkspace}
              onChange={e => setField('maxRedemptionsPerWorkspace', e.target.value)}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Disponible desde</Label>
            <Input
              type="date"
              value={form.startsAt}
              onChange={e => setField('startsAt', e.target.value)}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Expira</Label>
            <Input
              type="date"
              value={form.expiresAt}
              onChange={e => setField('expiresAt', e.target.value)}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="md:col-span-2">
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Descripción / notas internas</Label>
            <Textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Condiciones comerciales, canal de venta, aprobador, etc."
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 min-h-20"
            />
          </div>

          <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-300">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={checked => setField('isActive', checked === true)}
              className="border-gray-600"
            />
            Cupón activo y disponible para checkout
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? 'Guardando...' : coupon ? 'Guardar cambios' : 'Crear cupón'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 })
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, expired: 0, redemptions: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [discountType, setDiscountType] = useState('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(status !== 'all' && { status }),
        ...(plan !== 'all' && { plan }),
        ...(discountType !== 'all' && { discountType }),
      })
      const res = await fetch(`/api/admin/coupons?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar cupones')
      setCoupons(data.coupons || [])
      setPagination(data.pagination)
      setStats(data.stats)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar cupones')
    } finally {
      setLoading(false)
    }
  }, [discountType, page, plan, search, status])

  useEffect(() => { fetchCoupons() }, [fetchCoupons])

  const openCreate = () => {
    setEditingCoupon(null)
    setDialogOpen(true)
  }

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon)
    setDialogOpen(true)
  }

  const updateCoupon = async (coupon: Coupon, body: Record<string, unknown>, successMessage: string) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar')
      toast.success(successMessage)
      fetchCoupons()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar')
    }
  }

  const deleteCoupon = async (coupon: Coupon) => {
    if (!window.confirm(`¿Eliminar o desactivar el cupón ${coupon.code}?`)) return
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar')
      toast.success(data.message || 'Cupón eliminado')
      fetchCoupons()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar')
    }
  }

  const summaryCards = useMemo(() => [
    { label: 'Cupones', value: stats.total, icon: Tags, color: 'text-violet-400' },
    { label: 'Activos', value: stats.active, icon: Power, color: 'text-emerald-400' },
    { label: 'Redenciones', value: stats.redemptions, icon: Users, color: 'text-blue-400' },
    { label: 'Expirados', value: stats.expired, icon: Calendar, color: 'text-red-400' },
  ], [stats])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Cupones de membresías</h1>
          <p className="text-gray-400 text-sm mt-1">
            Registra, controla y audita descuentos para checkout de Starter, Pro y Enterprise.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCoupons} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo cupón
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-8 h-8 ${item.color} shrink-0`} />
                <div>
                  <p className="text-gray-400 text-xs">{item.label}</p>
                  <p className="text-white text-xl font-bold">{item.value.toLocaleString('es-MX')}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-gray-900 border-gray-800 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Buscar por código, nombre o notas..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <Select value={status} onValueChange={value => { setStatus(value); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos</SelectItem>
                <SelectItem value="active" className="text-white">Activos</SelectItem>
                <SelectItem value="inactive" className="text-white">Inactivos</SelectItem>
                <SelectItem value="expired" className="text-white">Expirados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={plan} onValueChange={value => { setPlan(value); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos los planes</SelectItem>
                {PLAN_OPTIONS.map(item => (
                  <SelectItem key={item} value={item} className="text-white capitalize">{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={discountType} onValueChange={value => { setDiscountType(value); setPage(1) }}>
              <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Cualquier descuento</SelectItem>
                <SelectItem value="percent" className="text-white">Porcentaje</SelectItem>
                <SelectItem value="fixed" className="text-white">Monto fijo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-6 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Cupón</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Descuento</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Planes</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Vigencia</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Uso</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, index) => (
                    <tr key={index} className="border-b border-gray-800/50">
                      {[...Array(7)].map((__, cell) => (
                        <td key={cell} className="px-4 py-4"><Skeleton className="h-5 bg-gray-800 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : coupons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      <Tags className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>No se encontraron cupones</p>
                    </td>
                  </tr>
                ) : (
                  coupons.map(coupon => {
                    const statusInfo = getCouponStatus(coupon)
                    return (
                      <tr key={coupon.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="rounded bg-gray-800 px-2 py-1 text-sm font-semibold text-white">{coupon.code}</code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-500 hover:text-white hover:bg-gray-800"
                                onClick={() => {
                                  navigator.clipboard.writeText(coupon.code)
                                  toast.success('Código copiado')
                                }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <p className="text-gray-300 text-sm mt-1">{coupon.name}</p>
                            {coupon.description && (
                              <p className="text-gray-500 text-xs mt-0.5 max-w-[280px] truncate">{coupon.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {coupon.discountType === 'percent'
                              ? <Percent className="w-4 h-4 text-violet-400" />
                              : <DollarSign className="w-4 h-4 text-emerald-400" />}
                            <div>
                              <p className="text-white text-sm font-semibold">{formatDiscount(coupon)}</p>
                              <p className="text-gray-500 text-xs">
                                {coupon.duration === 'once' ? 'Primer pago' : coupon.duration === 'forever' ? 'Permanente' : `${coupon.durationInMonths} meses`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(coupon.appliesToPlans.length ? coupon.appliesToPlans : ['todos']).map(item => (
                              <Badge key={item} className="bg-gray-800 text-gray-300 border-gray-700 capitalize">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                          <p>Desde: {formatDate(coupon.startsAt)}</p>
                          <p>Hasta: {formatDate(coupon.expiresAt)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-gray-300 text-sm">
                            {coupon.redeemedCount.toLocaleString('es-MX')}
                            <span className="text-gray-500">
                              {' / '}{coupon.maxRedemptions ? coupon.maxRedemptions.toLocaleString('es-MX') : 'sin límite'}
                            </span>
                          </p>
                          <p className="text-gray-500 text-xs">{coupon.maxRedemptionsPerWorkspace} por workspace</p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                          {coupon.stripeCouponId && (
                            <p className="text-gray-600 text-[11px] mt-1">Stripe sincronizado</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
                              <DropdownMenuItem
                                className="text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                                onClick={() => openEdit(coupon)}
                              >
                                Editar cupón
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                                onClick={() => updateCoupon(coupon, { isActive: !coupon.isActive }, coupon.isActive ? 'Cupón desactivado' : 'Cupón activado')}
                              >
                                {coupon.isActive ? 'Desactivar' : 'Activar'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 cursor-pointer"
                                onClick={() => deleteCoupon(coupon)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
              <p className="text-gray-400 text-sm">
                {Math.min((page - 1) * pagination.limit + 1, pagination.total)}-
                {Math.min(page * pagination.limit, pagination.total)} de {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-400 text-sm px-2">{page} / {pagination.pages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(value => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CouponDialog
        open={dialogOpen}
        coupon={editingCoupon}
        onClose={() => setDialogOpen(false)}
        onSaved={fetchCoupons}
      />
    </div>
  )
}
