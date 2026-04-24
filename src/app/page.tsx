'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard'
import { Loader2, Database, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Lazy-loaded views (reduces initial bundle size & Turbopack memory) ───
const DashboardMain = lazy(() => import('@/components/dashboard/dashboard-main').then(m => ({ default: m.DashboardMain })))
const ChatDemo = lazy(() => import('@/components/dashboard/chat-demo').then(m => ({ default: m.ChatDemo })))
const Inbox = lazy(() => import('@/components/dashboard/inbox').then(m => ({ default: m.Inbox })))
const CrmPipeline = lazy(() => import('@/components/dashboard/crm-pipeline').then(m => ({ default: m.CrmPipeline })))
const ContactsView = lazy(() => import('@/components/dashboard/contacts-view').then(m => ({ default: m.ContactsView })))
const AgentsView = lazy(() => import('@/components/dashboard/agents-view').then(m => ({ default: m.AgentsView })))
const TeamView = lazy(() => import('@/components/dashboard/team-view').then(m => ({ default: m.TeamView })))
const AnalyticsView = lazy(() => import('@/components/dashboard/analytics-view').then(m => ({ default: m.AnalyticsView })))
const AutomationsView = lazy(() => import('@/components/dashboard/automations-view').then(m => ({ default: m.AutomationsView })))
const DeveloperView = lazy(() => import('@/components/dashboard/developer-view').then(m => ({ default: m.DeveloperView })))
const SettingsView = lazy(() => import('@/components/dashboard/settings-view').then(m => ({ default: m.SettingsView })))
const ValiGuardView = lazy(() => import('@/components/dashboard/valiguard-view').then(m => ({ default: m.ValiGuardView })))
const AdminView = lazy(() => import('@/components/dashboard/admin-view').then(m => ({ default: m.AdminView })))
const AgentPlayground = lazy(() => import('@/components/dashboard/agent-playground').then(m => ({ default: m.AgentPlayground })))
const ReportsView = lazy(() => import('@/components/dashboard/reports-view').then(m => ({ default: m.ReportsView })))
const CalendarView = lazy(() => import('@/components/dashboard/calendar-view').then(m => ({ default: m.CalendarView })))

// Fallback for lazy-loaded views
function ViewLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
    </div>
  )
}

export type ViewType = 'dashboard' | 'chat-demo' | 'inbox' | 'pipeline' | 'contacts' | 'agents' | 'team' | 'analytics' | 'automations' | 'developer' | 'settings' | 'valiguard' | 'admin' | 'playground' | 'reports' | 'calendar'

// Map URL paths to dashboard views
const pathToView: Record<string, ViewType> = {
  '/contacts': 'contacts',
  '/pipeline': 'pipeline',
  '/inbox': 'inbox',
  '/agents': 'agents',
  '/team': 'team',
  '/analytics': 'analytics',
  '/automations': 'automations',
  '/developer': 'developer',
  '/settings': 'settings',
  '/valiguard': 'valiguard',
  '/admin': 'admin',
  '/chat-demo': 'chat-demo',
  '/playground': 'playground',
  '/reports': 'reports',
  '/calendar': 'calendar',
}

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(id)
  }
}

