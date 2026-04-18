'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Bot,
  MessageSquare,
  Target,
  Loader2,
} from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Types ──

interface KeyMetricsData {
  totalMessages: number
  responseRate: number
  avgResponseTime: number
  conversionRate: number
}

interface AnalyticsData {
  keyMetrics: KeyMetricsData
  messagesOverTime: { date: string; count: number }[]
  channelDistribution: { channel: string; count: number }[]
  dealsByStage: { stage: string; count: number }[]
  conversionFunnel: { leads: number; qualified: number; proposals: number; won: number }
  topAgents: { name: string; conversations: number; conversionRate: number }[]
}

const periodTabs = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
]

const channelColors: Record<string, string> = {
  whatsapp: '#25D366',
  instagram: '#E4405F',
  webchat: '#6366f1',
  telegram: '#0088cc',
  web_chat: '#6366f1',
}

const stageColors: Record<string, string> = {
  lead: '#94a3b8',
  contacted: '#60a5fa',
  qualified: '#fbbf24',
  proposal: '#f97316',
  negotiation: '#ef4444',
  won: '#22c55e',
  lost: '#ef4444',
}

const stageLabels: Record<string, string> = {
  lead: 'Lead Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  won: 'Ganado',
  lost: 'Perdido',
}

interface AnalyticsViewProps {
  workspaceId: string
}

export function AnalyticsView({ workspaceId }: AnalyticsViewProps) {
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchAnalytics = useCallback(async () => {
    if (!workspaceId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/analytics?workspaceId=${workspaceId}&period=${period}`)
      if (!res.ok) throw new Error('Error al cargar analíticas')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Error al cargar analíticas')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, period])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Compute key metrics from API data
  const keyMetricsData = data ? [
    {
      title: 'Tiempo promedio de respuesta',
      value: data.keyMetrics.avgResponseTime > 0 ? `${data.keyMetrics.avgResponseTime.toFixed(1)} min` : '—',
      change: 'IA vs humano promedio',
      trend: 'up' as const,
      icon: <Clock className="h-4 w-4" />,
      description: 'Tiempo de primera respuesta',
    },
    {
      title: 'Tasa de respuesta',
      value: data.keyMetrics.responseRate > 0 ? `${(data.keyMetrics.responseRate * 100).toFixed(1)}%` : '—',
      change: 'De conversaciones atendidas',
      trend: 'up' as const,
      icon: <Bot className="h-4 w-4" />,
      description: 'Automatización de conversaciones',
    },
    {
      title: 'Mensajes totales',
      value: data.keyMetrics.totalMessages > 0 ? formatNumber(data.keyMetrics.totalMessages) : '0',
      change: `Período: ${period}`,
      trend: 'up' as const,
      icon: <MessageSquare className="h-4 w-4" />,
      description: 'Mensajes en el período',
    },
    {
      title: 'Tasa de cierre efectiva',
      value: data.keyMetrics.conversionRate > 0 ? `${(data.keyMetrics.conversionRate * 100).toFixed(1)}%` : '—',
      change: 'Lead a trato cerrado',
      trend: 'up' as const,
      icon: <Target className="h-4 w-4" />,
      description: 'Conversión general',
    },
  ] : []

  // Map messagesOverTime to chart format
  const messagesChartData = (data?.messagesOverTime || []).map((m) => ({
    date: new Date(m.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
    outbound: Math.ceil(m.count * 0.6),
    inbound: Math.floor(m.count * 0.4),
  }))

  // Map channel distribution to chart format
  const channelChartData = (data?.channelDistribution || []).map((ch) => ({
    name: ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1),
    value: ch.count,
    color: channelColors[ch.channel] || '#6b7280',
  }))
  const channelTotal = channelChartData.reduce((s, c) => s + c.value, 0)

  // Map deals by stage to chart format
  const dealsChartData = (data?.dealsByStage || []).map((d) => ({
    stage: stageLabels[d.stage] || d.stage,
    cantidad: d.count,
  }))

  // Map conversion funnel to display format
  const funnelData = data?.conversionFunnel ? [
    { stage: 'Leads totales', value: data.conversionFunnel.leads, percentage: data.conversionFunnel.leads > 0 ? 100 : 0 },
    { stage: 'Cualificados', value: data.conversionFunnel.qualified, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.qualified / data.conversionFunnel.leads) * 100) : 0 },
    { stage: 'Con propuesta', value: data.conversionFunnel.proposals, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.proposals / data.conversionFunnel.leads) * 100) : 0 },
    { stage: 'Cerrados', value: data.conversionFunnel.won, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.won / data.conversionFunnel.leads) * 100) : 0 },
  ] : []

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Analíticas</h3>
          <p className="text-sm text-muted-foreground">
            Métricas y rendimiento del equipo
          </p>
        </div>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            {periodTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Key Metrics */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-6 w-20 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {keyMetricsData.map((metric) => (
            <Card key={metric.title} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    {metric.icon}
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

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Messages Over Time */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Mensajes en el tiempo
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : messagesChartData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de mensajes en este período</p>
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={messagesChartData}>
                    <defs>
                      <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="outbound"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#outboundGrad)"
                      name="Enviados"
                    />
                    <Area
                      type="monotone"
                      dataKey="inbound"
                      stroke="#6ee7b7"
                      strokeWidth={2}
                      fill="url(#inboundGrad)"
                      name="Recibidos"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Distribución por Canal
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : channelChartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de canales</p>
              </div>
            ) : (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {channelChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value}`, 'Mensajes']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {channelChartData.map((ch) => (
                    <div key={ch.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                        <span className="text-muted-foreground">{ch.name}</span>
                      </div>
                      <span className="font-semibold">{channelTotal > 0 ? Math.round((ch.value / channelTotal) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Deals by Stage */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Tratos por Etapa
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : dealsChartData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de tratos en este período</p>
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={dealsChartData} layout="vertical" barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <YAxis
                      dataKey="stage"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="cantidad" fill="#10b981" radius={[0, 4, 4, 0]} name="Tratos" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Embudo de Conversión
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-6 w-full rounded" />
                  </div>
                ))}
              </div>
            ) : funnelData.every((s) => s.value === 0) ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de conversión</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {funnelData.map((step, index) => (
                  <div key={step.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{step.stage}</span>
                      <span className="text-muted-foreground">{step.value} ({step.percentage}%)</span>
                    </div>
                    <div className="h-6 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded transition-all duration-500"
                        style={{
                          width: `${Math.max(step.percentage, 2)}%`,
                          opacity: 1 - index * 0.2,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Agents Table */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Rendimiento de Agentes IA
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : !data?.topAgents || data.topAgents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Sin datos de agentes en este período</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left text-xs font-semibold text-muted-foreground pb-3 pr-4">Agente</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground pb-3 pr-4">Conversaciones</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground pb-3">Tasa Conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.topAgents.map((agent, index) => (
                    <tr key={agent.name} className="hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="h-5 w-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-emerald-100 text-emerald-700 border-0"
                          >
                            {index + 1}
                          </Badge>
                          <span className="text-sm font-medium">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right text-sm">{agent.conversations}</td>
                      <td className="py-3 text-right">
                        <Badge className={cn(
                          'h-5 text-[10px] px-1.5 border-0 font-semibold',
                          agent.conversionRate >= 0.1
                            ? 'bg-emerald-100 text-emerald-700'
                            : agent.conversionRate >= 0.05
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-orange-100 text-orange-700'
                        )}>
                          {(agent.conversionRate * 100).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
