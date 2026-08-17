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
  Sun,
  Moon,
  HelpCircle,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { useTheme } from 'next-themes'
import { getInitials } from '@/lib/utils'
import type { ViewType } from './dashboard-layout'
import { ProfileModal } from './profile-modal'

const viewTitles: Record<ViewType, string> = {
  dashboard: 'Dashboard',
  'chat-demo': 'Chat IA en Vivo',
  inbox: 'Bandeja de Entrada',
  pipeline: 'Pipeline de Ventas',
  inventory: 'Inventario de Autos',
  contacts: 'Contactos',
  agents: 'Agentes IA',
  'agent-factory': 'Agentes IA', // mismo módulo: "Agentes IA" abre el Agent Factory
  analytics: 'Analíticas',
  automations: 'Automatizaciones',
  team: 'Equipo',
  developer: 'Panel de Desarrollador',
  valiguard: 'ValiGuard',
  admin: 'Admin',
  settings: 'Configuración',
  'settings:whatsapp': 'Configuración',
  playground: 'Playground IA',
  reports: 'Reportes',
  calendar: 'Calendario',
  marketing: 'Marketing IA',
  meli: 'Mercado Libre',
  copilot: 'Copiloto IA',
  gbrain: 'gBrain',
  manual: 'Manual de Usuario',
}

interface Notification {
  id: string
  type: 'message' | 'deal_won' | 'deal_lost' | 'new_contact' | 'ai_response' | 'system'
  title: string
  description: string
  timestamp: string
  read: boolean
  contactId?: string
  view?: string
}

