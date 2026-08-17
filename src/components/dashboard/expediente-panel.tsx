'use client'

// ═══════════════════════════════════════════════════════════════
// Panel lateral "Expediente del lead" (tipo mockup): pestañas
// Resumen / Historial / Notas / Oportunidades / Archivos.
// Consolida datos REALES: Contact, LeadProfile (arquetipo, presupuesto,
// interés…), mensajes recientes, deals (oportunidades), bitácora y docs.
// Compartido por Contactos, Bandeja y ValiGuard.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import {
  X, Brain, Calendar, Target, FileText, AlertCircle, Sparkles, Loader2, History,
  Phone, Mail, MessageCircle, User, Tag, PenLine, Copy, Check, Bot, Trophy,
  ClipboardList, Send, CalendarPlus, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

interface ProfileData {
  archetype: string
  archetypeConfidence: number
  temperature: string
  score: number
  budget?: string | null
  preferredProduct?: string | null
  mainObjection?: string | null
  decisionMaker?: string | null
  timeline?: string | null
  urgencyLevel?: string | null
  buyingMotivation?: string | null
  totalMessages?: number
  painPoints?: string
  interests?: string
}

interface ApptData { date: string; title: string; type: string; status: string }
interface ExpedienteData { filesByCategory?: Record<string, unknown>; readyForInvoice?: boolean; missingForInvoice?: string[] }
interface TimelineEvent {
  id: string; type: string; title: string; detail?: string | null
  source: string; importance: string; createdAt: string
}
interface RecentMessage {
  id: string; content: string; type: string; direction: string
  senderType: string; isAiGenerated: boolean; createdAt: string
}
interface DealData {
  id: string; title: string; value: number; currency: string; status: string
  stageName?: string | null; stageColor?: string | null; probability?: number | null
  isWon?: boolean; isLost?: boolean; assignedToName?: string | null; updatedAt: string
}
interface ContactData {
  id: string; firstName: string; lastName?: string | null; phone?: string | null
  email?: string | null; source?: string | null; leadScore: number; temperature?: string | null
  avatar?: string | null; tags?: string | null; notes?: string | null
  createdAt?: string | null; lastMessageAt?: string | null
}

interface ApiResponse {
  contact: ContactData
  profile: ProfileData | null
  nextAppointment: ApptData | null
  expediente: ExpedienteData | null
  timeline?: TimelineEvent[]
  recentMessages?: RecentMessage[]
  deals?: DealData[]
  activity?: { d: string; n: number }[]
}

const ARCHETYPE_LABELS: Record<string, { label: string; hint: string }> = {
  practico: { label: 'Práctico', hint: 'Precio, ahorro, costo-beneficio' },
  familiar: { label: 'Familiar', hint: 'Espacio, seguridad, comodidad' },
  aspiracional: { label: 'Aspiracional', hint: 'Diseño, estatus, lo último' },
  estrategico: { label: 'Estratégico', hint: 'ROI, negocio, deducible' },
  consciente: { label: 'Consciente', hint: 'Sustentable, eficiente' },
  desconocido: { label: 'Sin detectar aún', hint: 'Se define conforme conversa' },
}

