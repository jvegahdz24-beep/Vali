'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Bot,
  ArrowRight,
  ArrowLeft,
  Check,
  QrCode,
  Sparkles,
  MessageCircle,
  PartyPopper,
  Loader2,
  X,
  ChevronLeft,
  Send,
  Zap,
  Smartphone,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface OnboardingWizardProps {
  workspaceId: string
  onComplete: () => void
}

const industries = [
  { id: 'services', label: 'Servicios Generales', icon: '💼' },
  { id: 'real-estate', label: 'Bienes Raíces', icon: '🏠' },
  { id: 'retail', label: 'Retail', icon: '🛍️' },
  { id: 'professional', label: 'Servicios Profesionales', icon: '⚖️' },
  { id: 'automotive', label: 'Automotriz', icon: '🚗' },
  { id: 'health', label: 'Salud', icon: '🏥' },
  { id: 'restaurants', label: 'Restaurantes', icon: '🍽️' },
  { id: 'education', label: 'Educación', icon: '📚' },
  { id: 'other', label: 'Otro', icon: '🔧' },
]

const personalities = [
  {
    id: 'JHON',
    emoji: '💼',
    name: 'JHON',
    subtitle: 'Asesor comercial inteligente',
    description: 'Cercano, natural, usa lenguaje mexicano. Detecta arquetipos y adapta su tono.',
    sampleResponse: '¡Buenas tardes! 👋 Soy JHON del equipo comercial. Aquí para ayudarte con lo que necesites. ¿Con quién tengo el gusto?',
  },
  {
    id: 'Professional',
    emoji: '💼',
    name: 'Profesional',
    subtitle: 'Corporativo y formal',
    description: 'Formal B2B, datos concretos de ROI y TCO. Ideal para flotas e institucionales.',
    sampleResponse: 'Buenos días. Soy el asesor comercial de la empresa. ¿En qué le puedo apoyar hoy?',
  },
  {
    id: 'Friendly',
    emoji: '😊',
    name: 'Amigable',
    subtitle: 'Casual y cercano',
    description: 'Divertido, cálido, con emojis y lenguaje casual mexicano. Perfecto para retail.',
    sampleResponse: '¡Holaaa! 👋 ¿Qué onda? Estoy aquí para ayudarte a encontrar la solución perfecta. ¿Qué andas buscando? 😊',
  },
  {
    id: 'Aggressive',
    emoji: '🔥',
    name: 'Agresivo',
    subtitle: 'Cerrador de ventas',
    description: 'Alta presión controlada, urgencia y escasez. Para equipos que quieren cerrar YA.',
    sampleResponse: '¡Buenas! Tengo algo que te va a interesar. Tenemos una promo por tiempo limitado — ¿te la cuento o la dejo pasar?',
  },
]

const testMessages = [
  'Hola, me interesa el plan Pro',
  '¿Cuánto cuesta el plan Pro?',
  'Quiero ver opciones de financiamiento',
  '¿Puedo agendar una demo?',
]

