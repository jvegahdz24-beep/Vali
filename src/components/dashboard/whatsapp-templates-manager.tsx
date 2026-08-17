'use client'

// ═══════════════════════════════════════════════════════════════
// Gestor PROFESIONAL de plantillas de WhatsApp (Meta Cloud API).
// - Lista plantillas con su estado (APPROVED / PENDING / REJECTED)
// - Crea plantillas y las envía a revisión de Meta (header/body/footer/botones)
// - Elimina plantillas (en Meta + local)
// - Asigna una plantilla APROBADA a cada ACCIÓN del sistema (mensajes fuera de
//   la ventana de 24h que Meta exige que sean plantillas)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Trash2, RefreshCw, CheckCircle2, Clock, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Tpl { id?: string; name: string; status: string; category: string; language: string; rejected_reason?: string; components?: unknown[] }
type Assignments = Record<string, { name: string; language: string }>

// Acciones del sistema que envían mensajes iniciados por el negocio (necesitan plantilla).
const ACTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'reactivation', label: 'Reactivación de leads fríos', hint: 'Reenganchar contactos inactivos' },
  { key: 'follow_up', label: 'Seguimiento', hint: 'Recordatorio de seguimiento comercial' },
  { key: 'appointment_reminder', label: 'Recordatorio de cita', hint: 'Antes de una cita agendada' },
  { key: 'welcome', label: 'Bienvenida', hint: 'Primer contacto / alta de lead' },
  { key: 'post_sale', label: 'Postventa', hint: 'Después de una venta' },
  { key: 'broadcast', label: 'Campañas / Difusión', hint: 'Envíos masivos fuera de 24h' },
]

const CATEGORIES = [
  { v: 'MARKETING', l: 'Marketing (promociones, novedades)' },
  { v: 'UTILITY', l: 'Utilidad (transaccional, recordatorios)' },
  { v: 'AUTHENTICATION', l: 'Autenticación (códigos)' },
]
const LANGS = [
  { v: 'es_MX', l: 'Español (México)' }, { v: 'es', l: 'Español' }, { v: 'es_ES', l: 'Español (España)' }, { v: 'en_US', l: 'Inglés (EE. UU.)' },
]

function StatusBadge({ s }: { s: string }) {
  const up = (s || '').toUpperCase()
  if (up === 'APPROVED') return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Aprobada</Badge>
  if (up === 'PENDING' || up === 'IN_APPEAL') return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />En revisión</Badge>
  if (up === 'REJECTED') return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px] gap-1"><XCircle className="h-2.5 w-2.5" />Rechazada</Badge>
  return <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 text-[10px]">{up || '—'}</Badge>
}

