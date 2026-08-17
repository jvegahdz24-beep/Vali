'use client'

// gBrain Agent Factory — catálogo de plantillas verticales + agentes instanciados.
// Ver todas las plantillas, crear nuevas, editar prompts e instanciar agentes
// para el workspace con un solo clic.

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Plus, Loader2, Trash2, Pencil, Zap, Search, Power, PowerOff, Factory,
  Brain, Wrench, ShieldAlert, KeyRound, Sparkles, Send, MessageSquare, Target, Flame, BarChart3, Activity,
  Store, Car, Megaphone, Briefcase, Magnet, Headset, CalendarDays, Handshake,
  FolderKanban, MonitorCheck, Palette, PenLine, Hammer, Compass, Banknote, Users, Check,
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts'
import { cn, timeAgo } from '@/lib/utils'
import { isConversationalVertical } from '@/lib/agent-verticals'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Template {
  id: string
  source: 'registry' | 'custom'
  name: string
  vertical: string
  description: string
  systemPrompt: string
  tools: string[]
  qualityChecklist: string[]
  humanApprovalGates: string[]
  forbiddenActions: string[]
  keywords: string[]
  version: string
  editable: boolean
  live?: boolean
}

interface Instance {
  id: string
  name: string
  role: string
  vertical: string
  scope: string
  systemPrompt: string
  keywords: string[]
  stageMatch: string[]
  tools: string[]
  forbiddenActions: string[]
  model: string
  temperature: number
  priority: number
  status: string
  totalMessagesSent: number
  templateName: string | null
  createdAt: string
}

// Verticales conversacionales (atienden WhatsApp); el resto es back-office.
const CONVERSATIONAL = new Set(['ventas', 'seguimiento', 'seguros', 'financiamiento', 'precalificacion', 'cotizador', 'planes-pago', 'recordatorio-pagos', 'soporte', 'logistica', 'inventario', 'cross-selling', 'lead-recovery'])
const VERTICAL_LABEL: Record<string, string> = {
  ventas: 'Ventas', seguimiento: 'Seguimiento', financiamiento: 'Financiamiento', cotizador: 'Cotización',
  'planes-pago': 'Planes de pago', 'recordatorio-pagos': 'Recordatorios', precalificacion: 'Precalificación',
  seguros: 'Seguros', soporte: 'Soporte', logistica: 'Logística', inventario: 'Inventario',
  'cross-selling': 'Cross-selling', 'lead-recovery': 'Recuperación', 'email-marketing': 'Email marketing',
}
const vLabel = (v: string) => VERTICAL_LABEL[v] || (v.charAt(0).toUpperCase() + v.slice(1))

