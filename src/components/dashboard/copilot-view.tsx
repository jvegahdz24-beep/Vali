'use client'

// ═══════════════════════════════════════════════════════════════
// Copiloto IA — chat conectado a MiniMax que opera el negocio: pídele
// análisis de inventario, marketing, publicar, agendar, consejos, etc.
// y lo ejecuta con las herramientas del sistema. No toca código.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Loader2, Wrench, User, Bot, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string; steps?: { action: string; summary: string }[] }

const SUGGESTIONS = [
  '¿Cómo está mi inventario?',
  '¿Qué autos llevan más tiempo sin venderse?',
  'Dame consejos para vender más',
  'Genera un caption del auto más caro',
  'Genera un video del Porsche con voz',
  '¿Cuáles son mis leads más calientes?',
]

const urlRe = /(https?:\/\/[^\s)]+\.(?:png|jpe?g|webp))/i
const vidRe = /(https?:\/\/[^\s)]+\.mp4)/i

function Rich({ text }: { text: string }) {
  const img = text.match(urlRe)?.[1]
  const vid = text.match(vidRe)?.[1]
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      {vid ? <video src={vid} controls className="rounded-lg border border-border max-w-[260px]" /> : img ? <img src={img} alt="" className="rounded-lg border border-border max-w-[260px]" /> : null}
    </div>
  )
}

export function CopilotView({ workspaceId }: { workspaceId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: '¡Hola! Soy tu Copiloto. Puedo analizar tu inventario, crear y publicar contenido, agendar, darte consejos de venta y más. ¿Qué necesitas hoy?' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch(`/api/copilot/chat?workspaceId=${workspaceId}`).then(r => r.json()).then(d => setAvailable(!!d.available)).catch(() => setAvailable(false)) }, [workspaceId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const next = [...msgs, { role: 'user' as const, content }]
    setMsgs(next); setInput(''); setLoading(true)
    try {
      const r = await fetch('/api/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, messages: next.map(m => ({ role: m.role, content: m.content })) }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setMsgs(m => [...m, { role: 'assistant', content: d.reply, steps: d.steps }])
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); setMsgs(m => [...m, { role: 'assistant', content: 'Ups, hubo un problema. Intenta de nuevo.' }]) } finally { setLoading(false) }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background/80">
        <div className="p-2 rounded-xl bg-violet-500/10"><Sparkles className="h-5 w-5 text-violet-400" /></div>
        <div>
          <h1 className="text-lg font-semibold">Copiloto IA</h1>
          <p className="text-xs text-muted-foreground">Tu asistente para operar el lote: inventario, marketing, ventas y alertas</p>
        </div>
      </div>

      {available === false && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-300/50 bg-amber-50/60 dark:bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> El Copiloto requiere configurar la API de MiniMax (MINIMAX_API_KEY).
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex gap-3 max-w-3xl', m.role === 'user' ? 'ml-auto flex-row-reverse' : '')}>
            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', m.role === 'user' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-violet-500/15 text-violet-500')}>{m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
            <div className={cn('rounded-2xl px-4 py-2.5', m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-muted')}>
              {m.steps && m.steps.length > 0 && (
                <details className="mb-1.5 text-[11px] opacity-80">
                  <summary className="cursor-pointer flex items-center gap-1"><Wrench className="h-3 w-3" /> {m.steps.length} acción(es) ejecutada(s)</summary>
                  <div className="mt-1 space-y-1">{m.steps.map((s, k) => <div key={k} className="border-l-2 border-violet-400/50 pl-2"><b>{s.action}</b>: {s.summary.slice(0, 160)}</div>)}</div>
                </details>
              )}
              {m.role === 'assistant' ? <Rich text={m.content} /> : <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>}
            </div>
          </div>
        ))}
        {loading && <div className="flex gap-3"><div className="h-8 w-8 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center"><Bot className="h-4 w-4" /></div><div className="rounded-2xl px-4 py-2.5 bg-muted flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Pensando y ejecutando…</div></div>}
        <div ref={endRef} />
      </div>

      {msgs.length <= 1 && (
        <div className="px-6 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, i) => <button key={i} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors">{s}</button>)}
        </div>
      )}

      <div className="p-4 border-t border-border">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Pídele algo a tu copiloto…" disabled={loading || available === false} className="flex-1 h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-violet-500" />
          <Button onClick={() => send()} disabled={loading || !input.trim() || available === false} className="h-11 px-4 gap-2 bg-violet-600 hover:bg-violet-700 text-white">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </div>
      </div>
    </div>
  )
}
