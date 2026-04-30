'use client'

// ─── Lightweight Shell — SSR renders ONLY this minimal loading UI ───
// All heavy dashboard components load client-side via dynamic imports (ssr: false)
// This prevents standalone server OOM during SSR of page.tsx

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

// Loading fallback
function FullPageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-emerald-500/10">
          <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Cargando ValiAutoFlow</h2>
          <p className="text-sm text-gray-500">Preparando tu espacio de trabajo...</p>
        </div>
      </div>
    </div>
  )
}

// Load the REAL dashboard app entirely client-side (ssr: false = NO server rendering)
const DashboardApp = dynamic(
  () => import('@/components/dashboard/dashboard-app-shell'),
  { ssr: false, loading: FullPageLoader }
)

export default function Page() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <DashboardApp />
    </Suspense>
  )
}
