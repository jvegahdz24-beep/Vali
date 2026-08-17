'use client'

// ═══════════════════════════════════════════════════════════════
// Inventario de Autos — UI profesional: métricas animadas, tarjetas
// con imagen, esqueletos de carga, animaciones de entrada, vista
// tarjetas/tabla, filtros, multi-foto, exportación e importación IA.
// Usa /api/catalog (CatalogItem); campos automotrices en metadata.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { EventBusTicker } from '@/components/dashboard/event-bus-ticker'
import {
  Car, Plus, Pencil, Trash2, Loader2, X, Search, Upload, Download, LayoutGrid,
  Table2, DollarSign, CheckCircle2, Tag, Clock, ImagePlus, Calendar, Gauge,
  Cog, Fuel, MapPin, Boxes, Sparkles, PackageOpen, ChevronDown, RefreshCw, MoreVertical,
  Settings2, Eye, EyeOff, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { InventoryImportModal } from './inventory-import-modal'
import { SwipeHint } from '@/components/ui/swipe-hint'
import { TRANSMISIONES, COMBUSTIBLES, TRACCIONES, PUERTAS, YEARS, CARROCERIAS, TIPOS_FACTURA, NUM_DUENOS } from '@/lib/inventory-options'
import { BUILTIN_STATUSES, type StatusDef } from '@/lib/inventory-visibility'

interface VehicleMeta {
  marca?: string; modelo?: string; year?: string; version?: string; vin?: string; placas?: string
  colorExterior?: string; colorInterior?: string; color?: string; km?: string
  transmision?: string; combustible?: string; motor?: string; traccion?: string; puertas?: string
  carroceria?: string; condicion?: string; tipoFactura?: string; numDuenos?: string
  ubicacion?: string; sku?: string; status?: string; images?: string[]
  extra?: { etiqueta: string; valor: string }[]
}
interface Vehicle {
  id: string; name: string; description?: string | null; price?: number | null; currency?: string
  category?: string | null; stock?: number | null; isActive: boolean; imageUrl?: string | null; metadata?: string
  createdAt?: string
}
interface FormState {
  id?: string; name: string; marca: string; modelo: string; year: string; version: string
  vin: string; placas: string; colorExterior: string; colorInterior: string; km: string
  transmision: string; combustible: string; motor: string; traccion: string; puertas: string
  carroceria: string; tipoFactura: string; numDuenos: string
  ubicacion: string; sku: string; price: string; category: string; status: string; stock: string
  description: string; isActive: boolean; images: string[]
}

const EMPTY_FORM: FormState = {
  name: '', marca: '', modelo: '', year: '', version: '', vin: '', placas: '',
  colorExterior: '', colorInterior: '', km: '', transmision: '', combustible: '', motor: '',
  traccion: '', puertas: '', carroceria: '', tipoFactura: '', numDuenos: '', ubicacion: '', sku: '', price: '', category: 'Nuevo',
  status: 'disponible', stock: '1', description: '', isActive: true, images: [],
}

// Paleta para elegir color de un estatus personalizado.
const STATUS_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

// Roles del panel que pueden restringirse a ver un estatus (Dueño/Admin ven todo).
const RESTRICTABLE_ROLES: { key: string; label: string }[] = [
  { key: 'member', label: 'Vendedor' },
  { key: 'viewer', label: 'Sólo lectura' },
]

// Badge de estatus (funciona para los de fábrica y los personalizados: usa el
// color hex de la definición, así no depende de clases estáticas de Tailwind).
function StatusBadge({ def, className, size = 'sm' }: { def: StatusDef; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold', size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]', className)}
      style={{ backgroundColor: def.color, color: '#fff' }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/85" />{def.label}
    </span>
  )
}

function parseMeta(raw?: string): VehicleMeta { if (!raw) return {}; try { return JSON.parse(raw) as VehicleMeta } catch { return {} } }
const money = (n?: number | null) => n != null ? `$${Number(n).toLocaleString('es-MX')}` : '—'


// ── Esqueleto de tarjeta (carga) ──
function CardSkeleton({ i }: { i: number }) {
  return (
    <div className="rounded-2xl border border-border/60 overflow-hidden animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="h-40 skeleton-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 rounded skeleton-shimmer" />
        <div className="h-6 w-1/3 rounded skeleton-shimmer" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, k) => <div key={k} className="h-3 rounded skeleton-shimmer" />)}
        </div>
      </div>
    </div>
  )
}

// ── Gestor de estatus personalizados (crear/editar/borrar + visibilidad) ──
function localSlug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

