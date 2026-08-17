'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Loader2,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Mail,
  LogIn,
  ShieldAlert,
  Clock,
  X,
} from 'lucide-react'

type AcceptState =
  | { kind: 'loading' }
  | { kind: 'needs-login'; token: string }
  | { kind: 'wrong-email'; token: string; invitedEmail: string | null; currentEmail: string | null }
  | { kind: 'expired' }
  | { kind: 'already-accepted' }
  | { kind: 'not-found' }
  | { kind: 'generic-error'; message: string }
  | { kind: 'success'; workspaceName: string; role: string }

export default function AcceptInvitePage() {
  // useSearchParams must be inside a Suspense boundary in Next 15+.
  return (
    <Suspense fallback={<Shell><CenterCard icon={<Loader2 className="h-6 w-6 animate-spin text-emerald-600" />} title="Cargando…" message="Preparando la aceptación de la invitación." /></Shell>}>
      <AcceptInviteInner />
    </Suspense>
  )
}

function AcceptInviteInner() {
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()
  const token = searchParams.get('token')

  const [state, setState] = useState<AcceptState>({ kind: 'loading' })

  const accept = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/teams/invite?token=${encodeURIComponent(t)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setState({
          kind: 'success',
          workspaceName: data.workspaceName || 'el equipo',
          role: data.role || 'member',
        })
        // Bounce into the Team view after a short pause so the user sees the confirmation.
        setTimeout(() => {
          window.location.href = '/?redirect=/team'
        }, 2500)
        return
      }

      const errorMsg = (data?.error || '').toString().toLowerCase()
      if (res.status === 403 && errorMsg.includes('otro email')) {
        setState({
          kind: 'wrong-email',
          token: t,
          invitedEmail: null,
          currentEmail: user?.email || null,
        })
        return
      }
      if (res.status === 410 || errorMsg.includes('expirad')) {
        setState({ kind: 'expired' })
        return
      }
      if (res.status === 409 || errorMsg.includes('ya fue aceptada')) {
        setState({ kind: 'already-accepted' })
        return
      }
      if (res.status === 404 || errorMsg.includes('no encontrada')) {
        setState({ kind: 'not-found' })
        return
      }
      setState({ kind: 'generic-error', message: data?.error || 'No se pudo aceptar la invitación.' })
    } catch (err) {
      setState({
        kind: 'generic-error',
        message: 'Error de red. Verifica tu conexión e intenta de nuevo.',
      })
    }
  }, [user])

  useEffect(() => {
    if (!token) {
      setState({ kind: 'not-found' })
      return
    }
    if (authLoading) {
      setState({ kind: 'loading' })
      return
    }
    if (!user) {
      setState({ kind: 'needs-login', token })
      return
    }
    // Logged in — try to accept.
    setState({ kind: 'loading' })
    accept(token)
  }, [token, user, authLoading, accept])

  if (!token) {
    return <Shell><ErrorCard icon={<X className="h-6 w-6" />} title="Invitación no encontrada" message="El enlace de invitación es inválido o no contiene un token." actionHref="/" actionLabel="Volver al inicio" /></Shell>
  }

  if (state.kind === 'loading') {
    return <Shell><CenterCard icon={<Loader2 className="h-6 w-6 animate-spin text-emerald-600" />} title="Procesando invitación…" message="Espera un momento mientras validamos tu invitación." /></Shell>
  }

  if (state.kind === 'needs-login') {
    const callback = `/accept-invite?token=${encodeURIComponent(token)}`
    return (
      <Shell>
        <Card className="border-2 border-emerald-200 shadow-lg shadow-emerald-100/40 max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Mail className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Tienes una invitación pendiente</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Para aceptar la invitación al equipo, inicia sesión o crea una cuenta con el correo que recibió la invitación.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Link href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>
                  <LogIn className="h-4 w-4" /> Iniciar sesión
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full gap-2">
                <Link href={`/signup?callbackUrl=${encodeURIComponent(callback)}`}>
                  <UserPlus className="h-4 w-4" /> Crear cuenta nueva
                </Link>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground pt-2">
              Si todavía no tienes cuenta, créala con el mismo correo al que te llegó la invitación.
            </p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'wrong-email') {
    return (
      <Shell>
        <ErrorCard
          icon={<ShieldAlert className="h-6 w-6 text-amber-600" />}
          title="Esta invitación es para otro correo"
          message={`${user?.email ? `Estás conectado como ${user.email}, pero` : 'La invitación fue enviada a otro correo.'} Para aceptarla, cierra sesión y vuelve a iniciar con la cuenta que recibió la invitación.`}
          actionHref="/api/auth/logout"
          actionLabel="Cerrar sesión"
        />
      </Shell>
    )
  }

  if (state.kind === 'expired') {
    return <Shell><ErrorCard icon={<Clock className="h-6 w-6 text-amber-600" />} title="Invitación expirada" message="Esta invitación caducó (7 días). Pide al administrador que te envíe una nueva." actionHref="/" actionLabel="Volver al inicio" /></Shell>
  }

  if (state.kind === 'already-accepted') {
    return <Shell><ErrorCard icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} title="Ya eres parte del equipo" message="Esta invitación ya fue aceptada. Si no ves el workspace, contacta al administrador." actionHref="/" actionLabel="Ir al dashboard" /></Shell>
  }

  if (state.kind === 'not-found') {
    return <Shell><ErrorCard icon={<X className="h-6 w-6" />} title="Invitación no encontrada" message="El enlace es inválido o la invitación fue eliminada." actionHref="/" actionLabel="Volver al inicio" /></Shell>
  }

  if (state.kind === 'generic-error') {
    return <Shell><ErrorCard icon={<AlertCircle className="h-6 w-6 text-red-600" />} title="No se pudo aceptar" message={state.message} actionHref="/" actionLabel="Volver al inicio" /></Shell>
  }

  if (state.kind === 'success') {
    return (
      <Shell>
        <Card className="border-2 border-emerald-200 shadow-lg shadow-emerald-100/40 max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">¡Te uniste al equipo!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ahora formas parte de <strong>{state.workspaceName}</strong> como {state.role}. Te llevamos al panel…
              </p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600 mx-auto" />
          </CardContent>
        </Card>
      </Shell>
    )
  }

  return null
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      {children}
    </div>
  )
}

function CenterCard({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <Card className="border-2 border-border/60 max-w-md w-full">
      <CardContent className="p-6 text-center space-y-3">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">{icon}</div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

function ErrorCard({
  icon,
  title,
  message,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode
  title: string
  message: string
  actionHref: string
  actionLabel: string
}) {
  return (
    <Card className="border-2 border-border/60 max-w-md w-full">
      <CardContent className="p-6 text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">{icon}</div>
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