function tempBadge(temp?: string | null) {
  if (temp === 'hot') return { label: 'Lead caliente', cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/30' }
  if (temp === 'warm') return { label: 'Lead tibio', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30' }
  return { label: 'Frío', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30' }
}

function buildRecommendation(d: ApiResponse): string {
  const score = d.profile?.score ?? d.contact.leadScore ?? 0
  if (d.nextAppointment) return 'Cita agendada — confirma asistencia y prepara la llamada.'
  if (d.profile?.mainObjection) return `Resuelve la objeción detectada: "${mapValue('objection', d.profile.mainObjection)}".`
  if (score >= 70) return 'Lead caliente — llama o empuja al cierre hoy.'
  if (score >= 40) return 'Lead tibio — da seguimiento activo y agenda una cita.'
  return 'Lead frío — sigue calificando: presupuesto, necesidad y urgencia.'
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `Hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `Hace ${h} h`
  const days = Math.floor(h / 24)
  if (days < 30) return `Hace ${days} día${days > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
function money(v: number, currency = 'MXN'): string {
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v) }
  catch { return `$${Math.round(v).toLocaleString('es-MX')}` }
}
function scoreLabel(s: number): string {
  if (s >= 70) return 'Muy alta intención de compra'
  if (s >= 40) return 'Interés medio'
  return 'Interés inicial'
}
function scoreColor(s: number): string {
  return s >= 70 ? 'text-emerald-500' : s >= 40 ? 'text-amber-500' : 'text-muted-foreground'
}

function parseJsonArray(s?: string): string[] {
  if (!s) return []
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean).map(String) : [] } catch { return [] }
}

const VALUE_MAPS: Record<string, Record<string, string>> = {
  timeline: { now: 'Inmediato', ya: 'Inmediato', soon: 'Pronto', 'esta semana': 'Esta semana', later: 'Más adelante', exploring: 'Explorando', explorando: 'Explorando' },
  motivation: { status: 'Estatus', estatus: 'Estatus', price: 'Precio', precio: 'Precio', need: 'Necesidad', necesidad: 'Necesidad', quality: 'Calidad', security: 'Seguridad', seguridad: 'Seguridad', work: 'Trabajo / Negocio', trabajo: 'Trabajo / Negocio', family: 'Familia', familia: 'Familia' },
  objection: { time: 'Tiempo', tiempo: 'Tiempo', price: 'Precio', precio: 'Precio', trust: 'Confianza', confianza: 'Confianza', budget: 'Presupuesto', presupuesto: 'Presupuesto', competencia: 'Competencia', competition: 'Competencia', ninguna: 'Ninguna' },
}
function mapValue(kind: string, v?: string | null): string | null {
  if (!v) return null
  const key = v.trim().toLowerCase()
  const dict = VALUE_MAPS[kind]
  if (dict && dict[key]) return dict[key]
  return v.charAt(0).toUpperCase() + v.slice(1)
}

const HIDDEN_TAGS = new Set(['whatsapp_incoming', 'whatsapp_outgoing', 'whatsapp_history_sync', 'imported', 'manual', 'lead'])
function prettyTag(tag: string): string {
  const t = tag.trim()
  if (t.includes(':')) {
    const [k, ...rest] = t.split(':')
    const v = rest.join(':').trim()
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    return `${cap(k.trim())}: ${cap(v)}`
  }
  const clean = t.replace(/[_-]+/g, ' ').trim()
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

const MSG_TYPE_PREVIEW: Record<string, string> = { image: '📷 Imagen', audio: '🎤 Audio', video: '🎬 Video', document: '📄 Documento', location: '📍 Ubicación' }
function msgMeta(m: RecentMessage): { label: string; icon: React.ReactNode; tone: string } {
  if (m.isAiGenerated) return { label: 'WhatsApp · Agente IA (JHON)', icon: <Bot className="h-3.5 w-3.5" />, tone: 'text-emerald-500' }
  if (m.direction === 'inbound') return { label: 'WhatsApp · Conversación', icon: <MessageCircle className="h-3.5 w-3.5" />, tone: 'text-green-500' }
  return { label: 'WhatsApp · Manual', icon: <MessageCircle className="h-3.5 w-3.5" />, tone: 'text-blue-500' }
}

function timelineAccent(ev: TimelineEvent): string {
  if (ev.source === 'ai' || ev.type === 'ai_summary') return 'border-purple-400/60 bg-purple-500/5'
  if (ev.importance === 'high') return 'border-amber-400/60 bg-amber-500/5'
  return 'border-border/60 bg-muted/30'
}

function SectionTitle({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{children}</p>
      {action}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground">{value || '—'}</p>
    </div>
  )
}

type TabKey = 'resumen' | 'historial' | 'notas' | 'oportunidades' | 'archivos'

export function ExpedientePanel({
  workspaceId,
  contactId,
  onClose,
  persistent = false,
  embedded = false,
  onMessage,
  onSchedule,
}: {
  workspaceId: string
  contactId: string
  onClose: () => void
  persistent?: boolean
  /** Rellena el contenedor padre (el padre controla posición/ancho). Evita doble ancho. */
  embedded?: boolean
  /** Acción de "Enviar mensaje". Si no se pasa, abre WhatsApp (wa.me). */
  onMessage?: () => void
  /** Acción de "Agendar cita". Si no se pasa, usa el mini-agendador inline. */
  onSchedule?: () => void
}) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [tab, setTab] = useState<TabKey>('resumen')
  const [copied, setCopied] = useState(false)
  // Mini-agendador inline
  const [scheduling, setScheduling] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [savingAppt, setSavingAppt] = useState(false)

  const reload = () => {
    let cancelled = false
    setLoading(true); setErr(false)
    fetch(`/api/contacts/${contactId}/profile?workspaceId=${workspaceId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => { if (!cancelled) setData(j) })
      .catch(() => { if (!cancelled) setErr(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }
  useEffect(reload, [contactId, workspaceId])

  const copyPhone = () => {
    if (!data?.contact.phone) return
    navigator.clipboard?.writeText(data.contact.phone).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  const handleMessage = () => {
    if (onMessage) return onMessage()
    const phone = data?.contact.phone?.replace(/\D/g, '')
    if (phone) window.open(`https://wa.me/${phone}`, '_blank')
    else toast.error('El contacto no tiene teléfono')
  }
  const handleScheduleClick = () => {
    if (onSchedule) return onSchedule()
    setScheduling((s) => !s)
  }
  const createAppointment = async () => {
    if (!schedDate || !data) return
    setSavingAppt(true)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, contactId, title: `Cita — ${[data.contact.firstName, data.contact.lastName].filter(Boolean).join(' ')}`,
          date: new Date(schedDate).toISOString(), duration: 30, type: 'test_drive',
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cita agendada')
      setScheduling(false); setSchedDate('')
      reload()
    } catch {
      toast.error('No se pudo agendar la cita')
    } finally { setSavingAppt(false) }
  }

  const arche = ARCHETYPE_LABELS[data?.profile?.archetype || 'desconocido'] || ARCHETYPE_LABELS.desconocido
  // Fuente ÚNICA de score/temperatura: Contact (leadScore/temperature) — es lo que
  // actualiza el pipeline y muestra la tabla de Contactos, el ScoreRing y el header
  // del chat. Antes el expediente prefería LeadProfile.score, que se desincroniza y
  // hacía que un lead saliera "Caliente" en el header y "Tibio" aquí a la vez.
  const temp = tempBadge(data?.contact?.temperature || data?.profile?.temperature)
  const score = data?.contact?.leadScore ?? data?.profile?.score ?? 0
  const deals = data?.deals || []
  const activeDeal = deals.find((d) => d.status === 'active') || deals[0] || null
  const isClient = deals.some((d) => d.status === 'won')
  const tipoCliente = isClient ? 'Cliente' : 'Prospecto'
  const docCats = data?.expediente?.filesByCategory ? Object.keys(data.expediente.filesByCategory) : []
  const activity = data?.activity || []
  const hasActivity = activity.some((a) => a.n > 0)
  const fullName = data ? [data.contact.firstName, data.contact.lastName].filter(Boolean).join(' ') : ''

  const TABS: { k: TabKey; label: string }[] = [
    { k: 'resumen', label: 'Resumen' },
    { k: 'historial', label: 'Historial' },
    { k: 'notas', label: 'Notas' },
    { k: 'oportunidades', label: 'Oportunidades' },
    { k: 'archivos', label: 'Archivos' },
  ]

  return (
    <div className={cn(
      'border-l border-border bg-background flex flex-col overflow-hidden',
      embedded
        ? 'w-full h-full'
        : persistent
          ? 'w-[360px] shrink-0 h-full'
          : 'absolute right-0 top-0 bottom-0 z-40 w-[360px] max-w-[92vw] shadow-xl animate-in slide-in-from-right-4'
    )}>
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Expediente del lead</h3>
        </div>
        {!persistent && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : err || !data ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs p-4 text-center">
          <AlertCircle className="h-5 w-5" /> No se pudo cargar el expediente.
        </div>
      ) : (
        <>
          {/* Cabecera */}
          <div className="px-4 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 ring-2 ring-background shadow">
                {data.contact.avatar ? <AvatarImage src={data.contact.avatar} alt={data.contact.firstName} /> : null}
                <AvatarFallback className="bg-gradient-to-br from-zinc-600 to-zinc-800 text-white text-base font-semibold">{getInitials(fullName || '??')}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm truncate">{fullName}</h4>
                  <Badge className={cn('h-5 text-[10px] px-2 shrink-0', temp.cls)}>{temp.label}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {data.contact.lastMessageAt ? `Última interacción: ${timeAgo(data.contact.lastMessageAt)}` : 'Sin interacciones aún'}
                  {data.contact.source ? ` por ${data.contact.source}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Pestañas */}
          <div className="px-3 shrink-0 border-b border-border/60">
            <div className="flex gap-1 overflow-x-auto custom-scroll">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={cn('relative px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors', tab === t.k ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground')}>
                  {t.label}
                  {tab === t.k && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-emerald-500" />}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-4">
              {/* ═══ RESUMEN ═══ */}
              {tab === 'resumen' && (
                <>
                  {/* Contacto + Puntaje gBrain */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-border/60 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground flex-1 truncate">{data.contact.phone || '—'}</span>
                        {data.contact.phone && (
                          <button onClick={copyPhone} className="text-muted-foreground hover:text-foreground" title="Copiar">
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-foreground truncate">{data.contact.email || '—'}</span></div>
                      <div className="flex items-center gap-2 text-xs"><Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-foreground">Origen: {data.contact.source || 'whatsapp'}</span></div>
                      <div className="flex items-center gap-2 text-xs"><Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-foreground">Contacto desde: <span className="font-medium">{fmtDate(data.contact.createdAt)}</span></span></div>
                    </div>

                    <div className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Puntaje gBrain</p>
                          <p className={cn('text-3xl font-bold leading-none mt-1', scoreColor(score))}>{score}<span className="text-sm text-muted-foreground font-normal">/100</span></p>
                          <p className="text-[11px] text-emerald-500 mt-1">{scoreLabel(score)}</p>
                        </div>
                        <div className="h-12 w-24">
                          {hasActivity ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={activity} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="scoreSpark" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="n" stroke="#10b981" strokeWidth={2} fill="url(#scoreSpark)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recomendación IA (derivada) */}
                  <div className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 dark:border-yellow-500/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-yellow-700 dark:text-yellow-300 flex items-center gap-1 mb-1"><Sparkles className="h-3 w-3" /> Recomendación IA</p>
                    <p className="text-xs text-yellow-900 dark:text-yellow-100">{buildRecommendation(data)}</p>
                  </div>

                  {/* Información de interés */}
                  <div>
                    <SectionTitle icon={<Target className="h-3 w-3" />}>Información de interés</SectionTitle>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                      <InfoField label="Tipo de cliente" value={tipoCliente} />
                      <InfoField label="Tiempo de compra" value={mapValue('timeline', data.profile?.timeline)} />
                      <InfoField label="Presupuesto" value={mapValue('budget', data.profile?.budget)} />
                      <InfoField label="Quién decide" value={mapValue('decision', data.profile?.decisionMaker)} />
                      <InfoField label="Vehículo de interés" value={mapValue('product', data.profile?.preferredProduct)} />
                      <InfoField label="Motivación" value={mapValue('motivation', data.profile?.buyingMotivation)} />
                    </div>
                  </div>

                  {/* Arquetipo */}
                  <div className="rounded-lg border-l-4 border-purple-400 bg-purple-50 dark:bg-purple-500/10 dark:border-purple-500/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-purple-700 dark:text-purple-300 flex items-center gap-1 mb-1"><Brain className="h-3 w-3" /> Arquetipo detectado</p>
                    <p className="text-xs font-bold text-purple-900 dark:text-purple-100">{arche.label}
                      {data.profile && data.profile.archetypeConfidence > 0 && <span className="font-normal text-purple-700/70 dark:text-purple-200/70"> · {Math.round(data.profile.archetypeConfidence * 100)}%</span>}
                    </p>
                    <p className="text-[11px] text-purple-700/70 dark:text-purple-200/60 mt-0.5">{arche.hint}</p>
                  </div>

                  {/* Interacciones recientes */}
                  <div>
                    <SectionTitle icon={<History className="h-3 w-3" />} action={data.recentMessages && data.recentMessages.length > 0 ? <button onClick={() => setTab('historial')} className="text-[10px] text-emerald-500 hover:underline">Ver todas</button> : undefined}>Interacciones recientes</SectionTitle>
                    {data.recentMessages && data.recentMessages.length > 0 ? (
                      <div className="space-y-2">
                        {data.recentMessages.slice(0, 4).map((m) => {
                          const meta = msgMeta(m)
                          const preview = MSG_TYPE_PREVIEW[m.type] || m.content || ''
                          return (
                            <div key={m.id} className="flex gap-2.5">
                              <span className={cn('mt-0.5 shrink-0', meta.tone)}>{meta.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-medium truncate">{meta.label}</p>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(m.createdAt)}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">{preview}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin interacciones registradas.</p>
                    )}
                  </div>

                  {/* Oportunidad activa */}
                  <div>
                    <SectionTitle icon={<Trophy className="h-3 w-3" />} action={deals.length > 1 ? <button onClick={() => setTab('oportunidades')} className="text-[10px] text-emerald-500 hover:underline">Ver todas</button> : undefined}>Oportunidad activa</SectionTitle>
                    {activeDeal ? <DealCard deal={activeDeal} /> : <p className="text-xs text-muted-foreground">Sin oportunidad activa.</p>}
                  </div>

                  {/* Próxima cita */}
                  {data.nextAppointment && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 flex items-center gap-1 mb-1"><Calendar className="h-3 w-3" /> Próxima cita</p>
                      <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">{data.nextAppointment.title}</p>
                      <p className="text-xs text-emerald-700/80 dark:text-emerald-200/70">{new Date(data.nextAppointment.date).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    </div>
                  )}

                  {/* Etiquetas */}
                  {(() => {
                    const tags = parseJsonArray(data.contact.tags || undefined).filter((t) => !HIDDEN_TAGS.has(t.trim().toLowerCase()))
                    if (tags.length === 0) return null
                    return (
                      <div>
                        <SectionTitle icon={<Tag className="h-3 w-3" />}>Etiquetas</SectionTitle>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((t, i) => <Badge key={i} className={cn('h-5 text-[10px] px-2 border-0', i % 3 === 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' : i % 3 === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300')}>{prettyTag(t)}</Badge>)}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}

              {/* ═══ HISTORIAL ═══ */}
              {tab === 'historial' && (
                <div>
                  <SectionTitle icon={<History className="h-3 w-3" />}>Bitácora del expediente</SectionTitle>
                  {data.timeline && data.timeline.length > 0 ? (
                    <div className="space-y-1.5">
                      {data.timeline.map((ev) => (
                        <div key={ev.id} className={cn('rounded-md border-l-2 px-2.5 py-1.5', timelineAccent(ev))}>
                          <p className="text-[11px] leading-snug text-foreground">{ev.title}</p>
                          {ev.detail && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ev.detail}</p>}
                          <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(ev.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}{ev.source === 'ai' ? ' · IA' : ''}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aún sin anotaciones. La IA irá registrando aquí los puntos importantes conforme avanza la conversación.</p>
                  )}
                </div>
              )}

              {/* ═══ NOTAS ═══ */}
              {tab === 'notas' && (
                <div>
                  <SectionTitle icon={<PenLine className="h-3 w-3" />}>Notas internas</SectionTitle>
                  {data.contact.notes ? (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5"><p className="text-xs text-foreground whitespace-pre-line">{data.contact.notes}</p></div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin notas. Añádelas en la pestaña “Notas” del chat.</p>
                  )}
                </div>
              )}

              {/* ═══ OPORTUNIDADES ═══ */}
              {tab === 'oportunidades' && (
                <div>
                  <SectionTitle icon={<Trophy className="h-3 w-3" />}>Oportunidades ({deals.length})</SectionTitle>
                  {deals.length > 0 ? (
                    <div className="space-y-2.5">{deals.map((d) => <DealCard key={d.id} deal={d} />)}</div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Este contacto no tiene oportunidades (deals) en el pipeline.</p>
                  )}
                </div>
              )}

              {/* ═══ ARCHIVOS ═══ */}
              {tab === 'archivos' && (
                <div>
                  <SectionTitle icon={<ClipboardList className="h-3 w-3" />}>Documentos</SectionTitle>
                  {docCats.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">{docCats.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}</div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin documentos en archivo.</p>
                  )}
                  {data.expediente && (
                    <p className={cn('text-[11px] mt-2', data.expediente.readyForInvoice ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {data.expediente.readyForInvoice ? '✅ Listo para facturar' : '⏳ Aún no listo para facturar'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Acciones inferiores */}
          <div className="border-t border-border p-3 shrink-0 space-y-2">
            {scheduling && !onSchedule && (
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="h-9 text-xs" />
                <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" disabled={!schedDate || savingAppt} onClick={createAppointment}>
                  {savingAppt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Crear'}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMessage}>
                <Send className="h-4 w-4" /> Enviar mensaje
              </Button>
              <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleScheduleClick}>
                <CalendarPlus className="h-4 w-4" /> Agendar cita
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DealCard({ deal }: { deal: DealData }) {
  const statusLabel = deal.isWon || deal.status === 'won' ? 'Ganada'
    : deal.isLost || deal.status === 'lost' ? 'Perdida'
      : deal.status === 'paused' ? 'Pausada' : (deal.stageName || 'Activa')
  const prob = deal.probability ?? null
  const color = deal.stageColor || '#8b5cf6'
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}22`, color }}><Trophy className="h-4 w-4" /></span>
          <p className="text-sm font-semibold truncate">{deal.title}</p>
        </div>
        <Badge className="h-5 text-[9px] px-2 shrink-0 border-0" style={{ backgroundColor: `${color}22`, color }}>{statusLabel}</Badge>
      </div>
      <p className="text-base font-bold mt-2">{money(deal.value, deal.currency)}</p>
      {prob !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1"><span>Probabilidad</span><span className="font-medium">{prob}%</span></div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prob}%`, backgroundColor: color }} /></div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{deal.assignedToName || 'Sin asignar'}</span>
        <span>Act. {timeAgo(deal.updatedAt)}</span>
      </div>
    </div>
  )
}
