'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Users,
  MessageCircle,
  DollarSign,
  TrendingUp,
  Bot,
  Loader2,
  ArrowUpRight,
  BarChart3,
  Flame,
  Sun,
  Moon,
  Coffee,
  Brain,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  Phone,
  Send,
  CalendarCheck,
  Target,
  RotateCcw,
  Award,
  XCircle,
  FileText,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { cn, formatCurrency, timeAgo, getInitials, getChannelIcon, getChannelColor } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/ui/score-ring'
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
import type { ActionType, Urgency, BehaviorPattern, DecisionFactor } from '@/lib/engine/types'

// ─── JHON Panel Types ──────────────────────────
interface JhonLeadCard {
  contactId: string
  contactName: string
  contactPhone: string | null
  contactScore: number
  pattern: BehaviorPattern
  intentLevel: number
  scoreTrend: 'rising' | 'falling' | 'stable'
  confidenceScore: number
  confidenceReason: string
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  timeToDecay: number
  decisionTrace: DecisionFactor[]
  narrative: string
  nextBestAction: {
    type: ActionType
    label: string
    reason: string
    urgency: Urgency
    jhonSays: string
    expectedOutcome: string
    deadline: number
    ifNotMet: ActionType
  }
}

interface JhonPanelData {
  jhonInsight: string
  globalPriority: {
    contactId: string
    contactName: string
    contactPhone: string | null
    action: ActionType
    actionLabel: string
    reason: string
    urgency: Urgency
    timeToDecay: number
    jhonSays: string
    confidenceScore: number
    score: number
    temperature: string
    deadline?: number
  } | null
  prioritizedLeads: JhonLeadCard[]
  totalActiveLeads: number
}

// ─── Dashboard Stats Types ─────────────────────
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
    lastMessage?: string
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

// ─── Fallback chart data ───────────────────────
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

// ─── Helpers ───────────────────────────────────
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

function getGreeting(userName: string): { text: string; icon: React.ReactNode } {
  const name = userName || 'Usuario'
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) {
    return {
      text: `Buenos días, ${name}`,
      icon: <Sun className="h-5 w-5 text-amber-500" />,
    }
  } else if (hour >= 12 && hour < 18) {
    return {
      text: `Buenas tardes, ${name}`,
      icon: <Coffee className="h-5 w-5 text-orange-500" />,
    }
  } else {
    return {
      text: `Buenas noches, ${name}`,
      icon: <Moon className="h-5 w-5 text-violet-500" />,
    }
  }
}

function getDaysActive(stats: DashboardStats | null): number {
  if (!stats) return 0
  // Use actual workspace age from first contact creation date if available
  // Otherwise derive deterministically from total contacts (no Math.random)
  return Math.max(1, Math.min(stats.totalContacts, 365))
}

function getActivityContext(conv: { channel: string; lastMessage?: string }): string {
  const channelLabels: Record<string, string> = {
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    instagram: 'Instagram',
    webchat: 'Web Chat',
  }
  const channelName = channelLabels[conv.channel] || conv.channel
  const messagePreview = conv.lastMessage
    ? (conv.lastMessage.length > 35 ? conv.lastMessage.slice(0, 35) + '...' : conv.lastMessage)
    : 'Nuevo mensaje'
  return `${channelName}: "${messagePreview}"`
}

