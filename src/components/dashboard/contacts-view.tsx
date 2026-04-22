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
} from 'lucide-react'
import { cn, formatPhoneNumber, timeAgo, getInitials, getStageColor } from '@/lib/utils'
import { CHANNELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
  status: string
  createdAt: string
  _count?: {
    conversations: number
    deals: number
  }
}

interface ContactsViewProps {
  workspaceId: string
  onViewChange?: (view: string) => void
}

function getScoreBadge(score: number) {
  if (score >= 80) return <Badge className="h-5 text-[10px] px-1.5 bg-emerald-100 text-emerald-700 border-0 font-semibold">{score}</Badge>
  if (score >= 60) return <Badge className="h-5 text-[10px] px-1.5 bg-yellow-100 text-yellow-700 border-0 font-semibold">{score}</Badge>
  if (score >= 40) return <Badge className="h-5 text-[10px] px-1.5 bg-orange-100 text-orange-700 border-0 font-semibold">{score}</Badge>
  return <Badge className="h-5 text-[10px] px-1.5 bg-red-100 text-red-700 border-0 font-semibold">{score}</Badge>
}

// ── Contacts View ──

export function ContactsView({ workspaceId, onViewChange }: ContactsViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
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

  // Form state
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newSource, setNewSource] = useState('whatsapp')
  const [newTags, setNewTags] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchContacts = useCallback(async (p = 1, search = '', status = 'all', source = 'all') => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        workspaceId,
        page: p.toString(),
        limit: pageSize.toString(),
      })
      if (search) params.set('search', search)
      if (status !== 'all') params.set('status', status)
      if (source !== 'all') params.set('source', source)

      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) throw new Error('Error al cargar contactos')
      const data = await res.json()

      // Parse tags from JSON string (safe parsing)
      const safeParseTags = (raw: unknown): string[] => {
        if (Array.isArray(raw)) return raw
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) return parsed
          } catch {
            // Fallback: split by comma for raw strings like "calificado, lead"
            return raw.split(',').map((t: string) => t.trim()).filter(Boolean)
          }
        }
        return []
      }
      const parsed = (data.items || []).map((c: Record<string, unknown>) => ({
        ...c,
        tags: safeParseTags(c.tags),
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
    fetchContacts(1, '', 'all', 'all')
  }, [fetchContacts])

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      fetchContacts(1, value, statusFilter, sourceFilter)
    }, 400)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    fetchContacts(1, searchQuery, value, sourceFilter)
  }

  const handleSourceFilterChange = (value: string) => {
    setSourceFilter(value)
    fetchContacts(1, searchQuery, statusFilter, value)
  }

  const handlePageChange = (newPage: number) => {
    fetchContacts(newPage, searchQuery, statusFilter, sourceFilter)
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

      // Reset form and refresh
      setNewFirstName('')
      setNewLastName('')
      setNewPhone('')
      setNewEmail('')
      setNewSource('whatsapp')
      setNewTags('')
      setShowNewContact(false)
      fetchContacts(1, searchQuery, statusFilter, sourceFilter)
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
      fetchContacts(page, searchQuery, statusFilter, sourceFilter)
    } catch {
      toast.error('Error al archivar contacto')
    } finally {
      setArchiving(null)
    }
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
            <Button onClick={() => fetchContacts(page, searchQuery, statusFilter, sourceFilter)} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold">Contactos</h3>
          <p className="text-sm text-muted-foreground">
            {contacts.length} de {total} contactos
          </p>
        </div>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreateContact}
                disabled={creatingContact || !newFirstName}
              >
                {creatingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear Contacto
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
        </div>
      </div>

      {/* Table */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Nombre</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Teléfono</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-xs font-semibold">Score</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Fuente</TableHead>
                <TableHead className="text-xs font-semibold hidden xl:table-cell">Etiquetas</TableHead>
                <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No hay contactos</p>
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="border-border/40 cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-zinc-100 text-zinc-600 text-xs font-semibold">
                            {getInitials(`${contact.firstName} ${contact.lastName || ''}`)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {contact.firstName} {contact.lastName || ''}
                          </p>
                          <p className="text-[10px] text-muted-foreground md:hidden">
                            {formatPhoneNumber(contact.phone)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {formatPhoneNumber(contact.phone)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {contact.email || '—'}
                      </span>
                    </TableCell>
                    <TableCell>{getScoreBadge(contact.leadScore)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px] bg-muted border-0">
                        {contact.source || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {contact.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] bg-muted border-0">
                            {tag}
                          </Badge>
                        ))}
                        {contact.tags.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{contact.tags.length - 2}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedContact(contact) }}>
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
                ))
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
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              if (pageNum > totalPages) return null
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 w-8 text-xs"
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
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
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">
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

              <ScrollArea className="flex-1 px-6 py-4">
                <div className="space-y-5">
                  {/* Contact Info */}
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

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact.leadScore}</p>
                      <p className="text-[10px] text-muted-foreground">Lead Score</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact._count?.conversations || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Mensajes</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{selectedContact._count?.deals || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Tratos</p>
                    </div>
                  </div>

                  {/* Tags */}
                  {selectedContact.tags.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Etiquetas</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedContact.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</h4>
                    <Badge
                      className={cn(
                        'text-xs border-0',
                        selectedContact.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        selectedContact.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
                        'bg-red-100 text-red-700'
                      )}
                    >
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
                      onViewChange?.('inbox')
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar Mensaje
                  </Button>
                  {selectedContact.phone && (
                    <a href={`tel:${selectedContact.phone}`}>
                      <Button variant="outline" className="gap-2">
                        <Phone className="h-4 w-4" />
                        Llamar
                      </Button>
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
