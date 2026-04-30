'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot,
  Plus,
  Settings,
  Zap,
  Target,
  Phone,
  Trophy,
  Loader2,
  Trash2,
  BarChart3,
  Clock,
  MessageSquare,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_TYPES } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

// ── Types ──

interface Agent {
  id: string
  name: string
  type: string
  personality?: string
  model?: string
  temperature?: number
  maxTokens?: number
  isActive?: boolean
  config?: Record<string, unknown>
  createdAt?: string
}

interface AgentMetrics {
  agentId: string
  agentName: string
  agentType: string
  isActive: boolean
  conversationsHandled: number
  messagesSent: number
  messagesTotal: number
  avgResponseTimeMs: number
  successRate: number | null
  hasRealData: boolean
  leadsQualified: number
  dealsClosed: number
  lastActivity: string | null
  messagesLast7Days: number[]
}

const typeLabels: Record<string, string> = {
  qualifier: 'Qualifier',
  sales: 'Sales Agent',
  followup: 'Follow-up',
  coach: 'Coach',
  custom: 'Custom',
}

const typeIcons: Record<string, React.ReactNode> = {
  qualifier: <Target className="h-5 w-5" />,
  sales: <Zap className="h-5 w-5" />,
  followup: <Phone className="h-5 w-5" />,
  coach: <Trophy className="h-5 w-5" />,
  custom: <Settings className="h-5 w-5" />,
}

// ── Sparkline Component ──

function MiniSparkline({ data, maxVal }: { data: number[]; maxVal: number }) {
  if (data.length === 0) return null
  const height = 28
  const width = 80
  const max = maxVal || Math.max(...data, 1)

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')

  const fillPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg width={width} height={height} className="shrink-0" viewBox={`0 0 ${width} ${height}`}>
      <polygon
        points={fillPoints}
        fill="url(#sparkGradient)"
        opacity={0.3}
      />
      <polyline
        points={points}
        fill="none"
        stroke="#10b981"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  )
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Sin actividad'
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  if (diff < 60000) return 'Ahora'
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`
  if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)}d`
  return new Date(dateStr).toLocaleDateString('es-MX')
}

