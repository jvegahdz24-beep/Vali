'use client'

// ═══════════════════════════════════════════════════════════════
// gBrain — Base de conocimiento del negocio (vista unificada).
// Consolida lo que "saben" los agentes: catálogo, tono/persona, datos del
// negocio, lecciones (entrenamiento) y agentes activos. Edita tono + datos
// del negocio en sitio; el resto enlaza a su módulo (inventario / playground).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Brain, Package, Mic2, Building2, GraduationCap, Bot, Loader2, Save, ArrowRight, Send, Eye, Power, Database, MessageSquare, Users, Layers, BookOpen, BarChart3, Lightbulb, FileText, Plug } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn, timeAgo } from '@/lib/utils'

// Traduce el tipo de evento del motor a una etiqueta legible para la línea de tiempo.
function eventLabel(type: string): string {
  const map: Record<string, string> = {
    HOT_LEAD_NOTIFIED: 'Lead caliente detectado',
    STALE_LEAD_7D_NOTIFIED: 'Lead sin respuesta (7 días)',
    APPOINTMENT_REMINDER_SENT: 'Recordatorio de cita enviado',
    lead_detected: 'Nuevo lead detectado',
    archetype_detected: 'Arquetipo detectado',
    deal_created: 'Trato creado',
    deal_won: 'Trato ganado',
    message_sent: 'Mensaje enviado',
  }
  return map[type] || type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

interface GBrainData {
  businessName: string
  catalog: { count: number; items: { name: string; price: number | null; currency: string | null; category: string | null }[] }
  tone: string
  greeting: string
  hasCustomPrompt: boolean
  business: { businessHours: string; businessAddress: string; businessPhone: string; timezone: string; appointmentUrl: string }
  lessons: number
  agents: { id: string; name: string; vertical: string; status: string; totalMessagesSent: number }[]
  stats?: {
    totalKnowledge: number; messages: number; contacts: number; deals: number; documents: number
    appointments: number; profiles: number; events: number; catalog: number; lessons: number
    integrations: number; activeAgents: number; totalMessagesSent: number
    deltas: { messages: number; contacts: number; deals: number }
  }
  timeline?: { id: string; type: string; createdAt: string; contactId: string | null; metadata: string | null }[]
}

export function GBrainView({ workspaceId, onViewChange }: { workspaceId: string; onViewChange?: (v: string) => void }) {
  const [data, setData] = useState<GBrainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // campos editables
  const [tone, setTone] = useState('')
  const [greeting, setGreeting] = useState('')
  const [biz, setBiz] = useState({ businessHours: '', businessAddress: '', businessPhone: '', timezone: '', appointmentUrl: '' })
  // Seguimiento automático (reactivación proactiva)
  const [auto, setAuto] = useState<{ enabled: boolean; approval?: boolean; previewCount: number; preview: { contactName: string; cycle: number; message: string }[] } | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // Reglas de seguimiento por inactividad
  type Rule = { id: string; name: string; days: number; messageTemplate: string; isActive: boolean }
  const [rules, setRules] = useState<Rule[]>([])
  const [newRule, setNewRule] = useState({ name: '', days: 7, messageTemplate: '' })
  const [ruleBusy, setRuleBusy] = useState(false)
  const [showRuleForm, setShowRuleForm] = useState(false)

  // Base de conocimiento (RAG): documentos que el agente consulta antes de responder.
  type KDoc = { id: string; title: string; sourceType: string; chars: number; isActive: boolean; createdAt: string }
  const [kbDocs, setKbDocs] = useState<KDoc[]>([])
  const [kbTitle, setKbTitle] = useState('')
  const [kbContent, setKbContent] = useState('')
  const [kbBusy, setKbBusy] = useState(false)
  const [kbForm, setKbForm] = useState(false)

  const loadKb = useCallback(async () => {
    if (!workspaceId) return
    try { const r = await fetch(`/api/knowledge?workspaceId=${workspaceId}`); if (r.ok) { const j = await r.json(); setKbDocs(j.docs || []) } } catch { /* */ }
  }, [workspaceId])
  const addKbText = async () => {
    if (!kbTitle.trim() || !kbContent.trim()) return
    setKbBusy(true)
    try {
      const r = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, title: kbTitle, content: kbContent, sourceType: 'faq' }) })
      if (!r.ok) throw new Error((await r.json()).error || 'Error')
      toast.success('Documento agregado a la base de conocimiento')
      setKbTitle(''); setKbContent(''); setKbForm(false); await loadKb()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo agregar') } finally { setKbBusy(false) }
  }
  const uploadKbFile = async (file: File) => {
    setKbBusy(true)
    try {
      const fd = new FormData(); fd.append('workspaceId', workspaceId); fd.append('file', file)
      const r = await fetch('/api/knowledge', { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json()).error || 'Error')
      toast.success(`"${file.name}" agregado a la base de conocimiento`)
      await loadKb()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo subir') } finally { setKbBusy(false) }
  }
  const deleteKb = async (id: string) => {
    try { const r = await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' }); if (r.ok) { toast.success('Documento eliminado'); await loadKb() } } catch { /* */ }
  }
  useEffect(() => { loadKb() }, [loadKb])

  const loadRules = useCallback(async () => {
    if (!workspaceId) return
    try { const r = await fetch(`/api/followups/rules?workspaceId=${workspaceId}`); if (r.ok) { const j = await r.json(); setRules(j.rules || []) } } catch { /* */ }
  }, [workspaceId])

  const createRule = async () => {
    if (!newRule.name.trim()) { toast.error('Ponle nombre a la regla'); return }
    setRuleBusy(true)
    try {
      const r = await fetch('/api/followups/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, ...newRule }) })
      if (!r.ok) throw new Error()
      toast.success('Regla creada')
      setNewRule({ name: '', days: 7, messageTemplate: '' }); setShowRuleForm(false); loadRules()
    } catch { toast.error('No se pudo crear la regla') } finally { setRuleBusy(false) }
  }
  const toggleRule = async (rule: Rule) => {
    try { await fetch('/api/followups/rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, id: rule.id, isActive: !rule.isActive }) }); loadRules() } catch { /* */ }
  }
  const deleteRule = async (rule: Rule) => {
    try { await fetch(`/api/followups/rules?workspaceId=${workspaceId}&id=${rule.id}`, { method: 'DELETE' }); loadRules() } catch { /* */ }
  }

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/gbrain?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error()
      const j: GBrainData = await res.json()
      setData(j)
      setTone(j.tone || '')
      setGreeting(j.greeting || '')
      setBiz({ ...j.business })
    } catch { toast.error('No se pudo cargar el gBrain') } finally { setLoading(false) }
    fetch(`/api/followups/auto?workspaceId=${workspaceId}`).then(r => r.ok ? r.json() : null).then(j => j && setAuto(j)).catch(() => {})
  }, [workspaceId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRules() }, [loadRules])

  const toggleAuto = async () => {
    if (!auto) return
    setAutoBusy(true)
    try {
      const res = await fetch('/api/followups/auto', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, enabled: !auto.enabled }) })
      if (!res.ok) throw new Error()
      const j = await res.json()
      setAuto(a => a ? { ...a, enabled: j.enabled } : a)
      toast.success(j.enabled ? 'Seguimiento automático ACTIVADO' : 'Seguimiento automático desactivado')
    } catch { toast.error('No se pudo cambiar') } finally { setAutoBusy(false) }
  }
  const runAuto = async () => {
    setAutoBusy(true)
    try {
      const res = await fetch('/api/followups/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, run: true }) })
      if (!res.ok) throw new Error()
      const j = await res.json()
      toast.success(`Programados ${j.scheduled} seguimiento(s) — se enviarán en breve`)
      load()
    } catch { toast.error('No se pudo reactivar') } finally { setAutoBusy(false) }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/gbrain', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, tone, greeting, ...biz }),
      })
      if (!res.ok) throw new Error()
      toast.success('gBrain actualizado — aplica desde el próximo mensaje del bot')
      load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const money = (n: number | null, c: string | null) => n != null ? `${c || 'MXN'} $${Number(n).toLocaleString('es-MX')}` : '—'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 lg:px-6 py-4 border-b border-border shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 shrink-0"><Brain className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">gBrain <span className="font-normal text-muted-foreground">(Memoria Corporativa)</span></h2>
            <p className="text-xs text-muted-foreground truncate">La memoria inteligente de tu negocio. Cada interacción, decisión y resultado se transforma en conocimiento.</p>
          </div>
        </div>
        <Button onClick={() => onViewChange?.('settings')} variant="outline" className="gap-1.5 shrink-0">
          <Building2 className="h-4 w-4" /> Configuración
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 custom-scroll">
        {/* ═══ Dashboard de memoria (datos REALES) ═══ */}
        {data?.stats && (
          <div className="p-4 lg:p-6 pb-0">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
            <div className="xl:col-span-3 space-y-5">
            {/* 5 KPIs reales — ícono a la IZQUIERDA (estilo del mockup) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { icon: <Database className="h-5 w-5" />, label: 'Conocimientos Totales', value: data.stats.totalKnowledge, bg: 'from-violet-500 to-violet-700 shadow-violet-500/30', d: null },
                { icon: <MessageSquare className="h-5 w-5" />, label: 'Interacciones Almacenadas', value: data.stats.messages, bg: 'from-blue-500 to-blue-700 shadow-blue-500/30', d: data.stats.deltas.messages },
                { icon: <Users className="h-5 w-5" />, label: 'Perfiles de Clientes', value: data.stats.contacts, bg: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30', d: data.stats.deltas.contacts },
                { icon: <GraduationCap className="h-5 w-5" />, label: 'Patrones Aprendidos', value: data.stats.lessons, bg: 'from-amber-500 to-amber-700 shadow-amber-500/30', d: null },
                { icon: <Bot className="h-5 w-5" />, label: 'Agentes IA Activos', value: data.stats.activeAgents, bg: 'from-pink-500 to-pink-700 shadow-pink-500/30', d: null },
              ].map((k) => (
                <Card key={k.label} className="border-border/60 bg-card dark:bg-zinc-900/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-lg', k.bg)}>{k.icon}</div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                      <p className="text-2xl font-bold tracking-tight leading-tight">{k.value.toLocaleString('es-MX')}</p>
                      {k.d != null ? (
                        <p className={cn('text-[10px] mt-0.5 font-medium', k.d >= 0 ? 'text-emerald-500' : 'text-red-500')}>{k.d >= 0 ? '↑' : '↓'}{Math.abs(k.d)}% vs mes anterior</p>
                      ) : <p className="text-[10px] mt-0.5 text-muted-foreground">Total acumulado</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

                {/* Capas de Memoria */}
                <div>
                  <p className="text-sm font-semibold mb-2">Capas de Memoria</p>
                  {(() => {
                    const layers = [
                      { icon: <Layers className="h-5 w-5" />, grad: 'from-violet-500 to-violet-700 shadow-violet-500/30', bar: 'bg-violet-500', t: 'Memoria Operacional', s: 'Conversaciones, llamadas, citas, ventas y actividades diarias.', n: data.stats.messages + data.stats.appointments + data.stats.deals, u: 'registros' },
                      { icon: <BookOpen className="h-5 w-5" />, grad: 'from-blue-500 to-blue-700 shadow-blue-500/30', bar: 'bg-blue-500', t: 'Memoria Empresarial', s: 'Productos, precios, políticas, catálogo y documentos.', n: data.stats.catalog + data.stats.documents, u: 'documentos' },
                      { icon: <Users className="h-5 w-5" />, grad: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30', bar: 'bg-emerald-500', t: 'Memoria del Cliente', s: 'Perfiles, historial, objeciones, comportamiento y hábitos.', n: data.stats.profiles || data.stats.contacts, u: 'perfiles' },
                      { icon: <BarChart3 className="h-5 w-5" />, grad: 'from-orange-500 to-amber-600 shadow-orange-500/30', bar: 'bg-orange-500', t: 'Memoria Predictiva', s: 'Señales analizadas: scoring, intención y seguimientos.', n: data.stats.events, u: 'señales' },
                      { icon: <Lightbulb className="h-5 w-5" />, grad: 'from-pink-500 to-pink-700 shadow-pink-500/30', bar: 'bg-pink-500', t: 'Memoria de Patrones', s: 'Correcciones y lecciones que el equipo enseñó a la IA.', n: data.stats.lessons, u: 'patrones' },
                    ]
                    const max = Math.max(1, ...layers.map((l) => l.n))
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {layers.map((m) => {
                          const fill = Math.max(6, Math.round((m.n / max) * 100))
                          return (
                            <Card key={m.t} className="border-border/60 bg-card dark:bg-zinc-900/60">
                              <CardContent className="p-4">
                                <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-2xl mb-2 text-white bg-gradient-to-br shadow-lg', m.grad)}>{m.icon}</div>
                                <p className="text-sm font-semibold leading-tight">{m.t}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-3">{m.s}</p>
                                <p className="text-xl font-bold mt-2">{m.n.toLocaleString('es-MX')}</p>
                                <p className="text-[10px] text-muted-foreground">{m.u}</p>
                                <div className="mt-2 flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden"><div className={cn('h-full rounded-full', m.bar)} style={{ width: `${fill}%` }} /></div>
                                  <span className="text-[9px] text-muted-foreground font-medium w-7 text-right">{fill}%</span>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* Fuentes de Conocimiento Conectadas */}
                <div>
                  <p className="text-sm font-semibold mb-2">Fuentes de Conocimiento Conectadas</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { icon: <MessageSquare className="h-4 w-4" />, c: 'text-green-500', t: 'Conversaciones', n: data.stats.messages, u: 'registros' },
                      { icon: <Users className="h-4 w-4" />, c: 'text-blue-500', t: 'CRM & Contactos', n: data.stats.contacts, u: 'contactos' },
                      { icon: <BarChart3 className="h-4 w-4" />, c: 'text-emerald-500', t: 'Ventas & Pipeline', n: data.stats.deals, u: 'tratos' },
                      { icon: <Package className="h-4 w-4" />, c: 'text-violet-500', t: 'Inventario', n: data.stats.catalog, u: 'productos' },
                      { icon: <FileText className="h-4 w-4" />, c: 'text-amber-500', t: 'Documentos', n: data.stats.documents, u: 'archivos' },
                      { icon: <Plug className="h-4 w-4" />, c: 'text-pink-500', t: 'Integraciones', n: data.stats.integrations, u: 'conexiones' },
                    ].map((f) => (
                      <Card key={f.t} className="border-border/60 bg-card dark:bg-zinc-900/60">
                        <CardContent className="p-3">
                          <div className={cn('mb-1.5', f.c)}>{f.icon}</div>
                          <p className="text-[11px] font-medium leading-tight">{f.t}</p>
                          <p className="text-base font-bold mt-1">{f.n.toLocaleString('es-MX')}</p>
                          <p className="text-[9px] text-muted-foreground">{f.u}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Base de conocimiento (RAG) — el agente responde con base en estos documentos */}
                <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-500" /> Base de conocimiento <Badge variant="secondary" className="ml-1">{kbDocs.length}</Badge></CardTitle>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer text-xs font-medium text-emerald-500 hover:underline inline-flex items-center gap-1">
                        {kbBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} Subir archivo
                        <input type="file" accept=".pdf,.txt,.md,.csv,.xlsx,.xls" className="hidden" disabled={kbBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadKbFile(f); e.target.value = '' }} />
                      </label>
                      <button onClick={() => setKbForm((v) => !v)} className="text-xs font-medium text-violet-500 hover:underline">Pegar texto</button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-[11px] text-muted-foreground mb-2.5">Sube manuales, listas de precios, políticas o FAQs (PDF/Excel/CSV/TXT). El agente responderá con base en estos documentos y dejará de inventar.</p>
                    {kbForm && (
                      <div className="space-y-2 mb-3 rounded-lg border border-border/60 p-2.5">
                        <Input placeholder="Título (ej. Política de garantía)" value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} className="h-8 text-sm" />
                        <Textarea placeholder="Pega aquí el contenido…" value={kbContent} onChange={(e) => setKbContent(e.target.value)} rows={4} className="text-sm" />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setKbForm(false)}>Cancelar</Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={kbBusy || !kbTitle.trim() || !kbContent.trim()} onClick={addKbText}>{kbBusy ? 'Guardando…' : 'Agregar'}</Button>
                        </div>
                      </div>
                    )}
                    {kbDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">Aún no hay documentos. Sube uno para que el agente lo consulte al responder.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {kbDocs.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate flex-1">{d.title}</span>
                            <Badge variant="secondary" className="text-[9px]">{d.sourceType.toUpperCase()}</Badge>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{(d.chars / 1000).toFixed(1)}k</span>
                            <button onClick={() => deleteKb(d.id)} className="text-muted-foreground hover:text-red-500 text-sm leading-none" title="Eliminar">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ¿Cómo funciona gBrain? */}
                <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-3">¿Cómo funciona gBrain?</p>
                    <div className="flex items-start justify-between gap-1 overflow-x-auto custom-scroll">
                      {[
                        { n: '1. Captura', s: 'Cada interacción entra por todos los canales', i: <MessageSquare className="h-5 w-5" /> },
                        { n: '2. Procesa', s: 'La IA analiza, estructura y entiende el contexto', i: <Users className="h-5 w-5" /> },
                        { n: 'gBrain', s: 'Almacena y relaciona el conocimiento', i: <Brain className="h-6 w-6" /> },
                        { n: '4. Aprende', s: 'Detecta patrones y mejora predicciones', i: <Lightbulb className="h-5 w-5" /> },
                        { n: '5. Actúa', s: 'Entrega inteligencia y recomendaciones', i: <Bot className="h-5 w-5" /> },
                      ].map((step, idx) => (
                        <div key={step.n} className="flex flex-col items-center text-center min-w-[90px] flex-1">
                          <div className={cn('rounded-full flex items-center justify-center', idx === 2 ? 'h-14 w-14 bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-lg shadow-violet-500/30' : 'h-11 w-11 bg-muted/60 text-violet-500')}>{step.i}</div>
                          <p className="text-[11px] font-semibold mt-1.5">{step.n}</p>
                          <p className="text-[9px] text-muted-foreground leading-tight">{step.s}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar: Línea de Tiempo Cognitiva + Estado */}
              <div className="space-y-4">
                <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Línea de Tiempo Cognitiva</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {(data.timeline?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">Aún sin eventos registrados.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {data.timeline!.map((ev) => (
                          <div key={ev.id} className="flex items-start gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-foreground leading-tight">{eventLabel(ev.type)}</p>
                              <p className="text-[10px] text-muted-foreground">{timeAgo(new Date(ev.createdAt))}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card dark:bg-zinc-900/60">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Estado de gBrain</CardTitle>
                    <Badge className="h-5 text-[10px] px-2 border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Activo</Badge>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Eventos analizados</span><span className="font-semibold">{data.stats.events.toLocaleString('es-MX')}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Mensajes procesados</span><span className="font-semibold">{data.stats.messages.toLocaleString('es-MX')}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Última actualización</span><span className="font-semibold">Ahora</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Salud del sistema</span><span className="font-semibold text-emerald-500">Óptima</span></div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="p-4 lg:p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
          </div>
        )}

        {/* Configuración movida a: Config anterior oculta (el gBrain es solo memoria) */}
        <div className="hidden">
          {!data ? (
            <p className="text-sm text-muted-foreground">No se pudo cargar.</p>
          ) : (
            <>
              {/* Catálogo */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald-500" /> Catálogo <Badge variant="secondary" className="ml-auto">{data.catalog.count}</Badge></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.catalog.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin productos. Impórtalos para que el bot cotice inventario real.</p>
                  ) : (
                    <div className="space-y-1">
                      {data.catalog.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{it.name}</span>
                          <span className="text-muted-foreground shrink-0">{money(it.price, it.currency)}</span>
                        </div>
                      ))}
                      {data.catalog.count > data.catalog.items.length && <p className="text-[10px] text-muted-foreground">+{data.catalog.count - data.catalog.items.length} más…</p>}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2" onClick={() => onViewChange?.('inventory')}>
                    Gestionar inventario <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>

              {/* Tono / Persona */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Mic2 className="h-4 w-4 text-violet-500" /> Tono y persona</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Tono del vendedor</label>
                    <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Ej: formal pero cercano, con confianza de experto" className="h-9 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Saludo inicial (opcional)</label>
                    <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Ej: ¡Hola! Soy Jhon, tu asesor. ¿En qué te ayudo?" className="text-sm mt-1 min-h-[60px] resize-none" />
                  </div>
                  {data.hasCustomPrompt && <p className="text-[10px] text-amber-600">⚠️ Este negocio usa un prompt personalizado avanzado (tiene prioridad sobre el tono).</p>}
                </CardContent>
              </Card>

              {/* Datos del negocio */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" /> Datos y políticas del negocio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {([
                    ['businessHours', 'Horario de atención', 'Lun–Vie 9am–7pm'],
                    ['businessAddress', 'Dirección', 'Av. Principal 123, Cancún'],
                    ['businessPhone', 'Teléfono', '+52 ...'],
                    ['timezone', 'Zona horaria', 'America/Mexico_City'],
                    ['appointmentUrl', 'Enlace para agendar', 'https://calendly.com/...'],
                  ] as const).map(([k, label, ph]) => (
                    <div key={k}>
                      <label className="text-[11px] text-muted-foreground">{label}</label>
                      <Input value={(biz as Record<string, string>)[k]} onChange={(e) => setBiz((b) => ({ ...b, [k]: e.target.value }))} placeholder={ph} className="h-8 text-sm mt-0.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Lecciones + Agentes */}
              <div className="space-y-4">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><GraduationCap className="h-4 w-4 text-amber-500" /> Lecciones aprendidas <Badge variant="secondary" className="ml-auto">{data.lessons}</Badge></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">Correcciones y ejemplos que el equipo le ha enseñado a la IA (entrenamiento in-context).</p>
                    <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onViewChange?.('playground')}>
                      Entrenar IA <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-emerald-500" /> Agentes conectados <Badge variant="secondary" className="ml-auto">{data.agents.length}</Badge></CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {data.agents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin agentes. Créalos en Agent Factory.</p>
                    ) : data.agents.slice(0, 8).map((ag) => (
                      <div key={ag.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate flex items-center gap-1.5">
                          <span className={ag.status === 'activo' ? 'text-emerald-500' : 'text-muted-foreground'}>{ag.status === 'activo' ? '🟢' : '⏸️'}</span>
                          {ag.name}
                        </span>
                        <span className="text-muted-foreground shrink-0">{ag.totalMessagesSent} msg</span>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1" onClick={() => onViewChange?.('agent-factory')}>
                      Agent Factory <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Seguimiento automático (reactivación proactiva) — full width */}
              <Card className="border-border/60 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Send className="h-4 w-4 text-amber-500" /> Seguimiento automático
                    <Badge className={cn('ml-auto', auto?.enabled ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-zinc-100 text-zinc-600 border-0')}>{auto?.enabled ? '🟢 Activado' : '⏸️ Desactivado'}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Escribe automáticamente a leads inactivos según su score (frenos: respeta cooldown 24h, máx 4 ciclos, salta cerrados/silenciados y a quien tiene cita). <b>Manda WhatsApp a clientes reales</b> — revisa el preview antes de activar.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={toggleAuto} disabled={autoBusy || !auto} size="sm" className={cn('gap-1.5', auto?.enabled ? 'bg-zinc-600 hover:bg-zinc-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white')}>
                      <Power className="h-3.5 w-3.5" /> {auto?.enabled ? 'Desactivar' : 'Activar auto-seguimiento'}
                    </Button>
                    <Button onClick={() => setShowPreview(v => !v)} variant="outline" size="sm" className="gap-1.5" disabled={!auto}>
                      <Eye className="h-3.5 w-3.5" /> {showPreview ? 'Ocultar' : 'Ver'} a quién escribiría ({auto?.previewCount ?? 0})
                    </Button>
                    <Button onClick={runAuto} variant="outline" size="sm" className="gap-1.5" disabled={autoBusy || !auto?.previewCount}>
                      {autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Reactivar ahora ({auto?.previewCount ?? 0})
                    </Button>
                  </div>
                  {/* Control total: aprobar cada seguimiento desde Telegram */}
                  <label className="flex items-start gap-2 rounded-lg border border-violet-300/40 bg-violet-50/50 dark:bg-violet-500/10 p-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-violet-600"
                      checked={!!auto?.approval}
                      disabled={autoBusy || !auto}
                      onChange={async (e) => {
                        const v = e.target.checked
                        setAuto(a => a ? { ...a, approval: v } : a)
                        try {
                          const res = await fetch('/api/followups/auto', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, approval: v }) })
                          if (!res.ok) throw new Error()
                          toast.success(v ? 'Control total ACTIVADO: cada seguimiento te llegará a Telegram para aprobarlo' : 'Aprobación por Telegram desactivada: los seguimientos se envían solos')
                        } catch { setAuto(a => a ? { ...a, approval: !v } : a); toast.error('No se pudo cambiar') }
                      }}
                    />
                    <span className="text-xs leading-relaxed">
                      <b>Aprobar por Telegram antes de enviar</b> (control total): cada seguimiento te llega a Telegram como borrador con botones <b>✅ Aprobar</b> / <b>❌ Descartar</b>. Si no respondes en <b>3 horas</b>, se envía automáticamente (y si el cliente ya contestó por su cuenta, se descarta solo). Requiere el bot de Telegram vinculado (Configuración → Conexiones).
                    </span>
                  </label>
                  {showPreview && (
                    <div className="rounded-lg border border-border/60 divide-y divide-border/40 max-h-64 overflow-y-auto">
                      {(auto?.preview?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">No hay leads para reactivar ahora mismo (todos activos, en cooldown o con cita).</p>
                      ) : auto!.preview.map((r, i) => (
                        <div key={i} className="p-2.5 text-xs">
                          <p className="font-medium flex items-center gap-2">{r.contactName} <Badge variant="secondary" className="text-[9px]">ciclo {r.cycle}</Badge></p>
                          <p className="text-muted-foreground mt-0.5 line-clamp-2">{r.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Reglas de seguimiento por inactividad — full width */}
              <Card className="border-border/60 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-blue-500" /> Reglas de seguimiento
                    <Badge variant="secondary" className="ml-auto">{rules.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Crea reglas tipo &quot;si un lead lleva N días sin responder → mándale este mensaje&quot;. Solo se ejecutan cuando el <b>Seguimiento automático</b> de arriba está activado. Usa <code className="text-[10px] bg-muted px-1 rounded">{'{{name}}'}</code> para el nombre.
                  </p>
                  {rules.length > 0 && (
                    <div className="rounded-lg border border-border/60 divide-y divide-border/40">
                      {rules.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-2 p-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-medium flex items-center gap-2">{r.name} <Badge variant="secondary" className="text-[9px]">{r.days}d</Badge></p>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{r.messageTemplate}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => toggleRule(r)}>{r.isActive ? '🟢 Activa' : '⏸️ Pausada'}</Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRule(r)}>✕</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showRuleForm ? (
                    <div className="rounded-lg border border-border/60 p-3 space-y-2">
                      <Input placeholder="Nombre de la regla (ej: Recordatorio 3 días)" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} className="h-8 text-sm" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Si lleva</span>
                        <Input type="number" min={1} max={365} value={newRule.days} onChange={(e) => setNewRule({ ...newRule, days: Number(e.target.value) || 7 })} className="h-8 text-sm w-20" />
                        <span className="text-xs text-muted-foreground">días sin responder</span>
                      </div>
                      <Textarea placeholder="Mensaje a enviar (opcional). Déjalo VACÍO para que la IA redacte uno PERSONALIZADO según la conversación de cada lead. O escribe una plantilla fija con {{name}}." value={newRule.messageTemplate} onChange={(e) => setNewRule({ ...newRule, messageTemplate: e.target.value })} className="text-sm min-h-[60px] resize-none" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={createRule} disabled={ruleBusy} className="gap-1.5">{ruleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar regla</Button>
                        <Button size="sm" variant="outline" onClick={() => setShowRuleForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowRuleForm(true)}>+ Nueva regla</Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
