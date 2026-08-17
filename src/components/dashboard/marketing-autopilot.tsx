'use client'

// ═══════════════════════════════════════════════════════════════
// Piloto Automático de Marketing — bot que estudia el mercado, elige el
// auto, crea el creativo + caption y publica en redes en los mejores
// horarios. Config + estudio de mercado IA + historial de publicaciones.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import {
  Bot, Loader2, Sparkles, Clock, TrendingUp, Play, Save, Power, RefreshCw,
  Instagram, Facebook, CheckCircle2, AlertTriangle, CalendarClock, Target, History, Lightbulb, Trash2,
  Store, MapPin, Phone, Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BotConfig { enabled: boolean; networks: string[]; formats: string[]; maxPerDay: number; templateStrategy: string; autoVideo: boolean; postsToday: number }
interface Study { summary: string; inventory: { total: number; avgPrice: number | null; topBrands: { name: string; count: number }[]; bodyTypes: { name: string; count: number }[] }; segments: { name: string; description: string; channel: string }[]; angles: string[]; weeklyPlan: { day: string; idea: string; format: string; network: string }[]; bestTimes: { network: string; label: string; windows: string }[]; ai: boolean }
interface Post { id: string; network: string; format: string; status: string; error?: string | null; caption?: string | null; createdAt: string; source: string }
interface Tip { title: string; detail: string; severity?: string }
interface Sched { id: string; carId: string; networks: string; formats: string; scheduledAt: string; status: string; withVideo: boolean }
interface BizInfo { dealerName: string; ubicacion: string; phone: string; site: string }
interface Learning { updatedAt: string; sampleSize: number; totalEngagement: number; topHours: number[]; bestTemplate: string | null; bestPost: { carName?: string; network: string; eng: number; likes: number; comments: number } | null }

