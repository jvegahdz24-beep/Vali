'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Bot, ArrowRight, Check, QrCode, Sparkles, MessageCircle, PartyPopper, Loader2, X,
  ChevronLeft, Send, Zap, Smartphone, Briefcase, Monitor, ShoppingBag, Home, HeartPulse,
  BookOpen, UtensilsCrossed, Scale, Wrench, Smile, Flame, Clock, MapPin, Mic, Package,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface OnboardingWizardProps {
  workspaceId: string
  onComplete: () => void
}

const industries = [
  { id: 'automotive', label: 'Automotriz / Concesionario', icon: <Wrench className="h-4 w-4" /> },
  { id: 'services', label: 'Servicios Generales', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'real-estate', label: 'Bienes Raíces', icon: <Home className="h-4 w-4" /> },
  { id: 'retail', label: 'Retail', icon: <ShoppingBag className="h-4 w-4" /> },
  { id: 'professional', label: 'Servicios Profesionales', icon: <Scale className="h-4 w-4" /> },
  { id: 'technology', label: 'Tecnología', icon: <Monitor className="h-4 w-4" /> },
  { id: 'health', label: 'Salud', icon: <HeartPulse className="h-4 w-4" /> },
  { id: 'restaurants', label: 'Restaurantes', icon: <UtensilsCrossed className="h-4 w-4" /> },
  { id: 'education', label: 'Educación', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'other', label: 'Otro / Personalizado', icon: <Wrench className="h-4 w-4" /> },
]

const personalities = [
  { id: 'JHON', icon: <Bot className="h-6 w-6" />, name: 'JHON', subtitle: 'Asesor inteligente', description: 'Cercano, natural, mexicano. Detecta arquetipos y adapta su tono.', tone: 'cercano y natural, con lenguaje mexicano, profesional pero amigable' },
  { id: 'Professional', icon: <Briefcase className="h-6 w-6" />, name: 'Profesional', subtitle: 'Corporativo y formal', description: 'Formal B2B, datos concretos. Ideal para institucionales.', tone: 'formal, corporativo y profesional, con datos concretos' },
  { id: 'Friendly', icon: <Smile className="h-6 w-6" />, name: 'Amigable', subtitle: 'Casual y cercano', description: 'Cálido, con emojis y lenguaje casual mexicano. Perfecto para retail.', tone: 'casual, cálido y divertido, con emojis y lenguaje mexicano' },
  { id: 'Aggressive', icon: <Flame className="h-6 w-6" />, name: 'Cerrador', subtitle: 'Cierra ventas', description: 'Urgencia y escasez controladas. Para cerrar YA.', tone: 'directo y persuasivo, con urgencia y enfoque en cerrar la venta' },
]

const TIMEZONES = [
  { id: 'America/Mexico_City', label: 'Centro (CDMX, Guadalajara)' },
  { id: 'America/Cancun', label: 'Sureste (Cancún, Q. Roo)' },
  { id: 'America/Monterrey', label: 'Monterrey' },
  { id: 'America/Tijuana', label: 'Pacífico (Tijuana)' },
  { id: 'America/Hermosillo', label: 'Hermosillo (Sonora)' },
]

const testMessages = ['Hola, me interesa un auto', '¿Cuánto cuesta?', 'Quiero financiamiento', '¿Puedo agendar una cita?']