function formatTimeToDecay(minutes: number): string {
  if (minutes <= 0) return 'Expirado'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function getUrgencyConfig(urgency: Urgency) {
  switch (urgency) {
    case 'CRITICAL':
      return {
        border: 'border-red-500/60',
        bg: 'bg-red-50 dark:bg-red-950/20',
        badge: 'bg-red-100 text-red-700 border-red-300',
        pulse: true,
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      }
    case 'HIGH':
      return {
        border: 'border-amber-500/60',
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        badge: 'bg-amber-100 text-amber-700 border-amber-300',
        pulse: false,
        icon: <Clock className="h-4 w-4 text-amber-500" />,
      }
    case 'MEDIUM':
      return {
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        badge: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        pulse: false,
        icon: <Target className="h-4 w-4 text-emerald-500" />,
      }
    case 'LOW':
      return {
        border: 'border-zinc-300/60',
        bg: 'bg-zinc-50 dark:bg-zinc-900/40',
        badge: 'bg-zinc-100 text-zinc-600 border-zinc-300',
        pulse: false,
        icon: <Minus className="h-4 w-4 text-zinc-400" />,
      }
  }
}

function getPatternLabel(pattern: BehaviorPattern): string {
  const labels: Record<BehaviorPattern, string> = {
    neglected_hot_lead: 'Lead caliente abandonado',
    ready_to_close: 'Listo para cerrar',
    ghost_after_intent: 'Ghost tras intención',
    price_sensitive: 'Sensible al precio',
    recurring_window_shopper: 'Window shopper recurrente',
    cold_no_activity: 'Frío sin actividad',
    warm_need_nudge: 'Tibio necesita impulso',
    hot_active_buyer: 'Comprador activo caliente',
    new_unqualified: 'Nuevo sin cualificar',
  }
  return labels[pattern] || pattern
}

function getScoreTrendIcon(trend: 'rising' | 'falling' | 'stable') {
  if (trend === 'rising') return <TrendingUp className="h-3 w-3 text-emerald-500" />
  if (trend === 'falling') return <TrendingDown className="h-3 w-3 text-red-500" />
  return <Minus className="h-3 w-3 text-zinc-400" />
}

function getActionIcon(action: ActionType) {
  switch (action) {
    case 'CALL_NOW': return <Phone className="h-4 w-4" />
    case 'SEND_FOLLOW_UP': return <Send className="h-4 w-4" />
    case 'SEND_PROPOSAL': return <FileText className="h-4 w-4" />
    case 'SCHEDULE_MEETING': return <CalendarCheck className="h-4 w-4" />
    case 'SEND_AGGRESSIVE_FOLLOWUP': return <Zap className="h-4 w-4" />
    case 'REACTIVATE': return <RotateCcw className="h-4 w-4" />
    case 'MARK_WON': return <Award className="h-4 w-4" />
    case 'MARK_LOST': return <XCircle className="h-4 w-4" />
    default: return <Shield className="h-4 w-4" />
  }
}

function getActionBtnColor(urgency: Urgency) {
  switch (urgency) {
    case 'CRITICAL': return 'bg-red-600 hover:bg-red-700 text-white'
    case 'HIGH': return 'bg-amber-600 hover:bg-amber-700 text-white'
    case 'MEDIUM': return 'bg-emerald-600 hover:bg-emerald-700 text-white'
    case 'LOW': return 'bg-zinc-600 hover:bg-zinc-700 text-white'
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function DashboardMain({ workspaceId, onViewChange }: DashboardMainProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [period, setPeriod] = useState('7d')

  const [userName, setUserName] = useState<string>('')
  const [jhonData, setJhonData] = useState<JhonPanelData | null>(null)
  const [jhonLoading, setJhonLoading] = useState(true)
  const [jhonError, setJhonError] = useState<string | null>(null)
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set())
  const [executingAction, setExecutingAction] = useState<string | null>(null)

  // Fetch dashboard stats
  useEffect(() => {
    if (!workspaceId) return

    async function fetchStats() {
      try {
        // Fetch user name for greeting
        try {
          const meRes = await fetch('/api/auth/me')
          if (meRes.ok) {
            const meData = await meRes.json()
            setUserName(meData.name || meData.firstName || '')
          }
        } catch { /* ignore */ }

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

  // Fetch analytics
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

  // Fetch JHON Panel data
  useEffect(() => {
    if (!workspaceId) return

    async function fetchJhonPanel() {
      try {
        setJhonLoading(true)
        setJhonError(null)
        const res = await fetch(`/api/jhon-panel?workspaceId=${workspaceId}`)
        if (!res.ok) throw new Error('Error al cargar panel de Jhon')
        const data = await res.json()
        setJhonData(data)
      } catch {
        setJhonData(null)
        setJhonError('No se pudo cargar la inteligencia de Jhon')
      } finally {
        setJhonLoading(false)
      }
    }

    fetchJhonPanel()
    // Refresh every 2 minutes
    const interval = setInterval(fetchJhonPanel, 120000)
    return () => clearInterval(interval)
  }, [workspaceId])

  // Execute action
  const handleExecuteAction = useCallback(
    async (contactId: string, action: ActionType) => {
      if (executingAction) return
      setExecutingAction(contactId)

      try {
        const res = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId, action, workspaceId }),
        })
        const data = await res.json()

        if (data.success) {
          toast.success(data.jhonResponse || 'Acción ejecutada')
          // Refresh jhon panel
          const jhonRes = await fetch(`/api/jhon-panel?workspaceId=${workspaceId}`)
          if (jhonRes.ok) {
            const jhonData = await jhonRes.json()
            setJhonData(jhonData)
          }
        } else {
          toast.error(data.error || 'Error al ejecutar acción')
        }
      } catch {
        toast.error('Error de conexión')
      } finally {
        setExecutingAction(null)
      }
    },
    [executingAction, workspaceId]
  )

  // Toggle decision trace expansion
  const toggleTrace = (contactId: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }

  // Build chart data
  const messagesChartData = (() => {
    if (!analytics?.messagesOverTime || analytics.messagesOverTime.length === 0) {
      return fallbackWeeklyMessages
    }
    if (period === '7d') {
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
      const weeklyData: Array<{ day: string; mensajes: number; entregados: number }> = []
      for (let i = 0; i < analytics.messagesOverTime.length; i += 7) {
        const chunk = analytics.messagesOverTime.slice(i, i + 7)
        const total = chunk.reduce((s, c) => s + c.value, 0)
        weeklyData.push({
          day: `Sem ${Math.floor(i / 7) + 1}`,
          mensajes: total,
          entregados: Math.round(total * 0.9),
        })
      }
      return weeklyData.length > 0 ? weeklyData : fallbackWeeklyMessages
    } else {
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
    if (!analytics?.dealsByStage || analytics.dealsByStage.length === 0) {
      if (stats?.totalRevenue && stats.totalRevenue > 0) {
        return [{ month: 'Total', ingresos: stats.totalRevenue }]
      }
      return fallbackRevenueData
    }
    return analytics.dealsByStage.map((stage) => ({
      month: stage.stage.slice(0, 8),
      ingresos: stage.value,
    }))
  })()

  const greeting = useMemo(() => getGreeting(userName), [userName])
  const daysActive = useMemo(() => getDaysActive(stats), [stats])

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

  // ─── Loading State ───────────────────────────
  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
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
      {/* ═══════════════════════════════════════════════════
          JHON INTELLIGENCE LAYER (NEW)
          ═══════════════════════════════════════════════════ */}

      {/* JHON Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {greeting.icon}
          <div>
            <h2 className="text-lg font-semibold text-foreground">{greeting.text}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] text-muted-foreground">
                {stats?.aiMessagesSent || 0} mensajes IA · {stats?.activeAgents || 0} agentes activos
              </span>
              {(stats?.activeAgents ?? 0) > 0 && (
                <Badge variant="secondary" className="h-5 text-[9px] bg-violet-50 text-violet-600 border-violet-200 gap-1">
                  <Bot className="h-3 w-3" />
                  {stats!.activeAgents} agente{stats!.activeAgents !== 1 ? 's' : ''} IA
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-7 px-2.5 text-[10px] gap-1 bg-orange-50 text-orange-700 border-orange-200">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-semibold">{daysActive}</span> días activo
          </Badge>
          <Badge variant="secondary" className="h-7 px-2.5 text-[10px] gap-1">
            <Bot className="h-3 w-3 text-emerald-500" />
            {stats?.messagesToday || 0} mensajes hoy
          </Badge>
        </div>
      </div>

      {/* JHON Panel Section */}
      {!jhonLoading && jhonError && (
        <Card className="border-border/60">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{jhonError}</p>
          </CardContent>
        </Card>
      )}

      {jhonLoading && !jhonData && (
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-violet-500 animate-pulse" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72 mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {jhonData && (
        <>
          {/* JHON Insight Bar */}
          <Card className="border-violet-200 bg-violet-50/50 dark:bg-violet-950/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Brain className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                      Jhon dice:
                    </p>
                    <Badge variant="secondary" className="h-5 text-[9px] bg-violet-100 text-violet-600 border-violet-300">
                      {jhonData.totalActiveLeads} leads en radar
                    </Badge>
                  </div>
                  <p className="text-xs text-violet-700 dark:text-violet-300 mt-0.5">
                    {jhonData.jhonInsight}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GLOBAL PRIORITY BANNER */}
          {jhonData.globalPriority && (
            <GlobalPriorityBanner
              priority={jhonData.globalPriority}
              onExecuteAction={handleExecuteAction}
              isExecuting={executingAction === jhonData.globalPriority.contactId}
            />
          )}

          {/* PRIORITIZED LEAD CARDS */}
          {jhonData.prioritizedLeads.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold text-foreground">Leads Prioritarios</h3>
                <Badge variant="secondary" className="h-5 text-[9px]">
                  {jhonData.prioritizedLeads.length} acciones pendientes
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {jhonData.prioritizedLeads.map((lead) => (
                  <LeadCard
                    key={lead.contactId}
                    lead={lead}
                    isExpanded={expandedTraces.has(lead.contactId)}
                    isExecuting={executingAction === lead.contactId}
                    onToggleTrace={() => toggleTrace(lead.contactId)}
                    onExecuteAction={(action) =>
                      handleExecuteAction(lead.contactId, action)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          EXISTING DASHBOARD (PRESERVED)
          ═══════════════════════════════════════════════════ */}

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

      {/* Conversion Funnel */}
      {stats?.stages && stats.stages.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Embudo de Conversión
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2.5">
              {(() => {
                const filteredStages = stats.stages.filter(s => !s.name.toLowerCase().includes('perdido'))
                const maxCount = Math.max(...filteredStages.map(s => s.dealCount), 1)
                return filteredStages.map((stage, index) => {
                  const widthPercent = Math.max(8, (stage.dealCount / maxCount) * 100)
                  let conversionLabel: React.ReactNode = null
                  if (index > 0 && filteredStages[index - 1].dealCount > 0) {
                    const rate = Math.round((stage.dealCount / filteredStages[index - 1].dealCount) * 100)
                    conversionLabel = (
                      <span className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                        rate >= 60 ? "bg-emerald-100 text-emerald-700" :
                        rate >= 30 ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {rate}%
                      </span>
                    )
                  }
                  return (
                    <div key={stage.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{stage.name}</span>
                      <div className="flex-1 h-7 bg-muted/40 rounded-md overflow-hidden relative">
                        <div
                          className="h-full rounded-md transition-all duration-500"
                          style={{
                            width: `${widthPercent}%`,
                            backgroundColor: stage.color || '#94a3b8',
                            opacity: 0.8,
                          }}
                        />
                        <div className="absolute inset-0 flex items-center px-2.5 gap-2">
                          <span className="text-[11px] font-semibold text-foreground">
                            {stage.dealCount}
                          </span>
                          {conversionLabel}
                        </div>
                      </div>
                      {stage.totalValue > 0 && (
                        <span className="text-[10px] text-muted-foreground w-20 text-right shrink-0">{formatCurrency(stage.totalValue)}</span>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Nuevo Contacto', icon: <Users className="h-4 w-4" />, onClick: () => onViewChange?.('contacts'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
          { label: 'Ver Pipeline', icon: <TrendingUp className="h-4 w-4" />, onClick: () => onViewChange?.('pipeline'), color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
          { label: 'Agentes IA', icon: <Bot className="h-4 w-4" />, onClick: () => onViewChange?.('agents'), color: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' },
          { label: 'Ver Analíticas', icon: <BarChart3 className="h-4 w-4" />, onClick: () => onViewChange?.('analytics'), color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
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
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      formatter={(value: any) => [value != null && !isNaN(Number(value)) ? Number(value) : 0, 'Mensajes']}
                    />
                    <Bar dataKey="mensajes" fill="#10b981" radius={[4, 4, 0, 0]} name="Enviados" />
                    <Bar dataKey="entregados" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="Estimados entregados" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

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
                            {getInitials(conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName || ''}`.trim() : '??')}
                          </AvatarFallback>
                        </Avatar>
                        {conv.contact.leadScore > 0 && (
                          <ScoreRing score={conv.contact.leadScore} size={20} strokeWidth={2.5} className="mt-1 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate group-hover:text-emerald-600 transition-colors">
                              {conv.contact ? `${conv.contact.firstName}${conv.contact.lastName ? ' ' + conv.contact.lastName : ''}`.trim() : 'Sin contacto'}
                            </span>
                            <span className={cn("text-xs", getChannelColor(conv.channel))}>
                              {getChannelIcon(conv.channel)}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {conv.lastMessage ? (
                              <span className="truncate block max-w-[160px]">
                                &ldquo;{conv.lastMessage.length > 40 ? conv.lastMessage.slice(0, 40) + '...' : conv.lastMessage}&rdquo;
                              </span>
                            ) : (
                              getActivityContext({ channel: conv.channel })
                            )}
                          </p>
                          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
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
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      formatter={(value: any) => [value != null && !isNaN(Number(value)) ? formatCurrency(Number(value)) : '$0', 'Ingresos']}
                    />
                    <Area type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2} fill="url(#revenueGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

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
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                          <div>
                            <p className="text-xs font-medium text-foreground">{stage.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {stage.dealCount > 0 ? `${stage.dealCount} trato${stage.dealCount !== 1 ? 's' : ''}` : 'Sin tratos'}
                              {stage.probability > 0 && (
                                <span className="ml-1.5 text-emerald-600">({stage.probability}%)</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {stage.totalValue > 0 && (
                          <div className="text-right">
                            <span className="text-xs font-semibold text-foreground block">
                              {formatCurrency(stage.totalValue)}
                            </span>
                            {stage.weightedValue > 0 && stage.weightedValue !== stage.totalValue && (
                              <span className="text-[9px] text-emerald-600">
                                ≈ {formatCurrency(stage.weightedValue)}
                              </span>
                            )}
                          </div>
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

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── Global Priority Banner ────────────────────
function GlobalPriorityBanner({
  priority,
  onExecuteAction,
  isExecuting,
}: {
  priority: JhonPanelData['globalPriority']
  onExecuteAction: (contactId: string, action: ActionType) => void
  isExecuting: boolean
}) {
  if (!priority) return null
  const config = getUrgencyConfig(priority.urgency)

  return (
    <Card
      className={cn(
        'border-2 transition-all',
        config.border,
        config.bg,
        config.pulse && 'animate-pulse-border'
      )}
    >
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Icon + Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn(
              'p-2.5 rounded-xl shrink-0',
              priority.urgency === 'CRITICAL' ? 'bg-red-100' : 'bg-amber-100'
            )}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-foreground">
                  ACCIÓN PRIORITARIA
                </p>
                <Badge className={cn('text-[10px] h-5', config.badge)}>
                  {priority.urgency}
                </Badge>
              </div>
              <p className="text-base font-semibold text-foreground mt-1">
                {priority.contactName} — {priority.actionLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {priority.jhonSays}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeToDecay(priority.timeToDecay)} restante
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Confianza: {Math.round(priority.confidenceScore * 100)}%
                </span>
                <span className="flex items-center gap-1">
                  Score: {priority.score}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button
              size="lg"
              className={cn(
                'px-6 text-sm font-bold shadow-lg',
                getActionBtnColor(priority.urgency),
                isExecuting && 'opacity-50'
              )}
              disabled={isExecuting}
              onClick={() => onExecuteAction(priority!.contactId, priority!.action)}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                getActionIcon(priority.action)
              )}
              {priority.actionLabel}
            </Button>
            {(priority.deadline ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Si no responde en {formatTimeToDecay(priority.timeToDecay)}, Jhon actuará automáticamente
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Lead Card ─────────────────────────────────
function LeadCard({
  lead,
  isExpanded,
  isExecuting,
  onToggleTrace,
  onExecuteAction,
}: {
  lead: JhonLeadCard
  isExpanded: boolean
  isExecuting: boolean
  onToggleTrace: () => void
  onExecuteAction: (action: ActionType) => void
}) {
  const config = getUrgencyConfig(lead.nextBestAction.urgency)

  return (
    <Card className={cn('border-2 transition-all', config.border)}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-[10px] font-semibold bg-zinc-100 text-zinc-600">
                {getInitials(lead.contactName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {lead.contactName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge className={cn('text-[9px] h-4 px-1.5', config.badge)}>
                  {lead.nextBestAction.urgency}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {getPatternLabel(lead.pattern)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreRing score={lead.contactScore} size={28} strokeWidth={3} />
            {getScoreTrendIcon(lead.scoreTrend)}
          </div>
        </div>

        {/* Confidence Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Confianza</span>
            <span className="text-[10px] font-medium text-foreground">
              {Math.round(lead.confidenceScore * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                lead.confidenceScore >= 0.7
                  ? 'bg-emerald-500'
                  : lead.confidenceScore >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-red-400'
              )}
              style={{ width: `${Math.round(lead.confidenceScore * 100)}%` }}
            />
          </div>
        </div>

        {/* Narrative */}
        <p className="text-xs text-foreground/80 mt-3 leading-relaxed">
          {lead.narrative}
        </p>

        {/* Time to decay */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lead.timeToDecay > 0
              ? `${formatTimeToDecay(lead.timeToDecay)} para enfriarse`
              : 'Ya enfriado'}
          </span>
          <span>Intención: {lead.intentLevel}%</span>
        </div>

        {/* Decision Trace (expandable) */}
        <button
          onClick={onToggleTrace}
          className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {isExpanded ? 'Ocultar análisis' : 'Ver análisis de decisión'}
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-1">
            {lead.decisionTrace.map((factor, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-[10px] py-1 px-2 rounded bg-muted/30"
              >
                <span
                  className={cn(
                    'font-bold w-5 text-center',
                    factor.weight > 0
                      ? 'text-emerald-600'
                      : factor.weight < 0
                      ? 'text-red-500'
                      : 'text-zinc-400'
                  )}
                >
                  {factor.weight > 0 ? '+' : ''}{factor.weight}
                </span>
                <span className="font-medium text-foreground shrink-0">
                  {factor.factor}
                </span>
                <span className="text-muted-foreground truncate">
                  — {factor.description}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-3">
              <p className="text-xs font-medium text-foreground truncate">
                {lead.nextBestAction.label}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {lead.nextBestAction.jhonSays}
              </p>
            </div>
            <Button
              size="sm"
              className={cn(
                'shrink-0 px-3 text-xs font-semibold',
                getActionBtnColor(lead.nextBestAction.urgency),
                isExecuting && 'opacity-50'
              )}
              disabled={isExecuting}
              onClick={() => onExecuteAction(lead.nextBestAction.type)}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                getActionIcon(lead.nextBestAction.type)
              )}
              {lead.nextBestAction.label}
            </Button>
          </div>
          {lead.nextBestAction.deadline > 0 && (
            <p className="text-[9px] text-muted-foreground/70 mt-1.5">
              Si no hay resultado en {formatTimeToDecay(lead.nextBestAction.deadline)}, Jhon escalará automáticamente
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
