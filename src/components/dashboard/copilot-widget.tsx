'use client'

// ═══════════════════════════════════════════════════════════════
// Copiloto IA flotante — botón global que sigue al usuario en cualquier
// vista. Saluda proactivamente (alertas del negocio) y ejecuta acciones
// vía /api/copilot/chat (mismo agente MiniMax). No es un módulo del menú.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, Loader2, X, Wrench, User, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string; steps?: { action: string; summary: string }[] }

const SUGGESTIONS = ['Resúmeme el día', '¿A qué leads les escribo primero?', 'Genera un caption del auto más caro', '¿Qué autos no se han vendido?']
const urlRe = /(https?:\/\/[^\s)]+\.(?:png|jpe?g|webp))/i
const vidRe = /(https?:\/\/[^\s)]+\.mp4)/i

function Rich({ text }: { text: string }) {
  const img = text.match(urlRe)?.[1]; const vid = text.match(vidRe)?.[1]
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
      {vid ? <video src={vid} controls className="rounded-lg border border-border w-full" /> : img ? <img src={img} alt="" className="rounded-lg border border-border w-full" /> : null}
    </div>
  )
}

export function CopilotWidget({ workspaceId, activeView }: { workspaceId?: string; activeView?: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)
  const [proactive, setProactive] = useState<{ message: string; hasAlerts: boolean } | null>(null)
  const [teaser, setTeaser] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [liveSteps, setLiveSteps] = useState<{ action: string; done: boolean }[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const seeded = useRef(false)

  // Oculta el FAB/teaser cuando hay un modal o drawer a pantalla completa
  // (usan `fixed inset-0`) para no tapar sus botones (ej. "Registrar auto").
  useEffect(() => {
    const check = () => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'))
      const blocking = overlays.some(el => {
        // El TOUR GUIADO es un overlay fixed inset-0, pero necesita el FAB
        // VISIBLE (su último paso lo ilumina) — no cuenta como modal.
        if (el.hasAttribute('data-tour-root') || el.closest('[data-tour-root]')) return false
        if (el.offsetParent === null && el.getClientRects().length === 0) return false
        const z = parseInt(getComputedStyle(el).zIndex || '0', 10)
        return z >= 40
      })
      setModalOpen(blocking)
    }
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    return () => obs.disconnect()
  }, [])

  // Carga el saludo/alertas proactivas al montar
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/copilot/chat?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setAvailable(!!d.available)).catch(() => {})
    fetch(`/api/copilot/proactive?workspaceId=${workspaceId}`).then(r => r.json()).then(d => {
      if (d?.message) {
        setProactive({ message: d.message, hasAlerts: !!d.hasAlerts })
        // El globo proactivo se muestra UNA vez por sesión y se auto-oculta a
        // los 15s — antes reaparecía en cada vista tapando contenido (móvil).
        let seen = false
        try { seen = sessionStorage.getItem('vaf-copilot-teaser') === '1' } catch { /* */ }
        if (d.hasAlerts && !seen) {
          const t = setTimeout(() => {
            setTeaser(true)
            try { sessionStorage.setItem('vaf-copilot-teaser', '1') } catch { /* */ }
            setTimeout(() => setTeaser(false), 15000)
          }, 2500)
          return () => clearTimeout(t)
        }
      }
    }).catch(() => {})
  }, [workspaceId])

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading, open])

  const openPanel = useCallback(() => {
    setOpen(true); setTeaser(false)
    if (!seeded.current) { seeded.current = true; setMsgs([{ role: 'assistant', content: proactive?.message || '¡Hola! Soy tu Copiloto. ¿En qué te ayudo? Puedo analizar tu inventario, crear y publicar contenido, agendar, enviar WhatsApp y más.' }]) }
  }, [proactive])

  // Nombres amigables de las acciones para el progreso en vivo
  const stepLabel = (a: string) => ({
    generar_video: 'Generando video', generar_imagen: 'Generando imagen', generar_caption: 'Redactando caption',
    enviar_whatsapp: 'Enviando WhatsApp', enviar_mensajes: 'Enviando mensajes', enviar_media_whatsapp: 'Enviando archivo por WhatsApp',
    buscar_inventario: 'Consultando inventario', analizar_inventario: 'Analizando inventario', briefing: 'Preparando briefing',
    estado_sistema: 'Revisando el sistema', reporte: 'Armando reporte', publicar: 'Publicando en redes', publicar_video: 'Publicando video',
    generar_link_pago: 'Creando link de pago', importar_contactos: 'Importando contactos', importar_inventario: 'Importando inventario',
    simular_cliente: 'Simulando cliente', investigar_web: 'Investigando en internet', crear_agente: 'Creando agente',
    exportar: 'Exportando datos', enviar_telegram: 'Enviando a Telegram',
  } as Record<string, string>)[a] || a.replace(/_/g, ' ')

  const send = async (text?: string) => {
    const content = (text ?? input).trim(); if (!content || loading || !workspaceId) return
    const next = [...msgs, { role: 'user' as const, content }]
    setMsgs(next); setInput(''); setLoading(true); setLiveSteps([])
    const payload = { workspaceId, stream: true, messages: next.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })) }
    try {
      const r = await fetch('/api/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok || !r.body) {
        // Fallback sin streaming
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error')
        setMsgs(m => [...m, { role: 'assistant', content: d.reply || 'Listo.', steps: d.steps }]); return
      }
      const reader = r.body.getReader(); const dec = new TextDecoder()
      let buf = ''; let finished = false
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n'); buf = parts.pop() || ''
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: ')); if (!line) continue
          let ev: { type: string; action?: string; phase?: string; reply?: string; steps?: { action: string; summary: string }[]; error?: string }
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          if (ev.type === 'step' && ev.action) {
            setLiveSteps(s => ev.phase === 'start' ? [...s, { action: ev.action!, done: false }] : s.map(x => x.action === ev.action ? { ...x, done: true } : x))
          } else if (ev.type === 'final') {
            finished = true
            setMsgs(m => [...m, { role: 'assistant', content: ev.reply || 'Listo.', steps: ev.steps }])
          } else if (ev.type === 'error') { finished = true; throw new Error(ev.error || 'Error') }
        }
      }
      if (!finished) throw new Error('La conexión se cortó — intenta de nuevo')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); setMsgs(m => [...m, { role: 'assistant', content: 'Ups, hubo un problema. Intenta de nuevo.' }]) } finally { setLoading(false); setLiveSteps([]) }
  }

  if (!workspaceId) return null

  return (
    <>
      {/* Teaser proactivo */}
      {teaser && !open && !modalOpen && proactive && (
        <div className="fixed z-[60] bottom-40 right-4 sm:right-6 w-[min(86vw,330px)] rounded-2xl bg-background border border-violet-300/50 shadow-2xl p-3 animate-slide-up">
          <button onClick={() => setTeaser(false)} className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4" /></div>
            <p className="text-[12px] leading-snug pr-3">{proactive.message}</p>
          </div>
          <button onClick={openPanel} className="mt-2 w-full text-[12px] font-medium text-violet-600 bg-violet-500/10 rounded-lg py-1.5 hover:bg-violet-500/20">Abrir copiloto →</button>
        </div>
      )}

      {/* Launcher — bottom-24 y más chico: deja LIBRES los botones de acción que
          viven pegados abajo (Agendar cita/Enviar mensaje del expediente); antes
          los tapaba (reporte de Jhon "el botón del copiloto estorba"). */}
      {!open && !modalOpen && (
        <button onClick={openPanel} aria-label="Copiloto IA" data-tour="copilot-fab" className="fixed z-[60] bottom-24 right-4 sm:right-6 h-12 w-12 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30 flex items-center justify-center active:scale-95 transition-transform">
          <Sparkles className="h-5 w-5" />
          {proactive?.hasAlerts && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-background" />}
          <span className="absolute inset-0 rounded-full bg-violet-500/40 animate-ping -z-10" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed z-[60] bottom-4 right-3 sm:right-6 w-[calc(100vw-1.5rem)] max-w-[400px] h-[72vh] max-h-[600px] rounded-2xl bg-background border border-border shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center"><Sparkles className="h-4 w-4" /></div>
              <div><p className="text-sm font-semibold leading-none">Copiloto IA</p><p className="text-[10px] text-muted-foreground mt-0.5">Te ayuda en {activeView ? 'cualquier módulo' : 'todo el sistema'}</p></div>
            </div>
            <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', m.role === 'user' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-violet-500/15 text-violet-500')}>{m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}</div>
                <div className={cn('rounded-2xl px-3 py-2 max-w-[80%]', m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-muted')}>
                  {m.steps && m.steps.length > 0 && (
                    <details className="mb-1 text-[10px] opacity-80"><summary className="cursor-pointer flex items-center gap-1"><Wrench className="h-3 w-3" />{m.steps.length} acción(es)</summary><div className="mt-1 space-y-0.5">{m.steps.map((s, k) => <div key={k} className="border-l-2 border-violet-400/50 pl-1.5">{s.action}</div>)}</div></details>
                  )}
                  {m.role === 'assistant' ? <Rich text={m.content} /> : <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.content}</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center"><Bot className="h-3.5 w-3.5" /></div>
                <div className="rounded-2xl px-3 py-2 bg-muted text-[13px] text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {liveSteps.length ? 'Ejecutando…' : 'Pensando…'}</div>
                  {liveSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] pl-0.5">
                      {s.done ? <span className="text-emerald-500">✓</span> : <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
                      <span className={cn(s.done && 'opacity-70')}>{stepLabel(s.action)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {msgs.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">{SUGGESTIONS.map((s, i) => <button key={i} onClick={() => send(s)} className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:bg-muted">{s}</button>)}</div>
            )}
            <div ref={endRef} />
          </div>

          {!available && <p className="text-[10px] text-amber-600 px-3 pb-1">Requiere configurar MINIMAX_API_KEY.</p>}
          <div className="p-2.5 border-t border-border shrink-0">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }} placeholder="Pídele algo…" disabled={loading || !available} className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-violet-500" />
              <button onClick={() => send()} disabled={loading || !input.trim() || !available} className="h-10 w-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
