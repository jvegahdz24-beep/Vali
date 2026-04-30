'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { WhatsAppLog } from './types'

// ─── Props ───
interface WhatsAppPanelProps {
  isConnected?: boolean
  whatsappPhone?: string
  summaryInterval?: number
  lastSummarySent?: string
  logs?: WhatsAppLog[]
  onSendNow?: () => void
}

// ─── Status helpers ───
function getStatusIcon(status: string) {
  switch (status) {
    case 'sent':
    case 'delivered':
      return <CheckCircle2 className="w-3 h-3 text-emerald-500" />
    case 'failed':
      return <XCircle className="w-3 h-3 text-red-500" />
    case 'pending':
      return <Clock className="w-3 h-3 text-amber-500" />
    default:
      return <AlertCircle className="w-3 h-3 text-muted-foreground" />
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'sent':
      return <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Enviado</Badge>
    case 'delivered':
      return <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Entregado</Badge>
    case 'failed':
      return <Badge variant="secondary" className="text-[10px] h-5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Fallido</Badge>
    case 'pending':
      return <Badge variant="secondary" className="text-[10px] h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pendiente</Badge>
    default:
      return <Badge variant="secondary" className="text-[10px] h-5">{status}</Badge>
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'summary':
      return <Badge variant="outline" className="text-[10px] h-5 border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400">Resumen</Badge>
    case 'reminder':
      return <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">Recordatorio</Badge>
    case 'alert':
      return <Badge variant="outline" className="text-[10px] h-5 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">Alerta</Badge>
    default:
      return <Badge variant="outline" className="text-[10px] h-5">{type}</Badge>
  }
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHr < 24) return `Hace ${diffHr}h`
  return `Hace ${diffDay}d`
}

// ─── Countdown hook ───
function useCountdown(intervalMin: number, lastSent?: string) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const intervalMs = intervalMin * 60 * 1000
    const last = lastSent ? new Date(lastSent).getTime() : Date.now() - intervalMs + 60000

    const calc = () => {
      const remaining = Math.max(0, last + intervalMs - Date.now())
      if (remaining <= 0) {
        setCountdown('¡Listo!')
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }

    calc()
    const timer = setInterval(calc, 1000)
    return () => clearInterval(timer)
  }, [intervalMin, lastSent])

  return countdown
}

// ─── Component ───
export function WhatsAppPanel({
  isConnected = true,
  whatsappPhone = '',
  summaryInterval = 30,
  lastSummarySent,
  logs = [],
  onSendNow,
}: WhatsAppPanelProps) {
  const countdown = useCountdown(summaryInterval, lastSummarySent)
  const [sending, setSending] = useState(false)

  const handleSendNow = useCallback(async () => {
    setSending(true)
    try {
      await onSendNow?.()
    } finally {
      setTimeout(() => setSending(false), 1500)
    }
  }, [onSendNow])

  const lastLog = logs[0]
  const displayLogs = logs.slice(0, 10)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Status card */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="w-4 h-4 text-emerald-500" />
            WhatsApp Auto-Resumen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Conectado</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">Desconectado</span>
                </>
              )}
            </div>
            <Badge variant="secondary" className="text-[10px] h-5">
              {whatsappPhone || '+52 ---'}
            </Badge>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground">Próximo resumen</p>
                <p className="text-sm font-semibold tabular-nums font-mono">{countdown}</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleSendNow}
              disabled={!isConnected || sending}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 cursor-pointer"
            >
              {sending ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Enviar ahora
            </Button>
          </div>

          {/* Interval info */}
          <p className="text-[10px] text-muted-foreground text-center">
            Intervalo: cada {summaryInterval} min · {displayLogs.length} resúmenes enviados
          </p>
        </CardContent>
      </Card>

      {/* Last summary preview */}
      {lastLog && (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground">Último resumen</CardTitle>
              <span className="text-[10px] text-muted-foreground">{formatTimeAgo(lastLog.createdAt)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2">
              {getStatusIcon(lastLog.status)}
              <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line line-clamp-6">
                {lastLog.message}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History log */}
      {displayLogs.length > 0 && (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Historial de resúmenes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-72">
              <div className="px-4 pb-3">
                {displayLogs.map((log, i) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                  >
                    {i > 0 && <Separator className="my-2 opacity-50" />}
                    <div className="flex items-start gap-2.5">
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        {getStatusIcon(log.status)}
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(log.createdAt)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {getTypeBadge(log.type)}
                          {getStatusBadge(log.status)}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {displayLogs.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center">
          <WifiOff className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Sin historial de resúmenes</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Los resúmenes enviados aparecerán aquí
          </p>
        </div>
      )}
    </motion.div>
  )
}
