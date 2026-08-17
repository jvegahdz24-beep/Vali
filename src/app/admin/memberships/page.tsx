'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search, CreditCard, ChevronLeft, ChevronRight,
  RefreshCw, MoreHorizontal, Pencil, Calendar, Building2, User,
  CheckCircle2, XCircle, Clock, AlertCircle,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface Subscription {
  id: string
  workspaceId: string
  plan: string
  status: string
  amount: number | null
  currency: string
  trialEnd: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  createdAt: string
  updatedAt: string
  workspace: {
    id: string
    name: string
    plan: string
    isActive: boolean
    createdAt: string
    owner: { id: string; name: string | null; email: string }
    _count: { contacts: number; conversations: number }
  }
}

interface Pagination { total: number; page: number; limit: number; pages: number }

const planColors: Record<string, string> = {
  enterprise: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  pro: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  starter: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  trial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  free: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  trialing: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  past_due: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  paused: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const statusIcons: Record<string, React.ElementType> = {
  active: CheckCircle2,
  trialing: Clock,
  cancelled: XCircle,
  past_due: AlertCircle,
  paused: Clock,
}

const planPrices: Record<string, number> = { free: 0, trial: 0, starter: 4300, pro: 7800, enterprise: 35500 }

function EditSubDialog({
  sub,
  open,
  onClose,
  onUpdated,
}: {
  sub: Subscription | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [trialEnd, setTrialEnd] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (sub) {
      setPlan(sub.plan)
      setStatus(sub.status)
      setTrialEnd(sub.trialEnd ? sub.trialEnd.substring(0, 10) : '')
    }
  }, [sub])

  const handleSave = async () => {
    if (!sub) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { plan, status }
      if (trialEnd) body.trialEnd = new Date(trialEnd).toISOString()
      else body.trialEnd = null

      const res = await fetch(`/api/admin/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Suscripción actualizada')
      onUpdated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  if (!sub) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Editar Suscripción</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-gray-400 text-sm mb-1 font-medium">Workspace</p>
            <p className="text-white">{sub.workspace.name}</p>
            <p className="text-gray-500 text-xs">{sub.workspace.owner.email}</p>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {['free', 'trial', 'starter', 'pro', 'enterprise'].map(p => (
                  <SelectItem key={p} value={p} className="text-white">
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                    {planPrices[p] > 0 && ` — $${planPrices[p].toLocaleString('es-MX')}/mes`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {['active', 'trialing', 'cancelled', 'past_due', 'paused'].map(s => (
                  <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Fin del Trial</Label>
            <Input
              type="date"
              value={trialEnd}
              onChange={e => setTrialEnd(e.target.value)}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminMembershipsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editSub, setEditSub] = useState<Subscription | null>(null)

  const fetchSubs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(planFilter !== 'all' && { plan: planFilter }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      })
      const res = await fetch(`/api/admin/subscriptions?${params}`)
      const data = await res.json()
      if (res.ok) {
        setSubscriptions(data.subscriptions)
        setPagination(data.pagination)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, planFilter, statusFilter])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  // Summary cards
  const summary = {
    total: pagination.total,
    active: subscriptions.filter(s => s.status === 'active').length,
    trial: subscriptions.filter(s => s.status === 'trialing' || s.plan === 'trial').length,
    cancelled: subscriptions.filter(s => s.status === 'cancelled').length,
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Membresías</h1>
          <p className="text-gray-400 text-sm mt-1">{pagination.total} suscripciones en total</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSubs} className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: pagination.total, icon: CreditCard, color: 'text-violet-400' },
          { label: 'Activas', value: subscriptions.filter(s => s.status === 'active' && !['free','trial'].includes(s.plan)).length, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'En Trial', value: subscriptions.filter(s => s.plan === 'trial' || s.status === 'trialing').length, icon: Clock, color: 'text-amber-400' },
          { label: 'Canceladas', value: subscriptions.filter(s => s.status === 'cancelled').length, icon: XCircle, color: 'text-red-400' },
        ].map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-8 h-8 ${item.color} shrink-0`} />
                <div>
                  <p className="text-gray-400 text-xs">{item.label}</p>
                  <p className="text-white text-xl font-bold">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="bg-gray-900 border-gray-800 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Buscar por workspace o email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <Select value={planFilter} onValueChange={v => { setPlanFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos los planes</SelectItem>
                {['enterprise', 'pro', 'starter', 'trial', 'free'].map(p => (
                  <SelectItem key={p} value={p} className="text-white">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos los estados</SelectItem>
                {['active', 'trialing', 'cancelled', 'past_due', 'paused'].map(s => (
                  <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-6 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Owner</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Plan</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Monto/mes</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Uso</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Desde</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-4"><Skeleton className="h-5 bg-gray-800 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500">
                      <CreditCard className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>No se encontraron suscripciones</p>
                    </td>
                  </tr>
                ) : (
                  subscriptions.map(sub => {
                    const StatusIcon = statusIcons[sub.status] || Clock
                    const price = sub.amount || planPrices[sub.plan] || 0
                    return (
                      <tr key={sub.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
                            <div>
                              <p className="text-white text-sm font-medium">{sub.workspace.name}</p>
                              <p className="text-gray-500 text-xs">{sub.workspaceId.substring(0, 8)}…</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-gray-500 shrink-0" />
                            <div>
                              <p className="text-gray-300 text-sm">{sub.workspace.owner.name || '—'}</p>
                              <p className="text-gray-500 text-xs">{sub.workspace.owner.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={`text-xs ${planColors[sub.plan] || planColors.free}`}>
                            {sub.plan}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={`text-xs inline-flex items-center gap-1 ${statusColors[sub.status] || ''}`}>
                            <StatusIcon className="w-3 h-3" />
                            {sub.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-gray-300 text-sm">
                          {price > 0
                            ? `$${price.toLocaleString('es-MX')}`
                            : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-gray-400 text-xs">
                            {sub.workspace._count.contacts} ctc · {sub.workspace._count.conversations} conv
                          </p>
                        </td>
                        <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(sub.createdAt).toLocaleDateString('es-MX')}
                          </div>
                          {sub.trialEnd && (
                            <p className="text-amber-500 text-xs mt-0.5">
                              Trial hasta {new Date(sub.trialEnd).toLocaleDateString('es-MX')}
                            </p>
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
                                onClick={() => setEditSub(sub)}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar suscripción
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
                {Math.min((page - 1) * pagination.limit + 1, pagination.total)}–
                {Math.min(page * pagination.limit, pagination.total)} de {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-400 text-sm px-2">{page} / {pagination.pages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EditSubDialog
        sub={editSub}
        open={!!editSub}
        onClose={() => setEditSub(null)}
        onUpdated={fetchSubs}
      />
    </div>
  )
}
