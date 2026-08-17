'use client'

import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Inbox,
  Users,
  UserCog,
  Bot,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Wifi,
  Shield,
  Building2,
  Boxes,
  Zap,
  Code2,
  MessageSquareCode,
  Sun,
  Moon,
  FileText,
  CalendarDays,
  Megaphone,
  Factory,
  Brain,
  TrendingUp,
  LayoutGrid,
  Car,
  Store,
  BookOpen,
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
import { canViewModule } from '@/lib/rbac'
import { useTheme } from 'next-themes'
import { getInitials } from '@/lib/utils'
import type { ViewType } from './dashboard-layout'

interface NavItem {
  id?: ViewType            // undefined = módulo "próximamente" (no navega)
  label: string
  icon: React.ReactNode
  badge?: number
  soon?: boolean           // muestra pastilla "pronto" y no navega
}

interface NavSection { header?: string; items: NavItem[] }

// ── Menú por secciones (idéntico al diseño de referencia) ──
const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { id: 'dashboard', label: 'Tablero', icon: <LayoutDashboard className="h-5 w-5" /> },
      { id: 'inbox', label: 'Conversaciones', icon: <Inbox className="h-5 w-5" /> },
      { id: 'pipeline', label: 'Ventas (Pipeline)', icon: <TrendingUp className="h-5 w-5" /> },
      { id: 'inventory', label: 'Inventario', icon: <Car className="h-5 w-5" /> },
      { id: 'calendar', label: 'Calendario Auto', icon: <CalendarDays className="h-5 w-5" /> },
      { id: 'contacts', label: 'Contactos', icon: <Users className="h-5 w-5" /> },
    ],
  },
  {
    header: 'Inteligencia',
    items: [
      { id: 'agents', label: 'Agentes IA', icon: <Bot className="h-5 w-5" /> },
      { id: 'gbrain', label: 'gBrain (Memoria)', icon: <Brain className="h-5 w-5" /> },
      { id: 'playground', label: 'Playground IA', icon: <MessageSquareCode className="h-5 w-5" /> },
      { id: 'marketing', label: 'Marketing IA', icon: <Megaphone className="h-5 w-5" /> },
      { id: 'automations', label: 'Automatizaciones', icon: <Zap className="h-5 w-5" /> },
      { id: 'analytics', label: 'Analíticas Live', icon: <BarChart3 className="h-5 w-5" /> },
    ],
  },
  {
    header: 'Back-Office',
    items: [
      { label: 'ERP Integrado', icon: <Boxes className="h-5 w-5" />, soon: true },
      { id: 'meli', label: 'Mercado Libre', icon: <Store className="h-5 w-5" /> },
      { id: 'team', label: 'Equipo (Roles)', icon: <UserCog className="h-5 w-5" /> },
      { id: 'valiguard', label: 'ValiGuard (Cumplimiento)', icon: <Shield className="h-5 w-5" /> },
    ],
  },
  {
    header: 'Sistema',
    items: [
      { id: 'settings', label: 'Configuración', icon: <Settings className="h-5 w-5" /> },
      { id: 'developer', label: 'Panel Desarrollador', icon: <Code2 className="h-5 w-5" /> },
      { id: 'reports', label: 'Reportes', icon: <FileText className="h-5 w-5" /> },
    ],
  },
]

// ── Solo superadmin ──
const adminNavItems: NavItem[] = [
  { id: 'admin', label: 'Admin', icon: <Building2 className="h-5 w-5" /> },
  { id: 'manual', label: 'Manual de uso', icon: <BookOpen className="h-5 w-5" /> },
]

interface SidebarProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  open: boolean
  onClose: () => void
}

