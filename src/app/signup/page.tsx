'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Loader2, Eye, EyeOff, Bot, AlertCircle, CheckCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function SignupPage() {

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showTermsDialog, setShowTermsDialog] = useState(false)
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false)

  // Handle URL error params (e.g. Google OAuth not configured)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam === 'google_not_configured') {
      setError('Google OAuth no está configurado. Regístrate con tu correo electrónico.')
      window.history.replaceState({}, '', '/signup')
    }
  }, [])

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.name = 'El nombre es obligatorio'
    } else if (formData.name.trim().length < 2) {
      errors.name = 'El nombre debe tener al menos 2 caracteres'
    }

    if (!formData.email.trim()) {
      errors.email = 'El correo electrónico es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Ingresa un correo electrónico válido'
    }

    if (!formData.password) {
      errors.password = 'La contraseña es obligatoria'
    } else if (formData.password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres'
    } else if (!/[A-Z]/.test(formData.password)) {
      errors.password = 'Debe contener al menos una mayúscula'
    } else if (!/[0-9]/.test(formData.password)) {
      errors.password = 'Debe contener al menos un número'
    } else if (!/[^A-Za-z0-9]/.test(formData.password)) {
      errors.password = 'Debe contener al menos un carácter especial'
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirma tu contraseña'
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden'
    }

    if (!acceptTerms) {
      errors.terms = 'Debes aceptar los términos y condiciones'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validate()) return

    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setError('Este correo electrónico ya está registrado. Intenta iniciar sesión.')
        } else {
          setError(data.error || 'Error al crear la cuenta. Intenta de nuevo.')
        }
        return
      }

      // Auto sign in after successful registration using our custom login endpoint
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
        }),
      })

      if (loginRes.ok) {
        // Use full page reload to ensure session cookie is set
        window.location.href = '/'
      } else {
        // Registration succeeded but auto-login failed
        window.location.href = '/login'
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

        {/* Signup Card */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-semibold text-gray-900">
              Crear Cuenta
            </CardTitle>
            <CardDescription>
              Regístrate para empezar a automatizar tus ventas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google OAuth Button */}
            <a
              href="/api/auth/google"
              className="flex items-center justify-center gap-3 w-full h-11 px-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all shadow-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
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
              Continuar con Google
            </a>

            {/* Divider */}
            <div className="relative my-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-gray-400">
                o regístrate con tu correo
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

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                  Nombre
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Tu nombre completo"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                  disabled={isLoading}
                  className={`h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 ${fieldErrors.name ? 'border-red-300 focus:border-red-500' : ''}`}
                  autoComplete="name"
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-500">{fieldErrors.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-sm font-medium text-gray-700">
                  Correo electrónico
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="tu@empresa.com"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  required
                  disabled={isLoading}
                  className={`h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 ${fieldErrors.email ? 'border-red-300 focus:border-red-500' : ''}`}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="text-xs text-red-500">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-sm font-medium text-gray-700">
                  Contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mayús., número, especial, 8+ car."
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    required
                    disabled={isLoading}
                    className={`h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 pr-10 ${fieldErrors.password ? 'border-red-300 focus:border-red-500' : ''}`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-red-500">{fieldErrors.password}</p>
                )}
                {/* Password strength indicator */}
                {formData.password && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`h-1 flex-1 rounded-full transition-colors ${
                      formData.password.length >= 8 ? 'bg-emerald-500' : formData.password.length >= 4 ? 'bg-yellow-500' : 'bg-gray-200'
                    }`} />
                    <span className="text-xs text-gray-400">
                      {formData.password.length >= 8 ? 'Fuerte' : formData.password.length >= 4 ? 'Regular' : 'Débil'}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">
                  Confirmar contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    value={formData.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    required
                    disabled={isLoading}
                    className={`h-11 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 pr-10 ${
                      fieldErrors.confirmPassword ? 'border-red-300 focus:border-red-500' : 
                      formData.confirmPassword && formData.password === formData.confirmPassword ? 'border-emerald-300' : ''
                    }`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>
                )}
                {formData.confirmPassword && formData.password === formData.confirmPassword && (
                  <div className="flex items-center gap-1 mt-1">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-emerald-600">Las contraseñas coinciden</span>
                  </div>
                )}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => {
                    setAcceptTerms(checked === true)
                    if (fieldErrors.terms) {
                      setFieldErrors((prev) => {
                        const next = { ...prev }
                        delete next.terms
                        return next
                      })
                    }
                  }}
                  disabled={isLoading}
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <label htmlFor="terms" className="text-sm text-gray-600 leading-tight cursor-pointer">
                  Acepto los{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowTermsDialog(true)
                    }}
                    className="text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    términos y condiciones
                  </button>{' '}
                  y la{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowPrivacyDialog(true)
                    }}
                    className="text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    política de privacidad
                  </button>
                </label>
              </div>
              {fieldErrors.terms && (
                <p className="text-xs text-red-500 -mt-2">{fieldErrors.terms}</p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  'Crear Cuenta'
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <div className="text-center text-sm text-gray-500">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
                Inicia sesión
              </Link>
            </div>

            {/* Trust elements */}
            <div className="w-full space-y-1.5 pt-1">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Sin tarjeta de crédito requerida</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Datos encriptados con bcrypt</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>🇲🇽 Servidores en México (próximamente)</span>
              </div>
            </div>
          </CardFooter>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
        </p>
      </div>

      {/* Terms Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Términos y Condiciones</DialogTitle>
            <DialogDescription>Última actualización: Abril 2025</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto text-sm text-gray-600 space-y-4 pr-2">
            <div>
              <h4 className="font-semibold text-gray-900">1. Aceptación de los Términos</h4>
              <p>Al acceder y utilizar ValiAutoFlow, usted acepta estar sujeto a estos Términos y Condiciones. Si no está de acuerdo con alguno de estos términos, le rogamos que no utilice nuestro servicio.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">2. Descripción del Servicio</h4>
              <p>ValiAutoFlow es una plataforma SaaS de automatización de ventas y CRM con inteligencia artificial diseñada para Pymes y empresas de servicios en México. El servicio incluye gestión de contactos, automatización de WhatsApp, análisis de conversaciones y herramientas de ventas asistidas por IA.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">3. Cuentas de Usuario</h4>
              <p>Usted es responsable de mantener la confidencialidad de su cuenta y contraseña. ValiAutoFlow no se hace responsable por el uso no autorizado de su cuenta. Debe notificar inmediatamente cualquier uso no autorizado.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">4. Uso Aceptable</h4>
              <p>Se prohíbe el uso del servicio para actividades ilegales, envío de spam, acoso, o cualquier actividad que viole las leyes mexicanas aplicables. ValiAutoFlow se reserva el derecho de suspender cuentas que violen estos términos.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">5. Limitación de Responsabilidad</h4>
              <p>ValiAutoFlow se proporciona &quot;tal cual&quot; sin garantías de ningún tipo. No seremos responsables por pérdidas de datos, interrupciones del servicio, o daños derivados del uso de la plataforma.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">6. Facturación</h4>
              <p>Los planes de suscripción se renuevan automáticamente. Puede cancelar en cualquier momento. Los cargos se procesan a través de Stripe. No se ofrecen reembolsos parciales del período de facturación en curso.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">7. Modificaciones</h4>
              <p>ValiAutoFlow se reserva el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor a partir de su publicación en la plataforma.</p>
            </div>
            <p className="text-xs text-gray-400">Para dudas contacte a: legal@valiflow.com</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTermsDialog(false)}
              className="w-full"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privacy Dialog */}
      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Política de Privacidad</DialogTitle>
            <DialogDescription>Última actualización: Abril 2025</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto text-sm text-gray-600 space-y-4 pr-2">
            <div>
              <h4 className="font-semibold text-gray-900">1. Información que Recopilamos</h4>
              <p>Recopilamos información que usted nos proporciona directamente: nombre, correo electrónico, número de teléfono, datos de facturación. También recopilamos datos de uso de la plataforma y conversaciones procesadas a través de nuestros servicios de IA.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">2. Uso de la Información</h4>
              <p>Utilizamos su información para: proporcionar y mejorar nuestros servicios, procesar transacciones, enviar notificaciones relevantes, personalizar su experiencia, y cumplir con obligaciones legales.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">3. Protección de Datos</h4>
              <p>Implementamos medidas de seguridad técnicas y organizativas para proteger sus datos. Las contraseñas se almacenan con encriptación bcrypt. Las conexiones se protegen con HTTPS/TLS. Cumplimos con los principios de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">4. Compartir Información</h4>
              <p>No vendemos sus datos personales. Podemos compartir información con: proveedores de servicios (Stripe para pagos, proveedores de IA para procesamiento), autoridades competentes cuando sea requerido por ley, y en caso de fusión o adquisición.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">5. IA y Conversaciones</h4>
              <p>Las conversaciones procesadas por nuestro motor de IA se utilizan para generar respuestas y análisis. Los mensajes se almacenan de forma encriptada en nuestros servidores ubicados en México. Puede solicitar la eliminación de sus datos en cualquier momento.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">6. Sus Derechos (ARCO)</h4>
              <p>De acuerdo con la LFPDPPP, usted tiene derecho de: Acceso, Rectificación, Cancelación y Oposición (ARCO) sobre sus datos personales. Para ejercer estos derechos, contacte a: privacidad@valiflow.com</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">7. Cookies</h4>
              <p>Utilizamos cookies esenciales para el funcionamiento de la plataforma. No utilizamos cookies de rastreo de terceros.</p>
            </div>
            <p className="text-xs text-gray-400">Contacto: privacidad@valiflow.com</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPrivacyDialog(false)}
              className="w-full"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
