'use client'

// Indicador "desliza →" para tiras con scroll horizontal (KPIs, filtros…).
// Reutilizable en cualquier módulo: envuelve el contenedor con scroll en un
// <div className="relative"> y coloca <SwipeHint scrollRef={ref} /> como hermano.
// Se muestra solo si hay overflow y aún no se ha desplazado; se oculta al
// deslizar o cuando no hay overflow (p. ej. en desktop con grid).

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SwipeHint({ scrollRef, label = 'Desliza', className }: {
  scrollRef: React.RefObject<HTMLElement | null>
  label?: string
  className?: string
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Mostrar mientras quede contenido a la derecha (ignora el offset inicial
    // por padding); se oculta al llegar al final del scroll.
    const check = () => setShow(el.scrollWidth - el.clientWidth - el.scrollLeft > 12)
    // Revisar varias veces: el ancho real se conoce tras el layout/fuentes/imágenes.
    check()
    const raf = requestAnimationFrame(check)
    const timers = [setTimeout(check, 150), setTimeout(check, 500), setTimeout(check, 1200)]
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // ResizeObserver sobre el contenedor Y su contenido (el box propio no cambia
    // aunque crezca el scrollWidth, así que observamos también el primer hijo).
    const ro = new ResizeObserver(check)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      cancelAnimationFrame(raf); timers.forEach(clearTimeout)
      el.removeEventListener('scroll', check); window.removeEventListener('resize', check); ro.disconnect()
    }
  }, [scrollRef])

  return (
    <div className={cn(
      'pointer-events-none absolute right-0 top-0 bottom-0 flex items-center justify-end transition-opacity duration-300 lg:hidden',
      show ? 'opacity-100' : 'opacity-0',
      className,
    )}>
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background via-background/80 to-transparent" />
      <div className="relative mr-1 flex items-center gap-1 rounded-full bg-emerald-600 text-white text-[11px] font-semibold pl-2.5 pr-2 py-1.5 shadow-lg shadow-emerald-500/40 animate-nudge-x">
        {label}
        <span className="flex -space-x-1.5">
          <ChevronRight className="h-3.5 w-3.5" />
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
        </span>
      </div>
    </div>
  )
}