function SidebarContent({ activeView, onViewChange, onNavClick, collapsed, onCollapse }: {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onNavClick?: () => void
  collapsed?: boolean
  onCollapse?: () => void
}) {
  const { user } = useAuth()
  const { resolvedTheme: theme, setTheme } = useTheme()
  const [waConnected, setWaConnected] = useState(false)
  const [mounted, setMounted] = useState(false)
  const isSuperAdmin = user?.role === 'superadmin'
  // ── RBAC: solo mostramos los módulos que el rol del miembro puede abrir ──
  const wsRole = user?.workspaceRole
  // Secciones visibles según el rol (los ítems "próximamente" sin id siempre se muestran).
  const visibleSections = NAV_SECTIONS
    .map((sec) => ({ header: sec.header, items: sec.items.filter((i) => !i.id || canViewModule(wsRole, i.id, { isSuperAdmin })) }))
    .filter((sec) => sec.items.length > 0)

  useEffect(() => {
    setMounted(true)
  }, [])

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
  // Logo del espacio: el que suba el usuario en Configuración → General.
  // Si no hay, cae al ícono de ValiAutoFlow.
  const workspaceLogo = user?.workspaceLogo || null

  const renderNavItem = (item: NavItem) => {
    const isActive = !!item.id && (activeView === item.id || (item.id === 'settings' && activeView === 'settings:whatsapp'))
    return (
      <TooltipProvider key={item.label} delayDuration={collapsed ? 0 : 300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-tour={item.id ? `nav-${item.id}` : undefined}
              onClick={() => {
                if (item.soon || !item.id) { toast.info(`${item.label}: próximamente`); return }
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
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.soon && (
                    <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400 shrink-0">pronto</span>
                  )}
                  {item.id === 'inbox' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot shrink-0" />
                  )}
                  {item.id === 'inbox' && waConnected && (
                    <Wifi className="h-3 w-3 text-emerald-400 animate-pulse" />
                  )}
                  {item.badge && item.badge > 0 && (
                    <Badge className="h-5 min-w-5 px-1.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border-0">
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
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Logo — ícono + nombre + tagline (como el diseño) */}
      <div className={cn(
        'flex items-center h-16 shrink-0 border-b border-zinc-800/60',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
      )}>
        {workspaceLogo ? (
          <img src={workspaceLogo} alt={workspaceName} className="shrink-0 rounded-lg object-contain h-9 w-9" />
        ) : (
          <img src="/logo-icon.svg" alt="ValiAutoFlow" className={collapsed ? 'h-8 w-8 shrink-0' : 'h-9 w-9 shrink-0'} />
        )}
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="text-[15px] font-bold text-white truncate">
              {workspaceLogo ? workspaceName : (<><span className="text-brand-gradient">Vali</span>AutoFlow</>)}
            </p>
            <p className="text-[9px] text-zinc-500 truncate">Automatiza · Vende · Crece</p>
          </div>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all duration-150 shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 py-3 custom-scrollbar">
        <nav className="space-y-0.5 px-3">
          {/* Todos los módulos por sección, con encabezado (igual al diseño) */}
          {visibleSections.map((sec, si) => (
            <div key={sec.header || `sec-${si}`} className={si > 0 ? 'pt-3' : ''}>
              {sec.header && !collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{sec.header}</p>
              )}
              {sec.header && collapsed && <Separator className="my-2 bg-zinc-800/60" />}
              <div className="space-y-0.5">
                {sec.items.map(renderNavItem)}
              </div>
            </div>
          ))}

          {/* Solo superadmin */}
          {isSuperAdmin && (
            <div className="pt-3">
              {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Admin</p>}
              {collapsed && <Separator className="my-2 bg-zinc-800/60" />}
              <div className="space-y-0.5">{adminNavItems.map(renderNavItem)}</div>
            </div>
          )}
        </nav>
      </ScrollArea>

      <Separator className="bg-zinc-800" />

      {/* Botón Copiloto IA (como el diseño) */}
      <div className={cn('shrink-0', collapsed ? 'px-2 pb-2' : 'px-3 pb-2')}>
        <button
          onClick={() => { onViewChange('copilot'); onNavClick?.() }}
          className={cn(
            'w-full flex items-center rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 hover:from-violet-600/30 hover:to-fuchsia-600/30 transition-smooth',
            collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5'
          )}
        >
          <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-600/30">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-sm font-semibold text-white">Copiloto IA</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
                Online
              </span>
            </>
          )}
        </button>
      </div>

      {/* Footer — como el diseño: solo el copyright (perfil y tema van en la
          barra superior, NO en el menú). */}
      {!collapsed && (
        <div className="shrink-0 border-t border-zinc-800/60 px-4 py-2.5">
          <p className="text-[10px] text-zinc-600">ValiAutoFlow 2026 ©</p>
        </div>
      )}
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
            onCollapse={() => setCollapsed(!collapsed)}
          />
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
