'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-violet-500/10 to-emerald-500/10">
          <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Dual Agent Orchestrator</h2>
          <p className="text-sm text-muted-foreground">Initializing ValiAutoFlow + NEXUS engine...</p>
        </div>
      </div>
    </div>
  )
}

const OrchestratorApp = dynamic(
  () => import('@/components/orchestrator/orchestrator-demo').then(mod => ({ default: mod.OrchestratorDemo })),
  { ssr: false, loading: PageLoader }
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <OrchestratorApp />
    </Suspense>
  )
}
