'use client'

// ═══════════════════════════════════════════════════════════════
// Configuración de Pagos (Stripe del tenant) — "última milla".
// Con esto, cuando el cliente PAGA el link que genera la IA, el trato se marca
// GANADO automáticamente y se dispara comisión + CFDI.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { CreditCard, Copy, Check } from 'lucide-react'

export function PaymentsConfigCard({ workspaceId }: { workspaceId: string }) {
  const [configured, setConfigured] = useState(false)
  const [form, setForm] = useState({ stripeSecretKey: '', stripeWebhookSecret: '' })
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const webhookUrl = `https://valiautoflow.com/api/webhooks/tenant-payment/${workspaceId}`

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`)
      if (!r.ok) return
      const d = await r.json()
      const s = JSON.parse(d.workspace?.settings || '{}')
      const p = s.payments || {}
      setConfigured(!!(p.stripeSecretKey && p.stripeWebhookSecret))
    } catch { /* */ }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.stripeSecretKey.trim() || !form.stripeWebhookSecret.trim()) { toast.error('Faltan la clave secreta y el secreto de webhook'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payments: form }) })
      if (!r.ok) throw new Error()
      toast.success('Pagos (Stripe) conectado ✅')
      setOpen(false); await load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }
  const copy = () => { navigator.clipboard?.writeText(webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-indigo-500" /> Pagos (cierre automático)</CardTitle>
        {configured ? <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">Conectado</Badge> : <Badge variant="secondary">Sin conectar</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Conecta tu <b>Stripe</b> para que, cuando el cliente <b>pague el link</b> que envía la IA, el trato se marque <b>Ganado</b> solo y se disparen la <b>comisión</b> y la <b>factura CFDI</b>. (La "última milla" del cierre.)
        </p>

        <div className="rounded-md bg-muted/40 p-2.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Pega esta URL en tu Stripe (Webhooks)</p>
          <div className="flex items-center gap-2 text-xs">
            <code className="flex-1 truncate bg-background rounded px-1.5 py-0.5">{webhookUrl}</code>
            <button onClick={copy} className="text-muted-foreground hover:text-foreground">{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Evento a suscribir: <b>checkout.session.completed</b></p>
        </div>

        {configured ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Editar credenciales</Button>
        ) : (
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setOpen(true)}>Conectar Stripe</Button>
        )}

        {open && (
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div><Label className="text-xs">Clave secreta de Stripe *</Label><Input type="password" className="mt-1 h-9" placeholder="sk_live_… o sk_test_…" value={form.stripeSecretKey} onChange={(e) => setForm({ ...form, stripeSecretKey: e.target.value })} /></div>
            <div><Label className="text-xs">Secreto del webhook (Signing secret) *</Label><Input type="password" className="mt-1 h-9" placeholder="whsec_…" value={form.stripeWebhookSecret} onChange={(e) => setForm({ ...form, stripeWebhookSecret: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
