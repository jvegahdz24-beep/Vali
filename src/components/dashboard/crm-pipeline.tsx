'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  GripVertical,
  Phone,
  Calendar,
  DollarSign,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { cn, formatCurrency, getInitials } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'

// ── Types ──

interface Deal {
  id: string
  contactName: string
  vehicle: string
  value: number
  daysInStage: number
  stage: string
  stageId: string
  phone?: string
}

interface Stage {
  id: string
  name: string
  order: number
  color: string
  isWon: boolean
  isLost: boolean
}

interface CrmPipelineProps {
  workspaceId: string
}

// ── Sortable Deal Card ──

function DealCard({ deal, overlay = false }: { deal: Deal; overlay?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal.id,
    data: {
      type: 'deal',
      deal,
    },
  })

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-background rounded-lg border border-border/60 p-3 cursor-pointer hover:shadow-md transition-all duration-200',
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-xl rotate-2'
      )}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px] font-semibold">
                {getInitials(deal.contactName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold text-foreground truncate">
              {deal.contactName}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{deal.vehicle}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs font-bold text-emerald-600">
              {formatCurrency(deal.value)}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {deal.daysInStage}d
            </span>
          </div>
          {deal.phone && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
              <Phone className="h-3 w-3" />
              {deal.phone}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pipeline Column ──

function PipelineColumn({
  stage,
  deals,
}: {
  stage: Stage
  deals: Deal[]
}) {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="min-w-[260px] w-[260px] lg:w-auto lg:flex-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="text-xs font-semibold text-foreground">{stage.name}</h3>
          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-muted border-0">
            {deals.length}
          </Badge>
        </div>
        {totalValue > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>

      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px] p-1 rounded-lg bg-muted/20">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
          {deals.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
              Sin tratos
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ── Main Pipeline View ──

export function CrmPipeline({ workspaceId }: CrmPipelineProps) {
  const [dealsByStage, setDealsByStage] = useState<Record<string, Deal[]>>({})
  const [stages, setStages] = useState<Stage[]>([])
  const [pipelineId, setPipelineId] = useState<string>('')
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [newDealTitle, setNewDealTitle] = useState('')
  const [newDealValue, setNewDealValue] = useState('')
  const [newDealStage, setNewDealStage] = useState('')
  const [newDealContact, setNewDealContact] = useState('')
  const [contactPickerOpen, setContactPickerOpen] = useState(false)
  const [contacts, setContacts] = useState<Array<{ id: string; firstName: string; lastName: string | null; phone: string | null }>>([])
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [creatingDeal, setCreatingDeal] = useState(false)

  // Fetch contacts when deal dialog opens
  const fetchContacts = useCallback(async (search = '') => {
    if (!workspaceId) return
    try {
      setLoadingContacts(true)
      const params = new URLSearchParams({ workspaceId, limit: '50' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/contacts?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setContacts(data.items || [])
    } catch {
      // Silently fail — contact picker is optional
    } finally {
      setLoadingContacts(false)
    }
  }, [workspaceId])

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleContactSearch = useCallback((value: string) => {
    setContactSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      fetchContacts(value)
    }, 250)
  }, [fetchContacts])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  )

  const fetchPipeline = useCallback(async () => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/pipeline?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error('Error al cargar pipeline')
      const data = await res.json()

      if (!data.items || data.items.length === 0) {
        setDealsByStage({})
        setStages([])
        setLoading(false)
        return
      }

      const pipeline = data.items[0]
      setPipelineId(pipeline.id)

      const stageList: Stage[] = pipeline.stages.map((s: Stage) => ({
        id: s.id,
        name: s.name,
        order: s.order,
        color: s.color,
        isWon: s.isWon,
        isLost: s.isLost,
      }))
      setStages(stageList)

      const dealsMap: Record<string, Deal[]> = {}
      for (const stage of stageList) {
        dealsMap[stage.name] = (stage as unknown as { deals: Array<{ id: string; title: string; value: number; contact: { firstName: string; lastName: string } | null; createdAt: string }> } | undefined)?.deals?.map((d) => {
          const contact = d.contact
          const contactName = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Sin contacto'
          const created = new Date(d.createdAt)
          const now = new Date()
          const daysInStage = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000))
          return {
            id: d.id,
            contactName,
            vehicle: d.title,
            value: d.value,
            daysInStage,
            stage: stage.name,
            stageId: stage.id,
          }
        }) || []
      }
      // We need the actual stage deals — reconstruct from the API data
      const apiDealsMap: Record<string, Deal[]> = {}
      for (const s of pipeline.stages) {
        const stageDeals = (s as unknown as { deals: Array<{ id: string; title: string; value: number; contact: { firstName: string; lastName: string } | null; createdAt: string }> } | undefined)?.deals || []
        apiDealsMap[s.name] = stageDeals.map((d) => {
          const contact = d.contact
          const contactName = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Sin contacto'
          const created = new Date(d.createdAt)
          const now = new Date()
          const daysInStage = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000))
          return {
            id: d.id,
            contactName,
            vehicle: d.title,
            value: d.value,
            daysInStage,
            stage: s.name,
            stageId: s.id,
          }
        })
      }
      setDealsByStage(apiDealsMap)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchPipeline()
  }, [fetchPipeline])

  const getStageDealIds = useCallback(
    (stageName: string) => {
      return (dealsByStage[stageName] || []).map((d) => d.id)
    },
    [dealsByStage]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const deal = Object.values(dealsByStage)
      .flat()
      .find((d) => d.id === active.id)
    if (deal) setActiveDeal(deal)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null)
    const { active, over } = event

    if (!over) return

    const activeDealData = Object.values(dealsByStage)
      .flat()
      .find((d) => d.id === active.id)

    if (!activeDealData) return

    // Find the target stage by checking which sortable context contains the over.id
    let targetStage: Stage | null = null
    let targetStageName: string | null = null
    for (const stage of stages) {
      const deals = dealsByStage[stage.name] || []
      if (deals.some((d) => d.id === over.id)) {
        targetStage = stage
        targetStageName = stage.name
        break
      }
    }

    if (!targetStage || !targetStageName) return

    if (activeDealData.stage === targetStageName) {
      // Reorder within same stage
      const stageDeals = [...dealsByStage[targetStageName]]
      const oldIndex = stageDeals.findIndex((d) => d.id === active.id)
      const newIndex = stageDeals.findIndex((d) => d.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        setDealsByStage({
          ...dealsByStage,
          [targetStageName]: arrayMove(stageDeals, oldIndex, newIndex),
        })
      }
    } else {
      // Move to different stage — optimistic update + API call
      setDealsByStage({
        ...dealsByStage,
        [activeDealData.stage]: dealsByStage[activeDealData.stage].filter(
          (d) => d.id !== activeDealData.id
        ),
        [targetStageName]: [
          ...dealsByStage[targetStageName],
          { ...activeDealData, stage: targetStageName, stageId: targetStage.id, daysInStage: 0 },
        ],
      })

      try {
        await fetch('/api/deals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeDealData.id, stageId: targetStage.id }),
        })
      } catch {
        // Revert on error
        setDealsByStage((prev) => ({
          ...prev,
          [targetStageName]: (prev[targetStageName] || []).filter((d) => d.id !== activeDealData.id),
          [activeDealData.stage]: [...(prev[activeDealData.stage] || []), activeDealData],
        }))
      }
    }
  }

  const handleCreateDeal = async () => {
    if (!newDealTitle || !newDealStage) return

    try {
      setCreatingDeal(true)
      const targetStage = stages.find((s) => s.name === newDealStage)
      if (!targetStage) return

      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          pipelineId,
          stageId: targetStage.id,
          title: newDealTitle,
          value: parseInt(newDealValue) || 0,
          contactId: newDealContact || undefined,
        }),
      })

      if (!res.ok) throw new Error('Error al crear trato')

      // Reset form and refresh
      setNewDealTitle('')
      setNewDealValue('')
      setNewDealStage('')
      setNewDealContact('')
      setContactSearch('')
      setShowNewDeal(false)
      fetchPipeline()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear trato'
      toast.error(message)
    } finally {
      setCreatingDeal(false)
    }
  }

  const totalPipeline = Object.values(dealsByStage)
    .flat()
    .filter((d) => !['Cerrado Ganado', 'Cerrado Perdido'].includes(d.stage))
    .reduce((sum, d) => sum + d.value, 0)

  if (loading) {
    return (
      <div className="p-4 lg:p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <Skeleton className="h-6 w-40 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex gap-4 flex-1 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:min-w-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="min-w-[260px] w-[260px] lg:w-auto lg:flex-1 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6" />
              </div>
              <div className="space-y-2 p-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6 h-full flex items-center justify-center">
        <Card className="border-border/60 max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button onClick={fetchPipeline} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (stages.length === 0) {
    return (
      <div className="p-4 lg:p-6 h-full flex items-center justify-center">
        <Card className="border-border/60 max-w-md">
          <CardContent className="p-8 text-center">
            <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay pipeline configurado</p>
            <p className="text-xs text-muted-foreground mt-1">Crea un pipeline para comenzar a gestionar tus tratos</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-lg font-semibold">Pipeline de Ventas</h3>
          <p className="text-sm text-muted-foreground">
            Valor total del pipeline: <span className="font-semibold text-emerald-600">{formatCurrency(totalPipeline)}</span>
          </p>
        </div>
        <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              Nuevo Trato
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Trato</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Título del trato</Label>
                <Input placeholder="Ej: Honda CR-V 2024" value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Valor estimado</Label>
                  <Input placeholder="$0" type="number" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Etapa</Label>
                  <Select value={newDealStage} onValueChange={setNewDealStage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Contacto (opcional)</Label>
                <Popover open={contactPickerOpen} onOpenChange={(open) => {
                  setContactPickerOpen(open)
                  if (open) fetchContacts(contactSearch)
                }}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={contactPickerOpen}
                      className="w-full justify-between text-left font-normal h-9"
                    >
                      {newDealContact
                        ? (() => {
                            const selected = contacts.find((c) => c.id === newDealContact)
                            return selected
                              ? `${selected.firstName} ${selected.lastName || ''}`.trim()
                              : 'Seleccionar contacto...'
                          })()
                        : 'Seleccionar contacto...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar contacto..."
                        value={contactSearch}
                        onValueChange={handleContactSearch}
                      />
                      <CommandList className="max-h-64">
                        <CommandEmpty>
                          {loadingContacts ? 'Buscando...' : 'No se encontraron contactos.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {contacts.map((contact) => (
                            <CommandItem
                              key={contact.id}
                              value={contact.id}
                              onSelect={() => {
                                setNewDealContact(contact.id === newDealContact ? '' : contact.id)
                                setContactPickerOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4 shrink-0',
                                  newDealContact === contact.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {contact.firstName} {contact.lastName || ''}
                                </span>
                                {contact.phone && (
                                  <span className="text-xs text-muted-foreground">{contact.phone}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {newDealContact && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setNewDealContact('')
                      setContactSearch('')
                    }}
                  >
                    Quitar contacto seleccionado
                  </button>
                )}
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreateDeal}
                disabled={creatingDeal || !newDealTitle || !newDealStage}
              >
                {creatingDeal && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear Trato
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="flex-1">
          <div className="flex gap-4 pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:min-w-0 overflow-x-auto min-h-full">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.name] || []}
              />
            ))}
          </div>
        </ScrollArea>
        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
