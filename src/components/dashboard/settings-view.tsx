'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Building2,
  MessageCircle,
  CreditCard,
  Bot,
  Wifi,
  WifiOff,
  Upload,
  Save,
  Check,
  Loader2,
  QrCode,
  Smartphone,
  RefreshCw,
  LogOut,
  Plus,
  Mail,
  Shield,
  Terminal,
  MessageSquare,
  Workflow,
  Code,
  Briefcase,
  Car,
  Monitor,
  ShoppingBag,
  Home,
  HeartPulse,
  BookOpen,
  UtensilsCrossed,
  Landmark,
  Smile,
  Zap,
  Globe,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Send,
  Bell,
  Link as LinkIcon,
  Unlink,
  RotateCcw,
  Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLANS, PERSONALITY_PROMPTS } from '@/lib/constants'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { hasCapability } from '@/lib/rbac'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChatDemo } from './chat-demo'
import { MetaChannelCard } from './meta-channel-card'
import { CfdiConfigCard } from './cfdi-config-card'
import { PaymentsConfigCard } from './payments-config-card'
import { AutomationsView } from './automations-view'
import { DeveloperView } from './developer-view'
import { MetaTutorial } from './meta-tutorial'
import { WhatsAppTemplatesManager } from './whatsapp-templates-manager'
import { ModulesView } from './modules-view'

interface SettingsViewProps {
  workspaceId: string
  initialTab?: string
}