export function OnboardingWizard({ workspaceId, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [businessName, setBusinessName] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('valiflow_workspace_name') || '' : ''))
  const [selectedIndustry, setSelectedIndustry] = useState('automotive')
  // Detalles del negocio
  const [businessHours, setBusinessHours] = useState('Lun–Vie 9:00–19:00, Sáb 9:00–14:00')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [timezone, setTimezone] = useState('America/Mexico_City')
  // Agente
  const [selectedPersonality, setselectedPersonality] = useState('JHON')
  // Voz / imágenes
  const [groqKey, setGroqKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  // Inventario
  const [sheetsUrl, setSheetsUrl] = useState('')
  // WhatsApp
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'connecting' | 'connected' | 'qr_ready'>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [saving, setSaving] = useState(false)
  // Live AI Preview
  const [previewMessage, setPreviewMessage] = useState('Hola, me interesa un auto')
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTested, setAiTested] = useState(false)

  const STEPS = ['Bienvenida', 'Negocio', 'Detalles', 'Agente', 'WhatsApp', 'Voz', 'Inventario', 'Listo']
  const totalSteps = STEPS.length
  const qrPollRef = useRef<NodeJS.Timeout | null>(null)

  const animateTransition = (cb: () => void) => { setIsAnimating(true); setTimeout(() => { cb(); setIsAnimating(false) }, 180) }
  const handleNext = () => { if (currentStep < totalSteps - 1) animateTransition(() => setCurrentStep(currentStep + 1)) }
  const handleBack = () => { if (currentStep > 0) animateTransition(() => setCurrentStep(currentStep - 1)) }
  const handleSkip = () => onComplete()

  // ── WhatsApp ──
  const handleConnectWhatsApp = async () => {
    setWhatsappStatus('connecting')
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' })
      const data = await res.json()
      if (data.connected || data.status?.connected) { setWhatsappStatus('connected'); toast({ title: 'WhatsApp conectado' }); return }
      if (data.status?.qrCode || data.qrCode) { setQrCode(data.status?.qrCode || data.qrCode); setWhatsappStatus('qr_ready') }
      startQRPolling()
    } catch { setWhatsappStatus('idle'); toast({ title: 'Error', description: 'No se pudo conectar WhatsApp.', variant: 'destructive' }) }
  }
  const startQRPolling = () => {
    if (qrPollRef.current) clearInterval(qrPollRef.current)
    qrPollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/whatsapp/status'); const d = await r.json()
        if (d.connected) { clearInterval(qrPollRef.current!); qrPollRef.current = null; setWhatsappStatus('connected'); setQrCode(null); toast({ title: 'WhatsApp conectado', description: '¡Escaneo exitoso!' }) }
        else if (d.qrCode) { setQrCode(d.qrCode); setWhatsappStatus('qr_ready') }
      } catch { /* ignore */ }
    }, 3000)
    setTimeout(() => { if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null } }, 90000)
  }
  useEffect(() => () => { if (qrPollRef.current) clearInterval(qrPollRef.current) }, [])

  // ── Live AI Preview ──
  const handleTestAI = async () => {
    if (!previewMessage.trim()) return
    setAiLoading(true); setAiResponse(null); setAiTested(true)
    try {
      const res = await fetch('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, message: previewMessage, systemPrompt: `Eres un ${personalities.find(p => p.id === selectedPersonality)?.name}, vendedor de ${businessName || 'el negocio'}. Tono: ${personalities.find(p => p.id === selectedPersonality)?.tone}. Responde breve en español.` }) })
      const data = await res.json()
      setAiResponse((data.response || 'Sin respuesta').replace(/\*\*/g, '').replace(/<think[\s\S]*?<\/think>/gi, '').trim())
    } catch { setAiResponse('No se pudo probar ahora.') } finally { setAiLoading(false) }
  }

  // ── Guardar TODO ──
  const handleComplete = async () => {
    setSaving(true)
    try {
      // 1) Negocio + detalles + agente
      await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessName || undefined,
          industry: selectedIndustry,
          timezone,
          businessHours, businessAddress, businessPhone,
          agentPersonality: selectedPersonality,
        }),
      }).catch(() => {})
      // 2) Tono real del bot (agent_profile vía gBrain)
      const tone = personalities.find(p => p.id === selectedPersonality)?.tone
      if (tone) await fetch('/api/gbrain', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, tone }) }).catch(() => {})
      // 3) Keys de voz/imágenes (opcional)
      if (groqKey.trim() || openaiKey.trim()) await fetch('/api/settings/media-keys', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, groq: groqKey.trim() || undefined, openai: openaiKey.trim() || undefined }) }).catch(() => {})
      // 4) Inventario desde Google Sheets (opcional): preview → commit
      if (sheetsUrl.trim()) {
        try {
          const prev = await fetch('/api/catalog/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, mode: 'preview', source: 'url', url: sheetsUrl.trim() }) })
          const pj = await prev.json()
          if (prev.ok && pj.records?.length) {
            await fetch('/api/catalog/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, mode: 'commit', records: pj.records }) })
            toast({ title: `Inventario importado (${pj.records.length})` })
          }
        } catch { /* no romper el wizard */ }
      }
      localStorage.setItem('valiflow_workspace_name', businessName)
      localStorage.setItem('valiflow_onboarding_complete', 'true')
      localStorage.setItem('valiflow_industry', selectedIndustry)
      toast({ title: '¡Configuración completa!', description: 'Ahora conoce tu panel: te lo enseñamos botón por botón.' })
    } finally {
      setSaving(false)
      // Al cerrar arranca el TOUR GUIADO INTERACTIVO (spotlight sobre los
      // botones reales del panel) — lo levanta DashboardLayout con este flag.
      try { localStorage.setItem('vaf-start-tour', '1') } catch { /* */ }
      onComplete()
    }
  }

  const navButtons = (extra?: ReactNode) => (
    <div className="flex items-center justify-between mt-8">
      <Button variant="ghost" onClick={handleBack} className="text-zinc-500 gap-1"><ChevronLeft className="h-4 w-4" /> Atrás</Button>
      <div className="flex items-center gap-3">
        {extra}
        <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">Siguiente <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
  const skipLink = <button onClick={handleNext} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Omitir</button>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <button onClick={handleSkip} className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors z-10"><X className="h-4 w-4" /></button>

        {/* Step indicator */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex-1"><div className={cn('h-1.5 rounded-full transition-all duration-300', i <= currentStep ? 'bg-emerald-500' : 'bg-zinc-200')} /></div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2 text-right">Paso {currentStep + 1} de {totalSteps} · {STEPS[currentStep]}</p>
        </div>

        <div className={cn('px-6 py-6 transition-all duration-200', isAnimating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0')}>
          {/* 0 — Welcome */}
          {currentStep === 0 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100 mb-6"><Bot className="h-10 w-10 text-emerald-600" /></div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">¡Bienvenido a ValiAutoFlow!</h2>
              <p className="text-zinc-600 mb-2">Vamos a dejar TODO configurado en unos minutos</p>
              <p className="text-sm text-zinc-500 mb-8">Negocio, agente IA, WhatsApp, voz e inventario — listo para vender.</p>
              <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-8 font-semibold gap-2">Comenzar <ArrowRight className="h-4 w-4" /></Button>
            </div>
          )}

          {/* 1 — Negocio */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Tu Negocio</h2>
              <p className="text-sm text-zinc-500 mb-6">El nombre y giro personalizan al agente.</p>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Nombre del negocio</label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej: Autos del Valle" className="h-10" />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-2 block">Industria</label>
                  <div className="grid grid-cols-2 gap-2">
                    {industries.map((ind) => (
                      <button key={ind.id} onClick={() => setSelectedIndustry(ind.id)} className={cn('flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm transition-all', selectedIndustry === ind.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-zinc-200 hover:border-zinc-300 text-zinc-700')}>
                        <span>{ind.icon}</span><span className="font-medium">{ind.label}</span>
                        {selectedIndustry === ind.id && <Check className="h-4 w-4 ml-auto text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {navButtons()}
            </div>
          )}

          {/* 2 — Detalles del negocio */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Detalles del negocio</h2>
              <p className="text-sm text-zinc-500 mb-6">El bot los usa al agendar citas y atender clientes.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horario de atención</label>
                  <Input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="Lun–Vie 9:00–19:00" className="h-10" />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Dirección</label>
                  <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Av. Principal 123, Cancún" className="h-10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Teléfono</label>
                    <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="+52 ..." className="h-10" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Zona horaria</label>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {navButtons(skipLink)}
            </div>
          )}

          {/* 3 — Agente + preview */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Tu Agente IA</h2>
              <p className="text-sm text-zinc-500 mb-5">Elige el tono y pruébalo en vivo.</p>
              <div className="grid grid-cols-2 gap-2">
                {personalities.map((p) => (
                  <button key={p.id} onClick={() => setselectedPersonality(p.id)} className={cn('text-left p-3 rounded-xl border transition-all', selectedPersonality === p.id ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-200 hover:border-zinc-300')}>
                    <div className="flex items-center gap-2 mb-1">{p.icon}<span className="text-sm font-bold text-zinc-900">{p.name}</span>{selectedPersonality === p.id && <Check className="h-4 w-4 text-emerald-600 ml-auto" />}</div>
                    <p className="text-[11px] text-zinc-500">{p.description}</p>
                  </button>
                ))}
              </div>
              <div className="mt-5 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="flex items-center gap-2 mb-3"><Zap className="h-4 w-4 text-emerald-600" /><span className="text-sm font-semibold text-zinc-800">Pruébalo</span></div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {testMessages.map((m) => <button key={m} onClick={() => setPreviewMessage(m)} className={cn('text-[10px] px-2 py-1 rounded-full border', previewMessage === m ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-500')}>{m}</button>)}
                  </div>
                  <Button size="sm" onClick={handleTestAI} disabled={aiLoading || !previewMessage.trim()} className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white">{aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}</Button>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  <div className="flex justify-end"><div className="bg-emerald-600 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]"><p className="text-xs">{previewMessage}</p></div></div>
                  <div className="flex justify-start"><div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%] border border-zinc-100 shadow-sm">
                    {aiLoading ? <span className="text-xs text-zinc-400">Pensando…</span> : aiResponse ? <p className="text-xs text-zinc-700">{aiResponse}</p> : <p className="text-xs text-zinc-400 italic">Presiona enviar para probar</p>}
                  </div></div>
                </div>
              </div>
              {navButtons()}
            </div>
          )}

          {/* 4 — WhatsApp */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Conecta WhatsApp</h2>
              <p className="text-sm text-zinc-500 mb-8">Vincula tu número para recibir y responder mensajes.</p>
              <div className="flex flex-col items-center">
                {whatsappStatus === 'idle' && (<>
                  <div className="w-44 h-44 rounded-2xl bg-zinc-100 flex items-center justify-center mb-6"><QrCode className="h-16 w-16 text-zinc-300" /></div>
                  <Button onClick={handleConnectWhatsApp} className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-6 font-semibold gap-2"><MessageCircle className="h-4 w-4" /> Conectar WhatsApp</Button>
                </>)}
                {(whatsappStatus === 'connecting' || whatsappStatus === 'qr_ready') && (qrCode ? (
                  <div className="space-y-3 flex flex-col items-center">
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-zinc-100"><img src={`data:image/png;base64,${qrCode}`} alt="QR" className="w-52 h-52" /></div>
                    <p className="text-sm text-zinc-600">Abre WhatsApp y escanea el código</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-400"><Smartphone className="h-3.5 w-3.5" /><span>Menú → Dispositivos vinculados → Vincular</span></div>
                  </div>
                ) : (
                  <div className="w-44 h-44 rounded-2xl bg-emerald-50 flex flex-col items-center justify-center mb-6 gap-3"><Loader2 className="h-12 w-12 text-emerald-600 animate-spin" /><p className="text-xs text-emerald-600 font-medium">Generando QR…</p></div>
                ))}
                {whatsappStatus === 'connected' && (<>
                  <div className="w-44 h-44 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6"><Check className="h-12 w-12 text-emerald-600" /></div>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 px-3 py-1">✓ WhatsApp Conectado</Badge>
                </>)}
              </div>
              {navButtons(skipLink)}
            </div>
          )}

          {/* 5 — Voz e imágenes */}
          {currentStep === 5 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1 flex items-center gap-2"><Mic className="h-5 w-5 text-emerald-600" /> Voz e imágenes</h2>
              <p className="text-sm text-zinc-500 mb-6">El bot ya <b>ve imágenes</b> y <b>lee documentos</b>. Para que <b>escuche notas de voz</b> pega una API key (Groq tiene plan gratis). Es opcional.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Groq API key <span className="text-xs text-zinc-400">(gratis · console.groq.com/keys)</span></label>
                  <Input type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder="gsk_..." className="h-10" />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 mb-1.5 block">OpenAI API key <span className="text-xs text-zinc-400">(alternativa)</span></label>
                  <Input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="h-10" />
                </div>
              </div>
              {navButtons(skipLink)}
            </div>
          )}

          {/* 6 — Inventario */}
          {currentStep === 6 && (
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1 flex items-center gap-2"><Package className="h-5 w-5 text-emerald-600" /> Tu inventario</h2>
              <p className="text-sm text-zinc-500 mb-6">Pega un enlace de Google Sheets con tus productos/autos y la IA los importa. Opcional — puedes cargarlo después en Inventario.</p>
              <div>
                <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Enlace de Google Sheets / CSV (público)</label>
                <Input value={sheetsUrl} onChange={(e) => setSheetsUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/..." className="h-10" />
                <p className="text-[11px] text-zinc-400 mt-1.5">Compártelo como &quot;cualquiera con el enlace&quot;. Columnas tipo: nombre, precio, marca, modelo, año, km.</p>
              </div>
              {navButtons(skipLink)}
            </div>
          )}

          {/* 7 — Completar */}
          {currentStep === 7 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100 mb-6"><PartyPopper className="h-10 w-10 text-emerald-600" /></div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">¡Todo listo!</h2>
              <p className="text-zinc-600 mb-4">Guarda tu configuración y conoce tu panel módulo por módulo (2 min).</p>
              <div className="flex flex-col gap-1.5 max-w-xs mx-auto mb-6 text-left">
                {[
                  businessName && `Negocio: ${businessName}`,
                  `Industria: ${industries.find(i => i.id === selectedIndustry)?.label}`,
                  `Agente: ${personalities.find(p => p.id === selectedPersonality)?.name}`,
                  businessHours && `Horario: ${businessHours}`,
                  `WhatsApp: ${whatsappStatus === 'connected' ? 'conectado' : 'pendiente'}`,
                  (groqKey || openaiKey) ? 'Voz: activada' : 'Voz: pendiente',
                  sheetsUrl ? 'Inventario: se importará' : null,
                ].filter(Boolean).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-600"><Check className="h-4 w-4 text-emerald-600 shrink-0" /><span>{t}</span></div>
                ))}
              </div>
              <Button onClick={handleComplete} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-8 font-semibold gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {saving ? 'Guardando…' : 'Guardar y conocer mi panel'}
              </Button>
              <div className="mt-3"><button onClick={handleBack} className="text-xs text-zinc-400 hover:text-zinc-600">Atrás</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
