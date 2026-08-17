'use client'

// ═══ TORRE DE CONTROL: salud de TODOS los tenants (panel de plataforma) ═══
// Semáforo por cliente: WhatsApp conectado, actividad del bot 24h, rezagos,
// IA pausada y estado de pago. Se refresca cada 60s. Si algo cae, el worker
// además manda alerta a Telegram (revisión cada 10 min).

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TenantHealth {
  id: string; name: string; plan: string
  status: 'ok' | 'warn' | 'down' | 'setup'
  waConnected: boolean; connectedPhone: string | null
  iaPaused: boolean; inbound24: number; outbound24: number
  lastInboundAt: string | null; lastOutboundAt: string | null
  followupsRezagados: number; botStuck: boolean; billing: string | null
}

export function HealthTower() {
  const [rows, setRows] = useState<TenantHealth[] | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/health')
      if (!r.ok) { setRows([]); return }
      const j = await r.json()
      setRows(j.tenants || [])
      setUpdatedAt(new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }))
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv) }, [load])

  const down = (rows || []).filter(r => r.status === 'down').length
  const dot = (s: TenantHealth['status']) =>
    s === 'down' ? 'bg-red-500' : s === 'warn' ? 'bg-amber-400' : s === 'ok' ? 'bg-emerald-500' : 'bg-gray-600'
  const ago = (iso: string | null) => {
    if (!iso) return '—'
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    return m < 60 ? `hace ${m}m` : m < 1440 ? `hace ${Math.floor(m / 60)}h` : `hace ${Math.floor(m / 1440)}d`
  }

  return (
    <Card className={cn('bg-gray-900 border-gray-800 mb-8', down > 0 && 'border-red-500/50')}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity className={cn('h-4 w-4', down > 0 ? 'text-red-400' : 'text-emerald-400')} />
          Torre de control — salud de los clientes
          {down > 0 && <Badge className="bg-red-500/20 text-red-300 border-red-500/30">{down} caído(s)</Badge>}
        </CardTitle>
        <button onClick={load} disabled={loading} className="text-[11px] text-gray-400 hover:text-white inline-flex items-center gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> {updatedAt && `act. ${updatedAt}`}
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        {rows === null ? (
          <p className="text-xs text-gray-500 py-4">Cargando salud de los tenants…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">WhatsApp</th>
                  <th className="py-2 pr-3 font-medium text-center">Msjs 24h (in/out)</th>
                  <th className="py-2 pr-3 font-medium">Último cliente</th>
                  <th className="py-2 pr-3 font-medium">Última respuesta</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={cn('border-b border-gray-800/60', t.status === 'down' && 'bg-red-500/5')}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dot(t.status))} />
                        <div>
                          <p className="text-xs font-semibold text-white leading-tight">{t.name}</p>
                          <p className="text-[10px] text-gray-500">{t.plan}{t.billing ? ` · pago: ${t.billing}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {t.connectedPhone
                        ? <span className={t.waConnected ? 'text-emerald-400' : 'text-red-400 font-semibold'}>{t.waConnected ? '🟢 conectado' : '🔴 CAÍDO'} <span className="text-gray-500">· {t.connectedPhone}</span></span>
                        : <span className="text-gray-500">sin vincular</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-center font-mono text-gray-300">{t.inbound24} / {t.outbound24}</td>
                    <td className="py-2.5 pr-3 text-[11px] text-gray-400">{ago(t.lastInboundAt)}</td>
                    <td className="py-2.5 pr-3 text-[11px] text-gray-400">{ago(t.lastOutboundAt)}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {t.botStuck && <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">bot sin responder</Badge>}
                        {t.iaPaused && <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">IA pausada</Badge>}
                        {t.followupsRezagados > 0 && <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{t.followupsRezagados} rezagados</Badge>}
                        {t.status === 'ok' && <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">al día</Badge>}
                        {t.status === 'setup' && <Badge className="bg-gray-500/20 text-gray-400 border-0 text-[10px]">en setup</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-xs text-gray-500 py-6">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[10px] text-gray-500">🔴 caído = WhatsApp vinculado pero desconectado, o bot &gt;2h sin responder al último mensaje entrante. Las caídas también llegan por Telegram (revisión cada 10 min).</p>
      </CardContent>
    </Card>
  )
}