export function SettingsView({ workspaceId, initialTab }: SettingsViewProps) {
  const { user, refreshUser } = useAuth()
  // El panel Avanzado (developer) es exclusivo del Dueño (settings.advanced).
  const canAdvanced = hasCapability(user?.workspaceRole, 'settings.advanced')
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [whatsappConnecting, setWhatsappConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null)
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const pollInterval = useRef<NodeJS.Timeout | null>(null)

  // ── Meta API State ──
  const [waChannel, setWaChannel] = useState<'baileys' | 'meta'>('baileys')
  const [metaConfig, setMetaConfig] = useState<{
    id: string
    phoneNumberId: string
    webhookSecret: string
    businessId?: string | null
    displayPhone?: string | null
    qualityRating?: string | null
    isActive: boolean
  } | null>(null)
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaBusinessId, setMetaBusinessId] = useState('')
  const [metaSaving, setMetaSaving] = useState(false)
  // ── FB SDK Login State ──
  const [fbConnecting, setFbConnecting] = useState(false)
  const [fbPhoneOptions, setFbPhoneOptions] = useState<Array<{
    phoneNumberId: string
    displayPhone: string
    verifiedName: string
    wabaId: string
    businessName: string
    token: string
  }>>([])
  const [fbSelectedPhone, setFbSelectedPhone] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [showMetaTutorial, setShowMetaTutorial] = useState(false)
  const [metaTemplates, setMetaTemplates] = useState<Array<{
    id: string
    name: string
    status: string
    category: string
    language: string
    components: unknown[]
  }>>([])
  const [metaTemplatesLoading, setMetaTemplatesLoading] = useState(false)
  const [activePersonality, setActivePersonality] = useState(() => localStorage.getItem('vf_personality') || 'JHON')
  const [temperature, setTemperature] = useState(() => {
    const val = localStorage.getItem('vf_temperature')
    return val ? parseFloat(val) : 0.7
  })
  const [agentsSaved, setAgentsSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── System Prompt Editor (movido desde el Panel de Desarrollador) ──
  const [selectedPrompt, setSelectedPrompt] = useState(activePersonality)
  const [promptContent, setPromptContent] = useState(PERSONALITY_PROMPTS[activePersonality] || '')
  const [promptSaved, setPromptSaved] = useState(false)
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})

  // ── Telegram Notification Center State (Section 15) ──
  const [telegramStatus, setTelegramStatus] = useState<{
    paired: boolean
    pendingToken: string | null
    pendingTokenExpiresAt: string | null
  } | null>(null)
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false)
  const [telegramUnpairLoading, setTelegramUnpairLoading] = useState(false)
  const [telegramGenerated, setTelegramGenerated] = useState<{
    url: string | null
    token: string
    expiresAt: string
    instructions: string
  } | null>(null)
  const [telegramConfigLoading, setTelegramConfigLoading] = useState(false)
  const [telegramConfigured, setTelegramConfigured] = useState<{
    configured: boolean
    webhook?: { url?: string; pending_update_count?: number }
  } | null>(null)
  // ── Per-workspace bot credentials (each client brings their own bot) ──
  const [telegramBotConfig, setTelegramBotConfig] = useState<{
    hasToken: boolean
    tokenMasked: string | null
    botUsername: string | null
  } | null>(null)
  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState('')
  const [telegramBotUsernameInput, setTelegramBotUsernameInput] = useState('')
  // Keys de transcripción de voz / visión (Groq u OpenAI), por workspace
  const [groqKeyInput, setGroqKeyInput] = useState('')
  const [openaiKeyInput, setOpenaiKeyInput] = useState('')
  const [mediaKeysStatus, setMediaKeysStatus] = useState<{ groqSet: boolean; openaiSet: boolean; groqMasked: string; openaiMasked: string; audioEnabled: boolean } | null>(null)
  const [mediaKeysSaving, setMediaKeysSaving] = useState(false)
  const [telegramBotSaving, setTelegramBotSaving] = useState(false)
  const [telegramTestLoading, setTelegramTestLoading] = useState(false)
  const [telegramTestResult, setTelegramTestResult] = useState<{
    ok: boolean
    summary: string
  } | null>(null)

  // ── General Tab State ──
  const [workspaceName, setWorkspaceName] = useState(() => user?.workspaceName || localStorage.getItem('vf_workspaceName') || 'Mi Negocio')
  const [industry, setIndustry] = useState(() => localStorage.getItem('vf_industry') || 'automotive')
  const [customIndustry, setCustomIndustry] = useState('')
  const [language, setLanguage] = useState(() => user?.locale || localStorage.getItem('vf_language') || 'es')
  const [timezone, setTimezone] = useState<string>('America/Mexico_City')
  // Horario de atención de la IA
  const [aiHoursMode, setAiHoursMode] = useState<'24h' | 'custom'>('24h')
  const [aiStart, setAiStart] = useState('08:00')
  const [aiEnd, setAiEnd] = useState('19:00')
  // Financiamiento automotriz (para las cotizaciones del bot)
  const [financeRate, setFinanceRate] = useState('13.9')
  const [financeMinDown, setFinanceMinDown] = useState('10')
  const [financeTerms, setFinanceTerms] = useState('12, 24, 36, 48, 60, 72')
  const [generalSaved, setGeneralSaved] = useState(false)

  // ── Business Contact State ──
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessHours, setBusinessHours] = useState('')
  const [appointmentUrl, setAppointmentUrl] = useState('')
  const [businessSaved, setBusinessSaved] = useState(false)

  // ── Billing Tab State ──
  const [usageStats, setUsageStats] = useState({
    contacts: { used: 0, limit: 20, label: 'Contactos' },
    agents: { used: 0, limit: 1, label: 'Agentes' },
    aiMessages: { used: 0, limit: 50, label: 'Mensajes IA este mes' },
  })
  const [billingLoaded, setBillingLoaded] = useState(false)
  const [msgResetsAt, setMsgResetsAt] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [billingRedirecting, setBillingRedirecting] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; user: { name: string | null; email: string; image?: string | null }; role: string }>>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // ── Industries ──
  // Automotriz es el foco (primero + default), pero se conservan las demás
  // industrias para futuro. "Otro" + el campo de abajo permiten una personalizada.
  const industries = [
    { value: 'automotive', label: 'Automotriz / Concesionario', icon: <Car className="h-5 w-5" />, desc: 'Venta de autos nuevos y seminuevos' },
    { value: 'services', label: 'Servicios', icon: <Briefcase className="h-5 w-5" />, desc: 'Consultorías y servicios profesionales' },
    { value: 'technology', label: 'Tecnología', icon: <Monitor className="h-5 w-5" />, desc: 'Software, SaaS y desarrollo' },
    { value: 'retail', label: 'Retail', icon: <ShoppingBag className="h-5 w-5" />, desc: 'Tiendas, ecommerce y ventas' },
    { value: 'realestate', label: 'Bienes Raíces', icon: <Home className="h-5 w-5" />, desc: 'Inmobiliarias y corretaje' },
    { value: 'health', label: 'Salud', icon: <HeartPulse className="h-5 w-5" />, desc: 'Clínicas, hospitales y wellness' },
    { value: 'education', label: 'Educación', icon: <BookOpen className="h-5 w-5" />, desc: 'Escuelas, academias y formación' },
    { value: 'food', label: 'Alimentos', icon: <UtensilsCrossed className="h-5 w-5" />, desc: 'Restaurantes, cafeterías y foodtech' },
    { value: 'finance', label: 'Finanzas', icon: <Landmark className="h-5 w-5" />, desc: 'Bancos, fintech y asesoría financiera' },
  ]

  // ── Personalities ──
  const personalities = [
    { id: 'JHON', label: 'JHON', icon: <Bot className="h-6 w-6" />, desc: 'Asesor comercial inteligente, cercano y persuasivo' },
    { id: 'Professional', label: 'Profesional', icon: <Briefcase className="h-6 w-6" />, desc: 'Formal y corporativo, ideal para B2B' },
    { id: 'Friendly', label: 'Amigable', icon: <Smile className="h-6 w-6" />, desc: 'Cercano y casual, perfecto para retail' },
    { id: 'Aggressive', label: 'Agresivo', icon: <Zap className="h-6 w-6" />, desc: 'Cerrador de ventas, urgente y directo' },
  ]

  // ── General Save Handler ──
  const handleSaveGeneral = async () => {
    try {
      setSaving(true)
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName,
          industry: customIndustry.trim() || industry,
          timezone,
          locale: language,
          aiHours: aiHoursMode === 'custom' ? { mode: 'custom', start: aiStart, end: aiEnd } : { mode: '24h' },
          financing: {
            annualRatePct: parseFloat(financeRate) || 0,
            minDownPct: parseFloat(financeMinDown) || 0,
            terms: financeTerms.split(',').map((t) => parseInt(t.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0),
          },
        })
      })
      if (res.ok) {
        localStorage.setItem('vf_workspaceName', workspaceName)
        localStorage.setItem('vf_industry', customIndustry.trim() || industry)
        localStorage.setItem('vf_language', language)
        toast.success('Configuración guardada correctamente')
      } else {
        toast.error('Error al guardar configuración')
      }
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Business Contact Save Handler ──
  const handleSaveBusiness = async () => {
    try {
      setSaving(true)
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessAddress, businessPhone, businessHours, appointmentUrl }),
      })
      if (res.ok) {
        toast.success('Datos de contacto guardados')
        setBusinessSaved(true)
        setTimeout(() => setBusinessSaved(false), 2000)
      } else {
        toast.error('Error al guardar datos de contacto')
      }
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Agents Save Handler ──
  const handleSaveAgents = async () => {    try {
      setSaving(true)
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPersonality: activePersonality, agentTemperature: temperature }),
      })
      if (res.ok) {
        localStorage.setItem('vf_personality', activePersonality)
        localStorage.setItem('vf_temperature', temperature.toString())
        toast.success('Configuración de agentes guardada')
        setAgentsSaved(true)
        setTimeout(() => setAgentsSaved(false), 2000)
      } else {
        toast.error('Error al guardar configuración de agentes')
      }
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Personality change ──
  const handlePersonalityChange = (id: string) => {
    setActivePersonality(id)
  }

  // ── System Prompt handlers (editor movido a la pestaña Agentes) ──
  const handlePromptChange = (id: string) => {
    setSelectedPrompt(id)
    setPromptContent(customPrompts[id] || PERSONALITY_PROMPTS[id] || '')
  }

  const savePrompt = async () => {
    try {
      const res = await fetch('/api/developer/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, slug: selectedPrompt, systemPrompt: promptContent }),
      })
      if (res.ok) {
        setCustomPrompts((prev) => ({ ...prev, [selectedPrompt]: promptContent }))
        setPromptSaved(true)
        setTimeout(() => setPromptSaved(false), 2000)
        toast.success('System prompt guardado')
      } else {
        toast.error('Error al guardar el system prompt')
      }
    } catch {
      toast.error('Error de conexión al guardar el prompt')
    }
  }

  const resetPrompt = () => {
    setPromptContent(PERSONALITY_PROMPTS[selectedPrompt] || '')
  }

  // ── Fetch Billing Data ──
  useEffect(() => {
    if (!workspaceId) return

    // Fetch subscription info
    fetch(`/api/billing/subscription?workspaceId=${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.subscription) {
          setCurrentPlan(data.subscription.plan)
          setSubscriptionData(data.subscription)
        }
        if (data?.planDetails) {
          setSubscriptionData((prev: any) => prev ? { ...prev, ...data.planDetails } : data.planDetails)
        }
        setBillingLoaded(true)
      })
      .catch(() => setBillingLoaded(true))

    // Fetch real-time usage vs limits
    fetch(`/api/billing/usage?workspaceId=${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        setUsageStats({
          contacts: {
            used: data.usage.contacts ?? 0,
            limit: data.limits.maxContacts === -1 ? Infinity : (data.limits.maxContacts ?? 20),
            label: 'Contactos',
          },
          agents: {
            used: data.usage.agents ?? 0,
            limit: data.limits.maxAgents === -1 ? Infinity : (data.limits.maxAgents ?? 1),
            label: 'Agentes',
          },
          aiMessages: {
            used: data.usage.aiMessagesThisMonth ?? 0,
            limit: data.limits.maxAiMessages === -1 ? Infinity : (data.limits.maxAiMessages ?? 50),
            label: 'Mensajes IA este mes',
          },
        })
        if (data.usage?.resetsAt) setMsgResetsAt(data.usage.resetsAt)
        if (data.plan?.slug) setCurrentPlan(data.plan.slug)
      })
      .catch(() => {})
  }, [workspaceId])

  // ── Fetch Team Members ──
  useEffect(() => {
    if (!workspaceId) return
    setTeamLoading(true)
    fetch(`/api/teams?workspaceId=${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && data.members) {
          setTeamMembers(data.members)
        }
      })
      .catch(() => {})
      .finally(() => setTeamLoading(false))
  }, [workspaceId])

  // ── Load logo from localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem('vf_workspace_logo')
    if (saved) setLogoUrl(saved)
  }, [])

  // ── Fetch workspace settings from API on mount ──
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/workspaces/${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && data.workspace) {
          const ws = data.workspace
          if (ws.name) {
            setWorkspaceName(ws.name)
            localStorage.setItem('vf_workspaceName', ws.name)
          }
          if (ws.industry) {
            setIndustry(ws.industry)
            localStorage.setItem('vf_industry', ws.industry)
          }
          if (ws.locale) {
            setLanguage(ws.locale)
            localStorage.setItem('vf_language', ws.locale)
          }
          // Logo persistido en el workspace (fuente de verdad)
          if (ws.logo) {
            setLogoUrl(ws.logo)
            localStorage.setItem('vf_workspace_logo', ws.logo)
          }
          // Load agent settings from workspace settings JSON
          try {
            const wsSettings = JSON.parse(ws.settings || '{}')
            if (wsSettings.timezone) setTimezone(wsSettings.timezone)
            if (wsSettings.aiHours?.mode) {
              setAiHoursMode(wsSettings.aiHours.mode === 'custom' ? 'custom' : '24h')
              if (wsSettings.aiHours.start) setAiStart(wsSettings.aiHours.start)
              if (wsSettings.aiHours.end) setAiEnd(wsSettings.aiHours.end)
            }
            if (wsSettings.financing) {
              const f = wsSettings.financing
              if (f.annualRatePct != null) setFinanceRate(String(f.annualRatePct))
              if (f.minDownPct != null) setFinanceMinDown(String(f.minDownPct))
              if (Array.isArray(f.terms) && f.terms.length) setFinanceTerms(f.terms.join(', '))
            }
            if (wsSettings.agentPersonality) {
              setActivePersonality(wsSettings.agentPersonality)
              localStorage.setItem('vf_personality', wsSettings.agentPersonality)
            }
            if (wsSettings.agentTemperature !== undefined) {
              setTemperature(wsSettings.agentTemperature)
              localStorage.setItem('vf_temperature', String(wsSettings.agentTemperature))
            }
            if (wsSettings.businessAddress) setBusinessAddress(wsSettings.businessAddress)
            if (wsSettings.businessPhone) setBusinessPhone(wsSettings.businessPhone)
            if (wsSettings.businessHours) setBusinessHours(wsSettings.businessHours)
            if (wsSettings.appointmentUrl) setAppointmentUrl(wsSettings.appointmentUrl)
          } catch { /* keep defaults */ }
        }
      })
      .catch(() => { /* keep localStorage values */ })
  }, [workspaceId])

  // ── Load custom prompts from DB (for the Agent system-prompt editor) ──
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/developer/prompts?workspaceId=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.personas) return
        const map: Record<string, string> = {}
        for (const p of data.personas) map[p.slug] = p.systemPrompt
        setCustomPrompts(map)
        setPromptContent((prev) => map[selectedPrompt] || prev)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // ── Logo Upload Handler ──
  // Sube el archivo al servidor y GUARDA la URL en workspace.logo, para que
  // el logo aparezca en el menú lateral (y en todos lados) de forma persistente.
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar 5MB')
      return
    }
    // Vista previa inmediata mientras sube
    const previewReader = new FileReader()
    previewReader.onload = () => setLogoUrl(previewReader.result as string)
    previewReader.readAsDataURL(file)

    try {
      // 1) Subir el archivo (acepta PNG/JPG/WebP/GIF/HEIC — ver /api/uploads)
      const fd = new FormData(); fd.append('file', file); fd.append('workspaceId', workspaceId)
      const up = await fetch('/api/uploads', { method: 'POST', body: fd })
      const upData = await up.json().catch(() => ({}))
      if (!up.ok || !upData?.mediaFile?.fileUrl) throw new Error(upData?.error || 'No se pudo subir el logo')
      const logoUrlSaved = upData.mediaFile.fileUrl as string

      // 2) Persistir la URL en el workspace
      const save = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: logoUrlSaved }),
      })
      if (!save.ok) throw new Error('No se pudo guardar el logo')

      setLogoUrl(logoUrlSaved)
      localStorage.setItem('vf_workspace_logo', logoUrlSaved)
      await refreshUser() // refresca el menú lateral al instante
      toast.success('Logo actualizado — ya aparece en el menú')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el logo')
    } finally {
      e.target.value = ''
    }
  }

  // ── Stripe Checkout Handler ──
  const handleUpgradePlan = async (planKey: string) => {
    setBillingRedirecting(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          planKey,
          billingPeriod: 'monthly',
        }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        toast.error('No se pudo crear la sesión de pago: ' + (data.error || 'Error desconocido'))
        setBillingRedirecting(false)
      }
    } catch {
      toast.error('Error al conectar con el servicio de pagos')
      setBillingRedirecting(false)
    }
  }

  // ── Stripe Portal Handler ──
  const handleManageSubscription = async () => {
    setBillingRedirecting(true)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.portalUrl) {
        window.location.href = data.portalUrl
      } else if (data.needsCheckout) {
        toast.info('No tienes una suscripción activa. Selecciona un plan para comenzar.')
      } else {
        toast.error('No se pudo crear la sesión del portal: ' + (data.error || 'Error desconocido'))
        setBillingRedirecting(false)
      }
    } catch {
      toast.error('Error al conectar con el servicio de pagos')
      setBillingRedirecting(false)
    }
  }

  // Fetch WhatsApp status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (!res.ok) return
      const data = await res.json()
      setWhatsappConnected(data.connected)
      // Only update connecting to false if actually connected (avoid premature stop)
      if (data.connected || data.connecting) {
        setWhatsappConnecting(data.connecting)
      }
      setConnectedPhone(data.phone)
      setLastActivity(data.lastActivity)
      if (data.qrCode) setQrCode(data.qrCode)
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err)
    }
  }, [])

  // Poll status when connecting
  useEffect(() => {
    if (whatsappConnecting) {
      pollInterval.current = setInterval(fetchStatus, 2000)
    } else {
      if (pollInterval.current) {
        clearInterval(pollInterval.current)
        pollInterval.current = null
      }
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [whatsappConnecting, fetchStatus])

  // Initial status check + discovery poll (catches cold-start & stale state)
  useEffect(() => {
    fetchStatus()
    // Poll every 3s for 30s on mount to catch cold-start transitions and stale PC state
    const discoveryInterval = setInterval(fetchStatus, 3000)
    const stopDiscovery = setTimeout(() => clearInterval(discoveryInterval), 30000)
    return () => {
      clearInterval(discoveryInterval)
      clearTimeout(stopDiscovery)
    }
  }, [fetchStatus])

  // Connect WhatsApp
  const handleConnect = async (force = false) => {
    setIsConnecting(true)
    // Start polling immediately so we catch the QR as soon as it arrives
    setWhatsappConnecting(true)
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      if (!res.ok) throw new Error('Error al conectar')
      const data = await res.json()
      if (data.status?.qrCode) setQrCode(data.status.qrCode)
      if (data.status?.connected) {
        setWhatsappConnected(true)
        setWhatsappConnecting(false)
      }
    } catch (err) {
      console.error('Error connecting WhatsApp:', err)
      setWhatsappConnecting(false)
    } finally {
      setIsConnecting(false)
    }
  }

  // Disconnect WhatsApp
  const handleDisconnect = async () => {
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' })
      if (!res.ok) throw new Error('Error al desconectar')
      setWhatsappConnected(false)
      setWhatsappConnecting(false)
      setQrCode(null)
      setConnectedPhone(null)
    } catch (err) {
      console.error('Error disconnecting WhatsApp:', err)
    }
  }

  // ── Telegram Notification Center (Section 15) ──
  const fetchTelegramStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/link')
      if (res.ok) {
        const data = await res.json()
        setTelegramStatus(data)
      }
    } catch { /* silent */ }
  }, [])

  const fetchTelegramConfig = useCallback(async () => {
    if (!workspaceId) return
    setTelegramConfigLoading(true)
    try {
      const res = await fetch(`/api/telegram/setup?workspaceId=${workspaceId}`)
      if (res.ok) {
        const data = await res.json()
        setTelegramConfigured(data)
      }
    } catch { /* silent */ }
    finally {
      setTelegramConfigLoading(false)
    }
  }, [workspaceId])

  const fetchTelegramBotConfig = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/telegram/config?workspaceId=${workspaceId}`)
      if (res.ok) {
        const data = await res.json()
        setTelegramBotConfig(data)
        // No auto-rellenamos el input: el usuario guardado se muestra en la
        // línea verde "Bot conectado" y como placeholder. Así el campo queda
        // limpio y solo se escribe si quieres cambiarlo.
      }
    } catch { /* silent */ }
  }, [workspaceId])

  useEffect(() => {
    fetchTelegramStatus()
    fetchTelegramConfig()
    fetchTelegramBotConfig()
  }, [fetchTelegramStatus, fetchTelegramConfig, fetchTelegramBotConfig])

  const handleSaveTelegramBot = async () => {
    if (!telegramBotTokenInput.trim() && !telegramBotConfig?.hasToken) {
      toast.error('Pega el token que te dio @BotFather')
      return
    }
    setTelegramBotSaving(true)
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          // Only send the token if the user typed a new one (avoid wiping it
          // when they just want to update the username).
          ...(telegramBotTokenInput.trim() ? { botToken: telegramBotTokenInput.trim() } : {}),
          botUsername: telegramBotUsernameInput.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar el bot')
      toast.success('Bot guardado y verificado con Telegram')
      setTelegramBotTokenInput('')
      await fetchTelegramBotConfig()
      // Auto-register the webhook so /start works right away.
      await handleRegisterTelegramWebhook()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el bot')
    } finally {
      setTelegramBotSaving(false)
    }
  }

  const fetchMediaKeys = async () => {
    try { const r = await fetch(`/api/settings/media-keys?workspaceId=${workspaceId}`); if (r.ok) setMediaKeysStatus(await r.json()) } catch { /* */ }
  }
  useEffect(() => { if (workspaceId) fetchMediaKeys() }, [workspaceId])
  const handleSaveMediaKeys = async () => {
    setMediaKeysSaving(true)
    try {
      const body: { workspaceId: string; groq?: string; openai?: string } = { workspaceId }
      if (groqKeyInput.trim()) body.groq = groqKeyInput.trim()
      if (openaiKeyInput.trim()) body.openai = openaiKeyInput.trim()
      const r = await fetch('/api/settings/media-keys', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error()
      toast.success('Key guardada — el bot ya puede transcribir notas de voz')
      setGroqKeyInput(''); setOpenaiKeyInput(''); fetchMediaKeys()
    } catch { toast.error('No se pudo guardar la key') } finally { setMediaKeysSaving(false) }
  }

  const handleTestTelegramConnection = async () => {
    setTelegramTestLoading(true)
    setTelegramTestResult(null)
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al probar la conexión')
      setTelegramTestResult({ ok: !!data.ok, summary: data.summary || (data.ok ? 'Conexión OK' : 'Hay un problema con la conexión') })
      if (data.ok) toast.success('Conexión de Telegram OK')
      else toast.error('La conexión tiene un problema')
    } catch (err) {
      setTelegramTestResult({ ok: false, summary: err instanceof Error ? err.message : 'Error al probar la conexión' })
      toast.error(err instanceof Error ? err.message : 'Error al probar la conexión')
    } finally {
      setTelegramTestLoading(false)
    }
  }

  const handleGenerateTelegramLink = async () => {
    setTelegramLinkLoading(true)
    try {
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al generar el enlace')
      }
      const data = await res.json()
      setTelegramGenerated({
        url: data.url,
        token: data.token,
        expiresAt: data.expiresAt,
        instructions: data.instructions,
      })
      toast.success('Enlace generado. Ábrelo desde tu Telegram para vincular.')
      fetchTelegramStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el enlace')
    } finally {
      setTelegramLinkLoading(false)
    }
  }

  const handleRegisterTelegramWebhook = async () => {
    setTelegramConfigLoading(true)
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action: 'set' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar webhook')
      toast.success('Webhook de Telegram registrado')
      fetchTelegramConfig()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar webhook')
    } finally {
      setTelegramConfigLoading(false)
    }
  }

  const handleUnpairTelegram = async () => {
    if (!confirm('¿Desvincular tu cuenta de Telegram? Dejarás de recibir notificaciones.')) return
    setTelegramUnpairLoading(true)
    try {
      // We don't have a dedicated unpair endpoint, so we use the link endpoint
      // and then immediately clear the chatId via a PUT to the user. The
      // simplest path: hit /api/telegram/link POST which gives us a new token,
      // then we still need to clear chatId. For now, we expose a quick clear
      // by calling a generic unpair that updates telegramChatId=null.
      const res = await fetch('/api/telegram/unpair', { method: 'POST' })
      if (!res.ok) {
        // If endpoint doesn't exist yet, fall back to error
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al desvincular')
      }
      toast.success('Cuenta de Telegram desvinculada')
      fetchTelegramStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al desvincular')
    } finally {
      setTelegramUnpairLoading(false)
    }
  }

  // ── Meta API ──
  const fetchMetaConfig = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/whatsapp/meta/config?workspaceId=${workspaceId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.config) setMetaConfig(data.config)
      if (data.waChannel) setWaChannel(data.waChannel as 'baileys' | 'meta')
    } catch { /* silent */ }
  }, [workspaceId])

  useEffect(() => {
    fetchMetaConfig()
  }, [fetchMetaConfig])

  const handleSaveMeta = async () => {
    if (!metaPhoneNumberId.trim() || !metaAccessToken.trim()) {
      toast.error('Phone Number ID y Access Token son obligatorios')
      return
    }
    setMetaSaving(true)
    try {
      const res = await fetch('/api/whatsapp/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phoneNumberId: metaPhoneNumberId.trim(),
          accessToken: metaAccessToken.trim(),
          businessId: metaBusinessId.trim() || undefined,
          activate: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar configuración')
        return
      }
      setMetaConfig(data.config)
      setWaChannel('meta')
      setMetaPhoneNumberId('')
      setMetaAccessToken('')
      toast.success('API de Meta configurada y activada')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setMetaSaving(false)
    }
  }

  // ── FB SDK Login ──────────────────────────────────────────────
  const loadFbSdk = (appId: string): Promise<void> =>
    new Promise(resolve => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if (w.FB) { w.FB.init({ appId, cookie: true, xfbml: false, version: 'v19.0' }); resolve(); return }
      w.fbAsyncInit = function () {
        w.FB.init({ appId, cookie: true, xfbml: false, version: 'v19.0' })
        resolve()
      }
      const s = document.createElement('script')
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      s.async = true
      document.body.appendChild(s)
    })

  const handleFbLogin = async () => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      toast.error('NEXT_PUBLIC_META_APP_ID no está configurado en .env')
      return
    }
    setFbConnecting(true)
    try {
      await loadFbSdk(appId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FB = (window as any).FB
      const token: string = await new Promise((resolve, reject) => {
        FB.login((resp: { authResponse?: { accessToken: string }; status: string }) => {
          if (resp.authResponse?.accessToken) resolve(resp.authResponse.accessToken)
          else reject(new Error('Login cancelado o sin permisos'))
        }, { scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management' })
      })

      // Fetch businesses
      const bizRes = await fetch(
        `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${token}`
      )
      const bizData = await bizRes.json()
      if (bizData.error) throw new Error(bizData.error.message)

      const options: typeof fbPhoneOptions = []
      for (const biz of (bizData.data ?? []) as Array<{ id: string; name: string }>) {
        const wabaRes = await fetch(
          `https://graph.facebook.com/v19.0/${biz.id}/whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number,verified_name}&access_token=${token}`
        )
        const wabaData = await wabaRes.json()
        for (const waba of (wabaData.data ?? []) as Array<{ id: string; name: string; phone_numbers?: { data: Array<{ id: string; display_phone_number: string; verified_name: string }> } }>) {
          for (const phone of waba.phone_numbers?.data ?? []) {
            options.push({
              phoneNumberId: phone.id,
              displayPhone: phone.display_phone_number,
              verifiedName: phone.verified_name,
              wabaId: waba.id,
              businessName: biz.name,
              token,
            })
          }
        }
      }

      if (options.length === 0) {
        toast.error('No se encontraron números de WhatsApp Business en esta cuenta de Meta')
        return
      }
      setFbPhoneOptions(options)
      setFbSelectedPhone(options[0].phoneNumberId)
      toast.success(`${options.length} número(s) encontrado(s)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al conectar con Facebook')
    } finally {
      setFbConnecting(false)
    }
  }

  const handleSaveFromFb = async () => {
    const selected = fbPhoneOptions.find(p => p.phoneNumberId === fbSelectedPhone)
    if (!selected) return
    setMetaSaving(true)
    try {
      const res = await fetch('/api/whatsapp/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phoneNumberId: selected.phoneNumberId,
          accessToken: selected.token,
          businessId: selected.wabaId,
          activate: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      setMetaConfig(data.config)
      setWaChannel('meta')
      setFbPhoneOptions([])
      setFbSelectedPhone('')
      toast.success('WhatsApp Business API conectado correctamente')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setMetaSaving(false)
    }
  }

  const handleDeleteMeta = async () => {
    try {
      const res = await fetch(`/api/whatsapp/meta/config?workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Error al eliminar'); return }
      setMetaConfig(null)
      setWaChannel('baileys')
      toast.success('Configuración eliminada. Canal revertido a Baileys.')
    } catch {
      toast.error('Error de conexión')
    }
  }

  const fetchMetaTemplates = async () => {
    setMetaTemplatesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/meta/templates?workspaceId=${workspaceId}`)
      const data = await res.json()
      setMetaTemplates(data.templates ?? [])
    } catch { /* silent */ } finally {
      setMetaTemplatesLoading(false)
    }
  }

  const handleSwitchToMeta = async () => {
    try {
      await fetch('/api/whatsapp/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, phoneNumberId: metaConfig!.phoneNumberId, accessToken: '---reuse---', activate: true }),
      })
    } catch { /* silent */ }
    setWaChannel('meta')
  }

  // Token estimate for the system-prompt editor (Agentes tab)
  const promptCharCount = promptContent.length
  const promptTokenEstimate = Math.ceil(promptCharCount / 4)

  // Map legacy tab values (pre-merge) to the new consolidated tabs so deep
  // links like ?tab=whatsapp / settings:whatsapp keep working.
  const tabAliases: Record<string, string> = {
    whatsapp: 'connections',
    telegram: 'connections',
    team: 'billing',
  }
  const resolvedTab = tabAliases[initialTab || ''] || initialTab || 'general'

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Configuración</h3>
        <p className="text-sm text-muted-foreground">
          Administra tu espacio de trabajo y preferencias
        </p>
      </div>

      <Tabs defaultValue={resolvedTab} className="space-y-6">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="general" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Building2 className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="connections" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Plug className="h-3.5 w-3.5" />
            Conexiones
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Bot className="h-3.5 w-3.5" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5 text-xs flex-1 min-w-[120px]">
            <CreditCard className="h-3.5 w-3.5" />
            Facturación y Equipo
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Workflow className="h-3.5 w-3.5" />
            Módulos
          </TabsTrigger>
          {canAdvanced && (
            <TabsTrigger value="advanced" className="gap-1.5 text-xs flex-1 min-w-[100px]">
              <Terminal className="h-3.5 w-3.5" />
              Avanzado
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── General Tab (Simplified) ─── */}
        <TabsContent value="general">
          <Card className="border-border/60 w-full">
            <CardHeader>
              <CardTitle className="text-base">Información del Espacio</CardTitle>
              <CardDescription>Configuración general de tu espacio de trabajo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Name */}
              <div className="grid gap-2">
                <Label>Nombre del espacio</Label>
                <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Mi Negocio" />
              </div>

              {/* Industry as Visual Cards */}
              <div className="grid gap-2">
                <Label>Industria</Label>
                <div className="grid grid-cols-2 gap-2">
                  {industries.map(ind => (
                    <button
                      key={ind.value}
                      onClick={() => setIndustry(ind.value)}
                      className={cn(
                        'p-3 rounded-lg border-2 text-left transition-all',
                        industry === ind.value
                          ? 'border-emerald-500 bg-emerald-50/50'
                          : 'border-border/60 hover:border-border'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center text-slate-600 shrink-0">{ind.icon}</span>
                        <div>
                          <p className="text-sm font-semibold">{ind.label}</p>
                          <p className="text-[10px] text-muted-foreground">{ind.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Industria personalizada (futuro / nichos nuevos) */}
                <div className="grid gap-1.5 mt-1">
                  <Label className="text-xs text-muted-foreground">¿Otra industria? Escríbela y se usará esa (personalizada)</Label>
                  <Input
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    placeholder="Ej: Joyería, Veterinaria, Gimnasio, Mueblería..."
                  />
                </div>
              </div>

              <Separator />

              {/* Logo Upload */}
              <div className="grid gap-2">
                <Label>Logo del espacio</Label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-xl bg-muted/50 border-2 border-dashed border-border/60 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="bg-emerald-600 text-white text-xl font-bold">
                          {workspaceName.slice(0, 2).toUpperCase() || 'VF'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    Subir logo
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Language Selector with Flags */}
              <div className="grid gap-2">
                <Label>Idioma de la interfaz</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage('es')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all',
                      language === 'es'
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-border/60 hover:border-border'
                    )}
                  >
                    <span className="flex items-center justify-center h-6 w-6 rounded text-xs font-bold bg-emerald-100 text-emerald-700">ES</span>
                    <div>
                      <p className="text-sm font-medium">Español</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all',
                      language === 'en'
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-border/60 hover:border-border'
                    )}
                  >
                    <span className="flex items-center justify-center h-6 w-6 rounded text-xs font-bold bg-blue-100 text-blue-700">EN</span>
                    <div>
                      <p className="text-sm font-medium">English</p>
                    </div>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Timezone — anchors appointment times across WhatsApp + calendar */}
              <div className="grid gap-2">
                <Label>Zona horaria del negocio</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Las citas (en WhatsApp y el calendario) se muestran en esta zona. Elige la de tu negocio.
                </p>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Cancun">Cancún / Quintana Roo (UTC-5)</SelectItem>
                    <SelectItem value="America/Mexico_City">Ciudad de México / Centro (UTC-6)</SelectItem>
                    <SelectItem value="America/Tijuana">Tijuana / Noroeste (UTC-7/-8)</SelectItem>
                    <SelectItem value="America/Hermosillo">Hermosillo / Sonora (UTC-7)</SelectItem>
                    <SelectItem value="America/Bogota">Bogotá / Lima (UTC-5)</SelectItem>
                    <SelectItem value="America/New_York">Nueva York / Miami (UTC-5/-4)</SelectItem>
                    <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (UTC-3)</SelectItem>
                    <SelectItem value="Europe/Madrid">Madrid (UTC+1/+2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Horario de atención de la IA */}
              <div className="grid gap-2">
                <Label>Horario de atención de la IA</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Define cuándo el bot responde solo. Fuera de ese horario no contesta (lo atiendes tú).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAiHoursMode('24h')}
                    className={cn('px-3 py-2 rounded-lg border-2 text-sm font-medium', aiHoursMode === '24h' ? 'border-emerald-500 bg-emerald-50/50' : 'border-border/60 hover:border-border')}
                  >24 horas</button>
                  <button
                    type="button"
                    onClick={() => setAiHoursMode('custom')}
                    className={cn('px-3 py-2 rounded-lg border-2 text-sm font-medium', aiHoursMode === 'custom' ? 'border-emerald-500 bg-emerald-50/50' : 'border-border/60 hover:border-border')}
                  >Horario personalizado</button>
                  {aiHoursMode === 'custom' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">De</span>
                      <Input type="time" value={aiStart} onChange={(e) => setAiStart(e.target.value)} className="w-[120px]" />
                      <span className="text-xs text-muted-foreground">a</span>
                      <Input type="time" value={aiEnd} onChange={(e) => setAiEnd(e.target.value)} className="w-[120px]" />
                    </div>
                  )}
                </div>
                {aiHoursMode === 'custom' && (
                  <p className="text-[11px] text-muted-foreground">
                    Ej: de 08:00 a 19:00 la IA contesta de día. Si pones de 19:00 a 08:00, contesta de noche (cruza medianoche).
                  </p>
                )}
              </div>

              {/* Financiamiento automotriz */}
              <div className="grid gap-2">
                <Label>Financiamiento (cotizaciones del bot)</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  El asesor IA calcula mensualidades reales con estos datos (enganche, plazo y tasa).
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Tasa anual (%)</label>
                    <Input type="number" step="0.1" value={financeRate} onChange={(e) => setFinanceRate(e.target.value)} className="w-[110px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Enganche mínimo (%)</label>
                    <Input type="number" value={financeMinDown} onChange={(e) => setFinanceMinDown(e.target.value)} className="w-[130px]" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[200px]">
                    <label className="text-[11px] text-muted-foreground">Plazos (meses, separados por coma)</label>
                    <Input value={financeTerms} onChange={(e) => setFinanceTerms(e.target.value)} placeholder="12, 24, 36, 48, 60, 72" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleSaveGeneral} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
                {generalSaved && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Guardado
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Módulos CTA */}
          <Card className="border-border/60 w-full mt-4 bg-gradient-to-br from-emerald-50/60 to-white">
            <CardContent className="p-4 flex items-start gap-4">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Workflow className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">Dirección, catálogo y citas → Módulos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configura la dirección física, horarios, catálogo de productos y agenda en la pestaña <span className="font-medium text-zinc-700">Módulos</span>. El agente IA inyecta solo la información de los módulos que actives, sin placeholders vacíos.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Conexiones Tab (WhatsApp + Telegram + APIs) ─── */}
        <TabsContent value="connections" className="space-y-8">
          {/* ── Widget de chat para TU SITIO WEB (2026-07-20) ── */}
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <Globe className="h-5 w-5 text-violet-500" />
              <h4 className="text-base font-semibold">Chat para tu sitio web</h4>
            </div>
            <Card className="border-violet-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tu página web también vende sola</CardTitle>
                <CardDescription>
                  Pega esta línea antes de <code>&lt;/body&gt;</code> en tu sitio y aparecerá una burbuja de chat con tu marca,
                  atendida por tu MISMO asesor IA. Cada visitante que escribe se convierte en lead dentro de tu CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] bg-muted rounded-lg px-3 py-2.5 overflow-x-auto whitespace-nowrap">
                    {`<script src="https://valiautoflow.com/api/widget/loader?ws=${workspaceId}" async></script>`}
                  </code>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => {
                    navigator.clipboard.writeText(`<script src="https://valiautoflow.com/api/widget/loader?ws=${workspaceId}" async></script>`)
                    toast.success('Código copiado — pégalo en tu sitio web')
                  }}>Copiar</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Usa el nombre y logo de tu negocio automáticamente. Los chats llegan a Conversaciones como canal Web,
                  con seguimiento automático incluido. Compatible con cualquier página (WordPress, Wix, Shopify, HTML).
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── WhatsApp ── */}
          <div className="w-full space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              <h4 className="text-base font-semibold">WhatsApp</h4>
            </div>
            {/* Connection Status Card */}
            <Card className={cn(
              'border-2',
              whatsappConnected
                ? 'border-emerald-200 bg-emerald-50/30'
                : whatsappConnecting
                  ? 'border-yellow-200 bg-yellow-50/30'
                  : 'border-border/60'
            )}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      WhatsApp Directo (Baileys)
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Conexión directa sin API de Meta. Solo escanea el QR.
                    </CardDescription>
                  </div>
                  <Badge className={cn(
                    'h-6 text-xs border-0 font-medium',
                    whatsappConnected
                      ? 'bg-emerald-100 text-emerald-700'
                      : whatsappConnecting
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-zinc-100 text-zinc-500'
                  )}>
                    {whatsappConnected ? 'Conectado' : whatsappConnecting ? 'Conectando...' : 'Desconectado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-900">Riesgo de baneo</p>
                      <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                        Esta conexión no es oficial de Meta. Aunque está diseñada técnicamente para reducir detecciones automatizadas,
                        existe riesgo de baneo o suspensión del número. Recomendamos usar siempre WhatsApp Business API Oficial (Meta)
                        para evitar problemas y operar con mayor estabilidad.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-background/80">
                  <div className="flex items-center gap-3">
                    {whatsappConnected ? (
                      <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Wifi className="h-5 w-5 text-emerald-600" />
                      </div>
                    ) : whatsappConnecting ? (
                      <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center">
                        <WifiOff className="h-5 w-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {whatsappConnected
                          ? `Conectado: ${connectedPhone || 'WhatsApp'}`
                          : whatsappConnecting
                            ? 'Esperando escaneo de QR...'
                            : 'WhatsApp no conectado'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {whatsappConnected
                          ? `Última actividad: ${lastActivity ? new Date(lastActivity).toLocaleString('es-MX') : 'ahora mismo'}`
                          : whatsappConnecting
                            ? 'Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo'
                            : 'Conecta tu WhatsApp para recibir y enviar mensajes'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* QR Code Section */}
                {!whatsappConnected && (
                  <div className="space-y-3">
                    {qrCode ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-medium">Escanea este código QR con WhatsApp</span>
                        </div>
                        <div className="flex justify-center">
                          <div className="p-4 bg-white rounded-xl shadow-sm border border-border/30">
                            <img
                              src={`data:image/png;base64,${qrCode}`}
                              alt="WhatsApp QR Code"
                              className="w-64 h-64"
                            />
                          </div>
                        </div>
                        <div className="text-center space-y-2">
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Smartphone className="h-3.5 w-3.5" />
                            <span>1. Abre WhatsApp en tu teléfono</span>
                          </div>
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <span>{"2. Ve a Menú > Dispositivos vinculados > Vincular dispositivo"}</span>
                          </div>
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <QrCode className="h-3.5 w-3.5" />
                            <span>3. Apunta la cámara al QR</span>
                          </div>
                          <p className="text-[10px] text-yellow-600 mt-2">
                            El QR expira en 60 segundos. Si caduca, haz clic en Refresh.
                          </p>
                        </div>
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleConnect(true)}
                            disabled={isConnecting}
                          >
                            <RefreshCw className={cn('h-4 w-4', isConnecting && 'animate-spin')} />
                            Refresh QR
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-48 h-48 mx-auto bg-muted/30 rounded-xl flex items-center justify-center border-2 border-dashed border-border/60">
                          <div className="text-center">
                            <QrCode className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Código QR</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Haz clic en el botón de abajo para generar tu código QR
                          </p>
                          <Button
                            onClick={() => handleConnect()}
                            disabled={isConnecting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generando QR...
                              </>
                            ) : (
                              <>
                                <MessageCircle className="h-4 w-4" />
                                Conectar WhatsApp
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected State */}
                {whatsappConnected && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-background/80 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Número</p>
                        <p className="text-sm font-bold">{connectedPhone || 'N/A'}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/80 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Estado</p>
                        <p className="text-sm font-bold text-emerald-600">Activo</p>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-emerald-800">WhatsApp conectado y funcionando</p>
                          <p className="text-[10px] text-emerald-600 mt-1">
                            Los mensajes entrantes se procesan automáticamente con IA.
                            Los leads se crean y califican de forma automática en tu CRM.
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50"
                      onClick={handleDisconnect}
                    >
                      <LogOut className="h-4 w-4" />
                      Desconectar WhatsApp
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How it Works */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">¿Cómo funciona?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { num: '1', title: 'Escanea el QR', desc: 'Vincula tu WhatsApp como si fuera WhatsApp Web. No necesitas cuenta de Meta Business ni verificación.' },
                    { num: '2', title: 'Recibe mensajes automáticamente', desc: 'Cuando un cliente te escribe, el mensaje llega a ValiAutoFlow y se guarda en tu CRM automáticamente.' },
                    { num: '3', title: 'IA responde por ti', desc: 'Nuestro agente IA analiza el mensaje, califica al lead y responde automáticamente con la personalidad configurable.' },
                    { num: '4', title: 'Gestiona desde el Inbox', desc: 'Ve todas las conversaciones, toma el control cuando quieras, o deja que la IA maneje todo.' },
                  ].map(step => (
                    <div key={step.num} className="flex items-start gap-3">
                      <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-emerald-700">{step.num}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{step.title}</p>
                        <p className="text-xs text-muted-foreground">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── Meta Cloud API Card ── */}
            <Card className={cn(
              'border-2',
              waChannel === 'meta' && metaConfig?.isActive
                ? 'border-blue-200 bg-blue-50/20'
                : 'border-border/60'
            )}>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      WhatsApp Business API Oficial (Meta)
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Número verificado, alta confiabilidad y plantillas aprobadas por Meta.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {waChannel === 'meta' && metaConfig?.isActive && (
                      <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Canal activo</Badge>
                    )}
                    {metaConfig && (
                      <Badge className={cn(
                        'text-xs border-0',
                        metaConfig.qualityRating === 'GREEN' ? 'bg-emerald-100 text-emerald-700' :
                        metaConfig.qualityRating === 'YELLOW' ? 'bg-yellow-100 text-yellow-700' :
                        metaConfig.qualityRating === 'RED' ? 'bg-red-100 text-red-700' :
                        'bg-zinc-100 text-zinc-500'
                      )}>
                        {metaConfig.qualityRating === 'GREEN' ? '● Alta calidad' :
                         metaConfig.qualityRating === 'YELLOW' ? '● Media calidad' :
                         metaConfig.qualityRating === 'RED' ? '● Baja calidad' : 'N/A'}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Configured state */}
                {metaConfig ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-background/80 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Número</p>
                        <p className="text-sm font-bold">{metaConfig.displayPhone || metaConfig.phoneNumberId}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/80 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Estado</p>
                        <p className="text-sm font-bold text-blue-600">
                          {metaConfig.isActive ? 'Activo' : 'Inactivo'}
                        </p>
                      </div>
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">URL del Webhook (configura en Meta Developer Console)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/meta/webhook`}
                          className="text-xs font-mono bg-muted/40 h-8"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/meta/webhook`)
                            toast.success('URL copiada')
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Webhook Verify Token */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Verify Token (usa este valor en Meta Developer Console)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={metaConfig.webhookSecret}
                          className="text-xs font-mono bg-muted/40 h-8"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(metaConfig.webhookSecret)
                            toast.success('Token copiado')
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Templates section */}
                    {metaConfig.businessId && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Plantillas aprobadas</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={fetchMetaTemplates}
                            disabled={metaTemplatesLoading}
                          >
                            {metaTemplatesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Actualizar
                          </Button>
                        </div>
                        {metaTemplates.length > 0 ? (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {metaTemplates.map(t => (
                              <div key={t.id} className="flex items-center justify-between p-2 rounded-md bg-background/80 text-xs">
                                <div>
                                  <span className="font-medium">{t.name}</span>
                                  <span className="text-muted-foreground ml-2">{t.language}</span>
                                </div>
                                <Badge className={cn(
                                  'text-[10px] border-0 ml-2',
                                  t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                  t.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                  'bg-yellow-100 text-yellow-700'
                                )}>
                                  {t.status === 'APPROVED' ? 'Aprobada' : t.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            Haz clic en Actualizar para cargar plantillas
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open('https://developers.facebook.com/apps/', '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Meta Developer Console
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50 ml-auto"
                        onClick={handleDeleteMeta}
                      >
                        Eliminar configuración
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Setup form */
                  <div className="space-y-4">

                    {/* Iniciar sesión con Meta (1 clic) — descubre tus números y conecta sin pegar credenciales */}
                    <div className="space-y-2">
                      {fbPhoneOptions.length === 0 ? (
                        <Button
                          type="button"
                          onClick={handleFbLogin}
                          disabled={fbConnecting}
                          className="w-full bg-[#1877f2] hover:bg-[#1466d1] text-white gap-2"
                        >
                          {fbConnecting ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Conectando con Meta…</>
                          ) : (
                            <><ExternalLink className="h-4 w-4" /> Iniciar sesión con Meta</>
                          )}
                        </Button>
                      ) : (
                        <div className="space-y-2 p-3 rounded-lg border border-blue-200 bg-blue-50">
                          <Label className="text-xs font-medium text-blue-800">Elige el número de WhatsApp Business a conectar</Label>
                          <select
                            value={fbSelectedPhone}
                            onChange={e => setFbSelectedPhone(e.target.value)}
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {fbPhoneOptions.map(p => (
                              <option key={p.phoneNumberId} value={p.phoneNumberId}>
                                {p.displayPhone} — {p.verifiedName || p.businessName}
                              </option>
                            ))}
                          </select>
                          <Button
                            onClick={handleSaveFromFb}
                            disabled={metaSaving}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                          >
                            {metaSaving ? (
                              <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                            ) : (
                              <><CheckCircle2 className="h-4 w-4" /> Conectar este número</>
                            )}
                          </Button>
                        </div>
                      )}
                      <p className="text-[11px] text-center text-muted-foreground">
                        Inicia sesión con tu cuenta de Meta y elige tu número — no necesitas pegar credenciales.
                      </p>
                    </div>

                    {/* Divisor */}
                    <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                      <div className="h-px flex-1 bg-border" /> O CONFIGÚRALO MANUALMENTE <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* Tutorial CTA */}
                    <button
                      type="button"
                      onClick={() => setShowMetaTutorial(true)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-blue-100 group-hover:bg-blue-200 transition-colors">
                          <BookOpen className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-blue-800">¿No sabes cómo obtener tus credenciales?</p>
                          <p className="text-xs text-blue-600">Ver tutorial paso a paso con imágenes →</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-blue-400 group-hover:text-blue-600 transition-colors shrink-0" />
                    </button>

                    {/* Manual credentials form */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium" htmlFor="meta-phone-id">Phone Number ID <span className="text-red-500">*</span></Label>
                        <Input
                          id="meta-phone-id"
                          placeholder="123456789012345"
                          value={metaPhoneNumberId}
                          onChange={e => setMetaPhoneNumberId(e.target.value)}
                          className="h-8 text-sm font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">Meta Developer Console → WhatsApp → API Setup → Phone Number ID</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium" htmlFor="meta-token">System User Access Token <span className="text-red-500">*</span></Label>
                        <Input
                          id="meta-token"
                          type="password"
                          placeholder="EAAxxxxxxxx..."
                          value={metaAccessToken}
                          onChange={e => setMetaAccessToken(e.target.value)}
                          className="h-8 text-sm font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">Usa un token permanente de System User (no el token temporal de la app)</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium" htmlFor="meta-biz-id">Business Account ID <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                        <Input
                          id="meta-biz-id"
                          placeholder="234567890123456"
                          value={metaBusinessId}
                          onChange={e => setMetaBusinessId(e.target.value)}
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                      <Button
                        onClick={handleSaveMeta}
                        disabled={metaSaving || !metaPhoneNumberId || !metaAccessToken}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                      >
                        {metaSaving ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Validando...</>
                        ) : (
                          <><CheckCircle2 className="h-4 w-4" /> Guardar y activar Meta API</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <MetaTutorial open={showMetaTutorial} onClose={() => setShowMetaTutorial(false)} />
              </CardContent>
            </Card>

            {/* Gestor de plantillas de WhatsApp (Meta) */}
            <WhatsAppTemplatesManager workspaceId={workspaceId} />

            {/* Channel indicator */}
            {metaConfig && (
              <Card className="border-border/60 bg-muted/20">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Canal activo:</span>
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        'text-xs border-0',
                        waChannel === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                      )}>
                        {waChannel === 'meta' ? '● Meta Cloud API' : '● Baileys (QR)'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Telegram ── */}
          <div className="w-full space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <Send className="h-5 w-5 text-sky-600" />
              <h4 className="text-base font-semibold">Telegram</h4>
            </div>

            {/* ── Paso 1: cada cliente crea y conecta SU propio bot ── */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-sky-600" />
                  Paso 1 · Crea y conecta tu bot de Telegram
                </CardTitle>
                <CardDescription>
                  Cada negocio usa su propio bot. Créalo gratis en 1 minuto con @BotFather y pega aquí sus datos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Instructions */}
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4">
                  <p className="text-sm font-semibold text-sky-900 mb-2">Cómo crear tu bot</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs text-sky-900">
                    <li>
                      Abre Telegram y busca{' '}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-semibold underline underline-offset-2"
                      >
                        @BotFather
                      </a>{' '}
                      (la cuenta oficial con el ✔ azul).
                    </li>
                    <li>Envíale <span className="font-mono font-semibold">/newbot</span>.</li>
                    <li>Escribe un <span className="font-semibold">nombre</span> visible (ej. «Avisos Mi Negocio»).</li>
                    <li>
                      Escribe un <span className="font-semibold">usuario</span> único que debe terminar en{' '}
                      <span className="font-mono font-semibold">bot</span> (ej.{' '}
                      <span className="font-mono">minegocio_avisos_bot</span>).
                    </li>
                    <li>
                      BotFather te dará un <span className="font-semibold">token</span> tipo{' '}
                      <span className="font-mono">123456789:AAE...</span>. Cópialo y pégalo abajo.
                    </li>
                  </ol>
                </div>

                {/* Saved state */}
                {telegramBotConfig?.hasToken && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Bot conectado:{' '}
                      {telegramBotConfig.botUsername ? (
                        <span className="font-mono font-semibold">@{telegramBotConfig.botUsername}</span>
                      ) : (
                        'token guardado'
                      )}
                      {telegramBotConfig.tokenMasked && (
                        <span className="text-emerald-700"> · {telegramBotConfig.tokenMasked}</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Inputs */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-bot-token" className="text-xs">
                      Token del bot {telegramBotConfig?.hasToken && <span className="text-muted-foreground">(deja vacío para no cambiarlo)</span>}
                    </Label>
                    <Input
                      id="tg-bot-token"
                      type="password"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      name="vf-tg-token"
                      placeholder={telegramBotConfig?.hasToken ? '•••• ya configurado ••••' : '123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                      value={telegramBotTokenInput}
                      onChange={(e) => setTelegramBotTokenInput(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-bot-username" className="text-xs">
                      Usuario del bot (sin @)
                    </Label>
                    <Input
                      id="tg-bot-username"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      name="vf-tg-username"
                      placeholder={telegramBotConfig?.botUsername || 'minegocio_avisos_bot'}
                      value={telegramBotUsernameInput}
                      onChange={(e) => setTelegramBotUsernameInput(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleSaveTelegramBot}
                    disabled={telegramBotSaving}
                    className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
                  >
                    {telegramBotSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar y conectar bot
                  </Button>
                  <Button
                    onClick={handleTestTelegramConnection}
                    disabled={telegramTestLoading || !telegramBotConfig?.hasToken}
                    variant="outline"
                    className="gap-2"
                  >
                    {telegramTestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Probar conexión
                  </Button>
                </div>

                {telegramTestResult && (
                  <div className={cn(
                    'flex items-start gap-2 rounded-lg border p-3 text-xs',
                    telegramTestResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  )}>
                    {telegramTestResult.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span>{telegramTestResult.summary}</span>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Verificamos el token con Telegram y registramos el webhook automáticamente. &quot;Probar conexión&quot; valida el bot
                  y, si ya vinculaste tu Telegram (Paso 2), te envía un mensaje de prueba para confirmar que las alertas llegan.
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4 text-sky-600" />
                    Paso 2 · Vincula tu Telegram
                  </CardTitle>
                  <CardDescription>
                    Vincula tu cuenta para recibir alertas internas de leads calientes, citas, escalaciones y pagos fallidos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                        telegramStatus?.paired ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                      )}>
                        {telegramStatus?.paired ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {telegramStatus?.paired ? 'Telegram vinculado' : 'Telegram sin vincular'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {telegramStatus?.paired
                            ? 'Esta cuenta ya puede recibir notificaciones del workspace.'
                            : 'Genera un enlace y abre Telegram para terminar la vinculación.'}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn(
                      'w-fit border-0',
                      telegramStatus?.paired ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                    )}>
                      {telegramStatus?.paired ? 'Activo' : 'Pendiente'}
                    </Badge>
                  </div>

                  {telegramStatus?.pendingToken && !telegramStatus.paired && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-800">
                          <p className="font-medium">Ya hay un token pendiente.</p>
                          <p className="mt-0.5">
                            Expira el {telegramStatus.pendingTokenExpiresAt
                              ? new Date(telegramStatus.pendingTokenExpiresAt).toLocaleString('es-MX')
                              : 'próximamente'}.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {telegramGenerated && (
                    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/70 p-4">
                      <div>
                        <p className="text-sm font-semibold text-sky-900">Enlace generado</p>
                        <p className="text-xs text-sky-800 mt-1">{telegramGenerated.instructions}</p>
                      </div>

                      {telegramGenerated.url && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-sky-900">Enlace directo</Label>
                          <div className="flex items-center gap-2">
                            <Input readOnly value={telegramGenerated.url} className="h-8 text-xs font-mono bg-white/80" />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 shrink-0 bg-white"
                              onClick={() => {
                                navigator.clipboard.writeText(telegramGenerated.url || '')
                                toast.success('Enlace copiado')
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button asChild variant="outline" size="sm" className="h-8 px-2 shrink-0 bg-white">
                              <a href={telegramGenerated.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-xs text-sky-900">Token manual</Label>
                        <div className="flex items-center gap-2">
                          <Input readOnly value={`/start ${telegramGenerated.token}`} className="h-8 text-xs font-mono bg-white/80" />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 shrink-0 bg-white"
                            onClick={() => {
                              navigator.clipboard.writeText(`/start ${telegramGenerated.token}`)
                              toast.success('Token copiado')
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-sky-800">
                          Expira el {new Date(telegramGenerated.expiresAt).toLocaleString('es-MX')}.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handleGenerateTelegramLink}
                      disabled={telegramLinkLoading}
                      className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
                    >
                      {telegramLinkLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                      Generar enlace de Telegram
                    </Button>
                    {telegramStatus?.paired && (
                      <Button
                        variant="outline"
                        onClick={handleUnpairTelegram}
                        disabled={telegramUnpairLoading}
                        className="gap-2"
                      >
                        {telegramUnpairLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink className="h-4 w-4" />
                        )}
                        Desvincular
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-slate-600" />
                    Webhook del bot (automático)
                  </CardTitle>
                  <CardDescription>
                    Registra el webhook para que Telegram pueda completar la vinculación con /start.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Configuración</span>
                      <Badge className={cn(
                        'border-0',
                        telegramConfigured?.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                      )}>
                        {telegramConfigured?.configured ? 'Detectada' : 'No detectada'}
                      </Badge>
                    </div>
                    {telegramConfigured?.webhook?.url && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Webhook actual</Label>
                        <Input readOnly value={telegramConfigured.webhook.url} className="h-8 text-xs font-mono bg-background" />
                      </div>
                    )}
                    {telegramConfigured?.webhook?.pending_update_count !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Updates pendientes</span>
                        <span className="font-medium">{telegramConfigured.webhook.pending_update_count}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={handleRegisterTelegramWebhook}
                      disabled={telegramConfigLoading}
                      className="gap-2"
                      variant="outline"
                    >
                      {telegramConfigLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Registrar webhook
                    </Button>
                    <Button
                      onClick={fetchTelegramConfig}
                      disabled={telegramConfigLoading}
                      variant="ghost"
                      className="gap-2"
                    >
                      <RefreshCw className={cn('h-4 w-4', telegramConfigLoading && 'animate-spin')} />
                      Actualizar estado
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      El webhook se registra solo al guardar el bot en el Paso 1. Usa «Registrar webhook» únicamente si necesitas
                      volver a registrarlo manualmente.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ─── Multimedia: transcripción de voz / visión ─── */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">🎤 Voz e imágenes (multimedia)</CardTitle>
              <CardDescription>
                El bot ya <strong>ve imágenes</strong> y <strong>lee documentos</strong> (PDF/Excel) sin configurar nada.
                Para que también <strong>escuche las notas de voz</strong> (las transcribe a texto) pega tu API key de
                Groq (tiene plan <strong>gratis</strong>) o de OpenAI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn('rounded-lg border p-3 text-sm flex items-center gap-2',
                mediaKeysStatus?.audioEnabled ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
                {mediaKeysStatus?.audioEnabled ? '✅ Transcripción de voz ACTIVA' : '⏳ Transcripción de voz inactiva — pega una key abajo para activarla'}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm font-medium">Groq API key <span className="text-xs text-muted-foreground">(recomendado · gratis)</span></label>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline">
                    Obtener key gratis <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Input
                  type="password"
                  placeholder={mediaKeysStatus?.groqSet ? `Guardada: ${mediaKeysStatus.groqMasked} — escribe una nueva para reemplazar` : 'gsk_...'}
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm font-medium">OpenAI API key <span className="text-xs text-muted-foreground">(alternativa)</span></label>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline">
                    Obtener key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Input
                  type="password"
                  placeholder={mediaKeysStatus?.openaiSet ? `Guardada: ${mediaKeysStatus.openaiMasked} — escribe una nueva para reemplazar` : 'sk-...'}
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                  className="mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Con cualquiera de las dos basta. Las imágenes funcionan con la IA del sistema (MiniMax), no necesitan esta key.
              </p>
              <Button onClick={handleSaveMediaKeys} disabled={mediaKeysSaving || (!groqKeyInput.trim() && !openaiKeyInput.trim())} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {mediaKeysSaving ? 'Guardando…' : 'Guardar key'}
              </Button>
            </CardContent>
          </Card>

          {/* Instagram & Facebook (canales Meta) */}
          <MetaChannelCard workspaceId={workspaceId} />

          {/* Facturación CFDI (ERP / PAC) */}
          <CfdiConfigCard workspaceId={workspaceId} />

          {/* Pagos (cierre automático — Stripe) */}
          <PaymentsConfigCard workspaceId={workspaceId} />
        </TabsContent>

        {/* ─── Agents Tab (Simplified) ─── */}
        <TabsContent value="agents">
          <div className="w-full space-y-4">
            {/* Personality Selection as Cards */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Personalidad del Agente
                </CardTitle>
                <CardDescription>Elige cómo se comunica tu agente IA con los clientes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {personalities.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePersonalityChange(p.id)}
                      className={cn(
                        'p-4 rounded-xl border-2 text-left transition-all',
                        activePersonality === p.id
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                          : 'border-border/60 hover:border-border hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center text-slate-600 shrink-0">{p.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{p.label}</p>
                            {activePersonality === p.id && (
                              <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 border-0">Activa</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <Separator />

                {/* Temperature Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Creatividad del Agente</Label>
                    <span className="text-xs text-muted-foreground font-mono">{temperature.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[temperature]}
                    onValueChange={([v]) => setTemperature(v)}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Conservador</span>
                    <span>Equilibrado</span>
                    <span>Creativo</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={handleSaveAgents} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Configuración
                  </Button>
                  {agentsSaved && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                      Guardado
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* System Prompt Editor (movido desde el Panel de Desarrollador) */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  System Prompt
                </CardTitle>
                <CardDescription>
                  Edita las instrucciones base que guían al agente IA. Elige la personalidad y ajusta su prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Editor de System Prompt</Label>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span>{promptCharCount} caracteres</span>
                    <span>·</span>
                    <span>~{promptTokenEstimate} tokens</span>
                  </div>
                </div>
                <Select value={selectedPrompt} onValueChange={handlePromptChange}>
                  <SelectTrigger className="max-w-xs text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(PERSONALITY_PROMPTS).map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                    <SelectItem value="Custom">Custom (crear nuevo)</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.target.value)}
                  rows={18}
                  className="font-mono text-xs leading-relaxed resize-none max-h-[480px]"
                  placeholder="Escribe tu system prompt aquí..."
                />
                <div className="flex items-center gap-2">
                  <Button onClick={savePrompt} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Prompt
                  </Button>
                  <Button onClick={resetPrompt} variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset por defecto
                  </Button>
                  {promptSaved && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                      Guardado
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="border-border/60 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Configuración avanzada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Para ajustar API keys, modelos de IA, webhooks y más, visita el{' '}
                      <span className="font-medium text-emerald-600">Panel de Desarrollador</span>{' '}
                      en la pestaña Avanzado.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Billing Tab (Improved) ─── */}
        <TabsContent value="billing">
          <div className="w-full space-y-4">
            {/* Current Plan — Dynamic */}
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-lg font-bold">{subscriptionData?.name || PLANS[currentPlan]?.name || 'Plan Gratuito'}</h4>
                      <Badge className="bg-emerald-600 text-white border-0">Actual</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {subscriptionData?.amount > 0 ? `$${subscriptionData.amount.toLocaleString()} MXN/mes` : (PLANS[currentPlan]?.price ? `$${PLANS[currentPlan].price.toLocaleString()} MXN/mes` : '$0 MXN/mes')}
                    </p>
                    {(PLANS[currentPlan]?.implementationCost ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        + Implementación: {PLANS[currentPlan]?.implementationLabel ?? `$${(PLANS[currentPlan]?.implementationCost ?? 0).toLocaleString()} MXN`} (pago único)
                      </p>
                    )}
                    {subscriptionData?.currentPeriodEnd && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Próxima facturación: {new Date(subscriptionData.currentPeriodEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-100 gap-2"
                    onClick={handleManageSubscription}
                    disabled={billingRedirecting}>
                    {billingRedirecting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirigiendo...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        Gestionar Suscripción
                      </>
                    )}
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(PLANS[currentPlan]?.features || []).slice(0, 4).map((f: string) => {
                    const parts = f.split(':')
                    return (
                      <div key={f} className="p-2 rounded-lg bg-white/60 text-center">
                        <p className="text-[10px] text-muted-foreground">{parts[0]}</p>
                        <p className="text-sm font-bold flex justify-center">{parts[1] || <Check className="h-4 w-4 text-green-500" />}</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Usage Stats */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Uso del Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(usageStats).map(([key, stat]) => {
                  const isUnlimited = !isFinite(stat.limit)
                  const percentage = isUnlimited ? 0 : Math.min(Math.round((stat.used / stat.limit) * 100), 100)
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{stat.label}</span>
                        <span className="font-medium">
                          {stat.used} / {isUnlimited ? '∞' : stat.limit.toLocaleString()}
                        </span>
                      </div>
                      <Progress
                        value={isUnlimited ? 0 : percentage}
                        className={cn('h-2', percentage > 90 ? '[&>div]:bg-red-500' : percentage > 75 ? '[&>div]:bg-orange-500' : '')}
                      />
                      {!isUnlimited && percentage >= 80 && (
                        <p className="text-xs text-orange-600">
                          {percentage >= 100 ? 'Límite alcanzado — actualiza tu plan' : `${100 - percentage}% disponible`}
                        </p>
                      )}
                      {key === 'aiMessages' && !isUnlimited && msgResetsAt && (
                        <p className="text-xs text-muted-foreground">
                          🔄 Se reinicia el {new Date(msgResetsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                        </p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Plan Comparison */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Otros Planes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(PLANS)
                    .filter(([key]) => key !== 'trial')
                    .map(([key, plan]) => (
                      <div key={key} className="p-4 rounded-lg border border-border/60 hover:border-emerald-200 transition-colors">
                        <h4 className="text-sm font-semibold">{plan.name}</h4>
                        <p className="text-lg font-bold mt-1">
                          {plan.price === 0 ? 'Gratis' : `$${plan.price.toLocaleString()} MXN`}
                          {plan.price > 0 && <span className="text-xs font-normal text-muted-foreground">/mes</span>}
                        </p>
                        {(plan.implementationCost ?? 0) > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Implementación: {plan.implementationLabel ?? `$${(plan.implementationCost ?? 0).toLocaleString()} MXN`}
                          </p>
                        )}
                        <ul className="mt-3 space-y-1.5">
                          {plan.features.slice(0, 3).map((f) => (
                            <li key={f} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-3 text-xs"
                          onClick={() => handleUpgradePlan(key)}
                          disabled={billingRedirecting}
                        >
                          {billingRedirecting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : plan.price === 0 ? 'Downgrade' : 'Upgrade'}
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Invoices Placeholder */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Facturas</CardTitle>
                <CardDescription>Historial de facturas y comprobantes de pago</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <CreditCard className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay facturas disponibles</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Las facturas aparecerán aquí después de tu primer pago</p>
                </div>
              </CardContent>
            </Card>

            {/* ── Equipo (fusionado con Facturación) ── */}
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Miembros del Equipo</CardTitle>
                    <CardDescription>Gestiona quién tiene acceso a este espacio de trabajo</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Team Members from API */}
                <div className="space-y-3">
                  {!teamLoading && teamMembers.length === 0 && user && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                            {(user.name || 'U').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{user.name || 'Usuario'}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 border-0">Propietario</Badge>
                    </div>
                  )}
                  {teamLoading && (
                    <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                            {(member.user.name || member.user.email).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{member.user.name || 'Usuario'}</p>
                          <p className="text-xs text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                      <Badge className={cn(
                        'h-5 text-[10px] border-0',
                        member.role === 'owner' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                      )}>
                        {member.role === 'owner' ? 'Propietario' : member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ─── Modules Tab ─── */}
        <TabsContent value="modules" className="space-y-4">
          <ModulesView workspaceId={workspaceId} />
        </TabsContent>

        {/* ─── Advanced Tab ─── */}
        <TabsContent value="advanced" className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Herramientas Avanzadas</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Herramientas de desarrollo, pruebas y automatización. Solo para usuarios técnicos.
            </p>
          </div>

          <Tabs defaultValue="chat" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat IA
              </TabsTrigger>
              <TabsTrigger value="automations" className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                Automatizaciones
              </TabsTrigger>
              <TabsTrigger value="dev" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Desarrollo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="mt-4">
              <ChatDemo workspaceId={workspaceId} />
            </TabsContent>

            <TabsContent value="automations" className="mt-4">
              <AutomationsView workspaceId={workspaceId} />
            </TabsContent>

            <TabsContent value="dev" className="mt-4">
              <DeveloperView workspaceId={workspaceId} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  )
}
