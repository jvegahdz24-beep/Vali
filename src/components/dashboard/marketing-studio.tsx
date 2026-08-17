'use client'

// ═══════════════════════════════════════════════════════════════
// Estudio de Diseños — genera creativos profesionales (feed + historias)
// componiendo la FOTO REAL del auto del inventario con plantillas, precio,
// specs, logo y CTA. Previsualiza, cambia de plantilla, genera caption con
// IA y descarga. (Publicar a redes llega en la Fase 2.)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Image as ImageIcon, Search, Download, Loader2, Sparkles, Copy, Check,
  Square, RectangleVertical, Car, RefreshCw, Send, Video, Instagram, Facebook, CheckCircle2, AlertTriangle,
  Lightbulb, CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Cat { id: string; name: string; price?: number | null; currency?: string; category?: string | null; imageUrl?: string | null; metadata?: string }

const FEED_TEMPLATES = [{ id: 'clasica', label: 'Clásica' }, { id: 'ficha', label: 'Ficha' }, { id: 'oferta', label: 'Oferta' }]
const STORY_TEMPLATES = [{ id: 'historia', label: 'Historia' }, { id: 'cobertura', label: 'Cobertura' }, { id: 'editorial', label: 'Editorial' }]

const money = (n?: number | null, c = 'MXN') => n != null ? `$${Number(n).toLocaleString('es-MX')} ${c}` : '—'
const thumb = (v: Cat) => { try { const m = JSON.parse(v.metadata || '{}'); return (m.images?.[0]) || v.imageUrl || null } catch { return v.imageUrl || null } }

