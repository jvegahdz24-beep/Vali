'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  MoreVertical,
  Phone,
  Mail,
  MessageCircle,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  Download,
  Upload,
  FileSpreadsheet,
  Archive,
  Tag,
  Trash2,
  CheckSquare,
  Square,
  X,
  SlidersHorizontal,
  ChevronDown,
  Users,
  UserPlus,
  CheckCircle2,
  Flame,
  BellOff,
} from 'lucide-react'
import { cn, formatPhoneNumber, timeAgo, getInitials, getStageColor } from '@/lib/utils'
import { CHANNELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { ScoreRing } from '@/components/ui/score-ring'
import { ExpedientePanel } from '@/components/dashboard/expediente-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── Types ──

interface Contact {
  id: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  leadScore: number
  source: string
  tags: string[]
  customFields?: Record<string, unknown>
  status: string
  createdAt: string
  avatar?: string | null
  lastMessageAt?: string
  _count?: {
    conversations: number
    deals: number
  }
}

interface ContactsViewProps {
  onOpenContact?: (contactId: string) => void
  workspaceId: string
  onViewChange?: (view: string) => void
}

function getScoreBadge(score: number) {
  if (score >= 80) return <Badge className="h-5 text-[10px] px-1.5 bg-emerald-100 text-emerald-700 border-0 font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">{score}</Badge>
  if (score >= 60) return <Badge className="h-5 text-[10px] px-1.5 bg-yellow-100 text-yellow-700 border-0 font-semibold dark:bg-yellow-500/20 dark:text-yellow-400">{score}</Badge>
  if (score >= 40) return <Badge className="h-5 text-[10px] px-1.5 bg-orange-100 text-orange-700 border-0 font-semibold dark:bg-orange-500/20 dark:text-orange-400">{score}</Badge>
  return <Badge className="h-5 text-[10px] px-1.5 bg-red-100 text-red-700 border-0 font-semibold dark:bg-red-500/20 dark:text-red-400">{score}</Badge>
}

const HIDDEN_SYSTEM_TAGS = new Set([
  'whatsapp_incoming',
  'conversacion_activa',
  'alto_engagement',
  'interesa_modelo',
  'nuevo',
])

const FRIENDLY_TAG_LABELS = new Map([
  ['appointment-request', 'Solicitud de cita'],
  ['agendado', 'Agendado'],
  ['agendado-confirmado', 'Cita confirmada'],
  ['proceso-pago', 'Proceso de pago'],
  ['tiene_objeciones', 'Tiene objeciones'],
  ['comparando_precios', 'Comparando precios'],
  ['tiene_interes_financiero', 'Interés financiero'],
  ['no-califica', 'No califica'],
  ['referencia', 'Referencia'],
])

function parseContactTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((tag) => tag.trim()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).map((tag) => tag.trim()).filter(Boolean)
    } catch {
      return raw.split(',').map((tag) => tag.trim()).filter(Boolean)
    }
  }
  return []
}

function isSystemTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase()
  return !normalized ||
    HIDDEN_SYSTEM_TAGS.has(normalized) ||
    normalized.startsWith('intent-') ||
    normalized.startsWith('route-') ||
    normalized.startsWith('sentiment-') ||
    normalized.startsWith('source-') ||
    normalized.startsWith('crm_') ||
    normalized.startsWith('whatsapp_')
}

function formatTagLabel(tag: string): string {
  const clean = tag.trim()
  const normalized = clean.toLowerCase()
  const directLabel = FRIENDLY_TAG_LABELS.get(normalized)
  if (directLabel) return directLabel

  const productMatch = clean.match(/^(?:producto|product|servicio|service|interes|interés):\s*(.+)$/i)
  const interestMatch = clean.match(/^(?:interesado|interesa)[-_\s]+(.+)$/i)
  const label = productMatch?.[1]?.trim() || interestMatch?.[1]?.trim() || clean

  return label
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toLocaleUpperCase('es-MX'))
}

function getVisibleTagLabels(tags: string[]): string[] {
  const labels = new Map<string, string>()
  tags.forEach((tag) => {
    if (isSystemTag(tag)) return
    const label = formatTagLabel(tag)
    const key = label.toLocaleLowerCase('es-MX')
    if (label && !labels.has(key)) labels.set(key, label)
  })
  return Array.from(labels.values())
}

