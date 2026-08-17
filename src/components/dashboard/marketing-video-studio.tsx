'use client'

// ═══════════════════════════════════════════════════════════════
// Estudio de Video — generación de reels/historias totalmente
// personalizables: brief con IA, escenas, transiciones, Ken Burns, color,
// marca de agua, música (biblioteca + subir), voz (TTS) + guión IA,
// plantillas guardables y guiones reutilizables.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Video, Search, Loader2, Sparkles, Wand2, Music2, Mic, Upload, Download, Save,
  Car, Play, Palette, Film, Trash2, FileText, Volume2, Droplet,
  Facebook, Instagram,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Cat { id: string; name: string; price?: number | null; currency?: string; metadata?: string; imageUrl?: string | null }
interface Track { file: string; label: string; url: string; builtin: boolean }
interface Voice { id: string; label: string; gender: string }
interface SavedScript { id: string; name: string; content: string }
interface Tmpl { id: string; name: string; config: Record<string, unknown> }

const STORY_SCENES = ['historia', 'cobertura', 'editorial']
const TRANSITIONS = [{ v: 'fade', l: 'Desvanecer' }, { v: 'slideleft', l: 'Deslizar' }, { v: 'smoothup', l: 'Subir' }, { v: 'circleopen', l: 'Círculo' }, { v: 'dissolve', l: 'Disolver' }, { v: 'random', l: 'Aleatorio' }]
const KENBURNS = [{ v: 'alternate', l: 'Alternado' }, { v: 'in', l: 'Acercar' }, { v: 'out', l: 'Alejar' }, { v: 'none', l: 'Sin zoom' }]
const TONES = [{ v: 'profesional', l: 'Profesional' }, { v: 'energico', l: 'Enérgico' }, { v: 'lujo', l: 'Lujo' }, { v: 'cercano', l: 'Cercano' }, { v: 'urgente', l: 'Urgente / Oferta' }]
const money = (n?: number | null, c = 'MXN') => n != null ? `$${Number(n).toLocaleString('es-MX')} ${c}` : '—'
const thumb = (v: Cat) => { try { const m = JSON.parse(v.metadata || '{}'); return (m.images?.[0]) || v.imageUrl || null } catch { return v.imageUrl || null } }

