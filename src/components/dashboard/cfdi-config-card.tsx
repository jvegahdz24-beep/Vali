'use client'

// ═══════════════════════════════════════════════════════════════
// Configuración del PAC fiscal (Facturama) + factura CFDI automática al cierre.
// Cuando se gana un trato y está activado, se timbra la factura del cliente
// (si tiene RFC). Requiere la cuenta de Facturama del negocio.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CfdiConfigCard({ workspaceId }: { workspaceId: string }) {
  const [configured, setConfigured] = useState(false)
  const [autoCfdi, setAutoCfdi] = useState(false)
  const [form, setForm] = useState({ apiUrl: 'https://api.facturama.mx', user: '', password: '', serie: 'A', lugarExpedicion: '' })
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`)
      if (!r.ok) return
      const d = await r.json()
      const s = JSON.parse(d.workspace?.settings || '{}')
      const c = s.cfdi || {}
      setConfigured(!!(c.provider === 'facturama' && c.apiUrl && c.user && c.password))
      setAutoCfdi(s.autoCfdi === true)
      setForm((f) => ({ ...f, apiUrl: c.apiUrl || f.apiUrl, user: c.user || '', serie: c.serie || 'A', lugarExpedicion: c.lugarExpedicion || '' }))
    } catch { /* */ }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.user.trim() || !form.password.trim()) { toast.error('Faltan usuario y contraseña de Facturama'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cfdi: { provider: 'facturama', ...form } }) })
      if (!r.ok) throw new Error()
      toast.success('PAC (Facturama) conectado ✅')
      setOpen(false); await load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }
  const toggleAuto = async () => {
    const next = !autoCfdi
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoCfdi: next }) })
      if (!r.ok) throw new Error()
      setAutoCfdi(next); toast.success(next ? 'Factura automática al cierre ACTIVADA' : 'Factura automática desactivada')
    } catch { toast.error('No se pudo cambiar') }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-amber-500" /> Facturación CFDI (ERP)</CardTitle>
        {configured
          ? <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">PAC conectado</Badge>
          : <Badge variant="secondary">Sin PAC</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Conecta tu <b>PAC (Facturama)</b> para <b>timbrar facturas CFDI 4.0</b> automáticamente al cerrar una venta. La comisión del vendedor ya se registra sola (Equipo).
        </p>

        {/* Toggle factura automática */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
          <div>
            <p className="text-sm font-medium">Factura automática al ganar el trato</p>
            <p className="text-xs text-muted-foreground">Timbra el CFDI del cliente (si tiene RFC) en cuanto el deal pasa a Ganado.</p>
          </div>
          <button onClick={toggleAuto} disabled={!configured} title={configured ? '' : 'Conecta tu PAC primero'}
            className={cn('relative h-5 w-9 rounded-full shrink-0 transition-colors disabled:opacity-40', autoCfdi ? 'bg-emerald-500' : 'bg-muted')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', autoCfdi ? 'left-4' : 'left-0.5')} />
          </button>
        </div>

        {configured ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Editar credenciales</Button>
          </div>
        ) : (
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setOpen(true)}>Conectar Facturama</Button>
        )}

        {open && (
          <div className="rounded-lg border border-border/60 p-3 grid sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">API URL</Label><Input className="mt-1 h-9" value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} /></div>
            <div><Label className="text-xs">Usuario Facturama *</Label><Input className="mt-1 h-9" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} /></div>
            <div><Label className="text-xs">Contraseña *</Label><Input type="password" className="mt-1 h-9" placeholder={configured ? '•••• (guardada)' : ''} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><Label className="text-xs">Serie</Label><Input className="mt-1 h-9" value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
            <div><Label className="text-xs">Lugar de expedición (CP)</Label><Input className="mt-1 h-9" placeholder="00000" value={form.lugarExpedicion} onChange={(e) => setForm({ ...form, lugarExpedicion: e.target.value })} /></div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">¿No tienes PAC? Crea una cuenta en <b>facturama.mx</b> y usa tus credenciales de API aquí.</p>
      </CardContent>
    </Card>
  )
}
