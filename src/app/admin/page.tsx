'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users, CreditCard, TrendingUp, MessageSquare, 
  LifeBuoy, Lightbulb, ArrowUpRight, ArrowDownRight,
  Building2, CheckCircle2, AlertCircle, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { HealthTower } from './_components/health-tower'

interface StatsData {
  users: { total: number; newThisMonth: number; newLast7Days: number; growth: number }
  workspaces: { total: number; active: number; inactive: number }
  subscriptions: { total: number; trial: number; paid: number; starter: number; pro: number; enterprise: number; cancelled: number }
  revenue: { mrr: number; arr: number }
  platform: { totalContacts: number; totalConversations: number; totalMessages: number; totalDeals: number; wonDeals: number; dealWinRate: number }
  support: { openTickets: number; resolvedTickets: number; totalSuggestions: number; pendingSuggestions: number }
  charts: {
    signupTrend: { date: string; count: number }[]
    planDistribution: { plan: string; count: number; label: string; color: string }[]
  }
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendLabel,
  color = 'violet',
}: {
  title: string
  value: string | number
  description?: string
  icon: React.ElementType
  trend?: number
  trendLabel?: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-500/10 text-violet-400',
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
    cyan: 'bg-cyan-500/10 text-cyan-400',
  }

  return (
    <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
            <p className="text-white text-3xl font-bold tracking-tight">
              {typeof value === 'number' && value >= 1000
                ? value.toLocaleString('es-MX')
                : value}
            </p>
            {description && (
              <p className="text-gray-500 text-xs mt-1">{description}</p>
            )}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend >= 0
                  ? <ArrowUpRight className="w-3 h-3" />
                  : <ArrowDownRight className="w-3 h-3" />}
                <span>{Math.abs(trend)}% {trendLabel || 'vs mes anterior'}</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.violet}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400 mb-1">{label}</p>
        <p className="text-white font-semibold">{payload[0].value} registros</p>
      </div>
    )
  }
  return null
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setStats(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 bg-gray-800 mb-2" />
        <Skeleton className="h-4 w-96 bg-gray-800 mb-8" />
        <div className="grid grid-cols-4 gap-5 mb-8">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-32 bg-gray-800 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 flex items-center gap-3 text-red-400">
        <AlertCircle className="w-5 h-5" />
        <span>Error al cargar estadísticas: {error}</span>
      </div>
    )
  }

  if (!stats) return null

  const formatMXN = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-xs">
            Superadmin
          </Badge>
        </div>
        <p className="text-gray-400 text-sm">
          Vista general de la plataforma ValiAutoFlow
        </p>
      </div>

      {/* ═══ TORRE DE CONTROL: salud de todos los tenants (2026-07-20) ═══ */}
      <HealthTower />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          title="Usuarios Totales"
          value={stats.users.total}
          description={`+${stats.users.newLast7Days} esta semana`}
          icon={Users}
          trend={stats.users.growth}
          color="violet"
        />
        <StatCard
          title="MRR"
          value={formatMXN(stats.revenue.mrr)}
          description={`ARR: ${formatMXN(stats.revenue.arr)}`}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Suscripciones Activas"
          value={stats.subscriptions.paid}
          description={`${stats.subscriptions.trial} en prueba`}
          icon={CreditCard}
          color="blue"
        />
        <StatCard
          title="Workspaces"
          value={stats.workspaces.active}
          description={`${stats.workspaces.inactive} inactivos`}
          icon={Building2}
          color="cyan"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          title="Contactos en Plataforma"
          value={stats.platform.totalContacts}
          description={`${stats.platform.totalConversations.toLocaleString()} conversaciones`}
          icon={MessageSquare}
          color="amber"
        />
        <StatCard
          title="Mensajes Totales"
          value={stats.platform.totalMessages}
          description={`${stats.platform.totalDeals} deals`}
          icon={Activity}
          color="violet"
        />
        <StatCard
          title="Tickets Abiertos"
          value={stats.support.openTickets}
          description={`${stats.support.resolvedTickets} resueltos`}
          icon={LifeBuoy}
          color={stats.support.openTickets > 10 ? 'red' : 'green'}
        />
        <StatCard
          title="Sugerencias"
          value={stats.support.totalSuggestions}
          description={`${stats.support.pendingSuggestions} pendientes`}
          icon={Lightbulb}
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Signup Trend */}
        <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-semibold">Nuevos Registros (últimos 30 días)</CardTitle>
            <CardDescription className="text-gray-500 text-xs">Tendencia de crecimiento de usuarios</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.charts.signupTrend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#signupGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-semibold">Distribución de Planes</CardTitle>
            <CardDescription className="text-gray-500 text-xs">Workspaces por plan activo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={stats.charts.planDistribution.filter(d => d.count > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {stats.charts.planDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {stats.charts.planDistribution.map((p) => (
                <div key={p.plan} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-gray-400 text-xs truncate">{p.label}</span>
                  <span className="text-white text-xs font-semibold ml-auto">{p.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm font-semibold">Estado de Suscripciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Starter', count: stats.subscriptions.starter, color: '#3b82f6', price: 4300 },
                { label: 'Pro', count: stats.subscriptions.pro, color: '#8b5cf6', price: 7800 },
                { label: 'Enterprise', count: stats.subscriptions.enterprise, color: '#10b981', price: 35500 },
                { label: 'Trial activo', count: stats.subscriptions.trial, color: '#f59e0b', price: 0 },
                { label: 'Canceladas', count: stats.subscriptions.cancelled, color: '#ef4444', price: 0 },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-gray-400 text-sm flex-1">{item.label}</span>
                  <span className="text-white text-sm font-semibold">{item.count}</span>
                  {item.price > 0 && (
                    <span className="text-gray-500 text-xs">
                      {formatMXN(item.price * item.count)}/mes
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm font-semibold">Métricas de la Plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Total de contactos en CRM', value: stats.platform.totalContacts.toLocaleString('es-MX'), icon: Users },
                { label: 'Conversaciones activas', value: stats.platform.totalConversations.toLocaleString('es-MX'), icon: MessageSquare },
                { label: 'Mensajes procesados', value: stats.platform.totalMessages.toLocaleString('es-MX'), icon: Activity },
                { label: 'Deals totales', value: stats.platform.totalDeals.toLocaleString('es-MX'), icon: TrendingUp },
                { label: 'Tasa de cierre de deals', value: `${stats.platform.dealWinRate}%`, icon: CheckCircle2 },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-gray-400 text-sm flex-1">{item.label}</span>
                    <span className="text-white text-sm font-semibold">{item.value}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
