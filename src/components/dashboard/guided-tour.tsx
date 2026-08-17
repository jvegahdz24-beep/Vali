'use client'

// ═══════════════════════════════════════════════════════════════
// TOUR GUIADO INTERACTIVO — recorre el panel EN VIVO: oscurece la
// pantalla, ilumina el botón/elemento REAL (spotlight que lo sigue),
// y un globo con flecha explica "este botón sirve para…". Navega solo
// entre módulos (cambia la vista real) y en móvil abre el menú cuando
// el paso apunta a un ítem del sidebar. Sin librerías externas.
// Los objetivos se marcan con atributos data-tour="..." en el JSX real.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ViewType } from './dashboard-layout'

export interface TourStep {
  /** valor del atributo data-tour del elemento real a iluminar */
  target: string
  /** si el paso vive en otra vista, el tour navega ahí primero */
  view?: ViewType
  /** en móvil el elemento está dentro del sidebar → abrir el drawer */
  needsSidebar?: boolean
  title: string
  body: string
}

// ─── EL RECORRIDO (31 paradas + cierre) ────────────────────────
export const TOUR_STEPS: TourStep[] = [
  { target: 'nav-dashboard', view: 'dashboard', needsSidebar: true, title: '¡Bienvenido! Este es tu menú', body: 'Desde esta barra navegas TODO el sistema. Ahora estás en el Tablero — la pantalla de inicio. Te voy a llevar módulo por módulo mostrándote cada botón. Puedes salirte cuando quieras con "Saltar".' },
  { target: 'kpis', view: 'dashboard', title: 'Tus números del día', body: 'Estas 6 tarjetas son tu negocio en vivo: contactos, conversaciones activas, tratos ganados del mes, tasa de conversión, agentes IA trabajando e ingresos del día. TODAS son clicables: tócalas y te llevan al módulo con el detalle.' },
  { target: 'ia-switch', view: 'dashboard', title: 'El interruptor de tu asesor IA', body: 'Aquí apagas o pausas TODO el bot con un toque: "Pausar 1h" o "3h" (se reactiva solo — ideal para juntas o inventario físico) o "Apagar" indefinido. Aunque esté pausado, los mensajes de tus clientes se siguen guardando; no se pierde nada.' },
  { target: 'seguimientos', view: 'dashboard', title: 'Seguimientos automáticos, en vivo', body: 'La máquina que rescata prospectos: cuántos seguimientos hay programados y para cuándo, cuántos esperan tu aprobación en Telegram, y cuántos se enviaron hoy y en la semana. Toca cualquier fila y abre el expediente de ese cliente.' },
  { target: 'aprobaciones', view: 'dashboard', title: 'Aprobaciones — tu candado de pagos', body: 'Con "Exigir aprobación" activado, cuando la IA quiera cobrar o facturar, la acción se DETIENE aquí hasta que tú des el OK. Nadie cobra un peso sin tu autorización.' },
  { target: 'alertas', view: 'dashboard', title: 'Alertas críticas y actividad', body: 'El sistema te dice a quién atender YA: leads calientes a punto de enfriarse, con su score y botón "LLAMAR AHORA". A la derecha, la actividad reciente de todos tus canales. Cada fila abre el expediente completo del cliente.' },
  { target: 'header-search', title: 'Buscador global', body: 'Desde cualquier pantalla: escribe un nombre o teléfono y encuentra contactos y conversaciones al instante. Atajo de teclado: Ctrl+K.' },
  { target: 'header-bell', title: 'Notificaciones', body: 'La campanita te avisa de mensajes nuevos, tratos movidos y contactos creados. Cada notificación es clicable y te lleva EXACTAMENTE a esa conversación o trato. "Ver todas" muestra las últimas 48 horas.' },
  { target: 'nav-inbox', needsSidebar: true, title: 'Módulo: Conversaciones', body: 'Tu WhatsApp completo dentro del sistema (también Instagram, Messenger, Telegram y Web). Ves lo que el bot responde en tiempo real y puedes tomar el control cuando quieras. Vamos a entrar…' },
  { target: 'inbox-buscar', view: 'inbox', title: 'Buscar conversaciones', body: 'Filtra la lista por nombre del contacto o por texto del último mensaje. Dentro de un chat también hay una lupa para buscar entre los mensajes de ESA conversación.' },
  { target: 'inbox-canales', view: 'inbox', title: 'Filtro por canal', body: 'Mira solo los chats de un canal: WhatsApp, Instagram, Messenger, Web o Telegram. Dentro de cada chat encontrarás: el botón IA/Manual (para silenciar al bot y responder tú, o pausarlo 1h/3h/24h), el clip 📎 para mandar fotos y documentos, y el Expediente con todo el historial del cliente.' },
  { target: 'nav-pipeline', needsSidebar: true, title: 'Módulo: Ventas (Pipeline)', body: 'Tu embudo visual de ventas: columnas desde "Lead Nuevo" hasta "Cerrado Ganado". El bot mueve tratos solo, y tú arrastras tarjetas cuando avanza una venta. Entremos…' },
  { target: 'pipeline-nuevo', view: 'pipeline', title: 'Crear un trato', body: 'Con este botón registras una oportunidad a mano: cliente, valor y etapa. Y OJO: al arrastrar una tarjeta a "Cerrado Ganado" el sistema hace todo solo — marca la venta, descuenta la unidad del inventario y etiqueta al contacto como cliente.' },
  { target: 'nav-inventory', needsSidebar: true, title: 'Módulo: Inventario', body: 'IMPORTANTÍSIMO: el bot SOLO ofrece y cotiza lo que esté aquí. Si un auto no está en el inventario, el bot no lo conoce. Vamos a verlo…' },
  { target: 'inv-registrar', view: 'inventory', title: 'Agregar unidades', body: 'Con "Agregar producto" registras un auto con fotos, precio, kilometraje y características. La unidad queda disponible para que el bot la ofrezca al instante.' },
  { target: 'inv-importar', view: 'inventory', title: 'Importar en bloque con IA', body: '¿Tienes 40 autos en un Excel? Pega tu archivo o un enlace de Google Sheets y la IA acomoda las columnas sola (entiende hasta formatos de agencia tipo DMS). También puedes pedírselo al Copiloto: "importa este inventario".' },
  { target: 'nav-calendar', needsSidebar: true, title: 'Módulo: Calendario', body: 'Todas las citas que el bot agenda caen aquí solitas, con recordatorios automáticos por WhatsApp. Puedes crear citas a mano, bloquear días completos (el bot NO agendará esos días) y conectar tu Google Calendar personal.' },
  { target: 'nav-contacts', needsSidebar: true, title: 'Módulo: Contactos', body: 'Tu base de clientes completa: temperatura (caliente/tibio/frío), score, etiquetas, origen del lead y expediente de cada uno. Importa tu lista con un CSV o pidiéndoselo al Copiloto.' },
  { target: 'nav-agents', needsSidebar: true, title: 'Módulo: Agentes IA', body: 'Tus vendedores virtuales. Enciende, apaga o especializa agentes (cotizador, financiamiento, seguimiento…) y mide cuántos mensajes atiende cada uno. En la Biblioteca hay más de 100 "empleados" listos para instalar con un clic.' },
  { target: 'nav-gbrain', needsSidebar: true, title: 'Módulo: gBrain (Memoria)', body: 'El cerebro de tu IA: qué sabe del negocio (horarios, dirección, tono), su catálogo y las lecciones que ha aprendido. Aquí también está el candado de "Exigir aprobación" para seguimientos por Telegram.' },
  { target: 'nav-playground', needsSidebar: true, title: 'Módulo: Playground IA', body: 'Tu simulador: chatea con tu propio bot como si fueras un cliente, SIN enviar nada real. Y en la pestaña "Entrenar" le enseñas: le subes conversaciones, le corriges respuestas y le das lecciones que aplica de inmediato.' },
  { target: 'nav-marketing', needsSidebar: true, title: 'Módulo: Marketing IA', body: 'Crea publicaciones profesionales y VIDEOS comerciales con voz a partir de las fotos de tu inventario, y publícalos en Facebook e Instagram. El piloto automático puede publicar solo en los mejores horarios.' },
  { target: 'nav-automations', needsSidebar: true, title: 'Módulo: Automatizaciones', body: 'Flujos que corren solos 24/7: etiquetar leads nuevos, avisarte de leads calientes, reactivar dormidos… Enciende/apaga cada regla con su switch o pídele al Copiloto: "crea una automatización que…".' },
  { target: 'nav-analytics', needsSidebar: true, title: 'Módulo: Analíticas Live', body: 'Tu negocio en números: embudo de conversión, tasa de cierre, fuentes de leads, rendimiento por agente. Si prefieres no leer gráficas, pídele el resumen al Copiloto: "¿cómo vamos este mes?".' },
  { target: 'nav-meli', needsSidebar: true, title: 'Módulo: Mercado Libre', body: 'Conecta tu cuenta y publica autos del inventario directo en Mercado Libre; responde preguntas y gestiona órdenes sin salir del panel.' },
  { target: 'nav-team', needsSidebar: true, title: 'Módulo: Equipo (Roles)', body: 'Invita a tus vendedores con permisos por rol: el dueño ve todo; un vendedor SOLO ve sus contactos y tratos asignados. Perfecto para crecer el equipo sin perder control.' },
  { target: 'nav-valiguard', needsSidebar: true, title: 'Módulo: ValiGuard', body: 'Seguridad y cumplimiento: cada inicio de sesión queda registrado con IP y ubicación, puedes revocar sesiones, y auditar qué anota la IA de cada cliente (bitácoras y consentimientos).' },
  { target: 'nav-settings', needsSidebar: true, title: 'Módulo: Configuración', body: 'El centro de control: conexión de WhatsApp (QR), Telegram, horarios y datos del negocio, tono del asesor, llaves de voz/imágenes, pagos con Stripe y tu plan. Si algo "no responde", revisa aquí la conexión primero.' },
  { target: 'nav-manual', needsSidebar: true, title: 'Manual de uso', body: 'La guía completa de TODO el sistema con capturas, preguntas frecuentes y el detalle de cada botón. Desde aquí también puedes REPETIR este tour cuando quieras.' },
  { target: 'copilot-fab', view: 'dashboard', title: 'Tu Copiloto IA — el botón más poderoso', body: 'Este botón morado te acompaña en TODAS las pantallas. Pídele lo que sea en español y lo hace de verdad: "ponme al día", "mándale un WhatsApp a Juan", "hazme un video del Versa", "pausa la IA 1 hora", "¿hay pagos por aprobar?". Es el cerebro central del sistema.' },
]