export default function Home() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const searchParams = useSearchParams()
  const redirectPath = searchParams.get('redirect') || ''
  const [activeView, setActiveView] = useState<ViewType>(() => {
    // Restore view from redirect param if available
    return (pathToView[redirectPath] || 'dashboard')
  })
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [initStep, setInitStep] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const initializeData = useCallback(async () => {
    try {
      setIsSeeding(true)
      setSeedError(null)
      setInitStep('Cargando workspace...')

      // Fast path: workspaceId already from /api/auth/me (via useAuth)
      // Just verify by fetching workspaces directly
      let wsId: string | null = null

      // Try to get workspaceId from the workspaces API
      const wsRes = await fetchWithTimeout('/api/workspaces')
      const wsData = await wsRes.json()
      const wsList = wsData.items || wsData.workspaces || wsData.data || []
      if (Array.isArray(wsList) && wsList.length > 0) {
        wsId = wsList[0].id
      }

      // If no workspace exists, seed the database
      if (!wsId) {
        setInitStep('Creando datos de demostración...')
        const seedRes = await fetchWithTimeout('/api/seed', { method: 'POST' }, 30000)
        const seedData = await seedRes.json()
        wsId = seedData.workspaceId || null

        if (!wsId && seedRes.ok) {
          const wsRes2 = await fetchWithTimeout('/api/workspaces')
          const wsData2 = await wsRes2.json()
          const wsList2 = wsData2.items || wsData2.workspaces || wsData2.data || []
          if (Array.isArray(wsList2) && wsList2.length > 0) wsId = wsList2[0].id
        }
      }

      if (wsId) {
        setWorkspaceId(wsId)
        setIsReady(true)
      } else {
        setSeedError('No se pudo encontrar el workspace. Intenta de nuevo.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Tiempo de espera agotado. Verifica tu conexión.' : err.message)
        : 'Error initializing database'
      setSeedError(message)
      console.error('[Init] Error:', err)
    } finally {
      setIsSeeding(false)
      setInitStep('')
    }
  }, [])

  // Wait for auth, then initialize data
  useEffect(() => {
    if (authLoading) return // Still checking auth
    if (!isAuthenticated) {
      // Middleware should redirect, but just in case
      window.location.href = '/login'
      return
    }
    if (isAuthenticated && !isReady && !seedError) {
      initializeData()
    }
  }, [authLoading, isAuthenticated, isReady, seedError, initializeData])

  // Check onboarding status when ready
  useEffect(() => {
    if (isReady && workspaceId) {
      const onboardingComplete = localStorage.getItem('valiflow_onboarding_complete')
      if (!onboardingComplete) {
        setShowOnboarding(true)
      }
    }
  }, [isReady, workspaceId])

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false)
    localStorage.setItem('valiflow_onboarding_complete', 'true')
  }, [])

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-emerald-500/10">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Verificando sesión</h2>
            <p className="text-sm text-gray-500">Cargando ValiAutoFlow...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show loading while seeding
  if (isSeeding) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-emerald-500/10">
            <Database className="h-10 w-10 text-emerald-600 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Preparando ValiAutoFlow</h2>
            <p className="text-sm text-gray-500">{initStep || 'Cargando datos de demostración...'}</p>
          </div>
          <Loader2 className="h-5 w-5 text-emerald-600 animate-spin" />
        </div>
      </div>
    )
  }

  // Show error if seeding failed
  if (seedError) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <div className="p-4 rounded-2xl bg-red-500/10">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Error al inicializar</h2>
            <p className="text-sm text-gray-500">{seedError}</p>
          </div>
          <Button onClick={initializeData} variant="outline" className="gap-2">
            <Database className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  // Not ready yet — show loading (shouldn't happen normally)
  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <DashboardLayout activeView={activeView} onViewChange={setActiveView} workspaceId={workspaceId}>
        <Suspense fallback={<ViewLoader />}>
          {activeView === 'dashboard' && <DashboardMain workspaceId={workspaceId} onViewChange={(v) => setActiveView(v as ViewType)} />}
          {activeView === 'chat-demo' && <ChatDemo workspaceId={workspaceId} />}
          {activeView === 'inbox' && <Inbox workspaceId={workspaceId} onViewChange={(v) => setActiveView(v as ViewType)} />}
          {activeView === 'pipeline' && <CrmPipeline workspaceId={workspaceId} />}
          {activeView === 'contacts' && <ContactsView workspaceId={workspaceId} onViewChange={(v) => setActiveView(v as ViewType)} />}
          {activeView === 'agents' && <AgentsView workspaceId={workspaceId} />}
          {activeView === 'team' && <TeamView workspaceId={workspaceId} />}
          {activeView === 'analytics' && <AnalyticsView workspaceId={workspaceId} />}
          {activeView === 'automations' && <AutomationsView workspaceId={workspaceId} />}
          {activeView === 'developer' && <DeveloperView workspaceId={workspaceId} />}
          {activeView === 'valiguard' && <ValiGuardView workspaceId={workspaceId} />}
          {activeView === 'admin' && <AdminView workspaceId={workspaceId} />}
          {activeView === 'settings' && <SettingsView workspaceId={workspaceId} />}
          {activeView === 'playground' && <AgentPlayground workspaceId={workspaceId} />}
          {activeView === 'reports' && <ReportsView workspaceId={workspaceId} />}
          {activeView === 'calendar' && <CalendarView workspaceId={workspaceId} />}
        </Suspense>

        {/* Onboarding Wizard Overlay */}
        {showOnboarding && workspaceId && (
          <OnboardingWizard
            workspaceId={workspaceId}
            onComplete={handleOnboardingComplete}
          />
        )}
      </DashboardLayout>
    </ErrorBoundary>
  )
}