export function MarketingAutopilot({ workspaceId }: { workspaceId: string }) {
  const [cfg, setCfg] = useState<BotConfig | null>(null)
  const [conn, setConn] = useState<{ facebook: boolean; instagram: boolean }>({ facebook: false, instagram: false })
  const [nextSlots, setNextSlots] = useState<{ instagram: string; facebook: string } | null>(null)
  const [study, setStudy] = useState<Study | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [scheduled, setScheduled] = useState<Sched[]>([])
  const [loading, setLoading] = useState(true)
  const [studyLoading, setStudyLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const [approval, setApproval] = useState(false)
  const [biz, setBiz] = useState<BizInfo>({ dealerName: '', ubicacion: '', phone: '', site: '' })
  const [bizSaving, setBizSaving] = useState(false)
  const [learning, setLearning] = useState<Learning | null>(null)
  const loadBot = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/marketing/bot?workspaceId=${workspaceId}`)
      const d = await r.json()
      if (r.ok) { setCfg(d.config); setConn(d.connection || { facebook: false, instagram: false }); setNextSlots(d.nextSlots); setApproval(!!d.approval); if (d.business) setBiz(d.business); setLearning(d.learning || null) }
    } catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])

  const saveBiz = async () => {
    setBizSaving(true)
    try {
      const r = await fetch('/api/marketing/bot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, business: biz }) })
      if (!r.ok) throw new Error()
      toast.success('Datos del negocio guardados — se usarán en las próximas publicaciones')
    } catch { toast.error('No se pudo guardar') } finally { setBizSaving(false) }
  }

  const loadPosts = useCallback(async () => {
    try { const r = await fetch(`/api/marketing/posts?workspaceId=${workspaceId}`); const d = await r.json(); if (r.ok) setPosts(d.posts || []) } catch { /* */ }
  }, [workspaceId])

  const loadStudy = useCallback(async () => {
    setStudyLoading(true)
    try { const r = await fetch(`/api/marketing/market-study?workspaceId=${workspaceId}`); const d = await r.json(); if (r.ok) setStudy(d.study) } catch { /* */ } finally { setStudyLoading(false) }
  }, [workspaceId])

  const loadScheduled = useCallback(async () => {
    try { const r = await fetch(`/api/marketing/schedule?workspaceId=${workspaceId}`); const d = await r.json(); if (r.ok) setScheduled(d.posts || []) } catch { /* */ }
  }, [workspaceId])

  useEffect(() => { loadBot(); loadPosts(); loadStudy(); loadScheduled() }, [loadBot, loadPosts, loadStudy, loadScheduled])
  useEffect(() => { fetch(`/api/marketing/tips?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setTips(d.tips || [])).catch(() => {}) }, [workspaceId])

  const cancelSched = async (id: string) => {
    try { await fetch(`/api/marketing/schedule?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' }); loadScheduled() } catch { /* */ }
  }

  const patch = (p: Partial<BotConfig>) => setCfg(c => c ? { ...c, ...p } : c)

  // Persiste de inmediato un cambio puntual (ej. el toggle Activado/Desactivado),
  // sin obligar al usuario a pulsar "Guardar configuración".
  const patchPersist = async (p: Partial<BotConfig>) => {
    if (!cfg) return
    const merged = { ...cfg, ...p }
    setCfg(merged)
    try {
      const r = await fetch('/api/marketing/bot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, ...merged }) })
      if (!r.ok) throw new Error()
      toast.success(p.enabled !== undefined ? (p.enabled ? 'Piloto activado' : 'Piloto desactivado') : 'Guardado')
    } catch { toast.error('No se pudo guardar'); setCfg(cfg) }
  }
  const toggleArr = (key: 'networks' | 'formats', v: string) => setCfg(c => { if (!c) return c; const arr = c[key].includes(v) ? c[key].filter(x => x !== v) : [...c[key], v]; return { ...c, [key]: arr } })

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      const r = await fetch('/api/marketing/bot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, ...cfg }) })
      if (!r.ok) throw new Error()
      toast.success('Configuración guardada')
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await fetch('/api/marketing/bot/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, force: true }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      if (d.result?.status === 'ran') toast.success(`Publicado en ${d.result.published || 0} destino(s)`)
      else toast.info(`El bot no publicó: ${d.result?.reason || 'sin autos/conexión'}`)
      loadPosts()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setRunning(false) }
  }

  const regenStudy = async () => {
    setStudyLoading(true)
    try { const r = await fetch('/api/marketing/market-study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) }); const d = await r.json(); if (r.ok) { setStudy(d.study); toast.success('Estudio actualizado') } } catch { toast.error('Error') } finally { setStudyLoading(false) }
  }

  if (loading || !cfg) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Control del piloto */}
      <div className="rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2.5 rounded-xl', cfg.enabled ? 'bg-emerald-500/15' : 'bg-muted')}><Bot className={cn('h-6 w-6', cfg.enabled ? 'text-emerald-500' : 'text-muted-foreground')} /></div>
            <div>
              <h2 className="font-semibold">Piloto Automático</h2>
              <p className="text-xs text-muted-foreground">El bot publica solo en los mejores horarios. Hoy: {cfg.postsToday} publicación(es).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={cfg.enabled ? 'default' : 'outline'} size="sm" className={cn('gap-2', cfg.enabled && 'bg-emerald-600 hover:bg-emerald-700 text-white')} onClick={() => { patchPersist({ enabled: !cfg.enabled }) }}><Power className="h-4 w-4" /> {cfg.enabled ? 'Activado' : 'Desactivado'}</Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={runNow} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Publicar ahora</Button>
          </div>
        </div>

        {/* Control total: aprobar cada publicación desde Telegram */}
        <label className="flex items-start gap-2 rounded-lg border border-violet-300/40 bg-violet-50/50 dark:bg-violet-500/10 p-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-violet-600"
            checked={approval}
            onChange={async (e) => {
              const v = e.target.checked
              setApproval(v)
              try {
                const r = await fetch('/api/marketing/bot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, approval: v }) })
                if (!r.ok) throw new Error()
                toast.success(v ? 'Cada publicación del piloto te llegará a Telegram para aprobarla' : 'El piloto vuelve a publicar directo')
              } catch { setApproval(!v); toast.error('No se pudo cambiar') }
            }}
          />
          <span className="text-xs leading-relaxed">
            <b>Aprobar por Telegram antes de publicar</b> (control total): el piloto arma el diseño y el texto, te lo manda a Telegram con vista previa y botones <b>✅ Publicar</b> / <b>❌ Descartar</b>. Si no respondes en <b>3 horas</b>, se publica solo. El botón "Publicar ahora" manual no pasa por aprobación.
          </span>
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Redes</p>
            <div className="flex gap-2">
              {(['facebook', 'instagram'] as const).map(n => (
                <button key={n} onClick={() => toggleArr('networks', n)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border', cfg.networks.includes(n) ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground')}>
                  {n === 'facebook' ? <Facebook className="h-3.5 w-3.5" /> : <Instagram className="h-3.5 w-3.5" />}{n === 'facebook' ? 'Facebook' : 'Instagram'}
                  {conn[n] ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Formatos</p>
            <div className="flex gap-2">
              {(['feed', 'story'] as const).map(f => (
                <button key={f} onClick={() => toggleArr('formats', f)} className={cn('px-3 py-1.5 rounded-lg text-xs border', cfg.formats.includes(f) ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground')}>{f === 'feed' ? 'Feed' : 'Historia'}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Máx. publicaciones por día</p>
            <input type="number" min={1} max={10} value={cfg.maxPerDay} onChange={e => patch({ maxPerDay: Number(e.target.value) })} className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Video automático (reel)</p>
            <button onClick={() => patch({ autoVideo: !cfg.autoVideo })} className={cn('px-3 py-1.5 rounded-lg text-xs border', cfg.autoVideo ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground')}>{cfg.autoVideo ? 'Activado' : 'Desactivado'}</button>
          </div>
        </div>

        {nextSlots && (
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-violet-500" /> Próx. IG: <b className="text-foreground">{nextSlots.instagram}</b></span>
            <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-blue-500" /> Próx. FB: <b className="text-foreground">{nextSlots.facebook}</b></span>
          </div>
        )}
        <Button onClick={save} disabled={saving} size="sm" className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar configuración</Button>
      </div>

      {/* Configuración rápida del negocio — datos que aparecen en las publicaciones */}
      <div className="rounded-2xl border border-border p-5 space-y-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Store className="h-4 w-4 text-violet-500" /> Datos del negocio</h2>
          <p className="text-xs text-muted-foreground mt-1">Configuración rápida: esto es lo que aparece en tus diseños y textos (ubicación, teléfono de contacto). Llénalo una vez y el bot lo usa en todas las publicaciones.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Store className="h-3 w-3" /> Nombre del negocio</label>
            <input value={biz.dealerName} onChange={e => setBiz(b => ({ ...b, dealerName: e.target.value }))} placeholder="Ej. Autos Vega" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Ubicación (ciudad, estado)</label>
            <input value={biz.ubicacion} onChange={e => setBiz(b => ({ ...b, ubicacion: e.target.value }))} placeholder="Ej. Cancún, Quintana Roo" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Teléfono / WhatsApp</label>
            <input value={biz.phone} onChange={e => setBiz(b => ({ ...b, phone: e.target.value }))} placeholder="Ej. 998 123 4567" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Sitio web (opcional)</label>
            <input value={biz.site} onChange={e => setBiz(b => ({ ...b, site: e.target.value }))} placeholder="Ej. autosvega.mx" className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
          </div>
        </div>
        <Button onClick={saveBiz} disabled={bizSaving} size="sm" className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">{bizSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar datos del negocio</Button>
      </div>

      {/* Lo que el bot ha aprendido (métricas reales de sus publicaciones) */}
      <div className="rounded-2xl border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-500/5 p-5 space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Lo que el bot ha aprendido</h2>
        {learning && learning.sampleSize > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/60 p-2.5"><p className="text-muted-foreground">Publicaciones medidas (30 días)</p><p className="font-bold text-sm">{learning.sampleSize} · {learning.totalEngagement} interacciones</p></div>
            <div className="rounded-lg border border-border/60 p-2.5"><p className="text-muted-foreground">Tus mejores horarios reales</p><p className="font-bold text-sm">{learning.topHours.length ? learning.topHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ') : 'Aún juntando datos'}</p></div>
            {learning.bestTemplate && <div className="rounded-lg border border-border/60 p-2.5"><p className="text-muted-foreground">Diseño que mejor funciona</p><p className="font-bold text-sm capitalize">{learning.bestTemplate}</p></div>}
            {learning.bestPost && <div className="rounded-lg border border-border/60 p-2.5"><p className="text-muted-foreground">Mejor publicación</p><p className="font-bold text-sm">{learning.bestPost.carName || 'Auto'} · {learning.bestPost.likes} me gusta, {learning.bestPost.comments} comentarios</p></div>}
            <p className="sm:col-span-2 text-[11px] text-muted-foreground">El bot ya usa estos datos: publica también en tus mejores horas reales, prefiere el diseño ganador y escribe los textos inspirándose en los que más gustaron. Cada lunes te llega el resumen por Telegram.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">El bot revisa a diario los me gusta, comentarios y compartidos de sus publicaciones y aprende de ellos: mejores horarios, mejor diseño y qué estilo de texto le gusta a tu audiencia. Necesita unos días publicando para juntar sus primeros datos — aquí verás lo que va descubriendo.</p>
        )}
      </div>

      {/* Consejos de la IA */}
      {tips.length > 0 && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/5 p-5 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /> Consejos de la IA para tu negocio</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {tips.map((t, i) => (
              <div key={i} className="rounded-lg border border-border/60 p-2.5 text-xs">
                <b className={cn(t.severity === 'warn' ? 'text-red-600' : t.severity === 'do' ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400')}>{t.title}</b>
                <p className="text-muted-foreground mt-0.5">{t.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Publicaciones programadas */}
      {scheduled.length > 0 && (
        <div className="rounded-2xl border border-border p-5 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-violet-500" /> Publicaciones programadas</h2>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {scheduled.map(s => {
              const nets = (() => { try { return JSON.parse(s.networks).join(', ') } catch { return '' } })()
              const fmts = (() => { try { return JSON.parse(s.formats).join('+') } catch { return '' } })()
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5">
                  <CalendarClock className={cn('h-3.5 w-3.5 shrink-0', s.status === 'pending' ? 'text-violet-500' : s.status === 'done' ? 'text-emerald-500' : s.status === 'error' ? 'text-red-500' : 'text-muted-foreground')} />
                  <span className="font-medium">{new Date(s.scheduledAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-muted-foreground">{nets} · {fmts}{s.withVideo ? ' · video' : ''}</span>
                  <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded', s.status === 'pending' ? 'bg-violet-500/15 text-violet-600' : s.status === 'done' ? 'bg-emerald-500/15 text-emerald-600' : s.status === 'error' ? 'bg-red-500/15 text-red-600' : 'bg-muted text-muted-foreground')}>{s.status === 'pending' ? 'Pendiente' : s.status === 'done' ? 'Publicado' : s.status === 'error' ? 'Error' : 'Cancelado'}</span>
                  {s.status === 'pending' && <button onClick={() => cancelSched(s.id)} className="text-red-500 p-0.5"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Estudio de mercado */}
      <div className="rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-violet-500" /> Estudio de Mercado {study && !study.ai && <span className="text-[10px] text-amber-600">(sin IA)</span>}</h2>
          <Button size="sm" variant="outline" className="gap-2" onClick={regenStudy} disabled={studyLoading}>{studyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerar</Button>
        </div>
        {studyLoading && !study ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div> : study && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{study.summary}</p>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-muted-foreground">Inventario</p><p className="text-lg font-bold">{study.inventory.total} autos</p>{study.inventory.avgPrice && <p className="text-muted-foreground">Prom. ${study.inventory.avgPrice.toLocaleString('es-MX')}</p>}</div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-muted-foreground">Marcas top</p><p className="font-medium">{study.inventory.topBrands.slice(0, 3).map(b => b.name).join(', ') || '—'}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-muted-foreground">Carrocerías</p><p className="font-medium">{study.inventory.bodyTypes.slice(0, 3).map(b => b.name).join(', ') || '—'}</p></div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Segmentos</p>
                <div className="space-y-1.5">{study.segments.map((s, i) => <div key={i} className="text-xs rounded-lg border border-border p-2"><b>{s.name}</b> <span className="text-violet-500">({s.channel})</span><br /><span className="text-muted-foreground">{s.description}</span></div>)}</div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Ángulos que venden</p>
                <ul className="space-y-1">{study.angles.map((a, i) => <li key={i} className="text-xs flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />{a}</li>)}</ul>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Plan semanal sugerido</p>
              <div className="grid sm:grid-cols-5 gap-2">{study.weeklyPlan.map((p, i) => <div key={i} className="rounded-lg border border-border p-2 text-[11px]"><b>{p.day}</b><p className="text-muted-foreground mt-0.5">{p.idea}</p><span className="text-violet-500">{p.format} · {p.network}</span></div>)}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Mejores horarios</p>
              <div className="space-y-1">{study.bestTimes.map((b, i) => <p key={i} className="text-[11px]"><b>{b.label}:</b> <span className="text-muted-foreground">{b.windows}</span></p>)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="rounded-2xl border border-border p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><History className="h-4 w-4 text-violet-500" /> Historial de publicaciones</h2>
        {posts.length === 0 ? <p className="text-xs text-muted-foreground">Aún no hay publicaciones.</p> : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {posts.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5">
                {p.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                {p.network === 'facebook' ? <Facebook className="h-3.5 w-3.5 text-blue-500" /> : <Instagram className="h-3.5 w-3.5 text-pink-500" />}
                <span className="font-medium">{p.format}</span>
                <span className="text-muted-foreground">{p.source === 'bot' ? '🤖' : '✋'}</span>
                <span className="text-muted-foreground ml-auto">{new Date(p.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {p.error && <span className="text-red-500 truncate max-w-[180px]" title={p.error}>{p.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