export function WhatsAppTemplatesManager({ workspaceId }: { workspaceId: string }) {
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [assignments, setAssignments] = useState<Assignments>({})
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'MARKETING', language: 'es_MX', headerText: '', bodyText: '', footerText: '', buttons: '', bodyExample: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, aRes] = await Promise.all([
        fetch(`/api/whatsapp/meta/templates?workspaceId=${workspaceId}`),
        fetch(`/api/whatsapp/meta/template-assignments?workspaceId=${workspaceId}`),
      ])
      const tData = await tRes.json().catch(() => ({}))
      const aData = await aRes.json().catch(() => ({}))
      setTemplates(tData.templates || [])
      setNotConfigured(!!tData.message)
      setAssignments(aData.assignments || {})
    } catch { /* */ } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  const approved = templates.filter(t => (t.status || '').toUpperCase() === 'APPROVED')

  const create = async () => {
    if (!form.name.trim() || !form.bodyText.trim()) { toast.error('Nombre y cuerpo son obligatorios'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/whatsapp/meta/templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, name: form.name, category: form.category, language: form.language,
          headerText: form.headerText || undefined, bodyText: form.bodyText, footerText: form.footerText || undefined,
          buttons: form.buttons ? form.buttons.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          bodyExample: form.bodyExample ? form.bodyExample.split('|').map(s => s.trim()) : undefined,
        }),
      })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Error')
      toast.success(`Plantilla enviada a revisión de Meta (${d.status})`)
      setShowCreate(false)
      setForm({ name: '', category: 'MARKETING', language: 'es_MX', headerText: '', bodyText: '', footerText: '', buttons: '', bodyExample: '' })
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al crear') } finally { setCreating(false) }
  }

  const del = async (t: Tpl) => {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Se borra también en Meta.`)) return
    try {
      const res = await fetch(`/api/whatsapp/meta/templates?workspaceId=${workspaceId}&name=${encodeURIComponent(t.name)}${t.id ? `&metaId=${t.id}` : ''}`, { method: 'DELETE' })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Error')
      toast.success('Plantilla eliminada'); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  const setAssign = (action: string, value: string) => {
    setAssignments(prev => {
      const next = { ...prev }
      if (!value) delete next[action]
      else { const t = approved.find(x => x.name === value); if (t) next[action] = { name: t.name, language: t.language } }
      return next
    })
  }

  const saveAssignments = async () => {
    setSavingAssign(true)
    try {
      const res = await fetch('/api/whatsapp/meta/template-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, assignments }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Error')
      toast.success('Asignaciones guardadas')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al guardar') } finally { setSavingAssign(false) }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10"><FileText className="h-4 w-4 text-emerald-500" /></div>
          <div>
            <p className="text-sm font-semibold">Plantillas de WhatsApp (Meta)</p>
            <p className="text-[11px] text-muted-foreground">Crea, sube a revisión y asigna plantillas para mensajes fuera de la ventana de 24h.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5"><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Sincronizar</Button>
          <Button size="sm" onClick={() => setShowCreate(v => !v)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-3.5 w-3.5" /> Nueva</Button>
        </div>
      </div>

      {notConfigured && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-600">
          Conecta primero WhatsApp Business API (Meta) con su <b>Business Account ID</b> para gestionar plantillas.
        </div>
      )}

      {/* Crear */}
      {showCreate && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-[11px]">Nombre (minúsculas_guionbajo)</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="recordatorio_cita" className="h-8 text-sm font-mono" /></div>
            <div className="space-y-1"><Label className="text-[11px]">Categoría</Label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">{CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-[11px]">Idioma</Label><select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">{LANGS.map(l => <option key={l.v} value={l.v}>{l.l}</option>)}</select></div>
          </div>
          <div className="space-y-1"><Label className="text-[11px]">Encabezado (opcional, máx 60)</Label><Input value={form.headerText} onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))} placeholder="ValiAutoFlow" className="h-8 text-sm" /></div>
          <div className="space-y-1"><Label className="text-[11px]">Cuerpo * — usa {'{{1}}'}, {'{{2}}'} para variables</Label><Textarea rows={3} value={form.bodyText} onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))} placeholder={'Hola {{1}}, te recordamos tu cita el {{2}}.'} className="text-sm" /></div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-[11px]">Ejemplos de variables (separa con |)</Label><Input value={form.bodyExample} onChange={e => setForm(f => ({ ...f, bodyExample: e.target.value }))} placeholder="Juan | 12 de agosto" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-[11px]">Pie (opcional, máx 60)</Label><Input value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="Responde STOP para no recibir más" className="h-8 text-sm" /></div>
          </div>
          <div className="space-y-1"><Label className="text-[11px]">Botones de respuesta rápida (opcional, separa con coma, máx 3)</Label><Input value={form.buttons} onChange={e => setForm(f => ({ ...f, buttons: e.target.value }))} placeholder="Confirmar, Reagendar" className="h-8 text-sm" /></div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button size="sm" onClick={create} disabled={creating} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Enviar a revisión</Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Aún no hay plantillas. Crea una con "Nueva".</p>
      ) : (
        <div className="space-y-1.5">
          {templates.map(t => (
            <div key={`${t.name}_${t.language}`} className="flex items-center gap-2 p-2 rounded-lg border border-border/60 hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium font-mono truncate">{t.name}</span>
                  <StatusBadge s={t.status} />
                  <span className="text-[10px] text-muted-foreground">{t.category} · {t.language}</span>
                </div>
                {(t.status || '').toUpperCase() === 'REJECTED' && t.rejected_reason && <p className="text-[10px] text-red-500 mt-0.5">Motivo: {t.rejected_reason}</p>}
              </div>
              <button onClick={() => del(t)} className="text-red-500 p-1.5 rounded hover:bg-red-500/10 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Asignación por acción */}
      <div className="pt-2 border-t border-border/60 space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> Asignar plantilla por acción</p>
        <p className="text-[11px] text-muted-foreground">Elige qué plantilla APROBADA usa cada acción cuando el mensaje sale fuera de las 24h.</p>
        <div className="space-y-1.5">
          {ACTIONS.map(a => (
            <div key={a.key} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{a.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{a.hint}</p>
              </div>
              <select
                value={assignments[a.key]?.name || ''}
                onChange={e => setAssign(a.key, e.target.value)}
                className="h-8 w-[46%] max-w-[240px] rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">— Sin plantilla —</option>
                {approved.map(t => <option key={`${t.name}_${t.language}`} value={t.name}>{t.name} ({t.language})</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveAssignments} disabled={savingAssign} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">{savingAssign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Guardar asignaciones</Button>
        </div>
        {approved.length === 0 && <p className="text-[10px] text-amber-600 text-center">Necesitas al menos una plantilla APROBADA para asignarla.</p>}
      </div>
    </div>
  )
}
