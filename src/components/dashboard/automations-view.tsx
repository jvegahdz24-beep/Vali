'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  MoreVertical,
  Clock,
  Zap,
  MessageSquare,
  Calendar,
  ArrowRight,
  Webhook,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash2,
  Pencil,
  Play,
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  CheckSquare,
  Square,
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
  Bot,
  Target,
  DollarSign,
  Megaphone,
  Wrench,
  MessageCircle,
  PhoneCall,
  Star,
  Trophy,
  Bell,
  AlertTriangle,
  Brain,
  MapPin,
  Copy,
  HelpCircle,
  Cake,
  FileText,
  Send,
  Search,
  Filter,
  Upload,
  TrendingUp,
  Sparkles,
  Plug,
  GitBranch,
  ArrowDown,
  PieChart as PieChartIcon,
  Tag,
  Users,
  Calculator,
  UserPlus,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { toast } from 'sonner'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { automationTemplates, templateCategories } from '@/lib/automation-templates'

// ── Types ──

interface Automation {
  id: string
  name: string
  description: string | null
  triggerType: string
  triggerConfig: Record<string, unknown>
  actions: Array<{ type: string; description: string }>
  isActive: boolean
  createdAt: string
  updatedAt: string
  runCount?: number
  lastRunAt?: string | null
}

interface AutomationsViewProps {
  workspaceId: string
}

// ── Execution Log Types (Real) ──

interface ExecutionLog {
  id: string
  automationId: string
  automationName: string
  status: 'success' | 'error' | 'running'
  startedAt: string
  completedAt?: string
  message: string
  contactName?: string | null
  action?: string | null
}

// ── Icon Mapping ──

const triggerIcons: Record<string, React.ReactNode> = {
  message_received: <MessageSquare className="h-4 w-4" />,
  schedule: <Calendar className="h-4 w-4" />,
  event: <Zap className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  deal_stage_change: <ArrowRight className="h-4 w-4" />,
  inactivity: <Clock className="h-4 w-4" />,
}

const triggerColors: Record<string, string> = {
  message_received: 'bg-emerald-100 text-emerald-600',
  schedule: 'bg-blue-100 text-blue-600',
  event: 'bg-orange-100 text-orange-600',
  webhook: 'bg-purple-100 text-purple-600',
  deal_stage_change: 'bg-yellow-100 text-yellow-600',
  inactivity: 'bg-amber-100 text-amber-600',
}

const triggerLabels: Record<string, string> = {
  message_received: 'Mensaje recibido',
  schedule: 'Programado',
  event: 'Evento',
  webhook: 'Webhook',
  deal_stage_change: 'Cambio de Etapa',
  inactivity: 'Inactividad',
}

const categoryColors: Record<string, string> = {
  whatsapp: 'bg-emerald-100 text-emerald-700',
  leads: 'bg-blue-100 text-blue-700',
  ventas: 'bg-amber-100 text-amber-700',
  servicio: 'bg-purple-100 text-purple-700',
  marketing: 'bg-pink-100 text-pink-700',
}

// Template icon mapping
const templateIconMap: Record<string, LucideIcon> = {
  'message-square': MessageCircle,
  'brain': Brain,
  'calendar': Calendar,
  'dollar-sign': DollarSign,
  'phone-call': PhoneCall,
  'bot': Bot,
  'target': Target,
  'refresh-cw': RefreshCw,
  'map-pin': MapPin,
  'copy': Copy,
  'bell': Bell,
  'clock': Clock,
  'alert-triangle': AlertTriangle,
  'trophy': Trophy,
  'star': Star,
  'wrench': Wrench,
  'help-circle': HelpCircle,
  'cake': Cake,
  'megaphone': Megaphone,
  'file-text': FileText,
  'send': Send,
}

function getTemplateIcon(iconName: string): LucideIcon {
  return templateIconMap[iconName] || Zap
}

// ── Visual Flow Builder Preview ──

