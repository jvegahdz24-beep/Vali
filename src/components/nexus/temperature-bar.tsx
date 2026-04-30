'use client'

import { motion } from 'framer-motion'
import { Thermometer } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// ─── Color & Label helpers ───
export function getTempColor(value: number): string {
  if (value <= 20) return '#ef4444' // red-500
  if (value <= 40) return '#f97316' // orange-500
  if (value <= 60) return '#eab308' // yellow-500
  if (value <= 80) return '#10b981' // emerald-500
  return '#06b6d4' // cyan-500
}

export function getTempLabel(value: number): string {
  if (value <= 20) return 'Crítico'
  if (value <= 40) return 'Bajo'
  if (value <= 60) return 'Estable'
  if (value <= 80) return 'Bueno'
  return 'Excelente'
}

// ─── Gradient for the bar track ───
const GRADIENT_STOPS = [
  { at: 0, color: '#ef4444' },
  { at: 20, color: '#ef4444' },
  { at: 20, color: '#f97316' },
  { at: 40, color: '#f97316' },
  { at: 40, color: '#eab308' },
  { at: 60, color: '#eab308' },
  { at: 60, color: '#10b981' },
  { at: 80, color: '#10b981' },
  { at: 80, color: '#06b6d4' },
  { at: 100, color: '#06b6d4' },
]

const gradientId = 'temp-gradient'

// ─── Props ───
interface TemperatureBarProps {
  value: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
  showValue?: boolean
  animated?: boolean
  onClick?: () => void
}

// ─── Size configs ───
const SIZE_CONFIG = {
  sm: { height: 'h-1.5', iconSize: 'w-3 h-3', textClass: 'text-[10px]', wrapper: 'items-center gap-1.5' },
  md: { height: 'h-2.5', iconSize: 'w-4 h-4', textClass: 'text-xs', wrapper: 'items-center gap-2' },
  lg: { height: 'h-3.5', iconSize: 'w-5 h-5', textClass: 'text-sm', wrapper: 'items-center gap-3' },
}

// ─── Component ───
export function TemperatureBar({
  value,
  label,
  size = 'md',
  showValue = false,
  animated = true,
  onClick,
}: TemperatureBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const color = getTempColor(clamped)
  const textLabel = label || getTempLabel(clamped)
  const config = SIZE_CONFIG[size]

  const bar = (
    <div
      className={`flex ${config.wrapper} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <Thermometer className={`${config.iconSize} flex-shrink-0 transition-colors duration-500`} style={{ color }} />

      <div className="flex-1 min-w-0">
        <div className={`relative w-full rounded-full bg-muted/60 overflow-hidden ${config.height}`}>
          {/* Background gradient track */}
          <div className="absolute inset-0">
            <svg width="100%" height="100%" preserveAspectRatio="none" className="block">
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  {GRADIENT_STOPS.map((stop, i) => (
                    <stop key={i} offset={`${stop.at}%`} stopColor={stop.color} />
                  ))}
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill={`url(#${gradientId})`} opacity={0.2} />
            </svg>
          </div>

          {/* Animated fill */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: color }}
            initial={animated ? { width: 0 } : { width: `${clamped}%` }}
            animate={{ width: `${clamped}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Pulse on value change */}
          {animated && (
            <motion.div
              key={clamped}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: color }}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          )}
        </div>
      </div>

      <span className={`${config.textClass} font-medium flex-shrink-0 tabular-nums min-w-[3ch] text-right transition-colors duration-500`} style={{ color }}>
        {showValue ? clamped : ''}
      </span>

      {textLabel && size !== 'sm' && (
        <span className={`${config.textClass} font-medium flex-shrink-0 transition-colors duration-500`} style={{ color }}>
          {textLabel}
        </span>
      )}
    </div>
  )

  if (size === 'sm') return bar

  // md & lg: wrap in glass card + tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`rounded-xl border border-border/40 bg-background/60 backdrop-blur-md ${
            size === 'lg' ? 'p-4' : 'p-2.5'
          } transition-all hover:border-border/60`}
          onClick={onClick}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
        >
          {bar}
          {size === 'lg' && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">Temperatura vital</span>
              <span className="text-lg font-bold tabular-nums" style={{ color }}>
                {clamped}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">/100</span>
              </span>
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Temperatura: {clamped} — {textLabel}</p>
        {onClick && <p className="text-muted-foreground text-[10px]">Clic para actualizar</p>}
      </TooltipContent>
    </Tooltip>
  )
}
