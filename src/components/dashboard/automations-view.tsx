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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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
}

interface AutomationsViewProps {
  workspaceId: string
}

const triggerIcons: Record<string, React.ReactNode> = {
  message_received: <MessageSquare className="h-4 w-4" />,
  schedule: <Calendar className="h-4 w-4" />,
  event: <Zap className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  deal_stage_change: <ArrowRight className="h-4 w-4" />,
}

const triggerColors: Record<string, string> = {
  message_received: 'bg-emerald-100 text-emerald-600',
  schedule: 'bg-blue-100 text-blue-600',
  event: 'bg-orange-100 text-orange-600',
  webhook: 'bg-purple-100 text-purple-600',
  deal_stage_change: 'bg-yellow-100 text-yellow-600',
}

const triggerLabels: Record<string, string> = {
  message_received: 'Mensaje recibido',
  schedule: 'Programado',
  event: 'Evento',
  webhook: 'Webhook',
  deal_stage_change: 'Cambio de Etapa',
}

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

  const handleRunNow = () => {
    toast.success('Ejecución manual de automatización iniciada')
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold">Automatizaciones</h3>
          <p className="text-sm text-muted-foreground">
            {activeCount} de {automations.length} activas
          </p>
        </div>
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
          automations.map((automation) => (
            <Card key={automation.id} className="border-border/60 hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
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
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{automation.name}</h4>
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
                            <DropdownMenuItem onClick={handleRunNow}>
                              <Play className="h-3 w-3 mr-1" />
                              Ejecutar ahora
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

                    {/* Trigger & Stats */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {triggerLabels[automation.triggerType] || automation.triggerType}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        {automation.actions?.length || 0} acciones
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Creada: {timeAgo(new Date(automation.createdAt))}
                      </div>
                    </div>

                    {/* Actions Flow */}
                    {automation.actions && automation.actions.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        {automation.actions.map((action, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] bg-muted border-0">
                              {action.description || action.type}
                            </Badge>
                            {index < automation.actions.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active/Inactive indicator */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        automation.isActive ? 'bg-emerald-500' : 'bg-zinc-300'
                      )}
                      style={{ width: automation.isActive ? '100%' : '0%' }}
                    />
                  </div>
                  <span className={cn(
                    'text-[10px] font-semibold',
                    automation.isActive ? 'text-emerald-600' : 'text-zinc-400'
                  )}>
                    {automation.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