const CONTACT_INFO_LABELS: Record<string, string> = {
  nombre_detectado: 'Nombre',
  correo_detectado: 'Correo',
  empresa_detectada: 'Empresa',
  rfc_detectado: 'RFC',
  ubicacion_detectada: 'Ubicación',
  presupuesto_detectado: 'Presupuesto',
  interes_detectado: 'Interés',
}

function parseContactCustomFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function getContactInfoEntries(customFields?: Record<string, unknown>): Array<{ label: string; value: string }> {
  if (!customFields) return []
  return Object.entries(CONTACT_INFO_LABELS)
    .map(([key, label]) => {
      const rawValue = customFields[key]
      const value = typeof rawValue === 'string' ? rawValue.trim() : ''
      return value ? { label, value } : null
    })
    .filter((entry): entry is { label: string; value: string } => Boolean(entry))
}

// ── Contacts View ──

export function ContactsView({ workspaceId, onViewChange, onOpenContact }: ContactsViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [cStats, setCStats] = useState<{ total: number; newThisMonth: number; newThisMonthDelta: number; clientes: number; hotLeads: number; noContact30d: number; tabs: { todos: number; leads: number; clientes: number; prospectos: number; inactivos: number }; bySource?: { source: string; total: number; hot: number }[] } | null>(null)
  const [activeTab, setActiveTab] = useState<'todos' | 'leads' | 'clientes' | 'prospectos' | 'inactivos'>('todos')
  const [detailContactId, setDetailContactId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showNewContact, setShowNewContact] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)

  // Advanced filters state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100])
  const [sortBy, setSortBy] = useState('lastMessageAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])

  // Bulk operations state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // Form state
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newSource, setNewSource] = useState('whatsapp')
  const [newTags, setNewTags] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: number; errorDetails?: Array<{ row: number; message: string }> } | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch all available tags
  const fetchTags = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/contacts?workspaceId=${workspaceId}&limit=100`)
      if (!res.ok) return
      const data = await res.json()
      const tagSet = new Set<string>()
      ;(data.items || []).forEach((c: Record<string, unknown>) => {
        parseContactTags(c.tags).forEach((tag) => {
          if (!isSystemTag(tag)) tagSet.add(tag)
        })
      })
      setAllTags(Array.from(tagSet).sort())
    } catch { /* ignore */ }
  }, [workspaceId])

  const fetchContacts = useCallback(async (p = 1, search = '', status = 'all', source = 'all', scoreMin = 0, scoreMax = 100, tags = '', sort = 'lastMessageAt', order = 'desc', segment = 'todos') => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        workspaceId,
        page: p.toString(),
        limit: pageSize.toString(),
        sortBy: sort,
        sortOrder: order,
      })
      if (search) params.set('search', search)
      if (status !== 'all') params.set('status', status)
      if (source !== 'all') params.set('source', source)
      if (scoreMin > 0) params.set('leadScoreMin', scoreMin.toString())
      if (scoreMax < 100) params.set('leadScoreMax', scoreMax.toString())
      if (tags) params.set('tags', tags)
      // Pestaña activa (Leads/Clientes/Prospectos/Inactivos) — filtro REAL del servidor
      if (segment && segment !== 'todos') params.set('segment', segment)

      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) throw new Error('Error al cargar contactos')
      const data = await res.json()

      const parsed = (data.items || []).map((c: Record<string, unknown>) => ({
        ...c,
        tags: parseContactTags(c.tags),
        customFields: parseContactCustomFields(c.customFields),
        _count: c._count || { conversations: 0, deals: 0 },
      }))
      setContacts(parsed)
      setTotal(data.total || 0)
      setPage(data.page || p)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, pageSize])

  useEffect(() => {
    fetchContacts()
    fetchTags()
  }, [fetchContacts, fetchTags])

  // Debounced search with all filters
  const applyFilters = useCallback((p = 1) => {
    fetchContacts(p, searchQuery, statusFilter, sourceFilter, scoreRange[0], scoreRange[1], tagFilter.join(','), sortBy, sortOrder, activeTab)
  }, [fetchContacts, searchQuery, statusFilter, sourceFilter, scoreRange, tagFilter, sortBy, sortOrder, activeTab])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      fetchContacts(1, value, statusFilter, sourceFilter, scoreRange[0], scoreRange[1], tagFilter.join(','), sortBy, sortOrder, activeTab)
    }, 400)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
  }

  const handleSourceFilterChange = (value: string) => {
    setSourceFilter(value)
  }

  // KPIs reales de contactos
  useEffect(() => {
    if (!workspaceId) return
    let stop = false
    fetch(`/api/contacts/stats?workspaceId=${workspaceId}`).then(r => r.ok ? r.json() : null).then(d => { if (!stop && d) setCStats(d) }).catch(() => {})
    return () => { stop = true }
  }, [workspaceId])

  // Apply filters when they change (non-search)
  useEffect(() => {
    if (loading) return
    applyFilters(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sourceFilter, scoreRange, tagFilter, sortBy, sortOrder, activeTab])

  const handlePageChange = (newPage: number) => {
    applyFilters(newPage)
  }

  const handleCreateContact = async () => {
    if (!newFirstName) return
    try {
      setCreatingContact(true)
      const tagsArr = newTags.split(',').map((t) => t.trim()).filter(Boolean)
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          firstName: newFirstName,
          lastName: newLastName || undefined,
          phone: newPhone || undefined,
          email: newEmail || undefined,
          source: newSource,
          tags: tagsArr,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        if (res.status === 409) {
          toast.error('Ya existe un contacto con ese número de teléfono')
          return
        }
        throw new Error(data.error || 'Error al crear contacto')
      }
      setNewFirstName('')
      setNewLastName('')
      setNewPhone('')
      setNewEmail('')
      setNewSource('whatsapp')
      setNewTags('')
      setShowNewContact(false)
      applyFilters(1)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear contacto'
      toast.error(message)
    } finally {
      setCreatingContact(false)
    }
  }

  const handleArchiveContact = async (contactId: string) => {
    try {
      setArchiving(contactId)
      const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al archivar contacto')
      setSelectedContact(null)
      applyFilters(page)
    } catch {
      toast.error('Error al archivar contacto')
    } finally {
      setArchiving(null)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const exportCSV = useCallback(() => {
    try {
      const lines: string[] = []
      lines.push('Nombre,Teléfono,Email,Lead Score,Fuente,Estado,Etiquetas')
      contacts.forEach(c => {
        lines.push(`"${c.firstName} ${c.lastName || ''}",${c.phone || ''},${c.email || ''},${c.leadScore},${c.source},${c.status},"${getVisibleTagLabels(c.tags).join('; ')}"`)
      })
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contactos-valiautoflow-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Archivo CSV descargado')
    } catch {
      toast.error('Error al exportar CSV')
    }
  }, [contacts])

  const downloadTemplate = useCallback(() => {
    const csv = [
      'Nombre,Apellido,Telefono,Correo,Fuente,Etiquetas,Estado',
      'Juan,Pérez,5219621234567,juan@ejemplo.com,facebook,prospecto;interesado,active',
      'María,López,5219629876543,,referencia,vip,active',
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla-contactos-valiautoflow.csv'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImport = useCallback(async () => {
    if (!importFile) { toast.error('Selecciona un archivo primero'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('type', 'contacts')
      fd.append('workspaceId', workspaceId)
      const res = await fetch('/api/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudo importar el archivo')
      setImportResult({ imported: data.imported, total: data.total, errors: data.errors, errorDetails: data.errorDetails })
      if (data.imported > 0) {
        toast.success(`${data.imported} contacto(s) importado(s)`)
        applyFilters(1)
        fetchTags()
      } else {
        toast.warning('No se importó ningún contacto. Revisa el archivo.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }, [importFile, workspaceId, applyFilters, fetchTags])

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const ids = Array.from(selectedIds)
      if (action === 'archive') {
        const results = await Promise.all(ids.map(id => fetch(`/api/contacts/${id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)))
        const ok = results.filter(Boolean).length
        if (ok === 0) throw new Error()
        if (ok < ids.length) toast.warning(`${ok} de ${ids.length} contacto(s) archivado(s)`)
        else toast.success(`${ok} contacto(s) archivado(s)`)
      } else if (action === 'delete') {
        const res = await fetch('/api/contacts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, contactIds: ids }),
        })
        if (!res.ok) throw new Error()
        toast.success(`${ids.length} contacto(s) eliminado(s)`)
      } else if (action === 'tag' && tagInput.trim()) {
        const tag = tagInput.trim()
        const results = await Promise.all(ids.map(id => fetch(`/api/contacts/${id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        }).then(r => r.ok).catch(() => false)))
        const ok = results.filter(Boolean).length
        if (ok === 0) throw new Error()
        if (ok < ids.length) toast.warning(`Etiqueta "${tag}" asignada a ${ok} de ${ids.length}`)
        else toast.success(`Etiqueta "${tag}" asignada a ${ok} contacto(s)`)
      }
      setSelectedIds(new Set())
      setBulkAction(null)
      setTagInput('')
      applyFilters(1)
    } catch {
      toast.error('Error al ejecutar acción masiva')
    } finally {
      setBulkLoading(false)
    }
  }

  const clearAdvancedFilters = () => {
    setScoreRange([0, 100])
    setTagFilter([])
    setSortBy('lastMessageAt')
    setSortOrder('desc')
  }

  const totalPages = Math.ceil(total / pageSize)

  if (loading && contacts.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-[140px]" />
        </div>
        <Card className="border-border/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Nombre</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="text-xs font-semibold">Score</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-border/40">
                    <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <Card className="border-border/60">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button onClick={() => applyFilters(page)} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 relative">
      {/* Panel de detalle del contacto (reutiliza el Expediente del lead) */}
      {detailContactId && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]" onClick={() => setDetailContactId(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-[360px] max-w-[92vw] shadow-2xl animate-in slide-in-from-right-4">
            <ExpedientePanel workspaceId={workspaceId} contactId={detailContactId} onClose={() => setDetailContactId(null)} embedded />
          </div>
        </>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold">Contactos</h3>
          <p className="text-sm text-muted-foreground">Gestiona y segmenta todos tus contactos en un solo lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showNewContact} onOpenChange={setShowNewContact}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4" />
                Nuevo Contacto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo Contacto</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Nombre</Label>
                    <Input placeholder="Nombre" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Apellido</Label>
                    <Input placeholder="Apellido" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Teléfono</Label>
                    <Input placeholder="(33) 1234-5678" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input placeholder="correo@ejemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Fuente</Label>
                  <Select value={newSource} onValueChange={setNewSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((ch) => (
                        <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                      ))}
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="referencia">Referencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Etiquetas</Label>
                  <Input placeholder="etiqueta1, etiqueta2" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateContact} disabled={creatingContact || !newFirstName}>
                  {creatingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Contacto
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o) { setImportFile(null); setImportResult(null) } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Importar</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-emerald-600" /> Importar contactos</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Sube tu lista de prospectos en <b>CSV o Excel</b> (.csv, .xlsx, .xls). La primera fila deben ser los encabezados.
                  Se omiten los teléfonos duplicados automáticamente.
                </p>
                <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs">
                  <p className="font-semibold mb-1">Columnas reconocidas:</p>
                  <p className="text-muted-foreground"><b>Nombre</b> (requerido), Apellido, Teléfono, Correo, Fuente, Etiquetas, Estado.</p>
                  <button onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1 text-emerald-600 hover:underline font-medium">
                    <Download className="h-3 w-3" /> Descargar plantilla de ejemplo
                  </button>
                </div>

                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null) }}
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-border/70 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors p-6 flex flex-col items-center gap-2 text-center"
                >
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  {importFile ? (
                    <span className="text-sm font-medium text-foreground">{importFile.name}</span>
                  ) : (
                    <><span className="text-sm font-medium">Haz clic para seleccionar tu archivo</span>
                    <span className="text-xs text-muted-foreground">CSV o Excel · hasta 10 MB</span></>
                  )}
                </button>

                {importResult && (
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1.5">
                    <div className="flex items-center gap-2 text-emerald-600 font-medium"><CheckCircle2 className="h-4 w-4" /> {importResult.imported} de {importResult.total} contactos importados</div>
                    {importResult.errors > 0 && (
                      <div className="text-xs text-amber-600">{importResult.errors} fila(s) omitida(s) (duplicados o sin nombre)</div>
                    )}
                    {importResult.errorDetails && importResult.errorDetails.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground max-h-24 overflow-y-auto custom-scroll list-disc pl-4">
                        {importResult.errorDetails.slice(0, 8).map((er, i) => <li key={i}>Fila {er.row}: {er.message}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>Cerrar</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleImport} disabled={importing || !importFile}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Importar contactos
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
        </div>
      </div>

      {/* 5 KPIs reales (estilo del mockup) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[
          { icon: <Users className="h-5 w-5" />, label: 'Contactos totales', value: (cStats?.total ?? total), sub: 'en el CRM', subC: 'text-muted-foreground', bg: 'from-violet-500 to-violet-700 shadow-violet-500/30' },
          { icon: <UserPlus className="h-5 w-5" />, label: 'Nuevos este mes', value: (cStats?.newThisMonth ?? 0), sub: cStats ? `${cStats.newThisMonthDelta >= 0 ? '+' : ''}${cStats.newThisMonthDelta}% vs mes anterior` : '', subC: (cStats?.newThisMonthDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500', bg: 'from-blue-500 to-blue-700 shadow-blue-500/30' },
          { icon: <CheckCircle2 className="h-5 w-5" />, label: 'Clientes', value: (cStats?.clientes ?? 0), sub: 'con trato ganado', subC: 'text-emerald-500', bg: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30' },
          { icon: <Flame className="h-5 w-5" />, label: 'Leads calientes', value: (cStats?.hotLeads ?? 0), sub: 'score ≥ 70', subC: 'text-orange-500', bg: 'from-orange-500 to-amber-600 shadow-orange-500/30' },
          { icon: <BellOff className="h-5 w-5" />, label: 'Sin contacto (30 días)', value: (cStats?.noContact30d ?? 0), sub: 'requieren seguimiento', subC: 'text-red-500', bg: 'from-red-500 to-rose-700 shadow-red-500/30' },
        ].map((k) => (
          <Card key={k.label} className="border-border/60 bg-card dark:bg-zinc-900/60">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br shadow-lg', k.bg)}>{k.icon}</div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                <p className="text-2xl font-bold tracking-tight leading-tight">{Number(k.value).toLocaleString('es-MX')}</p>
                {k.sub && <p className={cn('text-[10px] mt-0.5 font-medium', k.subC)}>{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Origen por canal: qué canal trae los leads (y cuáles vienen CALIENTES).
          Insumo directo para decidir dónde invertir el marketing. */}
      {cStats?.bySource && cStats.bySource.length > 0 && (
        <Card className="border-border/60 bg-card dark:bg-zinc-900/60 mb-4">
          <CardContent className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Origen de tus leads</span>
            {cStats.bySource.map((s) => {
              const hotPct = s.total > 0 ? Math.round((s.hot / s.total) * 100) : 0
              return (
                <span key={s.source} className="inline-flex items-center gap-1.5 text-xs">
                  <span className="font-semibold capitalize">{s.source}</span>
                  <span className="text-muted-foreground">{s.total.toLocaleString('es-MX')}</span>
                  {s.hot > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 text-orange-500 px-1.5 py-0.5 text-[10px] font-semibold">
                      <Flame className="h-2.5 w-2.5" /> {s.hot} ({hotPct}%)
                    </span>
                  )}
                </span>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Pestañas de segmento (como el mockup) */}
      <div className="flex items-center gap-4 border-b border-border mb-4 overflow-x-auto custom-scroll">
        {([
          { key: 'todos', label: 'Todos', count: cStats?.tabs.todos ?? total, score: null as [number, number] | null },
          { key: 'leads', label: 'Leads', count: cStats?.tabs.leads ?? 0, score: [0, 39] as [number, number] },
          { key: 'clientes', label: 'Clientes', count: cStats?.tabs.clientes ?? 0, score: null },
          { key: 'prospectos', label: 'Prospectos', count: cStats?.tabs.prospectos ?? 0, score: [40, 69] as [number, number] },
          { key: 'inactivos', label: 'Inactivos', count: cStats?.tabs.inactivos ?? 0, score: null },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn('flex items-center gap-1.5 pb-2 -mb-px border-b-2 text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === t.key ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t.label}
            <span className={cn('h-5 min-w-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center', activeTab === t.key ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground')}>{Number(t.count).toLocaleString('es-MX')}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, teléfono, email..."
              className="pl-8 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="h-9 text-sm w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
                <SelectItem value="archived">Archivados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={handleSourceFilterChange}>
              <SelectTrigger className="h-9 text-sm w-[140px]">
                <SelectValue placeholder="Fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="webchat">Web Chat</SelectItem>
                <SelectItem value="referencia">Referencia</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {(scoreRange[0] > 0 || scoreRange[1] < 100 || tagFilter.length > 0) && (
                <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-emerald-500 text-white border-0">
                  !
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros Avanzados</h4>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAdvancedFilters}>
                  <X className="h-3 w-3 mr-1" />
                  Limpiar
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Lead Score Range */}
                <div className="space-y-2">
                  <Label className="text-xs">Lead Score: {scoreRange[0]} - {scoreRange[1]}</Label>
                  <Slider
                    value={scoreRange}
                    onValueChange={(val) => setScoreRange(val as [number, number])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                {/* Tags Multi-Select */}
                <div className="space-y-2">
                  <Label className="text-xs">Etiquetas</Label>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {allTags.length > 0 ? allTags.map(tag => (
                      <button
                        key={tag}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                          tagFilter.includes(tag)
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
                            : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                        )}
                        onClick={() => {
                          setTagFilter(prev =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          )
                        }}
                      >
                        {formatTagLabel(tag)}
                      </button>
                    )) : (
                      <span className="text-[10px] text-muted-foreground">Sin etiquetas disponibles</span>
                    )}
                  </div>
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <Label className="text-xs">Ordenar por</Label>
                  <div className="flex gap-2">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lastMessageAt">Última Actividad</SelectItem>
                        <SelectItem value="leadScore">Lead Score</SelectItem>
                        <SelectItem value="createdAt">Fecha Creación</SelectItem>
                        <SelectItem value="firstName">Nombre</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </Button>
                  </div>
                </div>

                {/* Quick Status */}
                <div className="space-y-2">
                  <Label className="text-xs">Acciones rápidas</Label>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-full gap-1.5" onClick={exportCSV}>
                    <Download className="h-3 w-3" />
                    Exportar filtrados a CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => handleBulkAction('archive')} disabled={bulkLoading}>
              {bulkLoading && bulkAction === 'archive' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
              Archivar
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setBulkAction('tag')} disabled={bulkLoading}>
              <Tag className="h-3 w-3" />
              Asignar Etiqueta
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCSV} disabled={bulkLoading}>
              <Download className="h-3 w-3" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700" onClick={() => handleBulkAction('delete')} disabled={bulkLoading}>
              {bulkLoading && bulkAction === 'delete' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Eliminar
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Tag Assignment Dialog */}
      <Dialog open={bulkAction === 'tag'} onOpenChange={(open) => { if (!open) setBulkAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Etiqueta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Etiqueta</Label>
              <Input placeholder="Nombre de la etiqueta" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleBulkAction('tag')} disabled={!tagInput || bulkLoading}>
                {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Asignar a {selectedIds.size} contacto(s)
              </Button>
              <Button variant="outline" onClick={() => setBulkAction(null)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-xs font-semibold w-10">
                  <button onClick={toggleSelectAll}>
                    {selectedIds.size === contacts.length && contacts.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="text-xs font-semibold">Contacto</TableHead>
                <TableHead className="text-xs font-semibold hidden xl:table-cell">Etiquetas</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Última interacción</TableHead>
                <TableHead className="text-xs font-semibold">Puntaje</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Fuente</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Estado</TableHead>
                <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No hay contactos</p>
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => {
                  const visibleTags = getVisibleTagLabels(contact.tags)

                  return (
                  <TableRow
                    key={contact.id}
                    className={cn(
                      'border-border/40 cursor-pointer hover:bg-muted/30',
                      selectedIds.has(contact.id) && 'bg-emerald-50/50 dark:bg-emerald-500/5'
                    )}
                    onClick={() => setDetailContactId(contact.id)}
                  >
                    <TableCell>
                      <button onClick={(e) => { e.stopPropagation(); toggleSelect(contact.id) }}>
                        {selectedIds.has(contact.id) ? (
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {contact.avatar ? <AvatarImage src={contact.avatar} alt={contact.firstName} /> : null}
                          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-xs font-semibold dark:bg-zinc-800 dark:text-zinc-300">
                            {getInitials(`${contact.firstName} ${contact.lastName || ''}`)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {contact.firstName} {contact.lastName || ''}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatPhoneNumber(contact.phone) || '—'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {visibleTags.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                        {visibleTags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] bg-muted border-0">{tag}</Badge>
                        ))}
                        {visibleTags.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{visibleTags.length - 2}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {contact.lastMessageAt ? (
                        <div>
                          <p className="text-xs text-foreground">{timeAgo(new Date(contact.lastMessageAt))}</p>
                          <p className="text-[10px] text-muted-foreground">{contact.source || 'whatsapp'}</p>
                        </div>
                      ) : <span className="text-[10px] text-muted-foreground">Sin interacción</span>}
                    </TableCell>
                    <TableCell><ScoreRing score={contact.leadScore} size={34} strokeWidth={3} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px] bg-muted border-0">{contact.source || '—'}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(() => {
                        const sc = contact.leadScore || 0
                        const est = sc >= 70 ? { l: 'Caliente', c: 'bg-red-500/15 text-red-600 dark:text-red-400' } : sc >= 40 ? { l: 'Prospecto', c: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' } : { l: 'Lead', c: 'bg-zinc-500/15 text-zinc-500' }
                        return <Badge className={cn('text-[10px] border-0 gap-1', est.c)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{est.l}</Badge>
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetailContactId(contact.id) }}>
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewChange?.('inbox') }}>
                            Enviar mensaje
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => { e.stopPropagation(); handleArchiveContact(contact.id) }}
                            disabled={archiving === contact.id}
                          >
                            {archiving === contact.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            Archivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Mostrando {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              if (pageNum > totalPages) return null
              return (
                <Button key={pageNum} variant={page === pageNum ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => handlePageChange(pageNum)}>
                  {pageNum}
                </Button>
              )
            })}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Detail Slide-Over */}
      <Sheet open={!!selectedContact} onOpenChange={() => setSelectedContact(null)}>
        <SheetContent className="w-full sm:w-[440px] p-0">
          {selectedContact && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 pb-4">
                <SheetTitle className="text-left">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">
                        {getInitials(`${selectedContact.firstName} ${selectedContact.lastName || ''}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-base font-semibold">{selectedContact.firstName} {selectedContact.lastName || ''}</h3>
                      <p className="text-xs text-muted-foreground">{selectedContact.source || '—'} · {timeAgo(new Date(selectedContact.createdAt))}</p>
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <Separator />

              <ScrollArea className="flex-1 min-h-0 px-6 py-4">
                <div className="space-y-5">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Información</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatPhoneNumber(selectedContact.phone)}</span>
                      </div>
                      {selectedContact.email && (
                        <div className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{selectedContact.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted/50 dark:bg-slate-800/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact.leadScore}</p>
                      <p className="text-[10px] text-muted-foreground">Lead Score</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50 dark:bg-slate-800/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact._count?.conversations || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Mensajes</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50 dark:bg-slate-800/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact._count?.deals || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Tratos</p>
                    </div>
                  </div>

                  {getContactInfoEntries(selectedContact.customFields).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datos detectados</h4>
                      <div className="rounded-lg border border-border/60 divide-y divide-border/50">
                        {getContactInfoEntries(selectedContact.customFields).map((item) => (
                          <div key={item.label} className="flex items-start justify-between gap-3 px-3 py-2">
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                            <span className="text-xs font-medium text-right break-all">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {getVisibleTagLabels(selectedContact.tags).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Etiquetas</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {getVisibleTagLabels(selectedContact.tags).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</h4>
                    <Badge className={cn(
                      'text-xs border-0',
                      selectedContact.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                      selectedContact.status === 'inactive' ? 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' :
                      'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    )}>
                      {selectedContact.status === 'active' ? 'Activo' :
                       selectedContact.status === 'inactive' ? 'Inactivo' : 'Archivado'}
                    </Badge>
                  </div>
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      setSelectedContact(null)
                      if (onOpenContact) {
                        onOpenContact(selectedContact.id)
                      } else {
                        onViewChange?.('inbox')
                      }
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar Mensaje
                  </Button>
                  {selectedContact.phone && (
                    <a href={`tel:+${selectedContact.phone.replace(/\D/g, '')}`}>
                      <Button variant="outline" className="gap-2"><Phone className="h-4 w-4" />Llamar</Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
