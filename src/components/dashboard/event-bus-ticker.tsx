'use client'

// ═══════════════════════════════════════════════════════════════
// EVENT BUS EN VIVO — cinta que visualiza el flujo de eventos REALES
// del sistema (arquitectura event-bus) vía SSE (/api/sse/dashboard).
// Cuando llega un evento real (mensaje entrante, cambio de score, agente
// asignado, deal movido, automatización) aparece al frente con su hora.
// Sin workspaceId (o sin eventos aún) muestra las etapas del pipeline
// como leyenda tenue — sin fingir actividad. Compartido (Tablero+Bandeja).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'
import { Clock, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

// Etapas de la arquitectura (leyenda tenue cuando aún no hay eventos reales)
const PIPELINE_STEPS = [
  'lead.created', 'gBrain.analyzed', 'message.received',
  'deal.moved', 'automation.run',
]

// Mapa evento SSE → etiqueta corta mostrada en la cinta
const EVENT_LABEL: Record<string, string> = {
  'message.received': 'message.received',
  'deal.stage_changed': 'deal.moved',
  'automation.triggered': 'automation.run',
}

interface FeedItem { id: number; label: string; at: number }

export function EventBusTicker({ className, onMenuToggle, workspaceId }: { className?: string; onMenuToggle?: () => void; workspaceId?: string }) {
  const [now, setNow] = useState('')
  const [connected, setConnected] = useState(false)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const idRef = useRef(0)

  // Reloj (derecha)
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }))
    tick()
    const clock = setInterval(tick, 30000)
    return () => clearInterval(clock)
  }, [])

  // Conexión SSE a eventos reales del workspace
  useEffect(() => {
    if (!workspaceId) return
    let es: EventSource | null = null
    let stopped = false
    const push = (evt: string) => {
      const label = EVENT_LABEL[evt] || evt
      idRef.current += 1
      const item = { id: idRef.current, label, at: Date.now() }
      setFeed((prev) => [item, ...prev].slice(0, 7))
    }
    try {
      es = new EventSource(`/api/sse/dashboard?workspaceId=${workspaceId}`)
      es.addEventListener('connected', () => { if (!stopped) setConnected(true) })
      for (const evt of Object.keys(EVENT_LABEL)) {
        es.addEventListener(evt, () => { if (!stopped) push(evt) })
      }
      es.onerror = () => { if (!stopped) setConnected(false) }
    } catch { /* SSE no disponible */ }
    return () => { stopped = true; es?.close() }
  }, [workspaceId])

  const showFeed = feed.length > 0
  const newestId = feed[0]?.id

  return (
    <div className={cn(
      'rounded-xl border border-emerald-500/20 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 px-3 py-2 flex items-center gap-3 overflow-x-auto no-scrollbar',
      className
    )}>
      {onMenuToggle && (
        <button onClick={onMenuToggle} className="lg:hidden shrink-0 text-zinc-400 hover:text-white" aria-label="Menú">
          <Menu className="h-4 w-4" />
        </button>
      )}
      <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-emerald-400">
        <span className="relative flex h-2 w-2">
          {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={cn('relative inline-flex rounded-full h-2 w-2', connected ? 'bg-emerald-500' : 'bg-zinc-500')} />
        </span>
        EVENT BUS EN VIVO
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {showFeed ? (
          feed.map((it, i) => (
            <span key={it.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-zinc-600 text-[10px]">←</span>}
              <span className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded transition-all duration-300',
                it.id === newestId ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'text-zinc-500'
              )}>{it.label}</span>
            </span>
          ))
        ) : (
          PIPELINE_STEPS.map((ev, i) => (
            <span key={ev} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-zinc-700 text-[10px]">→</span>}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-zinc-600">{ev}</span>
            </span>
          ))
        )}
      </div>
      <div className="ml-auto shrink-0 flex items-center gap-3 pl-3">
        {now && <span className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-400"><Clock className="h-3 w-3" /> Hoy {now}</span>}
        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
          <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-zinc-500')} /> {connected ? 'En línea' : 'Conectando…'}
        </span>
      </div>
    </div>
  )
}
