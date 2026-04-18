'use client'

// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Custom Auth Hook & Provider
// Replaces next-auth/react useSession with custom JWT auth
// ═══════════════════════════════════════════════════════════════

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

// ─── Types ────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  image?: string | null
  timezone?: string
  locale?: string
  workspaceId?: string
  workspaceName?: string
  workspaceSlug?: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.user) {
          if (mountedRef.current) setUser(data.user)
        } else {
          if (mountedRef.current) setUser(null)
        }
      } else {
        if (mountedRef.current) setUser(null)
      }
    } catch {
      // Network error or other issue
      if (mountedRef.current) setUser(null)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  // Fetch user on mount
  useEffect(() => {
    mountedRef.current = true
    fetchUser()
    return () => {
      mountedRef.current = false
    }
  }, [fetchUser])

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error || 'Error al iniciar sesión' }
      }

      if (data.success) {
        // Fetch full user info after login
        await fetchUser()
        return { success: true }
      }

      return { success: false, error: 'Error desconocido' }
    } catch {
      return { success: false, error: 'Error de conexión. Intenta de nuevo.' }
    }
  }, [fetchUser])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors — clear local state anyway
    }
    if (mountedRef.current) {
      setUser(null)
      window.location.href = '/login'
    }
  }, [])

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser: fetchUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
