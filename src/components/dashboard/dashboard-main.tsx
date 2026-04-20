'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  MessageCircle,
  DollarSign,
 TrendingUp,
  Bot,
  Wifi,
  Loader2,
  ArrowUpRight,
 Phone,
 BarChart3,
} from 'lucide-react'
import { cn, formatCurrency, timeAgo, getInitials, getChannelIcon } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'

interface DashboardStats {
  totalContacts: number
  activeConversations: number
  dealsWon: number
  dealsLost: number
  openDeals: number
  totalRevenue: number
  pipelineValue: number
  conversionRate: number
  messagesToday: number
  aiMessagesSent: number
  activeAgents: number
  stages: Array<{
    name: string
    color: string
    dealCount: number
    totalValue: number
    probability: number
    weightedValue: number
  }>
  recentContacts: Array<{
    id: string
    firstName: string
    lastName: string
    leadScore: number
    source: string
    lastMessageAt: string
    createdAt: string
  }>
  recentConversations: Array<{
    id: string
    contact: {
      id: string
      firstName: string
      lastName: string
      avatar: string | null
      leadScore: number
    }
    lastMessageAt: string
    channel: string
  }>
}

interface AnalyticsData {
  summary: {
    period: string
    totalMessages: number
    aiMessages: number
    avgConfidence: number
    totalLeads: number
    dealsWon: number
    conversionRate: number
  }
  messagesOverTime: Array<{ date: string; value: number }>
  dealsByStage: Array<{ stage: string; color: string; count: number; value: number }>
  conversionFunnel: Array<{ stage: string; count: number }>
  topAgents: Array<{ id: string; name: string; type: string; messageCount: number }>
  channelDistribution: Array<{ channel: string; count: number }>
}

interface DashboardMainProps {
  workspaceId: string
  onViewChange?: (view: string) => void
}

// Fallback chart data
const fallbackWeeklyMessages = [
  { day: 'Lun', mensajes: 0, entregados: 0 },
  { day: 'Mar', mensajes: 0, entregados: 0 },
  { day: 'Mié', mensajes: 0, entregados: 0 },
  { day: 'Jue', mensajes: 0, entregados: 0 },
  { day: 'Vie', mensajes: 0, entregados: 0 },
  { day: 'Sáb', mensajes: 0, entregados: 0 },
  { day: 'Dom', mensajes: 0, entregados: 0 },
]

const fallbackRevenueData = [
  { month: 'Jul', ingresos: 0 },
  { month: 'Ago', ingresos: 0 },
  { month: 'Sep', ingresos: 0 },
  { month: 'Oct', ingresos: 0 },
  { month: 'Nov', ingresos: 0 },
  { month: 'Dic', ingresos: 0 },
]

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return days[date.getDay()]
}

function formatMonthLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return months[date.getMonth()]
}

