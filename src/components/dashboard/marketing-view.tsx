'use client'

import { useState, useEffect, useCallback } from 'react'
import { MarketingSetup } from '@/components/dashboard/marketing-setup'
import { MarketingStudio } from '@/components/dashboard/marketing-studio'
import { MarketingAutopilot } from '@/components/dashboard/marketing-autopilot'
import { MarketingVideoStudio } from '@/components/dashboard/marketing-video-studio'
import {
  Megaphone,
  Sparkles,
  CalendarDays,
  BarChart3,
  Zap,
  Users,
  Plus,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Settings,
  Trash2,
  Edit2,
  Play,
  Pause,
  Instagram,
  Facebook,
  Video,
  FileText,
  Image,
  MessageSquare,
  Target,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  X,
  Save,
  Flame,
  Snowflake,
  Thermometer,
  AlertCircle,
  Globe,
  Clock,
  Undo2,
  Music2,
  Send,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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
} from '@/components/ui/dialog'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  objective: string
  status: string
  channels: string
  audience: string
  budget: number | null
  currency: string
  startDate: string | null
  endDate: string | null
  metrics: string
  notes: string | null
  createdAt: string
  _count?: { contents: number; calendarEntries: number }
}

interface MarketingContentItem {
  id: string
  campaignId: string | null
  type: string
  channel: string
  title: string
  content: string
  tone: string
  objective: string
  status: string
  aiGenerated: boolean
  metadata: string
  createdAt: string
}

interface CalendarEntry {
  id: string
  campaignId: string | null
  contentId: string | null
  title: string
  channel: string
  scheduledAt: string
  status: string
  notes: string | null
  content?: { id: string; type: string; title: string; channel: string } | null
  campaign?: { id: string; name: string; objective: string } | null
}

