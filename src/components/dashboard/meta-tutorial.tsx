'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Copy,
  CheckCircle2,
  Globe,
  Shield,
  Smartphone,
  Key,
  Webhook,
  Zap,
  BookOpen,
  ArrowRight,
  Check,
  Info,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TutorialStep {
  id: number
  title: string
  subtitle: string
  icon: React.ReactNode
  color: string
  bgColor: string
  content: React.ReactNode
}

interface MetaTutorialProps {
  open: boolean
  onClose: () => void
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all font-mono',
        copied
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copiado' : (label ?? text)}
    </button>
  )
}

// ─── Callout ─────────────────────────────────────────────────────────────────

function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'success'
  children: React.ReactNode
}) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
  const icons = {
    info: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
  }
  return (
    <div className={cn('flex items-start gap-2 p-3 rounded-lg border text-sm', styles[type])}>
      {icons[type]}
      <div>{children}</div>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepItem({
  num,
  text,
  done,
}: {
  num: number
  text: string
  done?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5',
          done
            ? 'bg-emerald-500 text-white'
            : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : num}
      </div>
      <p className="text-sm text-zinc-700 leading-relaxed">{text}</p>
    </div>
  )
}

// ─── Browser Mockup ───────────────────────────────────────────────────────────

function BrowserMockup({
  url,
  children,
  highlight,
}: {
  url: string
  children: React.ReactNode
  highlight?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-md bg-white">
      {/* Browser chrome */}
      <div className="bg-zinc-100 px-3 py-2 flex items-center gap-2 border-b border-zinc-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-zinc-500 font-mono border border-zinc-200 mx-2">
          {url}
        </div>
        {highlight && (
          <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] shrink-0">
            {highlight}
          </Badge>
        )}
      </div>
      {/* Content */}
      <div className="p-4 bg-[#fafafa]">{children}</div>
    </div>
  )
}

// ─── Animated card ─────────────────────────────────────────────────────────────

function AnimatedCard({
  label,
  value,
  pulse,
}: {
  label: string
  value: string
  pulse?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-zinc-200 p-3 flex items-center justify-between',
        pulse && 'animate-pulse'
      )}
    >
      <div>
        <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-mono text-zinc-800 font-semibold">{value}</p>
      </div>
      <Copy className="h-4 w-4 text-zinc-300" />
    </div>
  )
}

// ─── SVG Illustrations ───────────────────────────────────────────────────────

function IlluBusinessSuite() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F0F2F5" />
      {/* Sidebar */}
      <rect x="0" y="0" width="60" height="160" fill="#1877F2" />
      <rect x="10" y="14" width="40" height="8" rx="4" fill="white" fillOpacity="0.3" />
      {[40, 62, 84, 106, 128].map((y, i) => (
        <rect key={i} x="10" y={y} width={i === 0 ? 40 : 32} height="6" rx="3" fill="white" fillOpacity={i === 0 ? 0.8 : 0.3} />
      ))}
      {/* Main content */}
      <rect x="72" y="12" width="236" height="20" rx="4" fill="white" />
      <rect x="80" y="18" width="80" height="8" rx="3" fill="#1877F2" fillOpacity="0.3" />
      {/* Cards */}
      <rect x="72" y="44" width="108" height="56" rx="6" fill="white" />
      <rect x="72" y="44" width="108" height="56" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      <rect x="82" y="54" width="48" height="6" rx="3" fill="#1877F2" fillOpacity="0.5" />
      <rect x="82" y="66" width="78" height="5" rx="2.5" fill="#E4E6EB" />
      <rect x="82" y="75" width="60" height="5" rx="2.5" fill="#E4E6EB" />
      <rect x="82" y="87" width="36" height="9" rx="4" fill="#1877F2" />
      <rect x="190" y="44" width="118" height="56" rx="6" fill="white" />
      <rect x="190" y="44" width="118" height="56" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      <rect x="200" y="54" width="56" height="6" rx="3" fill="#25D366" fillOpacity="0.6" />
      <rect x="200" y="66" width="88" height="5" rx="2.5" fill="#E4E6EB" />
      <rect x="200" y="75" width="70" height="5" rx="2.5" fill="#E4E6EB" />
      <rect x="200" y="87" width="36" height="9" rx="4" fill="#25D366" />
      {/* Bottom bar */}
      <rect x="72" y="110" width="236" height="36" rx="6" fill="white" />
      <rect x="72" y="110" width="236" height="36" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      <rect x="82" y="121" width="120" height="6" rx="3" fill="#E4E6EB" />
      <rect x="82" y="131" width="80" height="4" rx="2" fill="#E4E6EB" fillOpacity="0.6" />
    </svg>
  )
}

