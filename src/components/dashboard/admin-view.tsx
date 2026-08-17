'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DollarSign,
  Users,
  Calendar,
  Building2,
  TrendingUp,
  ArrowRight,
  UserCheck,
  UserX,
  Loader2,
  MessageSquare,
  Bot,
  ShoppingCart,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { ScoreRing } from '@/components/ui/score-ring'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──

interface AdminMetrics {
  mrrTotal: number
  totalContacts: number
  totalConversations: number
  totalDeals: number
  activeDeals: number
  wonDeals: number
  lostDeals: number
  totalMessages: number
  totalAgents: number
  totalRevenue: number
  pipelineValue: number
  contactsGrowth: number
  dealsGrowth: number
  contactsThisMonth: number
  dealsThisMonth: number
}

interface Vendedor {
  id: string
  nombre: string
  leads: number
  conversion: number
  enLinea: boolean
  score: number
}

interface FunnelStep {
  etapa: string
  valor: number
  pct: number
}

interface AdminViewProps {
  workspaceId: string
}

// ── Helpers ──

function formatMRR(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getOnlineBadge(enLinea: boolean) {
  return enLinea ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 gap-1">
      <UserCheck className="h-3 w-3" />
      Activo
    </Badge>
  ) : (
    <Badge className="bg-zinc-100 text-zinc-500 border-0 text-[10px] px-2 py-0.5 gap-1">
      <UserX className="h-3 w-3" />
      Inactivo
    </Badge>
  )
}

function getPlanBadge(plan: string) {
  switch (plan) {
    case 'Enterprise':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Enterprise
        </Badge>
      )
    case 'pro':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Pro
        </Badge>
      )
    case 'starter':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Starter
        </Badge>
      )
    case 'free':
      return (
        <Badge className="bg-zinc-100 text-zinc-600 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Free
        </Badge>
      )
    default:
      return <Badge className="bg-zinc-100 text-zinc-600 border-0 text-[10px] px-2 py-0.5 font-semibold">{plan}</Badge>
  }
}

// ── Component ──

