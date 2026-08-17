'use client'

// ═══════════════════════════════════════════════════════════════
// Nueva Cotización (compartido: Tablero y Bandeja) — contacto +
// producto del inventario → mensaje autogenerado editable → se
// envía por WhatsApp YA (vía /api/broadcast immediate).
// initialContactId preselecciona al cliente (ej. desde el chat).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { FileText, Loader2, Send } from 'lucide-react'

interface PickContact { id: string; firstName: string; lastName: string | null; phone: string | null }
interface PickItem { id: string; name: string; price: number | null; currency: string | null }

export function QuoteModal({ open, onOpenChange, workspaceId, initialContactId }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string; initialContactId?: string }) {
  const [contacts, setContacts] = useState<PickContact[]>([])
  const [items, setItems] = useState<PickItem[]>([])
  const [contactId, setContactId] = useState('')
  const [itemId, setItemId] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [edited, setEdited] = useState(false)

  useEffect(() => {
    if (!open || !workspaceId) return
    setContactId(initialContactId || ''); setItemId(''); setMessage(''); setEdited(false)
    fetch(`/api/contacts?workspaceId=${workspaceId}&limit=100&sortBy=lastMessageAt&sortOrder=desc`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContacts(((d?.items || d?.contacts || []) as PickContact[]).filter((c) => c.phone)))
      .catch(() => setContacts([]))
    fetch(`/api/catalog?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(((d?.items || []) as PickItem[])))
      .catch(() => setItems([]))
  }, [open, workspaceId, initialContactId])

  // Autogenera el texto de la cotización al elegir contacto+producto (editable)
  useEffect(() => {
    if (!contactId || !itemId || edited) return
    const c = contacts.find((x) => x.id === contactId)
    const it = items.find((x) => x.id === itemId)
    if (!c || !it) return
    const precio = it.price != null ? `$${Number(it.price).toLocaleString('es-MX')} ${it.currency || 'MXN'}` : 'precio a consultar'
    setMessage(`Hola ${c.firstName} 👋 Te comparto la cotización que me pediste:\n\n🚗 ${it.name}\n💰 Precio: ${precio}\n✅ Financiamiento disponible\n\n¿Te gustaría agendar una visita para verlo? Quedo al pendiente.`)
  }, [contactId, itemId, contacts, items, edited])

  const send = async () => {
    if (!contactId || !message.trim()) { toast.error('Elige el contacto y revisa el mensaje'); return }
    setSending(true)
    try {
      const r = await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, contactIds: [contactId], message, immediate: true }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'No se pudo enviar')
      toast.success('Cotización enviada por WhatsApp ✅')
      onOpenChange(false)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al enviar') } finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,600px)] sm:max-w-[600px] max-h-[88vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-violet-500" /> Nueva Cotización</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Cliente (con WhatsApp)</Label>
            <Select value={contactId} onValueChange={(v) => { setContactId(v); setEdited(false) }}>
              <SelectTrigger><SelectValue placeholder="Elige el cliente…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{`${c.firstName} ${c.lastName || ''}`.trim()} · {c.phone}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Producto del inventario</Label>
            <Select value={itemId} onValueChange={(v) => { setItemId(v); setEdited(false) }}>
              <SelectTrigger><SelectValue placeholder="Elige el producto…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}{it.price != null ? ` — $${Number(it.price).toLocaleString('es-MX')}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Mensaje (se genera solo; puedes editarlo)</Label>
            <Textarea rows={7} value={message} onChange={(e) => { setMessage(e.target.value); setEdited(true) }} placeholder="Elige cliente y producto para generar la cotización…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5" disabled={sending || !contactId || !message.trim()} onClick={send}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar por WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