export function MarketingVideoStudio({ workspaceId }: { workspaceId: string }) {
  const [cars, setCars] = useState<Cat[]>([])
  const [search, setSearch] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  // config
  const [sceneCount, setSceneCount] = useState(3)
  const [perScene, setPerScene] = useState(3)
  const [transition, setTransition] = useState('fade')
  const [kenBurns, setKenBurns] = useState('alternate')
  const [accent, setAccent] = useState('#10b981')
  const [watermark, setWatermark] = useState(true)
  // music
  const [tracks, setTracks] = useState<Track[]>([])
  const [music, setMusic] = useState<string>('')
  const [musicVolume, setMusicVolume] = useState(0.5)
  const musicRef = useRef<HTMLInputElement>(null)
  // voice + script
  const [voices, setVoices] = useState<Voice[]>([])
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [voiceId, setVoiceId] = useState('Spanish_ConfidentWoman')
  const [voiceSpeed, setVoiceSpeed] = useState(1)
  const [tone, setTone] = useState('profesional')
  const [script, setScript] = useState('')
  const [scriptLoading, setScriptLoading] = useState(false)
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([])
  // brief / templates / output
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [templates, setTemplates] = useState<Tmpl[]>([])
  const [generating, setGenerating] = useState(false)
  const [video, setVideo] = useState<string | null>(null)

  const loadCars = useCallback(async () => {
    try { const r = await fetch(`/api/catalog?workspaceId=${workspaceId}`); const d = await r.json(); const items: Cat[] = Array.isArray(d.items) ? d.items : []; setCars(items); if (items.length && !selId) setSelId(items[0].id) } catch { /* */ }
  }, [workspaceId, selId])
  useEffect(() => { loadCars() }, [loadCars])
  useEffect(() => {
    fetch(`/api/marketing/music?workspaceId=${workspaceId}`).then(r => r.json()).then(d => { setTracks(d.tracks || []); if (d.tracks?.[0] && !music) setMusic(d.tracks[0].file) }).catch(() => {})
    fetch(`/api/marketing/voices?workspaceId=${workspaceId}`).then(r => r.json()).then(d => { setVoices(d.voices || []); setVoiceAvailable(!!d.available) }).catch(() => {})
    fetch(`/api/marketing/scripts?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setSavedScripts(d.scripts || [])).catch(() => {})
    fetch(`/api/marketing/templates?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setTemplates((d.templates || []).filter((t: { kind: string }) => t.kind === 'video'))).catch(() => {})
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return q ? cars.filter(c => c.name.toLowerCase().includes(q)) : cars }, [cars, search])
  const sel = cars.find(c => c.id === selId) || null

  const applyBrief = async () => {
    if (!brief.trim()) return
    setBriefLoading(true)
    try {
      const r = await fetch('/api/marketing/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, text: brief }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      const c = d.config
      setAccent(c.accent); setTransition(c.transition); setTone(c.scriptTone); setWatermark(c.watermark)
      const moodFile = `${c.musicMood}.mp3`; if (tracks.find(t => t.file === moodFile)) setMusic(moodFile)
      toast.success('Estilo aplicado por IA: ' + (c.notes || ''))
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setBriefLoading(false) }
  }

  const genScript = async () => {
    if (!sel) return
    setScriptLoading(true)
    try {
      const r = await fetch('/api/marketing/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, carId: sel.id, tone, durationSec: sceneCount * perScene }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      setScript(d.content); setVoiceOn(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setScriptLoading(false) }
  }

  const saveScript = async () => {
    if (!script.trim() || !sel) return
    try { const r = await fetch('/api/marketing/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, name: `${sel.name} — ${tone}`, content: script, tone, durationSec: sceneCount * perScene }) }); const d = await r.json(); if (r.ok) { setSavedScripts(s => [d.script, ...s]); toast.success('Guión guardado') } } catch { toast.error('Error') }
  }

  const uploadMusic = async (file: File) => {
    const fd = new FormData(); fd.append('workspaceId', workspaceId); fd.append('file', file)
    try { const r = await fetch('/api/marketing/music', { method: 'POST', body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setTracks(d.tracks || []); setMusic(d.file); toast.success('Música subida') } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  const generate = async () => {
    if (!sel) return
    setGenerating(true); setVideo(null)
    try {
      const body = {
        workspaceId, carId: sel.id,
        scenes: STORY_SCENES.slice(0, sceneCount), perScene, transition, kenBurns, accent, watermark,
        music: music || null, musicVolume,
        ...(voiceOn && script.trim() ? { narrationText: script, voiceId, voiceSpeed } : {}),
      }
      const r = await fetch('/api/marketing/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 401) throw new Error('Tu sesión expiró. Recarga la página (F5) e inicia sesión de nuevo.')
      if (!r.ok && !(r.headers.get('content-type') || '').includes('json')) throw new Error('El servidor no respondió correctamente. Recarga la página e inténtalo de nuevo.')
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      // El render corre en segundo plano (evita el timeout del proxy). Consultamos
      // la URL hasta que el video exista (máx ~4 min).
      if (d.pending && d.url) {
        toast.info('Generando video… puede tardar 1-2 minutos ⏳')
        let ready = false
        for (let i = 0; i < 48; i++) {
          await new Promise(res => setTimeout(res, 5000))
          try {
            const ctrl = new AbortController()
            const hr = await fetch(`${d.url}?t=${Date.now()}`, { signal: ctrl.signal, cache: 'no-store' })
            ctrl.abort() // no descargar el video completo, solo el estado
            if (hr.ok) { ready = true; break }
          } catch { /* aún no está listo */ }
        }
        setVideo(d.url)
        if (ready) toast.success('¡Video listo! ✅')
        else toast.info('El video sigue generándose; aparecerá en unos momentos (recarga si no carga).')
      } else {
        setVideo(d.url)
        toast.success(`Video listo (${d.durationSec}s)${d.hasVoice ? ' · con voz' : ''}${d.hasMusic ? ' · con música' : ''}`)
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al generar video') } finally { setGenerating(false) }
  }

  // Publica el video generado en una red (Facebook video / Instagram Reel / TikTok).
  const publishVideoTo = async (network: 'facebook' | 'instagram' | 'tiktok') => {
    if (!video) return
    const label = network === 'facebook' ? 'Facebook' : network === 'instagram' ? 'Instagram' : 'TikTok'
    try {
      const cfg = await fetch(`/api/marketing/config?workspaceId=${workspaceId}`).then(r => r.json()).catch(() => null)
      const connected = cfg?.connected?.[network === 'facebook' ? 'meta' : network]
      if (!connected) {
        if (network === 'tiktok') { toast.info('Conecta TikTok primero…'); window.location.href = `/api/tiktok/connect?workspaceId=${workspaceId}`; return }
        toast.info(`Conecta ${label} en Marketing → Configuración → Conectar con Facebook`); return
      }
      const abs = video.startsWith('http') ? video : `${window.location.origin}${video}`
      toast.info(`Publicando en ${label}…`)
      const r = await fetch('/api/marketing/publish-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, videoUrl: abs, networks: [network], carId: sel?.id }) })
      if (r.status === 401) throw new Error('Tu sesión expiró. Recarga la página (F5) e inicia sesión de nuevo.')
      if (!r.ok && !(r.headers.get('content-type') || '').includes('json')) throw new Error('El servidor no respondió correctamente. Recarga la página e inténtalo de nuevo.')
      const j = await r.json()
      const res = (j.results || [])[0]
      if (res?.status === 'ok') toast.success(`Publicado en ${label} ✅ — aparecerá en tu perfil en unos minutos.`)
      else throw new Error(res?.error || j.error || `No se pudo publicar en ${label}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : `No se pudo publicar en ${label}`) }
  }

  const saveTemplate = async () => {
    const name = prompt('Nombre de la plantilla:'); if (!name) return
    const config = { sceneCount, perScene, transition, kenBurns, accent, watermark, music, musicVolume, voiceOn, voiceId, voiceSpeed, tone }
    try { const r = await fetch('/api/marketing/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, name, kind: 'video', config }) }); const d = await r.json(); if (r.ok) { setTemplates(t => [d.template, ...t]); toast.success('Plantilla guardada') } } catch { toast.error('Error') }
  }
  const loadTemplate = (t: Tmpl) => {
    const c = t.config as Record<string, unknown>
    if (c.sceneCount) setSceneCount(Number(c.sceneCount)); if (c.perScene) setPerScene(Number(c.perScene))
    if (c.transition) setTransition(String(c.transition)); if (c.kenBurns) setKenBurns(String(c.kenBurns))
    if (c.accent) setAccent(String(c.accent)); if (typeof c.watermark === 'boolean') setWatermark(c.watermark)
    if (c.music !== undefined) setMusic(String(c.music || '')); if (c.musicVolume !== undefined) setMusicVolume(Number(c.musicVolume))
    if (typeof c.voiceOn === 'boolean') setVoiceOn(c.voiceOn); if (c.voiceId) setVoiceId(String(c.voiceId)); if (c.voiceSpeed) setVoiceSpeed(Number(c.voiceSpeed)); if (c.tone) setTone(String(c.tone))
    toast.success(`Plantilla "${t.name}" aplicada`)
  }
  const delTemplate = async (id: string) => { try { await fetch(`/api/marketing/templates?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' }); setTemplates(t => t.filter(x => x.id !== id)) } catch { /* */ } }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">{label}</label>{children}</div>
  )

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Autos */}
      <div className="lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col max-h-[35vh] lg:max-h-none">
        <div className="p-3 border-b border-border"><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar auto…" className="pl-8 h-9 text-sm" /></div></div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filtered.map(c => { const t = thumb(c); return (
            <button key={c.id} onClick={() => { setSelId(c.id); setVideo(null) }} className={cn('w-full flex items-center gap-2.5 p-2 rounded-lg text-left', selId === c.id ? 'bg-violet-500/10 ring-1 ring-violet-500/40' : 'hover:bg-muted/60')}>
              <div className="relative h-10 w-13 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0" style={{ width: 52 }}><Car className="h-4 w-4 text-muted-foreground/40" />{t && <img src={t} alt="" className="absolute inset-0 h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />}</div>
              <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{c.name}</p><p className="text-[11px] text-violet-500 font-semibold">{money(c.price, c.currency)}</p></div>
            </button>) })}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
        {!sel ? <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Selecciona un auto.</div> : (
          <div className="grid lg:grid-cols-[1fr_340px] gap-6 max-w-5xl mx-auto">
            {/* Controles */}
            <div className="space-y-4">
              {/* Brief IA */}
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Wand2 className="h-4 w-4 text-violet-500" /> Dile a la IA cómo lo quieres</p>
                <Textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2} placeholder="Ej: estilo de lujo, colores dorados, música elegante, con voz profesional y urgencia de oferta" className="text-sm" />
                <Button size="sm" onClick={applyBrief} disabled={briefLoading} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">{briefLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Aplicar estilo con IA</Button>
              </div>

              {/* Efectos */}
              <div className="rounded-xl border border-border p-4 grid grid-cols-2 gap-3">
                <Field label="Escenas"><select value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{[1, 2, 3].map(n => <option key={n} value={n}>{n} escena{n > 1 ? 's' : ''}</option>)}</select></Field>
                <Field label="Segundos por escena"><select value={perScene} onChange={e => setPerScene(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}s</option>)}</select></Field>
                <Field label="Transición"><select value={transition} onChange={e => setTransition(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{TRANSITIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
                <Field label="Movimiento (Ken Burns)"><select value={kenBurns} onChange={e => setKenBurns(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{KENBURNS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
                <Field label="Color de acento"><div className="flex items-center gap-2"><input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-9 w-12 rounded border border-input bg-background" /><Input value={accent} onChange={e => setAccent(e.target.value)} className="h-9 text-xs font-mono" /></div></Field>
                <Field label="Marca de agua (logo)"><button onClick={() => setWatermark(w => !w)} className={cn('h-9 w-full rounded-md border text-sm', watermark ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-input text-muted-foreground')}><Droplet className="h-3.5 w-3.5 inline mr-1" />{watermark ? 'Con logo' : 'Sin logo'}</button></Field>
              </div>

              {/* Música */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Music2 className="h-4 w-4 text-violet-500" /> Música</p>
                <div className="flex gap-2">
                  <select value={music} onChange={e => setMusic(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Sin música</option>
                    {tracks.map(t => <option key={t.file} value={t.file}>{t.label}{t.builtin ? '' : ' (mía)'}</option>)}
                  </select>
                  <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMusic(f) }} />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => musicRef.current?.click()}><Upload className="h-4 w-4" /> Subir</Button>
                </div>
                {music && <audio src={tracks.find(t => t.file === music)?.url} controls className="w-full h-9" />}
                <Field label={`Volumen música: ${Math.round(musicVolume * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} className="w-full accent-violet-600" /></Field>
              </div>

              {/* Voz + guión */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><Mic className="h-4 w-4 text-violet-500" /> Voz y guión</p>
                  <button onClick={() => setVoiceOn(v => !v)} disabled={!voiceAvailable} className={cn('px-2.5 py-1 rounded-full text-xs border disabled:opacity-50', voiceOn ? 'bg-violet-500/15 border-violet-500/50 text-violet-500' : 'border-input text-muted-foreground')}>{voiceOn ? 'Con voz' : 'Sin voz'}</button>
                </div>
                {!voiceAvailable && <p className="text-[11px] text-amber-600">La voz requiere configurar MINIMAX_API_KEY. Puedes generar el guión igual y activarla después.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tono del guión"><select value={tone} onChange={e => setTone(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{TONES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
                  <Field label="Voz"><select value={voiceId} onChange={e => setVoiceId(e.target.value)} disabled={!voiceAvailable} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">{voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
                </div>
                <Button size="sm" variant="outline" onClick={genScript} disabled={scriptLoading} className="gap-2 w-full">{scriptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar guión con IA</Button>
                <Textarea value={script} onChange={e => setScript(e.target.value)} rows={4} placeholder="El guión de locución aparecerá aquí (editable)…" className="text-sm" />
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="ghost" onClick={saveScript} disabled={!script.trim()} className="gap-1.5 text-xs"><Save className="h-3.5 w-3.5" /> Guardar guión</Button>
                  {savedScripts.length > 0 && <select onChange={e => { const s = savedScripts.find(x => x.id === e.target.value); if (s) setScript(s.content) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[180px]"><option value="">Cargar guardado…</option>{savedScripts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                </div>
                {voiceOn && voiceAvailable && <Field label={`Velocidad voz: ${voiceSpeed.toFixed(2)}x`}><input type="range" min={0.7} max={1.4} step={0.05} value={voiceSpeed} onChange={e => setVoiceSpeed(Number(e.target.value))} className="w-full accent-violet-600" /></Field>}
              </div>
            </div>

            {/* Preview + acciones */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4 space-y-3">
                <Button onClick={generate} disabled={generating} className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando video…</> : <><Film className="h-4 w-4" /> Generar video</>}</Button>
                {generating && <p className="text-[11px] text-muted-foreground text-center">Renderizando escenas, efectos{music ? ', música' : ''}{voiceOn ? ', voz' : ''}… puede tardar ~20-40s.</p>}
                {video ? (
                  <div className="space-y-2">
                    <video key={video} src={video} controls autoPlay loop className="w-full rounded-lg border border-border" style={{ maxHeight: 460 }} />
                    <a href={video} download className="text-[11px] text-violet-500 flex items-center gap-1"><Download className="h-3 w-3" /> Descargar video</a>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => publishVideoTo('facebook')}><Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook</Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => publishVideoTo('instagram')}><Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram</Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => publishVideoTo('tiktok')}>🎵 TikTok</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">Publica el video en la red que quieras (debe estar conectada en Configuración).</p>
                  </div>
                ) : <div className="aspect-[9/16] rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground"><Video className="h-10 w-10 opacity-30" /></div>}
              </div>

              {/* Plantillas */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4 text-violet-500" /> Plantillas</p><Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={saveTemplate}><Save className="h-3.5 w-3.5" /> Guardar actual</Button></div>
                {templates.length === 0 ? <p className="text-[11px] text-muted-foreground">Guarda tu configuración como plantilla para reutilizarla.</p> : (
                  <div className="space-y-1">{templates.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <button onClick={() => loadTemplate(t)} className="flex-1 text-left px-2 py-1.5 rounded hover:bg-muted/60 truncate">{t.name}</button>
                      <button onClick={() => delTemplate(t.id)} className="text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