export function AdminView({ workspaceId }: AdminViewProps) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [plan, setPlan] = useState('free')
  const [mrr, setMrr] = useState(0)
  const [workspaceName, setWorkspaceName] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!workspaceId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/admin/metrics?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const data = await res.json()
      setMetrics(data.metrics)
      setFunnel(data.funnel || [])
      setVendedores(data.team || [])
      setPlan(data.workspace?.plan || 'free')
      setMrr(data.workspace?.mrr || 0)
      setWorkspaceName(data.workspace?.name || '')
    } catch {
      setMetrics({
        mrrTotal: 0,
        totalContacts: 0,
        totalConversations: 0,
        totalDeals: 0,
        activeDeals: 0,
        wonDeals: 0,
        lostDeals: 0,
        totalMessages: 0,
        totalAgents: 0,
        totalRevenue: 0,
        pipelineValue: 0,
        contactsGrowth: 0,
        dealsGrowth: 0,
        contactsThisMonth: 0,
        dealsThisMonth: 0,
      })
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const metricCards = [
    {
      title: 'Ingresos Totales',
      value: formatMRR(metrics?.totalRevenue ?? 0),
      description: `Pipeline: ${formatMRR(metrics?.pipelineValue ?? 0)}`,
      icon: <DollarSign className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Contactos Totales',
      value: (metrics?.totalContacts ?? 0).toLocaleString('es-MX'),
      description: `+${metrics?.contactsThisMonth ?? 0} este mes (${metrics?.contactsGrowth ?? 0 >= 0 ? '+' : ''}${metrics?.contactsGrowth ?? 0}%)`,
      icon: <Users className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Deals Ganados',
      value: (metrics?.wonDeals ?? 0).toString(),
      description: `${metrics?.activeDeals ?? 0} activos · ${metrics?.lostDeals ?? 0} perdidos`,
      icon: <ShoppingCart className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Conversaciones',
      value: (metrics?.totalConversations ?? 0).toLocaleString('es-MX'),
      description: `${(metrics?.totalMessages ?? 0).toLocaleString('es-MX')} mensajes · ${metrics?.totalAgents ?? 0} agentes`,
      icon: <MessageSquare className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* ═══ TORRE DE CONTROL: salud de TODOS los tenants (2026-07-20) ═══ */}
      <HealthTower />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Admin</h3>
          <p className="text-sm text-muted-foreground">
            Gestión del negocio y métricas de ventas{workspaceName ? ` · ${workspaceName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-xs px-2.5 py-1">{getPlanBadge(plan)}</Badge>
          {mrr > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs px-2.5 py-1 font-semibold">
              MRR: {formatMRR(mrr)}
            </Badge>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <Skeleton className="h-8 w-8 rounded-lg mb-3" />
                <Skeleton className="h-6 w-24 mb-1" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((metric) => (
            <Card key={metric.title} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', metric.bg)}>
                    <span className={metric.color}>{metric.icon}</span>
                  </div>
                </div>
                <p className="text-xl font-bold text-foreground">{metric.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{metric.title}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{metric.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Funnel Visualization */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Embudo de Conversión
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded" />
              ))}
            </div>
          ) : funnel.length > 0 ? (
            <div className="space-y-3">
              {funnel.map((step, index) => {
                const conversionRate =
                  index > 0 && funnel[index - 1].valor > 0
                    ? Math.round((step.valor / funnel[index - 1].valor) * 100)
                    : null

                return (
                  <div key={step.etapa} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{step.etapa}</span>
                        {conversionRate !== null && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] px-1.5 py-0 gap-0.5">
                            <ArrowRight className="h-2.5 w-2.5" />
                            {conversionRate}%
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground font-medium">
                        {step.valor.toLocaleString('es-MX')}
                        <span className="text-muted-foreground/60 ml-1">({step.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-7 bg-muted/50 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-md transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(step.pct, 3)}%`,
                          opacity: 1 - index * 0.15,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Sin datos de embudo</p>
          )}
        </CardContent>
      </Card>

      {/* Team Performance Table */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            Equipo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : vendedores.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin miembros en el equipo</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-semibold text-muted-foreground">
                      Nombre
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Leads
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Conversión %
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Estatus
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Score
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {vendedores.map((vendedor) => (
                    <TableRow key={vendedor.id} className="hover:bg-muted/30">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {vendedor.nombre
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                            {vendedor.nombre}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center text-sm font-medium text-foreground">
                        {vendedor.leads}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <Badge
                          className={cn(
                            'border-0 text-[10px] px-2 py-0.5 font-semibold',
                            vendedor.conversion >= 10
                              ? 'bg-emerald-100 text-emerald-700'
                              : vendedor.conversion >= 7
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-orange-100 text-orange-700'
                          )}
                        >
                          {vendedor.conversion}%
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getOnlineBadge(vendedor.enLinea)}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center">
                          <ScoreRing score={vendedor.score} size={36} strokeWidth={3} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── TORRE DE CONTROL: salud de todos los tenants de un vistazo ───
// (solo superadmin — la API rechaza a cualquier otro rol)
interface TenantHealth {
  id: string; name: string; plan: string
  status: 'ok' | 'warn' | 'down' | 'setup'
  waConnected: boolean; connectedPhone: string | null
  iaPaused: boolean; inbound24: number; outbound24: number
  lastInboundAt: string | null; lastOutboundAt: string | null
  followupsRezagados: number; botStuck: boolean; billing: string | null
}
function HealthTower() {
  const [rows, setRows] = useState<TenantHealth[] | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch('/api/admin/health')
      if (!r.ok) { setRows([]); return }
      const j = await r.json()
      setRows(j.tenants || [])
      setUpdatedAt(new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }))
    } catch { setRows([]) } finally { if (!silent) setLoading(false) }
  }, [])
  useEffect(() => { load(); const iv = setInterval(() => load(true), 60000); return () => clearInterval(iv) }, [load])

  if (rows === null) return null
  const down = rows.filter(r => r.status === 'down').length
  const dot = (s: TenantHealth['status']) =>
    s === 'down' ? 'bg-red-500' : s === 'warn' ? 'bg-amber-500' : s === 'ok' ? 'bg-emerald-500' : 'bg-zinc-400'
  const ago = (iso: string | null) => {
    if (!iso) return '—'
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    return m < 60 ? `hace ${m}m` : m < 1440 ? `hace ${Math.floor(m / 60)}h` : `hace ${Math.floor(m / 1440)}d`
  }
  return (
    <Card className={cn('border-border/60', down > 0 && 'border-red-500/50')}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className={cn('h-4 w-4', down > 0 ? 'text-red-500' : 'text-emerald-500')} />
          Torre de control — salud de los clientes
          {down > 0 && <Badge className="bg-red-500/15 text-red-500 border-0">{down} caído(s)</Badge>}
        </CardTitle>
        <button onClick={() => load()} disabled={loading} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> {updatedAt && `act. ${updatedAt}`}
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">WhatsApp</TableHead>
                <TableHead className="text-xs text-center">Msjs 24h (in/out)</TableHead>
                <TableHead className="text-xs">Último cliente</TableHead>
                <TableHead className="text-xs">Última respuesta</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className={cn('border-border/40', t.status === 'down' && 'bg-red-500/5')}>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dot(t.status))} />
                      <div>
                        <p className="text-xs font-semibold leading-tight">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">{t.plan}{t.billing ? ` · pago: ${t.billing}` : ''}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {t.connectedPhone
                      ? <span className={t.waConnected ? 'text-emerald-500' : 'text-red-500 font-semibold'}>{t.waConnected ? '🟢 conectado' : '🔴 CAÍDO'} <span className="text-muted-foreground">· {t.connectedPhone}</span></span>
                      : <span className="text-muted-foreground">sin vincular</span>}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-center font-mono">{t.inbound24} / {t.outbound24}</TableCell>
                  <TableCell className="py-2 text-[11px] text-muted-foreground">{ago(t.lastInboundAt)}</TableCell>
                  <TableCell className="py-2 text-[11px] text-muted-foreground">{ago(t.lastOutboundAt)}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.botStuck && <Badge className="bg-red-500/15 text-red-500 border-0 text-[10px]">bot sin responder</Badge>}
                      {t.iaPaused && <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px]">IA pausada</Badge>}
                      {t.followupsRezagados > 0 && <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px]">{t.followupsRezagados} rezagados</Badge>}
                      {t.status === 'ok' && <Badge className="bg-emerald-500/15 text-emerald-600 border-0 text-[10px]">al día</Badge>}
                      {t.status === 'setup' && <Badge className="bg-zinc-500/15 text-zinc-500 border-0 text-[10px]">en setup</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin datos (¿tienes rol superadmin?)</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">🔴 caído = WhatsApp vinculado pero desconectado, o bot &gt;2h sin responder al último mensaje. Si algo cae, también llega alerta a Telegram (revisión cada 10 min).</p>
      </CardContent>
    </Card>
  )
}
