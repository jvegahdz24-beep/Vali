'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, DollarSign, Users, ArrowUpRight, RefreshCw,
  BarChart2, Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'

interface RevenueData {
  summary: {
    mrr: number
    arr: number
    totalPaidAccounts: number
    cancelledLast30Days: number
    conversionRate: number
    averageRevenue: number
  }
  revenueByPlan: { plan: string; price: number; count: number; revenue: number }[]
  monthlyRevenue: { month: string; revenue: number; newSubs: number }[]
}

const planColors: Record<string, string> = {
  Starter: '#3b82f6',
  Pro: '#8b5cf6',
  Enterprise: '#10b981',
}

const formatMXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

function KpiCard({
  title, value, subtitle, icon: Icon, color = 'text-violet-400',
}: {
  title: string; value: string; subtitle?: string; icon: React.ElementType; color?: string
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
            <p className="text-white text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-lg bg-gray-800 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs space-y-1">
        <p className="text-gray-400 font-medium">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-white">
            {p.dataKey === 'revenue' ? formatMXN(p.value) : `${p.value} suscripciones`}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchRevenue = () => {
    setLoading(true)
    fetch('/api/admin/revenue')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRevenue() }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Ingresos</h1>
          <p className="text-gray-400 text-sm mt-1">Análisis financiero de la plataforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRevenue} className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 bg-gray-800 rounded-xl" />)}
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            <KpiCard
              title="MRR (Ingresos Mensuales)"
              value={formatMXN(data.summary.mrr)}
              subtitle="Suscripciones activas este mes"
              icon={TrendingUp}
              color="text-emerald-400"
            />
            <KpiCard
              title="ARR (Ingresos Anuales)"
              value={formatMXN(data.summary.arr)}
              subtitle={`Proyección: ${formatMXN(data.summary.arr)}`}
              icon={BarChart2}
              color="text-violet-400"
            />
            <KpiCard
              title="Cuentas Pagadas"
              value={String(data.summary.totalPaidAccounts)}
              subtitle="Suscripciones activas (no free/trial)"
              icon={Users}
              color="text-blue-400"
            />
            <KpiCard
              title="Ingreso Promedio"
              value={formatMXN(data.summary.averageRevenue)}
              subtitle="Por cuenta pagada (ARPU)"
              icon={DollarSign}
              color="text-amber-400"
            />
            <KpiCard
              title="Tasa de Conversión"
              value={`${data.summary.conversionRate}%`}
              subtitle="Trial → Plan pagado"
              icon={Target}
              color="text-cyan-400"
            />
            <KpiCard
              title="Cancelaciones (30 días)"
              value={String(data.summary.cancelledLast30Days)}
              subtitle="Suscripciones canceladas"
              icon={ArrowUpRight}
              color="text-red-400"
            />
          </div>

          {/* Revenue by Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold">Ingresos por Plan</CardTitle>
                <CardDescription className="text-gray-500 text-xs">Distribución de MRR por tipo de plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.revenueByPlan.map(item => {
                    const totalRevenue = data.revenueByPlan.reduce((s, i) => s + i.revenue, 0)
                    const pct = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0
                    return (
                      <div key={item.plan}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ background: planColors[item.plan] || '#6b7280' }}
                            />
                            <span className="text-gray-300 text-sm font-medium">{item.plan}</span>
                            <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-xs px-1.5 py-0">
                              {item.count} cuentas
                            </Badge>
                          </div>
                          <span className="text-white text-sm font-semibold">{formatMXN(item.revenue)}/mes</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: planColors[item.plan] || '#6b7280',
                            }}
                          />
                        </div>
                        <p className="text-gray-600 text-xs mt-1">
                          {Math.round(pct)}% del MRR · {formatMXN(item.price)}/cuenta
                        </p>
                      </div>
                    )
                  })}
                  {data.revenueByPlan.every(p => p.count === 0) && (
                    <p className="text-gray-500 text-sm text-center py-4">No hay suscripciones pagadas aún</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Monthly New Subs */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-sm font-semibold">Nuevas Suscripciones (12 meses)</CardTitle>
                <CardDescription className="text-gray-500 text-xs">Suscripciones pagadas activadas por mes</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.monthlyRevenue} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar dataKey="newSubs" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Nuevas subs" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Revenue Line Chart */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm font-semibold">Tendencia de Ingresos (12 meses)</CardTitle>
              <CardDescription className="text-gray-500 text-xs">Ingresos generados por nuevas suscripciones por mes</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.monthlyRevenue} margin={{ top: 5, right: 10, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ fill: '#10b981', r: 3 }}
                    name="Ingresos MXN"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
