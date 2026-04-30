'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Wifi,
  WifiOff,
  Phone,
  Clock,
  ArrowRight,
  Zap,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ───
interface WhatsAppState {
  success: boolean
  connected: boolean
  connecting: boolean
  qrCode: string | null
  phone: string | null
  lastActivity: string | null
  socketAlive: boolean
  ghostDetected: boolean
}

// ─── WhatsApp Connections View ───
export function ConnectionsView({
  whatsappPhone,
  summaryInterval,
}: {
  whatsappPhone?: string | null
  summaryInterval?: number
}) {
  const [waState, setWaState] = useState<WhatsAppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pollCount, setPollCount] = useState(0)
  const [qrImgSrc, setQrImgSrc] = useState<string | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // ─── Fetch WhatsApp status ───
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) {
        const data = await res.json()
        setWaState(data)
        setError('')
        setPollCount(c => c + 1)

        // If QR code available, set it as image src
        if (data.qrCode && !data.connected) {
          setQrImgSrc(`data:image/png;base64,${data.qrCode}`)
        } else {
          setQrImgSrc(null)
        }

        // If just connected, refresh after 2s to get phone
        if (data.connected && !whatsappPhone) {
          setTimeout(fetchStatus, 2000)
        }
      } else if (res.status === 401) {
        setError('No autenticado')
      } else {
        setError('Error al consultar estado')
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [whatsappPhone])

  // ─── Connect / start WhatsApp ───
  const handleConnect = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setWaState(prev => prev ? { ...prev, connecting: true } : null)
        // Start polling for QR
        setTimeout(fetchStatus, 2000)
      } else {
        setError('Error al iniciar conexión')
      }
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [fetchStatus])

  // ─── Poll for status updates ───
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 4000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // ─── Auto-connect if not started ───
  useEffect(() => {
    if (waState && !waState.connected && !waState.connecting && !waState.qrCode && !loading && pollCount > 2) {
      handleConnect()
    }
  }, [waState, loading, pollCount, handleConnect])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <QrCode className="w-5 h-5 text-emerald-500" />
          Conexiones
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta tus servicios para que NEXUS AI funcione de forma autónoma
        </p>
      </div>

      {/* WhatsApp Connection Card */}
      <Card className="border-emerald-200 dark:border-emerald-900/50 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Recibe resúmenes y responde mensajes vía WhatsApp
                </p>
              </div>
            </div>
            {waState?.connected ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Conectado
              </Badge>
            ) : waState?.connecting ? (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Conectando
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <WifiOff className="w-3 h-3 mr-1" />
                Desconectado
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Connected state */}
          {waState?.connected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">WhatsApp conectado</span>
                </div>
                {waState.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{waState.phone}</span>
                  </div>
                )}
                {waState.lastActivity && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Última actividad: {new Date(waState.lastActivity).toLocaleString('es-MX')}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 cursor-pointer"
                  onClick={async () => {
                    await fetch('/api/whatsapp/logout', { method: 'POST' })
                    setTimeout(fetchStatus, 2000)
                  }}
                >
                  Desconectar
                </Button>
              </div>
            </motion.div>
          )}

          {/* QR Code display */}
          {qrImgSrc && !waState?.connected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <div className="bg-white rounded-xl p-3 shadow-sm border">
                <img
                  src={qrImgSrc}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Escanea el código QR</p>
                <p className="text-xs text-muted-foreground">
                  Abre WhatsApp &gt; Menú &gt; Dispositivos vinculados &gt; Vincular
                </p>
                <p className="text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  El código se actualiza automáticamente
                </p>
              </div>

              {/* Manual pairing code option */}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground cursor-pointer"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/whatsapp/pairing-code', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ phone: whatsappPhone || '' }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.code) {
                        navigator.clipboard?.writeText(data.code)
                        alert('Código de vinculación: ' + data.code + '\n(Copiado al portapapeles)')
                      }
                    }
                  } catch {}
                }}
              >
                <Copy className="w-3 h-3 mr-1" />
                Usar código de vinculación
              </Button>
            </motion.div>
          )}

          {/* Loading state */}
          {loading && !waState && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Skeleton className="w-56 h-56 rounded-xl" />
              <Skeleton className="h-4 w-32" />
            </div>
          )}

          {/* Connecting state (waiting for QR) */}
          {waState?.connecting && !qrImgSrc && !waState?.connected && (
            <div className="flex flex-col items-center gap-3 py-8">
              <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Generando código QR...</p>
              <p className="text-xs text-muted-foreground/60">
                Esto puede tomar unos segundos
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-destructive/5 rounded-lg p-3 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Connect button (if not connected and not connecting) */}
          {!waState?.connected && !waState?.connecting && !loading && (
            <Button
              onClick={handleConnect}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              <QrCode className="w-4 h-4 mr-2" />
              Conectar WhatsApp
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Features info */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h3 className="text-sm font-medium">Qué puedes hacer con WhatsApp</h3>
          <div className="grid gap-2">
            {[
              { icon: Zap, title: 'Resúmenes automáticos', desc: 'Recibe resúmenes de NEXUS cada 15 minutos' },
              { icon: MessageCircle, title: 'Chat bidireccional', desc: 'Envía mensajes y recibe respuestas de la IA' },
              { icon: Phone, title: 'Notificaciones inteligentes', desc: 'Alertas de tareas, eventos y recordatorios' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Steps to connect */}
      {!waState?.connected && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <h3 className="text-sm font-medium">Cómo conectar</h3>
            <div className="space-y-2">
              {[
                'Haz clic en "Conectar WhatsApp"',
                'Abre WhatsApp en tu teléfono',
                'Ve a Menú → Dispositivos vinculados',
                'Escanea el código QR que aparece',
                '¡Listo! NEXUS podrá enviar y recibir mensajes',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
