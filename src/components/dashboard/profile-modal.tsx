'use client'

// ═══════════════════════════════════════════════════════════════
// Mi Perfil — modal con la información del usuario a detalle:
// datos de la cuenta (nombre editable), rol y workspace, plan,
// Telegram vinculado y últimas sesiones (dispositivo/IP/ubicación).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { User, Mail, Shield, Building2, CreditCard, Send, Monitor, Smartphone, Tablet, MapPin, Pencil, Check, X } from 'lucide-react'

interface ProfileData {
  user: { id: string; name: string | null; email: string; createdAt: string; telegramLinked: boolean }
  membership: { role: string; joinedAt: string } | null
  workspace: { id: string; name: string; plan: string; since: string } | null
  sessions: { id: string; ip: string | null; device: string | null; location: string | null; isActive: boolean; createdAt: string }[]
}

const ROLE_LABEL: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', member: 'Vendedor', viewer: 'Lector' }

export function ProfileModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.user) { setData(d); setNameDraft(d.user.name || '') } }).catch(() => {})
  }, [])
  useEffect(() => { if (open) { setData(null); load() } }, [open, load])

  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim().length < 2) { toast.error('Escribe un nombre válido'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameDraft.trim() }) })
      if (!r.ok) throw new Error()
      toast.success('Nombre actualizado (se reflejará al recargar)')
      setEditing(false); load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const initials = (data?.user.name || data?.user.email || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase()
  const deviceIcon = (d?: string | null) => (d || '').includes('Móvil') ? Smartphone : (d || '').includes('Tablet') ? Tablet : Monitor
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,600px)] sm:max-w-[600px] max-h-[85vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="h-4 w-4 text-emerald-500" /> Mi Perfil</DialogTitle></DialogHeader>
        {!data ? (
          <div className="space-y-3 py-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : (
          <div className="space-y-4">
            {/* Identidad */}
            <div className="flex items-center gap-4 rounded-xl border border-border/60 p-4 bg-gradient-to-br from-emerald-500/5 to-transparent">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xl font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8" autoFocus />
                    <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" disabled={saving} onClick={saveName}><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => { setEditing(false); setNameDraft(data.user.name || '') }}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold truncate">{data.user.name || 'Sin nombre'}</p>
                    <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground shrink-0" title="Editar nombre"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{data.user.email}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Miembro desde {fmt(data.user.createdAt)}</p>
              </div>
            </div>

            {/* Rol, workspace y plan */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Rol</p>
                <p className="text-sm font-semibold mt-1">{ROLE_LABEL[data.membership?.role || ''] || data.membership?.role || '—'}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Plan</p>
                <p className="text-sm font-semibold mt-1 capitalize">{data.workspace?.plan || '—'}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-3 col-span-2">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Espacio de trabajo</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-semibold truncate">{data.workspace?.name || '—'}</p>
                  <span className="text-[11px] text-muted-foreground">desde {fmt(data.workspace?.since)}</span>
                </div>
              </div>
            </div>

            {/* Telegram */}
            <div className="rounded-xl border border-border/60 p-3 flex items-center justify-between">
              <p className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-sky-500" /> Telegram (alertas y briefing)</p>
              {data.user.telegramLinked
                ? <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">Vinculado</Badge>
                : <Badge variant="secondary">Sin vincular</Badge>}
            </div>

            {/* Sesiones recientes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mis sesiones recientes</p>
              {data.sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin registros aún (se registran en cada inicio de sesión).</p>
              ) : (
                <div className="space-y-2">
                  {data.sessions.map((s) => {
                    const DIcon = deviceIcon(s.device)
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                        <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><DIcon className="h-4 w-4 text-muted-foreground" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{s.device || 'Dispositivo'}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {s.ip || 's/IP'}{s.location ? ` · ${s.location}` : ''} · {new Date(s.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={cn('text-[10px] font-medium shrink-0', s.isActive ? 'text-emerald-500' : 'text-muted-foreground')}>{s.isActive ? '● Activa' : 'Cerrada'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> Gestión completa de sesiones y seguridad en ValiGuard → Sesiones.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