function FlowPreview({ automation }: { automation: Automation }) {
  return (
    <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2.5 font-medium">Flujo de Automatización</p>
      <div className="flex items-center gap-2">
        {/* Trigger Node */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border/40 shrink-0',
          triggerColors[automation.triggerType] || 'bg-zinc-100 text-zinc-500'
        )}>
          {triggerIcons[automation.triggerType] || <Zap className="h-3 w-3" />}
          <span>{triggerLabels[automation.triggerType] || automation.triggerType}</span>
        </div>

        {/* Arrow */}
        <div className="flex items-center shrink-0">
          <div className="w-5 h-px bg-border/60" />
          <ArrowRight className="h-3 w-3 text-muted-foreground/60 -ml-0.5" />
        </div>

        {/* Action Nodes */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            {automation.actions && automation.actions.length > 0 ? (
              automation.actions.map((action, index) => (
                <div key={index} className="flex items-center shrink-0">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-[11px] font-medium">
                    <div className="w-4 h-4 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold text-emerald-700">{index + 1}</span>
                    </div>
                    <span className="truncate max-w-[140px]">{action.description || action.type}</span>
                  </div>
                  {index < automation.actions.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40 mx-1 shrink-0" />
                  )}
                </div>
              ))
            ) : (
              <div className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px]">
                Sin acciones
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──
function actionLabel(action: { type: string; description?: string }): string {
  return action?.description || action?.type || 'Acción'
}

// Icono + color por tipo de acción (para la columna ACCIONES y el flujo)
const actionMeta: Record<string, { icon: LucideIcon; cls: string }> = {
  send_message: { icon: Send, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  send_campaign: { icon: Megaphone, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  ai_respond: { icon: Sparkles, cls: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
  ai_classify: { icon: Bot, cls: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
  tag_contact: { icon: Tag, cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  update_lead_score: { icon: TrendingUp, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  calculate_score: { icon: Calculator, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  notify_team: { icon: Bell, cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  notify: { icon: Bell, cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  assign_agent: { icon: UserPlus, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  detect_duplicate: { icon: Search, cls: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  merge_contacts: { icon: Users, cls: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  create_deal: { icon: Briefcase, cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
}
function actionIconFor(type: string): { icon: LucideIcon; cls: string } {
  return actionMeta[type] || { icon: Zap, cls: 'bg-muted text-muted-foreground' }
}

// ── Main Component ──

export function AutomationsView({ workspaceId }: AutomationsViewProps) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [showNewAutomation, setShowNewAutomation] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)

  // Batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  // Execution history
  const [showHistory, setShowHistory] = useState(false)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Form state
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTriggerType, setNewTriggerType] = useState('message_received')
  const [newTriggerCondition, setNewTriggerCondition] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Vista tipo mockup: KPIs, tabs, filtros, tabla + panel de flujo ──
  interface AutoStats { total: number; active: number; paused: number; totalRuns: number; runsMonth: number; logged: number; successRate: number; byStatus: { success: number; failed: number; skipped: number; partial: number }; lastRunAt: string | null }
  const [stats, setStats] = useState<AutoStats | null>(null)
  const [activeTab, setActiveTab] = useState<'todas' | 'activas' | 'pausadas' | 'programadas' | 'borradores' | 'inactivas'>('todas')
  const [search, setSearch] = useState('')
  const [triggerFilter, setTriggerFilter] = useState('all')
  const [selectedAutoId, setSelectedAutoId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/automations/stats?workspaceId=${workspaceId}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setStats(d) }).catch(() => {})
  }, [workspaceId, automations])

  const fetchAutomations = useCallback(async () => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/automations?workspaceId=${workspaceId}&includeInactive=true`)
      if (!res.ok) throw new Error('Error al cargar automatizaciones')
      const data = await res.json()
      setAutomations(data.items || [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchAutomations()
  }, [fetchAutomations])

  const toggleAutomation = async (id: string, currentState: boolean) => {
    // Optimistic update
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !currentState } : a))
    )

    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentState }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on error
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: currentState } : a))
      )
      toast.error('Error al cambiar estado de automatización')
    }
  }

  const handleCreateAutomation = async () => {
    if (!newName || !newTriggerType) return

    try {
      setCreating(true)
      const actions = [{ type: 'custom', description: newTriggerCondition || 'Acción personalizada' }]
      const triggerConfig = newTriggerCondition ? { condition: newTriggerCondition } : {}

      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: newName,
          description: newDescription || undefined,
          triggerType: newTriggerType,
          triggerConfig,
          actions,
        }),
      })

      if (!res.ok) throw new Error('Error al crear automatización')

      // Reset form and refresh
      setNewName('')
      setNewDescription('')
      setNewTriggerType('message_received')
      setNewTriggerCondition('')
      setShowNewAutomation(false)
      fetchAutomations()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear automatización'
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteAutomation = async (id: string) => {
    try {
      setDeletingId(id)
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      fetchAutomations()
    } catch {
      toast.error('Error al eliminar automatización')
    } finally {
      setDeletingId(null)
    }
  }

  const activeCount = automations.filter((a) => a.isActive).length
  const totalExecutions = automations.reduce((sum, a) => sum + (a.runCount || 0), 0)
  const lastRunTime = automations
    .filter((a) => a.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt!).getTime() - new Date(a.lastRunAt!).getTime())[0]?.lastRunAt

  const handleEditAutomation = (automation: Automation) => {
    setEditName(automation.name)
    setEditDescription(automation.description || '')
    setEditingAutomation(automation)
  }

  const handleSaveEdit = async () => {
    if (!editingAutomation || !editName.trim()) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/automations/${editingAutomation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription || undefined }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      toast.success('Automatización actualizada correctamente')
      setEditingAutomation(null)
      fetchAutomations()
    } catch {
      toast.error('Error al actualizar automatización')
    } finally {
      setSavingEdit(false)
    }
  }

  const [runningId, setRunningId] = useState<string | null>(null)

  const handleRunNow = async (automationId: string) => {
    try {
      setRunningId(automationId)
      const res = await fetch(`/api/automations/${automationId}/run`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Error al ejecutar automatización')
      const data = await res.json()
      toast.success(data.message || 'Automatización ejecutada correctamente')
      fetchAutomations()
    } catch {
      toast.error('Error al ejecutar la automatización')
    } finally {
      setRunningId(null)
    }
  }

  const handleLoadTemplate = async (templateId: string) => {
    try {
      setLoadingTemplateId(templateId)
      const res = await fetch('/api/automations/templates/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, templateIds: [templateId] }),
      })
      if (!res.ok) throw new Error('Error al cargar plantilla')
      const data = await res.json()
      toast.success(data.message || 'Plantilla cargada')
      fetchAutomations()
    } catch {
      toast.error('Error al cargar plantilla')
    } finally {
      setLoadingTemplateId(null)
    }
  }

  // Batch operations
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === automations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(automations.map((a) => a.id)))
    }
  }

  const handleBatchToggle = async (activate: boolean) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/automations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: activate }),
        })
      )
      await Promise.all(promises)
      toast.success(`${selectedIds.size} automatizaciones ${activate ? 'activadas' : 'desactivadas'}`)
      setSelectedIds(new Set())
      fetchAutomations()
    } catch {
      toast.error('Error en operación batch')
    } finally {
      setBatchLoading(false)
    }
  }

  // Fetch real execution logs from all automations
  const fetchExecutionLogs = useCallback(async () => {
    if (!showHistory || automations.length === 0) return
    setLoadingLogs(true)
    try {
      const allLogs: ExecutionLog[] = []
      const promises = automations.map(async (a) => {
        try {
          const res = await fetch(`/api/automations/${a.id}/logs?limit=10`)
          if (res.ok) {
            const data = await res.json()
            const autoLogs = (data.logs || []).map((log: Record<string, unknown>) => ({
              id: log.id as string,
              automationId: a.id,
              automationName: a.name,
              status: (log.status === 'failed' ? 'error' : log.status) as 'success' | 'error' | 'running',
              startedAt: log.createdAt as string,
              message: (log.message || log.action || 'Sin detalle') as string,
              contactName: (log.contactName as string) || null,
              action: (log.action as string) || null,
            }))
            allLogs.push(...autoLogs)
          }
        } catch { /* skip failed fetch */ }
      })
      await Promise.all(promises)
      allLogs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      setExecutionLogs(allLogs.slice(0, 50))
    } finally {
      setLoadingLogs(false)
    }
  }, [showHistory, automations])

  useEffect(() => {
    if (showHistory) fetchExecutionLogs()
  }, [showHistory, fetchExecutionLogs])

  const filteredTemplates = selectedCategory === 'all'
    ? automationTemplates
    : automationTemplates.filter((t) => t.category === selectedCategory)

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <Skeleton className="h-6 w-40 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-64" />
                    <div className="flex gap-2 mt-3">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-9" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <Card className="border-border/60">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button onClick={fetchAutomations} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Automatizaciones</h3>
          <p className="text-sm text-muted-foreground">
            Orquesta flujos de trabajo con IA · {activeCount} de {automations.length} activas ejecutándose 24/7
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowTemplates(true)}
          >
            <Upload className="h-4 w-4" />
            Importar automatización
          </Button>
          <Dialog open={showNewAutomation} onOpenChange={setShowNewAutomation}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4" />
                Nueva Automatización
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva Automatización</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Nombre</Label>
                  <Input placeholder="Nombre de la automatización" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Descripción</Label>
                  <Textarea placeholder="Describe qué hace esta automatización" rows={2} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Tipo de Trigger</Label>
                  <Select value={newTriggerType} onValueChange={setNewTriggerType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="message_received">Mensaje Recibido</SelectItem>
                      <SelectItem value="schedule">Programado</SelectItem>
                      <SelectItem value="event">Evento</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                      <SelectItem value="deal_stage_change">Cambio de Etapa</SelectItem>
                      <SelectItem value="inactivity">Inactividad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Condición del Trigger</Label>
                  <Input placeholder="Ej: channel = whatsapp" value={newTriggerCondition} onChange={(e) => setNewTriggerCondition(e.target.value)} />
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCreateAutomation}
                  disabled={creating || !newName}
                >
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Automatización
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs — 6 tarjetas icon-left con datos reales */}
      {(() => {
        const kpis = [
          { label: 'Automatizaciones activas', value: String(stats?.active ?? activeCount), sub: `de ${stats?.total ?? automations.length} totales`, icon: Zap, from: 'from-emerald-500', to: 'to-emerald-700' },
          { label: 'Ejecuciones totales', value: (stats?.totalRuns ?? totalExecutions).toLocaleString('es-MX'), sub: 'acumuladas históricas', icon: Play, from: 'from-blue-500', to: 'to-blue-700' },
          { label: 'Ejecuciones este mes', value: (stats?.runsMonth ?? 0).toLocaleString('es-MX'), sub: 'registradas en logs', icon: Activity, from: 'from-violet-500', to: 'to-violet-700' },
          { label: 'Tasa de éxito', value: `${stats?.successRate ?? 100}%`, sub: `${stats?.byStatus?.success ?? 0} de ${stats?.logged ?? 0} ok`, icon: TrendingUp, from: 'from-teal-500', to: 'to-teal-700' },
          { label: 'Ejecuciones fallidas', value: String(stats?.byStatus?.failed ?? 0), sub: (stats?.byStatus?.failed ?? 0) === 0 ? 'sin errores' : 'requieren revisión', icon: AlertTriangle, from: 'from-rose-500', to: 'to-rose-700' },
          { label: 'Última ejecución', value: stats?.lastRunAt ? timeAgo(new Date(stats.lastRunAt)) : (lastRunTime ? timeAgo(new Date(lastRunTime)) : 'Nunca'), sub: 'evento más reciente', icon: Timer, from: 'from-amber-500', to: 'to-amber-700' },
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            {kpis.map((k) => {
              const Icon = k.icon
              return (
                <Card key={k.label} className="border-border/50 overflow-hidden">
                  <CardContent className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className={cn('h-11 w-11 rounded-2xl bg-gradient-to-br shadow-lg flex items-center justify-center shrink-0', k.from, k.to)}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium leading-tight truncate">{k.label}</p>
                        <p className="text-xl font-bold leading-tight mt-0.5 truncate">{k.value}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{k.sub}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })()}

      {/* Tabs + filtros */}
      {(() => {
        const tabs: { key: typeof activeTab; label: string; count: number }[] = [
          { key: 'todas', label: 'Todas', count: automations.length },
          { key: 'activas', label: 'Activas', count: automations.filter((a) => a.isActive).length },
          { key: 'pausadas', label: 'Pausadas', count: automations.filter((a) => !a.isActive).length },
          { key: 'programadas', label: 'Programadas', count: automations.filter((a) => a.triggerType === 'schedule').length },
          { key: 'borradores', label: 'Sin ejecutar', count: automations.filter((a) => !(a.runCount && a.runCount > 0)).length },
          { key: 'inactivas', label: 'Inactivas', count: automations.filter((a) => !a.isActive).length },
        ]
        return (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-1 overflow-x-auto custom-scroll pb-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                    activeTab === t.key ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t.label}
                  <span className={cn('text-[10px] rounded-full px-1.5 py-px', activeTab === t.key ? 'bg-background/20' : 'bg-background/60')}>{t.count}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar automatización por nombre o descripción…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={triggerFilter} onValueChange={setTriggerFilter}>
                <SelectTrigger className="h-9 w-full sm:w-52 gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Disparador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los disparadores</SelectItem>
                  <SelectItem value="message_received">Mensaje recibido</SelectItem>
                  <SelectItem value="schedule">Programado</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="deal_stage_change">Cambio de etapa</SelectItem>
                  <SelectItem value="inactivity">Inactividad</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )
      })()}

      {/* Execution History */}
      {showHistory && (
        <Card className="border-border/40 mb-5">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Historial de Ejecuciones</h4>
              </div>
              <Badge variant="secondary" className="text-[10px] bg-muted border-0">
                {executionLogs.length} registros
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : executionLogs.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin ejecuciones registradas</p>
              </div>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-1.5">
                  {executionLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : log.status === 'error' ? (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{log.automationName}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10px] text-muted-foreground truncate">{log.message}</p>
                          {log.contactName && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                              {log.contactName}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(new Date(log.startedAt))}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Operations Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
          <span className="text-xs font-medium text-emerald-700">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={() => handleBatchToggle(true)}
            disabled={batchLoading}
          >
            {batchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
            Activar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-orange-300 text-orange-700 hover:bg-orange-100"
            onClick={() => handleBatchToggle(false)}
            disabled={batchLoading}
          >
            {batchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            Desactivar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Grid principal: tabla + panel lateral */}
      {(() => {
        const q = search.trim().toLowerCase()
        const filtered = automations.filter((a) => {
          if (activeTab === 'activas' && !a.isActive) return false
          if ((activeTab === 'pausadas' || activeTab === 'inactivas') && a.isActive) return false
          if (activeTab === 'programadas' && a.triggerType !== 'schedule') return false
          if (activeTab === 'borradores' && a.runCount && a.runCount > 0) return false
          if (triggerFilter !== 'all' && a.triggerType !== triggerFilter) return false
          if (q && !(`${a.name} ${a.description || ''}`.toLowerCase().includes(q))) return false
          return true
        })
        const selectedAuto = automations.find((a) => a.id === selectedAutoId) || filtered[0] || automations[0] || null
        const donutData = stats ? [
          { name: 'Exitosas', value: stats.byStatus.success, color: '#10b981' },
          { name: 'Fallidas', value: stats.byStatus.failed, color: '#f43f5e' },
          { name: 'Omitidas', value: stats.byStatus.skipped, color: '#a1a1aa' },
          { name: 'Parciales', value: stats.byStatus.partial, color: '#f59e0b' },
        ].filter((d) => d.value > 0) : []

        return (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
            {/* ── Columna principal: tabla ── */}
            <div className="xl:col-span-3 space-y-3">
              {automations.length === 0 ? (
                <Card className="border-border/60">
                  <CardContent className="p-10 text-center">
                    <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No hay automatizaciones</p>
                    <p className="text-xs text-muted-foreground mt-1">Crea una automatización para empezar a automatizar tus flujos</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/60 overflow-hidden">
                  <div className="overflow-x-auto custom-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="text-left font-medium px-3 py-2.5 w-8">
                            <Checkbox
                              checked={selectedIds.size === automations.length && automations.length > 0}
                              onCheckedChange={selectAll}
                            />
                          </th>
                          <th className="text-left font-medium px-2 py-2.5 min-w-[220px]">Nombre / Descripción</th>
                          <th className="text-left font-medium px-2 py-2.5">Disparador</th>
                          <th className="text-left font-medium px-2 py-2.5 min-w-[180px]">Acciones</th>
                          <th className="text-right font-medium px-2 py-2.5">Ejecuciones</th>
                          <th className="text-center font-medium px-2 py-2.5">Éxito</th>
                          <th className="text-right font-medium px-3 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                              No hay automatizaciones que coincidan con el filtro
                            </td>
                          </tr>
                        ) : filtered.map((automation) => {
                          const TIcon = triggerIcons[automation.triggerType]
                          const isSel = selectedAuto?.id === automation.id
                          return (
                            <tr
                              key={automation.id}
                              onClick={() => setSelectedAutoId(automation.id)}
                              className={cn(
                                'border-b border-border/40 last:border-0 cursor-pointer transition-colors hover:bg-muted/40',
                                isSel && 'bg-emerald-500/5',
                                selectedIds.has(automation.id) && 'bg-emerald-500/10'
                              )}
                            >
                              <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(automation.id)}
                                  onCheckedChange={() => toggleSelect(automation.id)}
                                />
                              </td>
                              <td className="px-2 py-3 align-top">
                                <div className="flex items-start gap-2.5">
                                  <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl shrink-0', triggerColors[automation.triggerType] || 'bg-zinc-100 text-zinc-500')}>
                                    {TIcon || <Zap className="h-4 w-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-foreground truncate max-w-[220px]">{automation.name}</p>
                                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-[240px]">{automation.description || 'Sin descripción'}</p>
                                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Creada {timeAgo(new Date(automation.createdAt))}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3 align-top">
                                <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md', triggerColors[automation.triggerType] || 'bg-zinc-100 text-zinc-500')}>
                                  {triggerLabels[automation.triggerType] || automation.triggerType}
                                </span>
                              </td>
                              <td className="px-2 py-3 align-top">
                                <div className="flex flex-wrap items-center gap-1">
                                  {(automation.actions || []).slice(0, 4).map((act, i) => {
                                    const { icon: AIcon, cls } = actionIconFor(act.type)
                                    return (
                                      <div key={i} className="flex items-center gap-1">
                                        {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                                        <span title={actionLabel(act)} className={cn('inline-flex items-center justify-center h-7 w-7 rounded-lg shrink-0', cls)}>
                                          <AIcon className="h-3.5 w-3.5" />
                                        </span>
                                      </div>
                                    )
                                  })}
                                  {(automation.actions?.length || 0) > 4 && (
                                    <span className="text-[10px] text-muted-foreground ml-0.5">+{(automation.actions!.length - 4)}</span>
                                  )}
                                  {(automation.actions?.length || 0) === 0 && (
                                    <span className="text-[10px] text-muted-foreground">Sin acciones</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-3 align-top text-right">
                                <span className="font-semibold tabular-nums">{(automation.runCount || 0).toLocaleString('es-MX')}</span>
                                {automation.lastRunAt && <p className="text-[10px] text-muted-foreground">{timeAgo(new Date(automation.lastRunAt))}</p>}
                              </td>
                              <td className="px-2 py-3 align-top text-center">
                                {automation.runCount && automation.runCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <Switch
                                    checked={automation.isActive}
                                    onCheckedChange={() => toggleAutomation(automation.id, automation.isActive)}
                                  />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditAutomation(automation)}>
                                        <Pencil className="h-3 w-3 mr-1" /> Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleRunNow(automation.id)} disabled={runningId === automation.id}>
                                        {runningId === automation.id ? (<><Loader2 className="h-3 w-3 mr-1 animate-spin" />Ejecutando...</>) : (<><Play className="h-3 w-3 mr-1" />Ejecutar ahora</>)}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteAutomation(automation.id)} disabled={deletingId === automation.id}>
                                        {deletingId === automation.id ? (<><Loader2 className="h-3 w-3 mr-1 animate-spin" />Eliminando...</>) : (<><Trash2 className="h-3 w-3 mr-1" />Eliminar</>)}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/60 text-[11px] text-muted-foreground">
                    <span>Mostrando {filtered.length} de {automations.length} automatizaciones</span>
                    <span>{activeCount} activas · {stats?.totalRuns?.toLocaleString('es-MX') ?? totalExecutions} ejecuciones totales</span>
                  </div>
                </Card>
              )}
            </div>

            {/* ── Panel lateral ── */}
            <div className="xl:col-span-1 space-y-4">
              {/* Flujo de automatización */}
              <Card className="border-border/60">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-emerald-500" /> Flujo de automatización
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {selectedAuto ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground truncate">{selectedAuto.name}</p>
                      {/* Nodo disparador */}
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2">
                        <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg shrink-0', triggerColors[selectedAuto.triggerType] || 'bg-zinc-100 text-zinc-500')}>
                          {triggerIcons[selectedAuto.triggerType] || <Zap className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Disparador</p>
                          <p className="text-[11px] font-medium truncate">{triggerLabels[selectedAuto.triggerType] || selectedAuto.triggerType}</p>
                        </div>
                      </div>
                      {(selectedAuto.actions || []).map((act, i) => (
                        <div key={i}>
                          <div className="flex justify-center py-0.5"><ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" /></div>
                          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
                            {(() => { const { icon: AIcon, cls } = actionIconFor(act.type); return (
                              <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg shrink-0', cls)}><AIcon className="h-3.5 w-3.5" /></div>
                            ) })()}
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Acción {i + 1}</p>
                              <p className="text-[11px] font-medium truncate">{actionLabel(act)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(selectedAuto.actions?.length || 0) === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">Esta automatización no tiene acciones configuradas.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Selecciona una automatización para ver su flujo.</p>
                  )}
                </CardContent>
              </Card>

              {/* Estadísticas de ejecuciones (donut) */}
              <Card className="border-border/60">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-violet-500" /> Estadísticas de ejecuciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {donutData.length > 0 ? (
                    <>
                      <div className="relative h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={2} stroke="none">
                              {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-bold">{stats?.logged ?? 0}</span>
                          <span className="text-[10px] text-muted-foreground">registradas</span>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {donutData.map((d) => (
                          <div key={d.name} className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
                            <span className="font-semibold tabular-nums">{d.value}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
                          <span className="text-muted-foreground">Tasa de éxito</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats?.successRate ?? 100}%</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-6">Aún no hay ejecuciones registradas en los logs.</p>
                  )}
                </CardContent>
              </Card>

              {/* Acciones rápidas */}
              <Card className="border-border/60">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Acciones rápidas</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 h-8 text-xs" onClick={() => setShowNewAutomation(true)}><Plus className="h-3.5 w-3.5" />Crear</Button>
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 h-8 text-xs" onClick={() => setShowTemplates(true)}><LayoutTemplate className="h-3.5 w-3.5" />Plantillas</Button>
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 h-8 text-xs" onClick={() => setShowHistory(true)}><Activity className="h-3.5 w-3.5" />Historial</Button>
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 h-8 text-xs" disabled={!selectedAuto || runningId === selectedAuto?.id} onClick={() => selectedAuto && handleRunNow(selectedAuto.id)}>
                    {selectedAuto && runningId === selectedAuto.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Ejecutar
                  </Button>
                </CardContent>
              </Card>

              {/* Ayuda */}
              <Card className="border-border/60 bg-gradient-to-br from-emerald-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0"><Plug className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
                    <div>
                      <p className="text-xs font-semibold">¿Necesitas ayuda?</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Las automatizaciones corren en segundo plano 24/7. Usa las plantillas para empezar en segundos o consulta el manual.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )
      })()}

      {/* Template Gallery */}
      {showTemplates && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              Galería de Plantillas
            </h4>
            <span className="text-xs text-muted-foreground">{automationTemplates.length} plantillas disponibles</span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                selectedCategory === 'all'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Todas
            </button>
            {templateCategories.map((cat) => {
              const CatIcon = getTemplateIcon(cat.icon)
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
                    selectedCategory === cat.id
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  <CatIcon className="h-3 w-3" />
                  {cat.name}
                </button>
              )
            })}
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTemplates.map((template) => {
              const TemplateIcon = getTemplateIcon(template.icon)
              return (
                <Card key={template.id} className="border-border/60 hover:shadow-sm transition-all hover:border-emerald-200/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
                        categoryColors[template.category] || 'bg-zinc-100 text-zinc-500'
                      )}>
                        <TemplateIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-xs font-semibold text-foreground truncate">{template.name}</h5>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{template.description}</p>
                      </div>
                    </div>

                    {/* Action flow preview */}
                    <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
                      <div className="px-2 py-1 rounded-md bg-muted/50 text-[9px] text-muted-foreground shrink-0">
                        {template.triggerType === 'message_received' ? 'Mensaje' :
                         template.triggerType === 'schedule' ? 'Timer' :
                         template.triggerType === 'event' ? 'Evento' :
                         template.triggerType === 'webhook' ? 'Webhook' :
                         template.triggerType === 'deal_stage_change' ? 'Etapa' :
                         template.triggerType}
                      </div>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                      <div className="flex items-center gap-1">
                        {template.actions.slice(0, 2).map((action, idx) => (
                          <span key={idx} className="px-2 py-1 rounded-md bg-emerald-50 text-[9px] text-emerald-600 shrink-0 border border-emerald-100">
                            {action.description.length > 20 ? action.description.slice(0, 20) + '...' : action.description}
                          </span>
                        ))}
                        {template.actions.length > 2 && (
                          <span className="text-[9px] text-muted-foreground shrink-0">+{template.actions.length - 2}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="secondary" className={cn('text-[10px] border-0', categoryColors[template.category])}>
                        {templateCategories.find((c) => c.id === template.category)?.name || template.category}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => handleLoadTemplate(template.id)}
                        disabled={loadingTemplateId === template.id}
                      >
                        {loadingTemplateId === template.id ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Cargando...</>
                        ) : (
                          <><Plus className="h-3 w-3" />Cargar</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No hay plantillas en esta categoría</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Automation Dialog */}
      <Dialog open={!!editingAutomation} onOpenChange={(open) => !open && setEditingAutomation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Automatización</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Descripción</Label>
              <Textarea placeholder="Describe qué hace esta automatización" rows={2} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSaveEdit}
              disabled={savingEdit || !editName.trim()}
            >
              {savingEdit && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
