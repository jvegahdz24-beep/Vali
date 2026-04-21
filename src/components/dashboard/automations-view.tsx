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
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

// ── Execution Log Types (Mock) ──

interface ExecutionLog {
  id: string
  automationId: string
  automationName: string
  status: 'success' | 'error' | 'running'
  startedAt: string
  completedAt?: string
  message: string
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

  // Form state
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTriggerType, setNewTriggerType] = useState('message_received')
  const [newTriggerCondition, setNewTriggerCondition] = useState('')
  const [creating, setCreating] = useState(false)

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

  // Mock execution history
  const mockExecutionLogs: ExecutionLog[] = (() => {
    const logs: ExecutionLog[] = []
    automations.forEach((a) => {
      if (a.runCount && a.runCount > 0) {
        const successCount = Math.ceil(a.runCount * 0.85)
        for (let i = 0; i < Math.min(3, a.runCount); i++) {
          logs.push({
            id: `log-${a.id}-${i}`,
            automationId: a.id,
            automationName: a.name,
            status: i < successCount ? 'success' : 'error',
            startedAt: new Date(Date.now() - (i + 1) * 3600000 * (Math.random() * 24 + 1)).toISOString(),
            completedAt: new Date(Date.now() - (i + 1) * 3600000 * (Math.random() * 24 + 1) + 2000).toISOString(),
            message: i < successCount ? 'Ejecutada correctamente' : 'Error en la ejecución',
          })
        }
      }
    })
    return logs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt)).slice(0, 15)
  })()

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Automatizaciones</h3>
          <p className="text-sm text-muted-foreground">
            {activeCount} de {automations.length} activas
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowHistory(!showHistory)}
          >
            <Activity className="h-4 w-4" />
            Historial
            {showHistory ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            <LayoutTemplate className="h-4 w-4" />
            Plantillas
            {showTemplates ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card className="border-border/40 bg-gradient-to-br from-emerald-50/50 to-transparent">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-100">
                <Zap className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Activas</p>
                <p className="text-lg font-bold text-emerald-700">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-gradient-to-br from-blue-50/50 to-transparent">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-100">
                <Play className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Total Ejecuciones</p>
                <p className="text-lg font-bold text-blue-700">{totalExecutions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-gradient-to-br from-violet-50/50 to-transparent">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-100">
                <Timer className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">Última Ejecución</p>
                <p className="text-sm font-bold text-violet-700 mt-0.5">
                  {lastRunTime ? timeAgo(new Date(lastRunTime)) : 'Nunca'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                {mockExecutionLogs.length} registros
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            {mockExecutionLogs.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin ejecuciones registradas</p>
              </div>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-1.5">
                  {mockExecutionLogs.map((log) => (
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
                        <p className="text-[10px] text-muted-foreground">{log.message}</p>
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

      {/* Automations List */}
      <div className="space-y-3">
        {automations.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="p-8 text-center">
              <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay automatizaciones</p>
              <p className="text-xs text-muted-foreground mt-1">Crea una automatización para automatizar tus flujos de trabajo</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedIds.size === automations.length && automations.length > 0}
                onCheckedChange={selectAll}
              />
              <span className="text-[11px] text-muted-foreground">Seleccionar todas</span>
            </div>
            {automations.map((automation) => (
              <Card key={automation.id} className={cn(
                "border-border/60 hover:shadow-sm transition-shadow",
                selectedIds.has(automation.id) && "border-emerald-300 bg-emerald-50/20"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Checkbox for batch */}
                    <div className="pt-0.5">
                      <Checkbox
                        checked={selectedIds.has(automation.id)}
                        onCheckedChange={() => toggleSelect(automation.id)}
                      />
                    </div>

                    {/* Icon */}
                    <div className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
                      triggerColors[automation.triggerType] || 'bg-zinc-100 text-zinc-500'
                    )}>
                      {triggerIcons[automation.triggerType] || <Zap className="h-4 w-4" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground truncate">{automation.name}</h4>
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                              automation.isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-zinc-100 text-zinc-500'
                            )}>
                              <span className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                automation.isActive ? 'bg-emerald-500' : 'bg-zinc-400'
                              )} />
                              {automation.isActive ? 'Activa' : 'Inactiva'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{automation.description || 'Sin descripción'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={automation.isActive}
                            onCheckedChange={() => toggleAutomation(automation.id, automation.isActive)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditAutomation(automation)}>
                                <Pencil className="h-3 w-3 mr-1" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRunNow(automation.id)}
                                disabled={runningId === automation.id}
                              >
                                {runningId === automation.id ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Ejecutando...</>
                                ) : (
                                  <><Play className="h-3 w-3 mr-1" />Ejecutar ahora</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDeleteAutomation(automation.id)}
                                disabled={deletingId === automation.id}
                              >
                                {deletingId === automation.id ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Eliminando...</>
                                ) : (
                                  <><Trash2 className="h-3 w-3 mr-1" />Eliminar</>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          {triggerLabels[automation.triggerType] || automation.triggerType}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" />
                          {automation.actions?.length || 0} acciones
                        </div>
                        {automation.runCount !== undefined && automation.runCount > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Play className="h-3 w-3" />
                            {automation.runCount} ejecuciones
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Creada: {timeAgo(new Date(automation.createdAt))}
                        </div>
                      </div>

                      {/* Visual Flow Preview */}
                      <FlowPreview automation={automation} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

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
