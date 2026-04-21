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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_TYPES } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
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

function AgentCard({ agent, onConfigure }: { agent: Agent; onConfigure: () => void }) {
  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer" onClick={onConfigure}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Modelo</span>
            <span className="font-medium text-foreground truncate max-w-[140px]">{agent.model || '—'}</span>
          </div>
          {agent.temperature !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Temperatura</span>
              <span className="font-medium text-foreground">{agent.temperature}</span>
            </div>
          )}
          {agent.maxTokens !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max Tokens</span>
              <span className="font-medium text-foreground">{agent.maxTokens}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Creado</span>
            <span className="text-muted-foreground">{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString('es-MX') : '—'}</span>
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
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
      const res = await fetch(`/api/agents?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error('Error al cargar agentes')
      const data = await res.json()
      setAgents(data.agents || [])
    } catch {
      toast.error('Error al cargar agentes')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

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
    } catch (err) {
      toast.error('Error al eliminar agente')
      console.error('Error deleting agent:', err)
    }
  }

  const activeCount = agents.filter((a) => a.isActive).length

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

      {/* Agent Grid */}
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
              onConfigure={() => {
                setSelectedAgent(agent)
                setConfigOpen(true)
              }}
            />
          ))}
        </div>
      )}

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