export function DashboardMain({ workspaceId, onViewChange }: DashboardMainProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [period, setPeriod] = useState('7d')

  useEffect(() => {
    if (!workspaceId) return

    async function fetchStats() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/dashboard/stats?workspaceId=${workspaceId}`)
        if (!res.ok) throw new Error('Error al cargar estadísticas')
        const data = await res.json()
        setStats(data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        setError(message)
        toast.error('Error al cargar estadísticas')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return

    async function fetchAnalytics() {
      try {
        setAnalyticsLoading(true)
        const res = await fetch(`/api/analytics?workspaceId=${workspaceId}&period=${period}`)
        if (!res.ok) throw new Error('Error al cargar analíticas')
        const data = await res.json()
        setAnalytics(data)
      } catch {
        setAnalytics(null)
      } finally {
        setAnalyticsLoading(false)
      }
    }

    fetchAnalytics()
  }, [workspaceId, period])

  // Build chart data from analytics
  const messagesChartData = (() => {
    if (!analytics?.messagesOverTime || analytics.messagesOverTime.length === 0) {
      return fallbackWeeklyMessages
    }

    // Group by day of week for weekly view, or show daily for longer periods
    if (period === '7d') {
      // Group by day of week
      const dayMap: Record<string, { total: number; count: number }> = {}
      for (const item of analytics.messagesOverTime) {
        const dayLabel = formatDayLabel(item.date)
        if (!dayMap[dayLabel]) dayMap[dayLabel] = { total: 0, count: 0 }
        dayMap[dayLabel].total += item.value
        dayMap[dayLabel].count += 1
      }
      return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => ({
        day,
        mensajes: dayMap[day] ? Math.round(dayMap[day].total / dayMap[day].count) : 0,
        entregados: dayMap[day] ? Math.round((dayMap[day].total / dayMap[day].count) * 0.9) : 0,
      }))
    } else if (period === '30d') {
      // Group by week
      const weeklyData: Array<{ day: string; mensajes: number; entregados: number }> = []
      for (let i = 0; i < analytics.messagesOverTime.length; i += 7) {
        const chunk = analytics.messagesOverTime.slice(i, i + 7)
        const total = chunk.reduce((s, c) => s + c.value, 0)
        const dayLabel = formatDayLabel(chunk[0]?.date || '')
        weeklyData.push({
          day: `Sem ${Math.floor(i / 7) + 1}`,
          mensajes: total,
          entregados: Math.round(total * 0.9),
        })
      }
      return weeklyData.length > 0 ? weeklyData : fallbackWeeklyMessages
    } else {
      // 90d — group by month
      const monthMap: Record<string, number> = {}
      for (const item of analytics.messagesOverTime) {
        const monthLabel = formatMonthLabel(item.date)
        monthMap[monthLabel] = (monthMap[monthLabel] || 0) + item.value
      }
      return Object.entries(monthMap).map(([month, mensajes]) => ({
        day: month,
        mensajes,
        entregados: Math.round(mensajes * 0.9),
      }))
    }
  })()

  const revenueChartData = (() => {
    // Use deals by stage data to estimate revenue, or fallback
    if (!analytics?.dealsByStage || analytics.dealsByStage.length === 0) {
      // If we have some revenue from stats, show a single honest data point
      if (stats?.totalRevenue && stats.totalRevenue > 0) {
        return [
          { month: 'Total', ingresos: stats.totalRevenue },
        ]
      }
      return fallbackRevenueData
    }

    // Use deals by stage value data as revenue indicators
    return analytics.dealsByStage.map((stage) => ({
      month: stage.stage.slice(0, 8),
      ingresos: stage.value,
    }))
  })()

  const statsCards = stats
    ? [
        {
          title: 'Total Contactos',
          value: stats.totalContacts.toString(),
          change: null,
          icon: <Users className="h-4 w-4" />,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          borderClass: 'stat-border-emerald',
        },
        {
          title: 'Conversaciones Activas',
          value: stats.activeConversations.toString(),
          change: null,
          icon: <MessageCircle className="h-4 w-4" />,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          borderClass: 'stat-border-emerald',
        },
        {
          title: 'Tratos Ganados',
          value: formatCurrency(stats.totalRevenue),
          change: `${stats.dealsWon} cerrados`,
          icon: <DollarSign className="h-4 w-4" />,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          borderClass: 'stat-border-emerald',
        },
        {
          title: 'Tasa de Conversión',
          value: `${stats.conversionRate}%`,
          change: `${stats.openDeals} activos`,
          icon: <TrendingUp className="h-4 w-4" />,
          color: stats.conversionRate >= 30 ? 'text-emerald-600' : 'text-orange-600',
          bg: stats.conversionRate >= 30 ? 'bg-emerald-50' : 'bg-orange-50',
          borderClass: stats.conversionRate >= 30 ? 'stat-border-emerald' : 'stat-border-amber',
        },
      ]
    : []

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        {/* Loading Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-7 w-24 mt-3" />
                <Skeleton className="h-3 w-32 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <Card className="lg:col-span-2 border-border/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-[260px] w-full" />
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-[260px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <Card className="border-border/60">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Connected to Real Data Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-6 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
            <Wifi className="h-3 w-3" />
            Conectado a datos reales
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {stats?.aiMessagesSent || 0} mensajes IA · {stats?.activeAgents || 0} agentes activos
          </span>
        </div>
        <Badge variant="secondary" className="h-6 text-[10px] gap-1">
          <Bot className="h-3 w-3 text-emerald-500" />
          {stats?.messagesToday || 0} mensajes hoy
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {statsCards.map((stat) => (
          <Card key={stat.title} className={cn('premium-card group card-hover', stat.borderClass)}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className={cn('p-2.5 rounded-xl transition-transform duration-200 group-hover:scale-110', stat.bg)}>
                  <span className={stat.color}>{stat.icon}</span>
                </div>
                {stat.change && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {stat.change}
                  </span>
                )}
              </div>
              <div className="mt-3 animate-count-up">
                <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Nuevo Contacto', icon: <Users className="h-4 w-4" />, onClick: () => onViewChange?.('contacts'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
          { label: 'Conectar WhatsApp', icon: <Phone className="h-4 w-4" />, onClick: () => onViewChange?.('settings'), color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
          { label: 'Ver Analíticas', icon: <BarChart3 className="h-4 w-4" />, onClick: () => onViewChange?.('analytics'), color: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all duration-150 hover:shadow-sm',
              action.color
            )}
          >
            <span>{action.icon}</span>
            {action.label}
            <ArrowUpRight className="h-4 w-4 ml-auto opacity-40" />
          </button>
        ))}
      </div>

      {/* Charts + Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Messages Chart */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Mensajes por día</CardTitle>
              {analyticsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px]">
              {analyticsLoading && !analytics ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={messagesChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="mensajes"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      name="Enviados"
                    />
                    <Bar
                      dataKey="entregados"
                      fill="#6ee7b7"
                      radius={[4, 4, 0, 0]}
                      name="Estimados entregados"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed - Timeline */}
        <Card className="premium-card-static">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[260px] pr-3 premium-scrollbar">
              <div className="relative space-y-0">
                {stats?.recentConversations && stats.recentConversations.length > 0
                  ? stats.recentConversations.map((conv, index) => (
                      <div
                        key={conv.id}
                        className="flex items-start gap-3 pl-4 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                      >
                        <div className="relative flex flex-col items-center">
                          <div className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background',
                            index === 0 ? 'bg-emerald-500 ring-emerald-100' : 'bg-zinc-300 ring-zinc-100'
                          )} />
                          {index < (stats.recentConversations?.length || 0) - 1 && (
                            <div className="w-px flex-1 bg-border/40 mt-1" />
                          )}
                        </div>
                        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px] font-semibold">
                            {getInitials(conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : '??')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate group-hover:text-emerald-600 transition-colors">
                              {conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : 'Sin contacto'}
                            </span>
                            <span className="text-xs">{getChannelIcon(conv.channel)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {timeAgo(new Date(conv.lastMessageAt))}
                          </p>
                        </div>
                      </div>
                    ))
                  : <p className="text-xs text-muted-foreground text-center py-8">Sin actividad reciente</p>
                }
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Pipeline Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Ingresos por Tratos</CardTitle>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-7 w-[100px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 días</SelectItem>
                  <SelectItem value="30d">30 días</SelectItem>
                  <SelectItem value="90d">90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[240px]">
              {analyticsLoading && !analytics ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : revenueChartData.every((d) => d.ingresos === 0) ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Sin datos suficientes</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                      tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Ingresos']}
                    />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#revenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Summary - Real Data */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Pipeline Resumen
              <Badge variant="secondary" className="h-5 text-[9px] bg-emerald-50 text-emerald-600 border-0">
                {stats?.pipelineValue ? formatCurrency(stats.pipelineValue) : '$0'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[240px] pr-2">
              <div className="space-y-2.5">
                {stats?.stages && stats.stages.length > 0
                  ? stats.stages.map((stage) => (
                      <div
                        key={stage.name}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: stage.color || '#94a3b8' }}
                          />
                          <div>
                            <p className="text-xs font-medium text-foreground">{stage.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {stage.dealCount} trato{stage.dealCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        {stage.totalValue > 0 && (
                          <span className="text-xs font-semibold text-foreground">
                            {formatCurrency(stage.totalValue)}
                          </span>
                        )}
                      </div>
                    ))
                  : <p className="text-xs text-muted-foreground text-center py-4">Sin datos de pipeline</p>
                }
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
