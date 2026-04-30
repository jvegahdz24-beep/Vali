// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Supabase Client (SSR Pattern)
// Server-side singleton + browser client
// ═══════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] NEXT_PUBLIC_SUPABASE_URL or key not set. ' +
    'Supabase features will be disabled.'
  )
}

// ─────────────────────────────────────────────────────────────
// Browser Client (client components)
// ─────────────────────────────────────────────────────────────
export function createBrowserClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// Server Client (API routes, server components)
// Uses service_role key for admin operations if available
// ─────────────────────────────────────────────────────────────
export function createServerSupabaseClient() {
  const key = supabaseServiceKey || supabaseAnonKey
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// SSR Client (middleware, route handlers with cookies)
// ─────────────────────────────────────────────────────────────
export async function createSSRClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll can fail in Server Components (read-only cookies)
        }
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// Legacy singleton export (backward compatibility)
// ─────────────────────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
})

export default supabase
