'use client'

// ═══════════════════════════════════════════════════════════════
// Mercado Libre — panel completo: conexión (OAuth), publicaciones,
// preguntas, ventas/órdenes y bitácora. Gestiona todo desde aquí.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import {
  Store, Link2, Loader2, CheckCircle2, AlertTriangle, Copy, ExternalLink, RefreshCw,
  Upload, Pause, Play, Trash2, MessageCircleQuestion, ShoppingBag, ScrollText, Send, Unplug,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const money = (n?: number | null, c = 'MXN') => n != null ? `$${Number(n).toLocaleString('es-MX')} ${c}` : '—'
const LISTING_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700' },
  paused: { label: 'Pausada', cls: 'bg-amber-100 text-amber-700' },
  closed: { label: 'Cerrada', cls: 'bg-zinc-200 text-zinc-600' },
  under_review: { label: 'En revisión', cls: 'bg-blue-100 text-blue-700' },
}

interface Conn { connected: boolean; status: string; siteId: string; platformReady: boolean; hasApp: boolean; appId: string | null; nickname: string | null; lastError: string | null; redirectUri: string }
interface Listing { id: string; catalogItemId: string | null; meliItemId: string; permalink: string | null; title: string | null; status: string; price: number | null; availableQuantity: number | null; soldQuantity: number; thumbnail: string | null }
interface CatItem { id: string; name: string; price: number | null; category: string | null; imageUrl: string | null }

