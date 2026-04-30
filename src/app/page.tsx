'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

function FullPageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-emerald-500/10">
          <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">NEXUS AI</h2>
          <p className="text-sm text-muted-foreground">Preparando tu asistente virtual...</p>
        </div>
      </div>
    </div>
  )
}

const NexusApp = dynamic(
  () => import('@/components/nexus/nexus-shell').then(mod => ({ default: mod.NexusShell })),
  { ssr: false, loading: FullPageLoader }
)

export default function Page() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <NexusApp />
    </Suspense>
  )
}
