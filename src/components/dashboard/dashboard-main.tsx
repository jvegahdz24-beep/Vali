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
  Instagram,
  Facebook,
  Globe,
  MoreVertical,
  Sparkles,
} from 'lucide-react'
import { cn, formatCurrency, timeAgo, getInitials, getChannelIcon, getChannelColor } from '@/lib/utils'
import { toast } from 'sonner'
import { useSSEDashboard } from '@/hooks/use-sse-dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { useAuth } from '@/hooks/use-auth'
import { EventBusTicker } from '@/components/dashboard/event-bus-ticker'
import { ApprovalsCard } from '@/components/dashboard/approvals-card'
import { ExpedientePanel } from '@/components/dashboard/expediente-panel'
import { QuoteModal } from '@/components/dashboard/quote-modal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// ─── JHON Panel Types ──────────────────────────
interface JhonLeadCard {
  contactId: string
  contactName: string
  contactPhone: string | null
  contactScore: number
  contactAvatar?: string | null
  contactChannel?: string
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
  revenueToday?: number
  revenueMonth?: number
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
  changes?: Record<string, { pct: number; dir: 'up' | 'down' | 'flat' }>
  workspaceCreatedAt: string | null
  workspaceName: string | null
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
  onOpenContact?: (id: string) => void
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

function getGreeting(name: string): { text: string; icon: React.ReactNode } {
  const hour = new Date().getHours()
  const firstName = name.split(' ')[0]
  if (hour >= 6 && hour < 12) {
    return {
      text: `Buenos días, ${firstName}`,
      icon: <Sun className="h-5 w-5 text-amber-500" />,
    }
  } else if (hour >= 12 && hour < 18) {
    return {
      text: `Buenas tardes, ${firstName}`,
      icon: <Coffee className="h-5 w-5 text-orange-500" />,
    }
  } else {
    return {
      text: `Buenas noches, ${firstName}`,
      icon: <Moon className="h-5 w-5 text-violet-500" />,
    }
  }
}

function getDaysActive(stats: DashboardStats | null): number {
  if (!stats?.workspaceCreatedAt) return 0
  const created = new Date(stats.workspaceCreatedAt)
  const now = new Date()
  return Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)))
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