function IlluDeveloperApp() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F5F5F5" />
      {/* Top nav */}
      <rect width="320" height="32" rx="8" fill="#1877F2" />
      <rect x="0" y="24" width="320" height="8" fill="#1877F2" />
      <rect x="12" y="10" width="60" height="12" rx="3" fill="white" fillOpacity="0.4" />
      <rect x="90" y="10" width="40" height="12" rx="3" fill="white" fillOpacity="0.25" />
      <rect x="140" y="10" width="40" height="12" rx="3" fill="white" fillOpacity="0.25" />
      {/* Sidebar */}
      <rect x="0" y="32" width="90" height="128" fill="white" />
      <rect x="90" y="32" width="1" height="128" fill="#E4E6EB" />
      <rect x="10" y="44" width="70" height="8" rx="3" fill="#E4E6EB" />
      {[60, 76, 92, 108, 124].map((y, i) => (
        <rect key={i} x="10" y={y} width={i === 1 ? 70 : 55} height="6" rx="3" fill={i === 1 ? '#1877F2' : '#E4E6EB'} fillOpacity={i === 1 ? 1 : 0.7} />
      ))}
      {/* Main area */}
      <rect x="102" y="44" width="206" height="16" rx="4" fill="#1877F2" fillOpacity="0.1" />
      <rect x="112" y="49" width="80" height="6" rx="3" fill="#1877F2" fillOpacity="0.5" />
      {/* App card */}
      <rect x="102" y="70" width="96" height="76" rx="6" fill="white" />
      <rect x="102" y="70" width="96" height="76" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      <rect x="112" y="80" width="40" height="20" rx="4" fill="#E4E6EB" />
      <rect x="112" y="106" width="56" height="6" rx="3" fill="#333" />
      <rect x="112" y="116" width="70" height="5" rx="2.5" fill="#E4E6EB" />
      <rect x="112" y="127" width="44" height="10" rx="4" fill="#1877F2" />
      {/* + Button */}
      <rect x="208" y="70" width="100" height="76" rx="6" fill="#F0F2F5" strokeDasharray="4 3" stroke="#1877F2" strokeWidth="1.5" />
      <text x="258" y="110" textAnchor="middle" fontSize="28" fill="#1877F2" fontWeight="300">+</text>
      <rect x="222" y="118" width="72" height="5" rx="2.5" fill="#1877F2" fillOpacity="0.4" />
    </svg>
  )
}

function IlluWhatsAppProduct() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F5F5F5" />
      {/* Sidebar */}
      <rect x="0" y="0" width="80" height="160" fill="white" />
      <rect x="80" y="0" width="1" height="160" fill="#E4E6EB" />
      {['Mi App', 'Dashboard', 'Productos', 'WhatsApp', 'Roles'].map((t, i) => (
        <rect key={i} x="10" y={12 + i * 22} width={i === 3 ? 60 : 50} height="14" rx="3" fill={i === 3 ? '#25D366' : '#E4E6EB'} fillOpacity={i === 3 ? 0.3 : 0.7} />
      ))}
      {/* Selected: WhatsApp */}
      <rect x="0" y="78" width="4" height="14" rx="2" fill="#25D366" />
      {/* Main */}
      <rect x="92" y="12" width="216" height="24" rx="4" fill="white" />
      <rect x="100" y="18" width="90" height="8" rx="4" fill="#25D366" fillOpacity="0.4" />
      {/* API Setup section */}
      <rect x="92" y="48" width="216" height="100" rx="6" fill="white" />
      <rect x="92" y="48" width="216" height="100" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      <rect x="104" y="58" width="72" height="7" rx="3" fill="#333" />
      {/* Phone number field highlighted */}
      <rect x="104" y="72" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="104" y="84" width="192" height="14" rx="4" fill="#F0F2F5" />
      <rect x="108" y="88" width="100" height="6" rx="3" fill="#25D366" fillOpacity="0.5" />
      {/* Arrow pointing to it */}
      <rect x="216" y="84" width="60" height="14" rx="4" fill="#25D366" />
      <rect x="218" y="88" width="56" height="6" rx="3" fill="white" fillOpacity="0.7" />
      <rect x="104" y="106" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="104" y="118" width="192" height="14" rx="4" fill="#F0F2F5" />
      <rect x="108" y="122" width="120" height="6" rx="3" fill="#E4E6EB" />
      <rect x="104" y="136" width="90" height="6" rx="3" fill="#E4E6EB" />
    </svg>
  )
}