export function MarketingStudio({ workspaceId }: { workspaceId: string }) {
  const [cars, setCars] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [format, setFormat] = useState<'feed' | 'story'>('feed')
  const [template, setTemplate] = useState('clasica')
  const [imgLoading, setImgLoading] = useState(true)
  const [caption, setCaption] = useState<{ text: string; hashtags: string[]; ai: boolean } | null>(null)
  const [capLoading, setCapLoading] = useState(false)
  const [capPlatform, setCapPlatform] = useState<'instagram' | 'facebook'>('instagram')
  const [copied, setCopied] = useState(false)
  const [conn, setConn] = useState<{ facebook: boolean; instagram: boolean } | null>(null)
  const [netSel, setNetSel] = useState<Record<string, boolean>>({ facebook: true, instagram: true })
  const [fmtSel, setFmtSel] = useState<Record<string, boolean>>({ feed: true, story: true })
  const [publishing, setPublishing] = useState(false)
  const [pubResults, setPubResults] = useState<{ network: string; format: string; status: string; error?: string }[] | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [vidLoading, setVidLoading] = useState(false)
  const [tips, setTips] = useState<{ title: string; detail: string; severity?: string }[]>([])
  const [schedAt, setSchedAt] = useState('')
  const [scheduling, setScheduling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/catalog?workspaceId=${workspaceId}`)
      const d = await r.json()
      const items: Cat[] = Array.isArray(d.items) ? d.items : []
      setCars(items)
      if (items.length && !selId) setSelId(items[0].id)
    } catch { toast.error('No se pudo cargar el inventario') } finally { setLoading(false) }
  }, [workspaceId, selId])
  useEffect(() => { load() }, [load])

  const templates = format === 'feed' ? FEED_TEMPLATES : STORY_TEMPLATES
  useEffect(() => { if (!templates.find(t => t.id === template)) setTemplate(templates[0].id) }, [format, templates, template])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? cars.filter(c => c.name.toLowerCase().includes(q)) : cars
  }, [cars, search])

  const sel = cars.find(c => c.id === selId) || null
  const renderUrl = sel ? `/api/marketing/render?workspaceId=${workspaceId}&carId=${sel.id}&format=${format}&template=${template}` : ''

  useEffect(() => { setImgLoading(true) }, [renderUrl])
  useEffect(() => { setCaption(null); setPubResults(null); setVideo(null) }, [selId])
  useEffect(() => { fetch(`/api/marketing/connection?workspaceId=${workspaceId}`).then(r => r.json()).then(setConn).catch(() => setConn({ facebook: false, instagram: false })) }, [workspaceId])
  useEffect(() => { fetch(`/api/marketing/tips?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setTips(d.tips || [])).catch(() => {}) }, [workspaceId])

  const schedule = async () => {
    if (!sel || !schedAt) { toast.error('Elige fecha y hora'); return }
    const networks = Object.keys(netSel).filter(k => netSel[k]); const formats = Object.keys(fmtSel).filter(k => fmtSel[k])
    if (!networks.length || !formats.length) { toast.error('Elige red y formato'); return }
    setScheduling(true)
    try {
      const r = await fetch('/api/marketing/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, carId: sel.id, networks, formats, templates: { feed: format === 'feed' ? template : 'clasica', story: format === 'story' ? template : 'historia' }, caption: caption ? `${caption.text}\n\n${caption.hashtags.join(' ')}` : undefined, scheduledAt: new Date(schedAt).toISOString() }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Error')
      toast.success('Publicación agendada'); setSchedAt('')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setScheduling(false) }
  }

  const publish = async () => {
    if (!sel) return
    const networks = Object.keys(netSel).filter(k => netSel[k])
    const formats = Object.keys(fmtSel).filter(k => fmtSel[k])
    if (!networks.length || !formats.length) { toast.error('Elige al menos una red y un formato'); return }
    setPublishing(true); setPubResults(null)
    try {
      const r = await fetch('/api/marketing/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, carId: sel.id, networks, formats, templates: { feed: format === 'feed' ? template : 'clasica', story: format === 'story' ? template : 'historia' }, caption: caption ? `${caption.text}\n\n${caption.hashtags.join(' ')}` : undefined }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setPubResults(d.results)
      if (d.published > 0) toast.success(`Publicado en ${d.published} destino(s)`); else toast.error('No se pudo publicar (revisa la conexión)')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setPublishing(false) }
  }

  const makeVideo = async () => {
    if (!sel) return
    setVidLoading(true); setVideo(null)
    try {
      const r = await fetch('/api/marketing/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, carId: sel.id }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setVideo(d.url); toast.success(`Video listo (${d.durationSec}s)`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al generar video') } finally { setVidLoading(false) }
  }

  const genCaption = async () => {
    if (!sel) return
    setCapLoading(true)
    try {
      const r = await fetch('/api/marketing/caption', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, carId: sel.id, platform: capPlatform }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setCaption({ text: d.text, hashtags: d.hashtags || [], ai: d.ai })
      if (!d.ai) toast.info('Caption generado sin IA (revisa el saldo del proveedor para textos más creativos)')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setCapLoading(false) }
  }

  const copyCaption = () => {
    if (!caption) return
    navigator.clipboard.writeText(`${caption.text}\n\n${caption.hashtags.join(' ')}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success('Caption copiado')
  }

  const download = (tplId: string, fmt: 'feed' | 'story') => {
    if (!sel) return
    const url = `/api/marketing/render?workspaceId=${workspaceId}&carId=${sel.id}&format=${fmt}&template=${tplId}`
    const a = document.createElement('a')
    a.href = url; a.download = `${sel.name.replace(/[^a-z0-9]+/gi, '-')}-${fmt}-${tplId}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Lista de autos */}
      <div className="lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col max-h-[40vh] lg:max-h-none">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar auto…" className="pl-8 h-9 text-sm" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No hay autos en el inventario.</p>
          ) : filtered.map(c => {
            const t = thumb(c)
            return (
              <button key={c.id} onClick={() => setSelId(c.id)} className={cn('w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors', selId === c.id ? 'bg-violet-500/10 ring-1 ring-violet-500/40' : 'hover:bg-muted/60')}>
                <div className="relative h-11 w-14 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  <Car className="h-4 w-4 text-muted-foreground/40" />
                  {t && <img src={t} alt="" className="absolute inset-0 h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-violet-500 font-semibold">{money(c.price, c.currency)}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Editor / preview */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
        {!sel ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
            <ImageIcon className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecciona un auto para crear sus diseños.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 max-w-5xl mx-auto">
            {/* Preview */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button onClick={() => setFormat('feed')} className={cn('flex items-center gap-1.5 px-3 py-2 text-sm', format === 'feed' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted')}><Square className="h-4 w-4" /> Feed</button>
                  <button onClick={() => setFormat('story')} className={cn('flex items-center gap-1.5 px-3 py-2 text-sm', format === 'story' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted')}><RectangleVertical className="h-4 w-4" /> Historia</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => setTemplate(t.id)} className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', template === t.id ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground hover:bg-muted')}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <div className={cn('relative rounded-xl overflow-hidden border border-border bg-muted/40 shadow-lg', format === 'feed' ? 'w-full max-w-[460px] aspect-square' : 'w-full max-w-[300px] aspect-[9/16]')}>
                  {imgLoading && <div className="absolute inset-0 flex items-center justify-center bg-muted/60 z-10"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>}
                  {renderUrl && <img key={renderUrl} src={renderUrl} alt="Creativo" className="w-full h-full object-cover" onLoad={() => setImgLoading(false)} onError={() => { setImgLoading(false); toast.error('No se pudo generar la imagen') }} />}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => download(template, format)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"><Download className="h-4 w-4" /> Descargar {format === 'feed' ? 'feed' : 'historia'}</Button>
                <Button variant="outline" onClick={() => { setImgLoading(true); const img = document.querySelector<HTMLImageElement>(`img[src="${renderUrl}"]`); if (img) img.src = `${renderUrl}&r=${Date.now()}` }} className="gap-2"><RefreshCw className="h-4 w-4" /> Regenerar</Button>
              </div>
            </div>

            {/* Panel lateral: info + caption */}
            <div className="space-y-4">
              {tips.length > 0 && (
                <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-500/5 p-4 space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-amber-500" /> Consejos de la IA</p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {tips.slice(0, 5).map((t, i) => (
                      <div key={i} className="text-[11px]"><b className={cn(t.severity === 'warn' ? 'text-red-600' : t.severity === 'do' ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400')}>{t.title}.</b> <span className="text-muted-foreground">{t.detail}</span></div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-border p-4">
                <p className="font-semibold text-sm">{sel.name}</p>
                <p className="text-violet-500 font-bold mt-0.5">{money(sel.price, sel.currency)}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Plantillas profesionales con la foto real del auto, precio, specs y tu logo.</p>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-violet-500" /> Caption</span>
                  <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
                    <button onClick={() => setCapPlatform('instagram')} className={cn('px-2 py-1', capPlatform === 'instagram' ? 'bg-violet-600 text-white' : 'text-muted-foreground')}>Instagram</button>
                    <button onClick={() => setCapPlatform('facebook')} className={cn('px-2 py-1', capPlatform === 'facebook' ? 'bg-violet-600 text-white' : 'text-muted-foreground')}>Facebook</button>
                  </div>
                </div>
                <Button onClick={genCaption} disabled={capLoading} size="sm" className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                  {capLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar caption con IA
                </Button>
                {caption && (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{caption.text}</div>
                    {caption.hashtags.length > 0 && <div className="flex flex-wrap gap-1">{caption.hashtags.map((h, i) => <span key={i} className="text-[10px] text-violet-500">{h}</span>)}</div>}
                    <Button onClick={copyCaption} variant="outline" size="sm" className="w-full gap-2">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} Copiar texto + hashtags</Button>
                  </div>
                )}
              </div>

              {/* Publicar en redes */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5"><Send className="h-4 w-4 text-violet-500" /> Publicar</span>
                  <div className="flex gap-1.5 text-[10px]">
                    <span className={cn('flex items-center gap-0.5', conn?.facebook ? 'text-blue-500' : 'text-muted-foreground/50')}><Facebook className="h-3 w-3" />{conn?.facebook ? 'OK' : '—'}</span>
                    <span className={cn('flex items-center gap-0.5', conn?.instagram ? 'text-pink-500' : 'text-muted-foreground/50')}><Instagram className="h-3 w-3" />{conn?.instagram ? 'OK' : '—'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['facebook', 'instagram'] as const).map(n => (
                    <button key={n} onClick={() => setNetSel(s => ({ ...s, [n]: !s[n] }))} className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border', netSel[n] ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground')}>{n === 'facebook' ? <Facebook className="h-3 w-3" /> : <Instagram className="h-3 w-3" />}{n === 'facebook' ? 'Facebook' : 'Instagram'}</button>
                  ))}
                  {(['feed', 'story'] as const).map(f => (
                    <button key={f} onClick={() => setFmtSel(s => ({ ...s, [f]: !s[f] }))} className={cn('px-2.5 py-1 rounded-full text-xs border', fmtSel[f] ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-border text-muted-foreground')}>{f === 'feed' ? 'Feed' : 'Historia'}</button>
                  ))}
                </div>
                {!conn?.facebook && !conn?.instagram && <p className="text-[10px] text-amber-600 flex items-start gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />Conecta Facebook/Instagram en Configuración para publicar.</p>}
                <Button onClick={publish} disabled={publishing} size="sm" className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publicar ahora</Button>
                {pubResults && (
                  <div className="space-y-1">
                    {pubResults.map((r, i) => (
                      <div key={i} className={cn('flex items-start gap-1.5 text-[11px]', r.status === 'ok' ? 'text-emerald-600' : 'text-red-600')}>
                        {r.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                        <span>{r.network} {r.format}{r.error ? `: ${r.error}` : ' ✓'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Agendar */}
                <div className="pt-2 border-t border-border/60 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Programar publicación</p>
                  <div className="flex gap-2">
                    <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)} className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs" />
                    <Button size="sm" variant="outline" onClick={schedule} disabled={scheduling} className="gap-1.5 text-xs shrink-0">{scheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />} Agendar</Button>
                  </div>
                </div>
              </div>

              {/* Video / Reel */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <span className="text-sm font-semibold flex items-center gap-1.5"><Video className="h-4 w-4 text-violet-500" /> Video (Reel/Historia)</span>
                <Button onClick={makeVideo} disabled={vidLoading} size="sm" variant="outline" className="w-full gap-2">{vidLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</> : <><Video className="h-4 w-4" /> Generar video</>}</Button>
                {video && (
                  <div className="space-y-2">
                    <video src={video} controls className="w-full rounded-lg border border-border" style={{ maxHeight: 360 }} />
                    <a href={video} download className="text-[11px] text-violet-500 flex items-center gap-1"><Download className="h-3 w-3" /> Descargar video</a>
                  </div>
                )}
              </div>

              {/* Descargar todas las plantillas */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Descargar todas</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => FEED_TEMPLATES.forEach(t => download(t.id, 'feed'))}><Download className="h-3.5 w-3.5" /> Feed ×3</Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => STORY_TEMPLATES.forEach(t => download(t.id, 'story'))}><Download className="h-3.5 w-3.5" /> Historias ×3</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