export function OnboardingWizard({ workspaceId, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [businessName, setBusinessName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('valiflow_workspace_name') || ''
    }
    return ''
  })
  const [selectedIndustry, setSelectedIndustry] = useState('')
  const [selectedPersonality, setselectedPersonality] = useState('JHON')
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'connecting' | 'connected' | 'qr_ready'>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Live AI Preview state
  const [previewMessage, setPreviewMessage] = useState('Hola, me interesa el plan Pro')
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTested, setAiTested] = useState(false)

  const totalSteps = 5
  const qrPollRef = useRef<NodeJS.Timeout | null>(null)

  const animateTransition = (callback: () => void) => {
    setIsAnimating(true)
    setTimeout(() => {
      callback()
      setIsAnimating(false)
    }, 200)
  }

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      animateTransition(() => setCurrentStep(currentStep + 1))
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      animateTransition(() => setCurrentStep(currentStep - 1))
    }
  }

  const handleSkip = () => {
    onComplete()
  }

  // ── WhatsApp Connection ──

  const handleConnectWhatsApp = async () => {
    setWhatsappStatus('connecting')
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' })
      const data = await res.json()

      if (data.connected) {
        setWhatsappStatus('connected')
        toast({ title: 'WhatsApp conectado', description: 'Tu WhatsApp está listo para usar.' })
        return
      }

      // Check for QR code
      if (data.status?.qrCode || data.qrCode) {
        setQrCode(data.status?.qrCode || data.qrCode)
        setWhatsappStatus('qr_ready')
        startQRPolling()
        return
      }

      // Start polling for QR/status
      startQRPolling()
    } catch {
      setWhatsappStatus('idle')
      toast({ title: 'Error', description: 'No se pudo conectar WhatsApp.', variant: 'destructive' })
    }
  }

  const startQRPolling = () => {
    if (qrPollRef.current) clearInterval(qrPollRef.current)
    qrPollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/whatsapp/status')
        const statusData = await statusRes.json()
        if (statusData.connected) {
          clearInterval(qrPollRef.current!)
          qrPollRef.current = null
          setWhatsappStatus('connected')
          setQrCode(null)
          toast({ title: 'WhatsApp conectado', description: '¡Escaneo exitoso!' })
        }
        if (statusData.qrCode && !qrCode) {
          setQrCode(statusData.qrCode)
          setWhatsappStatus('qr_ready')
        }
      } catch { /* ignore */ }
    }, 3000)
    // Auto-stop after 60 seconds
    setTimeout(() => {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current)
        qrPollRef.current = null
      }
    }, 60000)
  }

  // Cleanup QR polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current)
    }
  }, [])

  // ── Live AI Preview ──

  const handleTestAI = async () => {
    if (!previewMessage.trim()) return
    setAiLoading(true)
    setAiResponse(null)
    setAiTested(true)
    try {
      const res = await fetch('/api/developer/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedPersonality,
          message: previewMessage,
        }),
      })
      const data = await res.json()
      if (data.response) {
        // Strip any markdown from the preview
        const clean = data.response
          .replace(/\*\*/g, '')
          .replace(/##/g, '')
          .replace(/`/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/MODOPORTAL|Modo Demo/gi, '')
          .trim()
        setAiResponse(clean)
      }
    } catch {
      setAiResponse('No se pudo obtener respuesta. Verifica la configuración de IA en el Panel Dev.')
    } finally {
      setAiLoading(false)
    }
  }

  // Auto-test AI when personality changes
  useEffect(() => {
    if (aiTested && previewMessage) {
      handleTestAI()
    }
  }, [selectedPersonality, aiTested, previewMessage])

  const handleComplete = async () => {
    // Save preferences to localStorage
    localStorage.setItem('valiflow_workspace_name', businessName)
    localStorage.setItem('valiflow_onboarding_complete', 'true')
    if (selectedIndustry) {
      localStorage.setItem('valiflow_industry', selectedIndustry)
    }
    localStorage.setItem('valiflow_personality', selectedPersonality)
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex-1">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i <= currentStep ? 'bg-emerald-500' : 'bg-zinc-200'
                  )}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2 text-right">Paso {currentStep + 1} de {totalSteps}</p>
        </div>

        {/* Content */}
        <div
          className={cn(
            'px-6 py-6 transition-all duration-200',
            isAnimating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
          )}
        >
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100 mb-6">
                <Bot className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">¡Bienvenido a ValiAutoFlow!</h2>
              <p className="text-zinc-600 mb-2">Vamos a configurar tu espacio de trabajo</p>
              <p className="text-sm text-zinc-500 mb-8">Solo toma 3 minutos y estarás listo para automatizar tus ventas.</p>

              <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-8 font-semibold gap-2">
                Comenzar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 1: Business Info */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Tu Negocio</h2>
              <p className="text-sm text-zinc-500 mb-6">Cuéntanos sobre tu empresa para personalizar la experiencia.</p>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Nombre del negocio</label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ej: Mi Negocio"
                    className="h-10"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-2 block">Industria</label>
                  <div className="grid grid-cols-2 gap-2">
                    {industries.map((ind) => (
                      <button
                        key={ind.id}
                        onClick={() => setSelectedIndustry(ind.id)}
                        className={cn(
                          'flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm transition-all duration-150',
                          selectedIndustry === ind.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                        )}
                      >
                        <span className="text-lg">{ind.icon}</span>
                        <span className="font-medium">{ind.label}</span>
                        {selectedIndustry === ind.id && <Check className="h-4 w-4 ml-auto text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" onClick={handleBack} className="text-zinc-500 gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Connect WhatsApp */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Conecta WhatsApp</h2>
              <p className="text-sm text-zinc-500 mb-8">Vincula tu WhatsApp para empezar a recibir y enviar mensajes.</p>

              <div className="flex flex-col items-center">
                {whatsappStatus === 'idle' && (
                  <>
                    <div className="w-48 h-48 rounded-2xl bg-zinc-100 flex items-center justify-center mb-6">
                      <QrCode className="h-16 w-16 text-zinc-300" />
                    </div>
                    <Button onClick={handleConnectWhatsApp} className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-6 font-semibold gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Conectar WhatsApp
                    </Button>
                    <p className="text-xs text-zinc-400 mt-3">Se generará un código QR para escanear</p>
                  </>
                )}

                {(whatsappStatus === 'connecting' || whatsappStatus === 'qr_ready') && (
                  <>
                    {qrCode ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <div className="p-3 bg-white rounded-xl shadow-sm border border-zinc-100">
                          <img
                            src={`data:image/png;base64,${qrCode}`}
                            alt="WhatsApp QR Code"
                            className="w-56 h-56"
                          />
                        </div>
                        <p className="text-sm text-zinc-600">Abre WhatsApp en tu teléfono y escanea el código</p>
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Smartphone className="h-3.5 w-3.5" />
                          <span>Menú → Dispositivos vinculados → Vincular</span>
                        </div>
                        <p className="text-[10px] text-yellow-600">El QR expira en 60 segundos</p>
                      </div>
                    ) : (
                      <div className="w-48 h-48 rounded-2xl bg-emerald-50 flex flex-col items-center justify-center mb-6 gap-3">
                        <Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
                        <p className="text-xs text-emerald-600 font-medium">Esperando escaneo...</p>
                      </div>
                    )}
                  </>
                )}

                {whatsappStatus === 'connected' && (
                  <>
                    <div className="w-48 h-48 rounded-2xl bg-emerald-100 flex flex-col items-center justify-center mb-6">
                      <Check className="h-12 w-12 text-emerald-600" />
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 px-3 py-1">
                      ✓ WhatsApp Conectado
                    </Badge>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" onClick={handleBack} className="text-zinc-500 gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleNext}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Más tarde
                  </button>
                  <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    Siguiente
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: AI Agent + Live Preview */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Tu Agente IA</h2>
              <p className="text-sm text-zinc-500 mb-6">Elige la personalidad de tu agente de ventas y prueba cómo responde.</p>

              <div className="space-y-3">
                {personalities.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setselectedPersonality(p.id)}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all duration-150',
                      selectedPersonality === p.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-zinc-200 hover:border-zinc-300'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-zinc-900">{p.name}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-100 text-zinc-500 border-0">
                            {p.subtitle}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500">{p.description}</p>
                      </div>
                      {selectedPersonality === p.id && (
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* ── Live AI Preview ── */}
              <div className="mt-6 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-zinc-800">Vista previa en vivo</span>
                  <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-0">LIVE</Badge>
                </div>

                {/* Test message input */}
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {testMessages.map((msg) => (
                      <button
                        key={msg}
                        onClick={() => setPreviewMessage(msg)}
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full border transition-colors',
                          previewMessage === msg
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        )}
                      >
                        {msg}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleTestAI}
                    disabled={aiLoading || !previewMessage.trim()}
                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </div>

                {/* Chat bubble preview */}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-emerald-600 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">
                      <p className="text-xs">{previewMessage}</p>
                    </div>
                  </div>

                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%] border border-zinc-100 shadow-sm">
                      {aiLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      ) : aiResponse ? (
                        <p className="text-xs text-zinc-700">{aiResponse}</p>
                      ) : aiTested ? (
                        <p className="text-xs text-zinc-400">Sin respuesta</p>
                      ) : (
                        <p className="text-xs text-zinc-400 italic">Presiona el botón para probar</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" onClick={handleBack} className="text-zinc-500 gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleNext}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Personalizar más tarde
                  </button>
                  <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    Siguiente
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100 mb-6">
                <PartyPopper className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">¡Todo listo!</h2>
              <p className="text-zinc-600 mb-3">Tu espacio de trabajo está configurado.</p>
              <div className="flex flex-col gap-2 max-w-xs mx-auto mb-6">
                {businessName && (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>{businessName}</span>
                  </div>
                )}
                {selectedIndustry && (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Industria: {industries.find(i => i.id === selectedIndustry)?.label}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>Agente: {personalities.find(p => p.id === selectedPersonality)?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>WhatsApp {whatsappStatus === 'connected' ? 'conectado' : '(configurar más tarde)'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <Button
                  onClick={() => {
                    handleComplete()
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-semibold gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Completar Configuración
                </Button>
              </div>

              <p className="text-[10px] text-zinc-400 mt-6">
                Pulsa &quot;Completar Configuración&quot; para ir al Dashboard
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