function AgentCard({
  agent,
  metrics,
  onConfigure,
}: {
  agent: Agent
  metrics?: AgentMetrics
  onConfigure: () => void
}) {
  const sparkData = metrics?.messagesLast7Days || [0, 0, 0, 0, 0, 0, 0]
  const maxSpark = Math.max(...sparkData, 1)

  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer" onClick={onConfigure}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl',
              agent.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-100 text-zinc-400'
            )}>
              {typeIcons[agent.type] || <Bot className="h-5 w-5" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{agent.name}</h4>
              <p className="text-[10px] text-muted-foreground">{typeLabels[agent.type] || agent.type}{agent.personality ? ` · ${agent.personality}` : ''}</p>
            </div>
          </div>
          <Badge className={cn(
            'h-5 text-[10px] px-2 border-0 font-medium',
            agent.isActive
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-zinc-100 text-zinc-500'
          )}>
            {agent.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>

        {/* Sparkline */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Últimos 7 días</span>
          </div>
          <MiniSparkline data={sparkData} maxVal={maxSpark} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Mensajes enviados</span>
            <span className="font-medium text-foreground">{metrics?.messagesSent ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Conversaciones</span>
            <span className="font-medium text-foreground">{metrics?.conversationsHandled ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tasa de éxito</span>
            <span className={cn('font-medium', metrics?.successRate == null ? 'text-muted-foreground' : metrics.successRate >= 70 ? 'text-emerald-600' : metrics.successRate >= 40 ? 'text-amber-600' : 'text-red-600')}>
              {metrics?.successRate == null ? 'Sin datos' : `${metrics.successRate}%`}
            </span>
          </div>
          <Separator className="my-1" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Última actividad
            </span>
            <span className="text-muted-foreground">{formatTimeAgo(metrics?.lastActivity ?? null)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentConfigDialog({
  agent,
  open,
  onOpenChange,
  onSave,
  onDelete,
  isSaving,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (data: Partial<Agent>) => void
  onDelete: () => void
  isSaving: boolean
}) {
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7)
  const [formData, setFormData] = useState({
    name: agent?.name || '',
    type: agent?.type || 'sales',
    personality: agent?.personality || '',
    model: agent?.model || 'llama-3.3-70b-versatile',
    maxTokens: agent?.maxTokens || 2048,
    isActive: agent?.isActive ?? true,
  })

  const handleSave = () => {
    onSave({
      name: formData.name,
      type: formData.type,
      personality: formData.personality,
      model: formData.model,
      temperature,
      maxTokens: formData.maxTokens,
      isActive: formData.isActive,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Configurar Agente: {agent.name}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
            <TabsTrigger value="model" className="flex-1">Modelo IA</TabsTrigger>
            <TabsTrigger value="personality" className="flex-1">Personalidad</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label>Nombre del agente</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.icon} {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Estado</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="model" className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label>Modelo</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="Ej: llama-3.3-70b-versatile"
              />
            </div>
            <div className="grid gap-2">
              <Label>Temperatura: {temperature}</Label>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">Valores bajos = respuestas más consistentes. Valores altos = más creativas.</p>
            </div>
            <div className="grid gap-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={formData.maxTokens}
                onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 2048 })}
              />
            </div>
          </TabsContent>
          <TabsContent value="personality" className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label>Personalidad</Label>
              <Select
                value={formData.personality}
                onValueChange={(v) => setFormData({ ...formData, personality: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JHON">JHON (Comercial)</SelectItem>
                  <SelectItem value="Professional">Profesional (B2B)</SelectItem>
                  <SelectItem value="Friendly">Amigable (Retail)</SelectItem>
                  <SelectItem value="Aggressive">Agresivo (Cierre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-between items-center mt-4">
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Eliminar
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AgentsViewProps {
  workspaceId: string
}

export function AgentsView({ workspaceId }: AgentsViewProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentMetrics, setAgentMetrics] = useState<Record<string, AgentMetrics>>({})
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // New agent form
  const [newAgent, setNewAgent] = useState({
    name: '',
    type: 'sales',
    personality: 'JHON',
    model: 'llama-3.3-70b-versatile',
  })

  const fetchAgents = useCallback(async () => {
    if (!workspaceId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/agents?workspaceId=${workspaceId}&includeInactive=true`)
      if (!res.ok) throw new Error('Error al cargar agentes')
      const data = await res.json()
      setAgents(data.items || data.agents || [])
    } catch {
      toast.error('Error al cargar agentes')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  const fetchMetrics = useCallback(async () => {
    if (!workspaceId) return
    try {
      setMetricsLoading(true)
      const res = await fetch(`/api/agents/metrics?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error('Error al cargar métricas')
      const data = await res.json()
      const metricsMap: Record<string, AgentMetrics> = {}
      for (const m of data.metrics || []) {
        metricsMap[m.agentId] = m
      }
      setAgentMetrics(metricsMap)
    } catch {
      // silent fail for metrics
    } finally {
      setMetricsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchAgents()
    fetchMetrics()
  }, [fetchAgents, fetchMetrics])

  const handleCreateAgent = async () => {
    if (!newAgent.name.trim() || !workspaceId || isCreating) return
    try {
      setIsCreating(true)
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: newAgent.name,
          type: newAgent.type,
          personality: newAgent.personality,
          model: newAgent.model,
        }),
      })
      if (!res.ok) throw new Error('Error al crear agente')
      setShowNewAgent(false)
      setNewAgent({ name: '', type: 'sales', personality: 'JHON', model: 'llama-3.3-70b-versatile' })
      await fetchAgents()
      await fetchMetrics()
    } catch (err) {
      console.error('Error creating agent:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdateAgent = async (data: Partial<Agent>) => {
    if (!selectedAgent || isSaving) return
    try {
      setIsSaving(true)
      const res = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Error al actualizar agente')
      setConfigOpen(false)
      setSelectedAgent(null)
      await fetchAgents()
      await fetchMetrics()
    } catch (err) {
      console.error('Error updating agent:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return
    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al eliminar agente')
      setConfigOpen(false)
      setSelectedAgent(null)
      setShowDeleteDialog(false)
      toast.success(`Agente "${selectedAgent.name}" eliminado correctamente`)
      await fetchAgents()
      await fetchMetrics()
    } catch (err) {
      toast.error('Error al eliminar agente')
      console.error('Error deleting agent:', err)
    }
  }

  const activeCount = agents.filter((a) => a.isActive).length

  // Summary metrics
  const totalMessages = Object.values(agentMetrics).reduce((sum, m) => sum + m.messagesSent, 0)
  const totalConversations = Object.values(agentMetrics).reduce((sum, m) => sum + m.conversationsHandled, 0)
  const agentsWithData = Object.values(agentMetrics).filter(m => m.hasRealData)
  const avgSuccessRate = agentsWithData.length > 0
    ? Math.round(agentsWithData.reduce((sum, m) => sum + (m.successRate || 0), 0) / agentsWithData.length)
    : null
  const totalDealsClosed = Object.values(agentMetrics).reduce((sum, m) => sum + m.dealsClosed, 0)

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold">Agentes IA</h3>
          <p className="text-sm text-muted-foreground">
            {activeCount} de {agents.length} agentes activos
          </p>
        </div>
        <Dialog open={showNewAgent} onOpenChange={setShowNewAgent}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              Nuevo Agente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Agente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Nombre del agente</Label>
                <Input
                  placeholder="Ej: VentaBot Pro"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select
                    value={newAgent.type}
                    onValueChange={(v) => setNewAgent({ ...newAgent, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.icon} {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Personalidad</Label>
                  <Select
                    value={newAgent.personality}
                    onValueChange={(v) => setNewAgent({ ...newAgent, personality: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JHON">JHON</SelectItem>
                      <SelectItem value="Professional">Profesional</SelectItem>
                      <SelectItem value="Friendly">Amigable</SelectItem>
                      <SelectItem value="Aggressive">Agresivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Modelo IA</Label>
                <Input
                  value={newAgent.model}
                  onChange={(e) => setNewAgent({ ...newAgent, model: e.target.value })}
                  placeholder="Ej: llama-3.3-70b-versatile"
                />
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreateAgent}
                disabled={!newAgent.name.trim() || isCreating}
              >
                {isCreating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Crear Agente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="agentes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="agentes" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="metricas" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Métricas
          </TabsTrigger>
        </TabsList>

        {/* Agents Grid Tab */}
        <TabsContent value="agentes">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-border/60">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-28 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="p-12 text-center">
                <div className="p-4 rounded-2xl bg-emerald-50 w-fit mx-auto mb-4">
                  <Bot className="h-10 w-10 text-emerald-600" />
                </div>
                <h4 className="text-sm font-semibold mb-1">Sin agentes configurados</h4>
                <p className="text-xs text-muted-foreground mb-4">Crea tu primer agente IA para automatizar conversaciones.</p>
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setShowNewAgent(true)}
                >
                  <Plus className="h-4 w-4" />
                  Crear Agente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  metrics={agentMetrics[agent.id]}
                  onConfigure={() => {
                    setSelectedAgent(agent)
                    setConfigOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metricas">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[10px] text-muted-foreground">Mensajes Totales</span>
                </div>
                <p className="text-lg font-bold">{totalMessages.toLocaleString('es-MX')}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[10px] text-muted-foreground">Conversaciones</span>
                </div>
                <p className="text-lg font-bold">{totalConversations.toLocaleString('es-MX')}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[10px] text-muted-foreground">Tasa Éxito Prom.</span>
                </div>
                <p className="text-lg font-bold">{avgSuccessRate == null ? 'Sin datos' : `${avgSuccessRate}%`}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[10px] text-muted-foreground">Deals Cerrados</span>
                </div>
                <p className="text-lg font-bold">{totalDealsClosed}</p>
              </CardContent>
            </Card>
          </div>

          {/* Metrics Table */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                Rendimiento por Agente
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {metricsLoading ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : Object.keys(agentMetrics).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin datos de métricas</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60">
                        <TableHead className="text-xs font-semibold text-muted-foreground">Agente</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Tipo</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Conversaciones</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Mensajes</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Tiempo Resp.</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Éxito %</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Calificados</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Cerrados</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground text-center">Última Act.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/40">
                      {Object.values(agentMetrics).map((m) => (
                        <TableRow key={m.agentId} className="hover:bg-muted/30">
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                m.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-100 text-zinc-400'
                              )}>
                                {typeIcons[m.agentType] || <Bot className="h-3.5 w-3.5" />}
                              </div>
                              <span className="text-xs font-medium text-foreground">{m.agentName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-center">
                            <Badge className="bg-muted text-muted-foreground border-0 text-[9px] px-1.5">
                              {typeLabels[m.agentType] || m.agentType}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-center text-xs font-medium">{m.conversationsHandled}</TableCell>
                          <TableCell className="py-3 text-center text-xs font-medium">{m.messagesSent}</TableCell>
                          <TableCell className="py-3 text-center text-xs text-muted-foreground">
                            {m.avgResponseTimeMs > 0 ? `${(m.avgResponseTimeMs / 1000).toFixed(1)}s` : '—'}
                          </TableCell>
                          <TableCell className="py-3 text-center">
                            <Badge className={cn(
                              'border-0 text-[9px] px-1.5 font-semibold',
                              m.successRate == null ? 'bg-gray-100 text-gray-500'
                                : m.successRate >= 70 ? 'bg-emerald-100 text-emerald-700'
                                  : m.successRate >= 40 ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            )}>
                              {m.successRate == null ? 'N/A' : `${m.successRate}%`}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-center text-xs font-medium">{m.leadsQualified}</TableCell>
                          <TableCell className="py-3 text-center text-xs font-medium">{m.dealsClosed}</TableCell>
                          <TableCell className="py-3 text-center text-[10px] text-muted-foreground">
                            {formatTimeAgo(m.lastActivity)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Config Dialog */}
      {selectedAgent && (
        <AgentConfigDialog
          key={selectedAgent.id}
          agent={selectedAgent}
          open={configOpen}
          onOpenChange={setConfigOpen}
          onSave={handleUpdateAgent}
          onDelete={() => setShowDeleteDialog(true)}
          isSaving={isSaving}
        />
      )}

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar agente?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el agente &quot;{selectedAgent?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAgent}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
