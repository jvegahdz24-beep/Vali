'use client'

import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Inbox,
  Kanban,
  Users,
  UserCog,
  Bot,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Wifi,
  Shield,
  Building2,
  Zap,
  Code2,
  MessageSquareCode,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/use-auth'
import { getInitials } from '@/lib/utils'
import type { ViewType } from './dashboard-layout'

interface NavItem {
  id: ViewType
  label: string
  icon: React.ReactNode
  badge?: number
  showStatus?: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: 'inbox', label: 'Bandeja de Entrada', icon: <Inbox className="h-5 w-5" /> },
  { id: 'pipeline', label: 'Pipeline', icon: <Kanban className="h-5 w-5" /> },
  { id: 'contacts', label: 'Contactos', icon: <Users className="h-5 w-5" /> },
  { id: 'agents', label: 'Agentes IA', icon: <Bot className="h-5 w-5" /> },
  { id: 'automations', label: 'Automatizaciones', icon: <Zap className="h-5 w-5" /> },
  { id: 'analytics', label: 'Analíticas', icon: <BarChart3 className="h-5 w-5" /> },
  { id: 'team', label: 'Equipo', icon: <UserCog className="h-5 w-5" /> },
  { id: 'developer', label: 'Desarrollador', icon: <Code2 className="h-5 w-5" /> },
  { id: 'valiguard', label: 'ValiGuard', icon: <Shield className="h-5 w-5" /> },
  { id: 'admin', label: 'Admin', icon: <Building2 className="h-5 w-5" /> },
  { id: 'settings', label: 'Configuración', icon: <Settings className="h-5 w-5" /> },
]

interface SidebarProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  open: boolean
  onClose: () => void
}

function SidebarContent({ activeView, onViewChange, onNavClick, collapsed }: {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onNavClick?: () => void
  collapsed?: boolean
}) {
  const { user } = useAuth()
  const [waConnected, setWaConnected] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/whatsapp/status')
        if (res.ok) {
          const data = await res.json()
          setWaConnected(data.connected)
        }
      } catch {
        toast.error('Error al verificar estado de WhatsApp')
      }
    }
    check()
    const interval = setInterval(check, 20000)
    return () => clearInterval(interval)
  }, [])

  const userName = user?.name || 'Usuario'
  const userEmail = user?.email || ''
  const userInitials = getInitials(userName)
  const userImage = user?.image
  const workspaceName = user?.workspaceName || 'Mi Negocio'

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 shrink-0 border-b border-zinc-800/60',
        collapsed ? 'justify-center px-2' : 'gap-3 px-4'
      )}>
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-600/20 shrink-0 group cursor-pointer transition-transform duration-200 hover:scale-105">
          <Bot className="h-5 w-5 text-white" />
          <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white tracking-tight animate-vf-fadeIn">ValiAutoFlow</h1>
            <p className="text-[10px] text-zinc-500">CRM Inteligente</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-3 custom-scrollbar">
        <nav className="space-y-0.5 px-3">
          {navItems.map((item) => {
            const isActive = activeView === item.id
            return (
              <TooltipProvider key={item.id} delayDuration={collapsed ? 0 : 300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        onViewChange(item.id)
                        onNavClick?.()
                      }}
                      className={cn(
                        'sidebar-nav-item w-full flex items-center gap-3 rounded-lg text-sm font-medium relative transition-smooth',
                        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                        isActive ? 'active bg-emerald-500/12 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                      )}
                    >
                      <span className={cn(
                        'shrink-0 transition-colors duration-150',
                        isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                      )}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.id === 'inbox' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot shrink-0" />
                          )}
                          {item.id === 'inbox' && waConnected && (
                            <Wifi className="h-3 w-3 text-emerald-400 animate-pulse" />
                          )}
                          {item.badge && item.badge > 0 && (
                            <Badge
                              className="h-5 min-w-5 px-1.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border-0"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" sideOffset={12} className="font-medium">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-zinc-800" />

      {/* Bottom Section */}
      <div className={cn('shrink-0 border-t border-zinc-800/60', collapsed ? 'p-3' : 'p-4 space-y-3')}>
        {!collapsed ? (
          <>
            {/* User Section */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  {userImage && <AvatarImage src={userImage} alt={userName} />}
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0a0a0a] animate-pulse-dot" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{userName}</p>
                <p className="text-[10px] text-zinc-500 truncate">{userEmail}</p>
              </div>
            </div>

            {/* Workspace */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-3 w-3 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-zinc-400 truncate">{workspaceName}</p>
                </div>
              </div>
              <Badge className="h-4 text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shrink-0">
                Pro
              </Badge>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative">
              <Avatar className="h-8 w-8">
                {userImage && <AvatarImage src={userImage} alt={userName} />}
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0a0a0a] animate-pulse-dot" />
            </div>
            <Badge className="h-4 text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
              Pro
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, open, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-zinc-800 shrink-0 transition-all duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}>
        <div className="bg-[#0a0a0a] flex flex-col h-full">
          <SidebarContent
            activeView={activeView}
            onViewChange={onViewChange}
            collapsed={collapsed}
          />
          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-5 -right-3 z-10 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all duration-150 shadow-sm"
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar - Full screen overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md animate-vf-fadeIn"
            onClick={onClose}
          />
          {/* Sidebar Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0a] border-r border-zinc-800 animate-vf-slideInLeft shadow-2xl">
            <SidebarContent
              activeView={activeView}
              onViewChange={onViewChange}
              onNavClick={onClose}
            />
          </div>
        </div>
      )}
    </>
  )
}
