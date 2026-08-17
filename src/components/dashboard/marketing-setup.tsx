'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Facebook,
  Instagram,
  Globe,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  BookOpen,
  AlertTriangle,
  Info,
  Copy,
  Check,
  Music2,
  ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─── Types ─────────────────────────────────────────────────────

interface PlatformConnected {
  meta: boolean
  instagram: boolean
  tiktok: boolean
  google: boolean
}

interface PlatformConfig {
  meta: Record<string, string>
  instagram: Record<string, string>
  tiktok: Record<string, string>
  google: Record<string, string>
}

interface TutorialStep {
  title: string
  description: string
  url?: string
  urlLabel?: string
  code?: string
  warning?: string
  tip?: string
}

// ─── Platform definitions ──────────────────────────────────────

const PLATFORMS = [
  {
    id: 'meta' as const,
    name: 'Facebook (Página)',
    shortName: 'Meta',
    icon: Facebook,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    activeBg: 'bg-blue-600 hover:bg-blue-700',
    description: 'Publica en tu Página de Facebook. Basta Access Token + Facebook Page ID (los campos de Ads son opcionales).',
    fields: [
      { key: 'accessToken', label: 'Access Token (System User)', type: 'password', placeholder: 'EAAx...', hint: 'Token de usuario del sistema con permisos ads_management' },
      { key: 'businessId', label: 'Business ID', type: 'text', placeholder: '123456789012345', hint: 'ID numérico de tu Meta Business Suite' },
      { key: 'adAccountId', label: 'Ad Account ID', type: 'text', placeholder: 'act_123456789', hint: 'Comienza con "act_". Encuéntralo en Ads Manager' },
      { key: 'pixelId', label: 'Meta Pixel ID', type: 'text', placeholder: '123456789012345', hint: 'ID del Pixel de Meta para rastreo de conversiones' },
      { key: 'pageId', label: 'Facebook Page ID', type: 'text', placeholder: '123456789012345', hint: 'ID numérico de tu Página de Facebook' },
    ],
    tutorial: [
      {
        title: '1. Accede a Meta Business Suite',
        description: 'Ve a business.facebook.com e inicia sesión con tu cuenta de Facebook empresarial. Si no tienes una cuenta de Business, crea una haciendo clic en "Crear cuenta".',
        url: 'https://business.facebook.com',
        urlLabel: 'Abrir Meta Business Suite',
      },
      {
        title: '2. Crea un Usuario del Sistema',
        description: 'En Business Suite ve a Configuración → Usuarios del Sistema → Agregar. Crea un "Administrador del sistema". Esto te dará un token permanente que no caduca como los de usuario personal.',
        tip: 'Los tokens de usuario del sistema no caducan. Usa siempre este tipo de token para integraciones.',
      },
      {
        title: '3. Genera el Access Token',
        description: 'En la página del Usuario del Sistema, haz clic en "Generar nuevo token". Selecciona tu app y los permisos: ads_management, ads_read, business_management, pages_manage_ads, pages_read_engagement, leads_retrieval.',
        warning: 'Guarda el token inmediatamente. Meta sólo lo muestra una vez.',
      },
      {
        title: '4. Obtén el Business ID',
        description: 'En Meta Business Suite → Configuración → Información del negocio. El ID numérico aparece debajo del nombre de tu negocio.',
        url: 'https://business.facebook.com/settings',
        urlLabel: 'Ir a Configuración',
      },
      {
        title: '5. Obtén el Ad Account ID',
        description: 'En Ads Manager, el Ad Account ID aparece en la parte superior izquierda junto a tu nombre. Tiene el formato "act_XXXXXXX". Cópialo sin el prefijo "act_" o incluyéndolo.',
        url: 'https://adsmanager.facebook.com',
        urlLabel: 'Abrir Ads Manager',
      },
      {
        title: '6. Obtén el Pixel ID',
        description: 'En Meta Business Suite → Administrador de Eventos → Píxeles. Si no tienes un Pixel creado, crea uno ahora. El ID numérico es el que necesitas.',
        url: 'https://business.facebook.com/events_manager',
        urlLabel: 'Administrador de Eventos',
      },
      {
        title: '7. Obtén el Page ID',
        description: 'Ve a tu Página de Facebook → Configuración → Información de la página. El Page ID numérico está en la sección "Información de la página".',
        tip: 'También puedes encontrarlo en la URL de tu página: facebook.com/PAGENAME → Acerca de → Page ID.',
      },
    ] as TutorialStep[],
  },
  {
    id: 'instagram' as const,
    name: 'Instagram Business API',
    shortName: 'Instagram',
    icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    activeBg: 'bg-pink-600 hover:bg-pink-700',
    description: 'Publica contenido, gestiona Stories y accede a métricas de tu cuenta Instagram Business.',
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'IGQVJx...', hint: 'Token de acceso de larga duración para Instagram Graph API' },
      { key: 'businessAccountId', label: 'Instagram Business Account ID', type: 'text', placeholder: '17841400455970793', hint: 'ID de tu cuenta de Instagram Business (diferente al @username)' },
    ],
    tutorial: [
      {
        title: '1. Convierte tu cuenta a Business o Creator',
        description: 'En la app de Instagram → Configuración → Tipo de cuenta → Cambiar a cuenta profesional. Elige "Empresa" para acceso completo a la API.',
        warning: 'Las cuentas personales NO tienen acceso a Instagram Graph API.',
      },
      {
        title: '2. Conecta tu Instagram a una Página de Facebook',
        description: 'Instagram Business API requiere que tu cuenta esté vinculada a una Página de Facebook. Ve a Configuración de Instagram → Cuenta → Páginas vinculadas → Conectar página.',
      },
      {
        title: '3. Crea una aplicación en Meta Developers',
        description: 'Ve a developers.facebook.com → Crear app → Tipo: "Empresa". Agrega el producto "Instagram Graph API". Esto te dará el App ID y App Secret necesarios.',
        url: 'https://developers.facebook.com/apps',
        urlLabel: 'Meta Developers',
      },
      {
        title: '4. Genera un token de larga duración',
        description: 'En Meta Developers → Graph API Explorer, selecciona tu app y genera un User Access Token con permisos: instagram_basic, instagram_content_publish, pages_read_engagement, pages_show_list. Luego intercámbialo por un token de larga duración usando el endpoint /oauth/access_token.',
        tip: 'Los tokens de corta duración duran solo 1-2 horas. Usa SIEMPRE tokens de larga duración (60 días) o mejor aún, tokens de usuario del sistema que no caducan.',
      },
      {
        title: '5. Obtén el Business Account ID',
        description: 'Con tu token, haz una petición a: GET https://graph.facebook.com/v19.0/me/accounts para obtener tu Page ID. Luego: GET https://graph.facebook.com/v19.0/{PAGE_ID}?fields=instagram_business_account para obtener el Instagram Business Account ID.',
        code: 'curl "https://graph.facebook.com/v19.0/me/accounts?access_token=TU_TOKEN"',
        tip: 'Puedes hacer estas peticiones desde el Graph API Explorer de Meta Developers.',
      },
    ] as TutorialStep[],
  },
  {
    id: 'tiktok' as const,
    name: 'TikTok (publicar videos)',
    shortName: 'TikTok',
    icon: Music2,
    color: 'text-foreground',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    activeBg: 'bg-zinc-800 hover:bg-zinc-700',
    description: 'Publica videos de tus autos en TikTok. Pega tu Client Key y Secret y pulsa "Conectar con TikTok".',
    fields: [
      { key: 'clientKey', label: 'Client Key', type: 'password', placeholder: 'awxxxxxxxxxxxx', hint: 'De tu app en developers.tiktok.com (Login Kit + Content Posting API). Registra el redirect: https://valiautoflow.com/api/tiktok/callback' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '••••••••', hint: 'Secret de la misma app de developers.tiktok.com' },
    ],
    tutorial: [
      {
        title: '1. Crea una cuenta en TikTok for Business',
        description: 'Ve a ads.tiktok.com y regístrate con tu correo empresarial. Completa la configuración de tu cuenta publicitaria.',
        url: 'https://ads.tiktok.com',
        urlLabel: 'TikTok Ads Manager',
      },
      {
        title: '2. Accede a TikTok for Developers',
        description: 'Ve a developers.tiktok.com y crea una cuenta de desarrollador vinculada a tu cuenta Business. Crea una nueva aplicación y selecciona el tipo "Business".',
        url: 'https://developers.tiktok.com',
        urlLabel: 'TikTok Developers',
      },
      {
        title: '3. Solicita acceso a Marketing API',
        description: 'Dentro de tu app en TikTok Developers, solicita acceso a la "Marketing API" (TikTok Ads API). Agrega los permisos: Advertising (Lectura/Escritura) y Campaign Management.',
        warning: 'La aprobación puede tardar 2-5 días hábiles.',
      },
      {
        title: '4. Genera tu Access Token',
        description: 'Una vez aprobado, ve a tu app → Claves de API → Generar Access Token. También puedes implementar el flujo OAuth para obtener tokens de larga duración.',
        tip: 'Los tokens de TikTok Ads API duran 24 horas por defecto. Para producción, implementa el refresh token automático.',
      },
      {
        title: '5. Obtén el Advertiser ID',
        description: 'En TikTok Ads Manager, el Advertiser ID está en la parte superior cuando entras al dashboard, o en Configuración → Información de la cuenta.',
        url: 'https://ads.tiktok.com/i18n/home',
        urlLabel: 'TikTok Ads Manager',
      },
    ] as TutorialStep[],
  },
  {
    id: 'google' as const,
    name: 'Google Ads API',
    shortName: 'Google Ads',
    icon: ShoppingCart,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    activeBg: 'bg-red-600 hover:bg-red-700',
    description: 'Gestiona campañas de Google Ads, Smart Shopping y Performance Max.',
    fields: [
      { key: 'customerId', label: 'Customer ID', type: 'text', placeholder: '123-456-7890', hint: 'ID de tu cuenta de Google Ads (formato: XXX-XXX-XXXX)' },
      { key: 'developerToken', label: 'Developer Token', type: 'password', placeholder: 'ABcDeFgHiJkLmNoPqRsTuV', hint: 'Token de desarrollador para acceder a Google Ads API' },
      { key: 'loginCustomerId', label: 'Login Customer ID (MCC)', type: 'text', placeholder: '123-456-7890', hint: 'ID de la cuenta MCC administradora (si aplica)' },
    ],
    tutorial: [
      {
        title: '1. Verifica acceso a Google Ads API',
        description: 'Para usar Google Ads API necesitas una cuenta de Google Ads activa con inversión mínima reciente. Ve a tu cuenta de Google Ads y verifica que esté activa.',
        url: 'https://ads.google.com',
        urlLabel: 'Google Ads',
      },
      {
        title: '2. Solicita un Developer Token',
        description: 'Ve a Google Ads → Herramientas → API Center. Haz clic en "Solicitar token de desarrollador". Para proyectos de producción, deberás pasar por un proceso de revisión.',
        url: 'https://ads.google.com/aw/apicenter',
        urlLabel: 'API Center',
        warning: 'El token en modo Prueba solo puede acceder a cuentas de prueba. Para producción debes solicitar acceso Básico o Estándar.',
      },
      {
        title: '3. Configura OAuth 2.0',
        description: 'En Google Cloud Console, crea un proyecto y habilita la Google Ads API. Configura las credenciales OAuth 2.0 con tu redirect URI. Descarga el client_secret.json.',
        url: 'https://console.cloud.google.com',
        urlLabel: 'Google Cloud Console',
      },
      {
        title: '4. Genera el Refresh Token',
        description: 'Usa la librería oficial google-ads-api o el flujo OAuth para generar un refresh_token que te permita obtener access_tokens sin intervención manual.',
        code: 'npx google-ads-api generate-refresh-token',
        tip: 'El refresh_token no caduca (a menos que lo revoques). Guárdalo de forma segura.',
      },
      {
        title: '5. Obtén tu Customer ID',
        description: 'En Google Ads, el Customer ID está en la esquina superior derecha junto a tu nombre de cuenta, con formato XXX-XXX-XXXX. Si usas MCC (Manage Multiple Clients), usa el Customer ID de la cuenta hija que quieres gestionar.',
      },
    ] as TutorialStep[],
  },
]

