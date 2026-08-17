'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Shield, ShieldCheck, ShieldAlert, FileCheck, Lock, AlertTriangle, CheckCircle2, XCircle,
  Activity, Bell, Users, Search, Download, Calendar, CalendarX, Play, Sparkles, Target,
  TrendingUp, Zap, Flame, User, FileText, Eye, Trash2, Layers, LogIn, UserCog, X, Copy,
  ChevronLeft, ChevronRight, ClipboardCheck, Monitor, Smartphone, Tablet, MapPin, Clock,
  LogOut, Loader2, type LucideIcon,
} from 'lucide-react'
import { ScoreRing } from '@/components/ui/score-ring'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpedientePanel } from './expediente-panel'

// ── Types ──
type Risk = 'alto' | 'medio' | 'bajo' | 'info'
interface UnifiedEvent {
  id: string
  source: 'engine' | 'timeline' | 'automation' | 'audit'
  createdAt: string
  actor: string
  actorName: string
  event: string
  eventKey: string
  subType?: string
  module: string
  details: string
  contactId?: string
  contactName?: string
  risk: Risk
  metadata: Record<string, unknown>
  ip?: string
  device?: string
  location?: string
}
interface AccessSessionRow {
  id: string
  userId: string
  userName: string
  ip?: string
  device?: string
  browser?: string
  os?: string
  deviceType?: string
  location?: string
  isActive: boolean
  createdAt: string
  lastSeenAt: string
}
interface Kpis {
  eventosHoy: number
  eventosHoyDelta: number | null
  alertasActivas: number
  usuariosActivos: number
  sesionesActivas: number
  accesosSospechosos: number
  riesgoAlto: number
  totalEventos: number
}
interface ComplianceContact { id: string; nombre: string; consentimiento: number; estatusSellado: 'sellado' | 'pendiente' | 'vencido'; cumplimiento: number }
interface ValiGuardViewProps { workspaceId: string }

// ── Maps ──
const EVENT_ICONS: Record<string, LucideIcon> = {
  play: Play, sparkles: Sparkles, target: Target, trending: TrendingUp, zap: Zap, flame: Flame,
  bell: Bell, alert: AlertTriangle, calendar: Calendar, 'calendar-x': CalendarX, user: User,
  file: FileText, shield: Shield, briefcase: FileCheck, eye: Eye, download: Download, trash: Trash2,
  layers: Layers, login: LogIn, 'shield-alert': ShieldAlert, 'user-cog': UserCog, activity: Activity,
}
const MODULE_CLS: Record<string, string> = {
  'Motor IA': 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  'Inteligencia': 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
  'Automatizaciones': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  'Ventas (Pipeline)': 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  'Calendario Auto': 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'Conversaciones': 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  'Contactos': 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  'Analíticas Live': 'bg-teal-500/15 text-teal-600 dark:text-teal-300',
  'Equipo (Roles)': 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  'Accesos': 'bg-red-500/15 text-red-600 dark:text-red-300',
  'ValiGuard': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
}
const moduleCls = (m: string) => MODULE_CLS[m] || 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300'