function StatusManagerModal({ workspaceId, statuses, onClose, onSaved }: {
  workspaceId: string; statuses: StatusDef[]; onClose: () => void; onSaved: (next: StatusDef[]) => void
}) {
  const builtins = useMemo(() => statuses.filter((s) => s.builtin), [statuses])
  const [custom, setCustom] = useState<StatusDef[]>(() => statuses.filter((s) => !s.builtin).map((s) => ({ ...s, roles: [...(s.roles || [])] })))
  const [nLabel, setNLabel] = useState('')
  const [nColor, setNColor] = useState(STATUS_COLORS[3])
  const [nVisible, setNVisible] = useState(true)
  const [nRoles, setNRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleRole = (roles: string[], role: string) => roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]

  const addStatus = () => {
    const label = nLabel.trim()
    if (!label) { toast.error('Ponle un nombre al estatus'); return }
    const key = localSlug(label)
    if (!key) { toast.error('Ese nombre no es válido'); return }
    if ([...builtins, ...custom].some((s) => s.key === key)) { toast.error('Ya existe un estatus con ese nombre'); return }
    setCustom((c) => [...c, { key, label, color: nColor, visibleToClient: nVisible, roles: nRoles }])
    setNLabel(''); setNColor(STATUS_COLORS[(custom.length + 4) % STATUS_COLORS.length]); setNVisible(true); setNRoles([])
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/inventory/statuses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, statuses: custom }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onSaved(Array.isArray(data.statuses) && data.statuses.length ? data.statuses : [...builtins, ...custom])
      toast.success('Estatus guardados')
      onClose()
    } catch { toast.error('No se pudieron guardar los estatus') } finally { setSaving(false) }
  }

  const RolePicker = ({ roles, onChange }: { roles: string[]; onChange: (r: string[]) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {RESTRICTABLE_ROLES.map((r) => {
        const on = roles.includes(r.key)
        return (
          <button key={r.key} type="button" onClick={() => onChange(toggleRole(roles, r.key))}
            className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors', on ? 'bg-emerald-500/15 border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'border-input text-muted-foreground hover:border-emerald-300')}>
            {r.label}
          </button>
        )
      })}
      <span className="text-[10px] text-muted-foreground self-center">{roles.length === 0 ? '· lo ve todo el equipo' : '· solo Dueño/Admin + lo marcado'}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="w-[min(96vw,600px)] max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-xl p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold flex items-center gap-2"><Settings2 className="h-5 w-5 text-emerald-600" /> Estatus del inventario</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Crea tus propios estatus (ej. “En tránsito”, “En taller”, “Reservado web”). Elige el color, si el <b>cliente lo puede ver</b> (si no, el bot no ofrece ese auto) y <b>quién de tu equipo lo ve</b> en el panel.</p>

        {/* De fábrica */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">De fábrica</p>
          <div className="flex flex-wrap gap-2">
            {builtins.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5" title={s.visibleToClient ? 'El cliente lo ve' : 'Oculto al cliente'}>
                <StatusBadge def={s} />
                {s.visibleToClient ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
            ))}
          </div>
        </div>

        {/* Personalizados */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tus estatus</p>
          {custom.length === 0 && <p className="text-xs text-muted-foreground italic">Aún no tienes estatus personalizados.</p>}
          <div className="space-y-2">
            {custom.map((s, i) => (
              <div key={s.key} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <StatusBadge def={s} />
                  <div className="ml-auto flex items-center gap-1">
                    {STATUS_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setCustom((arr) => arr.map((x, k) => k === i ? { ...x, color: c } : x))}
                        className={cn('h-4 w-4 rounded-full border', s.color === c ? 'ring-2 ring-offset-1 ring-foreground/40' : 'border-white/40')} style={{ backgroundColor: c }} aria-label="color" />
                    ))}
                    <button type="button" onClick={() => setCustom((arr) => arr.filter((_, k) => k !== i))} className="ml-1 h-7 w-7 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={s.visibleToClient} onChange={(e) => setCustom((arr) => arr.map((x, k) => k === i ? { ...x, visibleToClient: e.target.checked } : x))} className="accent-emerald-600" />
                  El cliente lo puede ver (el bot ofrece estos autos)
                </label>
                <div className="flex items-start gap-2 text-xs">
                  <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <RolePicker roles={s.roles} onChange={(r) => setCustom((arr) => arr.map((x, k) => k === i ? { ...x, roles: r } : x))} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agregar nuevo */}
        <div className="rounded-xl border-2 border-dashed border-border p-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Nuevo estatus</p>
          <div className="flex items-center gap-2">
            <Input value={nLabel} onChange={(e) => setNLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }} placeholder="Nombre (ej. En tránsito)" className="h-9 flex-1" maxLength={30} />
            <div className="flex items-center gap-1">
              {STATUS_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setNColor(c)} className={cn('h-5 w-5 rounded-full border', nColor === c ? 'ring-2 ring-offset-1 ring-foreground/40' : 'border-white/40')} style={{ backgroundColor: c }} aria-label="color" />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={nVisible} onChange={(e) => setNVisible(e.target.checked)} className="accent-emerald-600" />
            El cliente lo puede ver (el bot ofrece estos autos)
          </label>
          <div className="flex items-start gap-2 text-xs">
            <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <RolePicker roles={nRoles} onChange={setNRoles} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addStatus} className="gap-1.5"><Plus className="h-4 w-4" /> Agregar a la lista</Button>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}