interface HeaderProps {
  activeView: ViewType
  onMenuToggle: () => void
  onViewChange: (view: ViewType) => void
  workspaceId: string
  /** Abre la conversación de un contacto en la bandeja (deep-link de notificaciones). */
  onOpenContact?: (contactId: string) => void
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

export function Header({ activeView, onMenuToggle, onViewChange, workspaceId, onOpenContact }: HeaderProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isMac, setIsMac] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchFeedback, setSearchFeedback] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform))
  }, [])

  // Fetch WhatsApp status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status')
        if (!res.ok) return
        const data = await res.json()
        setWhatsappConnected(data.connected)
      } catch {
        // Poll de fondo: un fallo transitorio NO debe disparar toasts que
        // asustan al usuario ("Error de conexión con WhatsApp" cada 15s
        // durante una reconexión). El estado se refleja en el ícono.
        console.warn('[Header] WhatsApp status poll falló (transitorio)')
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
        // Poll de fondo — silencioso ante fallos transitorios (sin toast).
        console.warn('[Header] notifications poll falló (transitorio)')
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

  const [showAllNotifs, setShowAllNotifs] = useState(false)

  // Navega a donde corresponde según el tipo de notificación:
  // mensaje/IA → ESA conversación en la bandeja; trato → pipeline; contacto → contactos.
  const openNotification = useCallback((notif: Notification) => {
    if ((notif.type === 'message' || notif.type === 'ai_response') && notif.contactId && onOpenContact) {
      onOpenContact(notif.contactId)
      return
    }
    const target = (notif.view || (notif.type === 'deal_won' || notif.type === 'deal_lost' ? 'pipeline' : notif.type === 'new_contact' ? 'contacts' : 'inbox')) as ViewType
    onViewChange(target)
  }, [onOpenContact, onViewChange])

  const handleViewNotifications = useCallback(() => {
    setShowAllNotifs(true)
  }, [])

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
  const roleLabel = ({ owner: 'Propietario', admin: 'Administrador', member: 'Vendedor', viewer: 'Lector' } as Record<string, string>)[user?.workspaceRole || 'owner'] || 'Miembro'
  // Saludo del Tablero (según la hora) — se muestra en el header en la vista dashboard.
  const _h = new Date().getHours()
  const greetingText = `¡Buen${_h >= 6 && _h < 12 ? 'os días' : _h >= 12 && _h < 19 ? 'as tardes' : 'as noches'}, ${userName.split(' ')[0]}!`

  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 shrink-0"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        {activeView === 'dashboard' ? (
          // En el Tablero: saludo del Copiloto (misma fila que búsqueda y perfil) — como el mockup
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-600/30">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 hidden sm:block leading-tight">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-foreground truncate">{greetingText} 👋</h2>
                <Badge className="h-4 text-[8px] px-1.5 bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 gap-1 shrink-0">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
                  IA Activa
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">Tu Copiloto de IA está activo y optimizando tus ventas.</p>
            </div>
          </div>
        ) : (
          // Breadcrumb "Dashboard › Vista": oculto en móvil (ocupa espacio y es redundante).
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Dashboard</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-foreground">{viewTitles[activeView]}</span>
          </div>
        )}
      </div>

      {/* Center - Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-4">
        <div className="relative w-full" data-tour="header-search">
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
            {isMac ? (
              <><Command className="h-2.5 w-2.5" /><span>K</span></>
            ) : (
              <span>Ctrl K</span>
            )}
          </kbd>
          {searchFeedback && (
            <span className="absolute top-full left-0 mt-1 text-xs text-muted-foreground whitespace-nowrap">{searchFeedback}</span>
          )}
        </div>
      </div>

      {/* Right side — orden del mockup: notificaciones · WhatsApp · ayuda · perfil */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-tour="header-bell" className={cn(
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
                <Badge variant="secondary" className="h-5 text-[10px] bg-zinc-100 text-zinc-500 border-0 dark:bg-zinc-800 dark:text-zinc-400">
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
                <Bell className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm text-zinc-500">Sin notificaciones recientes</p>
                <button onClick={handleViewNotifications} className="text-xs text-emerald-600 font-medium hover:underline">Ver historial (48 h)</button>
              </div>
            )}

            {!notifLoading && notifications.length > 0 && (
              <>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.slice(0, 5).map((notif) => (
                    <DropdownMenuItem key={notif.id} onClick={() => openNotification(notif)} title="Abrir" className="flex flex-col items-start gap-1.5 py-3 px-3 cursor-pointer">
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
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 py-1.5 px-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Marcar todas como leídas
                    </button>
                  )}
                  <button
                    onClick={handleViewNotifications}
                    className="text-xs text-emerald-600 font-medium flex items-center gap-1 py-1.5 px-2 rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 ml-auto transition-colors"
                  >
                    Ver todas
                  </button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* WhatsApp (icono verde, estado real) */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onViewChange('settings:whatsapp')}>
                <MessageCircle className={cn('h-4 w-4', whatsappConnected ? 'text-emerald-500' : 'text-zinc-400')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>WhatsApp {whatsappConnected ? 'conectado' : 'desconectado'}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Ayuda */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onViewChange('manual')}>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Ayuda / Manual</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* User Avatar + nombre + rol (como el mockup) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 gap-2 px-2">
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8">
                  {userImage && <AvatarImage src={userImage} alt={userName} />}
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
              </div>
              <div className="hidden md:flex flex-col items-start leading-tight min-w-0">
                <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">{userName}</span>
                <span className="text-[10px] text-muted-foreground">{roleLabel} · Pro</span>
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
            <DropdownMenuItem className="cursor-pointer" onClick={() => setProfileOpen(true)}>
              <User className="h-4 w-4 mr-2" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={handleSettings}>
              <Settings className="h-4 w-4 mr-2" />
              Configuración
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {mounted && (
              <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun className="h-4 w-4 mr-2 text-amber-400" /> : <Moon className="h-4 w-4 mr-2" />}
                {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      <AllNotifsModal open={showAllNotifs} onOpenChange={setShowAllNotifs} workspaceId={workspaceId} onOpen={(n) => { setShowAllNotifs(false); openNotification(n) }} />
    </header>
  )
}

// ═══ Todas las notificaciones (48 h) — lista completa y clicable ═══
function AllNotifsModal({ open, onOpenChange, workspaceId, onOpen }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string; onOpen: (n: Notification) => void }) {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !workspaceId) return
    setLoading(true)
    fetch(`/api/notifications?workspaceId=${workspaceId}&full=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.success) setItems(d.notifications || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, workspaceId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,760px)] sm:max-w-[760px] max-h-[85vh] overflow-y-auto overflow-x-hidden custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-500" /> Todas las notificaciones
            <span className="text-xs font-normal text-muted-foreground">· últimas 48 horas</span>
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Cargando notificaciones…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <Bell className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm text-muted-foreground">Sin actividad en las últimas 48 horas</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpen(n)}
                title="Abrir donde corresponde"
                className="w-full text-left rounded-lg border border-border/50 px-3 py-2.5 hover:bg-muted/60 hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-center gap-2 w-full">
                  {getNotificationIcon(n.type)}
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{n.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.timestamp)}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6 mt-0.5 break-words">{n.description}</p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