interface GuidedTourProps {
  steps?: TourStep[]
  onClose: () => void
  onNavigate: (v: ViewType) => void
  onSidebar: (open: boolean) => void
}

const TT_W = 340   // ancho estimado del globo (desktop)
const TT_H = 230   // alto estimado del globo

export function GuidedTour({ steps = TOUR_STEPS, onClose, onNavigate, onSidebar }: GuidedTourProps) {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [done, setDone] = useState(false)
  const dirRef = useRef<1 | -1>(1)
  const scrolledRef = useRef(false)
  const total = steps.length
  const step = steps[Math.min(idx, total - 1)]

  const go = (i: number, dir: 1 | -1) => {
    dirRef.current = dir
    if (i >= total) { setDone(true); onSidebar(false); return }
    if (i < 0) return
    setIdx(i)
  }

  // ── Localiza el elemento del paso, navega/abre sidebar y lo SIGUE ──
  useEffect(() => {
    if (done) return
    let alive = true
    setRect(null)
    scrolledRef.current = false
    if (step.view) onNavigate(step.view)
    const isMobile = () => window.innerWidth < 1024
    if (step.needsSidebar && isMobile()) onSidebar(true)
    else if (!step.needsSidebar && isMobile()) onSidebar(false)

    const started = Date.now()
    const tick = () => {
      if (!alive) return
      // Puede haber VARIAS instancias del mismo data-tour (ej. sidebar de
      // escritorio oculto + drawer móvil) — usar la que esté VISIBLE.
      const candidates = Array.from(document.querySelectorAll(`[data-tour="${step.target}"]`)) as HTMLElement[]
      const el = candidates.find((e) => { const rr = e.getBoundingClientRect(); return rr.width > 2 && rr.height > 2 }) || null
      const r = el?.getBoundingClientRect()
      const visible = !!(el && r)
      if (visible && el && r) {
        if (!scrolledRef.current) {
          scrolledRef.current = true
          try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }) } catch { /* */ }
        }
        const r2 = el.getBoundingClientRect()
        setRect({ x: r2.left, y: r2.top, w: r2.width, h: r2.height })
      } else if (Date.now() - started > 8000) {
        // Elemento no disponible (vista sin ese control, móvil, permisos…):
        // se salta el paso con elegancia en la dirección que llevaba el usuario.
        alive = false
        go(idx + dirRef.current, dirRef.current)
        return
      }
      if (alive) timer = window.setTimeout(tick, 220)
    }
    let timer = window.setTimeout(tick, step.view ? 500 : 120)
    return () => { alive = false; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done])

  // ── Teclado: ← → Esc ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (done) return
      if (e.key === 'ArrowRight') go(idx + 1, 1)
      if (e.key === 'ArrowLeft') go(idx - 1, -1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done])

  // ── Posición del globo + flecha ──
  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 640
  let ttStyle: React.CSSProperties = {}
  let arrowStyle: React.CSSProperties | null = null
  if (rect && !isMobileView) {
    const vw = window.innerWidth, vh = window.innerHeight, M = 14
    const cx = rect.x + rect.w / 2
    const clampX = (x: number) => Math.max(10, Math.min(x, vw - TT_W - 10))
    if (rect.y + rect.h + M + TT_H < vh) {
      // abajo
      const left = clampX(cx - TT_W / 2)
      ttStyle = { left, top: rect.y + rect.h + M, width: TT_W }
      arrowStyle = { left: Math.max(14, Math.min(cx - left - 7, TT_W - 28)), top: -7 }
    } else if (rect.y - M - TT_H > 0) {
      // arriba
      const left = clampX(cx - TT_W / 2)
      ttStyle = { left, top: rect.y - M - TT_H, width: TT_W, height: TT_H }
      arrowStyle = { left: Math.max(14, Math.min(cx - left - 7, TT_W - 28)), bottom: -7 }
    } else if (rect.x + rect.w + M + TT_W < vw) {
      // derecha
      const top = Math.max(10, Math.min(rect.y + rect.h / 2 - TT_H / 2, vh - TT_H - 10))
      ttStyle = { left: rect.x + rect.w + M, top, width: TT_W }
      arrowStyle = { left: -7, top: Math.max(14, Math.min(rect.y + rect.h / 2 - top - 7, TT_H - 28)) }
    } else {
      // izquierda
      const top = Math.max(10, Math.min(rect.y + rect.h / 2 - TT_H / 2, vh - TT_H - 10))
      ttStyle = { left: Math.max(10, rect.x - M - TT_W), top, width: TT_W }
      arrowStyle = { right: -7, top: Math.max(14, Math.min(rect.y + rect.h / 2 - top - 7, TT_H - 28)) }
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" data-tour-root="final">
        <div className="bg-card text-foreground rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 text-center animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white flex items-center justify-center mb-4"><PartyPopper className="h-8 w-8" /></div>
          <h2 className="text-xl font-bold mb-1.5">¡Conoces todo el panel! 🚀</h2>
          <p className="text-sm text-muted-foreground mb-4">Tu asesor IA ya vende por ti las 24 horas. Si algo se te olvida: el <b>Manual de uso</b> tiene todo con capturas, y el <b>Copiloto</b> (botón morado) lo hace por ti si se lo pides.</p>
          <Button onClick={onClose} className="bg-violet-600 hover:bg-violet-700 text-white h-10 px-6 font-semibold gap-2 w-full">
            <CheckCircle2 className="h-4 w-4" /> Empezar a vender
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[90]" data-tour-root="active">
      {/* Bloquea clics al fondo mientras dura el tour */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {rect ? (
        <>
          {/* SPOTLIGHT: ilumina el elemento real y oscurece todo lo demás */}
          <div
            className="absolute rounded-xl border-2 border-violet-400 transition-all duration-300 pointer-events-none"
            style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.74), 0 0 24px rgba(167,139,250,0.55)' }}
          />
          {/* pulso animado sobre el elemento */}
          <div className="absolute rounded-xl border-2 border-violet-300/70 animate-ping pointer-events-none" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/74" style={{ background: 'rgba(0,0,0,0.74)' }} />
      )}

      {/* GLOBO con flecha */}
      <div
        className={cn(
          'absolute bg-card text-foreground rounded-xl border border-violet-500/40 shadow-2xl p-4 animate-fade-in',
          isMobileView && 'left-3 right-3 bottom-3 w-auto'
        )}
        style={isMobileView ? {} : (rect ? ttStyle : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: TT_W })}
        data-tour-tooltip
      >
        {arrowStyle && !isMobileView && (
          <div className="absolute h-3.5 w-3.5 rotate-45 bg-card border-violet-500/40" style={{
            ...arrowStyle,
            borderLeftWidth: arrowStyle.top === -7 || arrowStyle.left === -7 ? 1 : 0,
            borderTopWidth: arrowStyle.top === -7 || (arrowStyle as { right?: number }).right === -7 ? 1 : 0,
            borderBottomWidth: (arrowStyle as { bottom?: number }).bottom === -7 || arrowStyle.left === -7 ? 1 : 0,
            borderRightWidth: (arrowStyle as { bottom?: number }).bottom === -7 || (arrowStyle as { right?: number }).right === -7 ? 1 : 0,
          }} />
        )}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-500"><Sparkles className="h-3 w-3" /> Paso {idx + 1} de {total}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} className="text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-full px-2 py-0.5">Saltar</button>
            <button onClick={onClose} aria-label="Cerrar tour" className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <h3 className="text-sm font-bold mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{rect ? step.body : 'Abriendo el módulo…'}</p>
        <div className="h-1 rounded-full bg-muted mb-3 overflow-hidden"><div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => go(idx - 1, -1)} className="h-8 gap-1 text-muted-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Anterior</Button>
          <Button size="sm" onClick={() => go(idx + 1, 1)} className="h-8 gap-1 bg-violet-600 hover:bg-violet-700 text-white" data-tour-next>
            {idx === total - 1 ? <>Terminar <CheckCircle2 className="h-3.5 w-3.5" /></> : <>Siguiente <ChevronRight className="h-3.5 w-3.5" /></>}
          </Button>
        </div>
      </div>
    </div>
  )
}
