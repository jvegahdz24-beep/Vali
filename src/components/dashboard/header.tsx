'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Bell,
  Menu,
  Settings,
  LogOut,
  User,
  ChevronDown,
  ChevronRight,
  Wifi,
  MessageCircle,
  Trophy,
  UserPlus,
  Bot,
  AlertTriangle,
  CheckCheck,
  Command,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/use-auth'
import { getInitials } from '@/lib/utils'
import type { ViewType } from './dashboard-layout'

const viewTitles: Record<ViewType, string> = {
  dashboard: 'Dashboard',
  'chat-demo': 'Chat IA en Vivo',
  inbox: 'Bandeja de Entrada',
  pipeline: 'Pipeline de Ventas',
  contacts: 'Contactos',
  agents: 'Agentes IA',
  analytics: 'Analíticas',
  automations: 'Automatizaciones',
  team: 'Equipo',
  developer: 'Panel de Desarrollador',
  valiguard: 'ValiGuard',
  admin: 'Admin',
  settings: 'Configuración',
}

interface Notification {
  id: string
  type: 'message' | 'deal_won' | 'deal_lost' | 'new_contact' | 'ai_response' | 'system'
  title: string
  description: string
  timestamp: string
  read: boolean
}

interface HeaderProps {
  activeView: ViewType
  onMenuToggle: () => void
  onViewChange: (view: ViewType) => void
  workspaceId: string
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'message': return <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
    case 'deal_won': return <Trophy className="h-3.5 w-3.5 text-emerald-500" />
    case 'deal_lost': return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
    case 'new_contact': return <UserPlus className="h-3.5 w-3.5 text-violet-500" />
    case 'ai_response': return <Bot className="h-3.5 w-3.5 text-emerald-500" />
    case 'system': return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
    default: return <Bell className="h-3.5 w-3.5" />
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  if (diff < 60000) return 'Ahora'
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`
  return `Hace ${Math.floor(diff / 86400000)}d`
}

export function Header({ activeView, onMenuToggle, onViewChange, workspaceId }: HeaderProps) {
  const { user, logout } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchFeedback, setSearchFeedback] = useState('')
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)

  // Fetch WhatsApp status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status')
        if (!res.ok) return
        const data = await res.json()
        setWhatsappConnected(data.connected)
      } catch {
        toast.error('Error de conexión con WhatsApp')
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch notifications every 30s
  useEffect(() => {
    if (!workspaceId) return

    const fetchNotifications = async () => {
      setNotifLoading(true)
      try {
        const res = await fetch(`/api/notifications?workspaceId=${workspaceId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.success) {
          setNotifications(data.notifications || [])
          setUnreadCount(data.unreadCount || 0)
        }
      } catch {
        toast.error('Error al cargar notificaciones')
      } finally {
        setNotifLoading(false)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [workspaceId])

  const channelStatuses = [
    { name: 'WhatsApp', connected: whatsappConnected, color: whatsappConnected ? 'text-emerald-500' : 'text-zinc-500' },
  ]

  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setSearchFeedback(`Búsqueda: ${searchQuery.trim()}`)
      setTimeout(() => setSearchFeedback(''), 3000)
    }
  }, [searchQuery])

  const handleSettings = useCallback(() => {
    onViewChange('settings')
  }, [onViewChange])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  const handleViewNotifications = useCallback(() => {
    onViewChange('inbox')
  }, [onViewChange])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch(`/api/notifications?workspaceId=${workspaceId}`, { method: 'PUT' })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      toast.error('Error al marcar notificaciones')
    }
  }, [workspaceId])

  const userName = user?.name || 'Usuario'
  const userEmail = user?.email || ''
  const userInitials = getInitials(userName)
  const userImage = user?.image

  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 lg:px-6 shrink-0" style={{ backgroundColor: '#ffffff' }}>
      {/* Left side */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Dashboard</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold text-foreground">{viewTitles[activeView]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center - Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150',
            searchFocused ? 'text-emerald-500' : 'text-muted-foreground'
          )} />
          <Input
            placeholder="Buscar contactos, conversaciones..."
            className="pl-9 pr-16 h-9 bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-emerald-500/30 transition-smooth"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={handleSearch}
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 items-center gap-1 rounded-md border border-border/60 bg-muted/80 px-1.5 text-[10px] font-medium text-muted-foreground pointer-events-none">
            <Command className="h-2.5 w-2.5" />
            <span>⌘K</span>
          </kbd>
          {searchFeedback && (
            <span className="absolute top-full left-0 mt-1 text-xs text-muted-foreground whitespace-nowrap">{searchFeedback}</span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Channel Status Indicators */}
        <div className="hidden sm:flex items-center gap-1.5 mr-2">
          <TooltipProvider delayDuration={300}>
            {channelStatuses.map((ch) => (
              <Tooltip key={ch.name}>
                <TooltipTrigger asChild>
                  <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-smooth', ch.connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500 border border-zinc-200')}>
                    <div className={cn('w-1.5 h-1.5 rounded-full', ch.connected ? 'bg-emerald-500 animate-pulse-dot' : 'bg-zinc-400')} />
                    <span>{ch.name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{ch.name} {ch.connected ? 'conectado' : 'desconectado'}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn(
                'relative h-9 w-9',
                unreadCount > 0 && 'text-emerald-500'
              )}>
                    <Bell className={cn('h-4 w-4', unreadCount > 0 && 'animate-pulse-dot')} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-vf-scaleIn">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Notificaciones</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-80 shadow-lg animate-fade-in">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notificaciones</span>
              {unreadCount > 0 ? (
                <Badge variant="secondary" className="h-5 text-[10px] bg-emerald-500/10 text-emerald-600 border-0">
                  {unreadCount} nueva{unreadCount > 1 ? 's' : ''}
                </Badge>
              ) : (
                <Badge variant="secondary" className="h-5 text-[10px] bg-zinc-100 text-zinc-500 border-0">
                  Al día
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {notifLoading && (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-zinc-400">Cargando...</span>
              </div>
            )}

            {!notifLoading && notifications.length === 0 && (
              <div className="flex flex-col items-center py-8 gap-2">
                <Bell className="h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">Sin notificaciones</p>
                <p className="text-xs text-zinc-400">Las notificaciones aparecerán aquí</p>
              </div>
            )}

            {!notifLoading && notifications.length > 0 && (
              <>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.slice(0, 5).map((notif) => (
                    <DropdownMenuItem key={notif.id} className="flex flex-col items-start gap-1.5 py-3 px-3 cursor-pointer">
                      <div className="flex items-center gap-2 w-full">
                        {!notif.read && <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                        {getNotificationIcon(notif.type)}
                        <span className="text-sm font-medium truncate flex-1">{notif.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(notif.timestamp)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-7 line-clamp-2">{notif.description}</p>
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-zinc-500 hover:text-zinc-700 transition-colors flex items-center gap-1 py-1.5 px-2 rounded hover:bg-zinc-50"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Marcar todas como leídas
                    </button>
                  )}
                  <button
                    onClick={handleViewNotifications}
                    className="text-xs text-emerald-600 font-medium flex items-center gap-1 py-1.5 px-2 rounded hover:bg-emerald-50 ml-auto transition-colors"
                  >
                    Ver todas
                  </button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <div className="relative">
                <Avatar className="h-7 w-7">
                  {userImage && <AvatarImage src={userImage} alt={userName} />}
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 shadow-lg animate-fade-in">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{userName}</span>
                <span className="text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => onViewChange('settings')}>
              <User className="h-4 w-4 mr-2" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={handleSettings}>
              <Settings className="h-4 w-4 mr-2" />
              Configuración
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