function IlluSystemUser() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F5F5F5" />
      {/* Meta Business top bar */}
      <rect width="320" height="36" fill="#1877F2" />
      <rect width="320" height="36" fill="url(#grad)" />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="320" y2="0">
          <stop offset="0%" stopColor="#1877F2" />
          <stop offset="100%" stopColor="#0F52BA" />
        </linearGradient>
      </defs>
      <rect x="10" y="12" width="80" height="12" rx="3" fill="white" fillOpacity="0.4" />
      {/* Left nav */}
      <rect x="0" y="36" width="100" height="124" fill="white" />
      <rect x="100" y="36" width="1" height="124" fill="#E4E6EB" />
      {['Inicio', 'Configuración', 'Usuarios del sistema', 'Cuentas', 'Integraciones'].map((t, i) => (
        <rect key={i} x="8" y={46 + i * 22} width={i === 2 ? 84 : 68} height="10" rx="3" fill={i === 2 ? '#1877F2' : '#E4E6EB'} fillOpacity={i === 2 ? 0.25 : 0.6} />
      ))}
      <rect x="0" y="90" width="4" height="10" rx="2" fill="#1877F2" />
      {/* Main content */}
      <rect x="112" y="44" width="196" height="22" rx="4" fill="white" />
      <rect x="120" y="50" width="100" height="8" rx="4" fill="#333" fillOpacity="0.3" />
      {/* System user card */}
      <rect x="112" y="74" width="196" height="56" rx="6" fill="white" />
      <rect x="112" y="74" width="196" height="56" rx="6" stroke="#E4E6EB" strokeWidth="1" />
      {/* Avatar */}
      <circle cx="136" cy="102" r="14" fill="#E4E6EB" />
      <circle cx="136" cy="97" r="5" fill="#bbb" />
      <path d="M122 116 Q136 108 150 116" stroke="#bbb" strokeWidth="2" fill="none" />
      <rect x="158" y="90" width="60" height="7" rx="3" fill="#333" fillOpacity="0.4" />
      <rect x="158" y="103" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="158" y="113" width="50" height="10" rx="4" fill="#1877F2" />
      {/* Token badge */}
      <rect x="112" y="138" width="196" height="16" rx="4" fill="#FFF3CD" />
      <rect x="120" y="143" width="8" height="6" rx="2" fill="#F59E0B" />
      <rect x="132" y="143" width="140" height="6" rx="3" fill="#F59E0B" fillOpacity="0.4" />
    </svg>
  )
}

function IlluWebhook() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F5F5F5" />
      {/* Two boxes connected */}
      {/* Meta box */}
      <rect x="8" y="30" width="120" height="100" rx="8" fill="white" />
      <rect x="8" y="30" width="120" height="100" rx="8" stroke="#1877F2" strokeWidth="1.5" />
      <rect x="8" y="30" width="120" height="26" rx="8" fill="#1877F2" />
      <rect x="8" y="48" width="120" height="8" fill="#1877F2" />
      <rect x="18" y="38" width="70" height="8" rx="3" fill="white" fillOpacity="0.7" />
      <rect x="18" y="68" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="18" y="80" width="100" height="10" rx="3" fill="#F0F2F5" />
      <rect x="22" y="83" width="60" height="4" rx="2" fill="#E4E6EB" />
      <rect x="18" y="96" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="18" y="108" width="100" height="10" rx="3" fill="#F0F2F5" />
      <rect x="22" y="111" width="40" height="4" rx="2" fill="#1877F2" fillOpacity="0.4" />
      {/* Arrow */}
      <path d="M136 80 L182 80" stroke="#25D366" strokeWidth="2" strokeDasharray="4 3" />
      <polygon points="182,75 192,80 182,85" fill="#25D366" />
      <rect x="145" y="71" width="32" height="16" rx="4" fill="#25D366" fillOpacity="0.15" />
      <rect x="149" y="76" width="24" height="6" rx="3" fill="#25D366" fillOpacity="0.5" />
      {/* ValiAutoFlow box */}
      <rect x="192" y="30" width="120" height="100" rx="8" fill="white" />
      <rect x="192" y="30" width="120" height="100" rx="8" stroke="#6366F1" strokeWidth="1.5" />
      <rect x="192" y="30" width="120" height="26" rx="8" fill="#6366F1" />
      <rect x="192" y="48" width="120" height="8" fill="#6366F1" />
      <rect x="202" y="38" width="80" height="8" rx="3" fill="white" fillOpacity="0.7" />
      <rect x="202" y="68" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="202" y="80" width="100" height="10" rx="3" fill="#EEF2FF" />
      <rect x="206" y="83" width="80" height="4" rx="2" fill="#6366F1" fillOpacity="0.5" />
      <rect x="202" y="96" width="90" height="6" rx="3" fill="#E4E6EB" />
      <rect x="202" y="108" width="100" height="10" rx="3" fill="#EEF2FF" />
      <rect x="206" y="111" width="60" height="4" rx="2" fill="#6366F1" fillOpacity="0.4" />
    </svg>
  )
}

