'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, TrendingUp, Users, CreditCard, MessageSquare, UserCheck } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Stats {
  users: { total: number; newThisMonth: number; newLast7Days: number; growth: number }
  workspaces: { total: number; active: number; inactive: number }
  subscriptions: {
    total: number; trial: number; paid: number;
    starter: number; pro: number; enterprise: number; cancelled: number
  }
  revenue: { mrr: number; arr: number }
  platform: {
    totalContacts: number; totalConversations: number; totalMessages: number
    totalDeals: number; wonDeals: number; dealWinRate: number
  }
  support: {
    openTickets: number; resolvedTickets: number
    totalSuggestions: number; pendingSuggestions: number
  }
  charts: {
    signupTrend: { date: string; count: number }[]
    planDistribution: { plan: string; count: number }[]
  }
}

const PLAN_COLORS: Record<string, string> = {
  enterprise: '#10b981', pro: '#8b5cf6', starter: '#3b82f6', trial: '#f59e0b', free: '#6b7280',
}

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

export default function AdminReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = () => {
    setLoading(true)
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStats() }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-gray-400 text-sm mt-1">Métricas globales de la plataforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {loading || !stats ? (
        <div className="grid grid-cols-1 gap-6">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-72 bg-gray-800 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Crecimiento de usuarios */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white text-sm font-semibold">Crecimiento de Usuarios</CardTitle>
                  <CardDescription className="text-gray-500 text-xs">Registros de los últimos 30 días</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Total</p>
                    <p className="text-white font-bold">{stats.users.total.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Este mes</p>
                    <p className="text-emerald-400 font-bold">+{stats.users.newThisMonth}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Crecimiento</p>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {stats.users.growth}%
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.charts.signupTrend}>
                  <defs>
                    <linearGradient id="repGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="count" stroke="#7c3aed" fill="url(#repGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribución de planes */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold">Distribución de Planes</CardTitle>
                <CardDescription className="text-gray-500 text-xs">Workspaces por tipo de plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie
                        data={stats.charts.planDistribution}
                        dataKey="count"
                        nameKey="plan"
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
                        paddingAngle={3}
                      >
                        {stats.charts.planDistribution.map(entry => (
                          <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {stats.charts.planDistribution.map(item => (
                      <div key={item.plan} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: PLAN_COLORS[item.plan] || '#6b7280' }} />
                          <span className="text-gray-300 text-sm capitalize">{item.plan}</span>
                        </div>
                        <span className="text-white text-sm font-semibold">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Engagement métricas */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold">Engagement de Plataforma</CardTitle>
                <CardDescription className="text-gray-500 text-xs">Actividad acumulada de todos los workspaces</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={[
                      { name: 'Contactos', value: stats.platform.totalContacts },
                      { name: 'Conv.', value: stats.platform.totalConversations },
                      { name: 'Mensajes', value: stats.platform.totalMessages },
                      { name: 'Deals', value: stats.platform.totalDeals },
                      { name: 'Ganados', value: stats.platform.wonDeals },
                    ]}
                    margin={{ top: 5, right: 5, bottom: 5, left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Resumen tabular */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Usuarios */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" /> Usuarios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Total registrados', value: stats.users.total },
                  { label: 'Nuevos este mes', value: stats.users.newThisMonth },
                  { label: 'Nuevos últimos 7 días', value: stats.users.newLast7Days },
                  { label: 'Crecimiento mensual', value: `${stats.users.growth}%` },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                    <span className="text-gray-400 text-sm">{row.label}</span>
                    <span className="text-white text-sm font-semibold">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Ingresos */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" /> Ingresos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'MRR', value: formatMXN(stats.revenue.mrr) },
                  { label: 'ARR', value: formatMXN(stats.revenue.arr) },
                  { label: 'Suscripciones pagadas', value: stats.subscriptions.paid },
                  { label: 'Suscripciones canceladas', value: stats.subscriptions.cancelled },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                    <span className="text-gray-400 text-sm">{row.label}</span>
                    <span className="text-white text-sm font-semibold">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Soporte */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" /> Soporte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Tickets abiertos', value: stats.support.openTickets },
                  { label: 'Tickets resueltos', value: stats.support.resolvedTickets },
                  { label: 'Total sugerencias', value: stats.support.totalSuggestions },
                  { label: 'Sugerencias pendientes', value: stats.support.pendingSuggestions },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                    <span className="text-gray-400 text-sm">{row.label}</span>
                    <span className="text-white text-sm font-semibold">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
