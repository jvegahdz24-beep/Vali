'use client'

// ═══════════════════════════════════════════════════════════════
// Aprobaciones pendientes (Verificación/Control). El operador aprueba o
// rechaza acciones críticas (pago/factura) que la IA quiso ejecutar. Al
// aprobar, el backend ejecuta y envía el link al cliente. Interruptor para
// exigir aprobación (settings.requireApproval).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ShieldCheck, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Approval { id: string; type: string; summary: string; status: string; createdAt: string }

export function ApprovalsCard({ workspaceId }: { workspaceId: string }) {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [requireApproval, setRequireApproval] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [savingToggle, setSavingToggle] = useState(false)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/approvals?workspaceId=${workspaceId}&status=pending`)
      if (r.ok) { const j = await r.json(); setApprovals(j.approvals || []) }
      const w = await fetch(`/api/workspaces/${workspaceId}`)
      if (w.ok) { const d = await w.json(); try { const s = JSON.parse(d.workspace?.settings || '{}'); setRequireApproval(s.requireApproval === true) } catch { /* */ } }
    } catch { /* */ }
  }, [workspaceId])
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t) }, [load])

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id)
    try {
      const r = await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error')
      toast.success(action === 'approve' ? (j.status === 'executed' ? 'Aprobado y enviado al cliente ✅' : `Aprobado — ${j.resultNote || j.status}`) : 'Rechazado')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setBusy(null) }
  }
  const toggle = async () => {
    setSavingToggle(true)
    try {
      const next = !requireApproval
      const r = await fetch(`/api/workspaces/${workspaceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requireApproval: next }) })
      if (!r.ok) throw new Error()
      setRequireApproval(next)
      toast.success(next ? 'Aprobación humana ACTIVADA (pagos/facturas requieren tu OK)' : 'Aprobación humana desactivada')
    } catch { toast.error('No se pudo cambiar') } finally { setSavingToggle(false) }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-500" /> Aprobaciones
          {approvals.length > 0 && <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.5">{approvals.length}</span>}
        </CardTitle>
        <button onClick={toggle} disabled={savingToggle} className="flex items-center gap-1.5 text-[11px] shrink-0" title="Exigir aprobación humana para pagos y facturas">
          <span className={cn('relative h-4 w-8 rounded-full transition-colors', requireApproval ? 'bg-emerald-500' : 'bg-muted')}>
            <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', requireApproval ? 'left-4' : 'left-0.5')} />
          </span>
          <span className="text-muted-foreground">Exigir aprobación</span>
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        {approvals.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {requireApproval
              ? 'Sin acciones pendientes. Cuando la IA quiera cobrar o facturar, aparecerá aquí para tu OK antes de ejecutarse.'
              : 'Actívalo para revisar cada pago/factura antes de que la IA los ejecute con el cliente.'}
          </p>
        ) : (
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                <span className="text-lg shrink-0">{a.type === 'payment' ? '💳' : '🧾'}</span>
                <span className="text-xs flex-1 min-w-0 truncate">{a.summary}</span>
                <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shrink-0" disabled={busy === a.id} onClick={() => resolve(a.id, 'approve')}>
                  {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Aprobar
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-red-600 border-red-500/40 hover:bg-red-500/10 shrink-0" disabled={busy === a.id} onClick={() => resolve(a.id, 'reject')}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