function IlluSuccess() {
  return (
    <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect width="320" height="160" rx="8" fill="#F0FDF4" />
      {/* Big check */}
      <circle cx="160" cy="80" r="50" fill="#22C55E" fillOpacity="0.15" />
      <circle cx="160" cy="80" r="36" fill="#22C55E" fillOpacity="0.25" />
      <circle cx="160" cy="80" r="24" fill="#22C55E" />
      <path d="M148 80 L157 89 L174 70" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Sparkles */}
      {[
        [60, 40], [260, 40], [50, 120], [270, 120], [160, 20], [160, 140],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {/* Labels */}
      <rect x="80" y="114" width="160" height="10" rx="5" fill="#22C55E" fillOpacity="0.2" />
      <rect x="110" y="128" width="100" height="8" rx="4" fill="#22C55E" fillOpacity="0.15" />
    </svg>
  )
}

// ─── Main Tutorial ─────────────────────────────────────────────────────────────

export function MetaTutorial({ open, onClose }: MetaTutorialProps) {
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)
  const { toast } = useToast()

  const steps: TutorialStep[] = [
    {
      id: 1,
      title: 'Meta Business Suite',
      subtitle: 'Paso 1 — Crear o acceder a tu cuenta Business',
      icon: <Globe className="h-5 w-5" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="business.facebook.com" highlight="Paso 1">
            <IlluBusinessSuite />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='Ve a business.facebook.com e inicia sesión con tu cuenta personal de Facebook.' />
            <StepItem num={2} text='Si no tienes una cuenta Business, haz clic en "Crear cuenta" y sigue los pasos.' />
            <StepItem num={3} text='Completa el nombre de tu negocio, tu nombre y el email de la empresa.' />
          </div>

          <Callout type="info">
            <strong>¿Por qué necesito una cuenta Business?</strong><br />
            Meta requiere una cuenta Business verificada para usar la API oficial de WhatsApp. Es gratuita y se puede crear en menos de 5 minutos.
          </Callout>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-500">Acceso directo:</span>
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
            >
              business.facebook.com <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      title: 'Meta for Developers',
      subtitle: 'Paso 2 — Crear una aplicación de tipo Business',
      icon: <Shield className="h-5 w-5" />,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="developers.facebook.com/apps" highlight="Paso 2">
            <IlluDeveloperApp />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='Ve a developers.facebook.com y haz clic en "Mis apps" en el menú superior.' />
            <StepItem num={2} text='Haz clic en el botón "+ Crear app".' />
            <StepItem num={3} text='Cuando te pregunte el tipo de app, selecciona "Business" y haz clic en Siguiente.' />
            <StepItem num={4} text='Escribe un nombre para tu app (ej: "Mi CRM WhatsApp") y selecciona la Business Account que creaste antes. Haz clic en Crear app.' />
          </div>

          <Callout type="warning">
            <strong>¡Importante!</strong> Asegúrate de seleccionar el tipo <strong>Business</strong> — no "Consumer" ni "Gaming". Solo el tipo Business permite acceder a la API de WhatsApp.
          </Callout>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-500">Acceso directo:</span>
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline font-medium"
            >
              developers.facebook.com/apps <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: 'Agregar WhatsApp',
      subtitle: 'Paso 3 — Activar el producto WhatsApp en tu app',
      icon: <Smartphone className="h-5 w-5" />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="developers.facebook.com/apps/[tu-app]/whatsapp" highlight="Paso 3">
            <IlluWhatsAppProduct />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='Dentro de tu app, en el panel izquierdo busca "Agregar productos" o "Products".' />
            <StepItem num={2} text='Encuentra el producto "WhatsApp" y haz clic en "Configurar".' />
            <StepItem num={3} text='En el menú izquierdo verás "WhatsApp" → "Configuración de API".' />
            <StepItem num={4} text='Aquí verás el campo "Phone Number ID" — este es uno de los datos que necesitarás. Cópialo.' />
            <StepItem num={5} text='También verás "WhatsApp Business Account ID" — cópialo también.' />
          </div>

          <Callout type="info">
            Puedes agregar un número de teléfono de prueba gratis para empezar. Para producción, necesitarás verificar tu número real con Meta.
          </Callout>

          <div className="grid grid-cols-1 gap-2">
            <AnimatedCard label="Phone Number ID (ejemplo)" value="123456789012345" />
            <AnimatedCard label="WhatsApp Business Account ID (ejemplo)" value="234567890123456" />
          </div>
        </div>
      ),
    },
    {
      id: 4,
      title: 'System User Token',
      subtitle: 'Paso 4 — Generar un token de acceso permanente',
      icon: <Key className="h-5 w-5" />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="business.facebook.com/settings/system-users" highlight="Paso 4 — Más importante">
            <IlluSystemUser />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='Ve a Meta Business Suite → Configuración (ícono engranaje) → Usuarios del sistema.' />
            <StepItem num={2} text='Haz clic en "Agregar" para crear un nuevo System User. Dale nombre (ej: "ValiAutoFlow Bot") y asígnale el rol de "Administrador".' />
            <StepItem num={3} text='Haz clic en el usuario creado → "Generar nuevo token".' />
            <StepItem num={4} text='Selecciona tu app, establece la expiración en "Nunca" y marca los siguientes permisos:' />
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-zinc-600 mb-2">Permisos requeridos:</p>
            {[
              'whatsapp_business_messaging',
              'whatsapp_business_management',
              'business_management',
            ].map(p => (
              <div key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <code className="text-xs text-zinc-700 font-mono">{p}</code>
              </div>
            ))}
          </div>

          <StepItem num={5} text='Haz clic en "Generar token". Copia el token inmediatamente — solo lo verás una vez.' />

          <Callout type="warning">
            <strong>¡Muy importante!</strong> El token de la pantalla principal de la app empieza con <code>EAA</code> pero expira en horas. Usa <strong>siempre el token del System User</strong> con expiración "Nunca" para que el bot funcione permanentemente.
          </Callout>

          <div className="grid grid-cols-1 gap-2">
            <AnimatedCard label="System User Access Token (ejemplo)" value="EAAxxxxxxxxxxxxxxxx..." pulse />
          </div>
        </div>
      ),
    },
    {
      id: 5,
      title: 'Configurar Webhook',
      subtitle: 'Paso 5 — Conectar Meta con ValiAutoFlow',
      icon: <Webhook className="h-5 w-5" />,
      color: 'text-violet-600',
      bgColor: 'bg-violet-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="developers.facebook.com/apps/[tu-app]/whatsapp/config" highlight="Paso 5">
            <IlluWebhook />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='En el panel izquierdo de tu app, ve a WhatsApp → Configuración.' />
            <StepItem num={2} text='Busca la sección "Webhooks" y haz clic en "Editar".' />
            <StepItem num={3} text='En "URL de devolución de llamada" pega la URL del webhook de ValiAutoFlow (la encuentras en tu panel de Configuración → WhatsApp Business API).' />
            <StepItem num={4} text='En "Token de verificación" pega el Verify Token que aparece en tu panel de ValiAutoFlow.' />
            <StepItem num={5} text='Haz clic en "Verificar y guardar".' />
            <StepItem num={6} text='Activa los campos: messages, message_deliveries, message_reads.' />
          </div>

          <Callout type="success">
            Una vez que hagas clic en "Verificar y guardar" y Meta muestre el mensaje de éxito, significa que la conexión entre Meta y ValiAutoFlow está establecida correctamente.
          </Callout>

          <Callout type="info">
            La URL del webhook y el Verify Token los encuentras en ValiAutoFlow → Configuración → WhatsApp Business API (sección de arriba, una vez que hayas guardado tus credenciales).
          </Callout>
        </div>
      ),
    },
    {
      id: 6,
      title: '¡Listo!',
      subtitle: 'Paso 6 — Ingresar credenciales en ValiAutoFlow',
      icon: <Zap className="h-5 w-5" />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-600',
      content: (
        <div className="space-y-4">
          <BrowserMockup url="valiautoflow.com/dashboard/configuracion" highlight="¡Último paso!">
            <IlluSuccess />
          </BrowserMockup>

          <div className="space-y-3">
            <StepItem num={1} text='Regresa a ValiAutoFlow → Configuración → WhatsApp Business API.' done />
            <StepItem num={2} text='En el campo "Phone Number ID" pega el ID que copiaste en el Paso 3.' done />
            <StepItem num={3} text='En "System User Access Token" pega el token permanente que generaste en el Paso 4.' done />
            <StepItem num={4} text='Opcionalmente ingresa el "Business Account ID".' done />
            <StepItem num={5} text='Haz clic en "Guardar y activar Meta API".' done />
          </div>

          <Callout type="success">
            <strong>¡Tu WhatsApp Business API está lista!</strong><br />
            Los mensajes de tus clientes llegarán directamente a ValiAutoFlow y tu agente IA los atenderá automáticamente. Puedes ver todo en la sección Bandeja de Entrada.
          </Callout>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-emerald-800 mb-2">Resumen de lo que necesitas:</p>
            <div className="space-y-1.5">
              {[
                ['Phone Number ID', 'developers.facebook.com → Tu app → WhatsApp → API Setup'],
                ['System User Access Token', 'business.facebook.com → Configuración → Usuarios del sistema'],
                ['Business Account ID', 'developers.facebook.com → Tu app → WhatsApp → API Setup'],
              ].map(([name, where]) => (
                <div key={name} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-semibold text-emerald-800">{name}</span>
                    <span className="text-[10px] text-emerald-600 ml-1.5">{where}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ]

  const goTo = useCallback(
    (next: number) => {
      if (animating || next < 0 || next >= steps.length) return
      setAnimating(true)
      setTimeout(() => {
        setStep(next)
        setAnimating(false)
      }, 200)
    },
    [animating, steps.length]
  )

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(step + 1)
      if (e.key === 'ArrowLeft') goTo(step - 1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, step, goTo, onClose])

  // Reset on open
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const current = steps[step]
  const progress = ((step + 1) / steps.length) * 100

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-2xl w-full p-0 gap-0 overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Tutorial: Configurar WhatsApp Business API de Meta</DialogTitle>

        {/* Header */}
        <div
          className={cn(
            'relative px-6 py-5 text-white transition-colors duration-300',
            step === 0 && 'bg-blue-600',
            step === 1 && 'bg-indigo-600',
            step === 2 && 'bg-emerald-600',
            step === 3 && 'bg-amber-600',
            step === 4 && 'bg-violet-600',
            step === 5 && 'bg-emerald-600',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                {current.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <BookOpen className="h-3.5 w-3.5 opacity-70" />
                  <span className="text-xs font-medium opacity-70 tracking-wide uppercase">
                    Tutorial — WhatsApp Business API
                  </span>
                </div>
                <h2 className="text-lg font-bold leading-tight">{current.title}</h2>
                <p className="text-sm opacity-80 mt-0.5">{current.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 mb-0.5">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step breadcrumbs */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 flex items-center gap-1 overflow-x-auto">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className={cn(
                'flex items-center gap-1.5 shrink-0 transition-all',
                i < step ? 'opacity-100' : i === step ? 'opacity-100' : 'opacity-40 hover:opacity-60'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all',
                  i < step
                    ? 'bg-emerald-500 text-white'
                    : i === step
                    ? cn('text-white', current.bgColor)
                    : 'bg-zinc-200 text-zinc-500'
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : s.id}
              </div>
              <span className={cn('text-xs font-medium hidden sm:block', i === step ? 'text-zinc-800' : 'text-zinc-400')}>
                {s.title}
              </span>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3 w-3 text-zinc-300 ml-0.5" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          className={cn(
            'px-6 py-5 overflow-y-auto max-h-[55vh] transition-opacity duration-200',
            animating ? 'opacity-0' : 'opacity-100'
          )}
        >
          {current.content}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-white flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <span className="text-xs text-zinc-400 font-medium">
            {step + 1} / {steps.length}
            <span className="ml-1.5 text-zinc-300">· ← → para navegar</span>
          </span>

          {step < steps.length - 1 ? (
            <Button
              size="sm"
              onClick={() => goTo(step + 1)}
              className={cn('gap-1.5 text-white', current.bgColor)}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onClose}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              Entendido
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
