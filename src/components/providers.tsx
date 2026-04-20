'use client'

import { AuthProvider } from '@/hooks/use-auth'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useEffect } from 'react'

// Keepalive: ping server every 30s to prevent process from being killed by platform
function Keepalive() {
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/health').catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AuthProvider>
        <Keepalive />
        {children}
      </AuthProvider>
    </ThemeProvider>
  )
}
