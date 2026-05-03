'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  Eye,
  EyeOff,
  Bot,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

export default function LoginPage() {
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPasswordResetDialog, setShowPasswordResetDialog] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // Handle URL error params (e.g. Google OAuth not configured)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam === 'google_not_configured') {
      setError('Google OAuth no está configurado. Usa correo y contraseña para entrar.')
      // Clean URL
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await login(email, password)

      if (!result.success) {
        setError(result.error || 'Credenciales inválidas. Verifica tu correo y contraseña.')
      } else {
        // Use window.location for full page reload to ensure
        // session cookie is properly set before middleware check
        const params = new URLSearchParams(window.location.search)
        const callbackUrl = params.get('callbackUrl') || '/'
        window.location.href = callbackUrl
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/25">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">ValiAutoFlow</h1>
          <p className="text-sm text-gray-500 mt-1">CRM Inteligente con IA</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-semibold text-gray-900">
              Iniciar Sesión
            </CardTitle>
            <CardDescription>
              Ingresa tus credenciales para acceder a tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google OAuth Button */}
            <a
              href="/api/auth/google"
              className="flex items-center justify-center gap-3 w-full h-11 px-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all shadow-sm"
              translate="no"
              suppressHydrationWarning
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span translate="no">Continuar con Google</span>
            </a>

            {/* Divider */}
            <div className="relative my-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-gray-400">
                o continúa con tu correo
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Display */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Contraseña
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPasswordResetDialog(true)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <div className="text-center text-sm text-gray-500">
              ¿No tienes cuenta?{' '}
              <Link href="/signup" className="text-emerald-600 hover:text-emerald-700 font-medium">
                Regístrate
              </Link>
            </div>

            {/* Entrada rápida */}
            <button
              type="button"
              onClick={() => {
                setEmail('jvegahdz24@gmail.com')
                setPassword('valiflow2026')
                setTimeout(() => {
                  const form = document.querySelector('form') as HTMLFormElement
                  if (form) form.requestSubmit()
                }, 100)
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-smooth disabled:opacity-50"
            >
              🔑 Entrar como demo
            </button>

            <a
              href="/api/auth/demo-login"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Demo directo (sin contraseña)
            </a>

            {/* Security badge */}
            <p className="text-center text-[11px] text-gray-400">
              🔒 Tus datos están protegidos y encriptados
            </p>
          </CardFooter>
        </Card>

        {/* Demo hint */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            ¿Quieres probar antes de registrarte? Usa el botón de demo arriba.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
        </p>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordResetDialog} onOpenChange={setShowPasswordResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar Contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </DialogDescription>
          </DialogHeader>
          {resetSent ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Si el correo existe en nuestro sistema, recibirás un enlace de restablecimiento.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Correo electrónico</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="tu@empresa.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <Button
                onClick={async () => {
                  setResetLoading(true)
                  try {
                    const res = await fetch('/api/auth/reset-password', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: resetEmail }),
                    })
                    if (res.ok) {
                      setResetSent(true)
                    }
                  } catch {
                    // silent
                  } finally {
                    setResetLoading(false)
                  }
                }}
                disabled={resetLoading || !resetEmail}
                className="w-full"
              >
                {resetLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Enviar enlace
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordResetDialog(false)
                setResetSent(false)
                setResetEmail('')
              }}
              className="w-full"
            >
              {resetSent ? 'Cerrar' : 'Cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
