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
  Search, RefreshCw, Lightbulb, ChevronLeft, ChevronRight,
  ThumbsUp, CheckCircle2, XCircle, Clock, Eye, User, Tag, MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface Suggestion {
  id: string
  userId: string | null
  workspaceId: string | null
  userName: string
  userEmail: string
  title: string
  description: string
  category: string
  status: string
  votes: number
  adminNotes: string | null
  createdAt: string
  updatedAt: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  reviewing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  accepted: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  implemented: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
}

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  reviewing: Eye,
  accepted: CheckCircle2,
  rejected: XCircle,
  implemented: CheckCircle2,
}

const categoryLabels: Record<string, string> = {
  feature: 'Función',
  improvement: 'Mejora',
  bug: 'Bug',
  other: 'Otro',
}

function SuggestionDialog({
  suggestion, open, onClose, onUpdated,
}: { suggestion: Suggestion | null; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [status, setStatus] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [votes, setVotes] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (suggestion) {
      setStatus(suggestion.status)
      setAdminNotes(suggestion.adminNotes || '')
      setVotes(suggestion.votes)
    }
  }, [suggestion])

  const save = async () => {
    if (!suggestion) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes: adminNotes || null, votes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Sugerencia actualizada')
      onUpdated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!suggestion) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{suggestion.title}</DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-xs ${statusColors[suggestion.status]}`}>{suggestion.status}</Badge>
            <span className="text-gray-500 text-xs">{suggestion.userName} · {suggestion.userEmail}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-300 text-sm leading-relaxed">{suggestion.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5 bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {['pending', 'reviewing', 'accepted', 'rejected', 'implemented'].map(s => (
                    <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Votos</Label>
              <Input
                type="number"
                value={votes}
                onChange={e => setVotes(Number(e.target.value))}
                min={0}
                className="mt-1.5 bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Notas internas (admin)</Label>
            <Textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Notas internas sobre esta sugerencia..."
              rows={3}
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

export default function AdminSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('createdAt')
  const [selected, setSelected] = useState<Suggestion | null>(null)

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20', sortBy })
      if (search) p.set('search', search)
      if (statusFilter !== 'all') p.set('status', statusFilter)
      if (categoryFilter !== 'all') p.set('category', categoryFilter)
      const res = await fetch(`/api/admin/suggestions?${p}`)
      const data = await res.json()
      if (res.ok) {
        setSuggestions(data.suggestions)
        setTotal(data.pagination?.total ?? 0)
        setPages(data.pagination?.pages ?? 1)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter, sortBy])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  const quickUpdate = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/admin/suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    toast.success('Actualizado')
    fetchSuggestions()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sugerencias</h1>
          <p className="text-gray-400 text-sm mt-1">{total} sugerencias de usuarios</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSuggestions} className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {['pending', 'reviewing', 'accepted', 'rejected', 'implemented'].map(s => {
          const Icon = statusIcons[s] || Clock
          const count = suggestions.filter(sg => sg.status === s).length
          return (
            <Card key={s} className={`bg-gray-900 border-gray-800 cursor-pointer transition-colors hover:border-gray-700 ${statusFilter === s ? 'border-violet-500/50' : ''}`}
              onClick={() => { setStatusFilter(s === statusFilter ? 'all' : s); setPage(1) }}>
              <CardContent className="p-4 flex items-center gap-2">
                <Icon className="w-6 h-6 text-gray-400 shrink-0" />
                <div>
                  <p className="text-gray-400 text-xs capitalize">{s}</p>
                  <p className="text-white text-lg font-bold">{count}</p>
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
                placeholder="Buscar por título o usuario..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1) }}>
              <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todas</SelectItem>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-white">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="createdAt" className="text-white">Más recientes</SelectItem>
                <SelectItem value="votes" className="text-white">Más votadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-44 bg-gray-800 rounded-xl" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="py-16 text-center text-gray-500">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay sugerencias</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {suggestions.map(sg => {
            const StatusIcon = statusIcons[sg.status] || Clock
            return (
              <Card key={sg.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
                onClick={() => setSelected(sg)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${statusColors[sg.status]}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {sg.status}
                      </Badge>
                      <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        {categoryLabels[sg.category] || sg.category}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white hover:bg-gray-700 -mt-1 -mr-2"
                          onClick={e => e.stopPropagation()}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
                        <DropdownMenuItem className="text-emerald-400 hover:bg-gray-700 cursor-pointer"
                          onClick={e => { e.stopPropagation(); quickUpdate(sg.id, { status: 'accepted' }) }}>
                          <CheckCircle2 className="w-4 h-4 mr-2" />Aceptar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-violet-400 hover:bg-gray-700 cursor-pointer"
                          onClick={e => { e.stopPropagation(); quickUpdate(sg.id, { status: 'implemented' }) }}>
                          <CheckCircle2 className="w-4 h-4 mr-2" />Marcar implementada
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-400 hover:bg-gray-700 cursor-pointer"
                          onClick={e => { e.stopPropagation(); quickUpdate(sg.id, { status: 'rejected' }) }}>
                          <XCircle className="w-4 h-4 mr-2" />Rechazar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h3 className="text-white font-semibold text-sm mb-1.5 leading-snug">{sg.title}</h3>
                  <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">{sg.description}</p>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                      <User className="w-3 h-3" />
                      <span>{sg.userName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                      <ThumbsUp className="w-3 h-3" />
                      {sg.votes}
                    </div>
                  </div>

                  {sg.adminNotes && (
                    <p className="text-violet-400 text-xs mt-2 italic truncate">{sg.adminNotes}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-gray-400 text-sm">{page} / {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <SuggestionDialog suggestion={selected} open={!!selected} onClose={() => setSelected(null)} onUpdated={fetchSuggestions} />
    </div>
  )
}
