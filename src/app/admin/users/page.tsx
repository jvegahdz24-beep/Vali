'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search, Users, ChevronLeft, ChevronRight,
  Mail, Phone, Building2, Calendar, Shield,
  MoreHorizontal, Eye, Pencil, Trash2, RefreshCw,
  CheckCircle2, XCircle, Crown,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface User {
  id: string
  name: string | null
  email: string
  role: string
  emailVerified: string | null
  createdAt: string
  phone: string | null
  image: string | null
  ownedWorkspaces: {
    id: string
    name: string
    plan: string
    isActive: boolean
    subscription: { plan: string; status: string; trialEnd: string | null } | null
    _count: { contacts: number; conversations: number }
  }[]
}

interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

const roleColors: Record<string, string> = {
  superadmin: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  owner: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  admin: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  member: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

const planColors: Record<string, string> = {
  enterprise: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  pro: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  starter: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  trial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  free: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

function UserDetailDialog({
  userId,
  open,
  onClose,
  onUpdated,
}: {
  userId: string
  open: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [editRole, setEditRole] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && userId) {
      setLoading(true)
      fetch(`/api/admin/users/${userId}`)
        .then(r => r.json())
        .then(d => {
          setUser(d.user)
          setEditRole(d.user?.role || '')
        })
        .finally(() => setLoading(false))
    }
  }, [open, userId])

  const handleSaveRole = async () => {
    if (!user || editRole === user.role) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Rol actualizado')
      onUpdated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const handleSuspend = async (isActive: boolean) => {
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(isActive ? 'Workspace reactivado' : 'Workspace suspendido')
      onUpdated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de Usuario</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 bg-gray-800" />)}
          </div>
        ) : user ? (
          <div className="space-y-5">
            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center text-xl font-bold">
                {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white font-semibold text-lg">{user.name || 'Sin nombre'}</p>
                <p className="text-gray-400 text-sm">{user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`text-xs ${roleColors[user.role] || roleColors.member}`}>
                    {user.role}
                  </Badge>
                  {user.emailVerified && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Email verificado
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Phone className="w-4 h-4" />
                <span>{user.phone || 'Sin teléfono'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Calendar className="w-4 h-4" />
                <span>Registrado: {new Date(user.createdAt).toLocaleDateString('es-MX')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Building2 className="w-4 h-4" />
                <span>{user.ownedWorkspaces.length} workspace(s)</span>
              </div>
            </div>

            {/* Workspaces */}
            {user.ownedWorkspaces.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Workspaces</p>
                <div className="space-y-2">
                  {user.ownedWorkspaces.map(ws => (
                    <div key={ws.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">{ws.name}</p>
                        <p className="text-gray-500 text-xs">
                          {ws._count.contacts} contactos · {ws._count.conversations} conversaciones
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${planColors[ws.plan] || planColors.free}`}>
                          {ws.plan}
                        </Badge>
                        <Badge className={ws.isActive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs'
                          : 'bg-red-500/20 text-red-300 border-red-500/30 text-xs'
                        }>
                          {ws.isActive ? 'Activo' : 'Suspendido'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Role */}
            <div>
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Cambiar Rol</Label>
              <div className="flex gap-2 mt-2">
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {['member', 'admin', 'owner', 'superadmin'].map(r => (
                      <SelectItem key={r} value={r} className="text-white hover:bg-gray-700">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSaveRole}
                  disabled={saving || editRole === user.role}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  Guardar
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {user.ownedWorkspaces.some(ws => ws.isActive) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuspend(false)}
                  disabled={saving}
                  className="border-red-500/30 text-red-400 hover:bg-red-950/30 hover:text-red-300"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Suspender workspace
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuspend(true)}
                  disabled={saving}
                  className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/30"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Reactivar workspace
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 py-4">Usuario no encontrado</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300 hover:bg-gray-800">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [page, setPage] = useState(1)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(roleFilter !== 'all' && { role: roleFilter }),
        ...(planFilter !== 'all' && { plan: planFilter }),
      })
      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users)
        setPagination(data.pagination)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, planFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`¿Eliminar usuario ${email}? Esta acción es irreversible.`)) return
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Usuario eliminado')
      fetchUsers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-gray-400 text-sm mt-1">
            {pagination.total} usuarios registrados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsers}
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-gray-900 border-gray-800 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos los roles</SelectItem>
                <SelectItem value="superadmin" className="text-white">Superadmin</SelectItem>
                <SelectItem value="owner" className="text-white">Owner</SelectItem>
                <SelectItem value="admin" className="text-white">Admin</SelectItem>
                <SelectItem value="member" className="text-white">Member</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={v => { setPlanFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all" className="text-white">Todos los planes</SelectItem>
                <SelectItem value="enterprise" className="text-white">Enterprise</SelectItem>
                <SelectItem value="pro" className="text-white">Pro</SelectItem>
                <SelectItem value="starter" className="text-white">Starter</SelectItem>
                <SelectItem value="trial" className="text-white">Trial</SelectItem>
                <SelectItem value="free" className="text-white">Free</SelectItem>
              </SelectContent>
            </Select>
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
                  <th className="text-left px-6 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Rol</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Plan</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Workspace</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Registrado</th>
                  <th className="text-left px-4 py-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <Skeleton className="h-5 bg-gray-800 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>No se encontraron usuarios</p>
                    </td>
                  </tr>
                ) : (
                  users.map(user => {
                    const ws = user.ownedWorkspaces[0]
                    const plan = ws?.plan || 'free'
                    return (
                      <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-violet-600/30 flex items-center justify-center text-sm font-bold text-violet-300 shrink-0">
                              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium leading-tight">
                                {user.name || <span className="text-gray-500 italic">Sin nombre</span>}
                              </p>
                              <p className="text-gray-500 text-xs">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={`text-xs ${roleColors[user.role] || roleColors.member}`}>
                            {user.role === 'superadmin' && <Crown className="w-3 h-3 mr-1" />}
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={`text-xs ${planColors[plan] || planColors.free}`}>
                            {plan}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-gray-300 text-sm">{ws?.name || '—'}</p>
                          {ws && (
                            <p className="text-gray-600 text-xs">
                              {ws._count.contacts} contactos
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">
                          {new Date(user.createdAt).toLocaleDateString('es-MX')}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${user.emailVerified ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            <span className="text-gray-400 text-xs">
                              {user.emailVerified ? 'Verificado' : 'Pendiente'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
                              <DropdownMenuItem
                                className="text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                                onClick={() => { setSelectedUserId(user.id); setDetailOpen(true) }}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-gray-300 hover:text-white hover:bg-gray-700 cursor-pointer"
                                onClick={() => { setSelectedUserId(user.id); setDetailOpen(true) }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar rol
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              <DropdownMenuItem
                                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 cursor-pointer"
                                onClick={() => handleDelete(user.id, user.email)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Eliminar usuario
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
              <p className="text-gray-400 text-sm">
                Mostrando {Math.min((page - 1) * pagination.limit + 1, pagination.total)}–
                {Math.min(page * pagination.limit, pagination.total)} de {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-400 text-sm px-2">{page} / {pagination.pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      {selectedUserId && (
        <UserDetailDialog
          userId={selectedUserId}
          open={detailOpen}
          onClose={() => { setDetailOpen(false); setSelectedUserId('') }}
          onUpdated={fetchUsers}
        />
      )}
    </div>
  )
}
