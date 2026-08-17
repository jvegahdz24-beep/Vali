'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { CopilotWidget } from './copilot-widget'
import { EventBusTicker } from './event-bus-ticker'
import { GuidedTour } from './guided-tour'

export type ViewType = 'dashboard' | 'chat-demo' | 'inbox' | 'pipeline' | 'inventory' | 'contacts' | 'agents' | 'agent-factory' | 'team' | 'analytics' | 'automations' | 'developer' | 'settings' | 'settings:whatsapp' | 'valiguard' | 'admin' | 'reports' | 'calendar' | 'playground' | 'marketing' | 'meli' | 'copilot' | 'gbrain' | 'manual'

interface DashboardLayoutProps {
  children: React.ReactNode
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  workspaceId?: string
  /** Abre la conversación de un contacto en la bandeja (notificaciones → chat). */
  onOpenContact?: (contactId: string) => void
}

export function DashboardLayout({ children, activeView, onViewChange, workspaceId, onOpenContact }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Tour guiado interactivo (spotlight sobre los botones reales). Arranca:
  // (a) tras terminar el wizard de onboarding (flag vaf-start-tour), o
  // (b) desde el Manual ("Ver tour de bienvenida") vía evento vaf:start-tour.
  const [tourOpen, setTourOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('vaf-start-tour') === '1') {
        localStorage.removeItem('vaf-start-tour')
        setTourOpen(true)
      }
    } catch { /* */ }
    const start = () => setTourOpen(true)
    window.addEventListener('vaf:start-tour', start)
    return () => window.removeEventListener('vaf:start-tour', start)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={(view) => {
          onViewChange(view)
          setSidebarOpen(false)
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Event Bus como barra superior GLOBAL (encima del header), como el mockup */}
        <EventBusTicker
          workspaceId={workspaceId}
          onMenuToggle={() => setSidebarOpen(true)}
          className="hidden sm:flex shrink-0 rounded-none border-x-0 border-t-0 border-b border-zinc-800"
        />
        <Header
          activeView={activeView}
          onMenuToggle={() => setSidebarOpen(true)}
          onViewChange={onViewChange}
          workspaceId={workspaceId || ''}
          onOpenContact={onOpenContact}
        />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-muted/30 dark:bg-slate-950/50">
          {children}
        </main>
      </div>
      {/* Copiloto IA flotante: disponible en cualquier vista */}
      <CopilotWidget workspaceId={workspaceId} activeView={activeView} />

      {/* Tour guiado interactivo por todo el panel */}
      {tourOpen && (
        <GuidedTour
          onClose={() => setTourOpen(false)}
          onNavigate={onViewChange}
          onSidebar={setSidebarOpen}
        />
      )}
    </div>
  )
}
