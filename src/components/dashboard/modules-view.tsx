'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MapPin, Clock, Calendar, ShoppingBag, User, ChevronDown, ChevronUp,
  Check, Loader2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

interface WorkspaceModule {
  id: string | null
  workspaceId: string
  moduleType: string
  enabled: boolean
  config: Record<string, unknown>
}

interface CatalogItem {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  price?: number | null
  currency: string
  category?: string | null
  stock?: number | null
  isActive: boolean
  imageUrl?: string | null
}

interface ModulesViewProps {
  workspaceId: string
}

// ─── Module metadata ──────────────────────────────────────────

const MODULE_META = {
  agent_profile: {
    icon: User,
    title: 'Perfil del Agente',
    description: 'Define el nombre, tono y personalidad de tu asistente IA.',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  physical_location: {
    icon: MapPin,
    title: 'Ubicación Física',
    description: 'Dirección, horarios y cómo llegar. Si está desactivado el agente dirá que operan 100% en línea.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  appointments: {
    icon: Calendar,
    title: 'Citas y Agenda',
    description: 'El agente puede verificar disponibilidad y agendar citas en el calendario interno.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  catalog: {
    icon: ShoppingBag,
    title: 'Catálogo de Vehículos',
    description: 'El agente puede buscar y mostrar tu inventario de autos (modelo, precio, disponibilidad) al cliente.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
}

// ─── Main Component ───────────────────────────────────────────

export function ModulesView({ workspaceId }: ModulesViewProps) {
  const [modules, setModules] = useState<WorkspaceModule[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [showCatalog, setShowCatalog] = useState(false)

  const loadModules = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace-modules?workspaceId=${workspaceId}`)
      const data = await res.json()
      if (data.modules) setModules(data.modules)
    } catch {
      toast.error('Error cargando módulos')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { loadModules() }, [loadModules])

  const toggleModule = async (moduleType: string, enabled: boolean) => {
    setSaving(moduleType)
    try {
      const res = await fetch('/api/workspace-modules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, moduleType, enabled }),
      })
      if (!res.ok) throw new Error('Error')
      setModules((prev) =>
        prev.map((m) => (m.moduleType === moduleType ? { ...m, enabled } : m))
      )
      toast.success(enabled ? `Módulo activado` : `Módulo desactivado`)
    } catch {
      toast.error('Error al cambiar el estado del módulo')
    } finally {
      setSaving(null)
    }
  }

  const saveModuleConfig = async (moduleType: string, config: Record<string, unknown>) => {
    const mod = modules.find((m) => m.moduleType === moduleType)
    setSaving(moduleType)
    try {
      const res = await fetch('/api/workspace-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          moduleType,
          enabled: mod?.enabled ?? false,
          config,
        }),
      })
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setModules((prev) =>
        prev.map((m) => (m.moduleType === moduleType ? { ...data.module } : m))
      )
      toast.success('Configuración guardada')
      setExpanded(null)
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Módulos del Agente IA</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Activa los módulos que necesitas. El agente IA inyectará automáticamente la información y herramientas correspondientes en cada conversación.
        </p>
      </div>

      <div className="space-y-3">
        {(['agent_profile', 'physical_location', 'appointments', 'catalog'] as const).map((type) => {
          const mod = modules.find((m) => m.moduleType === type) ?? {
            id: null, workspaceId, moduleType: type, enabled: false, config: {},
          }
          const meta = MODULE_META[type]
          const Icon = meta.icon
          const isExpanded = expanded === type
          const isSaving = saving === type

          return (
            <Card key={type} className={cn('border-border/60 transition-all', mod.enabled && 'border-border')}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('p-2 rounded-lg mt-0.5', meta.bg)}>
                    <Icon className={cn('h-4 w-4', meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{meta.title}</span>
                        {mod.enabled && (
                          <Badge variant="outline" className="text-xs py-0 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                            Activo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={mod.enabled}
                            onCheckedChange={(v) => toggleModule(type, v)}
                          />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>

                    {/* Config expand button */}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : type)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? 'Ocultar configuración' : 'Configurar'}
                    </button>

                    {/* Config panel */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        {type === 'agent_profile' && (
                          <AgentProfileForm
                            config={mod.config}
                            saving={isSaving}
                            onSave={(cfg) => saveModuleConfig(type, cfg)}
                          />
                        )}
                        {type === 'physical_location' && (
                          <PhysicalLocationForm
                            config={mod.config}
                            saving={isSaving}
                            onSave={(cfg) => saveModuleConfig(type, cfg)}
                          />
                        )}
                        {type === 'appointments' && (
                          <AppointmentsForm
                            config={mod.config}
                            saving={isSaving}
                            onSave={(cfg) => saveModuleConfig(type, cfg)}
                          />
                        )}
                        {type === 'catalog' && (
                          <CatalogModuleForm
                            config={mod.config}
                            saving={isSaving}
                            onSave={(cfg) => saveModuleConfig(type, cfg)}
                            onManageCatalog={() => { setShowCatalog(true); setExpanded(null) }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Catalog Management Panel */}
      {showCatalog && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Gestión de Catálogo</h3>
            <Button variant="outline" size="sm" onClick={() => setShowCatalog(false)}>
              Cerrar
            </Button>
          </div>
          <CatalogManagement workspaceId={workspaceId} />
        </div>
      )}
    </div>
  )
}

// ─── Config Forms ─────────────────────────────────────────────

function AgentProfileForm({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (cfg: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(String(config.name || ''))
  const [tone, setTone] = useState(String(config.tone || 'profesional'))
  const [greeting, setGreeting] = useState(String(config.greeting || ''))
  const [closing, setClosing] = useState(String(config.closing || ''))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre del agente</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Sofía" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tono</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profesional">Profesional</SelectItem>
              <SelectItem value="amigable">Amigable</SelectItem>
              <SelectItem value="técnico">Técnico</SelectItem>
              <SelectItem value="empático">Empático</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Saludo inicial (opcional)</Label>
        <Input value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Ej: ¡Hola! Soy Sofía, ¿en qué puedo ayudarte?" className="h-8 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Cierre de conversación (opcional)</Label>
        <Input value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="Ej: ¡Hasta pronto! Fue un placer atenderte." className="h-8 text-sm" />
      </div>
      <Button
        size="sm"
        disabled={saving}
        onClick={() => onSave({ name: name.trim(), tone, greeting: greeting.trim(), closing: closing.trim() })}
        className="h-8"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
        Guardar
      </Button>
    </div>
  )
}

function PhysicalLocationForm({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (cfg: Record<string, unknown>) => void
}) {
  const [address, setAddress] = useState(String(config.address || ''))
  const [city, setCity] = useState(String(config.city || ''))
  const [hours, setHours] = useState(String(config.hours || ''))
  const [mapUrl, setMapUrl] = useState(String(config.mapUrl || ''))
  const [hasParking, setHasParking] = useState(Boolean(config.hasParking))
  const [extraNotes, setExtraNotes] = useState(String(config.extraNotes || ''))

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Dirección completa</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej: Av. Insurgentes Sur 1234, Col. Roma, CDMX" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Ciudad</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej: Ciudad de México" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Horario</Label>
          <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Ej: Lun–Vie 9am–6pm" className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Enlace Google Maps (opcional)</Label>
        <Input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://maps.google.com/..." className="h-8 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={hasParking} onCheckedChange={setHasParking} />
        <Label className="text-xs">Cuenta con estacionamiento</Label>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notas adicionales (opcional)</Label>
        <Input value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} placeholder="Ej: Local 2B, segundo piso" className="h-8 text-sm" />
      </div>
      <Button
        size="sm"
        disabled={saving}
        onClick={() => onSave({ address: address.trim(), city: city.trim(), hours: hours.trim(), mapUrl: mapUrl.trim(), hasParking, extraNotes: extraNotes.trim() })}
        className="h-8"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
        Guardar
      </Button>
    </div>
  )
}

function AppointmentsForm({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (cfg: Record<string, unknown>) => void
}) {
  const [durationMinutes, setDurationMinutes] = useState(String(config.durationMinutes || '30'))
  const [minAdvanceHours, setMinAdvanceHours] = useState(String(config.minAdvanceHours || '2'))
  const [customInstructions, setCustomInstructions] = useState(String(config.customInstructions || ''))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Duración de citas (min)</Label>
          <Input type="number" min={15} max={240} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Anticipación mínima (hrs)</Label>
          <Input type="number" min={0} max={72} value={minAdvanceHours} onChange={(e) => setMinAdvanceHours(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Instrucciones adicionales para el agente (opcional)</Label>
        <Textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Ej: Solo agendar citas entre 9am y 6pm, de lunes a viernes."
          className="text-sm min-h-[60px] resize-none"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        El agente usará el calendario interno para verificar disponibilidad y agendar citas.
      </p>
      <Button
        size="sm"
        disabled={saving}
        onClick={() => onSave({
          durationMinutes: parseInt(durationMinutes) || 30,
          minAdvanceHours: parseInt(minAdvanceHours) || 2,
          customInstructions: customInstructions.trim(),
        })}
        className="h-8"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
        Guardar
      </Button>
    </div>
  )
}

function CatalogModuleForm({
  config,
  saving,
  onSave,
  onManageCatalog,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (cfg: Record<string, unknown>) => void
  onManageCatalog: () => void
}) {
  const [currency, setCurrency] = useState(String(config.currency || 'MXN'))
  const [showPrices, setShowPrices] = useState(config.showPrices !== false)
  const [customInstructions, setCustomInstructions] = useState(String(config.customInstructions || ''))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
              <SelectItem value="USD">USD — Dólar</SelectItem>
              <SelectItem value="EUR">EUR — Euro</SelectItem>
              <SelectItem value="COP">COP — Peso colombiano</SelectItem>
              <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={showPrices} onCheckedChange={setShowPrices} />
          <Label className="text-xs">Mostrar precios al cliente</Label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Instrucciones para el agente (opcional)</Label>
        <Textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Ej: Si el cliente pregunta por descuentos, invitarlo a solicitar una cotización."
          className="text-sm min-h-[60px] resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => onSave({ currency, showPrices, customInstructions: customInstructions.trim() })}
          className="h-8"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
          Guardar
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onManageCatalog}>
          <Package className="h-3.5 w-3.5 mr-1.5" />
          Administrar productos
        </Button>
      </div>
    </div>
  )
}

// ─── Catalog Management ───────────────────────────────────────

function CatalogManagement({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState<Partial<CatalogItem> | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ workspaceId })
      if (search) params.set('search', search)
      const res = await fetch(`/api/catalog?${params}`)
      const data = await res.json()
      setItems(data.items || [])
      setCategories(data.categories || [])
    } catch {
      toast.error('Error cargando catálogo')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, search])

  useEffect(() => { loadItems() }, [loadItems])

  const saveItem = async () => {
    if (!editingItem?.name?.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setSaving(true)
    try {
      const isNew = !editingItem.id
      const res = await fetch('/api/catalog', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? { ...editingItem, workspaceId } : editingItem),
      })
      if (!res.ok) throw new Error('Error')
      toast.success(isNew ? 'Producto creado' : 'Producto actualizado')
      setEditingItem(null)
      loadItems()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/catalog?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error')
      setItems((prev) => prev.filter((i) => i.id !== id))
      toast.success('Producto eliminado')
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Productos y Servicios</CardTitle>
            <CardDescription className="text-xs mt-0.5">{items.length} ítem(s) en el catálogo</CardDescription>
          </div>
          <Button
            size="sm"
            className="h-8"
            onClick={() => setEditingItem({ currency: 'MXN', isActive: true })}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Agregar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search */}
        <Input
          placeholder="Buscar en catálogo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />

        {/* Edit form */}
        {editingItem && (
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-3">
              <h4 className="text-sm font-medium">{editingItem.id ? 'Editar producto' : 'Nuevo producto'}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Nombre *</Label>
                  <Input
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p!, name: e.target.value }))}
                    placeholder="Ej: Consultoría básica"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Precio</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingItem.price ?? ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p!, price: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoría</Label>
                  <Input
                    value={editingItem.category || ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p!, category: e.target.value }))}
                    placeholder="Ej: Servicios"
                    className="h-8 text-sm"
                    list="category-list"
                  />
                  <datalist id="category-list">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Descripción</Label>
                  <Textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p!, description: e.target.value }))}
                    placeholder="Descripción detallada del producto o servicio..."
                    className="text-sm min-h-[60px] resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stock (vacío = ilimitado)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingItem.stock ?? ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p!, stock: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="Ilimitado"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={editingItem.isActive !== false}
                    onCheckedChange={(v) => setEditingItem((p) => ({ ...p!, isActive: v }))}
                  />
                  <Label className="text-xs">Visible para el agente</Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8" onClick={saveItem} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  {editingItem.id ? 'Actualizar' : 'Crear'}
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingItem(null)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No hay productos. Agrega el primero con el botón de arriba.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/10">
                <div className={cn('p-1.5 rounded mt-0.5', item.isActive ? 'bg-amber-500/10' : 'bg-muted')}>
                  <Package className={cn('h-3.5 w-3.5', item.isActive ? 'text-amber-500' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{item.name}</span>
                    {item.category && (
                      <Badge variant="outline" className="text-xs py-0">{item.category}</Badge>
                    )}
                    {!item.isActive && (
                      <Badge variant="secondary" className="text-xs py-0">Oculto</Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                  )}
                  {item.price != null && (
                    <p className="text-xs font-medium text-emerald-600 mt-0.5">
                      {item.currency} ${Number(item.price).toLocaleString('es-MX')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditingItem({ ...item })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteItem(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
