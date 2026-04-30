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
  Users,
  Plus,
  Mail,
  Shield,
  Terminal,
  MessageSquare,
  Workflow,
  Code,
  FileText,
  Download,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLANS, PERSONALITY_PROMPTS } from '@/lib/constants'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
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
import { AutomationsView } from './automations-view'
import { DeveloperView } from './developer-view'

interface SettingsViewProps {
  workspaceId: string
}

export function SettingsView({ workspaceId }: SettingsViewProps) {
  const { user } = useAuth()
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [whatsappConnecting, setWhatsappConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null)
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const pollInterval = useRef<NodeJS.Timeout | null>(null)
  const [activePersonality, setActivePersonality] = useState(() => localStorage.getItem('vf_personality') || 'JHON')
  const [temperature, setTemperature] = useState(() => {
    const val = localStorage.getItem('vf_temperature')
    return val ? parseFloat(val) : 0.7
  })
  const [agentsSaved, setAgentsSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── General Tab State ──
  const [workspaceName, setWorkspaceName] = useState(() => user?.workspaceName || localStorage.getItem('vf_workspaceName') || 'Mi Negocio')
  const [industry, setIndustry] = useState(() => localStorage.getItem('vf_industry') || 'services')
  const [language, setLanguage] = useState(() => user?.locale || localStorage.getItem('vf_language') || 'es')
  const [generalSaved, setGeneralSaved] = useState(false)

  // ── Billing Tab State ──
  const [usageStats, setUsageStats] = useState({
    contacts: { used: 0, limit: 5000 },
    agents: { used: 0, limit: 10 },
    conversations: { used: 0, limit: 5000 },
    automations: { used: 0, limit: 50 },
    members: { used: 0, limit: 10 },
  })
  const [billingLoaded, setBillingLoaded] = useState(false)
  const [currentPlan, setCurrentPlan] = useState('free')
  const [billingRedirecting, setBillingRedirecting] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; user: { name: string | null; email: string; image?: string | null }; role: string }>>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // ── Invoices State ──
  const [invoices, setInvoices] = useState<Array<{
    id: string
    invoiceNumber: string
    amount: number
    tax: number
    total: number
    currency: string
    status: string
    description: string
    dueDate: string
    paidAt: string | null
    createdAt: string
    pdfUrl: string | null
  }>>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  // ── Industries ──
  const industries = [
    { value: 'services', label: 'Servicios', emoji: '💼', desc: 'Consultorías y servicios profesionales' },
    { value: 'technology', label: 'Tecnología', emoji: '💻', desc: 'Software, SaaS y desarrollo' },
    { value: 'retail', label: 'Retail', emoji: '🛍️', desc: 'Tiendas, ecommerce y ventas' },
    { value: 'realestate', label: 'Bienes Raíces', emoji: '🏠', desc: 'Inmobiliarias y corretaje' },
    { value: 'health', label: 'Salud', emoji: '🏥', desc: 'Clínicas, hospitales y wellness' },
    { value: 'education', label: 'Educación', emoji: '📚', desc: 'Escuelas, academias y formación' },
    { value: 'food', label: 'Alimentos', emoji: '🍽️', desc: 'Restaurantes, cafeterías y foodtech' },
    { value: 'finance', label: 'Finanzas', emoji: '🏦', desc: 'Bancos, fintech y asesoría financiera' },
  ]

  // ── Personalities ──
  const personalities = [
    { id: 'JHON', label: 'JHON', emoji: '💼', desc: 'Asesor comercial inteligente, cercano y persuasivo' },
    { id: 'Professional', label: 'Profesional', emoji: '💼', desc: 'Formal y corporativo, ideal para B2B' },
    { id: 'Friendly', label: 'Amigable', emoji: '😊', desc: 'Cercano y casual, perfecto para retail' },
    { id: 'Aggressive', label: 'Agresivo', emoji: '🔥', desc: 'Cerrador de ventas, urgente y directo' },
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
          industry,
          timezone: 'America/Mexico_City',
          locale: language,
        })
      })
      if (res.ok) {
        localStorage.setItem('vf_workspaceName', workspaceName)
        localStorage.setItem('vf_industry', industry)
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

  // ── Agents Save Handler ──
  const handleSaveAgents = () => {
    localStorage.setItem('vf_personality', activePersonality)
    localStorage.setItem('vf_temperature', temperature.toString())
    setAgentsSaved(true)
    setTimeout(() => setAgentsSaved(false), 2000)
  }

  // ── Personality change ──
  const handlePersonalityChange = (id: string) => {
    setActivePersonality(id)
  }

  // ── Fetch Billing Data ──
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/billing/subscription?workspaceId=${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.usage) {
          setUsageStats(prev => ({
            contacts: { used: data.usage.contacts ?? prev.contacts.used, limit: data.usage.contactsLimit ?? prev.contacts.limit },
            agents: { used: data.usage.agents ?? prev.agents.used, limit: data.usage.agentsLimit ?? prev.agents.limit },
            conversations: { used: data.usage.conversations ?? prev.conversations.used, limit: data.usage.conversationsLimit ?? prev.conversations.limit },
            automations: { used: data.usage.automations ?? prev.automations.used, limit: data.usage.automationsLimit ?? prev.automations.limit },
            members: { used: data.usage.members ?? prev.members.used, limit: data.usage.membersLimit ?? prev.members.limit },
          }))
        }
        if (data?.subscription) {
          setCurrentPlan(data.subscription.plan)
          setSubscriptionData(data.subscription)
        }
        if (data?.planDetails) {
          setSubscriptionData(prev => prev ? { ...prev, ...data.planDetails } : data.planDetails)
        }
        setBillingLoaded(true)
      })
      .catch(() => setBillingLoaded(true))
  }, [workspaceId])

  // ── Fetch Invoices ──
  useEffect(() => {
    if (!workspaceId) return
    setInvoicesLoading(true)
    fetch(`/api/billing/invoices?workspaceId=${workspaceId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && data.invoices) {
          setInvoices(data.invoices)
        }
      })
      .catch(() => {})
      .finally(() => setInvoicesLoading(false))
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
        }
      })
      .catch(() => { /* keep localStorage values */ })
  }, [workspaceId])

  // ── Logo Upload Handler ──
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      localStorage.setItem('vf_workspace_logo', result)
      setLogoUrl(result)
      toast.success('Logo actualizado')
    }
    reader.readAsDataURL(file)
  }

  // ── Stripe Checkout Handler (with demo fallback) ──
  const handleUpgradePlan = async (planKey: string) => {
    setBillingRedirecting(true)
    try {
      // Try Stripe first
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
        return
      }

      // Stripe not configured — fallback to direct activation (demo/manual billing)
      console.log('[Billing] Stripe unavailable, using direct activation')
      const activateRes = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          plan: planKey,
          interval: 'monthly',
        }),
      })
      const activateData = await activateRes.json()
      if (activateData.success) {
        // Auto-generate invoice
        const planConfig = PLANS[planKey]
        await fetch('/api/billing/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            subscriptionId: activateData.subscription?.id,
            plan: planKey,
            amount: planConfig?.price || 0,
            currency: planConfig?.currency || 'MXN',
            billingEmail: user?.email,
            billingName: user?.name || workspaceName,
          }),
        })

        // Refresh billing data
        const subRes = await fetch(`/api/billing/subscription?workspaceId=${workspaceId}`)
        if (subRes.ok) {
          const subData = await subRes.json()
          if (subData?.subscription) {
            setCurrentPlan(subData.subscription.plan)
            setSubscriptionData(subData.subscription)
          }
        }
        const invRes = await fetch(`/api/billing/invoices?workspaceId=${workspaceId}`)
        if (invRes.ok) {
          const invData = await invRes.json()
          if (invData?.invoices) setInvoices(invData.invoices)
        }

        toast.success(`Plan ${planConfig?.name || planKey} activado correctamente`)
      } else {
        toast.error(activateData.error || 'Error al activar plan')
      }
    } catch {
      toast.error('Error al conectar con el servicio de pagos')
    } finally {
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
      setWhatsappConnecting(data.connecting)
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

  // Initial status check
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Connect WhatsApp
  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' })
      if (!res.ok) throw new Error('Error al conectar')
      const data = await res.json()
      if (data.status?.qrCode) setQrCode(data.status.qrCode)
      if (data.status?.connecting) setWhatsappConnecting(true)
      if (data.status?.connected) setWhatsappConnected(true)
    } catch (err) {
      console.error('Error connecting WhatsApp:', err)
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

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Configuración</h3>
        <p className="text-sm text-muted-foreground">
          Administra tu espacio de trabajo y preferencias
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="general" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Building2 className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Bot className="h-3.5 w-3.5" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <CreditCard className="h-3.5 w-3.5" />
            Facturación
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Users className="h-3.5 w-3.5" />
            Equipo
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5 text-xs flex-1 min-w-[100px]">
            <Terminal className="h-3.5 w-3.5" />
            Avanzado
          </TabsTrigger>
        </TabsList>

        {/* ─── General Tab (Simplified) ─── */}
        <TabsContent value="general">
          <Card className="border-border/60 max-w-2xl">
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
                        <span className="text-2xl">{ind.emoji}</span>
                        <div>
                          <p className="text-sm font-semibold">{ind.label}</p>
                          <p className="text-[10px] text-muted-foreground">{ind.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
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
                    <span className="text-lg">🇲🇽</span>
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
                    <span className="text-lg">🇺🇸</span>
                    <div>
                      <p className="text-sm font-medium">English</p>
                    </div>
                  </button>
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
        </TabsContent>

        {/* ─── WhatsApp Tab (kept as-is) ─── */}
        <TabsContent value="whatsapp">
          <div className="max-w-2xl space-y-4">
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
                            ? 'Abre WhatsApp > Dispositivos vinculados > Vincular'
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
                            onClick={fetchStatus}
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
                            onClick={handleConnect}
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
          </div>
        </TabsContent>

        {/* ─── Agents Tab (Simplified) ─── */}
        <TabsContent value="agents">
          <div className="max-w-2xl space-y-4">
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
                        <div className="text-3xl">{p.emoji}</div>
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

            {/* Info Card */}
            <Card className="border-border/60 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Configuración avanzada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Para ajustar API keys, modelos de IA, system prompts personalizados y más, visita el{' '}
                      <span className="font-medium text-emerald-600">Panel de Desarrollador</span>{' '}
                      en el menú lateral.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Billing Tab (Improved) ─── */}
        <TabsContent value="billing">
          <div className="max-w-3xl space-y-4">
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
                        <p className="text-sm font-bold">{parts[1] || '✓'}</p>
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
                  const percentage = Math.round((stat.used / stat.limit) * 100)
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted-foreground">
                          {key === 'contacts' ? 'Contactos' :
                            key === 'agents' ? 'Agentes' :
                              key === 'conversations' ? 'Conversaciones' :
                                key === 'automations' ? 'Automatizaciones' :
                                  key === 'members' ? 'Miembros' : key}
                        </span>
                        <span className="font-medium">{stat.used} / {stat.limit.toLocaleString()}</span>
                      </div>
                      <Progress value={percentage} className={cn('h-2', percentage > 80 ? '[&>div]:bg-orange-500' : '')} />
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(PLANS)
                    .filter(([key]) => key !== 'pro')
                    .map(([key, plan]) => (
                      <div key={key} className="p-4 rounded-lg border border-border/60 hover:border-emerald-200 transition-colors">
                        <h4 className="text-sm font-semibold">{plan.name}</h4>
                        <p className="text-lg font-bold mt-1">
                          {plan.price === 0 ? 'Gratis' : `$${plan.price.toLocaleString()} MXN`}
                          {plan.price > 0 && <span className="text-xs font-normal text-muted-foreground">/mes</span>}
                        </p>
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

            {/* ─── Invoices ─── */}
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Facturas
                    </CardTitle>
                    <CardDescription>Historial de facturas y comprobantes de pago</CardDescription>
                  </div>
                  <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0">
                    {invoices.length} {invoices.length === 1 ? 'factura' : 'facturas'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No hay facturas disponibles</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {currentPlan === 'free'
                        ? 'Las facturas se generarán al activar un plan de pago'
                        : 'Las facturas aparecerán aquí cuando se procese tu primer pago'}
                    </p>
                    {currentPlan === 'free' && (
                      <Button
                        size="sm"
                        className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        onClick={() => handleUpgradePlan('starter')}
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Ver Planes
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center',
                            inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600' :
                            inv.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                            inv.status === 'failed' ? 'bg-red-100 text-red-600' :
                            'bg-slate-100 text-slate-500'
                          )}>
                            {inv.status === 'paid' ? <CheckCircle2 className="h-4 w-4" /> :
                             inv.status === 'pending' ? <Clock className="h-4 w-4" /> :
                             inv.status === 'failed' ? <XCircle className="h-4 w-4" /> :
                             <AlertCircle className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{inv.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {inv.invoiceNumber} &middot; {new Date(inv.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {inv.paidAt && ` &middot; Pagada ${new Date(inv.paidAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold">${inv.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {inv.currency}</p>
                            <Badge className={cn(
                              'text-[9px] border-0',
                              inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              inv.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              inv.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-600'
                            )}>
                              {inv.status === 'paid' ? 'Pagada' :
                               inv.status === 'pending' ? 'Pendiente' :
                               inv.status === 'failed' ? 'Fallida' :
                               inv.status === 'refunded' ? 'Reembolsada' : inv.status}
                            </Badge>
                          </div>
                          {inv.pdfUrl && (
                            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted">
                              <Download className="h-4 w-4 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                    {invoices.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 text-center pt-2">
                        IVA incluido. Para facturas con CFDI, contacta a soporte.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Team Tab ─── */}
        <TabsContent value="team">
          <div className="max-w-2xl space-y-4">
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
