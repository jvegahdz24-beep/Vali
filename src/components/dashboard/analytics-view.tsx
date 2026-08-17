'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Bot,
  MessageSquare,
  Target,
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn, formatNumber, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Legend,
} from 'recharts'

// ── Types ──

interface KeyMetricsData {
  totalMessages: number
  responseRate: number
  avgResponseTime: number
  conversionRate: number
}

interface TopContact {
  id: string
  name: string
  leadScore: number
  conversations: number
  lastActivity: string
  channel: string
}

interface ResponseTimeBucket {
  bucket: string
  count: number
  color: string
}

interface AgentWorkloadItem {
  name: string
  messages: number
}

interface AnalyticsData {
  dataType?: 'snapshot' | 'stream'
  realtime?: boolean
  pollingIntervalMs?: number
  generatedAt?: string
  keyMetrics: KeyMetricsData
  previousPeriodKeyMetrics: KeyMetricsData
  messagesOverTime: { date: string; count: number }[]
  channelDistribution: { channel: string; count: number }[]
  dealsByStage: { stage: string; count: number; color: string; value: number }[]
  conversionFunnel: { leads: number; qualified: number; proposals: number; won: number }
  topAgents: { name: string; conversations: number; conversionRate: number }[]
  topContacts: TopContact[]
  responseTimeDistribution: ResponseTimeBucket[]
  agentWorkload: AgentWorkloadItem[]
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

function getScoreBadge(score: number) {
  if (score >= 80) return <Badge className="h-5 text-[10px] px-1.5 bg-emerald-100 text-emerald-700 border-0 font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">{score}</Badge>
  if (score >= 60) return <Badge className="h-5 text-[10px] px-1.5 bg-yellow-100 text-yellow-700 border-0 font-semibold dark:bg-yellow-500/20 dark:text-yellow-400">{score}</Badge>
  if (score >= 40) return <Badge className="h-5 text-[10px] px-1.5 bg-orange-100 text-orange-700 border-0 font-semibold dark:bg-orange-500/20 dark:text-orange-400">{score}</Badge>
  return <Badge className="h-5 text-[10px] px-1.5 bg-red-100 text-red-700 border-0 font-semibold dark:bg-red-500/20 dark:text-red-400">{score}</Badge>
}

function computeChange(current: number, previous: number): { value: number; label: string; icon: React.ReactNode } {
  if (previous === 0 && current === 0) return { value: 0, label: '—', icon: <Minus className="h-3 w-3 text-muted-foreground" /> }
  if (previous === 0) return { value: 100, label: '+100%', icon: <TrendingUp className="h-3 w-3 text-emerald-500" /> }
  const change = ((current - previous) / previous) * 100
  const isPositive = change >= 0
  return {
    value: Math.round(change * 10) / 10,
    label: `${isPositive ? '+' : ''}${change.toFixed(1)}%`,
    icon: isPositive
      ? <TrendingUp className="h-3 w-3 text-emerald-500" />
      : <TrendingDown className="h-3 w-3 text-red-500" />,
  }
}

export function AnalyticsView({ workspaceId }: AnalyticsViewProps) {
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedFunnel, setExpandedFunnel] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async (silent = false) => {
    if (!workspaceId) return
    try {
      if (!silent) setIsLoading(true)
      const res = await fetch(`/api/analytics?workspaceId=${encodeURIComponent(workspaceId)}&period=${period}`)
      if (!res.ok) throw new Error('Error al cargar analíticas')
      const json = await res.json() as AnalyticsData
      setData(json)
    } catch {
      if (!silent) toast.error('Error al cargar analíticas')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [workspaceId, period])

  useEffect(() => {
    void fetchAnalytics()
    const interval = window.setInterval(() => {
      void fetchAnalytics(true)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [fetchAnalytics])

  const exportCSV = useCallback(() => {
    if (!data) return
    try {
      const lines: string[] = []
      // Header
      lines.push('Métricas del Período,Valor')
      lines.push(`Período,${period}`)
      lines.push(`Total Mensajes,${data.keyMetrics.totalMessages}`)
      lines.push(`Tasa Respuesta IA,${(data.keyMetrics.responseRate * 100).toFixed(1)}%`)
      lines.push(`Tiempo Promedio Respuesta,${data.keyMetrics.avgResponseTime} min`)
      lines.push(`Tasa de Cierre,${(data.keyMetrics.conversionRate * 100).toFixed(1)}%`)
      lines.push('')
      lines.push('Embudo de Conversión')
      lines.push('Etapa,Valor')
      lines.push(`Leads,${data.conversionFunnel.leads}`)
      lines.push(`Cualificados,${data.conversionFunnel.qualified}`)
      lines.push(`Con Propuesta,${data.conversionFunnel.proposals}`)
      lines.push(`Cerrados,${data.conversionFunnel.won}`)
      lines.push('')
      lines.push('Distribución por Canal')
      lines.push('Canal,Mensajes')
      data.channelDistribution.forEach(ch => {
        lines.push(`${ch.channel},${ch.count}`)
      })
      lines.push('')
      lines.push('Top Contactos')
      lines.push('Nombre,Lead Score,Conversaciones,Canal')
      data.topContacts.forEach(c => {
        lines.push(`"${c.name}",${c.leadScore},${c.conversations},${c.channel}`)
      })
      lines.push('')
      lines.push('Rendimiento Agentes IA')
      lines.push('Agente,Conversaciones,Tasa Conversión')
      data.topAgents.forEach(a => {
        lines.push(`${a.name},${a.conversations},${(a.conversionRate * 100).toFixed(1)}%`)
      })

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `analiticas-valiautoflow-${period}-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Archivo CSV descargado')
    } catch {
      toast.error('Error al exportar CSV')
    }
  }, [data, period])

  // Compute key metrics from API data with period comparison
  const prev = data?.previousPeriodKeyMetrics
  const keyMetricsData = data ? [
    {
      title: 'Tiempo promedio de respuesta',
      value: data.keyMetrics.avgResponseTime > 0 ? `${data.keyMetrics.avgResponseTime.toFixed(1)} min` : '—',
      description: 'Tiempo de primera respuesta',
      icon: <Clock className="h-4 w-4" />,
      change: prev ? computeChange(data.keyMetrics.avgResponseTime, prev.avgResponseTime) : null,
    },
    {
      title: 'Tasa de respuesta IA',
      value: data.keyMetrics.responseRate > 0 ? `${(data.keyMetrics.responseRate * 100).toFixed(1)}%` : '—',
      description: 'Automatización de conversaciones',
      icon: <Bot className="h-4 w-4" />,
      change: prev ? computeChange(data.keyMetrics.responseRate, prev.responseRate) : null,
    },
    {
      title: 'Mensajes totales',
      value: data.keyMetrics.totalMessages > 0 ? formatNumber(data.keyMetrics.totalMessages) : '0',
      description: 'Mensajes en el período',
      icon: <MessageSquare className="h-4 w-4" />,
      change: prev ? computeChange(data.keyMetrics.totalMessages, prev.totalMessages) : null,
    },
    {
      title: 'Tasa de cierre efectiva',
      value: data.keyMetrics.conversionRate > 0 ? `${(data.keyMetrics.conversionRate * 100).toFixed(1)}%` : '—',
      description: 'Lead a trato cerrado',
      icon: <Target className="h-4 w-4" />,
      change: prev ? computeChange(data.keyMetrics.conversionRate, prev.conversionRate) : null,
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
    { stage: 'Leads totales', value: data.conversionFunnel.leads, percentage: data.conversionFunnel.leads > 0 ? 100 : 0, detail: 'Todos los contactos nuevos capturados' },
    { stage: 'Cualificados', value: data.conversionFunnel.qualified, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.qualified / data.conversionFunnel.leads) * 100) : 0, detail: 'Contactos que cumplen criterios de cualificación' },
    { stage: 'Con propuesta', value: data.conversionFunnel.proposals, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.proposals / data.conversionFunnel.leads) * 100) : 0, detail: 'Contactos que recibieron una propuesta comercial' },
    { stage: 'Cerrados', value: data.conversionFunnel.won, percentage: data.conversionFunnel.leads > 0 ? Math.round((data.conversionFunnel.won / data.conversionFunnel.leads) * 100) : 0, detail: 'Tratos cerrados exitosamente' },
  ] : []

  const tooltipStyle = {
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    fontSize: '12px',
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Analíticas</h3>
            <p className="text-sm text-muted-foreground">
              Métricas y rendimiento del equipo · incluye el Motor de Seguimiento
            </p>
        </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-medium">
              {data?.dataType === 'snapshot' ? `Snapshot · actualización ${Math.round((data.pollingIntervalMs || 30_000) / 1000)} s` : 'Snapshot'}
            </Badge>
            <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              {periodTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={exportCSV}
            disabled={isLoading || !data}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      {/* ═══ Motor de Seguimiento: qué gatillo psicológico revive más leads ═══ */}
      <FollowupEngineCard workspaceId={workspaceId} />

      {/* Key Metrics with Period Comparison */}
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
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    {metric.icon}
                  </div>
                  {metric.change && (
                    <div className="flex items-center gap-1">
                      {metric.change.icon}
                      <span className={cn(
                        'text-[10px] font-semibold',
                        metric.change.value > 0 ? 'text-emerald-600 dark:text-emerald-400' : metric.change.value < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                      )}>
                        {metric.change.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground">vs ant.</span>
                    </div>
                  )}
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
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="outbound" stroke="#10b981" strokeWidth={2} fill="url(#outboundGrad)" name="Enviados" />
                    <Area type="monotone" dataKey="inbound" stroke="#6ee7b7" strokeWidth={2} fill="url(#inboundGrad)" name="Recibidos" />
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
                      <Pie data={channelChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {channelChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}`, 'Mensajes']} />
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
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} width={100} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="cantidad" fill="#10b981" radius={[0, 4, 4, 0]} name="Tratos" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel with Expandable Details */}
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
                    <button
                      className="flex items-center justify-between text-xs w-full"
                      onClick={() => setExpandedFunnel(expandedFunnel === step.stage ? null : step.stage)}
                    >
                      <span className="font-medium text-foreground flex items-center gap-1">
                        {step.stage}
                        {expandedFunnel === step.stage ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </span>
                      <span className="text-muted-foreground">{step.value} ({step.percentage}%)</span>
                    </button>
                    <div className="h-6 bg-muted/50 dark:bg-slate-700/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded transition-all duration-500"
                        style={{
                          width: `${Math.max(step.percentage, 2)}%`,
                          opacity: 1 - index * 0.2,
                        }}
                      />
                    </div>
                    {expandedFunnel === step.stage && (
                      <div className="text-[10px] text-muted-foreground bg-muted/30 dark:bg-slate-800/50 rounded px-2 py-1.5 mt-1">
                        {step.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Response Time Distribution + Agent Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Response Time Distribution */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Tiempo de Respuesta
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="h-[260px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={data?.responseTimeDistribution || []} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}`, 'Mensajes']} />
                    <Bar dataKey="count" name="Mensajes" radius={[4, 4, 0, 0]}>
                      {(data?.responseTimeDistribution || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Workload */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Carga de Trabajo por Agente
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="h-[260px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : !data?.agentWorkload || data.agentWorkload.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de agentes</p>
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={data.agentWorkload} layout="vertical" barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}`, 'Mensajes']} />
                    <Bar dataKey="messages" fill="#10b981" radius={[0, 4, 4, 0]} name="Mensajes" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Contacts */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contactos con Mejor Rendimiento
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : !data?.topContacts || data.topContacts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Sin datos de contactos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-muted-foreground">Contacto</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Lead Score</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right hidden sm:table-cell">Conversaciones</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground hidden md:table-cell">Última Actividad</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground hidden lg:table-cell">Canal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {data.topContacts.map((contact, index) => (
                    <TableRow key={contact.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="h-5 w-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-500/20 dark:text-emerald-400">
                            {index + 1}
                          </Badge>
                          <span className="text-sm font-medium">{contact.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{getScoreBadge(contact.leadScore)}</TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">{contact.conversations}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {timeAgo(new Date(contact.lastActivity))}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="secondary" className="text-[10px] bg-muted border-0">
                          {contact.channel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
                          <Badge variant="secondary" className="h-5 w-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-500/20 dark:text-emerald-400">
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
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : agent.conversionRate >= 0.05
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
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

// ─── MOTOR DE SEGUIMIENTO: tasa de respuesta por gatillo psicológico ───
// (pedido 2026-07-20: "medir qué gatillo revive más leads")
interface FuStat { tipo: string; label: string; enviados: number; respondieron: number; tasa: number }
function FollowupEngineCard({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<{ total: { enviados: number; respondieron: number; tasa: number }; porGatillo: FuStat[]; leadsRevividos: number; days: number } | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/analytics/followups?workspaceId=${workspaceId}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.success && setData(j))
      .catch(() => {})
  }, [workspaceId, days])

  if (!data) return null
  const max = Math.max(1, ...data.porGatillo.map((g) => g.tasa))
  return (
    <Card className="border-violet-500/25">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-500" /> Motor de Seguimiento — qué gatillo revive más leads
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            De cada seguimiento automático enviado, ¿el cliente respondió en los 7 días siguientes?
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {[30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('h-6 px-2 rounded-full text-[10px] font-semibold border',
                days === d ? 'bg-violet-500/15 text-violet-500 border-violet-500/40' : 'border-border text-muted-foreground hover:bg-muted/60')}>
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3">
          <span className="text-sm"><b className="text-lg text-violet-500">{data.total.enviados}</b> <span className="text-xs text-muted-foreground">seguimientos enviados</span></span>
          <span className="text-sm"><b className="text-lg text-emerald-500">{data.total.respondieron}</b> <span className="text-xs text-muted-foreground">obtuvieron respuesta</span></span>
          <span className="text-sm"><b className="text-lg">{data.total.tasa}%</b> <span className="text-xs text-muted-foreground">tasa global</span></span>
          <span className="text-sm"><b className="text-lg text-amber-500">{data.leadsRevividos}</b> <span className="text-xs text-muted-foreground">leads revividos (únicos)</span></span>
        </div>
        {data.porGatillo.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Aún no hay seguimientos enviados en este periodo — la tabla se llena sola conforme el motor trabaje.</p>
        ) : (
          <div className="space-y-1.5">
            {data.porGatillo.map((g) => (
              <div key={g.tipo} className="flex items-center gap-2">
                <span className="w-44 shrink-0 text-xs font-medium truncate">{g.label}</span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                    style={{ width: `${Math.max(3, (g.tasa / max) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground font-mono">{g.tasa}% ({g.respondieron}/{g.enviados})</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">Con 2-3 semanas de datos podrás afinar la escalera: los gatillos con mejor tasa merecen ir más temprano en la secuencia.</p>
      </CardContent>
    </Card>
  )
}