export function InventoryView({ workspaceId, onViewChange }: { workspaceId: string; onViewChange?: (v: string) => void }) {
  const { user } = useAuth()
  const canManageStatuses = user?.workspaceRole === 'owner' || user?.workspaceRole === 'admin'
  const [items, setItems] = useState<Vehicle[]>([])
  const [statuses, setStatuses] = useState<StatusDef[]>(BUILTIN_STATUSES)
  const [showStatusMgr, setShowStatusMgr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fMarca, setFMarca] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [form, setForm] = useState<FormState | null>(null)
  const [detail, setDetail] = useState<{ v: Vehicle; m: VehicleMeta } | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const metricsRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/catalog?workspaceId=${workspaceId}`)
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
      if (Array.isArray(data.statuses) && data.statuses.length) setStatuses(data.statuses)
    } catch { toast.error('No se pudo cargar el inventario') } finally { setLoading(false) }
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  // Subida en lote: acepta varias fotos a la vez y reporta el error REAL
  // del servidor (antes solo decía "No se pudo subir la imagen").
  const uploadImages = async (files: File[]) => {
    const list = files.slice(0, 12) // tope razonable por lote
    if (files.length > 12) toast.info('Máximo 12 fotos por lote; subiendo las primeras 12')
    setUploading(true)
    let ok = 0
    try {
      for (const file of list) {
        try {
          const fd = new FormData(); fd.append('file', file); fd.append('workspaceId', workspaceId)
          const res = await fetch('/api/uploads', { method: 'POST', body: fd })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data?.mediaFile?.fileUrl) throw new Error(data?.error || `No se pudo subir ${file.name}`)
          setForm((f) => f ? { ...f, images: [...f.images, data.mediaFile.fileUrl] } : f)
          ok++
        } catch (e) {
          toast.error(e instanceof Error && e.message ? e.message : `No se pudo subir ${file.name}`)
        }
      }
      if (ok > 1) toast.success(`${ok} fotos subidas`)
    } finally { setUploading(false) }
  }

  const openNew = () => setForm({ ...EMPTY_FORM })
  const openEdit = (v: Vehicle) => {
    const m = parseMeta(v.metadata)
    const images = m.images?.length ? m.images : (v.imageUrl ? [v.imageUrl] : [])
    setForm({
      id: v.id, name: v.name, marca: m.marca || '', modelo: m.modelo || '', year: m.year || '',
      version: m.version || '', vin: m.vin || '', placas: m.placas || '',
      colorExterior: m.colorExterior || m.color || '', colorInterior: m.colorInterior || '', km: m.km || '',
      transmision: m.transmision || '', combustible: m.combustible || '', motor: m.motor || '',
      traccion: m.traccion || '', puertas: m.puertas || '', carroceria: m.carroceria || '',
      tipoFactura: m.tipoFactura || '', numDuenos: m.numDuenos || '', ubicacion: m.ubicacion || '', sku: m.sku || '',
      price: v.price != null ? String(v.price) : '', category: v.category || 'Nuevo',
      status: m.status || 'disponible', stock: v.stock != null ? String(v.stock) : '',
      description: v.description || '', isActive: v.isActive, images,
    })
  }

  const save = async () => {
    if (!form) return
    if (!form.name.trim()) { toast.error('El modelo (nombre) es obligatorio'); return }
    setSaving(true)
    const metadata = {
      marca: form.marca.trim(), modelo: form.modelo.trim(), year: form.year.trim(), version: form.version.trim(),
      vin: form.vin.trim(), placas: form.placas.trim(), colorExterior: form.colorExterior.trim(),
      colorInterior: form.colorInterior.trim(), km: form.km.trim(), transmision: form.transmision.trim(),
      combustible: form.combustible.trim(), motor: form.motor.trim(), traccion: form.traccion.trim(),
      puertas: form.puertas.trim(), carroceria: form.carroceria.trim(), tipoFactura: form.tipoFactura.trim(),
      numDuenos: form.numDuenos.trim(), ubicacion: form.ubicacion.trim(), sku: form.sku.trim(),
      status: form.status, images: form.images,
    }
    const payload = {
      workspaceId, name: form.name.trim(),
      price: form.price ? Number(form.price.replace(/[^\d.]/g, '')) : null,
      category: form.category || null, stock: form.stock ? parseInt(form.stock, 10) : null,
      imageUrl: form.images[0] || null, description: form.description.trim() || null,
      isActive: form.isActive, metadata,
    }
    try {
      const res = form.id
        ? await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, ...payload }) })
        : await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(form.id ? 'Auto actualizado' : 'Auto registrado')
      setForm(null); load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const remove = async (v: Vehicle) => {
    if (!confirm(`¿Eliminar "${v.name}" del inventario?`)) return
    try {
      const res = await fetch(`/api/catalog?id=${v.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Auto eliminado'); setItems((prev) => prev.filter((x) => x.id !== v.id))
    } catch { toast.error('No se pudo eliminar') }
  }

  // Activa/desactiva que el bot pueda ofrecer/cotizar este producto (isActive)
  const toggleBot = async (v: Vehicle) => {
    const next = !(v.isActive !== false)
    setItems((prev) => prev.map((x) => (x.id === v.id ? { ...x, isActive: next } : x)))
    try {
      const res = await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: v.id, isActive: next }) })
      if (!res.ok) throw new Error()
    } catch {
      setItems((prev) => prev.map((x) => (x.id === v.id ? { ...x, isActive: !next } : x)))
      toast.error('No se pudo actualizar')
    }
  }

  // Parseamos metadata UNA sola vez por item (evita re-parsear JSON en cada
  // render/tarjeta → más fluido con inventarios grandes).
  const parsed = useMemo(
    () => items.map((v) => { const m = parseMeta(v.metadata); return { v, m, st: m.status || 'disponible' } }),
    [items],
  )

  // Resolutor de estatus → definición (label + color). Los desconocidos caen
  // a un gris neutro para no romper la UI si un item trae un status viejo.
  const statusMap = useMemo(() => {
    const map: Record<string, StatusDef> = {}
    for (const s of statuses) map[s.key] = s
    return map
  }, [statuses])
  const stView = useCallback(
    (key: string): StatusDef => statusMap[key] || { key, label: key || 'Disponible', color: '#64748b', visibleToClient: true, roles: [] },
    [statusMap],
  )

  const marcas = useMemo(() => {
    const set = new Set<string>()
    for (const { m } of parsed) if (m.marca) set.add(m.marca)
    return [...set].sort()
  }, [parsed])

  const filtered = useMemo(() => parsed.filter(({ v, m, st }) => {
    if (fType && v.category !== fType) return false
    if (fStatus && st !== fStatus) return false
    if (fMarca && m.marca !== fMarca) return false
    if (search) {
      const hay = `${v.name} ${v.category || ''} ${m.marca || ''} ${m.modelo || ''} ${m.colorExterior || m.color || ''} ${m.vin || ''} ${m.sku || ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  }), [parsed, fType, fStatus, fMarca, search])

  const stats = useMemo(() => {
    let valor = 0, disp = 0, apart = 0, vend = 0, priced = 0, sum = 0
    for (const { v, st } of parsed) {
      if (st === 'vendido') vend++; else if (st === 'apartado') apart++; else disp++
      if (v.price != null) { priced++; sum += v.price; if (st !== 'vendido') valor += v.price }
    }
    return { total: items.length, valor, disp, apart, vend, avg: priced ? Math.round(sum / priced) : 0 }
  }, [parsed, items.length])

  const exportFile = async () => {
    if (!items.length) { toast.error('No hay nada que exportar'); return }
    const XLSX = await import('xlsx')
    const rows = items.map((v) => {
      const m = parseMeta(v.metadata)
      return {
        Modelo: v.name, Marca: m.marca || '', 'Modelo (base)': m.modelo || '', Año: m.year || '', Versión: m.version || '',
        VIN: m.vin || '', Placas: m.placas || '', 'Color ext': m.colorExterior || m.color || '', 'Color int': m.colorInterior || '',
        Km: m.km || '', Transmisión: m.transmision || '', Combustible: m.combustible || '', Motor: m.motor || '',
        Tracción: m.traccion || '', Puertas: m.puertas || '', Tipo: v.category || '', Estatus: m.status || 'disponible',
        Precio: v.price ?? '', Moneda: v.currency || 'MXN', Stock: v.stock ?? '', Ubicación: m.ubicacion || '', SKU: m.sku || '',
        Activo: v.isActive ? 'Sí' : 'No', Notas: v.description || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const fld = (label: string, key: keyof FormState, placeholder = '', type = 'text') => (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Input type={type} value={String(form?.[key] ?? '')} placeholder={placeholder}
        onChange={(e) => setForm((f) => f ? { ...f, [key]: e.target.value } : f)} className="h-9 text-sm" />
    </div>
  )

  // Campo de selección (dropdown). Conserva un valor ya guardado aunque no esté
  // en la lista (p. ej. importado), agregándolo como opción.
  const sel = (label: string, key: keyof FormState, options: string[]) => {
    const cur = String(form?.[key] ?? '')
    const opts = !cur || options.includes(cur) ? options : [cur, ...options]
    return (
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
        <div className="relative">
          <select
            value={cur}
            onChange={(e) => setForm((f) => f ? { ...f, [key]: e.target.value } : f)}
            className="h-9 w-full rounded-md border border-input bg-background pl-2 pr-7 text-sm appearance-none cursor-pointer"
          >
            <option value="">—</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>
    )
  }

  const botCount = items.filter((v) => v.isActive !== false).length
  const pct = (n: number) => (stats.total > 0 ? `${Math.round((n / stats.total) * 100)}% del total` : '—')
  // Días en stock: usa metadata.diasStock (import de agencia) o la antigüedad del registro
  const staleUnits = items.filter((v) => {
    let m: Record<string, unknown> = {}
    try { m = JSON.parse((v as unknown as { metadata?: string }).metadata || '{}') } catch { /* */ }
    if ((m.status || 'disponible') === 'vendido') return false
    const ds = m.diasStock != null && m.diasStock !== '' ? Number(m.diasStock) : (v.createdAt ? Math.floor((Date.now() - new Date(v.createdAt).getTime()) / 86400000) : NaN)
    return Number.isFinite(ds) && ds >= 100
  })
  const metricCards = [
    { icon: <Car className="h-5 w-5" />, label: 'Total en inventario', value: String(stats.total), sub: `${stats.total} productos`, iconBg: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/30', subColor: 'text-blue-500' },
    { icon: <CheckCircle2 className="h-5 w-5" />, label: 'Disponibles', value: String(stats.disp), sub: pct(stats.disp), iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30', subColor: 'text-emerald-500' },
    { icon: <Clock className="h-5 w-5" />, label: 'Apartados', value: String(stats.apart), sub: pct(stats.apart), iconBg: 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg shadow-amber-500/30', subColor: 'text-amber-500' },
    { icon: <Tag className="h-5 w-5" />, label: 'Vendidos', value: String(stats.vend), sub: pct(stats.vend), iconBg: 'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-lg shadow-red-500/30', subColor: 'text-red-500' },
    { icon: <DollarSign className="h-5 w-5" />, label: 'Valor total del inventario', value: money(stats.valor), sub: 'MXN', iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-lg shadow-emerald-500/30', subColor: 'text-muted-foreground' },
    { icon: <Boxes className="h-5 w-5" />, label: 'Productos para el bot', value: String(botCount), sub: `${stats.total > 0 ? Math.round((botCount / stats.total) * 100) : 0}% del inventario`, iconBg: 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg shadow-violet-500/30', subColor: 'text-violet-500' },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* ── Header (como el mockup) ── */}
      <div className="flex items-center justify-between gap-3 animate-fade-in">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Inventario</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Catálogo universal de productos y vehículos</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManageStatuses && (
            <Button variant="outline" size="sm" onClick={() => setShowStatusMgr(true)} className="gap-1.5 transition-smooth px-2.5 sm:px-3"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Estatus</span></Button>
          )}
          <Button variant="outline" size="sm" onClick={exportFile} className="gap-1.5 transition-smooth px-2.5 sm:px-3"><Download className="h-4 w-4" /><span className="hidden sm:inline">Exportar</span></Button>
          <Button variant="outline" size="sm" data-tour="inv-importar" onClick={() => setShowImport(true)} className="gap-1.5 transition-smooth px-2.5 sm:px-3"><Upload className="h-4 w-4" /><span className="hidden sm:inline">Importar</span></Button>
          <Button onClick={openNew} data-tour="inv-registrar" className="hidden sm:inline-flex gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-smooth"><Plus className="h-4 w-4" /> Agregar producto</Button>
        </div>
      </div>

      {/* ── Alerta de rotación: unidades con 100+ días en stock (activa el marketing) ── */}
      {staleUnits.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 flex items-center gap-3 animate-fade-in">
          <span className="text-lg">⚠️</span>
          <p className="text-sm flex-1 min-w-0">
            <b>{staleUnits.length} unidad{staleUnits.length !== 1 ? 'es' : ''} con más de 100 días en stock</b>
            <span className="text-muted-foreground"> — {staleUnits.slice(0, 3).map((v) => v.name).join(', ')}{staleUnits.length > 3 ? '…' : ''}. Pídele al Copiloto: &quot;genera un video de oferta del que lleva más tiempo&quot; o crea una campaña en Marketing IA.</span>
          </p>
        </div>
      )}

      {/* ── Métricas (scroll horizontal en móvil con hint, grid en desktop) ── */}
      <div className="relative">
      <div ref={metricsRef} className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1 snap-x lg:grid lg:grid-cols-3 xl:grid-cols-6 lg:gap-3 lg:mx-0 lg:px-0 lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {metricCards.map((s, i) => (
          <div key={s.label} className="relative overflow-hidden rounded-2xl border border-border/60 bg-card dark:bg-zinc-900/60 p-3.5 transition-smooth hover:shadow-md hover:-translate-y-0.5 animate-slide-up shrink-0 min-w-[180px] snap-start lg:min-w-0 lg:shrink flex items-center gap-3" style={{ animationDelay: `${i * 50}ms` }}>
            <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center shrink-0', s.iconBg)}>{s.icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{s.label}</p>
              <p className="text-xl font-bold leading-tight tracking-tight animate-count-up">{s.value}</p>
              <p className={cn('text-[10px] mt-0.5 font-medium', s.subColor)}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>
        <SwipeHint scrollRef={metricsRef} label="Ver más" />
      </div>

      {/* ── 2 columnas: contenido + panel derecho (como el mockup) ── */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
      <div className="flex-1 min-w-0 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo, color, VIN, SKU…" className="pl-9 h-10 rounded-xl" />
        </div>
        <div className="flex items-center gap-2 sm:flex-1 overflow-x-auto -mx-4 px-4 pb-0.5 sm:mx-0 sm:px-0 sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { v: fType, set: setFType, opts: [['', 'Tipo: todos'], ['Nuevo', 'Nuevo'], ['Seminuevo', 'Seminuevo'], ['Usado', 'Usado']] as [string, string][] },
          { v: fStatus, set: setFStatus, opts: [['', 'Estatus: todos'], ...statuses.map((s) => [s.key, s.label] as [string, string])] as [string, string][] },
          ...(marcas.length ? [{ v: fMarca, set: setFMarca, opts: [['', 'Marca: todas'], ...marcas.map((m) => [m, m] as [string, string])] as [string, string][] }] : []),
        ].map((f, i) => (
          <div key={i} className="relative shrink-0">
            <select value={f.v} onChange={(e) => f.set(e.target.value)} className="h-10 rounded-xl border border-input bg-background pl-3 pr-8 text-sm appearance-none cursor-pointer transition-smooth hover:border-emerald-300">
              {f.opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
        ))}
        <div className="ml-auto flex rounded-xl border overflow-hidden shrink-0">
          <button onClick={() => setView('cards')} className={cn('p-2.5 transition-smooth', view === 'cards' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted')} title="Tarjetas"><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setView('table')} className={cn('p-2.5 transition-smooth', view === 'table' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted')} title="Tabla"><Table2 className="h-4 w-4" /></button>
        </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} i={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="relative mb-4">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-500/10 dark:to-transparent flex items-center justify-center">
              <PackageOpen className="h-9 w-9 text-emerald-500" />
            </div>
            <Sparkles className="h-5 w-5 text-amber-400 absolute -right-1 -top-1 animate-pulse-dot" />
          </div>
          <p className="text-sm font-semibold">{items.length === 0 ? 'Aún no hay autos en el inventario' : 'Sin resultados con esos filtros'}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">{items.length === 0 ? 'Registra tu primer auto o importa tu inventario completo en segundos con IA.' : 'Prueba con otros filtros o limpia la búsqueda.'}</p>
          {items.length === 0 && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2"><Upload className="h-4 w-4" /> Importar con IA</Button>
              <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4" /> Registrar el primero</Button>
            </div>
          )}
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map(({ v, m, st }, i) => {
            const def = stView(st)
            const img = m.images?.[0] || v.imageUrl
            return (
              <div key={v.id} onClick={() => setDetail({ v, m })} role="button" tabIndex={0} className={cn('group relative rounded-2xl border border-border/60 bg-card overflow-hidden transition-smooth hover:-translate-y-1 hover:shadow-xl hover:border-emerald-300/60 animate-slide-up cursor-pointer', !v.isActive && 'opacity-60')} style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                {/* Imagen (con fallback a ícono si la imagen falla) */}
                <div className="relative h-32 sm:h-40 overflow-hidden bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
                  <Car className="h-12 w-12 text-muted-foreground/30" />
                  {img && <img src={img} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                  {/* Estatus ribbon */}
                  <StatusBadge def={def} size="md" className="absolute top-3 left-3 shadow-sm" />
                  {/* Menú ⋮ (como el mockup) */}
                  <div className="absolute top-3 right-3">
                    <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === v.id ? null : v.id) }} className="h-7 w-7 rounded-lg bg-black/40 backdrop-blur text-white hover:bg-black/60 flex items-center justify-center transition-colors"><MoreVertical className="h-4 w-4" /></button>
                    {menuId === v.id && (
                      <div className="absolute right-0 top-8 z-20 w-32 rounded-lg border border-border/60 bg-popover shadow-xl py-1 text-left" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setMenuId(null); openEdit(v) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/60"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                        <button onClick={() => { setMenuId(null); remove(v) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-muted/60"><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>
                      </div>
                    )}
                  </div>
                </div>
                {/* Cuerpo */}
                <div className="p-3 sm:p-4 space-y-2">
                  <div>
                    <p className="font-semibold text-[13px] sm:text-sm leading-snug line-clamp-2 sm:truncate">{v.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[m.marca, m.modelo, m.version].filter(Boolean).join(' · ') || (m.colorExterior || m.color || '—')}
                    </p>
                  </div>
                  {/* SKU + categoría (como el mockup) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.sku && <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">SKU: {m.sku}</span>}
                    {v.category && <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">{v.category}</span>}
                  </div>
                  <p className="text-base font-bold text-emerald-500">{money(v.price)} <span className="text-[10px] font-medium text-muted-foreground">{v.currency || 'MXN'}</span></p>
                </div>
                {/* Footer: Publicar en ML + toggle del bot (como el mockup) */}
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 sm:px-4 py-2.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewChange?.('meli') }}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-1 text-[10px] font-medium hover:bg-amber-500/25 transition-colors"
                  >
                    <Tag className="h-3 w-3" /> Publicar en ML
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">Disponible para el bot</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleBot(v) }}
                      className={cn('relative h-5 w-9 rounded-full transition-colors', v.isActive !== false ? 'bg-emerald-500' : 'bg-muted')}
                      title="Disponible para el bot"
                    >
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', v.isActive !== false ? 'left-4' : 'left-0.5')} />
                    </button>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 overflow-x-auto animate-fade-in">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-muted-foreground border-b bg-muted/40">
                {['', 'Modelo', 'Marca', 'Año', 'Precio', 'Tipo', 'Estatus', 'Km', 'Transmisión', 'Combustible', 'Stock', 'Ubicación', ''].map((h, i) => (
                  <th key={i} className="p-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ v, m, st }) => {
                const def = stView(st)
                const img = m.images?.[0] || v.imageUrl
                return (
                  <tr key={v.id} onClick={() => setDetail({ v, m })} className={cn('border-b last:border-0 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5 transition-colors cursor-pointer', !v.isActive && 'opacity-60')}>
                    <td className="p-2 pl-3">
                      <div className="relative h-9 w-12 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        <Car className="h-4 w-4 text-muted-foreground/40" />
                        {img && <img src={img} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
                      </div>
                    </td>
                    <td className="p-3 font-medium max-w-[220px] truncate">{v.name}</td>
                    <td className="p-3">{m.marca || '—'}</td>
                    <td className="p-3">{m.year || '—'}</td>
                    <td className="p-3 font-bold text-emerald-600">{money(v.price)}</td>
                    <td className="p-3">{v.category || '—'}</td>
                    <td className="p-3"><StatusBadge def={def} /></td>
                    <td className="p-3">{m.km || '—'}</td>
                    <td className="p-3">{m.transmision || '—'}</td>
                    <td className="p-3">{m.combustible || '—'}</td>
                    <td className="p-3">{v.stock ?? '—'}</td>
                    <td className="p-3">{m.ubicacion || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(v) }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); remove(v) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* ── Panel derecho (como el mockup) ── */}
      <aside className="w-full xl:w-80 shrink-0 space-y-4">
        {/* Resumen rápido con dona */}
        <div className="rounded-2xl border border-border/60 bg-card dark:bg-zinc-900/60 p-4">
          <p className="text-sm font-semibold mb-3">Resumen rápido</p>
          <div className="flex items-center gap-4">
            {(() => {
              const t = stats.total || 1
              const d = (stats.disp / t) * 100, a = (stats.apart / t) * 100
              const bg = `conic-gradient(#10b981 0% ${d}%, #f59e0b ${d}% ${d + a}%, #ef4444 ${d + a}% 100%)`
              return (
                <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: bg }}>
                  <div className="absolute inset-[14px] rounded-full bg-card dark:bg-zinc-900 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold leading-none">{stats.total}</span>
                    <span className="text-[9px] text-muted-foreground">Total</span>
                  </div>
                </div>
              )
            })()}
            <div className="space-y-1.5 text-xs flex-1">
              {[
                { c: 'bg-emerald-500', l: 'Disponibles', n: stats.disp },
                { c: 'bg-amber-500', l: 'Apartados', n: stats.apart },
                { c: 'bg-red-500', l: 'Vendidos', n: stats.vend },
              ].map((r) => (
                <div key={r.l} className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', r.c)} />
                  <span className="text-muted-foreground flex-1">{r.l}</span>
                  <span className="font-semibold">{r.n}</span>
                  <span className="text-muted-foreground w-10 text-right">{stats.total ? Math.round((r.n / stats.total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Importación masiva */}
        <div className="rounded-2xl border border-border/60 bg-card dark:bg-zinc-900/60 p-4">
          <p className="text-sm font-semibold mb-3">Importación masiva</p>
          <button onClick={() => setShowImport(true)} className="w-full rounded-xl border-2 border-dashed border-border/60 hover:border-emerald-400/60 transition-colors p-4 flex flex-col items-center gap-2 text-center">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Arrastra tu archivo<br />CSV, Excel o Google Sheets</span>
          </button>
          <Button onClick={() => setShowImport(true)} className="w-full mt-3 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><Upload className="h-4 w-4" /> Seleccionar archivo</Button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">La IA mapeará las columnas automáticamente</p>
        </div>

        {/* Acciones rápidas */}
        <div className="rounded-2xl border border-border/60 bg-card dark:bg-zinc-900/60 p-4">
          <p className="text-sm font-semibold mb-3">Acciones rápidas</p>
          <div className="space-y-1">
            {[
              { icon: <RefreshCw className="h-4 w-4 text-amber-500" />, label: 'Mercado Libre', onClick: () => onViewChange?.('meli') },
              { icon: <Upload className="h-4 w-4 text-emerald-500" />, label: 'Importar productos', onClick: () => setShowImport(true) },
              { icon: <Download className="h-4 w-4 text-blue-500" />, label: 'Exportar inventario', onClick: exportFile },
              { icon: <Plus className="h-4 w-4 text-violet-500" />, label: 'Agregar producto', onClick: openNew },
            ].map((a) => (
              <button key={a.label} onClick={a.onClick} className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted/50 transition-colors">
                <span className="p-1.5 rounded-lg bg-muted/60">{a.icon}</span>
                <span className="flex-1 text-foreground">{a.label}</span>
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </aside>
      </div>

      {/* Import modal */}
      {showImport && (
        <InventoryImportModal workspaceId={workspaceId} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />
      )}

      {/* Gestor de estatus personalizados */}
      {showStatusMgr && (
        <StatusManagerModal
          workspaceId={workspaceId}
          statuses={statuses}
          onClose={() => setShowStatusMgr(false)}
          onSaved={(next) => { setStatuses(next); }}
        />
      )}

      {/* FAB (móvil): registrar auto — acción primaria siempre a mano */}
      <button onClick={openNew} aria-label="Registrar auto"
        className="sm:hidden fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center active:scale-95 transition-transform">
        <Plus className="h-6 w-6" />
      </button>

      {/* ── Drawer lateral: registrar / editar ── */}
      {form && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => !saving && setForm(null)}>
          <div className="absolute inset-0 bg-black/50 animate-fade-in" />
          <div className="relative h-full w-full max-w-[480px] bg-background shadow-2xl flex flex-col animate-slide-in-right [will-change:transform]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-14 border-b shrink-0">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600"><Car className="h-4 w-4" /></span>
                {form.id ? 'Editar auto' : 'Registrar auto'}
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              {fld('Título / modelo (lo que cotiza el bot) *', 'name', 'Ej: Hyundai Creta 2024 Limited')}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Datos del vehículo</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fld('Marca', 'marca', 'Toyota')}
                  {fld('Modelo', 'modelo', 'Hilux')}
                  {sel('Año', 'year', YEARS)}
                  {fld('Versión', 'version', 'Limited / SR')}
                  {fld('VIN / Serie', 'vin', '17 caracteres')}
                  {fld('Placas', 'placas', '')}
                  {fld('Color exterior', 'colorExterior', 'Gris')}
                  {fld('Color interior', 'colorInterior', 'Negro')}
                  {fld('Kilometraje', 'km', '0', 'number')}
                  {sel('Transmisión', 'transmision', TRANSMISIONES)}
                  {sel('Combustible', 'combustible', COMBUSTIBLES)}
                  {fld('Motor', 'motor', '2.0L')}
                  {sel('Tracción', 'traccion', TRACCIONES)}
                  {sel('Puertas', 'puertas', PUERTAS)}
                  {sel('Carrocería', 'carroceria', CARROCERIAS)}
                  {sel('Tipo de factura', 'tipoFactura', TIPOS_FACTURA)}
                  {sel('Número de dueños', 'numDuenos', NUM_DUENOS)}
                  {fld('Ubicación / sucursal', 'ubicacion', 'Matriz')}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comercial</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fld('Precio (MXN)', 'price', '429000')}
                  {fld('Stock', 'stock', '1', 'number')}
                  {fld('SKU / folio', 'sku', '')}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Tipo</label>
                    <select value={form.category} onChange={(e) => setForm((f) => f ? { ...f, category: e.target.value } : f)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      <option>Nuevo</option><option>Seminuevo</option><option>Usado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-muted-foreground">Estatus</label>
                      {canManageStatuses && (
                        <button type="button" onClick={() => setShowStatusMgr(true)} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-0.5">
                          <Plus className="h-3 w-3" /> Nuevo
                        </button>
                      )}
                    </div>
                    <select value={form.status} onChange={(e) => setForm((f) => f ? { ...f, status: e.target.value } : f)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}{!s.visibleToClient ? ' (oculto al cliente)' : ''}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Fotos</label>
                <p className="text-[10px] text-muted-foreground">Puedes seleccionar varias a la vez (hasta 12). JPG, PNG, WebP, GIF o foto de iPhone; máx. 20MB c/u.</p>
                <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) uploadImages(fs); e.target.value = '' }} />
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative group/img">
                      <img src={img} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                      <button type="button" onClick={() => setForm((f) => f ? { ...f, images: f.images.filter((_, k) => k !== i) } : f)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow"><X className="h-3 w-3" /></button>
                      {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[8px] text-center rounded-b-lg">Principal</span>}
                    </div>
                  ))}
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground hover:border-emerald-400 transition-smooth">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              {fld('Notas (opcional)', 'description', 'Equipamiento, promoción, detalles…')}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => f ? { ...f, isActive: e.target.checked } : f)} className="accent-emerald-600" />
                Disponible para el bot (lo puede ofrecer/cotizar)
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={save} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{form.id ? 'Guardar cambios' : 'Registrar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer lateral: DETALLE del vehículo ── */}
      {detail && (() => {
        const { v, m } = detail
        const st = m.status || (v.isActive ? 'disponible' : 'vendido')
        const def = stView(st)
        const imgs = m.images?.length ? m.images : (v.imageUrl ? [v.imageUrl] : [])
        const kmTxt = m.km ? (/^\d+$/.test(String(m.km)) ? `${Number(m.km).toLocaleString('es-MX')} km` : String(m.km)) : null
        const specs: { label: string; value?: string | null }[] = [
          { label: 'Marca', value: m.marca },
          { label: 'Modelo', value: m.modelo },
          { label: 'Año', value: m.year },
          { label: 'Versión', value: m.version },
          { label: 'Carrocería', value: m.carroceria },
          { label: 'Kilometraje', value: kmTxt },
          { label: 'Transmisión', value: m.transmision },
          { label: 'Combustible', value: m.combustible },
          { label: 'Motor', value: m.motor },
          { label: 'Tracción', value: m.traccion },
          { label: 'Puertas', value: m.puertas },
          { label: 'Color exterior', value: m.colorExterior || m.color },
          { label: 'Color interior', value: m.colorInterior },
          { label: 'Condición', value: m.condicion },
          { label: 'Tipo de factura', value: m.tipoFactura },
          { label: 'Número de dueños', value: m.numDuenos },
          { label: 'VIN', value: m.vin },
          { label: 'Placas', value: m.placas },
          { label: 'Ubicación', value: m.ubicacion },
          { label: 'SKU / Folio', value: m.sku },
          { label: 'Existencias', value: v.stock != null ? String(v.stock) : null },
        ].filter((s) => s.value != null && String(s.value).trim() !== '')
        const extras = (m.extra || []).filter((e) => e && e.valor != null && String(e.valor).trim() !== '')
        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetail(null)}>
            <div className="absolute inset-0 bg-black/50 animate-fade-in" />
            <div className="relative h-full w-full max-w-[520px] bg-background shadow-2xl flex flex-col animate-slide-in-right [will-change:transform]" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 h-14 border-b shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Car className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold truncate">{v.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(null)}><X className="h-4 w-4" /></Button>
              </div>

              {/* Cuerpo scrolleable */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* Galería / portada */}
                <div className="relative h-56 bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
                  <Car className="h-16 w-16 text-muted-foreground/30" />
                  {imgs[0] && <img src={imgs[0]} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} className="absolute inset-0 w-full h-full object-cover" />}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                  <StatusBadge def={def} size="md" className="absolute top-3 left-3 shadow-sm" />
                  {v.category && <span className="absolute top-3 right-3 rounded-full bg-black/60 text-white px-2.5 py-1 text-[11px] font-medium">{v.category}</span>}
                  <div className="absolute bottom-3 left-4 text-white">
                    <span className="text-2xl font-extrabold drop-shadow">{money(v.price)}</span>
                    <span className="text-xs font-medium opacity-90"> {v.currency || 'MXN'}</span>
                  </div>
                </div>
                {/* Miniaturas (si hay más de una) */}
                {imgs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b">
                    {imgs.map((src, k) => (
                      <img key={k} src={src} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} className="h-16 w-20 rounded-lg object-cover shrink-0 border border-border/60" />
                    ))}
                  </div>
                )}

                {/* Ficha técnica */}
                <div className="p-5 space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ficha técnica</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0 rounded-xl border border-border/60 overflow-hidden">
                      {specs.map((s, k) => (
                        <div key={k} className={cn('flex flex-col gap-0.5 px-3 py-2.5 border-b border-border/40', k % 2 === 0 && 'border-r')}>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
                          <span className="text-sm font-medium break-words">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {v.description && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Descripción</h3>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{v.description}</p>
                    </div>
                  )}

                  {extras.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Datos adicionales</h3>
                      <div className="space-y-1.5">
                        {extras.map((e, k) => (
                          <div key={k} className="flex items-start justify-between gap-3 text-sm border-b border-border/40 pb-1.5">
                            <span className="text-muted-foreground">{e.etiqueta}</span>
                            <span className="font-medium text-right break-words">{e.valor}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { const vv = v; setDetail(null); remove(vv) }}><Trash2 className="h-4 w-4" /> Eliminar</Button>
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { const vv = v; setDetail(null); openEdit(vv) }}><Pencil className="h-4 w-4" /> Editar</Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