const RISK_META: Record<Risk, { label: string; cls: string; dot: string }> = {
  alto: { label: 'Alto', cls: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30', dot: 'bg-red-500' },
  medio: { label: 'Medio', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  bajo: { label: 'Bajo', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500' },
  info: { label: 'Info', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', dot: 'bg-blue-500' },
}

const META_LABELS: Record<string, string> = {
  ip: 'IP de origen', score: 'Score', temperature: 'Temperatura', scoreDelta: 'Cambio de score',
  expectedOutcome: 'Resultado esperado', daysSince: 'Días sin actividad', threshold: 'Umbral',
  action: 'Acción', email: 'Correo', attempts: 'Intentos', rows: 'Filas exportadas', type: 'Tipo',
  phone: 'Teléfono', name: 'Nombre', from: 'Desde', to: 'Hasta', locked: 'Cuenta bloqueada',
  browser: 'Navegador', os: 'Sistema operativo', device: 'Dispositivo', city: 'Ciudad', country: 'País',
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`
  const dd = Math.floor(h / 24); return `hace ${dd} d`
}
function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  }
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'
}

const TABS = [
  { key: 'live', label: 'Eventos en vivo' },
  { key: 'accesos', label: 'Accesos' },
  { key: 'sesiones', label: 'Sesiones' },
  { key: 'auditoria', label: 'Logs de auditoría' },
  { key: 'criticos', label: 'Cambios críticos' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'cumplimiento', label: 'Cumplimiento' },
] as const
type TabKey = typeof TABS[number]['key']

const PAGE_SIZE = 12

// ── Component ──
export function ValiGuardView({ workspaceId }: ValiGuardViewProps) {
  const [events, setEvents] = useState<UnifiedEvent[]>([])
  const [sessions, setSessions] = useState<AccessSessionRow[]>([])
  const [revoking, setRevoking] = useState<string | null>(null)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [compliance, setCompliance] = useState<number | null>(null)
  const [contacts, setContacts] = useState<ComplianceContact[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('live')
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [windowFilter, setWindowFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<UnifiedEvent | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [drillContactId, setDrillContactId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const [ev, cmp] = await Promise.all([
        fetch(`/api/valiguard/events?workspaceId=${workspaceId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/valiguard?workspaceId=${workspaceId}`).then((r) => (r.ok ? r.json() : null)),
      ])
      if (ev) { setEvents(ev.events || []); setSessions(ev.sessions || []); setKpis(ev.kpis || null) }
      if (cmp) { setCompliance(cmp.metrics?.cumplimiento ?? null); setContacts(cmp.contacts || []) }
    } catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])

  const revokeSession = async (id: string) => {
    setRevoking(id)
    try {
      const r = await fetch('/api/valiguard/sessions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, id }) })
      if (!r.ok) throw new Error()
      setSessions((s) => s.map((x) => (x.id === id ? { ...x, isActive: false } : x)))
      toast.success('Sesión revocada')
    } catch { toast.error('No se pudo revocar la sesión') } finally { setRevoking(null) }
  }
  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { setPage(1) }, [tab, search, moduleFilter, riskFilter, windowFilter])

  const modules = useMemo(() => Array.from(new Set(events.map((e) => e.module))).sort(), [events])

  const filtered = useMemo(() => {
    const now = Date.now()
    const win = windowFilter === 'today' ? 86400000 : windowFilter === '7d' ? 7 * 86400000 : windowFilter === '30d' ? 30 * 86400000 : Infinity
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (win !== Infinity && now - new Date(e.createdAt).getTime() > win) return false
      if (tab === 'accesos' && e.module !== 'Accesos') return false
      if (tab === 'auditoria' && e.source !== 'audit') return false
      if (tab === 'criticos' && e.risk !== 'alto') return false
      if (tab === 'alertas' && !(e.risk === 'alto' || e.risk === 'medio')) return false
      if (moduleFilter !== 'all' && e.module !== moduleFilter) return false
      if (riskFilter !== 'all' && e.risk !== riskFilter) return false
      if (q && !(`${e.event} ${e.details} ${e.actorName} ${e.contactName || ''} ${e.module}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [events, tab, search, moduleFilter, riskFilter, windowFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageEvents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportReport = () => {
    const rows = filtered.map((e) => {
      const { date, time } = fmtDateTime(e.createdAt)
      return [date + ' ' + time, e.actorName, e.event, e.module, e.details.replace(/[\n,]/g, ' '), RISK_META[e.risk].label].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const csv = ['Fecha,Actor,Evento,Modulo,Detalles,Riesgo', ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `valiguard-reporte-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    toast.success(`Reporte exportado (${filtered.length} eventos)`)
  }

  // ── KPI cards (datos reales) ──
  const kpiCards = [
    { label: 'Eventos de hoy', value: (kpis?.eventosHoy ?? 0).toLocaleString('es-MX'), delta: kpis?.eventosHoyDelta ?? null, icon: Activity, from: 'from-violet-500', to: 'to-violet-700', sub: 'actividad registrada' },
    { label: 'Alertas activas', value: (kpis?.alertasActivas ?? 0).toLocaleString('es-MX'), delta: null, icon: Bell, from: 'from-amber-500', to: 'to-amber-700', sub: 'requieren atención (7d)' },
    { label: 'Usuarios activos', value: (kpis?.usuariosActivos ?? 0).toLocaleString('es-MX'), delta: null, icon: Users, from: 'from-blue-500', to: 'to-blue-700', sub: 'miembros del equipo' },
    { label: 'Accesos sospechosos', value: (kpis?.accesosSospechosos ?? 0).toLocaleString('es-MX'), delta: null, icon: ShieldAlert, from: 'from-rose-500', to: 'to-rose-700', sub: 'logins fallidos (7d)' },
    { label: 'Cumplimiento', value: compliance != null ? `${compliance}%` : '—', delta: null, icon: ShieldCheck, from: 'from-emerald-500', to: 'to-emerald-700', sub: 'nivel LFPDPPP' },
  ]

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-lg flex items-center justify-center shrink-0">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold tracking-tight">ValiGuard</h3>
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 gap-1">
                <Lock className="h-3 w-3" /> Cumplimiento y Seguridad
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Monitorea, audita y protege toda la actividad de tu negocio en tiempo real.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as typeof windowFilter)}>
            <SelectTrigger className="h-9 w-[150px] gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportReport}><Download className="h-4 w-4" />Exportar reporte</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { fetchAll(); toast.success('Datos actualizados') }}><Activity className="h-4 w-4" />Actualizar</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {kpiCards.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className="border-border/50">
              <CardContent className="p-3.5">
                <div className="flex items-start gap-3">
                  <div className={cn('h-11 w-11 rounded-2xl bg-gradient-to-br shadow-lg flex items-center justify-center shrink-0', k.from, k.to)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground font-medium leading-tight truncate">{k.label}</p>
                    <p className="text-xl font-bold leading-tight mt-0.5">{loading ? '—' : k.value}</p>
                    {k.delta != null ? (
                      <p className={cn('text-[10px] font-medium', k.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                        {k.delta >= 0 ? '↑' : '↓'} {Math.abs(k.delta)}% vs ayer
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground truncate">{k.sub}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60 mb-4 overflow-x-auto custom-scroll">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-emerald-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cumplimiento' ? (
        <ComplianceTab loading={loading} contacts={contacts} onOpen={setDrillContactId} />
      ) : tab === 'sesiones' ? (
        <SessionsTab loading={loading} sessions={sessions} revoking={revoking} onRevoke={revokeSession} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
          {/* Tabla de eventos */}
          <div className={cn('space-y-3', selected ? 'xl:col-span-3' : 'xl:col-span-4')}>
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar eventos, usuarios, acciones…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Todos los módulos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los módulos</SelectItem>
                  {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue placeholder="Riesgo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo riesgo</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="bajo">Bajo</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="border-border/60 overflow-hidden">
              <div className="overflow-x-auto custom-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-medium px-3 py-2.5">Fecha y hora</th>
                      <th className="text-left font-medium px-2 py-2.5">Usuario / Actor</th>
                      <th className="text-left font-medium px-2 py-2.5 min-w-[200px]">Evento</th>
                      <th className="text-left font-medium px-2 py-2.5">Módulo</th>
                      <th className="text-left font-medium px-2 py-2.5 min-w-[150px]">Detalles</th>
                      <th className="text-left font-medium px-2 py-2.5">IP / Dispositivo</th>
                      <th className="text-left font-medium px-2 py-2.5">Ubicación</th>
                      <th className="text-right font-medium px-3 py-2.5">Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/40"><td colSpan={8} className="px-3 py-3"><Skeleton className="h-6 w-full" /></td></tr>
                      ))
                    ) : pageEvents.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">No hay eventos que coincidan con el filtro</td></tr>
                    ) : pageEvents.map((e) => {
                      const Icon = EVENT_ICONS[e.eventKey] || Activity
                      const { date, time } = fmtDateTime(e.createdAt)
                      const rm = RISK_META[e.risk]
                      return (
                        <tr key={e.id} onClick={() => setSelected(e)} className={cn('border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/40 transition-colors', selected?.id === e.id && 'bg-emerald-500/5')}>
                          <td className="px-3 py-2.5 align-top whitespace-nowrap"><p className="font-medium">{date}</p><p className="text-[11px] text-muted-foreground">{time}</p></td>
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">{initials(e.actorName)}</div>
                              <div className="min-w-0"><p className="font-medium truncate max-w-[130px]">{e.actorName}</p><p className="text-[10px] text-muted-foreground">{e.actor}</p></div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex items-start gap-2">
                              <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-lg shrink-0', moduleCls(e.module))}><Icon className="h-3.5 w-3.5" /></span>
                              <div className="min-w-0"><p className="font-medium leading-tight">{e.event}</p>{e.subType && <p className="text-[10px] text-muted-foreground">{e.subType}</p>}</div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 align-top"><span className={cn('inline-flex text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap', moduleCls(e.module))}>{e.module}</span></td>
                          <td className="px-2 py-2.5 align-top"><p className="text-xs text-muted-foreground line-clamp-2 max-w-[180px]">{e.details || (e.contactName ? e.contactName : '—')}</p>{e.contactName && e.details && <p className="text-[10px] text-muted-foreground/70 truncate max-w-[180px]">{e.contactName}</p>}</td>
                          <td className="px-2 py-2.5 align-top">
                            {e.ip || e.device ? (
                              <div className="min-w-0"><p className="text-xs font-mono">{e.ip || '—'}</p>{e.device && <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{e.device}</p>}</div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-2.5 align-top"><span className="text-xs text-muted-foreground">{e.location || '—'}</span></td>
                          <td className="px-3 py-2.5 align-top text-right"><Badge className={cn('border text-[10px] px-2 py-0.5 gap-1', rm.cls)}><span className={cn('w-1.5 h-1.5 rounded-full', rm.dot)} />{rm.label}</Badge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Paginación */}
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/60 text-[11px] text-muted-foreground">
                <span>Mostrando {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} eventos</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="px-2 tabular-nums">Página {page} / {totalPages}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Panel Detalle del evento */}
          {selected && (
            <div className="xl:col-span-1">
              <EventDetail
                ev={selected}
                reviewed={reviewed.has(selected.id)}
                onClose={() => setSelected(null)}
                onReview={() => { setReviewed((s) => new Set(s).add(selected.id)); toast.success('Evento marcado como revisado') }}
                onOpenContact={(id) => setDrillContactId(id)}
              />
            </div>
          )}
        </div>
      )}

      {/* Drilldown expediente de contacto */}
      {drillContactId && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setDrillContactId(null)} />
          <ExpedientePanel workspaceId={workspaceId} contactId={drillContactId} onClose={() => setDrillContactId(null)} />
        </div>
      )}
    </div>
  )
}

// ── Panel Detalle del evento ──
function EventDetail({ ev, reviewed, onClose, onReview, onOpenContact }: {
  ev: UnifiedEvent; reviewed: boolean; onClose: () => void; onReview: () => void; onOpenContact: (id: string) => void
}) {
  const rm = RISK_META[ev.risk]
  const Icon = EVENT_ICONS[ev.eventKey] || Activity
  const { date, time } = fmtDateTime(ev.createdAt)
  const isLoginFail = ev.eventKey === 'shield-alert'
  const recs = isLoginFail
    ? ['Verificar si el acceso fue legítimo', 'Si no reconoces la actividad, cambiar la contraseña', 'Habilitar verificación en dos pasos (2FA)']
    : ev.risk === 'alto'
      ? ['Revisar el evento y confirmar que es legítimo', 'Dar seguimiento inmediato al contacto o usuario', 'Documentar la acción tomada']
      : ev.risk === 'medio'
        ? ['Dar seguimiento en las próximas horas', 'Revisar el contexto del contacto']
        : ['No requiere acción — registrado para trazabilidad']

  const techEntries = Object.entries(ev.metadata || {}).filter(([k, v]) =>
    v != null && v !== '' && ['string', 'number', 'boolean'].includes(typeof v) && k !== 'decisionTrace'
  ).slice(0, 10)

  const copyDetails = () => {
    navigator.clipboard?.writeText(JSON.stringify({ evento: ev.event, fecha: `${date} ${time}`, actor: ev.actorName, modulo: ev.module, riesgo: rm.label, detalles: ev.details, ...ev.metadata }, null, 2))
      .then(() => toast.success('Detalles copiados')).catch(() => {})
  }

  return (
    <Card className="border-border/60 sticky top-4">
      <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Detalle del evento</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={onClose}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="flex flex-col items-center text-center py-2">
          <div className={cn('h-16 w-16 rounded-2xl flex items-center justify-center', ev.risk === 'alto' ? 'bg-red-500/15' : ev.risk === 'medio' ? 'bg-amber-500/15' : 'bg-emerald-500/15')}>
            <Icon className={cn('h-7 w-7', ev.risk === 'alto' ? 'text-red-500' : ev.risk === 'medio' ? 'text-amber-500' : 'text-emerald-500')} />
          </div>
          <Badge className={cn('mt-2 border text-[10px] gap-1', rm.cls)}><span className={cn('w-1.5 h-1.5 rounded-full', rm.dot)} />{rm.label} riesgo</Badge>
          <p className="text-sm font-semibold mt-2">{ev.event}</p>
          {ev.details && <p className="text-xs text-muted-foreground mt-0.5">{ev.details}</p>}
        </div>

        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Información general</p>
          <div className="space-y-1.5 text-xs">
            <Row label="Fecha y hora" value={`${date}, ${time}`} />
            <Row label="Actor" value={ev.actorName} />
            <Row label="Tipo de actor" value={ev.actor} />
            <Row label="Módulo" value={ev.module} />
            {ev.contactName && <Row label="Contacto" value={ev.contactName} />}
            <Row label="Nivel de riesgo" value={rm.label} valueCls={ev.risk === 'alto' ? 'text-red-500 font-semibold' : ev.risk === 'medio' ? 'text-amber-500 font-semibold' : ''} />
            <Row label="Hace" value={timeAgo(new Date(ev.createdAt))} />
          </div>
        </div>

        {techEntries.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Detalles técnicos</p>
            <div className="space-y-1.5 text-xs">
              {techEntries.map(([k, v]) => <Row key={k} label={META_LABELS[k] || k} value={String(v)} mono />)}
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Acciones recomendadas</p>
          <div className="space-y-1.5">
            {recs.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{r}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button size="sm" className={cn('w-full gap-1.5', reviewed ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : '')} variant={reviewed ? 'default' : 'outline'} onClick={onReview} disabled={reviewed}>
            <ClipboardCheck className="h-3.5 w-3.5" />{reviewed ? 'Revisado' : 'Marcar como revisado'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {ev.contactId && <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => onOpenContact(ev.contactId!)}><User className="h-3.5 w-3.5" />Ver contacto</Button>}
            <Button size="sm" variant="outline" className={cn('gap-1.5 text-xs', !ev.contactId && 'col-span-2')} onClick={copyDetails}><Copy className="h-3.5 w-3.5" />Copiar detalles</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, valueCls, mono }: { label: string; value: string; valueCls?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-[11px]', valueCls)}>{value}</span>
    </div>
  )
}

// ── Pestaña Sesiones (accesos registrados con IP/dispositivo/ubicación) ──
function SessionsTab({ loading, sessions, revoking, onRevoke }: {
  loading: boolean; sessions: AccessSessionRow[]; revoking: string | null; onRevoke: (id: string) => void
}) {
  const deviceIcon = (t?: string): LucideIcon => t === 'Móvil' ? Smartphone : t === 'Tablet' ? Tablet : Monitor
  const active = sessions.filter((s) => s.isActive).length
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Monitor className="h-4 w-4 text-blue-500" />Sesiones y accesos</CardTitle>
            <p className="text-xs text-muted-foreground">Dispositivos desde los que se ha iniciado sesión. Revoca un acceso para cerrarlo remotamente.</p>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] px-2 py-0.5">{active} activa{active !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10">
            <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aún no hay sesiones registradas</p>
            <p className="text-xs text-muted-foreground mt-1">Se registran automáticamente en cada inicio de sesión (dispositivo, IP y ubicación).</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                  <th className="text-left font-medium px-3 py-2.5">Usuario</th>
                  <th className="text-left font-medium px-2 py-2.5">Dispositivo</th>
                  <th className="text-left font-medium px-2 py-2.5">IP</th>
                  <th className="text-left font-medium px-2 py-2.5">Ubicación</th>
                  <th className="text-left font-medium px-2 py-2.5">Inicio</th>
                  <th className="text-left font-medium px-2 py-2.5">Estado</th>
                  <th className="text-right font-medium px-3 py-2.5">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sessions.map((s) => {
                  const DIcon = deviceIcon(s.deviceType)
                  const { date, time } = fmtDateTime(s.createdAt)
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(s.userName)}</div>
                          <span className="text-sm font-medium truncate max-w-[160px]">{s.userName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-muted text-muted-foreground shrink-0"><DIcon className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0"><p className="text-xs font-medium">{s.browser || 'Navegador'}</p><p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{[s.os, s.deviceType].filter(Boolean).join(' · ') || '—'}</p></div>
                        </div>
                      </td>
                      <td className="px-2 py-3"><span className="text-xs font-mono">{s.ip || '—'}</span></td>
                      <td className="px-2 py-3"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{s.location ? <><MapPin className="h-3 w-3" />{s.location}</> : '—'}</span></td>
                      <td className="px-2 py-3"><div className="text-xs"><p>{date}</p><p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{time} · {timeAgo(new Date(s.lastSeenAt))}</p></div></td>
                      <td className="px-2 py-3">
                        {s.isActive
                          ? <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] px-2 py-0.5 gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Activa</Badge>
                          : <Badge className="bg-zinc-500/15 text-zinc-500 border-0 text-[10px] px-2 py-0.5">Revocada</Badge>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {s.isActive ? (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" disabled={revoking === s.id} onClick={() => onRevoke(s.id)}>
                            {revoking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}Revocar
                          </Button>
                        ) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Pestaña Cumplimiento (por contacto) — preservada ──
function ComplianceTab({ loading, contacts, onOpen }: { loading: boolean; contacts: ComplianceContact[]; onOpen: (id: string) => void }) {
  const sealBadge = (estatus: string) => {
    if (estatus === 'sellado') return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] px-2 py-0.5 gap-1"><CheckCircle2 className="h-3 w-3" />Sellado</Badge>
    if (estatus === 'pendiente') return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 text-[10px] px-2 py-0.5 gap-1"><AlertTriangle className="h-3 w-3" />Pendiente</Badge>
    return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-0 text-[10px] px-2 py-0.5 gap-1"><XCircle className="h-3 w-3" />Vencido</Badge>
  }
  const cmpBadge = (pct: number) => {
    const cls = pct >= 80 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : pct >= 60 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
    return <Badge className={cn('border-0 text-[10px] px-2 py-0.5 font-semibold', cls)}>{pct}%</Badge>
  }
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />Cumplimiento por contacto</CardTitle>
        <p className="text-xs text-muted-foreground">Haz clic en un contacto para abrir su expediente completo con la bitácora cronológica.</p>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8"><p className="text-sm text-muted-foreground">No hay contactos para mostrar</p></div>
        ) : (
          <div className="overflow-x-auto custom-scroll max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-2 py-2.5">Nombre</th>
                  <th className="text-center font-medium px-2 py-2.5">Consentimiento %</th>
                  <th className="text-center font-medium px-2 py-2.5">Estatus sellado</th>
                  <th className="text-center font-medium px-2 py-2.5">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onOpen(c.id)}>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(c.nombre)}</div>
                        <span className="text-sm font-medium truncate max-w-[240px]">{c.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center"><div className="flex items-center justify-center"><ScoreRing score={c.consentimiento} size={40} strokeWidth={3} /></div></td>
                    <td className="py-3 px-2 text-center">{sealBadge(c.estatusSellado)}</td>
                    <td className="py-3 px-2 text-center">{cmpBadge(c.cumplimiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
