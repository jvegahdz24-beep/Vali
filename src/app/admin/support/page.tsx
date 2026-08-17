'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Search, RefreshCw, MoreHorizontal, MessageSquare, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, CheckCircle2, XCircle, Flame, ArrowUp, Minus, ArrowDown,
  User, Tag,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface Ticket {
  id: string
  userId: string | null
  workspaceId: string | null
  userName: string
  userEmail: string
  subject: string
  description: string
  priority: string
  status: string
  category: string
  assignedTo: string | null
  response: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const priorityIcons: Record<string, React.ElementType> = {
  critical: Flame,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  closed: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const statusIcons: Record<string, React.ElementType> = {
  open: AlertTriangle,
  in_progress: Clock,
  resolved: CheckCircle2,
  closed: XCircle,
}

const categoryLabels: Record<string, string> = {
  general: 'General',
  billing: 'Facturación',
  technical: 'Técnico',
  feature_request: 'Función',
  bug: 'Bug',
}

function TicketDialog({
  ticket, open, onClose, onUpdated,
}: { ticket: Ticket | null; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [response, setResponse] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status)
      setPriority(ticket.priority)
      setAssignedTo(ticket.assignedTo || '')
      setResponse(ticket.response || '')
    }
  }, [ticket])

  const save = async () => {
    if (!ticket) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/support/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, priority, assignedTo: assignedTo || null, response: response || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Ticket actualizado')
      onUpdated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!ticket) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{ticket.subject}</DialogTitle>
          <p className="text-gray-400 text-xs mt-1">
            {ticket.userName} · {ticket.userEmail} · {new Date(ticket.createdAt).toLocaleString('es-MX')}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-300 text-sm leading-relaxed">{ticket.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                    <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {['low', 'medium', 'high', 'critical'].map(p => (
                    <SelectItem key={p} value={p} className="text-white">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Asignado a</Label>
            <Input
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              placeholder="Email del agente de soporte"
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
            />
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Respuesta al usuario</Label>
            <Textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="Escribe la respuesta para el usuario..."
              rows={4}
              className="mt-1.5 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selected, setSelected] = useState<Ticket | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) p.set('search', search)
      if (statusFilter !== 'all') p.set('status', statusFilter)
      if (priorityFilter !== 'all') p.set('priority', priorityFilter)
      if (categoryFilter !== 'all') p.set('category', categoryFilter)
      const res = await fetch(`/api/admin/support?${p}`)
      const data = await res.json()
      if (res.ok) {
        setTickets(data.tickets)
        setTotal(data.pagination?.total ?? 0)
        setPages(data.pagination?.pages ?? 1)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, priorityFilter, categoryFilter])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const openCount = tickets.filter(t => t.status === 'open').length
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Soporte</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} tickets · {openCount} abiertos · {inProgressCount} en progreso
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {['open', 'in_progress', 'resolved', 'closed'].map(s => {
          const Icon = statusIcons[s] || AlertTriangle
          const count = tickets.filter(t => t.status === s).length
          return (
            <Card key={s} className="bg-gray-900 border-gray-800 cursor-pointer hover:border-gray-700 transition-colors"
              onClick={() => { setStatusFilter(s === statusFilter ? 'all' : s); setPage(1) }}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-7 h-7 shrink-0 ${statusColors[s]?.includes('blue') ? 'text-blue-400' : statusColors[s]?.includes('violet') ? 'text-violet-400' : statusColors[s]?.includes('emerald') ? 'text-emerald-400' : 'text-gray-400'}`} />
                <div>
                  <p className="text-gray-400 text-xs capitalize">{s.replace('_', ' ')}</p>
                  <p className="text-white text-xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="bg-gray-900 border-gray-800 mb-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Buscar por asunto, usuario o email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            {[
              { val: statusFilter, set: setStatusFilter, opts: ['all', 'open', 'in_progress', 'resolved', 'closed'], label: 'Estado' },
              { val: priorityFilter, set: setPriorityFilter, opts: ['all', 'low', 'medium', 'high', 'critical'], label: 'Prioridad' },
              { val: categoryFilter, set: setCategoryFilter, opts: ['all', 'general', 'billing', 'technical', 'feature_request', 'bug'], label: 'Categoría' },
            ].map(({ val, set, opts, label }) => (
              <Select key={label} value={val} onValueChange={v => { set(v); setPage(1) }}>
                <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder={label} />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {opts.map(o => (
                    <SelectItem key={o} value={o} className="text-white">
                      {o === 'all' ? `Todos` : categoryLabels[o] || o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-6 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Asunto</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Prioridad</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      {[...Array(7)].map((_, j) => <td key={j} className="px-4 py-4"><Skeleton className="h-4 bg-gray-800" /></td>)}
                    </tr>
                  ))
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>No hay tickets</p>
                    </td>
                  </tr>
                ) : tickets.map(ticket => {
                  const PriorityIcon = priorityIcons[ticket.priority] || Minus
                  const StatusIcon = statusIcons[ticket.status] || Clock
                  return (
                    <tr key={ticket.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                      onClick={() => setSelected(ticket)}>
                      <td className="px-6 py-4">
                        <p className="text-white text-sm font-medium truncate max-w-[220px]">{ticket.subject}</p>
                        <p className="text-gray-500 text-xs truncate max-w-[220px] mt-0.5">{ticket.description}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-gray-500 shrink-0" />
                          <div>
                            <p className="text-gray-300 text-sm">{ticket.userName}</p>
                            <p className="text-gray-500 text-xs">{ticket.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                          <Tag className="w-3 h-3" />
                          {categoryLabels[ticket.category] || ticket.category}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={`text-xs inline-flex items-center gap-1 ${priorityColors[ticket.priority] || ''}`}>
                          <PriorityIcon className="w-3 h-3" />
                          {ticket.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={`text-xs inline-flex items-center gap-1 ${statusColors[ticket.status] || ''}`}>
                          <StatusIcon className="w-3 h-3" />
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(ticket.createdAt).toLocaleDateString('es-MX')}
                      </td>
                      <td className="px-4 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700"
                              onClick={e => e.stopPropagation()}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
                            <DropdownMenuItem className="text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                              onClick={e => { e.stopPropagation(); setSelected(ticket) }}>
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Ver y responder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-gray-700" />
                            {ticket.status !== 'resolved' && (
                              <DropdownMenuItem className="text-emerald-400 hover:bg-gray-700 cursor-pointer"
                                onClick={e => {
                                  e.stopPropagation()
                                  fetch(`/api/admin/support/${ticket.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: 'resolved' }),
                                  }).then(() => { toast.success('Ticket resuelto'); fetchTickets() })
                                }}>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Marcar resuelto
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-gray-400 hover:bg-gray-700 cursor-pointer"
                              onClick={e => {
                                e.stopPropagation()
                                fetch(`/api/admin/support/${ticket.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'closed' }),
                                }).then(() => { toast.success('Ticket cerrado'); fetchTickets() })
                              }}>
                              <XCircle className="w-4 h-4 mr-2" />
                              Cerrar ticket
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
              <p className="text-gray-400 text-sm">{total} tickets</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-400 text-sm px-2">{page} / {pages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TicketDialog ticket={selected} open={!!selected} onClose={() => setSelected(null)} onUpdated={fetchTickets} />
    </div>
  )
}
