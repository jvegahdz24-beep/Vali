'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Users,
  UserPlus,
  Shield,
  Eye,
  Crown,
  Mail,
  Loader2,
  Trash2,
  MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface TeamMember {
  id: string
  userId: string
  workspaceId: string
  role: string
  joinedAt: string
  user: {
    id: string
    name: string | null
    email: string
    image?: string | null
  }
}

interface TeamViewProps {
  workspaceId: string
}

const roleConfig: Record<string, { label: string; description: string; color: string; icon: React.ReactNode }> = {
  owner: {
    label: 'Dueño',
    description: 'Control total del espacio de trabajo',
    color: 'bg-amber-100 text-amber-700',
    icon: <Crown className="h-3.5 w-3.5" />,
  },
  admin: {
    label: 'Admin',
    description: 'Gestión completa excepto facturación',
    color: 'bg-blue-100 text-blue-700',
    icon: <Shield className="h-3.5 w-3.5" />,
  },
  member: {
    label: 'Miembro',
    description: 'Acceso a CRM y conversaciones',
    color: 'bg-emerald-100 text-emerald-700',
    icon: <Users className="h-3.5 w-3.5" />,
  },
  viewer: {
    label: 'Lector',
    description: 'Solo lectura',
    color: 'bg-zinc-100 text-zinc-700',
    icon: <Eye className="h-3.5 w-3.5" />,
  },
}

export function TeamView({ workspaceId }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [removeMember, setRemoveMember] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState(false)

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${workspaceId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setMembers(data.members || [])
      }
    } catch {
      toast.error('Error al cargar miembros del equipo')
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return

    setInviting(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, email: inviteEmail, role: inviteRole }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'No se pudo enviar la invitación.')
        return
      }
      toast.success('Invitación enviada', { description: `Se envió una invitación a ${inviteEmail} como ${roleConfig[inviteRole]?.label || inviteRole}.` })
      setInviteEmail('')
      setInviteRole('member')
      setInviteOpen(false)
      fetchMembers()
    } catch {
      toast.error('No se pudo enviar la invitación.')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async () => {
    if (!removeMember) return

    setRemoving(true)
    try {
      const res = await fetch(`/api/teams?memberId=${removeMember.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('No se pudo eliminar el miembro.')
        return
      }
      setMembers((prev) => prev.filter((m) => m.id !== removeMember.id))
      toast.success('Miembro eliminado', { description: `${removeMember.user.name || removeMember.user.email} fue eliminado del equipo.` })
    } catch {
      toast.error('No se pudo eliminar el miembro.')
    } finally {
      setRemoving(false)
      setRemoveMember(null)
    }
  }

  function getInitials(name: string | null, email: string): string {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-48 bg-zinc-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-zinc-100 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-36 bg-zinc-200 rounded-lg animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl animate-pulse">
            <div className="h-10 w-10 bg-zinc-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-zinc-200 rounded" />
              <div className="h-3 w-32 bg-zinc-100 rounded" />
            </div>
            <div className="h-6 w-16 bg-zinc-200 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Equipo</h1>
          <p className="text-sm text-zinc-500 mt-1">{members.length} miembro{members.length !== 1 ? 's' : ''} en el espacio de trabajo</p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invitar miembro
        </Button>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(roleConfig).map(([key, config]) => (
          <div key={key} className="p-3 rounded-xl border border-zinc-200 bg-zinc-50/50">
            <div className="flex items-center gap-2 mb-1">
              {config.icon}
              <span className="text-xs font-semibold text-zinc-700">{config.label}</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{config.description}</p>
          </div>
        ))}
      </div>

      {/* Members list */}
      <div className="space-y-2">
        {members.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Users className="h-10 w-10 text-zinc-300" />
            <p className="text-sm text-zinc-500">Sin miembros</p>
            <p className="text-xs text-zinc-400">Invita miembros a tu equipo para colaborar.</p>
          </div>
        )}

        {members.map((member) => {
          const config = roleConfig[member.role] || roleConfig.member
          const isOwner = member.role === 'owner'
          const initials = getInitials(member.user.name, member.user.email)

          return (
            <div
              key={member.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-zinc-200 hover:bg-zinc-50/50 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900 truncate">
                    {member.user.name || member.user.email}
                  </span>
                  {isOwner && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-600 border-0">
                      (Tú)
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Mail className="h-3 w-3 text-zinc-400" />
                  <span className="text-xs text-zinc-500 truncate">{member.user.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge className={config.color + ' border-0 text-[10px] px-2 py-0.5'}>
                  {config.label}
                </Badge>
                <span className="text-[10px] text-zinc-400 hidden sm:block">
                  Desde {formatDate(member.joinedAt)}
                </span>

                {!isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600 cursor-pointer"
                        onClick={() => setRemoveMember(member)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar miembro</DialogTitle>
            <DialogDescription>
              Agrega un nuevo miembro a tu equipo. Recibirá un correo con instrucciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Correo electrónico</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                className="h-10"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Rol</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleConfig)
                    .filter(([key]) => key !== 'owner')
                    .map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {config.icon}
                          <span>{config.label}</span>
                          <span className="text-zinc-400 text-xs">— {config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar invitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeMember} onOpenChange={(open) => !open && setRemoveMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar miembro?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMember?.user.name || removeMember?.user.email} será eliminado del equipo y perderá acceso al espacio de trabajo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {removing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
