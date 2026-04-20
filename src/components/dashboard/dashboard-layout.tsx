'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

export type ViewType = 'dashboard' | 'chat-demo' | 'inbox' | 'pipeline' | 'contacts' | 'agents' | 'team' | 'analytics' | 'automations' | 'developer' | 'settings' | 'valiguard' | 'admin'

interface DashboardLayoutProps {
  children: React.ReactNode
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  workspaceId?: string
}

export function DashboardLayout({ children, activeView, onViewChange, workspaceId }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background" style={{ backgroundColor: '#fafafa' }}>
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
        <Header
          activeView={activeView}
          onMenuToggle={() => setSidebarOpen(true)}
          onViewChange={onViewChange}
          workspaceId={workspaceId || ''}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30" style={{ backgroundColor: '#fafafa' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
