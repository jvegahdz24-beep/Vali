'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { EventBusTicker } from '@/components/dashboard/event-bus-ticker'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
  Star,
  Clock,
  ListChecks,
  Activity,
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
import { Textarea } from '@/components/ui/textarea'
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
  contactId?: string
  contactName: string
  title: string
  value: number
  currency?: string
  description?: string | null
  daysInStage: number
  stage: string
  stageId: string
  phone?: string
  email?: string
  leadScore?: number
  source?: string
  temperature?: string
  tags?: string[]
  notes?: string | null
  lastMessageAt?: string | null
  expectedCloseDate?: string | null
  preferredProduct?: string | null
  budget?: string | null
  mainObjection?: string | null
  timeline?: string | null
  urgencyLevel?: string | null
  priceSensitivity?: string | null
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

function parseTags(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

const LEGACY_PIPELINE_PRODUCTS = [
  'sentra', 'versa', 'altima', 'kick', 'pathfinder', 'frontier', 'titan',
  'corolla', 'rav4', 'camry', 'hilux', 'prius', 'yaris', 'silverado',
  'tracker', 'equinox', 'trax', 'captiva', 'blazer', 'suburban', 'cx-3',
  'cx-5', 'cx-30', 'cx-50', 'cx-90', 'seltos', 'sportage', 'rio', 'k5',
  'sorento', 'carnival', 'telluride', 'cr-v', 'civic', 'hr-v', 'accord',
  'fit', 'city', 'brio', 'mustang', 'bronco', 'ranger', 'maverick',
  'explorer', 'escape', 'tucson', 'creta', 'accent', 'venue', 'santa fe',
  'jetta', 'taos', 'golf', 'tiguan', 'polo', 'compass', 'cherokee',
  'wrangler', 'gladiator', 'outlander', 'asx', 'l200', 'mirage',
]

function normalizePipelineText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLegacyPipelineDeal(title: string): boolean {
  const normalized = normalizePipelineText(title)
  return normalized.endsWith('lead whatsapp') ||
    normalized.endsWith('oportunidad') ||
    LEGACY_PIPELINE_PRODUCTS.some((product) => normalized.endsWith(` ${product}`) || normalized.endsWith(`- ${product}`))
}

function parseBudgetAmount(value?: string | null): number {
  if (!value) return 0
  const numbers = value.match(/\d[\d,.\s]*/g)
  if (!numbers?.length) return 0
  const parsed = numbers
    .map((raw) => Number(raw.replace(/[,\s]/g, '')))
    .filter((num) => Number.isFinite(num) && num > 0)
  return parsed.length > 0 ? Math.max(...parsed) : 0
}

function formatDate(value?: string | null): string {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin dato'
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
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
      style={{ ...style, touchAction: 'manipulation' }}
      {...attributes}
      {...listeners}
      className={cn(
        'bg-background rounded-lg border border-border/60 p-3 cursor-pointer hover:shadow-md transition-all duration-200 border-l-[3px] select-none',
        getScoreBorderColor(deal.leadScore),
        isDragging && 'opacity-50 shadow-lg',
        overlay && 'shadow-xl rotate-2'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-zinc-600 to-zinc-800 text-white text-[9px] font-semibold">
                {getInitials(deal.contactName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground truncate block leading-tight">{deal.contactName}</span>
              <span className="text-[10px] text-muted-foreground truncate block leading-tight">{deal.preferredProduct || deal.title}</span>
            </div>
            {deal.leadScore !== undefined && deal.leadScore > 0 && (
              <Badge variant="secondary" className={cn(
                "text-[9px] px-1 py-0 border-0 shrink-0",
                deal.leadScore >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" :
                deal.leadScore >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300" :
                deal.leadScore >= 30 ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" :
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
              )}>
                {deal.leadScore}
              </Badge>
            )}
          </div>
          <p className="text-sm font-bold text-emerald-500 mt-2">{formatCurrency(deal.value)}</p>
          {/* Probabilidad + barra (como el mockup) */}
          {(() => {
            const prob = getStageProbability(deal.stage)
            const barColor = prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-500' : 'bg-blue-500'
            return (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Probabilidad</span><span className="font-semibold text-foreground">{prob}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden"><div className={cn('h-full rounded-full', barColor)} style={{ width: `${prob}%` }} /></div>
              </div>
            )
          })()}
          <div className="flex items-center justify-between mt-2">
            <span className={cn('text-[10px] flex items-center gap-1', deal.daysInStage > 15 ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
              {deal.daysInStage > 15 ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {deal.daysInStage > 15 ? `${deal.daysInStage}d sin actividad` : `${deal.daysInStage}d`}
            </span>
            <Star className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
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
        <div className="space-y-2 min-h-[100px] max-h-[calc(100vh-430px)] overflow-y-auto custom-scroll p-1 rounded-lg border-2 border-dashed border-border/30 bg-muted/10 transition-colors hover:border-border/50">
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
  const [savingDeal, setSavingDeal] = useState(false)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  // Acceso directo desde el Tablero ("Nueva Oportunidad") → abre el modal al llegar
  useEffect(() => {
    try {
      if (sessionStorage.getItem('vaf-quick-action') === 'new-deal') {
        sessionStorage.removeItem('vaf-quick-action')
        setShowNewDeal(true)
      }
    } catch { /* */ }
  }, [])

  // Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [filterSource, setFilterSource] = useState('all')
  const [filterScoreMin, setFilterScoreMin] = useState<string>('0')

  // Form state
  const [newDealTitle, setNewDealTitle] = useState('')
  const [newDealValue, setNewDealValue] = useState('')
  const [newDealStage, setNewDealStage] = useState('')
  const [newDealContact, setNewDealContact] = useState('')
  const [editDealTitle, setEditDealTitle] = useState('')
  const [editDealValue, setEditDealValue] = useState('')
  const [editDealStageId, setEditDealStageId] = useState('')
  const [editDealDescription, setEditDealDescription] = useState('')
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

  // Sensores: mouse (arrastre tras 5px) + TÁCTIL con mantener-presionado (220ms).
  // En móvil el deslizamiento normal hace SCROLL del tablero y el arrastre solo
  // inicia si dejas el dedo quieto sobre la tarjeta. (Antes PointerSensor
  // capturaba el touch y el tablero no tenía movilidad en celular.)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )

  useEffect(() => {
    if (!selectedDeal) return
    setEditDealTitle(selectedDeal.title)
    setEditDealValue(String(selectedDeal.value || ''))
    setEditDealStageId(selectedDeal.stageId)
    setEditDealDescription(selectedDeal.description || '')
  }, [selectedDeal])

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
        const stageDeals = (s as unknown as {
          deals: Array<{
            id: string
            title: string
            value: number
            currency?: string
            description?: string | null
            source?: string
            expectedCloseDate?: string | null
            createdAt: string
            updatedAt?: string
            contactId?: string | null
            contact: {
              id: string
              firstName: string
              lastName: string | null
              phone?: string | null
              email?: string | null
              leadScore?: number
              source?: string
              temperature?: string
              tags?: string
              notes?: string | null
              lastMessageAt?: string | null
              createdAt?: string
              leadProfile?: {
                preferredProduct?: string | null
                budget?: string | null
                mainObjection?: string | null
                timeline?: string | null
                urgencyLevel?: string | null
                priceSensitivity?: string | null
              } | null
            } | null
          }>
        } | undefined)?.deals || []
        apiDealsMap[s.name] = stageDeals.map((d) => {
          const contact = d.contact
          const contactName = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Sin contacto'
          const preferredProduct = contact?.leadProfile?.preferredProduct || null
          const legacyDeal = isLegacyPipelineDeal(d.title)
          const created = new Date(d.updatedAt || d.createdAt)
          const now = new Date()
          const daysInStage = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000))
          return {
            id: d.id,
            contactId: d.contactId || contact?.id,
            contactName,
            title: legacyDeal ? `${contactName} — ${preferredProduct || 'Oportunidad'}` : d.title,
            value: legacyDeal ? parseBudgetAmount(contact?.leadProfile?.budget) : d.value,
            currency: d.currency,
            description: d.description,
            daysInStage,
            stage: s.name,
            stageId: s.id,
            phone: contact?.phone || undefined,
            email: contact?.email || undefined,
            leadScore: contact?.leadScore || 0,
            source: d.source || contact?.source || undefined,
            temperature: contact?.temperature || undefined,
            tags: parseTags(contact?.tags),
            notes: contact?.notes || null,
            lastMessageAt: contact?.lastMessageAt || null,
            expectedCloseDate: d.expectedCloseDate || null,
            preferredProduct,
            budget: contact?.leadProfile?.budget || null,
            mainObjection: contact?.leadProfile?.mainObjection || null,
            timeline: contact?.leadProfile?.timeline || null,
            urgencyLevel: contact?.leadProfile?.urgencyLevel || null,
            priceSensitivity: contact?.leadProfile?.priceSensitivity || null,
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

    // Valor ponderado (probabilidad × valor) de los tratos activos
    const weightedValue = activeDeals.reduce((sum, d) => sum + Math.round(d.value * (getStageProbability(d.stage) / 100)), 0)
    return { totalActiveValue, totalDeals, avgDealValue, winRate, activeDealsCount: activeDeals.length, weightedValue, wonCount: wonDeals.length }
  }, [filteredDealsByStage, stages])

  // Orden del pipeline como el mockup: activas por orden ascendente, luego ganado, y perdido al final.
  const orderedStages = useMemo(() => {
    const rank = (s: Stage) => (s.isLost ? 3 : s.isWon ? 2 : 1)
    return [...stages].sort((a, b) => rank(a) - rank(b) || a.order - b.order)
  }, [stages])

  // Widgets inferiores (datos reales derivados de los tratos)
  const bottomStats = useMemo(() => {
    const active = Object.values(filteredDealsByStage).flat().filter((d) => {
      const st = stages.find((s) => s.name === d.stage)
      return st && !st.isWon && !st.isLost
    })
    const atRisk = active.filter((d) => d.daysInStage > 15).length
    const needMove = active.filter((d) => d.daysInStage >= 3).length
    const recent = [...active]
      .filter((d) => d.lastMessageAt)
      .sort((a, b) => new Date(b.lastMessageAt!).getTime() - new Date(a.lastMessageAt!).getTime())
      .slice(0, 4)
    return { atRisk, needMove, recent }
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
        const res = await fetch('/api/deals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeDealData.id, stageId: targetStage.id }),
        })
        if (!res.ok) throw new Error('No se pudo mover el trato')
      } catch {
        toast.error('No se pudo mover el trato')
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

  const handleUpdateDeal = async () => {
    if (!selectedDeal) return
    const title = editDealTitle.trim()
    if (!title) {
      toast.error('El nombre del trato es requerido')
      return
    }

    try {
      setSavingDeal(true)
      const numericValue = editDealValue.trim() ? Number(editDealValue) : 0
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        toast.error('El valor debe ser un número válido')
        return
      }

      const res = await fetch(`/api/deals/${selectedDeal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          value: numericValue,
          stageId: editDealStageId,
          description: editDealDescription.trim() || null,
        }),
      })

      if (!res.ok) throw new Error('Error al actualizar trato')

      toast.success('Trato actualizado')
      setSelectedDeal(null)
      fetchPipeline()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar trato'
      toast.error(message)
    } finally {
      setSavingDeal(false)
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
    <div className="p-4 lg:p-6 h-full overflow-y-auto custom-scroll flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h3 className="text-lg font-semibold">Ventas <span className="text-muted-foreground font-normal">(Pipeline)</span></h3>
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
              <Button size="sm" data-tour="pipeline-nuevo" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
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

      {/* Resumen — UNA sola tarjeta dividida (como pidió Jhon) */}
      <Card className="border-border/60 bg-card dark:bg-zinc-900/60 mb-4 shrink-0 overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-border/60">
            {[
              { label: 'Total de tratos', value: String(pipelineStats.totalDeals), color: 'text-foreground' },
              { label: 'Valor total del pipeline', value: formatCurrency(pipelineStats.totalActiveValue), color: 'text-emerald-500' },
              { label: 'Valor ponderado', value: formatCurrency(pipelineStats.weightedValue), color: 'text-blue-500' },
              { label: 'Tratos ganados', value: String(pipelineStats.wonCount), color: 'text-violet-500' },
              { label: 'Tasa de conversión', value: `${pipelineStats.winRate}%`, color: 'text-amber-500' },
            ].map((k) => (
              <div key={k.label} className="p-4">
                <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                <p className={cn('text-xl font-bold tracking-tight mt-1', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del trato</DialogTitle>
          </DialogHeader>
          {selectedDeal && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Nombre del trato</Label>
                  <Input
                    value={editDealTitle}
                    onChange={(e) => setEditDealTitle(e.target.value)}
                    placeholder="Ej: Implementación CRM"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Valor estimado</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editDealValue}
                      onChange={(e) => setEditDealValue(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Etapa</Label>
                    <Select value={editDealStageId} onValueChange={setEditDealStageId}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Seleccionar etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Descripción del trato</Label>
                  <Textarea
                    value={editDealDescription}
                    onChange={(e) => setEditDealDescription(e.target.value)}
                    placeholder="Vehículo de interés (modelo, año, color), enganche/mensualidad, contexto de la conversación, próximos pasos..."
                    className="min-h-[90px] text-sm resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Valor actual</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedDeal.value)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Días en etapa</p>
                  <p className="text-sm font-medium">{selectedDeal.daysInStage}d</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Fuente</p>
                  <p className="text-sm font-medium capitalize">{selectedDeal.source || 'Sin dato'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Temperatura</p>
                  <p className="text-sm font-medium capitalize">{selectedDeal.temperature || 'Sin dato'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Contacto</p>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[9px] font-semibold">
                          {getInitials(selectedDeal.contactName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold">{selectedDeal.contactName}</span>
                    </div>
                  </div>
                  {selectedDeal.leadScore !== undefined && selectedDeal.leadScore > 0 && (
                    <Badge variant="secondary" className={cn(
                      "text-[10px] px-1.5 py-0.5 border-0 shrink-0",
                      selectedDeal.leadScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                      selectedDeal.leadScore >= 50 ? "bg-yellow-100 text-yellow-700" :
                      selectedDeal.leadScore >= 30 ? "bg-orange-100 text-orange-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      Score {selectedDeal.leadScore}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                  <p className="text-muted-foreground">
                    Teléfono: <span className="text-foreground">{selectedDeal.phone || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Email: <span className="text-foreground">{selectedDeal.email || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Último mensaje: <span className="text-foreground">{formatDate(selectedDeal.lastMessageAt)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Producto detectado: <span className="text-foreground">{selectedDeal.preferredProduct || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Presupuesto: <span className="text-foreground">{selectedDeal.budget || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Plazo: <span className="text-foreground">{selectedDeal.timeline || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Urgencia: <span className="text-foreground capitalize">{selectedDeal.urgencyLevel || 'Sin dato'}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Sensibilidad al precio: <span className="text-foreground capitalize">{selectedDeal.priceSensitivity || 'Sin dato'}</span>
                  </p>
                </div>

                {selectedDeal.mainObjection && (
                  <div className="mt-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Objeción principal</p>
                    <p className="text-xs leading-relaxed">{selectedDeal.mainObjection}</p>
                  </div>
                )}
                {selectedDeal.notes && (
                  <div className="mt-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Notas del contacto</p>
                    <p className="text-xs leading-relaxed whitespace-pre-line">{selectedDeal.notes}</p>
                  </div>
                )}
                {selectedDeal.tags && selectedDeal.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedDeal.tags.slice(0, 12).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] border-0 bg-muted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedDeal(null)}
                >
                  Cerrar
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="gap-1.5"
                    onClick={() => handleDeleteDeal(selectedDeal.id)}
                    disabled={deletingDealId === selectedDeal.id || savingDeal}
                  >
                    {deletingDealId === selectedDeal.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Eliminar
                  </Button>
                  <Button
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleUpdateDeal}
                    disabled={savingDeal || !editDealTitle.trim()}
                  >
                    {savingDeal ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Guardar
                  </Button>
                </div>
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
          /* Scroller NATIVO (no Radix ScrollArea): su wrapper display:table
             expandía el contenido y el overflow-x-auto nunca desbordaba → en
             móvil las columnas quedaban recortadas sin forma de alcanzarlas. */
          <div className="overflow-x-auto overscroll-x-contain shrink-0 custom-scroll">
            <div className="flex gap-4 pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:min-w-0 w-max lg:w-auto">
              {orderedStages.map((stage) => {
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
          </div>
        ) : (
          <div className="shrink-0">
            <div className="space-y-1 pb-4">
              {orderedStages.map((stage) => {
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
          </div>
        )}
        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* ═══ Widgets inferiores (como el mockup) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4 shrink-0">
        {/* Tratos en riesgo */}
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-red-500 mb-1">Tratos en riesgo</p>
            <p className="text-2xl font-bold text-foreground">{bottomStats.atRisk}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tratos sin actividad &gt; 15 días</p>
          </CardContent>
        </Card>
        {/* Tareas de seguimiento */}
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-amber-500 mb-1 flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> Tareas de seguimiento</p>
            <p className="text-2xl font-bold text-foreground">{bottomStats.needMove}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tratos que necesitan moverse</p>
          </CardContent>
        </Card>
        {/* Conversiones por etapa */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5 text-emerald-500" /> Conversiones por etapa</p>
            <div className="space-y-1.5">
              {orderedStages.filter((s) => !s.isWon && !s.isLost).slice(0, 6).map((s) => {
                const prob = getStageProbability(s.name)
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0 truncate">{s.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prob}%`, backgroundColor: s.color }} /></div>
                    <span className="text-[10px] font-medium text-foreground w-8 text-right">{prob}%</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        {/* Actividad reciente del pipeline */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-violet-500" /> Actividad reciente</p>
            {bottomStats.recent.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin actividad reciente.</p>
            ) : (
              <div className="space-y-1.5">
                {bottomStats.recent.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-foreground truncate">{d.contactName} · {d.stage}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(d.lastMessageAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