// ── Biblioteca de Empleados Digitales (App Store de packs) ──
interface LibEmployee {
  key: string; name: string; emoji: string; kind: 'conversacional' | 'analista' | 'backoffice'
  summary: string; functions: string[]; kpis: string[]; dependsOn: string[]
  installed: boolean; instanceId: string | null; status: string | null
}
interface LibPack {
  id: string; name: string; emoji: string; tagline: string; description: string
  total: number; installedCount: number
  departments: { name: string; emoji: string; employees: LibEmployee[] }[]
}
// Iconos de librería (lucide), NO emojis — pedido de Jhon 2026-07-13.
const KIND_BADGE: Record<LibEmployee['kind'], { label: string; Icon: typeof Wrench; cls: string; iconCls: string }> = {
  conversacional: { label: 'Atiende clientes', Icon: MessageSquare, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', iconCls: 'text-emerald-500' },
  analista: { label: 'Analista', Icon: BarChart3, cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', iconCls: 'text-blue-500' },
  backoffice: { label: 'Producción', Icon: Wrench, cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', iconCls: 'text-violet-500' },
}
const PACK_ICON: Record<string, typeof Car> = {
  'pack-automotriz-premium': Car,
  'pack-agencia-marketing': Megaphone,
}
const DEPT_ICON: Record<string, typeof Car> = {
  'Dirección General': Briefcase, 'Dirección': Briefcase,
  'Marketing': Megaphone, 'Captación': Magnet, 'Atención Inicial': Headset,
  'Ventas': Handshake, 'Comercial': Handshake, 'Agenda': CalendarDays,
  'Postventa': Wrench, 'Administración': FolderKanban, 'Inteligencia': Brain,
  'Supervisión': MonitorCheck, 'Creatividad': Palette, 'Contenido': PenLine,
  'Producción': Hammer, 'Analítica': BarChart3, 'Operaciones': Compass,
  'Finanzas': Banknote, 'Recursos Humanos': Users,
}

interface AgentFactoryViewProps {
  workspaceId: string
  onViewChange?: (v: string) => void
}

const STAGES = ['Lead Nuevo', 'Contactado', 'Cualificado', 'Propuesta', 'Negociación', 'Cerrado']

export function AgentFactoryView({ workspaceId, onViewChange }: AgentFactoryViewProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [cfg, setCfg] = useState<{ enabled: boolean; activeInstances: number } | null>(null)
  const [dash, setDash] = useState<{
    kpis: { activeAgents: number; totalAgents: number; msgToday: number; msgTodayDelta: number; dealsToday: number; dealsTodayDelta: number; conversionRate: number; aiMessagesTotal: number }
    perDay: { d: string; label: string; n: number }[]
    byRole: { role: string; count: number }[]
    topAgents: { name: string; totalMessagesSent: number; vertical: string }[]
    recentEvents: { id: string; type: string; createdAt: string }[]
  } | null>(null)

  // Dialog state
  const [instTpl, setInstTpl] = useState<Template | null>(null) // instanciar
  const [editTpl, setEditTpl] = useState<Template | null>(null) // ver/editar prompt
  const [createOpen, setCreateOpen] = useState(false)
  // Probar agente (simulación, sin enviar)
  const [testInst, setTestInst] = useState<Instance | null>(null)
  const [testMsg, setTestMsg] = useState('')
  const [testReply, setTestReply] = useState<{ response: string; latencyMs?: number } | null>(null)
  const [testBusy, setTestBusy] = useState(false)

  const runTest = async () => {
    if (!testInst || !testMsg.trim()) return
    setTestBusy(true); setTestReply(null)
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, message: testMsg.trim(), systemPrompt: testInst.systemPrompt.slice(0, 8000), temperature: testInst.temperature }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'error')
      setTestReply({ response: j.response || '(sin respuesta)', latencyMs: j.latencyMs })
    } catch { toast.error('No se pudo probar el agente') } finally { setTestBusy(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, iRes] = await Promise.all([
        fetch(`/api/agent-factory/templates?workspaceId=${workspaceId}`),
        fetch(`/api/agent-factory/instances?workspaceId=${workspaceId}`),
      ])
      if (tRes.ok) setTemplates((await tRes.json()).templates ?? [])
      if (iRes.ok) setInstances((await iRes.json()).instances ?? [])
    } catch {
      toast.error('No se pudo cargar el Agent Factory')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch(`/api/agent-factory/config?workspaceId=${workspaceId}`).then(r => r.json()).then(setCfg).catch(() => {}) }, [workspaceId])
  useEffect(() => { fetch(`/api/agent-factory/dashboard?workspaceId=${workspaceId}`).then(r => r.ok ? r.json() : null).then(d => d && setDash(d)).catch(() => {}) }, [workspaceId])

  // ── Biblioteca de Empleados Digitales ──
  const [packs, setPacks] = useState<LibPack[]>([])
  const [libPackId, setLibPackId] = useState<string>('')
  const [libBusy, setLibBusy] = useState<string | null>(null)
  const loadLibrary = useCallback(async () => {
    try {
      const r = await fetch(`/api/agent-factory/library?workspaceId=${workspaceId}`)
      if (!r.ok) return
      const j = await r.json()
      setPacks(j.packs || [])
      setLibPackId((prev) => prev || j.packs?.[0]?.id || '')
    } catch { /* */ }
  }, [workspaceId])
  useEffect(() => { loadLibrary() }, [loadLibrary])

  const installLib = async (packId: string, employeeKey?: string) => {
    setLibBusy(employeeKey || packId)
    try {
      const r = await fetch('/api/agent-factory/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, packId, employeeKey }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'error')
      toast.success(employeeKey
        ? 'Empleado digital instalado y trabajando ✅'
        : `Pack instalado: ${j.created} empleados digitales nuevos ✅`)
      await Promise.all([loadLibrary(), load()])
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo instalar') } finally { setLibBusy(null) }
  }
  const uninstallLib = async (packId: string, packName: string) => {
    if (!confirm(`¿Desinstalar el pack "${packName}" completo? Se eliminan sus empleados digitales de este workspace.`)) return
    setLibBusy(packId)
    try {
      const r = await fetch(`/api/agent-factory/library?workspaceId=${workspaceId}&packId=${packId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Pack desinstalado')
      await Promise.all([loadLibrary(), load()])
    } catch { toast.error('No se pudo desinstalar') } finally { setLibBusy(null) }
  }

  async function toggleRouting() {
    if (!cfg) return
    const next = !cfg.enabled
    setCfg({ ...cfg, enabled: next })
    try {
      const r = await fetch('/api/agent-factory/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, enabled: next }) })
      if (!r.ok) throw new Error()
      toast.success(next ? 'Ruteo de agentes ACTIVADO' : 'Ruteo de agentes pausado (responde JHON)')
    } catch { setCfg({ ...cfg, enabled: !next }); toast.error('No se pudo cambiar') }
  }

  const isLive = (t: { live?: boolean; vertical: string }) =>
    t.live ?? isConversationalVertical(t.vertical)
  const filtered = templates
    .filter((t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.vertical.toLowerCase().includes(search.toLowerCase())
    )
    // "En vivo" (conversacionales) primero; back-office después.
    .sort((a, b) => Number(isLive(b)) - Number(isLive(a)))

  async function toggleStatus(inst: Instance) {
    setBusy(inst.id)
    const next = inst.status === 'activo' ? 'pausado' : 'activo'
    try {
      const res = await fetch(`/api/agent-factory/instances/${inst.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, status: next }),
      })
      if (!res.ok) throw new Error()
      setInstances((prev) => prev.map((x) => x.id === inst.id ? { ...x, status: next } : x))
      toast.success(next === 'activo' ? 'Agente activado' : 'Agente pausado')
    } catch {
      toast.error('No se pudo actualizar el agente')
    } finally {
      setBusy(null)
    }
  }

  async function deleteInstance(inst: Instance) {
    if (!confirm(`¿Eliminar el agente "${inst.name}"?`)) return
    setBusy(inst.id)
    try {
      const res = await fetch(`/api/agent-factory/instances/${inst.id}?workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setInstances((prev) => prev.filter((x) => x.id !== inst.id))
      toast.success('Agente eliminado')
    } catch {
      toast.error('No se pudo eliminar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0"><Bot className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Agentes IA</h1>
            <p className="text-sm text-muted-foreground">Tus agentes trabajan 24/7 para convertir conversaciones en ventas.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cfg && (
            <button onClick={toggleRouting}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                cfg.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-border text-muted-foreground')}>
              {cfg.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
              Ruteo {cfg.enabled ? 'activado' : 'pausado'}
            </button>
          )}
          <Button onClick={() => onViewChange?.('playground')} variant="outline"><Sparkles className="h-4 w-4 mr-1" /> Playground IA</Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> Crear nuevo agente
          </Button>
        </div>
      </div>
      {cfg && cfg.enabled && cfg.activeInstances === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
          El ruteo está activado pero aún no hay agentes instanciados. Instancia un agente <strong>En vivo</strong> (Seguros, Financiamiento, Cotizador…) desde <strong>Plantillas</strong> para que empiece a atender conversaciones.
        </div>
      )}

      {/* 5 KPIs reales (estilo del mockup: ícono de color a la izquierda) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { icon: <Bot className="h-5 w-5" />, label: 'Agentes Activos', value: String(dash?.kpis.activeAgents ?? instances.filter((i) => i.status === 'activo').length), sub: 'Funcionando 24/7', subC: 'text-emerald-500', bg: 'from-violet-500 to-violet-700 shadow-violet-500/30' },
          { icon: <MessageSquare className="h-5 w-5" />, label: 'Conversaciones Gestionadas (Hoy)', value: (dash?.kpis.msgToday ?? 0).toLocaleString('es-MX'), sub: dash ? `${dash.kpis.msgTodayDelta >= 0 ? '+' : ''}${dash.kpis.msgTodayDelta}% vs ayer` : '', subC: (dash?.kpis.msgTodayDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500', bg: 'from-blue-500 to-blue-700 shadow-blue-500/30' },
          { icon: <Target className="h-5 w-5" />, label: 'Oportunidades Generadas (Hoy)', value: (dash?.kpis.dealsToday ?? 0).toLocaleString('es-MX'), sub: dash ? `${dash.kpis.dealsTodayDelta >= 0 ? '+' : ''}${dash.kpis.dealsTodayDelta}% vs ayer` : '', subC: (dash?.kpis.dealsTodayDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500', bg: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30' },
          { icon: <Flame className="h-5 w-5" />, label: 'Tasa de Conversión Asistida', value: `${dash?.kpis.conversionRate ?? 0}%`, sub: 'won / (won+lost)', subC: 'text-muted-foreground', bg: 'from-orange-500 to-amber-600 shadow-orange-500/30' },
          { icon: <Send className="h-5 w-5" />, label: 'Mensajes IA (total)', value: (dash?.kpis.aiMessagesTotal ?? instances.reduce((s, i) => s + (i.totalMessagesSent || 0), 0)).toLocaleString('es-MX'), sub: 'enviados por agentes', subC: 'text-muted-foreground', bg: 'from-pink-500 to-pink-700 shadow-pink-500/30' },
        ].map((k) => (
          <Card key={k.label} className="border-border/60 bg-card dark:bg-zinc-900/60">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-lg', k.bg)}>{k.icon}</div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                <p className="text-2xl font-bold tracking-tight leading-tight">{k.value}</p>
                {k.sub && <p className={cn('text-[10px] mt-0.5 font-medium', k.subC)}>{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library" className="gap-1.5"><Store className="h-4 w-4" /> Biblioteca de Empleados</TabsTrigger>
          <TabsTrigger value="instances">Agentes ({instances.length})</TabsTrigger>
          <TabsTrigger value="orgchart">Organigrama</TabsTrigger>
          <TabsTrigger value="templates">Plantillas ({templates.length})</TabsTrigger>
        </TabsList>

        {/* ─── Biblioteca de Empleados Digitales (App Store) ─── */}
        <TabsContent value="library" className="mt-4 space-y-4">
          {/* Packs (héroes) */}
          <div className="grid gap-4 md:grid-cols-2">
            {packs.map((p) => (
              <Card key={p.id}
                className={cn('cursor-pointer transition-all border-2 overflow-hidden',
                  libPackId === p.id ? 'border-violet-500/60 shadow-lg shadow-violet-500/10' : 'border-border/60 hover:border-violet-500/30')}
                onClick={() => setLibPackId(p.id)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
                      {(() => { const PIcon = PACK_ICON[p.id] || Factory; return <PIcon className="h-7 w-7 text-white" /> })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base leading-tight">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.tagline}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${Math.round((p.installedCount / p.total) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">{p.installedCount}/{p.total}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3.5 flex items-center gap-2">
                    {p.installedCount < p.total ? (
                      <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 flex-1"
                        disabled={libBusy === p.id}
                        onClick={(ev) => { ev.stopPropagation(); installLib(p.id) }}>
                        {libBusy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        Instalar Pack completo ({p.total - p.installedCount} empleados)
                      </Button>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 h-9 px-3 flex-1 justify-center gap-1.5"><Check className="h-4 w-4" /> Pack completo instalado</Badge>
                    )}
                    {p.installedCount > 0 && (
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 shrink-0"
                        disabled={libBusy === p.id}
                        onClick={(ev) => { ev.stopPropagation(); uninstallLib(p.id, p.name) }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Departamentos del pack seleccionado */}
          {packs.filter((p) => p.id === libPackId).map((p) => (
            <div key={p.id} className="space-y-4">
              <p className="text-xs text-muted-foreground">{p.description}</p>
              {p.departments.map((d) => {
                const inst = d.employees.filter((emp) => emp.installed).length
                return (
                  <Card key={d.name} className="border-border/60 bg-card dark:bg-zinc-900/60">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="inline-flex items-center gap-2">
                          {(() => { const DIcon = DEPT_ICON[d.name] || Bot; return <DIcon className="h-4 w-4 text-violet-500" /> })()}
                          {d.name} <span className="text-muted-foreground font-normal">· {d.employees.length} puestos</span>
                        </span>
                        <span className={cn('text-[11px] font-semibold', inst === d.employees.length ? 'text-emerald-500' : 'text-muted-foreground')}>{inst}/{d.employees.length} instalados</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        {d.employees.map((emp) => (
                          <div key={emp.key} className={cn('rounded-xl border p-3 flex flex-col gap-1.5 transition-colors', emp.installed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/60 hover:border-violet-500/30')}>
                            <div className="flex items-center gap-2">
                              <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                {(() => { const KIcon = KIND_BADGE[emp.kind].Icon; return <KIcon className={cn('h-4 w-4', KIND_BADGE[emp.kind].iconCls)} /> })()}
                              </span>
                              <span className="text-sm font-semibold leading-tight flex-1 min-w-0 truncate" title={emp.name}>{emp.name}</span>
                              <span className={cn('text-[9px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 inline-flex items-center gap-1', KIND_BADGE[emp.kind].cls)}>
                                {(() => { const KIcon = KIND_BADGE[emp.kind].Icon; return <KIcon className="h-2.5 w-2.5" /> })()}
                                {KIND_BADGE[emp.kind].label}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{emp.summary}</p>
                            <ul className="text-[10px] text-muted-foreground/80 space-y-0.5">
                              {emp.functions.slice(0, 3).map((f) => <li key={f} className="truncate flex items-center gap-1" title={f}><Check className="h-2.5 w-2.5 shrink-0 text-emerald-500/70" /> {f}</li>)}
                              {emp.functions.length > 3 && <li className="italic">+{emp.functions.length - 3} funciones más</li>}
                            </ul>
                            <div className="mt-auto pt-1.5">
                              {emp.installed ? (
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 w-full justify-center h-7 gap-1"><Check className="h-3.5 w-3.5" /> Trabajando</Badge>
                              ) : (
                                <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1 hover:border-violet-500/50 hover:text-violet-600"
                                  disabled={libBusy === emp.key}
                                  onClick={() => installLib(p.id, emp.key)}>
                                  {libBusy === emp.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Instalar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ))}
        </TabsContent>

        {/* ─── Instancias ─── */}
        <TabsContent value="instances" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : instances.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
              Aún no hay agentes instanciados. Ve a <strong>Plantillas</strong> e instancia uno.
              <p className="text-xs mt-2">Mientras no haya agentes activos, el asistente por defecto (JHON) sigue respondiendo sin cambios.</p>
            </CardContent></Card>
          ) : (
            <Card className="border-border/60 bg-card dark:bg-zinc-900/60 overflow-hidden">
              <div className="overflow-x-auto custom-scroll">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/30">
                      <th className="px-4 py-2.5 font-semibold">Agente</th>
                      <th className="px-4 py-2.5 font-semibold">Rol y descripción</th>
                      <th className="px-4 py-2.5 font-semibold">Estado</th>
                      <th className="px-4 py-2.5 font-semibold">Rendimiento</th>
                      <th className="px-4 py-2.5 font-semibold">Canales</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((inst) => {
                      const live = isConversationalVertical(inst.vertical)
                      return (
                        <tr key={inst.id} className={cn('border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors', inst.status !== 'activo' && 'opacity-60')}>
                          {/* Agente */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-lg', live ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-500/30' : 'bg-gradient-to-br from-violet-500 to-violet-700 shadow-violet-500/30')}><Bot className="h-4.5 w-4.5" /></div>
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate flex items-center gap-1.5">{inst.name}</p>
                                <p className="text-[10px] text-muted-foreground">temp {inst.temperature} · prio {inst.priority}</p>
                              </div>
                            </div>
                          </td>
                          {/* Rol y descripción */}
                          <td className="px-4 py-3 max-w-[260px]">
                            <p className="text-xs font-medium text-foreground">{inst.role}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{inst.scope || inst.systemPrompt.slice(0, 90)}</p>
                          </td>
                          {/* Estado */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', inst.status === 'activo' ? 'text-emerald-500' : 'text-muted-foreground')}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', inst.status === 'activo' ? 'bg-emerald-500' : 'bg-zinc-400')} />{inst.status === 'activo' ? 'Activo' : 'Pausado'}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-500' : 'bg-zinc-400')} />{live ? 'En vivo' : 'Próximamente'}
                              </span>
                            </div>
                          </td>
                          {/* Rendimiento (real: mensajes) */}
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-foreground">{inst.totalMessagesSent.toLocaleString('es-MX')}</p>
                            <p className="text-[10px] text-muted-foreground">mensajes enviados</p>
                          </td>
                          {/* Canales */}
                          <td className="px-4 py-3">
                            {live ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/15 text-green-500"><MessageSquare className="h-3.5 w-3.5" /></span>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </td>
                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" className="h-8 gap-1.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white" onClick={() => { setTestInst(inst); setTestMsg(''); setTestReply(null) }} title="Probar"><Sparkles className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={busy === inst.id} onClick={() => toggleStatus(inst)} title={inst.status === 'activo' ? 'Pausar' : 'Activar'}>{inst.status === 'activo' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}</Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" disabled={busy === inst.id} onClick={() => deleteInstance(inst)} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ─── Organigrama (jerarquía gBrain → orquestador → verticales → agentes) ─── */}
        <TabsContent value="orgchart" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (() => {
            const conv = instances.filter((i) => CONVERSATIONAL.has(i.vertical))
            const back = instances.filter((i) => !CONVERSATIONAL.has(i.vertical))
            const groupBy = (arr: Instance[]) => {
              const m = new Map<string, Instance[]>()
              for (const i of arr) { const k = i.vertical; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i) }
              return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
            }
            const AgentNode = ({ a }: { a: Instance }) => (
              <div className={cn('rounded-lg border p-3 bg-card', a.status === 'activo' ? 'border-emerald-300/60' : 'border-border opacity-70')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Bot className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="text-sm font-medium truncate">{a.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">{a.status === 'activo' ? '🟢' : '⏸️'} {a.totalMessagesSent} msg</Badge>
                </div>
                {a.scope && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{a.scope}</p>}
                <div className="mt-2 space-y-1 text-[10px]">
                  <div className="flex items-start gap-1 text-muted-foreground">
                    <Brain className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
                    <span className="truncate"><b>Lee de:</b> {a.keywords?.length ? a.keywords.slice(0, 5).join(', ') : 'gBrain del negocio'}</span>
                  </div>
                  <div className="flex items-start gap-1 text-muted-foreground">
                    <Wrench className="h-3 w-3 mt-0.5 shrink-0 text-blue-500" />
                    <span className="truncate"><b>Herramientas:</b> {a.tools?.length ? a.tools.slice(0, 4).join(', ') : 'ninguna específica'}</span>
                  </div>
                  {a.forbiddenActions?.length > 0 && (
                    <div className="flex items-start gap-1 text-amber-600">
                      <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="truncate"><b>Requiere aprobación / prohibido:</b> {a.forbiddenActions.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )
            const Dept = ({ vertical, agents }: { vertical: string; agents: Instance[] }) => (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Factory className="h-4 w-4 text-violet-500" />
                  <h4 className="text-sm font-semibold">{vLabel(vertical)}</h4>
                  <Badge variant="secondary" className="text-[9px]">{agents.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {agents.map((a) => <AgentNode key={a.id} a={a} />)}
                </div>
              </div>
            )
            return (
              <div className="space-y-4 max-w-5xl">
                {/* Raíz: gBrain + orquestador */}
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-xl border-2 border-purple-300 bg-purple-50 dark:bg-purple-500/10 px-4 py-2.5 text-center">
                    <p className="text-sm font-bold flex items-center gap-1.5 justify-center"><Brain className="h-4 w-4 text-purple-600" /> gBrain · Cerebro del negocio</p>
                    <p className="text-[10px] text-muted-foreground">catálogo · tono · políticas · lecciones</p>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 text-center">
                    <p className="text-sm font-bold flex items-center gap-1.5 justify-center"><KeyRound className="h-4 w-4 text-emerald-600" /> Orquestador · JHON</p>
                    <p className="text-[10px] text-muted-foreground">vendedor base + ruteo por intención → deriva al agente correcto</p>
                  </div>
                  <div className="h-4 w-px bg-border" />
                </div>

                {instances.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                    Aún no hay agentes especializados. Todo lo atiende JHON. Instancia agentes desde <strong>Plantillas</strong> para armar tus departamentos.
                  </CardContent></Card>
                ) : (
                  <>
                    {conv.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">🟢 Atienden clientes (WhatsApp)</p>
                        <div className="space-y-3">{groupBy(conv).map(([v, ags]) => <Dept key={v} vertical={v} agents={ags} />)}</div>
                      </div>
                    )}
                    {back.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 mt-4">⚙️ Back-office (no atienden WhatsApp directo)</p>
                        <div className="space-y-3">{groupBy(back).map(([v, ags]) => <Dept key={v} vertical={v} agents={ags} />)}</div>
                      </div>
                    )}
                  </>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Cada agente tiene <b>alcance estrecho</b> (su vertical), lee del <b>gBrain</b> según sus palabras clave, usa solo sus <b>herramientas</b> permitidas, y marca dónde hay <b>aprobación humana</b> requerida. El alcance estrecho = mejor calidad, menos deriva.
                </p>
              </div>
            )
          })()}
        </TabsContent>

        {/* ─── Plantillas ─── */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre o vertical…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <Card key={t.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <Badge variant={t.source === 'registry' ? 'secondary' : 'default'} className="text-[10px]">
                        {t.source === 'registry' ? 'base' : 'custom'}
                      </Badge>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{t.vertical}</Badge>
                      {isLive(t) ? (
                        <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700">● En vivo</Badge>
                      ) : (
                        <Badge className="text-[10px] border-0 bg-zinc-100 text-zinc-600">Próximamente</Badge>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground flex-1 flex flex-col">
                    <p className="line-clamp-3 flex-1">{t.description}</p>
                    <div className="flex gap-2 pt-3">
                      <Button size="sm" onClick={() => setInstTpl(t)}>
                        <Zap className="h-3 w-3 mr-1" /> Instanciar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditTpl(t)}>
                        <Pencil className="h-3 w-3 mr-1" /> {t.editable ? 'Editar' : 'Ver'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ Estadísticas generales de agentes (datos reales) ═══ */}
      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversaciones por día */}
          <Card className="border-border/60 bg-card dark:bg-zinc-900/60 lg:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-500" /> Conversaciones IA por día</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dash.perDay} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                    <defs><linearGradient id="agConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                    <Area type="monotone" dataKey="n" stroke="#8b5cf6" strokeWidth={2} fill="url(#agConv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">{dash.perDay.map((p) => <span key={p.d}>{p.label}</span>)}</div>
            </CardContent>
          </Card>
          {/* Distribución por tipo */}
          <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Distribución por tipo de agente</CardTitle></CardHeader>
            <CardContent className="pt-0 flex items-center gap-3">
              {(() => {
                const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6']
                const total = dash.byRole.reduce((s, r) => s + r.count, 0) || 1
                return (
                  <>
                    <div className="h-28 w-28 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={dash.byRole} dataKey="count" nameKey="role" innerRadius={30} outerRadius={52} paddingAngle={2}>{dash.byRole.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      {dash.byRole.slice(0, 6).map((r, i) => (
                        <div key={r.role} className="flex items-center gap-1.5 text-[11px]">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                          <span className="text-muted-foreground truncate flex-1">{r.role}</span>
                          <span className="font-medium">{r.count} ({Math.round((r.count / total) * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </CardContent>
          </Card>
          {/* Top agentes por mensajes */}
          <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top agentes por actividad</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {dash.topAgents.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Sin datos.</p> : dash.topAgents.map((a, i) => (
                <div key={a.name} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-4">{i + 1}.</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="font-semibold">{a.totalMessagesSent.toLocaleString('es-MX')} <span className="text-[9px] font-normal text-muted-foreground">msgs</span></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actividad en tiempo real (eventos reales) */}
      {dash && dash.recentEvents.length > 0 && (
        <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Actividad en tiempo real</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
              {dash.recentEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[11px] text-foreground truncate flex-1">{ev.type.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(new Date(ev.createdAt))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {instTpl && (
        <InstantiateDialog
          template={instTpl}
          workspaceId={workspaceId}
          stages={STAGES}
          onClose={() => setInstTpl(null)}
          onDone={() => { setInstTpl(null); load() }}
        />
      )}
      {editTpl && (
        <TemplateDialog
          template={editTpl}
          workspaceId={workspaceId}
          onClose={() => setEditTpl(null)}
          onDone={() => { setEditTpl(null); load() }}
        />
      )}
      {createOpen && (
        <TemplateDialog
          template={null}
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); load() }}
        />
      )}

      {/* Probar agente — simulación (no envía nada real) */}
      {testInst && (
        <Dialog open onOpenChange={(o) => !o && setTestInst(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-500" /> Probar: {testInst.name}</DialogTitle>
              <DialogDescription>Escribe como si fueras un cliente y mira cómo respondería este agente. No se envía nada por WhatsApp.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Ej: Hola, ¿cuánto cuesta y tienen financiamiento?"
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTest() } }}
                />
                <Button onClick={runTest} disabled={testBusy || !testMsg.trim()} className="shrink-0 gap-1.5">
                  {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {testReply && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Bot className="h-3 w-3" /> Respuesta del agente{testReply.latencyMs ? ` · ${(testReply.latencyMs / 1000).toFixed(1)}s` : ''}</p>
                  <p className="whitespace-pre-wrap">{testReply.response}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Usa el prompt real del agente. Si la respuesta no te gusta, ajusta su tono/plantilla y vuelve a probar.</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Dialog: instanciar un agente desde una plantilla ───
function InstantiateDialog({ template, workspaceId, stages, onClose, onDone }: {
  template: Template
  workspaceId: string
  stages: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(`${template.name}`)
  const [cliente, setCliente] = useState('')
  const [voz, setVoz] = useState('profesional y cercano')
  const [keywords, setKeywords] = useState(template.keywords.join(', '))
  const [stageMatch, setStageMatch] = useState<string[]>([])
  const [temperature, setTemperature] = useState('0.3')
  const [model, setModel] = useState('glm-4.5-flash')
  const [priority, setPriority] = useState('100')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch('/api/agent-factory/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          templateId: template.id,
          name,
          variables: { cliente, voz },
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          stageMatch,
          temperature: parseFloat(temperature) || 0.3,
          model,
          priority: parseInt(priority) || 100,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Agente instanciado y activo')
      onDone()
    } catch {
      toast.error('No se pudo instanciar el agente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Instanciar: {template.name}</DialogTitle>
          <DialogDescription>Personaliza el agente para este cliente. Se reemplazan los placeholders del prompt.</DialogDescription>
        </DialogHeader>
        {!isConversationalVertical(template.vertical) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
            <strong>Agente de back-office (Próximamente).</strong> Este tipo aún no se ejecuta automáticamente
            (no hay tarea programada que lo dispare), así que instanciarlo no cambiará el comportamiento del bot todavía.
            Los agentes <span className="font-medium">En vivo</span> (Financiamiento, Seguros, Cotizador, Soporte, etc.) sí responden conversaciones de WhatsApp.
          </div>
        )}
        <div className="space-y-3">
          <div><Label>Nombre del agente</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Cliente / empresa ({'{{cliente}}'})</Label><Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej. Autos del Valle" /></div>
          <div><Label>Tono de voz ({'{{voz}}'})</Label><Input value={voz} onChange={(e) => setVoz(e.target.value)} /></div>
          <div><Label>Palabras clave (routing, separadas por coma)</Label><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="seguro, póliza, cobertura" />
            <p className="text-[11px] text-muted-foreground mt-1">Si lo dejas vacío, el router usa las palabras por defecto del vertical <strong>{template.vertical}</strong>.</p>
          </div>
          <div>
            <Label>Etapas del pipeline que atiende</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {stages.map((s) => (
                <Badge key={s} variant={stageMatch.includes(s) ? 'default' : 'outline'} className="cursor-pointer text-[11px]"
                  onClick={() => setStageMatch((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}>
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Temperatura</Label><Input type="number" step="0.1" min="0" max="1" value={temperature} onChange={(e) => setTemperature(e.target.value)} /></div>
            <div><Label>Prioridad</Label><Input type="number" min="1" max="999" value={priority} onChange={(e) => setPriority(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Mayor = gana ante otros agentes.</p>
            </div>
            <div><Label>Modelo IA</Label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="glm-4.5-flash">GLM 4.5 Flash (rápido)</option>
                <option value="glm-4.6">GLM 4.6 (potente)</option>
                <option value="minimax">MiniMax</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Instanciar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog: ver/editar/crear plantilla ───
function TemplateDialog({ template, workspaceId, onClose, onDone }: {
  template: Template | null
  workspaceId: string
  onClose: () => void
  onDone: () => void
}) {
  const isNew = template === null
  const readOnly = template ? !template.editable : false
  const [name, setName] = useState(template?.name ?? '')
  const [vertical, setVertical] = useState(template?.vertical ?? 'custom')
  const [description, setDescription] = useState(template?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '')
  const [keywords, setKeywords] = useState((template?.keywords ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const payload = {
        workspaceId, name, vertical, description, systemPrompt,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      }
      const res = isNew
        ? await fetch('/api/agent-factory/templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/agent-factory/templates/${template!.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error()
      toast.success(isNew ? 'Plantilla creada' : 'Plantilla actualizada')
      onDone()
    } catch {
      toast.error('No se pudo guardar la plantilla')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Nueva plantilla' : readOnly ? `Plantilla (base): ${template!.name}` : `Editar: ${template!.name}`}</DialogTitle>
          {readOnly && <DialogDescription>Plantilla base de solo lectura. Crea una nueva para personalizarla.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} /></div>
          <div><Label>Vertical</Label><Input value={vertical} onChange={(e) => setVertical(e.target.value)} disabled={readOnly} /></div>
          <div><Label>Descripción</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} rows={2} /></div>
          <div><Label>System Prompt</Label><Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} disabled={readOnly} rows={14} className="font-mono text-xs" /></div>
          <div><Label>Palabras clave (routing)</Label><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={readOnly} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {!readOnly && <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
