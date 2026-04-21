'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
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
  Trash2,
  Check,
  Filter,
  LayoutGrid,
  List,
  X,
  TrendingUp,
  BarChart3,
  Target,
} from 'lucide-react'
import { cn, formatCurrency, getInitials } from '@/lib/utils'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
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
import { Check as CheckIcon, ChevronsUpDown } from 'lucide-react'

// ── Types ──

interface Deal {
  id: string
  contactName: string
  title: string
  value: number
  daysInStage: number
  stage: string
  stageId: string
  phone?: string
  leadScore?: number
  source?: string
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

type ViewMode = 'kanban' | 'list'

// ── Helpers ──

function getScoreBorderColor(score: number | undefined): string {
  if (score === undefined || score === 0) return 'border-l-transparent'
  if (score >= 80) return 'border-l-emerald-500'
  if (score >= 50) return 'border-l-yellow-500'
  if (score >= 30) return 'border-l-orange-500'
  return 'border-l-red-500'
}

function getStageProbability(stageName: string): number {
  const defaultStage = DEFAULT_PIPELINE_STAGES.find(
    (s) => s.name.toLowerCase() === stageName.toLowerCase() ||
           stageName.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
  )
  return defaultStage?.probability ?? 0
}

// ── Sortable Deal Card ──

function DealCard({
  deal,
  overlay = false,
  onClick,
}: {
  deal: Deal
  overlay?: boolean
  onClick?: () => void
}) {
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
        'bg-background rounded-lg border border-border/60 p-3 cursor-pointer hover:shadow-md transition-all duration-200 border-l-[3px]',
        getScoreBorderColor(deal.leadScore),
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-xl rotate-2'
      )}
      onClick={onClick}
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
            {deal.leadScore !== undefined && deal.leadScore > 0 && (
              <Badge variant="secondary" className={cn(
                "text-[9px] px-1 py-0 border-0",
                deal.leadScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                deal.leadScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                deal.leadScore >= 30 ? "bg-orange-100 text-orange-700" :
                "bg-red-100 text-red-700"
              )}>
                {deal.leadScore}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{deal.title}</p>
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
          {deal.daysInStage > 7 && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-orange-500">
              <AlertCircle className="h-3 w-3" />
              {deal.daysInStage}d sin movimiento
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── List View Deal Row ──

function DealListRow({
  deal,
  stageColor,
  stageName,
  onClick,
}: {
  deal: Deal
  stageColor: string
  stageName: string
  onClick?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors cursor-pointer border-l-[3px]',
        getScoreBorderColor(deal.leadScore)
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px] font-semibold">
            {getInitials(deal.contactName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate">{deal.contactName}</span>
            {deal.leadScore !== undefined && deal.leadScore > 0 && (
              <Badge variant="secondary" className={cn(
                "text-[9px] px-1 py-0 border-0",
                deal.leadScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                deal.leadScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                deal.leadScore >= 30 ? "bg-orange-100 text-orange-700" :
                "bg-red-100 text-red-700"
              )}>
                {deal.leadScore}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{deal.title}</p>
        </div>
      </div>
      <Badge
        variant="secondary"
        className="text-[10px] border-0 shrink-0 hidden sm:inline-flex"
        style={{ backgroundColor: stageColor + '20', color: stageColor }}
      >
        {stageName}
      </Badge>
      <span className="text-xs font-bold text-emerald-600 w-24 text-right shrink-0">
        {formatCurrency(deal.value)}
      </span>
      <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0 hidden sm:block">
        {deal.daysInStage}d
      </span>
      {deal.daysInStage > 7 && (
        <Badge variant="secondary" className="text-[9px] border-0 bg-orange-100 text-orange-600 shrink-0 hidden md:inline-flex">
          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
          Estancado
        </Badge>
      )}
    </div>
  )
}

// ── Pipeline Column ──

function PipelineColumn({
  stage,
  deals,
  onDealClick,
  probability,
  weightedValue,
}: {
  stage: Stage
  deals: Deal[]
  onDealClick?: (deal: Deal) => void
  probability: number
  weightedValue: number
}) {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="min-w-[260px] w-[260px] lg:w-auto lg:flex-1">
      <div className="flex items-center justify-between mb-1">
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
      </div>

      {/* Probability & Value Info */}
      <div className="flex items-center justify-between mb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Target className="h-3 w-3" />
          {probability}%
        </span>
        <div className="flex items-center gap-2">
          {totalValue > 0 && (
            <span className="font-medium">{formatCurrency(totalValue)}</span>
          )}
          {weightedValue > 0 && totalValue !== weightedValue && (
            <span className="text-emerald-600 font-medium">
              ≈ {formatCurrency(weightedValue)}
            </span>
          )}
        </div>
      </div>

      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px] p-1 rounded-lg border-2 border-dashed border-border/30 bg-muted/10 transition-colors hover:border-border/50">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClick={() => onDealClick?.(deal)} />
          ))}
          {deals.length === 0 && (
            <div className="flex flex-col items-center justify-center h-20 text-xs text-muted-foreground gap-1.5">
              <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                <Plus className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <span className="text-muted-foreground/60">Arrastra aquí</span>
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
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  // Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [filterSource, setFilterSource] = useState('all')
  const [filterScoreMin, setFilterScoreMin] = useState<string>('0')

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

      // We need the actual stage deals — reconstruct from the API data
      const apiDealsMap: Record<string, Deal[]> = {}
      for (const s of pipeline.stages) {
        const stageDeals = (s as unknown as { deals: Array<{ id: string; title: string; value: number; contact: { firstName: string; lastName: string; phone?: string; leadScore?: number; source?: string } | null; createdAt: string }> } | undefined)?.deals || []
        apiDealsMap[s.name] = stageDeals.map((d) => {
          const contact = d.contact
          const contactName = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Sin contacto'
          const created = new Date(d.createdAt)
          const now = new Date()
          const daysInStage = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000))
          return {
            id: d.id,
            contactName,
            title: d.title,
            value: d.value,
            daysInStage,
            stage: s.name,
            stageId: s.id,
            phone: contact?.phone || undefined,
            leadScore: contact?.leadScore || 0,
            source: contact?.source || undefined,
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

  // Filtered deals
  const filteredDealsByStage = useMemo(() => {
    const filtered: Record<string, Deal[]> = {}
    for (const [stageName, deals] of Object.entries(dealsByStage)) {
      let result = deals
      if (filterSource !== 'all') {
        result = result.filter((d) => d.source === filterSource)
      }
      if (filterScoreMin !== '0') {
        const minScore = parseInt(filterScoreMin)
        result = result.filter((d) => (d.leadScore || 0) >= minScore)
      }
      filtered[stageName] = result
    }
    return filtered
  }, [dealsByStage, filterSource, filterScoreMin])

  // Computed stats
  const pipelineStats = useMemo(() => {
    const allDeals = Object.values(filteredDealsByStage).flat()
    const activeDeals = allDeals.filter((d) => {
      const stage = stages.find(s => s.name === d.stage)
      return stage && !stage.isWon && !stage.isLost
    })
    const wonDeals = allDeals.filter((d) => {
      const stage = stages.find(s => s.name === d.stage)
      return stage && stage.isWon
    })
    const lostDeals = allDeals.filter((d) => {
      const stage = stages.find(s => s.name === d.stage)
      return stage && stage.isLost
    })
    const totalActiveValue = activeDeals.reduce((sum, d) => sum + d.value, 0)
    const totalDeals = allDeals.length
    const avgDealValue = totalDeals > 0 ? Math.round(totalActiveValue / Math.max(activeDeals.length, 1)) : 0
    const winRate = (wonDeals.length + lostDeals.length) > 0
      ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
      : 0

    return { totalActiveValue, totalDeals, avgDealValue, winRate, activeDealsCount: activeDeals.length }
  }, [filteredDealsByStage, stages])

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

  const handleDeleteDeal = async (dealId: string) => {
    try {
      setDeletingDealId(dealId)
      const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Trato eliminado')
      setSelectedDeal(null)
      fetchPipeline()
    } catch {
      toast.error('Error al eliminar trato')
    } finally {
      setDeletingDealId(null)
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

  const activeFilters = (filterSource !== 'all' || filterScoreMin !== '0')

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
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h3 className="text-lg font-semibold">Pipeline de Ventas</h3>
          <p className="text-sm text-muted-foreground">
            {pipelineStats.totalDeals} tratos en total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center border border-border/60 rounded-lg p-0.5 bg-muted/30">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'kanban'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Filter Toggle */}
          <Button
            size="sm"
            variant="outline"
            className={cn("gap-1.5", activeFilters && "border-emerald-300 bg-emerald-50 text-emerald-700")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilters && <X className="h-3 w-3 ml-0.5" />}
          </Button>

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
                  <Label>Nombre del trato</Label>
                  <Input placeholder="Ej: Consultoría mensual" value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)} />
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
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 shrink-0">
        <Card className="border-border/40 bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Valor Pipeline</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(pipelineStats.totalActiveValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Total Tratos</p>
                <p className="text-sm font-bold">{pipelineStats.totalDeals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50">
                <DollarSign className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Valor Promedio</p>
                <p className="text-sm font-bold">{formatCurrency(pipelineStats.avgDealValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-50">
                <Target className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Tasa de Cierre</p>
                <p className="text-sm font-bold">{pipelineStats.winRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border border-border/40 bg-muted/20 shrink-0">
          <span className="text-xs font-medium text-muted-foreground">Filtrar por:</span>
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Fuente:</Label>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-7 w-[140px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="webchat">Web Chat</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Score mín:</Label>
            <Select value={filterScoreMin} onValueChange={setFilterScoreMin}>
              <SelectTrigger className="h-7 w-[120px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todos</SelectItem>
                <SelectItem value="30">30+</SelectItem>
                <SelectItem value="50">50+</SelectItem>
                <SelectItem value="70">70+</SelectItem>
                <SelectItem value="80">80+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={() => { setFilterSource('all'); setFilterScoreMin('0') }}
            >
              <X className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      )}

      {/* Deal Detail Dialog */}
      <Dialog open={!!selectedDeal} onOpenChange={(open) => { if (!open) setSelectedDeal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDeal?.title}</DialogTitle>
          </DialogHeader>
          {selectedDeal && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valor</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedDeal.value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Etapa</p>
                  <p className="text-sm font-medium">{selectedDeal.stage}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Días en etapa</p>
                  <p className="text-sm font-medium">{selectedDeal.daysInStage}d</p>
                </div>
                {selectedDeal.leadScore !== undefined && selectedDeal.leadScore > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Lead Score</p>
                    <Badge variant="secondary" className={cn(
                      "text-[10px] px-1.5 py-0.5 border-0",
                      selectedDeal.leadScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                      selectedDeal.leadScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                      selectedDeal.leadScore >= 30 ? "bg-orange-100 text-orange-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {selectedDeal.leadScore}
                    </Badge>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Contacto</p>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px] font-semibold">
                      {getInitials(selectedDeal.contactName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{selectedDeal.contactName}</span>
                </div>
                {selectedDeal.phone && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedDeal.phone}
                  </p>
                )}
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedDeal(null)}
                >
                  Cerrar
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => handleDeleteDeal(selectedDeal.id)}
                  disabled={deletingDealId === selectedDeal.id}
                >
                  {deletingDealId === selectedDeal.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pipeline Board / List View */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {viewMode === 'kanban' ? (
          <ScrollArea className="flex-1">
            <div className="flex gap-4 pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:min-w-0 overflow-x-auto min-h-full">
              {stages.map((stage) => {
                const deals = filteredDealsByStage[stage.name] || []
                const probability = getStageProbability(stage.name)
                const weightedValue = Math.round(deals.reduce((sum, d) => sum + d.value, 0) * (probability / 100))
                return (
                  <PipelineColumn
                    key={stage.id}
                    stage={stage}
                    deals={deals}
                    onDealClick={setSelectedDeal}
                    probability={probability}
                    weightedValue={weightedValue}
                  />
                )
              })}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-1 pb-4">
              {stages.map((stage) => {
                const deals = filteredDealsByStage[stage.name] || []
                if (deals.length === 0) return null
                return (
                  <div key={stage.id}>
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <h4 className="text-xs font-semibold text-foreground">{stage.name}</h4>
                      <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-muted border-0">
                        {deals.length}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatCurrency(deals.reduce((s, d) => s + d.value, 0))}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">
                        ({getStageProbability(stage.name)}% prob.)
                      </span>
                    </div>
                    {deals.map((deal) => (
                      <DealListRow
                        key={deal.id}
                        deal={deal}
                        stageColor={stage.color}
                        stageName={stage.name}
                        onClick={() => setSelectedDeal(deal)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
