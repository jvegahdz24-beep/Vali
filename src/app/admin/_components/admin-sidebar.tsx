'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Tags,
  TrendingUp,
  LifeBuoy,
  Lightbulb,
  BarChart3,
  Settings,
  ChevronRight,
  Zap,
  LogOut,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/admin/users',
    label: 'Usuarios',
    icon: Users,
  },
  {
    href: '/admin/memberships',
    label: 'Membresías',
    icon: CreditCard,
  },
  {
    href: '/admin/coupons',
    label: 'Cupones',
    icon: Tags,
  },
  {
    href: '/admin/revenue',
    label: 'Ingresos',
    icon: TrendingUp,
  },
  {
    href: '/admin/reports',
    label: 'Reportes',
    icon: BarChart3,
  },
  {
    href: '/admin/support',
    label: 'Soporte',
    icon: LifeBuoy,
    badge: 'tickets',
  },
  {
    href: '/admin/suggestions',
    label: 'Sugerencias',
    icon: Lightbulb,
  },
  {
    href: '/admin/settings',
    label: 'Configuración',
    icon: Settings,
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
        <img src="/logo-icon.svg" alt="ValiAutoFlow" className="h-8 w-auto shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-black tracking-tight bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
            VALI<span className="text-slate-300 font-bold">AutoFlow</span>
          </span>
          <span className="text-[10px] text-violet-400 font-medium tracking-wide">Panel de Admin</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-3">
          General
        </p>
        <ul className="space-y-1">
          {navItems.slice(0, 6).map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <li key={item.href}>
                {/* Navegación DURA (a href), no <Link>: la navegación client-side
                    (RSC) del panel admin perdía la cookie __Host- y sacaba a login
                    (reporte Jhon 2026-07-30). La carga completa sí manda la cookie. */}
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')} />
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-violet-300" />}
                </a>
              </li>
            )
          })}
        </ul>

        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-3 mt-6">
          Comunidad
        </p>
        <ul className="space-y-1">
          {navItems.slice(6).map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs px-1.5 py-0">
                      •
                    </Badge>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 text-violet-300" />}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-2">
        <a
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all group"
        >
          <Zap className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-gray-300" />
          <span>Ir al Dashboard</span>
        </a>
        <a
          href="/api/auth/logout"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-all group"
        >
          <LogOut className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-red-400" />
          <span>Cerrar sesión</span>
        </a>
      </div>
    </aside>
  )
}