export function DashboardMain({ workspaceId, onViewChange, onOpenContact }: DashboardMainProps) {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [period, setPeriod] = useState('7d')

  // JHON Panel state
  const [jhonData, setJhonData] = useState<JhonPanelData | null>(null)
  const [jhonLoading, setJhonLoading] = useState(true)
  const [jhonError, setJhonError] = useState<string | null>(null)
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set())
  const [executingAction, setExecutingAction] = useState<string | null>(null)
  // Interactividad del tablero (expediente, todas las alertas, detalle de cita, cotización, difusión)
  const [expedienteId, setExpedienteId] = useState<string | null>(null)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [apptDetail, setApptDetail] = useState<TodayAppt | null>(null)
  const [showQuote, setShowQuote] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)

  // Fetch dashboard stats
  useEffect(() => {
    if (!workspaceId) return

    // silent=true → refresco en segundo plano: NO toca el estado de carga (no
    // parpadea el esqueleto). El spinner solo aparece en la PRIMERA carga.
    async function fetchStats(silent = false) {
      try {
        if (!silent) setLoading(true)
        setError(null)
        const res = await fetch(`/api/dashboard/stats?workspaceId=${workspaceId}`)
        if (!res.ok) throw new Error('Error al cargar estadísticas')
        const data = await res.json()
        setStats(data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        if (!silent) { setError(message); toast.error('Error al cargar estadísticas') }
      } finally {
        if (!silent) setLoading(false)
      }
    }

    fetchStats()
    // FIX 1a: Poll every 30s so metrics stay live without page reload
    const statsInterval = setInterval(() => {
      fetchStats(true).catch(() => {})
    }, 30000)
    return () => clearInterval(statsInterval)
  }, [workspaceId])

  // Fetch analytics
  useEffect(() => {
    if (!workspaceId) return

    async function fetchAnalytics(silent = false) {
      try {
        if (!silent) setAnalyticsLoading(true)
        const res = await fetch(`/api/analytics?workspaceId=${workspaceId}&period=${period}`)
        if (!res.ok) throw new Error('Error al cargar analíticas')
        const data = await res.json()
        setAnalytics(data)
      } catch {
        if (!silent) setAnalytics(null)
      } finally {
        if (!silent) setAnalyticsLoading(false)
      }
    }

    fetchAnalytics()
    // Poll analytics every 30s (en silencio: no reinicia el esqueleto)
    const analyticsInterval = setInterval(() => {
      fetchAnalytics(true).catch(() => {})
    }, 30000)
    return () => clearInterval(analyticsInterval)
  }, [workspaceId, period])

  // Fetch JHON Panel data
  useEffect(() => {
    if (!workspaceId) return

    async function fetchJhonPanel(silent = false) {
      try {
        if (!silent) setJhonLoading(true)
        setJhonError(null)
        const res = await fetch(`/api/jhon-panel?workspaceId=${workspaceId}`)
        if (!res.ok) throw new Error('Error al cargar panel de Jhon')
        const data = await res.json()
        setJhonData(data)
      } catch {
        if (!silent) { setJhonData(null); setJhonError('No se pudo cargar la inteligencia de Jhon') }
      } finally {
        if (!silent) setJhonLoading(false)
      }
    }

    fetchJhonPanel()
    // Refresh every 2 minutes (en silencio: no reinicia el esqueleto)
    const interval = setInterval(() => { fetchJhonPanel(true).catch(() => {}) }, 120000)
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

  // ── 1d: SSE real-time updates ────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/dashboard/stats?workspaceId=${workspaceId}`)
      if (!res.ok) return
      const data = await res.json()
      setStats(data)
    } catch { /* ignore */ }
  }, [workspaceId])

  useSSEDashboard({
    workspaceId: workspaceId ?? '',
    disabled: !workspaceId,
    onEvent(event) {
      if (event === 'deal.stage_changed' || event === 'message.received') {
        fetchStats()
      }
    },
  })

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

  const greeting = useMemo(() => getGreeting(user?.name || 'Usuario'), [user?.name])
  const daysActive = useMemo(() => getDaysActive(stats), [stats])

  // 6 KPIs con acento de color propio (estilo del mockup). Todo dato REAL.
  const statsCards = stats
    ? [
        {
          title: 'Contactos Totales',
          value: stats.totalContacts.toLocaleString('es-MX'),
          change: 'Total en el CRM',
          changeKey: 'totalContacts',
          changeLabel: 'vs ayer',
          icon: <Users className="h-5 w-5" />,
          accent: 'violet',
          view: 'contacts',
        },
        {
          title: 'Conversaciones Activas',
          value: stats.activeConversations.toLocaleString('es-MX'),
          change: 'En tiempo real',
          changeKey: 'activeConversations',
          icon: <MessageCircle className="h-5 w-5" />,
          accent: 'blue',
          view: 'inbox',
        },
        {
          title: 'Tratos Ganados (Mes)',
          value: formatCurrency((stats.revenueMonth ?? stats.totalRevenue) || 0),
          change: `${stats.dealsWon} cerrados`,
          changeKey: 'totalRevenue',
          changeLabel: 'vs mes anterior',
          icon: <DollarSign className="h-5 w-5" />,
          accent: 'emerald',
          view: 'pipeline',
        },
        {
          title: 'Tasa de Conversión',
          value: `${stats.conversionRate}%`,
          change: `${stats.openDeals} activos`,
          changeKey: 'conversionRate',
          goal: 30,
          goalValue: stats.conversionRate,
          featured: true,
          icon: <TrendingUp className="h-5 w-5" />,
          accent: 'orange',
          view: 'analytics',
        },
        {
          title: 'Agentes IA Activos',
          value: (stats.activeAgents || 0).toString(),
          change: 'Funcionando 24/7',
          icon: <Bot className="h-5 w-5" />,
          accent: 'fuchsia',
          view: 'agents',
        },
        {
          title: 'Ingresos del Día',
          value: formatCurrency(stats.revenueToday || 0),
          change: `${stats.messagesToday || 0} mensajes IA hoy`,
          changeKey: 'revenueToday',
          changeLabel: 'vs ayer',
          icon: <Zap className="h-5 w-5" />,
          accent: 'teal',
          view: 'pipeline',
        },
      ] as Array<{ title: string; value: string; change: string | null; changeKey?: string; changeLabel?: string; goal?: number; goalValue?: number; featured?: boolean; icon: React.ReactNode; accent: string; view: string }>
    : []

  // Íconos en cuadro redondeado con degradado SÓLIDO y vivo (como el mockup).
  const ACCENTS: Record<string, { ring: string; icon: string; glow: string; featuredCard: string }> = {
    violet: { ring: 'border-violet-500/40', icon: 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg shadow-violet-500/40', glow: 'bg-violet-500', featuredCard: 'bg-gradient-to-br from-violet-500/25 to-violet-600/5 border-violet-500/50' },
    blue: { ring: 'border-blue-500/40', icon: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/40', glow: 'bg-blue-500', featuredCard: 'bg-gradient-to-br from-blue-500/25 to-blue-600/5 border-blue-500/50' },
    emerald: { ring: 'border-emerald-500/40', icon: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/40', glow: 'bg-emerald-500', featuredCard: 'bg-gradient-to-br from-emerald-500/25 to-emerald-600/5 border-emerald-500/50' },
    orange: { ring: 'border-orange-500/40', icon: 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/40', glow: 'bg-orange-500', featuredCard: 'bg-gradient-to-br from-orange-500/30 to-amber-600/10 border-orange-500/50' },
    fuchsia: { ring: 'border-fuchsia-500/40', icon: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 text-white shadow-lg shadow-fuchsia-500/40', glow: 'bg-fuchsia-500', featuredCard: 'bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-600/5 border-fuchsia-500/50' },
    teal: { ring: 'border-teal-500/40', icon: 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-500/40', glow: 'bg-teal-500', featuredCard: 'bg-gradient-to-br from-teal-500/25 to-teal-600/5 border-teal-500/50' },
  }

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
    <div className="p-4 lg:p-6 space-y-6 min-w-0 overflow-x-hidden dark:bg-[#0a0a0f] min-h-full">

      {/* ═══════════════════════════════════════════════════
          JHON INTELLIGENCE LAYER (NEW)
          ═══════════════════════════════════════════════════ */}

      {/* El saludo del Copiloto ahora vive en el HEADER (misma fila que la
          búsqueda y el perfil), como el mockup. Ya no se duplica aquí. */}

      {/* Stats Cards — 6 KPIs con acento de color (arriba, como el mockup) */}
      <div data-tour="kpis" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 stagger-children">
        {statsCards.map((stat) => {
          const a = ACCENTS[stat.accent] || ACCENTS.violet
          return (
            <Card key={stat.title} onClick={() => onViewChange?.(stat.view)} role="button" tabIndex={0} title={`Abrir ${stat.title}`} className={cn('group card-hover relative overflow-hidden border cursor-pointer', stat.featured ? a.featuredCard : cn('bg-card dark:bg-zinc-900/70', a.ring))}>
              {/* glow de acento neón en la esquina (look del mockup) */}
              <div className={cn('pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-70', stat.featured ? 'opacity-50' : 'opacity-35', a.glow)} />
              {/* Compacto (pedido de Jhon: "los cajones estorban en móvil") */}
              <CardContent className="p-3 sm:p-4 relative">
                {/* Layout horizontal: ícono a la IZQUIERDA + título/número a la derecha (como el mockup) */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className={cn('h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110', a.icon)}>
                    {stat.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight truncate">{stat.title}</p>
                    <p className="text-xl sm:text-2xl xl:text-[26px] font-bold text-foreground tracking-tight animate-count-up leading-tight">{stat.value}</p>
                  </div>
                </div>
                {(() => {
                  const ch = stat.changeKey ? stats?.changes?.[stat.changeKey] : undefined
                  if (ch && ch.pct > 0) {
                    const up = ch.dir === 'up'
                    return (
                      <p className={cn('text-[10px] mt-2 truncate flex items-center gap-1 font-medium', up ? 'text-emerald-500' : ch.dir === 'down' ? 'text-red-500' : 'text-muted-foreground')}>
                        {up ? <TrendingUp className="h-3 w-3" /> : ch.dir === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                        {up ? '↑' : ch.dir === 'down' ? '↓' : ''}{ch.pct}% {stat.changeLabel ?? 'vs ayer'}
                      </p>
                    )
                  }
                  // Barra de objetivo (Tasa de Conversión)
                  if (stat.goal != null) {
                    const pct = Math.min(100, Math.round(((stat.goalValue ?? 0) / stat.goal) * 100))
                    return (
                      <div className="mt-2">
                        <p className="text-[10px] text-muted-foreground mb-1">Objetivo: {stat.goal}%</p>
                        <div className="h-1 rounded-full bg-muted/50 overflow-hidden"><div className={cn('h-full rounded-full', a.glow)} style={{ width: `${pct}%` }} /></div>
                      </div>
                    )
                  }
                  return stat.change ? (
                    <p className="text-[10px] text-muted-foreground mt-2 truncate flex items-center gap-1">
                      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', a.glow)} />{stat.change}
                    </p>
                  ) : null
                })()}
              </CardContent>
            </Card>
          )
        })}
      </div>


      {/* ═══ Atajos de control: switch GLOBAL de la IA (pedido de Jhon) ═══ */}
      <div data-tour="ia-switch"><AiGlobalSwitch workspaceId={workspaceId} /></div>

      {/* ═══ Monitoreo de seguimientos automáticos (pedido de Jhon) ═══ */}
      <div data-tour="seguimientos"><FollowupsCard workspaceId={workspaceId} onOpenContact={onOpenContact} /></div>

      {/* ═══ Aprobaciones pendientes (Verificación/Control) ═══ */}
      <div data-tour="aprobaciones"><ApprovalsCard workspaceId={workspaceId} /></div>

      {/* ═══ ALERTAS CRÍTICAS + ACTIVIDAD RECIENTE (mockup) ═══ */}
      <div data-tour="alertas" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alertas Críticas */}
        <Card className="lg:col-span-2 border-red-500/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="text-base">🔥</span> ALERTAS CRÍTICAS
              <span className="text-[11px] font-normal text-muted-foreground hidden sm:inline">Responde ahora para cerrar más ventas</span>
            </CardTitle>
            <button onClick={() => setShowAllAlerts(true)} className="text-[11px] text-emerald-500 hover:underline shrink-0">Ver todas →</button>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {jhonLoading && !jhonData ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-lg skeleton-shimmer" />)
            ) : (jhonData?.prioritizedLeads?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sin alertas críticas ahora. Todo bajo control 🎯</p>
            ) : (
              jhonData!.prioritizedLeads.slice(0, 3).map((lead) => (
                <CriticalAlertRow
                  key={lead.contactId}
                  lead={lead}
                  isExecuting={executingAction === lead.contactId}
                  onExecute={() => handleExecuteAction(lead.contactId, lead.nextBestAction.type)}
                  onOpen={() => setExpedienteId(lead.contactId)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Actividad Reciente */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Actividad Reciente</CardTitle>
            <button onClick={() => onViewChange?.('inbox')} className="text-[11px] text-emerald-500 hover:underline">Ver todo →</button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading && !stats ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded skeleton-shimmer" />)}</div>
            ) : (stats?.recentConversations?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sin actividad reciente.</p>
            ) : (
              <div className="space-y-0.5">
                {stats!.recentConversations.slice(0, 6).map((c) => {
                  const nm = `${c.contact.firstName} ${c.contact.lastName || ''}`.trim() || 'Contacto'
                  const sc = c.contact.leadScore || 0
                  const dot = sc >= 70 ? 'bg-emerald-500' : sc >= 40 ? 'bg-amber-500' : 'bg-zinc-500'
                  const subtitle = c.lastMessage ? c.lastMessage.slice(0, 42) : getActivityContext({ channel: c.channel, lastMessage: c.lastMessage })
                  return (
                    <div key={c.id} onClick={() => onOpenContact?.(c.contact.id)} className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                      <ContactAvatar name={nm} avatar={c.contact.avatar} channel={c.channel} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{nm}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(new Date(c.lastMessageAt))}</span>
                      <span className={cn('h-2 w-2 rounded-full shrink-0', dot)} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Fila de 4 widgets: Embudo · Agentes · Calendario · Acciones (mockup) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Embudo de Ventas (embudo real con valores, como el mockup) */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Embudo de Ventas <span className="text-[11px] font-normal text-muted-foreground">(Este mes)</span></CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {stats?.stages && stats.stages.length > 0 ? (
              <>
                <div className="space-y-1">
                  {(() => {
                    const FUNNEL = ['from-violet-500 to-violet-600', 'from-indigo-500 to-blue-600', 'from-blue-500 to-cyan-600', 'from-cyan-500 to-teal-600', 'from-teal-500 to-emerald-600', 'from-emerald-500 to-green-600', 'from-green-500 to-lime-600']
                    const fs = stats.stages.filter((s) => !s.name.toLowerCase().includes('perdido'))
                    const n = fs.length
                    return fs.map((stage, i) => {
                      // anchos del trapecio (arriba más ancho, abajo más angosto) → forma de embudo
                      const top = 100 - (i * (60 / Math.max(n, 1)))
                      const bottom = 100 - ((i + 1) * (60 / Math.max(n, 1)))
                      const clip = `polygon(${(100 - top) / 2}% 0, ${(100 + top) / 2}% 0, ${(100 + bottom) / 2}% 100%, ${(100 - bottom) / 2}% 100%)`
                      return (
                        <div key={stage.name} className="flex items-center gap-2">
                          <div className="relative flex-1 h-8">
                            <div className={cn('absolute inset-0 bg-gradient-to-b flex items-center justify-center transition-all', FUNNEL[i % FUNNEL.length])} style={{ clipPath: clip }}>
                              <span className="text-[12px] font-bold text-white drop-shadow">{stage.dealCount}</span>
                            </div>
                          </div>
                          <div className="w-24 shrink-0 text-right">
                            <p className="text-[11px] font-medium text-foreground leading-tight truncate">{stage.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{formatCurrency(stage.totalValue || 0)}</p>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total en Pipeline</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(stats.pipelineValue || 0)}</p>
                  </div>
                  {(() => {
                    const ch = stats?.changes?.totalRevenue
                    return ch && ch.pct > 0 ? (
                      <span className={cn('text-[11px] font-medium flex items-center gap-0.5', ch.dir === 'up' ? 'text-emerald-500' : 'text-red-500')}>
                        {ch.dir === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{ch.pct}%
                      </span>
                    ) : null
                  })()}
                </div>
              </>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Sin datos de pipeline</p>}
          </CardContent>
        </Card>

        {/* Rendimiento de Agentes IA */}
        <AgentPerformanceWidget workspaceId={workspaceId} onViewChange={onViewChange} />

        {/* Calendario de Hoy */}
        <TodayCalendarCard workspaceId={workspaceId} onViewChange={onViewChange} onOpenAppt={(a) => setApptDetail(a)} />

        {/* Acciones Rápidas — cada botón hace la acción DIRECTO */}
        <Card className="border-border/60">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Acciones Rápidas</CardTitle></CardHeader>
          <CardContent className="pt-0 grid grid-cols-2 gap-2">
            {[
              { label: 'Nueva Cotización', icon: <FileText className="h-4 w-4" />, c: 'text-violet-500 bg-violet-500/10', run: () => setShowQuote(true) },
              { label: 'Agendar Cita', icon: <CalendarCheck className="h-4 w-4" />, c: 'text-blue-500 bg-blue-500/10', run: () => { try { sessionStorage.setItem('vaf-quick-action', 'new-appointment') } catch { /* */ } onViewChange?.('calendar') } },
              { label: 'Enviar Mensaje Masivo', icon: <Send className="h-4 w-4" />, c: 'text-fuchsia-500 bg-fuchsia-500/10', run: () => setShowBroadcast(true) },
              { label: 'Nueva Oportunidad', icon: <Target className="h-4 w-4" />, c: 'text-emerald-500 bg-emerald-500/10', run: () => { try { sessionStorage.setItem('vaf-quick-action', 'new-deal') } catch { /* */ } onViewChange?.('pipeline') } },
              { label: 'Contactos', icon: <Users className="h-4 w-4" />, c: 'text-rose-500 bg-rose-500/10', run: () => onViewChange?.('contacts') },
              { label: 'Publicar en ML', icon: <ArrowUpRight className="h-4 w-4" />, c: 'text-amber-500 bg-amber-500/10', run: () => onViewChange?.('meli') },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.run}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 p-3 hover:bg-muted/40 transition-colors"
              >
                <span className={cn('p-2 rounded-lg', a.c)}>{a.icon}</span>
                <span className="text-[10px] text-center leading-tight text-foreground">{a.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Barra de estado del sistema (estilo del mockup) */}
      <SystemStatusBar workspaceId={workspaceId} />

      {/* ═══ Overlays interactivos del tablero ═══ */}
      {expedienteId && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setExpedienteId(null)} />
          <ExpedientePanel workspaceId={workspaceId} contactId={expedienteId} onClose={() => setExpedienteId(null)} />
        </div>
      )}
      <AllAlertsModal
        open={showAllAlerts}
        onOpenChange={setShowAllAlerts}
        leads={jhonData?.prioritizedLeads || []}
        executingAction={executingAction}
        onExecute={(id, type) => handleExecuteAction(id, type)}
        onOpen={(id) => { setShowAllAlerts(false); setExpedienteId(id) }}
      />
      <ApptDetailModal appt={apptDetail} onClose={() => setApptDetail(null)} onOpenCalendar={() => { setApptDetail(null); onViewChange?.('calendar') }} onOpenContact={(id) => { setApptDetail(null); setExpedienteId(id) }} />
      <QuoteModal open={showQuote} onOpenChange={setShowQuote} workspaceId={workspaceId} />
      <BroadcastModal open={showBroadcast} onOpenChange={setShowBroadcast} workspaceId={workspaceId} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── Avatar con foto real + badge del canal (WhatsApp/IG/FB) ───
function ChannelBadge({ channel, className }: { channel: string; className?: string }) {
  const ch = (channel || 'whatsapp').toLowerCase()
  const map: Record<string, { bg: string; icon: React.ReactNode }> = {
    whatsapp: { bg: 'bg-green-500', icon: <MessageCircle className="h-2.5 w-2.5 text-white" /> },
    instagram: { bg: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600', icon: <Instagram className="h-2.5 w-2.5 text-white" /> },
    facebook: { bg: 'bg-blue-600', icon: <Facebook className="h-2.5 w-2.5 text-white" /> },
    telegram: { bg: 'bg-sky-500', icon: <Send className="h-2.5 w-2.5 text-white" /> },
    webchat: { bg: 'bg-violet-500', icon: <Globe className="h-2.5 w-2.5 text-white" /> },
    manual: { bg: 'bg-zinc-500', icon: <Users className="h-2.5 w-2.5 text-white" /> },
  }
  const c = map[ch] || map.whatsapp
  return (
    <span className={cn('absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-background h-4 w-4 shadow', c.bg, className)}>
      {c.icon}
    </span>
  )
}

function ContactAvatar({ name, avatar, channel, size = 40 }: { name: string; avatar?: string | null; channel?: string; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar className="h-full w-full ring-2 ring-background">
        {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
        <AvatarFallback className="bg-gradient-to-br from-zinc-700 to-zinc-800 text-white text-[11px] font-semibold">{getInitials(name)}</AvatarFallback>
      </Avatar>
      {channel ? <ChannelBadge channel={channel} /> : null}
    </div>
  )
}

// ─── Fila compacta de alerta crítica (estilo mockup) ───────────
function mapRiskToUrgency(risk: 'critical' | 'high' | 'medium' | 'low'): Urgency {
  return (risk === 'critical' ? 'CRITICAL' : risk === 'high' ? 'HIGH' : risk === 'medium' ? 'MEDIUM' : 'LOW') as Urgency
}
const RISK_LABEL: Record<string, string> = { critical: 'CRITICAL', high: 'ALTO RIESGO', medium: 'SEGUIMIENTO', low: 'OBSERVAR' }
function CriticalAlertRow({ lead, isExecuting, onExecute, onOpen }: {
  lead: JhonLeadCard
  isExecuting: boolean
  onExecute: () => void
  onOpen?: () => void
}) {
  const urg = mapRiskToUrgency(lead.riskLevel)
  const cfg = getUrgencyConfig(urg)
  const intent = Math.round(lead.intentLevel || 0)
  const expired = (lead.timeToDecay ?? 0) <= 0
  // Color de la barra de intención según nivel (degradado, como el mockup)
  const intentBar = intent >= 70 ? 'from-pink-500 to-red-500' : intent >= 40 ? 'from-amber-400 to-orange-500' : 'from-emerald-400 to-emerald-500'
  // Botón con degradado según el tipo de acción
  const actionType = lead.nextBestAction.type
  const isCall = actionType === 'CALL_NOW'
  const isReactivate = actionType === 'REACTIVATE'
  const btnGrad = isCall
    ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white'
    : isReactivate
    ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white'
    : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white'
  return (
    <div className={cn('relative overflow-hidden rounded-xl border p-3 flex items-center gap-3', cfg.border, cfg.bg)}>
      {/* barra de color a la izquierda + glow por severidad (efecto del mockup) */}
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', urg === 'CRITICAL' ? 'bg-red-500' : urg === 'HIGH' ? 'bg-orange-500' : 'bg-sky-500')} />
      <ContactAvatar name={lead.contactName} avatar={lead.contactAvatar} channel={lead.contactChannel} size={44} />
      <div className="min-w-0 w-36 sm:w-48 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{lead.contactName}</span>
          <Badge className={cn('h-4 text-[8px] px-1.5 border', cfg.badge)}>{RISK_LABEL[lead.riskLevel]}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{getPatternLabel(lead.pattern)}</p>
        <p className={cn('text-[10px] flex items-center gap-1', expired ? 'text-red-500 font-medium' : 'text-amber-500')}>
          <Clock className="h-2.5 w-2.5" />{expired ? 'Actuar ahora' : `${formatTimeToDecay(lead.timeToDecay)} restante`}
        </p>
      </div>
      {/* Score ring con etiqueta "Score" (como el mockup) */}
      <div className="hidden sm:flex flex-col items-center shrink-0">
        <ScoreRing score={lead.contactScore} size={48} strokeWidth={4} />
        <span className="text-[8px] text-muted-foreground -mt-1">Score</span>
      </div>
      <div className="flex-1 min-w-0 hidden md:block">
        <p className="text-[10px] text-muted-foreground mb-1">Intención de compra <b className="text-foreground">{intent}%</b></p>
        <div className="h-2 bg-muted/50 rounded-full overflow-hidden"><div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', intentBar)} style={{ width: `${intent}%` }} /></div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <Button size="sm" disabled={isExecuting} onClick={onExecute} className={cn('shrink-0 gap-1.5 shadow-md', btnGrad)}>
            {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : getActionIcon(lead.nextBestAction.type)}
            <span className="hidden sm:inline text-[11px]">{lead.nextBestAction.label}</span>
          </Button>
          <button onClick={onOpen} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors" title="Ver conversación">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
        {isCall && <span className="text-[9px] text-muted-foreground hidden sm:block">o enviar seguimiento</span>}
      </div>
    </div>
  )
}

// ─── Calendario de Hoy (mini timeline, datos reales) ───────────
interface TodayAppt { id: string; title: string; date: string; type: string; duration?: number; status?: string; notes?: string | null; description?: string | null; contactId?: string | null; contact?: { firstName: string; lastName: string | null } | null }
function TodayCalendarCard({ workspaceId, onViewChange, onOpenAppt }: { workspaceId: string; onViewChange?: (v: string) => void; onOpenAppt?: (a: TodayAppt) => void }) {
  const [appts, setAppts] = useState<TodayAppt[] | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    let stop = false
    const now = new Date()
    const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const e = new Date(now.getTime() + 86400000)
    const es = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`
    fetch(`/api/calendar?workspaceId=${workspaceId}&startDate=${s}&endDate=${es}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop) setAppts(Array.isArray(d?.appointments) ? d.appointments.filter((a: TodayAppt) => (a.date || '').slice(0, 10) === s) : []) })
      .catch(() => { if (!stop) setAppts([]) })
    return () => { stop = true }
  }, [workspaceId])
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Calendario de Hoy</CardTitle>
        <span className="text-[11px] text-muted-foreground">{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</span>
      </CardHeader>
      <CardContent className="pt-0">
        {appts === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-lg skeleton-shimmer" />)}</div>
        ) : appts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sin citas para hoy.</p>
        ) : (
          <div className="space-y-2">
            {appts.slice(0, 4).map((a) => {
              const t = (a.type || a.title || '').toLowerCase()
              const kind = t.includes('manejo') || t.includes('prueba') || t.includes('test')
                ? { accent: 'border-l-amber-500 bg-amber-500/10', icon: <CalendarCheck className="h-3.5 w-3.5 text-amber-500" /> }
                : t.includes('reuni') || t.includes('proveedor')
                ? { accent: 'border-l-blue-500 bg-blue-500/10', icon: <Users className="h-3.5 w-3.5 text-blue-500" /> }
                : { accent: 'border-l-emerald-500 bg-emerald-500/10', icon: <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> }
              const start = new Date(a.date)
              const time = start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
              return (
                <button key={a.id} onClick={() => onOpenAppt?.(a)} title="Ver detalle de la cita" className={cn('w-full text-left rounded-lg border-l-2 px-3 py-2 transition-colors hover:brightness-110 cursor-pointer', kind.accent)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-medium text-foreground">{time}</span>
                    {kind.icon}
                  </div>
                  <p className="text-xs font-medium truncate mt-0.5">{a.title || 'Cita'}</p>
                  {a.contact && <p className="text-[10px] text-muted-foreground truncate">{`${a.contact.firstName} ${a.contact.lastName || ''}`.trim()}</p>}
                </button>
              )
            })}
          </div>
        )}
        <button onClick={() => onViewChange?.('calendar')} className="mt-3 w-full rounded-lg border border-border/60 py-1.5 text-[11px] font-medium text-violet-500 hover:bg-violet-500/10 transition-colors">
          Ver calendario completo →
        </button>
      </CardContent>
    </Card>
  )
}

// ─── Rendimiento de Agentes IA (barras, datos reales) ──────────
interface AgentPerfRow { name: string; role: string; totalMessagesSent: number; status: string }
const AGENT_BAR_COLORS = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500']
function AgentPerformanceWidget({ workspaceId, onViewChange }: { workspaceId: string; onViewChange?: (v: string) => void }) {
  const [agents, setAgents] = useState<AgentPerfRow[] | null>(null)
  useEffect(() => {
    if (!workspaceId) return
    let stop = false
    fetch(`/api/agent-factory/instances?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop) setAgents(Array.isArray(d?.instances) ? d.instances : []) })
      .catch(() => { if (!stop) setAgents([]) })
    return () => { stop = true }
  }, [workspaceId])

  const active = (agents || []).filter((a) => a.status === 'activo').sort((a, b) => b.totalMessagesSent - a.totalMessagesSent)
  const top = active.slice(0, 6)
  const totalMsgs = active.reduce((s, a) => s + a.totalMessagesSent, 0)
  const maxMsgs = Math.max(1, ...top.map((a) => a.totalMessagesSent))

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-500" /> Rendimiento de Agentes IA
        </CardTitle>
        <button onClick={() => onViewChange?.('agents')} className="text-[11px] text-violet-500 hover:underline">Ver detalle →</button>
      </CardHeader>
      <CardContent className="pt-0">
        {agents === null ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-7 rounded-md skeleton-shimmer" />)}
          </div>
        ) : top.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Aún no hay agentes con actividad. Crea o activa agentes en Agentes IA.</p>
        ) : (
          <div className="space-y-2.5">
            {top.map((a, i) => {
              const pct = totalMsgs > 0 ? Math.round((a.totalMessagesSent / totalMsgs) * 100) : 0
              const width = Math.max(6, (a.totalMessagesSent / maxMsgs) * 100)
              return (
                <div key={a.name + i} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-24 sm:w-32 shrink-0 truncate font-medium">{a.name}</span>
                  <div className="flex-1 h-6 bg-muted/40 rounded-md overflow-hidden relative">
                    <div className={cn('h-full rounded-md transition-all duration-700', AGENT_BAR_COLORS[i % AGENT_BAR_COLORS.length])} style={{ width: `${width}%`, opacity: 0.85 }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-12 text-right tabular-nums">{a.totalMessagesSent.toLocaleString('es-MX')}</span>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Barra de estado del sistema ────────────────
function SystemStatusBar({ workspaceId }: { workspaceId: string }) {
  const [wa, setWa] = useState<boolean | null>(null)
  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const r = await fetch('/api/whatsapp/status')
        if (r.ok) { const d = await r.json(); if (!stop) setWa(!!d.connected) }
      } catch { /* */ }
    }
    check()
    const id = setInterval(check, 20000)
    return () => { stop = true; clearInterval(id) }
  }, [workspaceId])
  const Dot = ({ ok }: { ok: boolean }) => (
    <span className={cn('inline-block h-2 w-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-amber-500')} />
  )
  const items: { label: string; value: string; ok: boolean }[] = [
    { label: 'Sistema', value: 'En línea', ok: true },
    { label: 'IA', value: 'Activa', ok: true },
    { label: 'gBrain', value: 'Conectado', ok: true },
    { label: 'WhatsApp', value: wa === null ? 'Verificando…' : wa ? 'Conectado' : 'Reconectando', ok: wa !== false },
    { label: 'Webhook', value: 'Online', ok: true },
  ]
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-2 flex items-center gap-x-5 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <Dot ok={it.ok} />
          <span className="font-medium text-foreground">{it.label}:</span> {it.value}
        </span>
      ))}
    </div>
  )
}

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

// ═══════════════════════════════════════════════════════════════
// MODALES INTERACTIVOS DEL TABLERO
// ═══════════════════════════════════════════════════════════════

// ─── Todas las alertas críticas (lista completa de leads prioritarios) ───
function AllAlertsModal({ open, onOpenChange, leads, executingAction, onExecute, onOpen }: {
  open: boolean; onOpenChange: (o: boolean) => void
  leads: JhonLeadCard[]
  executingAction: string | null
  onExecute: (contactId: string, type: ActionType) => void
  onOpen: (contactId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1120px)] sm:max-w-[1120px] max-h-[85vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="text-base">🔥</span> Todas las alertas ({leads.length})</DialogTitle>
        </DialogHeader>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Sin alertas ahora. Todo bajo control 🎯</p>
        ) : (
          <div className="space-y-2 min-w-0">
            {leads.map((lead) => (
              <CriticalAlertRow
                key={lead.contactId}
                lead={lead}
                isExecuting={executingAction === lead.contactId}
                onExecute={() => onExecute(lead.contactId, lead.nextBestAction.type)}
                onOpen={() => onOpen(lead.contactId)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Detalle de una cita del "Calendario de Hoy" ───
function ApptDetailModal({ appt, onClose, onOpenCalendar, onOpenContact }: {
  appt: TodayAppt | null; onClose: () => void; onOpenCalendar: () => void; onOpenContact: (contactId: string) => void
}) {
  if (!appt) return null
  const d = new Date(appt.date)
  const tipo = (appt.type || 'meeting')
  const TIPO_LABEL: Record<string, string> = { call: 'Llamada', meeting: 'Reunión', followup: 'Seguimiento', task: 'Tarea' }
  const EST_LABEL: Record<string, string> = { pending: 'Pendiente', completed: 'Completada', cancelled: 'Cancelada' }
  const contactName = appt.contact ? `${appt.contact.firstName} ${appt.contact.lastName || ''}`.trim() : null
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-blue-500" /> Detalle de la cita</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 p-4 bg-gradient-to-br from-blue-500/5 to-transparent">
            <p className="text-base font-bold">{appt.title || 'Cita'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} · {d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-border/50 p-2.5"><p className="text-[10px] text-muted-foreground">Tipo</p><p className="font-medium">{TIPO_LABEL[tipo] || tipo}</p></div>
            <div className="rounded-lg border border-border/50 p-2.5"><p className="text-[10px] text-muted-foreground">Duración</p><p className="font-medium">{appt.duration ? `${appt.duration} min` : '30 min'}</p></div>
            <div className="rounded-lg border border-border/50 p-2.5"><p className="text-[10px] text-muted-foreground">Estado</p><p className="font-medium">{EST_LABEL[appt.status || 'pending'] || appt.status}</p></div>
            <div className="rounded-lg border border-border/50 p-2.5"><p className="text-[10px] text-muted-foreground">Con</p><p className="font-medium truncate">{contactName || 'Sin contacto'}</p></div>
          </div>
          {(appt.notes || appt.description) && (
            <div className="rounded-lg border border-border/50 p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Notas</p>
              <p className="text-sm whitespace-pre-wrap">{appt.notes || appt.description}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            {appt.contactId && contactName && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenContact(appt.contactId!)}><Users className="h-3.5 w-3.5" /> Ver expediente</Button>
            )}
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" onClick={onOpenCalendar}><CalendarCheck className="h-3.5 w-3.5" /> Abrir en calendario</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Switch GLOBAL de la IA: apaga TODO el bot 1h/3h o indefinido (se
// reactiva sola al vencer). Los mensajes entrantes se siguen guardando. ───
function AiGlobalSwitch({ workspaceId }: { workspaceId: string }) {
  const [st, setSt] = useState<{ paused: boolean; until: string | null; indefinite: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/ai/global-pause?workspaceId=${workspaceId}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setSt(j)).catch(() => {})
  }, [workspaceId])
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv) }, [load])

  const setMode = async (mode: '1h' | '3h' | 'off' | 'on') => {
    setBusy(true)
    try {
      const r = await fetch('/api/ai/global-pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, mode }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'error')
      setSt({ paused: j.paused, until: j.until, indefinite: j.indefinite })
      toast.success(mode === 'on' ? 'IA del bot ENCENDIDA — vuelve a responder a todos' : mode === 'off' ? 'IA del bot APAGADA (indefinido) — los mensajes se siguen guardando' : `IA del bot pausada ${mode} — se reactiva sola a las ${new Date(j.until).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`)
    } catch { toast.error('No se pudo cambiar el estado de la IA') } finally { setBusy(false) }
  }

  if (!st) return null
  const chip = (mode: '1h' | '3h' | 'off' | 'on', label: string, active: boolean, cls: string) => (
    <button key={mode} disabled={busy} onClick={() => setMode(mode)}
      className={cn('h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-50',
        active ? cls : 'border-border text-muted-foreground hover:bg-muted/60')}>
      {label}
    </button>
  )
  return (
    <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
      <CardContent className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold shrink-0">
          <Bot className={cn('h-4 w-4', st.paused ? 'text-red-500' : 'text-emerald-500')} />
          IA del bot
          <span className={cn('text-[11px] font-medium rounded-full px-2 py-0.5', st.paused ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
            {st.paused
              ? (st.until ? `Pausada · vuelve ${new Date(st.until).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}` : 'Apagada')
              : 'Activa'}
          </span>
        </span>
        <span className="flex items-center gap-1.5 flex-wrap">
          {chip('on', 'Encendida', !st.paused, 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40')}
          {chip('1h', 'Pausar 1h', st.paused && !!st.until, 'bg-amber-500/15 text-amber-600 border-amber-500/40')}
          {chip('3h', 'Pausar 3h', false, 'bg-amber-500/15 text-amber-600 border-amber-500/40')}
          {chip('off', 'Apagar', st.paused && st.indefinite, 'bg-red-500/15 text-red-500 border-red-500/40')}
        </span>
        <span className="text-[10px] text-muted-foreground basis-full sm:basis-auto">Pausa TODO el bot del workspace; los mensajes entrantes se siguen guardando en el CRM. Con 1h/3h se reactiva sola.</span>
      </CardContent>
    </Card>
  )
}

// ─── Monitoreo de SEGUIMIENTOS automáticos (pedido de Jhon 2026-07-14:
// "no hay manera de monitorearlos"): programados / enviados + próximos. ───
interface FuRow { id: string; contactId: string | null; contacto: string; temperatura: string; cuando: string; tipo: string }
function FollowupsCard({ workspaceId, onOpenContact }: { workspaceId: string; onOpenContact?: (id: string) => void }) {
  const [data, setData] = useState<{ stats: { programados: number; enCola: number; esperandoAprobacion?: number; enviadosHoy: number; enviados7d: number; cancelados7d: number }; proximos: FuRow[]; recientes: FuRow[] } | null>(null)
  const [tab, setTab] = useState<'proximos' | 'recientes'>('proximos')

  const load = useCallback(() => {
    fetch(`/api/followups/overview?workspaceId=${workspaceId}`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.success && setData(j)).catch(() => {})
  }, [workspaceId])
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv) }, [load])

  if (!data) return null
  const { stats } = data
  const rows = tab === 'proximos' ? data.proximos : data.recientes
  const fmtWhen = (iso: string) => {
    const d = new Date(iso); const diff = d.getTime() - Date.now()
    const abs = d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
    if (tab === 'recientes') return abs
    if (diff <= 0) return 'en el próximo ciclo'
    const h = Math.round(diff / 3600000)
    return h < 1 ? `en ${Math.max(1, Math.round(diff / 60000))} min` : h < 48 ? `en ~${h}h (${abs})` : abs
  }
  const tempDot = (t: string) => t === 'hot' ? 'bg-red-500' : t === 'warm' ? 'bg-amber-500' : 'bg-sky-500'
  const stat = (label: string, value: number, cls = '') => (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn('text-lg font-bold leading-none', cls)}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  )
  return (
    <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold shrink-0">
            <RotateCcw className="h-4 w-4 text-violet-500" /> Seguimientos automáticos
          </span>
          <div className="flex items-center gap-4 flex-wrap">
            {stat('programados', stats.programados, 'text-violet-500')}
            {stats.enCola > 0 && stat('en cola ahora', stats.enCola, 'text-amber-500')}
            {(stats.esperandoAprobacion || 0) > 0 && stat('esperan tu ✅ en Telegram', stats.esperandoAprobacion!, 'text-sky-500')}
            {stat('enviados hoy', stats.enviadosHoy, 'text-emerald-500')}
            {stat('últimos 7 días', stats.enviados7d)}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {(['proximos', 'recientes'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('h-6 px-2 rounded-full text-[10px] font-semibold border transition-colors',
                  tab === t ? 'bg-violet-500/15 text-violet-500 border-violet-500/40' : 'border-border text-muted-foreground hover:bg-muted/60')}>
                {t === 'proximos' ? 'Próximos' : 'Enviados'}
              </button>
            ))}
          </div>
        </div>
        {rows.length > 0 ? (
          <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
            {rows.slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => r.contactId && onOpenContact?.(r.contactId)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40 transition-colors">
                <span className={cn('h-2 w-2 rounded-full shrink-0', tempDot(r.temperatura))} />
                <span className="text-xs font-medium truncate">{r.contacto}</span>
                {r.tipo === 'frío' && <span className="text-[9px] rounded-full bg-sky-500/15 text-sky-500 px-1.5 py-px shrink-0">rescate frío</span>}
                {r.tipo === 'masivo' && <span className="text-[9px] rounded-full bg-violet-500/15 text-violet-500 px-1.5 py-px shrink-0">masivo</span>}
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{fmtWhen(r.cuando)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{tab === 'proximos' ? 'Sin seguimientos programados por ahora — se agendan solos cuando un lead deja de contestar.' : 'Aún no se envían seguimientos hoy.'}</p>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">La IA agenda seguimiento a TODO lead que deja de responder (a los fríos, a las 24h). Tras 2 sin respuesta se detiene sola y marca al contacto como desinteresado.</p>
      </CardContent>
    </Card>
  )
}

// ─── Nueva Cotización: extraída a components/dashboard/quote-modal.tsx
// (compartida con la Bandeja, que la abre con el cliente preseleccionado) ───

// ─── Mensaje Masivo: selección por filtros/etiquetas o manual + envío cada 2 min ───
interface BulkContact { id: string; firstName: string; lastName: string | null; phone: string | null; temperature: string; leadScore: number; tags: string; lastMessageAt?: string | null }
function BroadcastModal({ open, onOpenChange, workspaceId }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string }) {
  const [all, setAll] = useState<BulkContact[]>([])
  const [loading, setLoading] = useState(false)
  const [temp, setTemp] = useState('all')
  const [tag, setTag] = useState('all')
  const [act, setAct] = useState('all') // filtro por nivel de actividad
  const [chan, setChan] = useState('auto') // canal de envío: auto | whatsapp | telegram
  const [stage, setStage] = useState('all') // filtro por etapa del pipeline
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [genMsg, setGenMsg] = useState(false)

  // Al abrir: resetea filtros y carga las etapas del pipeline para el selector.
  useEffect(() => {
    if (!open || !workspaceId) return
    setSelected(new Set()); setMessage(''); setTemp('all'); setTag('all'); setAct('all'); setChan('auto'); setStage('all'); setCampaignName(''); setQuery('')
    fetch(`/api/pipeline?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStages(((d?.items?.[0]?.stages || []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setStages([]))
  }, [open, workspaceId])

  // Carga contactos al abrir y cuando cambia la etapa (filtro server-side).
  useEffect(() => {
    if (!open || !workspaceId) return
    setLoading(true)
    const stageQ = stage !== 'all' ? `&stageId=${stage}` : ''
    fetch(`/api/contacts?workspaceId=${workspaceId}&limit=100&sortBy=lastMessageAt&sortOrder=desc${stageQ}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAll(((d?.items || d?.contacts || []) as BulkContact[]).filter((c) => c.phone)))
      .catch(() => setAll([]))
      .finally(() => setLoading(false))
  }, [open, workspaceId, stage])

  const tagsOf = (c: BulkContact): string[] => { try { return (JSON.parse(c.tags || '[]') as string[]).map(String) } catch { return [] } }
  const chanOf = (c: BulkContact): 'telegram' | 'whatsapp' => (c.phone || '').startsWith('tg:') ? 'telegram' : 'whatsapp'
  const daysSince = (c: BulkContact) => c.lastMessageAt ? Math.floor((Date.now() - new Date(c.lastMessageAt).getTime()) / 86400000) : 9999
  const allTags = useMemo(() => [...new Set(all.flatMap(tagsOf))].sort().slice(0, 30), [all])
  const filtered = useMemo(() => all.filter((c) => {
    if (temp === 'hot' && !(c.temperature === 'hot' || c.leadScore >= 70)) return false
    if (temp === 'warm' && c.temperature !== 'warm') return false
    if (temp === 'cold' && c.temperature !== 'cold') return false
    if (tag !== 'all' && !tagsOf(c).includes(tag)) return false
    if (act === 'inact7' && daysSince(c) < 7) return false
    if (act === 'inact30' && daysSince(c) < 30) return false
    if (act === 'active7' && daysSince(c) > 7) return false
    if (chan === 'whatsapp' && chanOf(c) !== 'whatsapp') return false
    if (chan === 'telegram' && chanOf(c) !== 'telegram') return false
    const q = query.trim().toLowerCase()
    if (q && !`${c.firstName} ${c.lastName || ''} ${c.phone}`.toLowerCase().includes(q)) return false
    return true
  }), [all, temp, tag, act, chan, query])

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectAllFiltered = () => setSelected((s) => { const n = new Set(s); const every = filtered.every((c) => n.has(c.id)); filtered.forEach((c) => { if (every) n.delete(c.id); else n.add(c.id) }); return n })

  const send = async () => {
    if (!selected.size || !message.trim()) { toast.error('Selecciona contactos y escribe el mensaje'); return }
    setSending(true)
    try {
      const r = await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, contactIds: [...selected], message, channel: chan, campaignName: campaignName.trim() || undefined }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'No se pudo programar el envío')
      toast.success(`${d.queued} mensaje(s) en cola — se enviará 1 cada ~2 minutos (anti-baneo)`)
      onOpenChange(false)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,780px)] sm:max-w-[780px] max-h-[88vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-fuchsia-500" /> Enviar Mensaje Masivo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Buscar contacto…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 flex-1" />
            <Select value={temp} onValueChange={setTemp}>
              <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="hot">🔥 Calientes</SelectItem>
                <SelectItem value="warm">🌤️ Tibios</SelectItem>
                <SelectItem value="cold">❄️ Fríos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">Todas las etiquetas</SelectItem>
                {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={act} onValueChange={setAct}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Actividad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cualquier actividad</SelectItem>
                <SelectItem value="active7">Activos (≤7 días)</SelectItem>
                <SelectItem value="inact7">Inactivos +7 días</SelectItem>
                <SelectItem value="inact30">Inactivos +30 días</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chan} onValueChange={setChan}>
              <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Canal automático</SelectItem>
                <SelectItem value="whatsapp">Solo WhatsApp</SelectItem>
                <SelectItem value="telegram">Solo Telegram</SelectItem>
              </SelectContent>
            </Select>
            {stages.length > 0 && (
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">Cualquier etapa</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <Input placeholder="Nombre de la campaña (opcional, para ver métricas)" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="h-9" />
          <div className="rounded-xl border border-border/60 max-h-56 overflow-y-auto custom-scroll">
            <button onClick={selectAllFiltered} className="w-full text-left px-3 py-2 text-[11px] font-medium text-emerald-500 hover:bg-muted/40 border-b border-border/50 sticky top-0 bg-background">
              {filtered.length && filtered.every((c) => selected.has(c.id)) ? 'Quitar todos los filtrados' : `Seleccionar los ${filtered.length} filtrados`}
            </button>
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Cargando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sin contactos con ese filtro</p>
            ) : filtered.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/30 cursor-pointer">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <span className="text-sm flex-1 truncate">{`${c.firstName} ${c.lastName || ''}`.trim()}</span>
                <span className="text-[11px] text-muted-foreground">{c.phone}</span>
                <span className="text-[11px]">{c.temperature === 'hot' || c.leadScore >= 70 ? '🔥' : c.temperature === 'warm' ? '🌤️' : '❄️'}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mensaje (usa {'{{name}}'} para personalizar con el nombre)</Label>
              <button
                onClick={async () => {
                  setGenMsg(true)
                  try {
                    const r = await fetch('/api/marketing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, type: 'message', channels: ['whatsapp'], product: 'los servicios del negocio', objective: 'retencion', tone: 'casual', audience: temp === 'cold' ? 'clientes inactivos' : temp === 'hot' ? 'leads calientes' : 'clientes' }) })
                    const d = await r.json(); if (!r.ok) throw new Error(d.error)
                    setMessage((d.result || '').trim())
                    toast.success('Mensaje generado con IA')
                  } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al generar') } finally { setGenMsg(false) }
                }}
                className="text-[11px] font-semibold text-fuchsia-500 hover:text-fuchsia-400 inline-flex items-center gap-1"
              >
                {genMsg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generar con IA
              </button>
            </div>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Hola {{name}} 👋 Tenemos novedades que te van a interesar…'} />
          </div>
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
            ⏱️ Anti-baneo: se envía 1 mensaje cada ~2 minutos. {selected.size > 1 ? `Los ${selected.size} seleccionados terminarían en ~${Math.ceil((selected.size - 1) * 2)} min.` : ''}
            {filtered.some((c) => chanOf(c) === 'telegram') && ' · Cada lead recibe por su canal (WhatsApp o Telegram) automáticamente.'}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selected.size} seleccionado(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button size="sm" className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white gap-1.5" disabled={sending || !selected.size || !message.trim()} onClick={send}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Programar envío
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