// ─── Helper: TutorialStepCard ────────────────────────────────

function TutorialStepCard({ step }: { step: TutorialStep }) {
  const [copied, setCopied] = useState(false)

  const copyCode = () => {
    if (!step.code) return
    navigator.clipboard.writeText(step.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-border/60 rounded-lg p-4 space-y-2 bg-muted/20">
      <p className="text-sm font-semibold text-foreground">{step.title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
      {step.code && (
        <div className="relative">
          <pre className="text-xs bg-zinc-900 text-green-400 rounded-md p-3 overflow-x-auto font-mono">
            {step.code}
          </pre>
          <button
            onClick={copyCode}
            className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-zinc-300" />}
          </button>
        </div>
      )}
      {step.warning && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">{step.warning}</p>
        </div>
      )}
      {step.tip && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20">
          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">{step.tip}</p>
        </div>
      )}
      {step.url && (
        <a
          href={step.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {step.urlLabel || step.url}
        </a>
      )}
    </div>
  )
}

// ─── Helper: PlatformCard ────────────────────────────────────

function PlatformCard({
  platform,
  workspaceId,
  connected,
  pending,
  savedConfig,
  onSaved,
}: {
  platform: typeof PLATFORMS[number]
  workspaceId: string
  connected: boolean
  pending?: boolean
  savedConfig: Record<string, string>
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(!connected)
  const [showTutorial, setShowTutorial] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(platform.fields.map(f => [f.key, savedConfig[f.key] || '']))
  )
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Conexión por OAuth (cada tenant inicia sesión con SU cuenta; sin pegar nada).
  const oauth = platform.id === 'meta' || platform.id === 'instagram'
    ? { url: `/api/marketing/meta/connect?workspaceId=${workspaceId}`, label: 'Conectar con Facebook' }
    : platform.id === 'tiktok'
      ? { url: `/api/tiktok/connect?workspaceId=${workspaceId}`, label: 'Conectar con TikTok' }
      : null
  const startConnect = () => {
    if (!oauth) return
    const pop = window.open(oauth.url, '_blank', 'width=640,height=780')
    const iv = setInterval(() => { if (!pop || pop.closed) { clearInterval(iv); onSaved() } }, 1000)
  }

  const handleSave = async () => {
    const requiredFields = platform.fields.filter(f => f.type === 'text' || !form[f.key]?.startsWith('•'))
    const missing = requiredFields.filter(f => !form[f.key]?.trim())
    if (missing.length > 0) {
      toast.error(`Completa: ${missing.map(f => f.label).join(', ')}`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, platform: platform.id, data: form }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar')
      toast.success(`${platform.name} configurado correctamente`)
      onSaved()
      setExpanded(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm(`¿Desconectar ${platform.name}? Se borrarán las credenciales guardadas y tendrás que volver a conectar para publicar.`)) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/marketing/config?workspaceId=${workspaceId}&platform=${platform.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al desconectar')
      toast.success(`${platform.name} desconectado`)
      setForm(Object.fromEntries(platform.fields.map(f => [f.key, ''])))
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  const Icon = platform.icon

  return (
    <div className={cn(
      'rounded-xl border transition-all',
      connected
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-border bg-card'
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', platform.bg)}>
            <Icon className={cn('h-5 w-5', platform.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{platform.name}</span>
              {connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Conectado
                </Badge>
              ) : pending ? (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />Pendiente de aprobación
                </Badge>
              ) : (
                <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 text-[10px] px-1.5 py-0">
                  <XCircle className="h-2.5 w-2.5 mr-1" />No configurado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{platform.description}</p>
          </div>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="border-t border-border/50 pt-4" />

          {/* Conectar — cada tenant inicia sesión con SU cuenta (OAuth). Sin credenciales a la vista. */}
          {oauth ? (
            <div className="space-y-2">
              <Button onClick={startConnect} className={cn('w-full gap-2', platform.activeBg, 'text-white')}>
                <ExternalLink className="h-4 w-4" /> {connected ? `Reconectar ${platform.shortName}` : oauth.label}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                {connected
                  ? 'Cuenta conectada. Vuelve a conectar solo si cambiaste de cuenta.'
                  : 'Inicia sesión con tu cuenta y se configura solo — no necesitas pegar ninguna credencial.'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">La conexión automática de esta plataforma no está disponible por ahora. Usa la configuración manual si tienes credenciales.</p>
          )}

          {/* Nota de "pendiente": conexión iniciada pero aún no publicable. */}
          {pending && !connected && (
            <p className="text-[11px] text-amber-500 text-center">Conexión iniciada pero incompleta — termina de autorizar/configurar para poder publicar.</p>
          )}

          {/* Desconectar — solo si está conectada. Borra credenciales/tokens. */}
          {connected && (
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              variant="outline"
              size="sm"
              className="w-full gap-2 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {disconnecting ? 'Desconectando…' : `Desconectar ${platform.shortName}`}
            </Button>
          )}

          {/* Configuración manual (avanzado) — oculta por defecto; el usuario final NO ve tokens */}
          <div className="pt-1">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Configuración manual (avanzado)
            </button>
            {showAdvanced && (
              <div className="space-y-3 mt-3">
                {/* Tutorial de credenciales (solo en avanzado) */}
                <button
                  onClick={() => setShowTutorial(v => !v)}
                  className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {showTutorial ? 'Ocultar tutorial' : `¿Cómo obtener las credenciales de ${platform.shortName}?`}
                  {showTutorial ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {showTutorial && (
                  <div className="space-y-3 pl-2 border-l-2 border-violet-500/30">
                    {platform.tutorial.map((step, i) => <TutorialStepCard key={i} step={step} />)}
                  </div>
                )}
                {platform.fields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{field.label}</label>
                    <div className="relative">
                      <Input
                        type={field.type === 'password' && !reveal[field.key] ? 'password' : 'text'}
                        placeholder={field.placeholder}
                        value={form[field.key] || ''}
                        onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                        className="pr-9 font-mono text-sm"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        name={`vaf-${platform.id}-${field.key}`}
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => setReveal(r => ({ ...r, [field.key]: !r[field.key] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {reveal[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className={cn('gap-2', platform.activeBg, 'text-white')} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

interface MarketingSetupProps {
  workspaceId: string
  onComplete?: () => void
  compact?: boolean
}

// ─── Canales de mensajería (Telegram + WhatsApp) — contrato §Pantalla 6 ──
function MessagingChannels({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<{ telegram: { botConnected: boolean; channelChatId: string }; whatsapp: { connected: boolean } } | null>(null)
  const [chatId, setChatId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/marketing/messaging-channels?workspaceId=${workspaceId}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setState(d); setChatId(d.telegram?.channelChatId || '') } }).catch(() => {})
  }, [workspaceId])
  useEffect(() => { load() }, [load])

  const saveChannel = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/marketing/messaging-channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, channelChatId: chatId }) })
      if (!r.ok) throw new Error()
      toast.success('Canal de Telegram guardado'); load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const disconnectChannel = async () => {
    if (!confirm('¿Desconectar el canal de Telegram? Se dejará de publicar en él.')) return
    setSaving(true)
    try {
      const r = await fetch('/api/marketing/messaging-channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, channelChatId: '' }) })
      if (!r.ok) throw new Error()
      setChatId(''); toast.success('Canal de Telegram desconectado'); load()
    } catch { toast.error('No se pudo desconectar') } finally { setSaving(false) }
  }

  // Estado por canal: activa / pendiente / desconectada.
  const tgStatus = !state?.telegram.botConnected ? 'desconectada' : state.telegram.channelChatId ? 'activa' : 'pendiente'
  const waStatus = state?.whatsapp.connected ? 'activa' : 'desconectada'
  const StatusBadge = ({ s }: { s: string }) => (
    <Badge className={cn('text-xs border', s === 'activa' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : s === 'pendiente' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30')}>
      {s === 'activa' ? 'Activa' : s === 'pendiente' ? 'Pendiente' : 'Desconectada'}
    </Badge>
  )

  return (
    <>
      {/* Telegram */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-sky-500/15 flex items-center justify-center"><Music2 className="h-4 w-4 text-sky-400" /></div>
            <div>
              <p className="text-sm font-semibold">Telegram (canal de publicación y mensajes)</p>
              <p className="text-[11px] text-muted-foreground">Publica creativos al canal/grupo y envía a leads de Telegram.</p>
            </div>
          </div>
          <StatusBadge s={tgStatus} />
        </div>
        {!state?.telegram.botConnected ? (
          <p className="text-xs text-amber-400/90">Primero conecta el bot de Telegram en <b>Configuración → Conexiones</b>. Luego regresa aquí para elegir el canal.</p>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium">Canal o grupo de Telegram (chat_id o @usuario del canal)</label>
            <div className="flex gap-2">
              <Input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890  o  @micanal" className="h-9 text-sm flex-1" />
              <Button size="sm" onClick={saveChannel} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Agrega tu bot como administrador del canal/grupo. El chat_id de un canal empieza con -100.</p>
            {tgStatus === 'activa' && (
              <Button size="sm" variant="outline" onClick={disconnectChannel} disabled={saving} className="gap-1.5 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500">
                <XCircle className="h-4 w-4" /> Desconectar canal
              </Button>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
            <div>
              <p className="text-sm font-semibold">WhatsApp (mensajes directos a leads)</p>
              <p className="text-[11px] text-muted-foreground">Se conecta por QR o API oficial en Configuración → Conexiones.</p>
            </div>
          </div>
          <StatusBadge s={waStatus} />
        </div>
      </div>
    </>
  )
}

export function MarketingSetup({ workspaceId, onComplete, compact }: MarketingSetupProps) {
  const [connected, setConnected] = useState<PlatformConnected>({
    meta: false, instagram: false, tiktok: false, google: false,
  })
  const [pending, setPending] = useState<PlatformConnected>({
    meta: false, instagram: false, tiktok: false, google: false,
  })
  const [configs, setConfigs] = useState<PlatformConfig>({
    meta: {}, instagram: {}, tiktok: {}, google: {},
  })
  const [loading, setLoading] = useState(true)

  const loadConfig = useCallback(() => {
    setLoading(true)
    fetch(`/api/marketing/config?workspaceId=${workspaceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setConnected(data.connected || {})
          setPending(data.pending || { meta: false, instagram: false, tiktok: false, google: false })
          setConfigs(data.config || { meta: {}, instagram: {}, tiktok: {}, google: {} })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { loadConfig() }, [loadConfig])

  const anyConnected = Object.values(connected).some(Boolean)
  const connectedCount = Object.values(connected).filter(Boolean).length

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Setup Header Banner */}
      {!anyConnected && !compact && (
        <div className="mx-6 mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Ninguna API de marketing conectada</p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Conecta al menos una plataforma para publicar campañas, medir resultados y usar todas las funciones de Marketing IA.
            </p>
          </div>
          {onComplete && anyConnected && (
            <Button size="sm" onClick={onComplete} className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
              Continuar →
            </Button>
          )}
        </div>
      )}

      {/* Progress */}
      {!compact && (
        <div className="px-6 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Conectar plataformas de marketing</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {anyConnected
                ? `${connectedCount} de ${PLATFORMS.length} plataformas conectadas`
                : 'Configura las APIs para publicar y medir campañas de forma automática'
              }
            </p>
          </div>
          {anyConnected && onComplete && (
            <Button size="sm" onClick={onComplete} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Continuar al dashboard
            </Button>
          )}
        </div>
      )}

      {/* Platform cards */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 pb-6 space-y-3 pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {PLATFORMS.map(platform => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  workspaceId={workspaceId}
                  connected={connected[platform.id] || false}
                  pending={pending[platform.id] || false}
                  savedConfig={configs[platform.id] || {}}
                  onSaved={loadConfig}
                />
              ))}
              <MessagingChannels workspaceId={workspaceId} />
            </>
          )}

          {/* Info footer */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-start gap-3">
            <Globe className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">¿Para qué sirve cada integración?</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li><span className="text-blue-400 font-medium">Meta Business:</span> Crea y gestiona campañas de Facebook Ads, audiencias personalizadas y lookalike desde ValiAutoFlow.</li>
                <li><span className="text-pink-400 font-medium">Instagram:</span> Publica contenido generado por IA directamente en tu feed y Stories.</li>
                <li><span className="text-foreground font-medium">TikTok:</span> Lanza campañas de TikTok Ads y mide conversiones con el Pixel de TikTok.</li>
                <li><span className="text-red-400 font-medium">Google Ads:</span> Activa campañas de búsqueda, Shopping y Performance Max desde el CRM.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
