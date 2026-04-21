'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
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
  Calendar,
  Activity,
  Zap,
  Building2,
  Sparkles,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

const roleConfig: Record<string, { label: string; description: string; color: string; bg: string; icon: React.ReactNode }> = {
  owner: {
    label: 'Dueño',
    description: 'Control total del espacio de trabajo',
    color: 'text-amber-700',
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200',
    icon: <Crown className="h-4 w-4" />,
  },
  admin: {
    label: 'Admin',
    description: 'Gestión completa excepto facturación',
    color: 'text-blue-700',
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200',
    icon: <Shield className="h-4 w-4" />,
  },
  member: {
    label: 'Miembro',
    description: 'Acceso a CRM y conversaciones',
    color: 'text-emerald-700',
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200',
    icon: <Users className="h-4 w-4" />,
  },
  viewer: {
    label: 'Lector',
    description: 'Solo lectura',
    color: 'text-zinc-600',
    bg: 'bg-gradient-to-br from-zinc-50 to-slate-50 border-zinc-200',
    icon: <Eye className="h-4 w-4" />,
  },
}

export function TeamView({ workspaceId }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
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

  function getDaysSince(dateStr: string): string {
    const now = new Date()
    const date = new Date(dateStr)
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    if (diff < 30) return `Hace ${diff} días`
    if (diff < 365) return `Hace ${Math.floor(diff / 30)} meses`
    return `Hace ${Math.floor(diff / 365)} años`
  }

  const avatarColors = [
    'bg-emerald-100 text-emerald-700',
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
  ]

  const owner = members.find(m => m.role === 'owner')
  const others = members.filter(m => m.role !== 'owner')
  const roleCounts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-48 bg-zinc-200 rounded-lg animate-pulse" />
            <div className="h-4 w-36 bg-zinc-100 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-40 bg-zinc-200 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-zinc-50 rounded-xl animate-pulse" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl animate-pulse">
            <div className="h-12 w-12 bg-zinc-200 rounded-full" />
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
          <h1 className="text-xl font-bold text-foreground">Equipo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} miembro{members.length !== 1 ? 's' : ''} en el espacio de trabajo
          </p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm shadow-emerald-200"
        >
          <UserPlus className="h-4 w-4" />
          Invitar miembro
        </Button>
      </div>

      {/* Role Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(roleConfig).map(([key, config], index) => (
          <Card key={key} className={cn('border-2 transition-all duration-200 hover:shadow-sm', config.bg)}>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg bg-white/60', config.color)}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {roleCounts[key] || 0}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight truncate">{config.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {members.length === 0 && (
        <Card className="border-dashed border-2 border-zinc-200 bg-zinc-50/50">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <Users className="h-8 w-8 text-zinc-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-foreground">Sin miembros en el equipo</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                Invita colaboradores a tu espacio de trabajo para gestionar contactos, conversaciones y tratos juntos.
              </p>
            </div>
            <Button
              onClick={() => setInviteOpen(true)}
              variant="outline"
              className="gap-2 mt-2"
            >
              <UserPlus className="h-4 w-4" />
              Invitar primer miembro
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Owner Section */}
      {owner && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Propietario</span>
          </div>
          <Card className="border-2 border-amber-200 bg-gradient-to-r from-amber-50/80 to-orange-50/50 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-12 w-12 ring-2 ring-amber-200">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-bold">
                      {getInitials(owner.user.name, owner.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center">
                    <Crown className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">
                      {owner.user.name || owner.user.email}
                    </span>
                    <Badge className="h-5 text-[9px] px-1.5 bg-amber-100 text-amber-700 border-0 font-semibold">
                      TÚ
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{owner.user.email}</span>
                    </div>
                    <span className="text-zinc-300">·</span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Miembro desde {formatDate(owner.joinedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <Badge className="h-6 text-[10px] px-2.5 bg-amber-100 text-amber-700 border-0 font-semibold gap-1">
                    <Shield className="h-3 w-3" />
                    {roleConfig.owner.label}
                  </Badge>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <Activity className="h-3 w-3" />
                    Activo
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Other Members */}
      {others.length > 0 && (
        <div className="space-y-2">
          {others.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Colaboradores ({others.length})
              </span>
            </div>
          )}
          {others.map((member, index) => {
            const config = roleConfig[member.role] || roleConfig.member
            const initials = getInitials(member.user.name, member.user.email)
            const colorClass = avatarColors[index % avatarColors.length]

            return (
              <Card key={member.id} className="border border-border hover:border-emerald-200 hover:shadow-sm transition-all group">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn('text-xs font-semibold', colorClass)}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {member.user.name || member.user.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{member.user.email}</span>
                        </div>
                        <span className="text-zinc-300">·</span>
                        <span className="text-[10px] text-muted-foreground">
                          {getDaysSince(member.joinedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className={cn('h-6 text-[10px] px-2.5 border-0 font-medium gap-1', config.bg, config.color)}>
                        {config.icon}
                        {config.label}
                      </Badge>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2 cursor-pointer">
                            <Shield className="h-4 w-4" />
                            Cambiar rol
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 gap-2 cursor-pointer"
                            onClick={() => setRemoveMember(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar del equipo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Invite Tips */}
      {members.length > 0 && members.length < 5 && (
        <Card className="mt-6 border-dashed border-2 border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Amplía tu equipo</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Agregar miembros te permite asignar conversaciones, dividir leads y escalar respuestas más rápido.
              </p>
            </div>
            <Button
              onClick={() => setInviteOpen(true)}
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Invitar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-600" />
              Invitar miembro
            </DialogTitle>
            <DialogDescription>
              Agrega un nuevo miembro a tu equipo. El usuario debe tener una cuenta registrada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Correo electrónico</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                className="h-10"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Rol asignado</label>
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
                          <span className="font-medium">{config.label}</span>
                          <span className="text-muted-foreground text-xs">— {config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {/* Quick role preview */}
            <div className={cn('p-3 rounded-lg border-2 text-xs', roleConfig[inviteRole]?.bg)}>
              <div className="flex items-center gap-2 mb-1">
                {roleConfig[inviteRole]?.icon}
                <span className="font-semibold">{roleConfig[inviteRole]?.label}</span>
              </div>
              <p className="text-muted-foreground">{roleConfig[inviteRole]?.description}</p>
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
              <Zap className="h-4 w-4" />
              Enviar invitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeMember} onOpenChange={(open) => !open && setRemoveMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              ¿Eliminar miembro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeMember?.user.name || removeMember?.user.email} será eliminado del equipo y perderá acceso al espacio de trabajo. Los contactos y conversaciones asignadas se mantendrán.
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