interface AudienceData {
  overview: {
    totalContacts: number
    hotLeads: number
    warmLeads: number
    coldLeads: number
    reactivable: number
    winRate: number
    totalDeals: number
    wonDeals: number
  }
  sources: { source: string; count: number }[]
  channels: { channel: string; count: number }[]
  archetypes: { archetype: string; count: number }[]
  topTags: { tag: string; count: number }[]
  topObjections: { objection: string; count: number }[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'studio', label: 'Estudio de Diseños', icon: <Image className="h-4 w-4" /> },
  { id: 'video', label: 'Estudio de Video', icon: <Video className="h-4 w-4" /> },
  { id: 'autopilot', label: 'Piloto Automático', icon: <Zap className="h-4 w-4" /> },
  { id: 'campaigns', label: 'Campañas', icon: <Megaphone className="h-4 w-4" /> },
  { id: 'generate', label: 'Contenido IA', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'strategy', label: 'Estrategia', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'calendar', label: 'Calendario', icon: <CalendarDays className="h-4 w-4" /> },
  { id: 'library', label: 'Biblioteca', icon: <FileText className="h-4 w-4" /> },
  { id: 'audience', label: 'Audiencia', icon: <Users className="h-4 w-4" /> },
  { id: 'optimize', label: 'Optimización', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'automation', label: 'Automatización', icon: <Zap className="h-4 w-4" /> },
  { id: 'setup', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
] as const

type TabId = (typeof TABS)[number]['id']

const CHANNELS = [
  { value: 'instagram', label: 'Instagram', color: '#e1306c' },
  { value: 'facebook', label: 'Facebook', color: '#1877f2' },
  { value: 'tiktok', label: 'TikTok', color: '#010101' },
  { value: 'telegram', label: 'Telegram', color: '#0088cc' },
  { value: 'whatsapp', label: 'WhatsApp', color: '#25d366' },
]

const OBJECTIVES = [
  { value: 'leads', label: 'Captación de Leads' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'branding', label: 'Branding / Reconocimiento' },
  { value: 'retencion', label: 'Retención de Clientes' },
]

const TONES = [
  { value: 'profesional', label: 'Profesional' },
  { value: 'casual', label: 'Casual / Cercano' },
  { value: 'urgente', label: 'Urgente / Escasez' },
  { value: 'empatico', label: 'Empático' },
  { value: 'motivador', label: 'Motivador / Inspirador' },
]

const CONTENT_TYPES = [
  { value: 'copy_ad', label: 'Copy Publicitario (Ad)', icon: <Target className="h-4 w-4" /> },
  { value: 'organic_post', label: 'Post Orgánico', icon: <Image className="h-4 w-4" /> },
  { value: 'video_script', label: 'Guión de Video (Reel/TikTok)', icon: <Video className="h-4 w-4" /> },
  { value: 'story', label: 'Story', icon: <Globe className="h-4 w-4" /> },
  { value: 'message', label: 'Mensaje directo (DM/WhatsApp/Telegram)', icon: <Megaphone className="h-4 w-4" /> },
  { value: 'strategy', label: 'Estrategia Completa', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'calendar', label: 'Calendario de Contenido', icon: <CalendarDays className="h-4 w-4" /> },
  { value: 'audience', label: 'Análisis de Audiencia', icon: <Users className="h-4 w-4" /> },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  paused: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  scheduled: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  // Estados del contrato para el calendario de publicaciones:
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       // pendiente de aprobación / por publicar
  awaiting_approval: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',              // fallida
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
}

// Etiqueta legible del estado (contrato: pendiente de aprobación, aprobada, publicada, fallida)
const STATUS_LABEL: Record<string, string> = {
  pending: 'Por publicar', awaiting_approval: 'Pendiente de aprobación', approved: 'Aprobada',
  scheduled: 'Programada', published: 'Publicada', done: 'Publicada', active: 'Activa',
  failed: 'Fallida', error: 'Fallida', cancelled: 'Cancelada', draft: 'Borrador',
  paused: 'Pausada', completed: 'Completada',
}

const AUDIENCE_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// ─── Helpers ────────────────────────────────────────────────────────────────

function channelIcon(ch: string, size = 'h-3.5 w-3.5') {
  const map: Record<string, ReturnType<typeof Instagram>> = {
    instagram: <Instagram className={size} />,
    facebook: <Facebook className={size} />,
    tiktok: <Music2 className={size} />,
    whatsapp: <MessageSquare className={size} />,
  }
  return <span className="inline-flex items-center">{map[ch] || <Globe className={size} />}</span>
}

function getChannelColor(ch: string): string {
  return CHANNELS.find(c => c.value === ch)?.color || '#6b7280'
}

function parsedChannels(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  workspaceId: string
}

export function MarketingView({ workspaceId }: Props) {
  const [tab, setTab] = useState<TabId>('studio')
  const [apisConnected, setApisConnected] = useState<boolean | null>(null)

  // Check if any marketing API is configured
  useEffect(() => {
    fetch(`/api/marketing/config?workspaceId=${workspaceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.connected) {
          setApisConnected(Object.values(data.connected).some(Boolean))
        } else {
          setApisConnected(false)
        }
      })
      .catch(() => setApisConnected(false))
  }, [workspaceId])

  const showBlurOverlay = apisConnected === false && tab !== 'setup' && tab !== 'studio' && tab !== 'autopilot' && tab !== 'video'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <Megaphone className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Marketing Inteligente</h1>
            <p className="text-xs text-muted-foreground">IA para captación, contenido y campañas multicanal</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap',
              tab === t.id
                ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {t.icon}
            {t.label}
            {t.id === 'setup' && apisConnected === false && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content + blur overlay wrapper */}
      <div className="flex-1 overflow-hidden relative">
        {/* Blurred content */}
        <div className={cn('h-full transition-[filter] duration-300', showBlurOverlay && 'blur-sm pointer-events-none select-none')}>
          {tab === 'studio' && <MarketingStudio workspaceId={workspaceId} />}
          {tab === 'video' && <MarketingVideoStudio workspaceId={workspaceId} />}
          {tab === 'autopilot' && <MarketingAutopilot workspaceId={workspaceId} />}
          {tab === 'campaigns' && <CampaignsTab workspaceId={workspaceId} />}
          {tab === 'generate' && <GenerateTab workspaceId={workspaceId} />}
          {tab === 'strategy' && <StrategyTab workspaceId={workspaceId} />}
          {tab === 'calendar' && <CalendarTab workspaceId={workspaceId} />}
          {tab === 'library' && <LibraryTab workspaceId={workspaceId} />}
          {tab === 'audience' && <AudienceTab workspaceId={workspaceId} />}
          {tab === 'optimize' && <OptimizeTab workspaceId={workspaceId} />}
          {tab === 'automation' && <AutomationTab workspaceId={workspaceId} />}
          {tab === 'setup' && (
            <MarketingSetup
              workspaceId={workspaceId}
              onComplete={() => {
                setApisConnected(true)
                setTab('campaigns')
              }}
            />
          )}
        </div>

        {/* Full-module overlay */}
        {showBlurOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-md">
            <div className="mx-auto max-w-md w-full px-6">
              <div className="rounded-2xl border border-amber-500/30 bg-card/90 backdrop-blur-sm shadow-2xl p-8 flex flex-col items-center text-center gap-5">
                {/* Icon */}
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/20">
                  <Settings className="h-8 w-8 text-amber-400" />
                </div>

                {/* Text */}
                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-foreground">APIs de marketing no configuradas</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Para publicar campañas, medir resultados y usar todas las funciones de Marketing IA necesitas conectar al menos una plataforma publicitaria.
                  </p>
                </div>

                {/* Platforms preview */}
                <div className="grid grid-cols-4 gap-3 w-full">
                  {[
                    { label: 'Meta Ads', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
                    { label: 'Instagram', color: 'bg-pink-500/10 border-pink-500/20 text-pink-400' },
                    { label: 'TikTok', color: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300' },
                    { label: 'Google Ads', color: 'bg-red-500/10 border-red-500/20 text-red-400' },
                  ].map(p => (
                    <div key={p.label} className={cn('rounded-lg border px-2 py-2 text-[11px] font-medium text-center', p.color)}>
                      {p.label}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => setTab('setup')}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20"
                >
                  Configurar APIs ahora →
                </button>

                <p className="text-[11px] text-muted-foreground">
                  El módulo de IA de contenido funciona sin APIs externas
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: CAMPAIGNS
// ═══════════════════════════════════════════════════════════════

// Métricas por campaña de los ENVÍOS MASIVOS (difusión WhatsApp/Telegram) —
// entrega + respuestas por campaña (contrato §Pantalla 5).
interface MassMetric { campaignId: string; name: string; channel: string; date: string; total: number; sent: number; pending: number; failed: number; cancelled: number; responses: number; responseRate: number }
function MassCampaignMetrics({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<MassMetric[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch(`/api/marketing/campaigns/metrics?workspaceId=${workspaceId}`).then((r) => r.ok ? r.json() : null).then((d) => setRows(d?.campaigns || [])).catch(() => {}).finally(() => setLoading(false))
  }, [workspaceId])
  if (loading || !rows.length) return null
  const chLabel = (c: string) => c === 'whatsapp' ? 'WhatsApp' : c === 'telegram' ? 'Telegram' : 'Auto'
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-fuchsia-500" /><p className="text-sm font-semibold">Campañas de mensajería (envíos masivos)</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground text-left border-b border-border/60">
            <th className="py-1.5 pr-3">Campaña</th><th className="pr-3">Canal</th><th className="pr-3">Enviados</th><th className="pr-3">En cola</th><th className="pr-3">Fallidos</th><th className="pr-3">Respuestas</th><th className="pr-3">Tasa resp.</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaignId} className="border-b border-border/30">
                <td className="py-1.5 pr-3 font-medium truncate max-w-[180px]">{r.name}</td>
                <td className="pr-3">{chLabel(r.channel)}</td>
                <td className="pr-3">{r.sent}/{r.total}</td>
                <td className="pr-3">{r.pending}</td>
                <td className="pr-3 text-red-500">{r.failed || 0}</td>
                <td className="pr-3 text-emerald-500">{r.responses}</td>
                <td className="pr-3 font-semibold">{r.responseRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CampaignsTab({ workspaceId }: { workspaceId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', objective: 'leads', channels: [] as string[],
    budget: '', startDate: '', endDate: '', notes: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/marketing/campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const toggleChannel = (ch: string) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
    }))
  }

  const createCampaign = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    if (form.channels.length === 0) { toast.error('Selecciona al menos un canal'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...form }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Campaña creada')
      setShowCreate(false)
      setForm({ name: '', objective: 'leads', channels: [], budget: '', startDate: '', endDate: '', notes: '' })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al crear campaña')
    } finally {
      setCreating(false)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/marketing/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, workspaceId, status }),
    })
    load()
  }

  const deleteCampaign = async (id: string) => {
    await fetch(`/api/marketing/campaigns?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
    toast.success('Campaña eliminada')
    load()
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Campañas de Marketing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Gestiona y monitorea tus campañas multicanal</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
            <Plus className="h-4 w-4" /> Nueva Campaña
          </Button>
        </div>

        <MassCampaignMetrics workspaceId={workspaceId} />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-10 w-10 text-violet-400/50" />}
            title="Sin campañas todavía"
            description="Crea tu primera campaña de marketing para comenzar a gestionar tu estrategia digital."
            action={{ label: 'Crear campaña', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map(camp => {
              const chs = parsedChannels(camp.channels)
              const statusNext = camp.status === 'active' ? 'paused' : 'active'
              return (
                <Card key={camp.id} className="bg-card border-border hover:border-violet-500/30 transition-colors group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold line-clamp-1">{camp.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {OBJECTIVES.find(o => o.value === camp.objective)?.label || camp.objective}
                        </p>
                      </div>
                      <Badge className={cn('text-xs border', STATUS_COLORS[camp.status] || STATUS_COLORS.draft)}>
                        {camp.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Channels */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {chs.map(ch => (
                        <span key={ch} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted">
                          {channelIcon(ch)} {ch}
                        </span>
                      ))}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <div className="font-semibold text-foreground">{camp._count?.contents || 0}</div>
                        <div className="text-muted-foreground">Contenidos</div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <div className="font-semibold text-foreground">{camp._count?.calendarEntries || 0}</div>
                        <div className="text-muted-foreground">Publicaciones</div>
                      </div>
                    </div>

                    {camp.budget && (
                      <div className="text-xs text-muted-foreground">
                        Presupuesto: <span className="text-foreground font-medium">
                          {camp.budget.toLocaleString('es-MX', { style: 'currency', currency: camp.currency })}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-7 text-xs gap-1"
                        onClick={() => updateStatus(camp.id, statusNext)}
                      >
                        {camp.status === 'active' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        {camp.status === 'active' ? 'Pausar' : 'Activar'}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 border-red-500/30"
                        onClick={() => deleteCampaign(camp.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nombre de la campaña *</label>
              <Input
                placeholder="Ej: Lanzamiento Verano 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Objetivo principal *</label>
              <Select value={form.objective} onValueChange={v => setForm(f => ({ ...f, objective: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Canales *</label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(ch => (
                  <button
                    key={ch.value}
                    onClick={() => toggleChannel(ch.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      form.channels.includes(ch.value)
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                        : 'bg-muted border-border text-muted-foreground hover:border-violet-500/30'
                    )}
                  >
                    {channelIcon(ch.value)} {ch.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Fecha inicio</label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Fecha fin</label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Presupuesto (MXN)</label>
              <Input
                type="number" placeholder="Ej: 5000"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Notas</label>
              <Textarea
                placeholder="Descripción u objetivos adicionales..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={createCampaign} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Crear Campaña
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: GENERATE (AI CONTENT)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// TAB: ESTRATEGIA (Pantalla 2) — pantalla propia, datos reales del CRM
// ═══════════════════════════════════════════════════════════════
function StrategyTab({ workspaceId }: { workspaceId: string }) {
  const [product, setProduct] = useState('')
  const [audience, setAudience] = useState('')
  const [objective, setObjective] = useState('leads')
  const [tone, setTone] = useState('profesional')
  const [chans, setChans] = useState<string[]>(['facebook', 'instagram'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const toggle = (v: string) => setChans((c) => c.includes(v) ? c.filter((x) => x !== v) : [...c, v])

  const generate = async () => {
    setLoading(true); setResult('')
    try {
      const r = await fetch('/api/marketing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, type: 'strategy', product: product || 'el negocio', audience, objective, tone, channels: chans }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Error')
      setResult((d.result || '').trim()); if (!d.result) toast.info('La IA no devolvió estrategia')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setLoading(false) }
  }

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-violet-500" /> Estrategia de Marketing con IA</p>
          <p className="text-xs text-muted-foreground">La IA arma una estrategia completa (segmentos, propuesta de valor, tácticas por canal, embudo TOFU/MOFU/BOFU, frecuencia y KPIs) usando los datos REALES de tu CRM (temperatura, fuentes, arquetipos, objeciones y embudo).</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Producto / negocio</label><Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej: agencia de autos seminuevos" className="h-9 text-sm" /></div>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Audiencia</label><Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ej: familias, primer auto…" className="h-9 text-sm" /></div>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Objetivo</label><select value={objective} onChange={(e) => setObjective(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Tono</label><select value={tone} onChange={(e) => setTone(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Canales</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => <button key={c.value} onClick={() => toggle(c.value)} className={cn('px-2.5 py-1 rounded-full text-xs border', chans.includes(c.value) ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-input text-muted-foreground')}>{c.label}</button>)}
            </div>
          </div>
          <Button onClick={generate} disabled={loading} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar estrategia</Button>
        </div>
        {result && (
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">Estrategia generada</p><Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(result); toast.success('Copiada') }}><Copy className="h-3.5 w-3.5" /> Copiar</Button></div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{result}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function GenerateTab({ workspaceId }: { workspaceId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({
    type: 'copy_ad',
    channels: ['instagram'] as string[],
    objective: 'leads',
    tone: 'profesional',
    product: '',
    brand: '',
    audience: '',
    count: '1',
    saveTo: '',
  })

  useEffect(() => {
    fetch(`/api/marketing/campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
  }, [workspaceId])

  const toggleChannel = (ch: string) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
    }))
  }

  const generate = async () => {
    if (!form.product.trim()) { toast.error('Escribe el producto o servicio'); return }
    if (form.channels.length === 0) { toast.error('Selecciona al menos un canal'); return }
    setGenerating(true)
    setResult('')
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          ...form,
          count: parseInt(form.count),
          saveTo: form.saveTo || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
      if (form.saveTo) toast.success('Contenido generado y guardado en la campaña')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al generar')
    } finally {
      setGenerating(false)
    }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const [publishing, setPublishing] = useState(false)
  const [savingCal, setSavingCal] = useState(false)

  // Publicar directo el TEXTO generado (Telegram + Facebook aceptan texto).
  const publishDirect = async () => {
    if (!result.trim()) return
    setPublishing(true)
    try {
      const res = await fetch('/api/marketing/publish-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, channels: form.channels, text: result }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      const ok = (d.results || []).filter((r: { status: string }) => r.status === 'ok').map((r: { channel: string }) => r.channel)
      const bad = (d.results || []).filter((r: { status: string }) => r.status === 'error')
      const skip = (d.results || []).filter((r: { status: string }) => r.status === 'skipped').map((r: { channel: string }) => r.channel)
      if (ok.length) toast.success(`Publicado en: ${ok.join(', ')}`)
      if (bad.length) toast.error(bad.map((r: { channel: string; error?: string }) => `${r.channel}: ${r.error}`).join(' · '))
      if (!ok.length && !bad.length && skip.length) toast.info(`${skip.join(', ')} necesitan imagen/video — usa el Estudio de Diseños o Video`)
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'No se pudo publicar') }
    finally { setPublishing(false) }
  }

  // Guardar el contenido generado en el Calendario de Publicaciones.
  const saveToCalendar = async () => {
    if (!result.trim()) return
    setSavingCal(true)
    try {
      const when = new Date(Date.now() + 60 * 60 * 1000) // por defecto en 1 hora
      const res = await fetch('/api/marketing/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: (form.product || result.split('\n')[0] || 'Publicación').slice(0, 80),
          channel: form.channels[0] || 'instagram',
          scheduledAt: when.toISOString(),
          notes: result.slice(0, 4000),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Guardado en el Calendario (programado en 1 h — ajústalo ahí)')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar en el calendario') }
    finally { setSavingCal(false) }
  }

  const selectedType = CONTENT_TYPES.find(t => t.value === form.type)

  return (
    <div className="h-full flex divide-x divide-border overflow-hidden">
      {/* Left panel: form */}
      <ScrollArea className="w-80 shrink-0">
        <div className="p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Generador de Contenido</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Crea contenido optimizado con IA</p>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Tipo de contenido
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {CONTENT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                    form.type === t.value
                      ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                      : 'hover:bg-muted text-muted-foreground border border-transparent'
                  )}
                >
                  <span className={form.type === t.value ? 'text-violet-400' : 'text-muted-foreground'}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Channels (not shown for strategy/calendar/audience which don't need it) */}
          {!['strategy', 'audience'].includes(form.type) && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Canales</label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(ch => (
                  <button
                    key={ch.value}
                    onClick={() => toggleChannel(ch.value)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all',
                      form.channels.includes(ch.value)
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                        : 'bg-muted border-border text-muted-foreground'
                    )}
                  >
                    {channelIcon(ch.value)} {ch.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Objetivo</label>
            <Select value={form.objective} onValueChange={v => setForm(f => ({ ...f, objective: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Tono</label>
            <Select value={form.tone} onValueChange={v => setForm(f => ({ ...f, tone: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Producto / Servicio *
            </label>
            <Input
              placeholder="Ej: Rines de aluminio para autos"
              value={form.product}
              onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              className="text-sm h-8"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Audiencia objetivo
            </label>
            <Textarea
              placeholder="Ej: Hombres 25-45 años, dueños de autos, apasionados de la personalización"
              value={form.audience}
              onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {['copy_ad', 'video_script', 'story', 'organic_post'].includes(form.type) && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Variaciones
              </label>
              <Select value={form.count} onValueChange={v => setForm(f => ({ ...f, count: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['1', '2', '3'].map(n => <SelectItem key={n} value={n}>{n} variación{n !== '1' ? 'es' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {campaigns.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Guardar en campaña (opcional)
              </label>
              <Select value={form.saveTo || '__none__'} onValueChange={v => setForm(f => ({ ...f, saveTo: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No guardar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No guardar</SelectItem>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={generate}
            disabled={generating}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generar con IA</>
            )}
          </Button>
        </div>
      </ScrollArea>

      {/* Right panel: result */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {result ? (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background/50">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-violet-400">{selectedType?.icon}</span>
                <span className="font-medium">{selectedType?.label}</span>
                <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">IA</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={copyResult}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={saveToCalendar} disabled={savingCal}>
                  <CalendarDays className="h-3 w-3" /> {savingCal ? 'Guardando…' : 'Guardar en calendario'}
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={publishDirect} disabled={publishing}>
                  <Send className="h-3 w-3" /> {publishing ? 'Publicando…' : 'Publicar directo'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={generate} disabled={generating}>
                  <RefreshCw className="h-3 w-3" /> Regenerar
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0 p-5">
              <div className="prose prose-sm prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">{result}</pre>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-violet-400/60" />
              </div>
              <div>
                <p className="font-medium text-foreground">Listo para generar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Configura el tipo de contenido y haz clic en &ldquo;Generar con IA&rdquo; para crear tu contenido personalizado.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: CALENDAR
// ═══════════════════════════════════════════════════════════════

function CalendarTab({ workspaceId }: { workspaceId: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [addForm, setAddForm] = useState({ title: '', channel: 'instagram', notes: '', campaignId: '', time: '09:00' })
  const [view, setView] = useState<'month' | 'week'>('month')
  const [editId, setEditId] = useState<string | null>(null)

  const load = useCallback(() => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    setLoading(true)
    fetch(`/api/marketing/calendar?workspaceId=${workspaceId}&month=${monthStr}`)
      .then(r => r.json())
      .then(d => setEntries(d.entries || []))
      .finally(() => setLoading(false))
  }, [workspaceId, year, month])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch(`/api/marketing/campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
  }, [workspaceId])

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else { setMonth(m => m - 1) } }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else { setMonth(m => m + 1) } }

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const entriesByDay: Record<number, CalendarEntry[]> = {}
  for (const e of entries) {
    const d = new Date(e.scheduledAt).getDate()
    if (!entriesByDay[d]) entriesByDay[d] = []
    entriesByDay[d].push(e)
  }

  const addEntry = async () => {
    if (!addForm.title.trim() || !selectedDay) return
    setAdding(true)
    try {
      const scheduledAt = new Date(year, month, selectedDay, parseInt(addForm.time.split(':')[0]), parseInt(addForm.time.split(':')[1]))
      const payload = {
        workspaceId,
        title: addForm.title,
        channel: addForm.channel,
        notes: addForm.notes || null,
        campaignId: addForm.campaignId || null,
        scheduledAt: scheduledAt.toISOString(),
      }
      // Modo EDICIÓN (cambiar título/canal/horario) vs alta nueva.
      const res = editId
        ? await fetch('/api/marketing/calendar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...payload }) })
        : await fetch('/api/marketing/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editId ? 'Publicación actualizada' : 'Publicación agregada al calendario')
      setShowAdd(false); setEditId(null)
      setAddForm({ title: '', channel: 'instagram', notes: '', campaignId: '', time: '09:00' })
      load()
    } catch {
      toast.error('Error al guardar la publicación')
    } finally {
      setAdding(false)
    }
  }

  const deleteEntry = async (id: string) => {
    await fetch(`/api/marketing/calendar?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
    load()
  }

  // Editar / cambiar horario-canal / aprobar (el PATCH del backend ya existe).
  const patchEntry = async (id: string, data: Record<string, unknown>) => {
    await fetch('/api/marketing/calendar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, workspaceId, ...data }) })
    load()
  }
  const approveEntry = (e: CalendarEntry) => patchEntry(e.id, { status: 'approved' }).then(() => toast.success('Publicación aprobada'))
  const openEdit = (e: CalendarEntry) => {
    const d = new Date(e.scheduledAt)
    setSelectedDay(d.getDate())
    setEditId(e.id)
    setAddForm({ title: e.title, channel: e.channel, notes: e.notes || '', campaignId: e.campaign?.id || '', time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })
    setShowAdd(true)
  }

  // Semana que contiene el día seleccionado (o hoy): domingo→sábado.
  const weekAnchor = new Date(year, month, selectedDay || (month === now.getMonth() && year === now.getFullYear() ? now.getDate() : 1))
  const weekStart = new Date(weekAnchor); weekStart.setDate(weekAnchor.getDate() - weekAnchor.getDay())
  const weekDays = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d })

  const dayEntries = selectedDay ? (entriesByDay[selectedDay] || []) : []

  return (
    <div className="h-full flex overflow-hidden">
      {/* Calendar grid */}
      <div className="flex-1 flex flex-col p-4 overflow-auto">
        {/* Nav + toggle Mes/Semana */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 hover:bg-muted rounded-lg"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-sm">{MONTHS_ES[month]} {year}</h2>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setView('month')} className={cn('px-2.5 py-1 text-xs', view === 'month' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted')}>Mes</button>
              <button onClick={() => setView('week')} className={cn('px-2.5 py-1 text-xs', view === 'week' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted')}>Semana</button>
            </div>
          </div>
          <button onClick={nextMonth} className="p-1.5 hover:bg-muted rounded-lg"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_ES.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Vista SEMANAL */}
        {view === 'week' ? (
          <div className="grid grid-cols-7 gap-0.5">
            {weekDays.map((d) => {
              const ents = entries.filter((e) => { const x = new Date(e.scheduledAt); return x.getDate() === d.getDate() && x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear() })
              const isToday = d.toDateString() === now.toDateString()
              const inMonth = d.getMonth() === month
              return (
                <button key={d.toISOString()} onClick={() => { if (inMonth) setSelectedDay(d.getDate()) }}
                  className={cn('min-h-[220px] p-1.5 rounded-lg text-left flex flex-col gap-1 border align-top', isToday ? 'bg-emerald-500/10 border-emerald-500/30' : 'border-border/60 hover:bg-muted', !inMonth && 'opacity-50')}>
                  <span className={cn('text-xs font-semibold', isToday && 'text-emerald-400')}>{d.getDate()}</span>
                  {ents.map((e) => (
                    <div key={e.id} className="text-[10px] rounded px-1 py-0.5 truncate" style={{ backgroundColor: `${getChannelColor(e.channel)}20`, color: getChannelColor(e.channel) }} title={e.title}>
                      {new Date(e.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {channelIcon(e.channel)} {e.title}
                    </div>
                  ))}
                </button>
              )
            })}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5 flex-1">
            {/* Empty cells */}
            {[...Array(firstDayOfMonth)].map((_, i) => <div key={`e-${i}`} />)}
            {/* Day cells */}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1
              const dayEnts = entriesByDay[day] || []
              const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
              const isSelected = selectedDay === day

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    'min-h-[60px] p-1 rounded-lg text-left flex flex-col gap-0.5 transition-colors border',
                    isSelected ? 'bg-violet-500/20 border-violet-500/50' :
                      isToday ? 'bg-emerald-500/10 border-emerald-500/30' :
                        'hover:bg-muted border-transparent'
                  )}
                >
                  <span className={cn(
                    'text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full',
                    isToday && 'bg-emerald-500 text-white',
                    isSelected && !isToday && 'bg-violet-500 text-white',
                  )}>
                    {day}
                  </span>
                  {dayEnts.slice(0, 2).map(e => (
                    <div
                      key={e.id}
                      className="text-xs truncate rounded px-1 py-0.5"
                      style={{ backgroundColor: `${getChannelColor(e.channel)}20`, color: getChannelColor(e.channel) }}
                    >
                      {channelIcon(e.channel)} {e.title}
                    </div>
                  ))}
                  {dayEnts.length > 2 && (
                    <div className="text-xs text-muted-foreground px-1">+{dayEnts.length - 2}</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="w-72 border-l border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">
              {selectedDay ? `${selectedDay} de ${MONTHS_ES[month]}` : 'Selecciona un día'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedDay ? `${dayEntries.length} publicación(es)` : 'Haz clic en un día del calendario'}
            </p>
          </div>
          {selectedDay && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 p-4">
          {selectedDay ? (
            dayEntries.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin publicaciones este día</p>
                <Button size="sm" variant="outline" className="mt-3 text-xs gap-1" onClick={() => setShowAdd(true)}>
                  <Plus className="h-3 w-3" /> Agregar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {dayEntries.map(e => (
                  <div key={e.id} className="p-3 rounded-lg bg-muted/50 border border-border relative">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: getChannelColor(e.channel) }}>
                        {channelIcon(e.channel)} <span className="capitalize">{e.channel}</span>
                      </div>
                      <Badge className={cn('text-xs border', STATUS_COLORS[e.status] || STATUS_COLORS.pending)}>{STATUS_LABEL[e.status] || e.status}</Badge>
                    </div>
                    <p className="text-xs font-medium text-foreground line-clamp-2">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {e.campaign && (
                      <p className="text-xs text-violet-400/70 mt-1">📣 {e.campaign.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/60">
                      {['pending', 'scheduled', 'awaiting_approval', 'draft'].includes(e.status) && (
                        <button onClick={() => approveEntry(e)} className="text-[11px] font-medium text-emerald-500 hover:text-emerald-400 inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> Aprobar</button>
                      )}
                      <button onClick={() => openEdit(e)} className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"><Pencil className="h-3 w-3" /> Editar</button>
                      <button onClick={() => deleteEntry(e.id)} className="text-[11px] font-medium text-red-400 hover:text-red-300 inline-flex items-center gap-0.5 ml-auto"><X className="h-3 w-3" /> Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Selecciona un día para ver o agregar publicaciones</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setEditId(null); setAddForm({ title: '', channel: 'instagram', notes: '', campaignId: '', time: '09:00' }) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Agregar'} publicación — {selectedDay} {MONTHS_ES[month]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium mb-1 block">Título *</label>
              <Input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Descripción de la publicación" className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Canal</label>
                <Select value={addForm.channel} onValueChange={v => setAddForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Hora</label>
                <Input type="time" value={addForm.time} onChange={e => setAddForm(f => ({ ...f, time: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            {campaigns.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1 block">Campaña (opcional)</label>
                <Select value={addForm.campaignId || '__none__'} onValueChange={v => setAddForm(f => ({ ...f, campaignId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sin campaña" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin campaña</SelectItem>
                    {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-1 block">Notas</label>
              <Textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={addEntry} disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: LIBRARY
// ═══════════════════════════════════════════════════════════════

function LibraryTab({ workspaceId }: { workspaceId: string }) {
  const [contents, setContents] = useState<MarketingContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ channel: 'all', type: 'all', status: 'all' })
  const [selected, setSelected] = useState<MarketingContentItem | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ workspaceId })
    if (filter.channel !== 'all') params.set('channel', filter.channel)
    if (filter.type !== 'all') params.set('type', filter.type)
    fetch(`/api/marketing/content?${params}`)
      .then(r => r.json())
      .then(d => setContents(d.contents || []))
      .finally(() => setLoading(false))
  }, [workspaceId, filter])

  useEffect(() => { load() }, [load])

  const deleteContent = async (id: string) => {
    await fetch(`/api/marketing/content?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
    toast.success('Contenido eliminado')
    if (selected?.id === id) setSelected(null)
    load()
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/marketing/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, workspaceId, status }),
    })
    load()
  }

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  const typeLabel = (t: string) => CONTENT_TYPES.find(x => x.value === t)?.label || t

  return (
    <div className="h-full flex overflow-hidden">
      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-background/50">
          <Select value={filter.channel} onValueChange={v => setFilter(f => ({ ...f, channel: v }))}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.type} onValueChange={v => setFilter(f => ({ ...f, type: v }))}>
            <SelectTrigger className="h-7 text-xs w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {CONTENT_TYPES.filter(t => !['strategy', 'audience', 'calendar'].includes(t.value)).map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter.status} onValueChange={v => setFilter(f => ({ ...f, status: v }))}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              {['all', 'draft', 'approved', 'published', 'archived'].map(s => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'Todos' : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">{contents.length} contenidos</div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : contents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10 text-muted-foreground/40" />}
            title="Biblioteca vacía"
            description="Genera contenido con IA o créalo manualmente desde el módulo anterior."
          />
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-2">
              {contents.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border transition-colors group',
                    selected?.id === item.id
                      ? 'bg-violet-500/10 border-violet-500/40'
                      : 'bg-card border-border hover:border-violet-500/20'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: getChannelColor(item.channel) }}>{channelIcon(item.channel)}</span>
                      <span className="text-xs font-medium text-muted-foreground capitalize">{item.channel}</span>
                      <span className="text-xs text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">{typeLabel(item.type)}</span>
                      {item.aiGenerated && (
                        <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400 py-0">IA</Badge>
                      )}
                    </div>
                    <Badge className={cn('text-xs border', STATUS_COLORS[item.status] || STATUS_COLORS.draft)}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.content}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 border-l border-border flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-medium text-sm">Detalle</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ScrollArea className="flex-1 min-h-0 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="text-xs" style={{ backgroundColor: `${getChannelColor(selected.channel)}20`, color: getChannelColor(selected.channel) }}>
                {channelIcon(selected.channel)} {selected.channel}
              </Badge>
              <Badge className={cn('text-xs border', STATUS_COLORS[selected.status] || '')}>{selected.status}</Badge>
              {selected.aiGenerated && <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">IA</Badge>}
            </div>
            <h4 className="font-semibold text-sm">{selected.title}</h4>
            <div className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto">
              {selected.content}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-muted-foreground mb-0.5">Tono</div>
                <div className="font-medium capitalize">{selected.tone}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-muted-foreground mb-0.5">Objetivo</div>
                <div className="font-medium capitalize">{selected.objective}</div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white h-7 text-xs gap-1" onClick={() => copyContent(selected.content)}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copiar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => updateStatus(selected.id, selected.status === 'draft' ? 'approved' : 'draft')}>
                {selected.status === 'draft' ? <><Check className="h-3 w-3" /> Aprobar</> : <><Undo2 className="h-3 w-3" /> Borrador</>}
              </Button>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400 border-red-500/20" onClick={() => deleteContent(selected.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: AUDIENCE
// ═══════════════════════════════════════════════════════════════

function AudienceTab({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<AudienceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')

  const load = () => {
    setLoading(true)
    fetch(`/api/marketing/audience?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [workspaceId])

  const generateAnalysis = async () => {
    setGenerating(true)
    setAnalysisResult('')
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: 'audience',
          objective: 'leads',
          product: 'los servicios del negocio',
        }),
      })
      const result = await res.json()
      setAnalysisResult(result.result || '')
    } catch {
      toast.error('Error al generar análisis')
    } finally {
      setGenerating(false)
    }
  }

  const temperatureIcon = (temp: string) => {
    if (temp === 'hot') return <Flame className="h-4 w-4 text-red-400" />
    if (temp === 'warm') return <Thermometer className="h-4 w-4 text-amber-400" />
    return <Snowflake className="h-4 w-4 text-blue-400" />
  }

  if (loading) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    )
  }

  if (!data) return null

  const { overview } = data

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Análisis de Audiencia</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Datos del CRM para segmentación y remarketing</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={generateAnalysis} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Analizar con IA
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Contactos', value: overview.totalContacts, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Leads Calientes', value: overview.hotLeads, color: 'text-red-400', bg: 'bg-red-500/10', icon: <Flame className="h-4 w-4 text-red-400" /> },
            { label: 'Reactivables', value: overview.reactivable, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Tasa de Cierre', value: `${overview.winRate}%`, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          ].map(k => (
            <Card key={k.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', k.bg)}>
                  {k.icon || <BarChart3 className={cn('h-4 w-4', k.color)} />}
                </div>
                <div className={cn('text-2xl font-bold', k.color)}>{k.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Temperature breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Leads Calientes', value: overview.hotLeads, icon: <Flame className="h-4 w-4 text-red-400" />, color: 'text-red-400', bar: 'bg-red-500' },
            { label: 'Leads Tibios', value: overview.warmLeads, icon: <Thermometer className="h-4 w-4 text-amber-400" />, color: 'text-amber-400', bar: 'bg-amber-500' },
            { label: 'Leads Fríos', value: overview.coldLeads, icon: <Snowflake className="h-4 w-4 text-blue-400" />, color: 'text-blue-400', bar: 'bg-blue-500' },
          ].map(t => {
            const total = overview.hotLeads + overview.warmLeads + overview.coldLeads || 1
            const pct = Math.round((t.value / total) * 100)
            return (
              <Card key={t.label} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {t.icon}
                    <span className="text-sm font-medium">{t.label}</span>
                  </div>
                  <div className={cn('text-2xl font-bold', t.color)}>{t.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 mb-2">{pct}% del total</div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', t.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sources */}
          {data.sources.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Fuentes de Leads</CardTitle>
                <CardDescription className="text-xs">De dónde provienen tus contactos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={data.sources} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={60} innerRadius={35} paddingAngle={3}>
                      {data.sources.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {data.sources.map((s, i) => (
                    <div key={s.source} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: AUDIENCE_COLORS[i % AUDIENCE_COLORS.length] }} />
                        <span className="text-muted-foreground capitalize">{s.source}</span>
                      </div>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Archetypes */}
          {data.archetypes.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Arquetipos de Clientes</CardTitle>
                <CardDescription className="text-xs">Perfiles detectados por el motor de IA</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.archetypes.slice(0, 6).map((a, i) => {
                    const total = data.archetypes.reduce((s, x) => s + x.count, 0)
                    const pct = Math.round((a.count / total) * 100)
                    return (
                      <div key={a.archetype} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{a.archetype}</span>
                          <span className="font-medium">{a.count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: AUDIENCE_COLORS[i % AUDIENCE_COLORS.length] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top objections */}
          {data.topObjections.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Principales Objeciones</CardTitle>
                <CardDescription className="text-xs">Detectadas por el motor de IA en conversaciones</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topObjections.slice(0, 8).map(obj => (
                    <div key={obj.objection} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[70%]">{obj.objection}</span>
                      <Badge variant="outline" className="text-xs">{obj.count}x</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top tags */}
          {data.topTags.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Etiquetas de Contactos</CardTitle>
                <CardDescription className="text-xs">Tags más frecuentes en tu CRM</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.topTags.map(t => (
                    <span
                      key={t.tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border flex items-center gap-1"
                    >
                      {t.tag}
                      <span className="text-muted-foreground text-xs">{t.count}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* AI Analysis */}
        {analysisResult && (
          <Card className="bg-card border-violet-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <CardTitle className="text-sm font-semibold">Análisis de Audiencia — IA</CardTitle>
                <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">Generado</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed font-sans max-h-80 overflow-y-auto">
                {analysisResult}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: OPTIMIZE
// ═══════════════════════════════════════════════════════════════

function OptimizeTab({ workspaceId }: { workspaceId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  // F1 atribución + F2 métricas reales de Meta (2026-07-22)
  const [attribution, setAttribution] = useState<{ totalLeadsFromAds: number; totalWon: number; totalRevenue: number; bySource: { source: string; leads: number; won: number; conversionRate: number }[]; byCar: { car: string; leadsMentioning: number; won: number }[] } | null>(null)
  const [metrics, setMetrics] = useState<{ connected: boolean; message?: string; totals?: { posts: number; reach: number; likes: number; comments: number; shares: number }; topPost?: { caption: string; network: string; engagement: number } | null } | null>(null)

  useEffect(() => {
    fetch(`/api/marketing/campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
    fetch(`/api/marketing/attribution?workspaceId=${workspaceId}`).then(r => r.json()).then(setAttribution).catch(() => {})
    fetch(`/api/marketing/metrics?workspaceId=${workspaceId}`).then(r => r.json()).then(setMetrics).catch(() => {})
  }, [workspaceId])

  const analyze = async () => {
    setAnalyzing(true)
    setResult('')
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: 'optimize',
          campaignId: selectedCampaignId === 'all' ? undefined : selectedCampaignId,
          product: 'los servicios y campañas del negocio',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al analizar campañas')
    } finally {
      setAnalyzing(false)
    }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    toast.success('Copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  const totalContent = campaigns.reduce((s, c) => s + (c._count?.contents || 0), 0)
  const totalScheduled = campaigns.reduce((s, c) => s + (c._count?.calendarEntries || 0), 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background/50 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">Optimización de Campañas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Análisis IA para mejorar el rendimiento de tus campañas</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="h-8 text-xs w-52">
              <SelectValue placeholder="Seleccionar campaña" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las campañas activas</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={analyze}
            disabled={analyzing || campaigns.length === 0}
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analizar con IA
          </Button>
        </div>
      </div>

      {/* KPI overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-border">
        {[
          { label: 'Campañas activas', value: activeCampaigns.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Total campañas', value: campaigns.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Contenidos creados', value: totalContent, color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Publicaciones agendadas', value: totalScheduled, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(k => (
          <div key={k.label} className={cn('rounded-xl p-3 flex flex-col gap-1', k.bg)}>
            <span className={cn('text-xl font-bold', k.color)}>{k.value}</span>
            <span className="text-xs text-muted-foreground">{k.label}</span>
          </div>
        ))}
      </div>

      {/* Campaign status table */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-4 space-y-4">
          {/* F2 — Métricas REALES de Meta (alcance/likes/comentarios) */}
          {metrics && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rendimiento real en redes (Meta)</h3>
              {metrics.connected && metrics.totals ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Publicaciones', value: metrics.totals.posts },
                    { label: 'Alcance', value: metrics.totals.reach.toLocaleString('es-MX') },
                    { label: 'Me gusta', value: metrics.totals.likes.toLocaleString('es-MX') },
                    { label: 'Comentarios', value: metrics.totals.comments.toLocaleString('es-MX') },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl p-3 flex flex-col gap-1 bg-blue-500/10">
                      <span className="text-xl font-bold text-blue-400">{k.value}</span>
                      <span className="text-xs text-muted-foreground">{k.label}</span>
                    </div>
                  ))}
                  {metrics.topPost && <div className="col-span-2 sm:col-span-4 text-xs text-muted-foreground">Publicación con más interacción: “{metrics.topPost.caption}” ({metrics.topPost.network}, {metrics.topPost.engagement} interacciones)</div>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{metrics.message || 'Conecta Facebook/Instagram para ver métricas reales.'}</p>
              )}
            </div>
          )}

          {/* F1 — Atribución: qué anuncio trajo leads y ventas */}
          {attribution && attribution.totalLeadsFromAds > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultados por anuncio (últimos 90 días)</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Leads de anuncios', value: attribution.totalLeadsFromAds, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                  { label: 'Ventas atribuidas', value: attribution.totalWon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: 'Ingresos atribuidos', value: '$' + attribution.totalRevenue.toLocaleString('es-MX'), color: 'text-amber-400', bg: 'bg-amber-500/10' },
                ].map(k => (
                  <div key={k.label} className={cn('rounded-xl p-3 flex flex-col gap-1', k.bg)}>
                    <span className={cn('text-lg font-bold', k.color)}>{k.value}</span>
                    <span className="text-xs text-muted-foreground">{k.label}</span>
                  </div>
                ))}
              </div>
              {attribution.bySource.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden mt-1">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/40 text-xs text-muted-foreground"><th className="text-left px-3 py-2">Anuncio / origen</th><th className="px-3 py-2">Leads</th><th className="px-3 py-2">Ventas</th><th className="px-3 py-2">Conversión</th></tr></thead>
                    <tbody>
                      {attribution.bySource.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t border-border"><td className="px-3 py-2 truncate max-w-[280px]">{r.source}</td><td className="px-3 py-2 text-center">{r.leads}</td><td className="px-3 py-2 text-center text-emerald-400 font-semibold">{r.won}</td><td className="px-3 py-2 text-center">{r.conversionRate}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {campaigns.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado de campañas</h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Campaña</th>
                      <th className="text-left px-4 py-2 font-medium">Estado</th>
                      <th className="text-left px-4 py-2 font-medium">Canales</th>
                      <th className="text-right px-4 py-2 font-medium">Contenidos</th>
                      <th className="text-right px-4 py-2 font-medium">Agendados</th>
                      <th className="text-right px-4 py-2 font-medium">Presupuesto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.map(c => {
                      const chs = parsedChannels(c.channels)
                      return (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{c.name}</td>
                          <td className="px-4 py-2.5">
                            <Badge className={cn('text-xs border', STATUS_COLORS[c.status] || STATUS_COLORS.draft)}>
                              {c.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              {chs.slice(0, 3).map(ch => (
                                <span key={ch} style={{ color: getChannelColor(ch) }}>
                                  {channelIcon(ch)}
                                </span>
                              ))}
                              {chs.length > 3 && <span className="text-xs text-muted-foreground">+{chs.length - 3}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">{c._count?.contents || 0}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{c._count?.calendarEntries || 0}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                            {c.budget
                              ? c.budget.toLocaleString('es-MX', { style: 'currency', currency: c.currency })
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI result */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              </div>
              <p className="text-sm text-muted-foreground">Analizando campañas con IA...</p>
            </div>
          )}

          {result && !analyzing && (
            <Card className="bg-card border-violet-500/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    <CardTitle className="text-sm font-semibold">Recomendaciones de Optimización</CardTitle>
                    <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">IA</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={copyResult}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-xs text-foreground leading-relaxed font-sans max-h-[500px] overflow-y-auto">
                  {result}
                </pre>
              </CardContent>
            </Card>
          )}

          {!result && !analyzing && campaigns.length === 0 && (
            <EmptyState
              icon={<BarChart3 className="h-10 w-10 text-violet-400/40" />}
              title="Sin campañas para optimizar"
              description="Crea campañas en la pestaña Campañas y luego vuelve aquí para obtener recomendaciones de IA."
            />
          )}

          {!result && !analyzing && campaigns.length > 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                <TrendingUp className="h-7 w-7 text-violet-400/60" />
              </div>
              <div>
                <p className="font-medium">Listo para analizar</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Haz clic en &ldquo;Analizar con IA&rdquo; para obtener recomendaciones personalizadas de optimización basadas en tus campañas y datos del CRM.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={analyze}
                disabled={analyzing}
              >
                <Sparkles className="h-4 w-4" /> Analizar con IA
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: AUTOMATION
// ═══════════════════════════════════════════════════════════════

interface MarketingAutomationItem {
  id: string
  name: string
  isActive: boolean
  trigger: string
  triggerValue: string
  action: string
  actionConfig: string
  campaignId: string | null
  executedCount: number
  lastExecuted: string | null
  createdAt: string
  campaign?: { id: string; name: string; status: string } | null
}

const TRIGGER_OPTIONS = [
  { value: 'pipeline_stage', label: 'Etapa del Pipeline', description: 'Cuando un contacto cambia de etapa', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'temperature', label: 'Temperatura del Lead', description: 'Según calificación caliente/tibio/frío', icon: <Flame className="h-4 w-4" /> },
  { value: 'tag', label: 'Etiqueta del Contacto', description: 'Cuando se asigna una etiqueta específica', icon: <Target className="h-4 w-4" /> },
  { value: 'days_inactive', label: 'Días sin actividad', description: 'Si el contacto lleva N días sin interacción', icon: <Clock className="h-4 w-4" /> },
]

const ACTION_OPTIONS = [
  { value: 'send_whatsapp', label: 'Enviar WhatsApp', description: 'Mensaje automatizado por WhatsApp Business', icon: <MessageSquare className="h-4 w-4 text-emerald-400" /> },
  { value: 'generate_content', label: 'Generar Contenido IA', description: 'Crear contenido personalizado automáticamente', icon: <Sparkles className="h-4 w-4 text-violet-400" /> },
  { value: 'create_task', label: 'Crear Tarea en CRM', description: 'Añadir tarea de seguimiento al agente', icon: <Plus className="h-4 w-4 text-amber-400" /> },
]

const PIPELINE_STAGES = [
  'nuevo', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido',
]

function AutomationTab({ workspaceId }: { workspaceId: string }) {
  const [automations, setAutomations] = useState<MarketingAutomationItem[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [reactivationResult, setReactivationResult] = useState('')
  const [form, setForm] = useState({
    name: '',
    trigger: 'temperature',
    triggerValue: 'cold',
    action: 'send_whatsapp',
    messageTemplate: '',
    campaignId: '',
    channel: 'whatsapp',
  })
  const [genTpl, setGenTpl] = useState(false)

  const [metrics, setMetrics] = useState<{ mensajesEnviados: number; leadsContactados: number; tasaRespuesta: number; leadsReactivados: number } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/marketing/automation?workspaceId=${workspaceId}`).then(r => r.json()),
      fetch(`/api/marketing/campaigns?workspaceId=${workspaceId}`).then(r => r.json()),
    ])
      .then(([aData, cData]) => {
        setAutomations(aData.automations || [])
        setCampaigns(cData.campaigns || [])
      })
      .finally(() => setLoading(false))
    fetch(`/api/marketing/automation/metrics?workspaceId=${workspaceId}&days=30`).then(r => r.json()).then(setMetrics).catch(() => {})
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch('/api/marketing/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, workspaceId, isActive: !isActive }),
    })
    load()
  }

  const deleteAutomation = async (id: string) => {
    await fetch(`/api/marketing/automation?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
    toast.success('Automatización eliminada')
    load()
  }

  const createAutomation = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.messageTemplate.trim() && form.action === 'send_whatsapp') {
      toast.error('Escribe la plantilla del mensaje'); return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/marketing/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: form.name,
          trigger: form.trigger,
          triggerValue: form.triggerValue,
          action: form.action,
          actionConfig: { messageTemplate: form.messageTemplate, message: form.messageTemplate, channel: form.channel },
          campaignId: form.campaignId || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Automatización creada')
      setShowCreate(false)
      setForm({ name: '', trigger: 'temperature', triggerValue: 'cold', action: 'send_whatsapp', messageTemplate: '', campaignId: '', channel: 'whatsapp' })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al crear automatización')
    } finally {
      setCreating(false)
    }
  }

  const generateReactivationMessages = async () => {
    setReactivating(true)
    setReactivationResult('')
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: 'reactivate',
          channels: ['whatsapp'],
          product: 'los servicios del negocio',
          tone: 'empatico',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReactivationResult(data.result)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al generar mensajes')
    } finally {
      setReactivating(false)
    }
  }

  const getTriggerLabel = (trigger: string) => TRIGGER_OPTIONS.find(t => t.value === trigger)?.label || trigger
  const getActionLabel = (action: string) => ACTION_OPTIONS.find(a => a.value === action)?.label || action
  const getActionIcon = (action: string) => ACTION_OPTIONS.find(a => a.value === action)?.icon || <Zap className="h-4 w-4" />

  const getTriggerValueDisplay = (trigger: string, value: string) => {
    if (trigger === 'temperature') {
      const map: Record<string, string> = { hot: '🔥 Caliente', warm: '🌡️ Tibio', cold: '❄️ Frío' }
      return map[value] || value
    }
    if (trigger === 'days_inactive') return `${value} días sin actividad`
    return value
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background/50 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">Automatización de Marketing</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Reglas automáticas basadas en comportamiento del CRM</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
          <Plus className="h-3.5 w-3.5" /> Nueva Regla
        </Button>
      </div>

      {/* Dashboard de métricas (últimos 30 días) — contrato §Pantalla 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 border-b border-border bg-muted/20">
        {[
          { l: 'Leads contactados', v: metrics?.leadsContactados ?? '—', c: 'text-blue-400' },
          { l: 'Mensajes enviados', v: metrics?.mensajesEnviados ?? '—', c: 'text-violet-400' },
          { l: 'Tasa de respuesta', v: metrics ? `${metrics.tasaRespuesta}%` : '—', c: 'text-emerald-400' },
          { l: 'Leads reactivados', v: metrics?.leadsReactivados ?? '—', c: 'text-amber-400' },
        ].map((m) => (
          <div key={m.l} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className={cn('text-lg font-bold', m.c)}>{m.v}</p>
            <p className="text-[11px] text-muted-foreground">{m.l}</p>
          </div>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">

          {/* Reactivation section */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15">
                  <Snowflake className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Reactivación de Leads Fríos</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Genera mensajes humanizados para reactivar contactos sin actividad reciente. Usa datos del CRM para personalizar el tono.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0"
                onClick={generateReactivationMessages}
                disabled={reactivating}
              >
                {reactivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generar mensajes IA
              </Button>
            </div>

            {reactivationResult && (
              <div className="mt-3 bg-background/80 rounded-lg p-3 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Mensajes generados</span>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                    onClick={() => { navigator.clipboard.writeText(reactivationResult); toast.success('Copiado') }}
                  >
                    <Copy className="h-3 w-3" /> Copiar
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-foreground leading-relaxed font-sans max-h-72 overflow-y-auto">
                  {reactivationResult}
                </pre>
              </div>
            )}
          </div>

          {/* Automations list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reglas de automatización</h3>
              <span className="text-xs text-muted-foreground">{automations.length} reglas</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : automations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-sm">Sin reglas configuradas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crea reglas para enviar mensajes automáticos según el comportamiento del CRM.
                </p>
                <Button size="sm" variant="outline" className="mt-3 text-xs gap-1" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3 w-3" /> Crear primera regla
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {automations.map(rule => {
                  let parsedConfig: Record<string, string> = {}
                  try { parsedConfig = JSON.parse(rule.actionConfig) } catch { /* empty */ }
                  return (
                    <div
                      key={rule.id}
                      className={cn(
                        'p-4 rounded-xl border transition-colors',
                        rule.isActive ? 'bg-card border-border' : 'bg-muted/30 border-border/50 opacity-60'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="mt-0.5">{getActionIcon(rule.action)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{rule.name}</span>
                              <Badge
                                className={cn('text-xs border', rule.isActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                                )}
                              >
                                {rule.isActive ? 'activa' : 'inactiva'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                Si: <span className="text-foreground">{getTriggerLabel(rule.trigger)}</span>
                                {' = '}
                                <span className="text-foreground">{getTriggerValueDisplay(rule.trigger, rule.triggerValue)}</span>
                              </span>
                              <span className="text-xs text-muted-foreground/50">→</span>
                              <span className="text-xs text-muted-foreground">
                                Entonces: <span className="text-foreground">{getActionLabel(rule.action)}</span>
                              </span>
                            </div>
                            {parsedConfig.messageTemplate && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                                &ldquo;{parsedConfig.messageTemplate}&rdquo;
                              </p>
                            )}
                            {rule.campaign && (
                              <p className="text-xs text-violet-400/70 mt-0.5">📣 {rule.campaign.name}</p>
                            )}
                            {rule.executedCount > 0 && (
                              <p className="text-xs text-muted-foreground/60 mt-0.5">
                                Ejecutada {rule.executedCount} vez{rule.executedCount !== 1 ? 'es' : ''}
                                {rule.lastExecuted && ` · última: ${new Date(rule.lastExecuted).toLocaleDateString('es-MX')}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => toggleActive(rule.id, rule.isActive)}
                            className={cn(
                              'w-9 h-5 rounded-full transition-colors relative',
                              rule.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                            )}
                          >
                            <span className={cn(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                              rule.isActive ? 'translate-x-4' : 'translate-x-0.5'
                            )} />
                          </button>
                          <button
                            onClick={() => deleteAutomation(rule.id)}
                            className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">¿Cómo funciona?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: <TrendingUp className="h-4 w-4 text-violet-400" />, title: 'Disparadores del CRM', desc: 'Las reglas se activan según etapa del pipeline, temperatura del lead, etiquetas o días sin actividad.' },
                { icon: <Zap className="h-4 w-4 text-amber-400" />, title: 'Acciones automáticas', desc: 'Envía mensajes por WhatsApp, genera contenido IA o crea tareas de seguimiento.' },
                { icon: <MessageSquare className="h-4 w-4 text-emerald-400" />, title: 'Mensajes humanizados', desc: 'Usa el generador IA de reactivación para crear mensajes no invasivos adaptados a tu CRM.' },
                { icon: <BarChart3 className="h-4 w-4 text-blue-400" />, title: 'Seguimiento', desc: 'Monitorea cuántas veces se ejecutó cada regla y cuándo fue la última activación.' },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-background border border-border">{item.icon}</div>
                  <div>
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Regla de Automatización</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nombre de la regla *</label>
              <Input
                placeholder="Ej: Reactivar leads fríos por WhatsApp"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Disparador (SI...)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        trigger: t.value,
                        triggerValue: t.value === 'temperature' ? 'cold' : t.value === 'days_inactive' ? '30' : t.value === 'pipeline_stage' ? 'ganado' : '',
                      }))
                    }}
                    className={cn(
                      'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors text-xs',
                      form.trigger === t.value
                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-violet-500/20'
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{t.icon}</span>
                    <div>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger value */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Valor del disparador
              </label>
              {form.trigger === 'temperature' && (
                <Select value={form.triggerValue} onValueChange={v => setForm(f => ({ ...f, triggerValue: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">🔥 Caliente</SelectItem>
                    <SelectItem value="warm">🌡️ Tibio</SelectItem>
                    <SelectItem value="cold">❄️ Frío</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {form.trigger === 'pipeline_stage' && (
                <Select value={form.triggerValue} onValueChange={v => setForm(f => ({ ...f, triggerValue: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {form.trigger === 'days_inactive' && (
                <Input
                  type="number"
                  min={1} max={365}
                  value={form.triggerValue}
                  onChange={e => setForm(f => ({ ...f, triggerValue: e.target.value }))}
                  placeholder="Ej: 30"
                  className="h-8 text-sm"
                />
              )}
              {form.trigger === 'tag' && (
                <Input
                  value={form.triggerValue}
                  onChange={e => setForm(f => ({ ...f, triggerValue: e.target.value }))}
                  placeholder="Ej: cliente-vip, interesado-producto-x"
                  className="h-8 text-sm"
                />
              )}
            </div>

            {/* Action */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Acción (ENTONCES...)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_OPTIONS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setForm(f => ({ ...f, action: a.value }))}
                    className={cn(
                      'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors text-xs',
                      form.action === a.value
                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-violet-500/20'
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{a.icon}</span>
                    <div>
                      <p className="font-medium">{a.label}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5">{a.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Canal de envío (WhatsApp / Telegram) */}
            {form.action === 'send_whatsapp' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Canal de envío</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'whatsapp', l: 'WhatsApp' }, { v: 'telegram', l: 'Telegram' }, { v: 'auto', l: 'Canal preferido del lead' }].map(o => (
                    <button key={o.v} onClick={() => setForm(f => ({ ...f, channel: o.v }))}
                      className={cn('p-2 rounded-lg border text-xs font-medium transition-colors', form.channel === o.v ? 'bg-violet-600/20 border-violet-500/40 text-violet-300' : 'bg-muted/50 border-border text-muted-foreground hover:border-violet-500/20')}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">&ldquo;Canal preferido&rdquo;: el sistema usa Telegram si el lead llegó por Telegram, o WhatsApp si tiene teléfono.</p>
              </div>
            )}

            {/* Message template + generación IA que se INYECTA en la plantilla */}
            {form.action === 'send_whatsapp' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Plantilla del mensaje *</label>
                  <button onClick={async () => {
                    setGenTpl(true)
                    try {
                      const r = await fetch('/api/marketing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, type: 'reactivate', channels: [form.channel === 'telegram' ? 'telegram' : 'whatsapp'], product: 'los servicios del negocio', tone: 'empatico' }) })
                      const d = await r.json(); if (!r.ok) throw new Error(d.error)
                      setForm(f => ({ ...f, messageTemplate: (d.result || '').trim() }))
                      toast.success('Plantilla generada con IA')
                    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error al generar') } finally { setGenTpl(false) }
                  }} className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
                    {genTpl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generar con IA
                  </button>
                </div>
                <Textarea
                  placeholder="Hola {{nombre}}, vi que llevas un tiempo sin que te hayamos contactado. Tenemos una novedad que podría interesarte..."
                  value={form.messageTemplate}
                  onChange={e => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usa variables: {'{{nombre}}'}, {'{{empresa}}'}, {'{{producto}}'}
                </p>
              </div>
            )}

            {/* Optional campaign */}
            {campaigns.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Vincular a campaña (opcional)</label>
                <Select value={form.campaignId || '__none__'} onValueChange={v => setForm(f => ({ ...f, campaignId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sin campaña" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin campaña</SelectItem>
                    {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={createAutomation} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Crear Regla
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Shared: Empty State ──────────────────────────────────────

function EmptyState({
  icon, title, description, action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">{icon}</div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {action.label}
        </Button>
      )}
    </div>
  )
}
