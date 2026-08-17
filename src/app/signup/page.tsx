'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Eye, EyeOff, AlertCircle, CheckCircle, Mail, ArrowLeft, RefreshCw } from 'lucide-react'

type Step = 'form' | 'verify'

export default function SignupPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || ''
  const prefillEmail = searchParams.get('email') || ''

  const [step, setStep] = useState<Step>('form')
  const [formData, setFormData] = useState({ name: '', email: prefillEmail, password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [otpValue, setOtpValue] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTermsDialog, setShowTermsDialog] = useState(false)
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false)

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  /**
   * After successful verification, prefer a same-origin `callbackUrl` (e.g.
   * /accept-invite?token=...) so the new account can complete the invitation
   * flow. Only allow same-origin paths to prevent open-redirect.
   */
  function resolvePostSignupRedirect(apiRedirectTo: string | undefined): string {
    if (callbackUrl) {
      try {
        // Reject absolute URLs (open-redirect protection). Accept only paths.
        if (!/^https?:\/\//i.test(callbackUrl) && callbackUrl.startsWith('/')) {
          return callbackUrl
        }
      } catch {
        /* ignore */
      }
    }
    return apiRedirectTo || '/select-plan'
  }

  function startCooldown() {
    setResendCooldown(60)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n })
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.name.trim()) errors.name = 'El nombre es obligatorio'
    else if (formData.name.trim().length < 2) errors.name = 'Mínimo 2 caracteres'
    if (!formData.email.trim()) errors.email = 'El correo es obligatorio'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Correo electrónico inválido'
    if (!formData.password) errors.password = 'La contraseña es obligatoria'
    else if (formData.password.length < 8) errors.password = 'Mínimo 8 caracteres'
    else if (!/[A-Z]/.test(formData.password)) errors.password = 'Debe contener al menos una mayúscula'
    else if (!/[0-9]/.test(formData.password)) errors.password = 'Debe contener al menos un número'
    else if (!/[^A-Za-z0-9]/.test(formData.password)) errors.password = 'Debe contener un carácter especial'
    if (!formData.confirmPassword) errors.confirmPassword = 'Confirma tu contraseña'
    else if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden'
    if (!acceptTerms) errors.terms = 'Debes aceptar los términos y condiciones'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/send-code', {
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
      if (!res.ok) { setError(data.error || 'Error al enviar el código.'); return }
      setStep('verify')
      startCooldown()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (otpValue.length !== 6) return
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim(), code: otpValue }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Código incorrecto.'); setOtpValue(''); return }
      window.location.href = resolvePostSignupRedirect(data.redirectTo)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (otpValue.length === 6 && step === 'verify') { handleVerifyCode() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue])

  const handleResend = async () => {
    if (resendCooldown > 0 || isLoading) return
    setError(null); setOtpValue('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name.trim(), email: formData.email.trim(), password: formData.password, confirmPassword: formData.confirmPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al reenviar.'); return }
      startCooldown()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-slate-900 rounded-2xl px-4 py-3 mb-3 shadow-lg shadow-slate-900/20 flex items-center gap-2">
            <img src="/logo-icon.svg" alt="ValiAutoFlow" width={40} height={40} />
            <span className="text-sm font-black tracking-tight bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-500 bg-clip-text text-transparent">VALI<span className="text-slate-300 font-bold">AutoFlow</span></span>
          </div>
          <p className="text-sm text-gray-500 mt-1">CRM Inteligente con IA</p>
        </div>

        {step === 'form' && (
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl font-semibold text-gray-900">Crear Cuenta</CardTitle>
              <CardDescription>Regístrate para automatizar tus ventas</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendCode} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">Nombre completo</Label>
                  <Input id="name" type="text" placeholder="Tu nombre completo" value={formData.name}
                    onChange={e => updateField('name', e.target.value)} required disabled={isLoading}
                    className={`h-11 ${fieldErrors.name ? 'border-red-300' : 'border-gray-200 focus:border-emerald-500'}`}
                    autoComplete="name" />
                  {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-gray-700">Correo electrónico</Label>
                  <Input id="signup-email" type="email" placeholder="tu@empresa.com" value={formData.email}
                    onChange={e => updateField('email', e.target.value)} required disabled={isLoading}
                    className={`h-11 ${fieldErrors.email ? 'border-red-300' : 'border-gray-200 focus:border-emerald-500'}`}
                    autoComplete="email" />
                  {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-gray-700">Contraseña</Label>
                  <div className="relative">
                    <Input id="signup-password" type={showPassword ? 'text' : 'password'} placeholder="Mayús., número, especial, 8+ car."
                      value={formData.password} onChange={e => updateField('password', e.target.value)} required disabled={isLoading}
                      className={`h-11 pr-10 ${fieldErrors.password ? 'border-red-300' : 'border-gray-200 focus:border-emerald-500'}`}
                      autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-red-500">{fieldErrors.password}</p>}
                  {formData.password && (
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1 flex-1 rounded-full transition-colors ${
                        formData.password.length >= 8 && /[A-Z]/.test(formData.password) && /[0-9]/.test(formData.password) && /[^A-Za-z0-9]/.test(formData.password)
                          ? 'bg-emerald-500' : formData.password.length >= 4 ? 'bg-yellow-500' : 'bg-gray-200'}`} />
                      <span className="text-xs text-gray-400">
                        {formData.password.length >= 8 && /[A-Z]/.test(formData.password) && /[0-9]/.test(formData.password) && /[^A-Za-z0-9]/.test(formData.password) ? 'Fuerte' : formData.password.length >= 4 ? 'Regular' : 'Débil'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirmar contraseña</Label>
                  <div className="relative">
                    <Input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} placeholder="Repite tu contraseña"
                      value={formData.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} required disabled={isLoading}
                      className={`h-11 pr-10 ${fieldErrors.confirmPassword ? 'border-red-300' : formData.confirmPassword && formData.password === formData.confirmPassword ? 'border-emerald-300' : 'border-gray-200 focus:border-emerald-500'}`}
                      autoComplete="new-password" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>}
                  {formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <div className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /><span className="text-xs text-emerald-600">Las contraseñas coinciden</span></div>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="terms" checked={acceptTerms}
                    onCheckedChange={checked => { setAcceptTerms(checked === true); if (fieldErrors.terms) setFieldErrors(prev => { const n = { ...prev }; delete n.terms; return n }) }}
                    disabled={isLoading} className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
                  <label htmlFor="terms" className="text-sm text-gray-600 leading-tight cursor-pointer">
                    Acepto los{' '}
                    <button type="button" onClick={e => { e.preventDefault(); setShowTermsDialog(true) }} className="text-emerald-600 hover:text-emerald-700 font-medium">términos y condiciones</button>{' '}
                    y la{' '}
                    <button type="button" onClick={e => { e.preventDefault(); setShowPrivacyDialog(true) }} className="text-emerald-600 hover:text-emerald-700 font-medium">política de privacidad</button>
                  </label>
                </div>
                {fieldErrors.terms && <p className="text-xs text-red-500 -mt-2">{fieldErrors.terms}</p>}
                <Button type="submit" disabled={isLoading} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando código...</> : 'Continuar'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2">
              <div className="text-center text-sm text-gray-500">
                ¿Ya tienes cuenta?{' '}
                <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">Inicia sesión</Link>
              </div>
              <div className="w-full space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /><span>Sin tarjeta de crédito para empezar</span></div>
                <div className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /><span>Datos encriptados con bcrypt</span></div>
                <div className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /><span>Servidores en México</span></div>
              </div>
            </CardFooter>
          </Card>
        )}

        {step === 'verify' && (
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-emerald-100 mx-auto mb-3">
                <Mail className="h-6 w-6 text-emerald-600" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">Verifica tu correo</CardTitle>
              <CardDescription className="text-center">
                Enviamos un código de 6 dígitos a <span className="font-semibold text-gray-700">{formData.email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <Label className="text-sm font-medium text-gray-700">Código de verificación</Label>
                <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue} disabled={isLoading}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-gray-500 text-center">Ingresa el código de 6 dígitos de tu correo</p>
              </div>
              <Button onClick={handleVerifyCode} disabled={otpValue.length !== 6 || isLoading}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</> : 'Verificar y crear cuenta'}
              </Button>
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-gray-500">¿No recibiste el código?</p>
                <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || isLoading}
                  className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
                </button>
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <button type="button" onClick={() => { setStep('form'); setOtpValue(''); setError(null) }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mx-auto">
                <ArrowLeft className="h-3.5 w-3.5" />Volver y editar datos
              </button>
            </CardFooter>
          </Card>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
        </p>
      </div>

      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Términos y Condiciones</DialogTitle>
            <DialogDescription>Última actualización: Abril 2025</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto text-sm text-gray-600 space-y-4 pr-2">
            <div><h4 className="font-semibold text-gray-900">1. Aceptación de los Términos</h4><p>Al acceder y utilizar ValiAutoFlow, usted acepta estar sujeto a estos Términos y Condiciones.</p></div>
            <div><h4 className="font-semibold text-gray-900">2. Descripción del Servicio</h4><p>ValiAutoFlow es una plataforma SaaS de automatización de ventas y CRM con inteligencia artificial diseñada para Pymes y empresas de servicios en México.</p></div>
            <div><h4 className="font-semibold text-gray-900">3. Cuentas de Usuario</h4><p>Usted es responsable de mantener la confidencialidad de su cuenta y contraseña.</p></div>
            <div><h4 className="font-semibold text-gray-900">4. Uso Aceptable</h4><p>Se prohíbe el uso del servicio para actividades ilegales, envío de spam, acoso, o cualquier actividad que viole las leyes mexicanas aplicables.</p></div>
            <div><h4 className="font-semibold text-gray-900">5. Facturación</h4><p>Los planes se renuevan automáticamente. Puede cancelar en cualquier momento. Los cargos se procesan a través de Stripe.</p></div>
            <p className="text-xs text-gray-400">Para dudas: legal@valiflow.com</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowTermsDialog(false)} className="w-full">Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Política de Privacidad</DialogTitle>
            <DialogDescription>Última actualización: Abril 2025</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto text-sm text-gray-600 space-y-4 pr-2">
            <div><h4 className="font-semibold text-gray-900">1. Información que Recopilamos</h4><p>Recopilamos nombre, correo electrónico, número de teléfono y datos de facturación.</p></div>
            <div><h4 className="font-semibold text-gray-900">2. Protección de Datos</h4><p>Las contraseñas se almacenan con encriptación bcrypt. Cumplimos con la LFPDPPP.</p></div>
            <div><h4 className="font-semibold text-gray-900">3. Sus Derechos (ARCO)</h4><p>Tiene derecho de Acceso, Rectificación, Cancelación y Oposición sobre sus datos. Contacte: privacidad@valiflow.com</p></div>
            <p className="text-xs text-gray-400">Contacto: privacidad@valiflow.com</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowPrivacyDialog(false)} className="w-full">Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