export function MeliView({ workspaceId }: { workspaceId: string }) {
  const [conn, setConn] = useState<Conn | null>(null)
  const [loading, setLoading] = useState(true)

  const loadConn = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/meli/connection?workspaceId=${workspaceId}`); if (r.ok) setConn(await r.json()) }
    catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { loadConn() }, [loadConn])

  // Resultado del OAuth (?meli=connected|error:...)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const m = sp.get('meli')
    if (!m) return
    if (m === 'connected') toast.success('Cuenta de Mercado Libre conectada')
    else if (m.startsWith('error')) toast.error('No se pudo conectar: ' + decodeURIComponent(m.replace(/^error:?/, '')) )
    sp.delete('meli'); sp.delete('redirect')
    window.history.replaceState({}, '', window.location.pathname + (sp.toString() ? `?${sp}` : ''))
    loadConn()
  }, [loadConn])

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-yellow-50 via-background to-background dark:from-yellow-500/5 p-4 sm:p-5 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-[#FFE600] text-[#2D3277] shadow-lg shrink-0"><Store className="h-5 w-5 sm:h-6 sm:w-6" /></div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">Mercado Libre</h2>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Publica y gestiona todo tu inventario sin salir de aquí.</p>
            </div>
          </div>
          {conn?.connected ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 shrink-0"><CheckCircle2 className="h-3 w-3" />{conn.nickname || 'Conectado'}</Badge>
          ) : <Badge className="bg-zinc-100 text-zinc-600 border-0 shrink-0">Sin conectar</Badge>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue={conn?.connected ? 'listings' : 'connection'} className="space-y-4">
          <TabsList className="bg-muted/50 flex-wrap h-auto">
            <TabsTrigger value="connection" className="gap-1.5 text-xs"><Link2 className="h-3.5 w-3.5" />Conexión</TabsTrigger>
            <TabsTrigger value="listings" className="gap-1.5 text-xs"><Upload className="h-3.5 w-3.5" />Publicaciones</TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5 text-xs"><MessageCircleQuestion className="h-3.5 w-3.5" />Preguntas</TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 text-xs"><ShoppingBag className="h-3.5 w-3.5" />Ventas</TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 text-xs"><ScrollText className="h-3.5 w-3.5" />Bitácora</TabsTrigger>
          </TabsList>

          <TabsContent value="connection"><ConnectionTab workspaceId={workspaceId} conn={conn} onChanged={loadConn} /></TabsContent>
          <TabsContent value="listings"><ListingsTab workspaceId={workspaceId} connected={!!conn?.connected} /></TabsContent>
          <TabsContent value="questions"><QuestionsTab workspaceId={workspaceId} connected={!!conn?.connected} /></TabsContent>
          <TabsContent value="orders"><OrdersTab workspaceId={workspaceId} connected={!!conn?.connected} /></TabsContent>
          <TabsContent value="logs"><LogsTab workspaceId={workspaceId} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ─── Conexión ─────────────────────────────────────────────────
function ConnectionTab({ workspaceId, conn, onChanged }: { workspaceId: string; conn: Conn | null; onChanged: () => void }) {
  const [appId, setAppId] = useState(conn?.appId || '')
  const [appSecret, setAppSecret] = useState('')
  const [siteId, setSiteId] = useState(conn?.siteId || 'MLM')
  const [busy, setBusy] = useState(false)

  const platformReady = conn?.platformReady ?? false

  const connect = async () => {
    if (!platformReady && !appId.trim()) { toast.error('Ingresa tu App ID'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/meli/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, appId, appSecret, siteId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.authUrl) throw new Error(d.error || 'Error')
      window.location.href = d.authUrl // redirige a ML para autorizar
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); setBusy(false) }
  }
  const disconnect = async () => {
    if (!confirm('¿Desconectar la cuenta de Mercado Libre?')) return
    setBusy(true)
    try { await fetch(`/api/meli/connection?workspaceId=${workspaceId}`, { method: 'DELETE' }); toast.success('Desconectado'); onChanged() }
    catch { toast.error('Error') } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Link2 className="h-4 w-4 text-yellow-600" />Conectar tu cuenta</h3>
        {conn?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Conectado como <b>{conn.nickname || conn.appId}</b> ({conn.siteId})
            </div>
            <Button variant="outline" onClick={disconnect} disabled={busy} className="gap-2 border-red-200 text-red-600 hover:bg-red-50"><Unplug className="h-4 w-4" />Desconectar</Button>
          </div>
        ) : platformReady ? (
          // ── Conexión con un clic (app de ML gestionada por la plataforma) ──
          <div className="space-y-3">
            {conn?.lastError && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{conn.lastError}</div>}
            <p className="text-xs text-muted-foreground">Conecta tu cuenta de Mercado Libre en un clic. Te llevaremos a Mercado Libre para que autorices el acceso y vuelvas automáticamente.</p>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">País / sitio</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="MLM">México (MLM)</option><option value="MLA">Argentina (MLA)</option><option value="MCO">Colombia (MCO)</option><option value="MLC">Chile (MLC)</option><option value="MLB">Brasil (MLB)</option><option value="MPE">Perú (MPE)</option>
              </select>
            </div>
            <Button onClick={connect} disabled={busy} className="gap-2 w-full bg-[#FFE600] text-[#2D3277] hover:bg-[#f5dd00] font-semibold">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Conectar con Mercado Libre</Button>
          </div>
        ) : (
          // ── Fallback: el workspace usa su propia app de desarrollador ──
          <div className="space-y-3">
            {conn?.lastError && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{conn.lastError}</div>}
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">App ID (Client ID)</label><Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="1234567890123456" className="h-9 text-sm font-mono" /></div>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Client Secret {conn?.hasApp && <span className="text-muted-foreground">(deja vacío para no cambiarlo)</span>}</label><Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="••••••••" className="h-9 text-sm font-mono" /></div>
            <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">País / sitio</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="MLM">México (MLM)</option><option value="MLA">Argentina (MLA)</option><option value="MCO">Colombia (MCO)</option><option value="MLC">Chile (MLC)</option><option value="MLB">Brasil (MLB)</option><option value="MPE">Perú (MPE)</option>
              </select>
            </div>
            <Button onClick={connect} disabled={busy} className="gap-2 bg-[#FFE600] text-[#2D3277] hover:bg-[#f5dd00]">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Conectar con Mercado Libre</Button>
          </div>
        )}
      </div>

      {platformReady ? (
        <div className="rounded-xl border border-border/60 p-5 space-y-3 text-xs text-muted-foreground">
          <h3 className="text-sm font-semibold text-foreground">¿Cómo funciona?</h3>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Pulsa <b>Conectar con Mercado Libre</b>.</li>
            <li>Inicia sesión en Mercado Libre (si no lo estás) y pulsa <b>Autorizar</b>.</li>
            <li>Volverás aquí conectado y listo para publicar tu inventario.</li>
          </ol>
          <p className="pt-1">Tus credenciales nunca se comparten: solo autorizas a ValiAutoFlow a gestionar tus publicaciones, preguntas y ventas.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 p-5 space-y-3 text-xs text-muted-foreground">
          <h3 className="text-sm font-semibold text-foreground">Cómo obtener tus credenciales</h3>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Entra a <a className="text-yellow-700 underline" href="https://developers.mercadolibre.com.mx/devcenter" target="_blank" rel="noreferrer">developers.mercadolibre.com.mx <ExternalLink className="inline h-3 w-3" /></a> y crea una aplicación.</li>
            <li>Copia el <b>App ID</b> y el <b>Client Secret</b> a los campos de la izquierda.</li>
            <li>En la app de ML, pon esta <b>Redirect URI</b> exactamente:</li>
          </ol>
          {conn?.redirectUri && (
            <div className="flex items-center gap-2">
              <Input readOnly value={conn.redirectUri} className="h-8 text-[11px] font-mono bg-muted/40" />
              <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={() => { navigator.clipboard.writeText(conn.redirectUri); toast.success('Copiada') }}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          <p>4. Guarda en ML, vuelve aquí y pulsa <b>Conectar</b>. Autoriza el acceso en Mercado Libre y listo.</p>
        </div>
      )}
    </div>
  )
}

// ─── Publicaciones ────────────────────────────────────────────
function ListingsTab({ workspaceId, connected }: { workspaceId: string; connected: boolean }) {
  const [listings, setListings] = useState<Listing[]>([])
  const [cars, setCars] = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (sync = false) => {
    setLoading(true)
    try {
      const [lr, cr] = await Promise.all([
        fetch(`/api/meli/listings?workspaceId=${workspaceId}${sync ? '&sync=1' : ''}`),
        fetch(`/api/catalog?workspaceId=${workspaceId}`),
      ])
      const ld = lr.ok ? await lr.json() : { items: [] }
      const cd = cr.ok ? await cr.json() : { items: [] }
      setListings(ld.items || [])
      setCars(cd.items || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  const publishedIds = new Set(listings.map((l) => l.catalogItemId).filter(Boolean))
  const unpublished = cars.filter((c) => !publishedIds.has(c.id))

  const publish = async (c: CatItem) => {
    if (!connected) { toast.error('Conecta tu cuenta de Mercado Libre primero'); return }
    setBusy(c.id)
    try {
      const r = await fetch('/api/meli/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, catalogItemId: c.id }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Error')
      toast.success(`Publicado: ${c.name}`); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al publicar') } finally { setBusy(null) }
  }
  const action = async (l: Listing, act: 'pause' | 'activate' | 'delete') => {
    if (act === 'delete' && !confirm('¿Cerrar esta publicación en Mercado Libre?')) return
    setBusy(l.id)
    try {
      const r = act === 'delete'
        ? await fetch(`/api/meli/listings/${l.id}`, { method: 'DELETE' })
        : await fetch(`/api/meli/listings/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: act }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Error') }
      toast.success('Hecho'); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setBusy(null) }
  }

  if (!connected) return <ConnectFirst />
  if (loading) return <Spin />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Publicaciones activas ({listings.length})</h3>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => load(true)}><RefreshCw className="h-3.5 w-3.5" />Sincronizar</Button>
      </div>
      {listings.length === 0 ? <p className="text-xs text-muted-foreground">Aún no has publicado autos.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => {
            const st = LISTING_STATUS[l.status] || LISTING_STATUS.active
            return (
              <div key={l.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="h-12 w-16 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">{l.thumbnail ? <img src={l.thumbnail} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-muted-foreground/40" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{l.title || l.meliItemId}</p>
                    <p className="text-sm font-bold text-emerald-600">{money(l.price)}</p>
                    <Badge className={cn('text-[9px] border-0 mt-0.5', st.cls)}>{st.label}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.permalink && <a href={l.permalink} target="_blank" rel="noreferrer" className="text-[10px] inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><ExternalLink className="h-3 w-3" />Ver</a>}
                  {l.status === 'active'
                    ? <button onClick={() => action(l, 'pause')} disabled={busy === l.id} className="text-[10px] inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><Pause className="h-3 w-3" />Pausar</button>
                    : l.status === 'paused' ? <button onClick={() => action(l, 'activate')} disabled={busy === l.id} className="text-[10px] inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><Play className="h-3 w-3" />Reactivar</button> : null}
                  <button onClick={() => action(l, 'delete')} disabled={busy === l.id} className="text-[10px] inline-flex items-center gap-1 rounded-md border px-2 py-1 text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" />Cerrar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="pt-2">
        <h3 className="text-sm font-semibold mb-2">Autos del inventario sin publicar ({unpublished.length})</h3>
        {unpublished.length === 0 ? <p className="text-xs text-muted-foreground">Todo tu inventario está publicado.</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unpublished.map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 p-3 flex items-center gap-2">
                <div className="h-10 w-14 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">{c.imageUrl ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-muted-foreground/40" />}</div>
                <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{c.name}</p><p className="text-xs text-emerald-600 font-semibold">{money(c.price)}</p></div>
                <Button size="sm" className="gap-1.5 bg-[#FFE600] text-[#2D3277] hover:bg-[#f5dd00] shrink-0" disabled={busy === c.id} onClick={() => publish(c)}>{busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Publicar</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Preguntas ────────────────────────────────────────────────
interface MeliQuestion { id: number; text: string; status: string; item_id?: string; date_created?: string; answer?: { text: string } | null }
function QuestionsTab({ workspaceId, connected }: { workspaceId: string; connected: boolean }) {
  const [qs, setQs] = useState<MeliQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/meli/questions?workspaceId=${workspaceId}`); const d = r.ok ? await r.json() : { questions: [] }; setQs(d.questions || []) }
    catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { if (connected) { load() } else { setLoading(false) } }, [connected, load])

  const answer = async (q: MeliQuestion) => {
    const text = draft[q.id]?.trim()
    if (!text) { toast.error('Escribe la respuesta'); return }
    setBusy(q.id)
    try {
      const r = await fetch('/api/meli/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, questionId: q.id, text }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Error') }
      toast.success('Respuesta enviada'); setDraft((p) => ({ ...p, [q.id]: '' })); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setBusy(null) }
  }

  if (!connected) return <ConnectFirst />
  if (loading) return <Spin />
  if (!qs.length) return <p className="text-xs text-muted-foreground">No hay preguntas pendientes 🎉</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Preguntas de compradores ({qs.length})</h3><Button variant="ghost" size="sm" className="gap-1.5" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button></div>
      {qs.map((q) => (
        <div key={q.id} className="rounded-xl border border-border/60 p-3 space-y-2">
          <p className="text-sm">{q.text}</p>
          <div className="flex gap-2">
            <Input value={draft[q.id] || ''} onChange={(e) => setDraft((p) => ({ ...p, [q.id]: e.target.value }))} placeholder="Tu respuesta…" className="h-9 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') answer(q) }} />
            <Button size="sm" className="gap-1.5 shrink-0" disabled={busy === q.id} onClick={() => answer(q)}>{busy === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Responder</Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Ventas / Órdenes ─────────────────────────────────────────
interface MeliOrder { id: number; status?: string; total_amount?: number; currency_id?: string; date_created?: string; buyer?: { nickname?: string }; order_items?: { item?: { title?: string }; quantity?: number }[] }
function OrdersTab({ workspaceId, connected }: { workspaceId: string; connected: boolean }) {
  const [orders, setOrders] = useState<MeliOrder[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/meli/orders?workspaceId=${workspaceId}`); const d = r.ok ? await r.json() : { orders: [] }; setOrders(d.orders || []) }
    catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { if (connected) { load() } else { setLoading(false) } }, [connected, load])

  if (!connected) return <ConnectFirst />
  if (loading) return <Spin />
  if (!orders.length) return <p className="text-xs text-muted-foreground">Aún no hay ventas registradas.</p>

  return (
    <div className="rounded-xl border border-border/60 overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead><tr className="text-left text-muted-foreground border-b bg-muted/40">{['Orden', 'Producto', 'Comprador', 'Total', 'Estado', 'Fecha'].map((h) => <th key={h} className="p-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="p-2.5 font-mono">#{o.id}</td>
              <td className="p-2.5 max-w-[220px] truncate">{o.order_items?.[0]?.item?.title || '—'}</td>
              <td className="p-2.5">{o.buyer?.nickname || '—'}</td>
              <td className="p-2.5 font-semibold text-emerald-600">{money(o.total_amount, o.currency_id || 'MXN')}</td>
              <td className="p-2.5">{o.status || '—'}</td>
              <td className="p-2.5">{o.date_created ? new Date(o.date_created).toLocaleDateString('es-MX') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Bitácora ─────────────────────────────────────────────────
interface MeliLogRow { id: string; action: string; targetType: string | null; status: string; message: string | null; createdAt: string }
function LogsTab({ workspaceId }: { workspaceId: string }) {
  const [logs, setLogs] = useState<MeliLogRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { (async () => { try { const r = await fetch(`/api/meli/logs?workspaceId=${workspaceId}`); const d = r.ok ? await r.json() : { items: [] }; setLogs(d.items || []) } catch { /* */ } finally { setLoading(false) } })() }, [workspaceId])
  if (loading) return <Spin />
  if (!logs.length) return <p className="text-xs text-muted-foreground">Sin actividad todavía.</p>
  return (
    <div className="space-y-1.5">
      {logs.map((l) => (
        <div key={l.id} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', l.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-border/60')}>
          {l.status === 'error' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <span className="font-medium">{l.action}</span>{l.targetType ? <span className="text-muted-foreground"> · {l.targetType}</span> : null}
            {l.message && <p className="text-muted-foreground truncate">{l.message}</p>}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{new Date(l.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  )
}

function Spin() { return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> }
function ConnectFirst() { return <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground"><Store className="h-8 w-8" /><p className="text-sm">Conecta tu cuenta de Mercado Libre en la pestaña <b>Conexión</b>.</p></div> }
