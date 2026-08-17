'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Bot, Zap, BarChart3, ShieldCheck, Workflow, Inbox, Brain,
  ArrowRight, Check, ChevronDown, Menu, X, MessageCircle,
  Star, CircleCheck, FileText, Package, Users, Building2,
  Calculator, ClipboardList, TrendingUp, Calendar, Megaphone,
  Receipt, AlertCircle, Facebook, Instagram, Linkedin,
  MapPin, Mail, Phone,
} from 'lucide-react'
import { PLANS } from '@/lib/constants'

// Precios desde la ÚNICA fuente de verdad (constants.ts) — coinciden con
// select-plan y checkout. No editar precios aquí, editarlos en constants.ts.
const fmtMXN = (n: number) => n.toLocaleString('es-MX')

/* ═══════════════════════════════════════════════════════════════════════
   ValiAutoFlow — Landing Page v2 — Dark "Sistema Operativo" theme
   ═══════════════════════════════════════════════════════════════════════ */

// ─── Motion helpers ────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay: i * 0.1, ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number] },
  }),
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={fadeUp}
      custom={delay}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Navbar ────────────────────────────────────────────────────
const navLinks = [
  { href: '#solucion', label: 'Solución' },
  { href: '#connected-flow', label: 'Cómo funciona' },
  { href: '#planes', label: 'Planes' },
  { href: '#casos', label: 'Casos de Éxito' },
  { href: '#faq', label: 'FAQ' },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/80'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.svg" alt="ValiAutoFlow" width={28} height={22} />
            <span className="text-sm font-black tracking-tight text-white">
              VALI<span className="text-emerald-400">AutoFlow</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <button className="text-sm text-zinc-400 hover:text-white transition-colors px-4 py-2">
                Entrar
              </button>
            </Link>
            <Link
              href="/signup"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700/80 bg-white/[0.03] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300 font-medium text-sm transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
              Agenda Demo
            </Link>
          </div>

          <button
            className="md:hidden text-zinc-300 p-2"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden py-4 border-t border-zinc-800 bg-zinc-950 space-y-1"
            >
              {navLinks.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg"
                >
                  {n.label}
                </a>
              ))}
              <div className="pt-3 flex gap-2">
                <Link href="/login" className="flex-1" onClick={() => setOpen(false)}>
                  <button className="w-full py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-300">
                    Entrar
                  </button>
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 font-medium text-sm"
                >
                  <ArrowRight className="h-4 w-4" />
                  Demo
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}

// ─── Hero ──────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center bg-zinc-950 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-emerald-500/8 blur-[140px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-8"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Automatización Inteligente de Ventas
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.05] mb-6"
        >
          El Sistema Operativo que Hace que tu{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
            Negocio Funcione Sin Ti
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg sm:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed"
        >
          CRM + IA + ERP + WhatsApp — Todo en Uno.{' '}
          <span className="text-zinc-200">De la lead a la factura, 100% automatizado.</span>{' '}
          Para clínicas, agencias y negocios que quieren crecer sin caos.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
        >
          <Link
            href="/signup"
            className="flex items-center gap-2.5 px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-base transition-all hover:scale-105 shadow-2xl shadow-emerald-500/30"
          >
            Crear cuenta gratis
            <ArrowRight className="h-5 w-5" />
          </Link>
          <a
            href="#connected-flow"
            className="flex items-center gap-2 px-8 py-4 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 font-medium text-base transition-all"
          >
            Ver Cómo Funciona
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500"
        >
          {['30 días gratis', 'Sin permanencia', 'Garantía 90 días', 'Implementación en días'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
              {t}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// ─── Mission strip ─────────────────────────────────────────────
function MissionStrip() {
  const stats = [
    { val: '500+', label: 'Leads atendidos/día' },
    { val: '73%', label: 'Tasa de conversión' },
    { val: '24/7', label: 'Operación continua' },
    { val: '10.7x', label: 'ROI promedio' },
    { val: '<30s', label: 'Tiempo de respuesta' },
  ]
  return (
    <section className="bg-zinc-900 border-y border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-zinc-500 mb-8">
          Nuestra Misión — <span className="text-emerald-400 font-semibold">Tu negocio funciona sin ti</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl lg:text-4xl font-extrabold text-emerald-400 tracking-tight">{s.val}</p>
              <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Problem ───────────────────────────────────────────────────
const problems = [
  {
    num: '80%',
    title: 'Leads Perdidos',
    desc: 'De cada 10 leads que te escriben por WhatsApp, 8 se quedan sin respuesta. El cliente se va en menos de 5 minutos.',
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
  {
    num: '5+',
    title: 'Sistemas Desconectados',
    desc: 'WhatsApp por aquí, Excel por allá, CRM que nadie usa. Nada se comunica. Tu equipo navega a ciegas.',
    icon: Workflow,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    num: '12h',
    title: 'Horas Perdidas / Semana',
    desc: 'Copiar datos manualmente, buscar info en 5 lugares, seguir leads que ya se enfriaron. Tu equipo trabaja PARA el sistema.',
    icon: Calculator,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
]

function Problem() {
  return (
    <section className="bg-zinc-950 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">El Problema</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Tu negocio está perdiendo{' '}
            <span className="text-red-400">dinero cada día</span>
          </h2>
          <p className="mt-5 text-lg text-zinc-400">
            Cada lead sin respuesta es un cliente que se va con tu competencia. Cada hora manual es dinero tirado.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <Reveal key={i} delay={i}>
              <div className={`rounded-2xl border p-8 ${p.bg} h-full`}>
                <div className={`text-6xl font-extrabold tracking-tight ${p.color} mb-3`}>{p.num}</div>
                <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <p className="text-sm text-zinc-500">
            Costo promedio por lead perdido en LATAM: <span className="text-zinc-300">$2,500–$15,000 MXN</span>
            {' · '}Un negocio promedio pierde <span className="text-red-400 font-semibold">$180,000+ MXN/mes</span> en leads sin atender
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Dream ─────────────────────────────────────────────────────
function Dream() {
  const lines = [
    '¿Y si tu negocio funcionara sin ti?',
    '¿Y si cada lead se atendiera al instante?',
    '¿Y si cada cita, factura y comisión se calculara sin que levantes un dedo?',
  ]
  return (
    <section className="relative bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <div className="text-7xl text-emerald-400/30 font-serif mb-6 leading-none">&ldquo;</div>
          <div className="space-y-4 mb-8">
            {lines.map((l, i) => (
              <Reveal key={i} delay={i}>
                <p className="text-2xl sm:text-3xl font-bold text-white/90 leading-snug">{l}</p>
              </Reveal>
            ))}
          </div>
          <Reveal delay={3}>
            <p className="text-lg text-zinc-400 mt-8">
              Ese mundo existe. Se llama{' '}
              <span className="text-emerald-400 font-extrabold text-2xl">ValiAutoFlow</span>
            </p>
          </Reveal>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Solution (two-layer tabs) ─────────────────────────────────
const crmFeatures = [
  { icon: Bot, title: 'Agentes IA', desc: 'Bots de WhatsApp que responden, califican y agendan como un vendedor experto 24/7' },
  { icon: Inbox, title: 'Bandeja Inteligente', desc: 'Todas las conversaciones en un solo lugar. Priorización automática por intención y temperatura' },
  { icon: BarChart3, title: 'Pipeline Visual', desc: 'Kanban de oportunidades con scoring automático. Sabes exactamente dónde está cada trato' },
  { icon: Calendar, title: 'Calendario Auto', desc: 'La IA agenda citas directo en tu calendario. Confirmación, recordatorio y re-agendado automático' },
  { icon: Megaphone, title: 'Marketing IA', desc: 'Campañas automatizadas por WhatsApp con segmentación inteligente y copy generado por IA' },
  { icon: Workflow, title: 'Automatizaciones', desc: 'Flujos personalizados: si el lead dice X, haz Y. Sin código. Sin programador. Sin límite' },
  { icon: ShieldCheck, title: 'VallGuard', desc: 'Seguridad empresarial: roles, permisos, auditoría de acciones y protección de datos' },
  { icon: TrendingUp, title: 'Analíticas Live', desc: 'Dashboard en tiempo real: leads, conversiones, velocidad de respuesta, ROI por campaña' },
]

const erpFeatures = [
  { icon: FileText, title: 'Facturación CFDI 4.0', desc: 'Facturas automáticas con timbrado SAT al cerrar la venta, sin intervención manual' },
  { icon: Package, title: 'Inventario Inteligente', desc: 'Stock actualizado en tiempo real. Alertas de reposición, lotes, caducidades y proveedores' },
  { icon: Calculator, title: 'Nómina y Comisiones', desc: 'Cálculo automático de salarios, comisiones por venta, deducciones y recibos de nómina' },
  { icon: Building2, title: 'Multi-Sucursal', desc: 'Gestiona todas tus ubicaciones desde una sola plataforma. Reportes consolidados' },
  { icon: Users, title: 'Gestión de Equipo', desc: 'Doctores, vendedores, técnicos. Roles, permisos, horarios y performance por colaborador' },
  { icon: ClipboardList, title: 'Especialidades / Lab', desc: 'Catálogo de servicios, especialidades médicas, laboratorio propio y referencias' },
  { icon: Receipt, title: 'Control de Gastos', desc: 'Registro de egresos, categorización automática, presupuestos vs real y alertas' },
  { icon: Brain, title: 'Recetas y Expedientes', desc: 'Recetas digitales, historial clínico, notas de evolución y documentos centralizados' },
  { icon: TrendingUp, title: 'Reportes Gerenciales', desc: 'Reportes financieros, operativos y de ventas. Dashboards ejecutivos para decisiones' },
]

function Solution() {
  const [tab, setTab] = useState<'crm' | 'erp'>('crm')
  const features = tab === 'crm' ? crmFeatures : erpFeatures

  return (
    <section id="solucion" className="bg-zinc-950 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">La Solución</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Un Ecosistema, No{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Una Herramienta
            </span>
          </h2>
          <p className="mt-5 text-lg text-zinc-400">
            ValiAutoFlow unifica las dos capas que tu negocio necesita: comercial y administrativa,
            conectadas en un solo flujo automatizado.
          </p>
        </Reveal>

        <Reveal className="flex justify-center mb-12">
          <div className="inline-flex gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800">
            <button
              onClick={() => setTab('crm')}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                tab === 'crm'
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Capa Comercial — CRM + IA
              </span>
            </button>
            <button
              onClick={() => setTab('erp')}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                tab === 'erp'
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Capa Administrativa — ERP
              </span>
            </button>
          </div>
        </Reveal>

        <Reveal className="text-center mb-10">
          <p className="text-zinc-400 text-sm">
            {tab === 'crm'
              ? 'La capa que vende por ti mientras duermes'
              : 'La capa que administra todo sin que toques un botón'}
          </p>
        </Reveal>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {features.map((f, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-900/80 transition-all duration-300"
              >
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <f.icon className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// ─── Connected Flow ────────────────────────────────────────────
const flowSteps = [
  { num: 1, title: 'Lead llega por WhatsApp', sub: 'Cualquier hora, cualquier día', icon: MessageCircle, color: 'bg-emerald-500' },
  { num: 2, title: 'IA responde al instante', sub: 'Natural, no robótico', icon: Bot, color: 'bg-teal-500' },
  { num: 3, title: 'Auto-agenda la cita', sub: 'Calendario sincronizado', icon: Calendar, color: 'bg-emerald-500' },
  { num: 4, title: 'Registra en el sistema', sub: 'CRM automático', icon: ClipboardList, color: 'bg-teal-500' },
  { num: 5, title: 'Confirma y recuerda', sub: 'Follow-up automático', icon: CircleCheck, color: 'bg-emerald-500' },
  { num: 6, title: 'Factura e inventario', sub: 'CFDI 4.0 automático', icon: FileText, color: 'bg-teal-500' },
  { num: 7, title: 'Comisiones y seguimiento', sub: 'Nómina + Post-venta', icon: Calculator, color: 'bg-emerald-500' },
]

const flowTags = [
  { label: 'Lead calificado', right: 'Cita agendada auto' },
  { label: 'Cita completada', right: 'Factura CFDI + Inventario' },
  { label: 'Factura emitida', right: 'Comisión calculada' },
  { label: 'Lead sin respuesta', right: 'Seguimiento automático' },
]

function ConnectedFlow() {
  return (
    <section id="connected-flow" className="bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Connected Flow</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            De Lead a Factura,{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              100% Automatizado
            </span>
          </h2>
          <p className="mt-5 text-lg text-zinc-400">
            El Connected Flow de ValiAutoFlow convierte cada interacción en revenue, sin intervención humana.
          </p>
        </Reveal>

        <div className="relative">
          <div className="hidden lg:block absolute top-14 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-6">
            {flowSteps.map((s, i) => (
              <Reveal key={i} delay={i * 0.5}>
                <div className="flex flex-col items-center text-center">
                  <div className={`relative h-12 w-12 rounded-2xl ${s.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <s.icon className="h-5 w-5 text-white" />
                    <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-emerald-400 flex items-center justify-center">
                      {s.num}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white leading-tight mb-1">{s.title}</h4>
                  <p className="text-[10px] text-zinc-500">{s.sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-16 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h3 className="text-2xl font-bold text-white mb-4">Dos capas, un solo flujo</h3>
            <p className="text-zinc-400 leading-relaxed mb-8">
              Cuando un lead escribe por WhatsApp, el Agente IA lo atiende al instante,
              califica su intención y agenda una cita automáticamente. Al completar la cita,
              se genera la factura CFDI 4.0, se actualiza el inventario y se calcula la comisión
              del vendedor. <span className="text-white font-semibold">Todo sin que levantes un dedo.</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {flowTags.map((t, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-zinc-800 border border-zinc-700">
                  <span className="text-xs text-emerald-400 font-semibold">{t.label}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-400">{t.right}</span>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <Image
                src="/images/connected_flow_v2.png"
                alt="Connected Flow — ValiAutoFlow"
                width={750}
                height={500}
                className="w-full h-auto object-cover"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ───────────────────────────────────────────────────
const plans = [
  {
    name: 'Básico',
    price: fmtMXN(PLANS.starter.price),
    implCost: fmtMXN(PLANS.starter.implementationCost ?? 0),
    implLabel: `IMPLEMENTACIÓN $${fmtMXN(PLANS.starter.implementationCost ?? 0)}`,
    discount: null,
    popular: false,
    features: [
      { text: '1 Agente IA WhatsApp', included: true },
      { text: 'CRM + Pipeline básico', included: true },
      { text: 'Calendario + Citas', included: true },
      { text: '1 Sucursal', included: true },
      { text: 'Facturación CFDI básica', included: true },
      { text: '3 Usuarios incluidos', included: true },
      { text: 'Inventario / Nómina', included: false },
      { text: 'White-Label', included: false },
    ],
  },
  {
    name: 'Pro',
    price: fmtMXN(PLANS.pro.price),
    implCost: fmtMXN(PLANS.pro.implementationCost ?? 0),
    implLabel: `IMPLEMENTACIÓN $${fmtMXN(PLANS.pro.implementationCost ?? 0)}`,
    discount: '🎉 50% off implementación (primeros 10)',
    popular: true,
    features: [
      { text: '3 Agentes IA WhatsApp', included: true },
      { text: 'CRM + Pipeline completo', included: true },
      { text: 'Marketing IA + Automatizaciones', included: true },
      { text: '3 Sucursales', included: true },
      { text: 'Facturación + Inventario', included: true },
      { text: 'Nómina + Comisiones', included: true },
      { text: '10 Usuarios incluidos', included: true },
      { text: 'White-Label', included: false },
    ],
  },
  {
    name: 'Empresarial',
    price: fmtMXN(PLANS.enterprise.price),
    implCost: fmtMXN(PLANS.enterprise.implementationCost ?? 0),
    implLabel: `IMPLEMENTACIÓN $${fmtMXN(PLANS.enterprise.implementationCost ?? 0)}`,
    discount: null,
    popular: false,
    features: [
      { text: 'Agentes IA ilimitados', included: true },
      { text: 'Todos los módulos CRM+ERP', included: true },
      { text: 'Sucursales ilimitadas', included: true },
      { text: 'Facturación + Inventario + Nómina', included: true },
      { text: 'Marketing IA + Automatizaciones', included: true },
      { text: 'Usuarios ilimitados', included: true },
      { text: 'API personalizada', included: true },
      { text: 'White-Label', included: true },
    ],
  },
]

function Pricing() {
  return (
    <section id="planes" className="bg-zinc-950 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Planes Comerciales</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Elige el plan que hace{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              crecer tu negocio
            </span>
          </h2>
          <p className="mt-5 text-zinc-400">Todos los precios en MXN + IVA</p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, i) => (
            <Reveal key={i} delay={i}>
              <div
                className={`relative flex flex-col h-full rounded-2xl p-8 border transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-b from-emerald-950 to-zinc-900 border-emerald-500/60 shadow-2xl shadow-emerald-500/20'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg">
                      MAS POPULAR
                    </span>
                  </div>
                )}

                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-zinc-500 mb-4">{plan.implLabel}</p>

                {plan.discount && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium">
                    {plan.discount}
                  </div>
                )}

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-sm text-zinc-500">$</span>
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-sm text-zinc-500">/mes + IVA</span>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5">
                      {f.included ? (
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-zinc-700 shrink-0" />
                      )}
                      <span className={`text-sm ${f.included ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.popular
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  }`}
                >
                  Comenzar
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center">
          <p className="text-sm text-zinc-500">
            ¿Necesitas Enterprise+ con white-label completo?{' '}
            <a
              href="https://wa.me/529842084424?text=DEMO"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 font-semibold hover:underline"
            >
              Escríbenos
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Implementation Timeline ────────────────────────────────────
const implWeeks = [
  {
    week: 'Semana 1',
    title: 'Diagnóstico y Configuración',
    items: ['Análisis del negocio', 'Configuración de cuenta', 'Conexión WhatsApp Business'],
  },
  {
    week: 'Semana 2',
    title: 'Migración y Entrenamiento IA',
    items: ['Migración de datos históricos', 'Entrenamiento de agentes IA con tu información'],
  },
  {
    week: 'Semana 3',
    title: 'Facturación y Operación',
    items: ['Configuración CFDI 4.0', 'Inventario, nómina', 'Pruebas de flujo completo'],
  },
  {
    week: 'Post-lanzamiento',
    title: '30 días de acompañamiento',
    items: ['Monitoreo', 'Ajustes', 'Optimización de agentes IA'],
  },
]

function ImplementationTimeline() {
  return (
    <section className="bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Implementación</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            De la firma al{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Go-Live en 3 semanas
            </span>
          </h2>
          <p className="mt-5 text-zinc-400">
            Nuestro equipo te acompaña paso a paso. Sin complicaciones técnicas. Sin estrés.
          </p>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {implWeeks.map((w, i) => (
            <Reveal key={i} delay={i}>
              <div className="relative h-full p-6 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div className="absolute -top-3 left-6">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wide">
                    {w.week}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-bold text-white mb-3">{w.title}</h3>
                <ul className="space-y-2">
                  {w.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-zinc-500">
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <p className="text-sm text-zinc-600">
            Implementación incluye: configuración completa, migración, entrenamiento IA,
            facturación CFDI 4.0, capacitación y 30 días de acompañamiento post-lanzamiento
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Success Cases ─────────────────────────────────────────────
const cases = [
  {
    industry: 'Dental',
    img: '/images/case_dental_v2.png',
    quote:
      'Antes perdíamos 6 de cada 10 pacientes que escribían por WhatsApp. Con ValiAutoFlow, la IA responde y agenda en segundos. Ahora convertimos el 73% de los leads.',
    author: 'Dra. Rodríguez',
    company: 'Clínica Dental Sonrisas · Cancún',
    initials: 'DR',
    stats: ['+73% conversión', '+40% más citas'],
  },
  {
    industry: 'Automotriz',
    img: '/images/case_automotive_v2.png',
    quote:
      'Teníamos 3 vendedores y ningún CRM. Ahora la IA califica prospectos, agenda test drives y nosotros solo cerramos. Vendimos 8 autos más el primer mes.',
    author: 'Carlos Mendoza',
    company: 'Highline Motors · CDMX',
    initials: 'CM',
    stats: ['8+ autos/mes', '-60% tiempo venta'],
  },
  {
    industry: 'Inmobiliaria',
    img: '/images/case_realestate_v2.png',
    quote:
      'El follow-up era nuestro talón de Aquiles. Con las automatizaciones, ningún prospecto se queda sin seguimiento. Cerramos 3 contratos más en 45 días.',
    author: 'Ana López',
    company: 'Inmobiliaria Cielo · Monterrey',
    initials: 'AL',
    stats: ['3 contratos/45 días', '+100% seguimiento'],
  },
]

function SuccessCases() {
  return (
    <section id="casos" className="bg-zinc-950 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Casos de Éxito</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Negocios que ya{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              transformaron sus resultados
            </span>
          </h2>
        </Reveal>
        <Reveal className="text-center mb-16">
          <p className="text-sm text-zinc-500">
            Promedio: <span className="text-emerald-400">+65% conversión</span>,{' '}
            <span className="text-emerald-400">+40% revenue</span>,{' '}
            <span className="text-emerald-400">-55% tiempo operativo</span> en 90 días
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {cases.map((c, i) => (
            <Reveal key={i} delay={i}>
              <div className="flex flex-col h-full rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-emerald-500/30 transition-all group">
                <div className="relative h-48 overflow-hidden bg-zinc-800">
                  <Image
                    src={c.img}
                    alt={c.industry}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-3 py-1 rounded-full bg-zinc-950/80 backdrop-blur text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                      {c.industry}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col flex-1 p-6">
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(5)].map((_, k) => (
                      <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>

                  <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-6 italic">
                    &ldquo;{c.quote}&rdquo;
                  </p>

                  <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                    <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {c.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{c.author}</p>
                      <p className="text-xs text-zinc-500">{c.company}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {c.stats.map((s, j) => (
                      <span key={j} className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Liberty + ROI ─────────────────────────────────────────────
const painPoints = [
  { icon: AlertCircle, title: 'Miedo a perder clientes', desc: 'Cada lead que no contesto es dinero que se va.' },
  { icon: Workflow, title: 'Estrés operativo', desc: 'Tengo 5 sistemas que no se hablan entre sí.' },
  { icon: Users, title: 'Trampa del dueño-empleado', desc: 'No puedo salir del negocio porque sin mí todo se detiene.' },
  { icon: TrendingUp, title: 'Deseo de libertad', desc: 'Quiero que mi negocio funcione sin mí. Quiero recuperar mi vida.' },
]

const roiRows = [
  { label: 'Leads recuperados (30+ leads/mes)', value: '$75,000' },
  { label: 'Horas ahorradas (48h/mes)', value: '$9,600' },
  { label: 'Sistemas eliminados (5 → 1)', value: '$15,000' },
  { label: 'Errores manuales eliminados', value: '$8,000' },
]

function Liberty() {
  return (
    <section className="bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Lo que tu cliente siente</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Tu cliente no compra software,{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              compra libertad
            </span>
          </h2>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-5">
            {painPoints.map((p, i) => (
              <Reveal key={i} delay={i}>
                <div className="flex gap-4 p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <p.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">{p.title}</h4>
                    <p className="text-sm text-zinc-500">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={2}>
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-bold text-white">Ahorro Mensual Estimado</h3>
              </div>
              <div className="p-6 space-y-3">
                {roiRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-900">
                    <span className="text-sm text-zinc-400">{r.label}</span>
                    <span className="text-sm font-bold text-emerald-400">{r.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3">
                  <span className="text-sm font-bold text-white">AHORRO TOTAL MENSUAL</span>
                  <span className="text-xl font-extrabold text-emerald-400">$107,600</span>
                </div>
              </div>
              <div className="px-6 py-4 bg-emerald-500/5 border-t border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">ROI estimado vs inversión</p>
                    <p className="text-2xl font-extrabold text-emerald-400">10.7x</p>
                  </div>
                  <p className="text-xs text-zinc-500 text-right max-w-[140px]">
                    Por cada <span className="text-white font-bold">$1 invertido</span>, recuperas <span className="text-emerald-400 font-bold">$10.70</span>
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── Guarantee ─────────────────────────────────────────────────
function Guarantee() {
  return (
    <section className="bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <div className="inline-flex items-center justify-center mb-8">
            <Image
              src="/images/guarantee_shield_v2.png"
              alt="Garantía"
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">
            Garantía ValiAutoFlow{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              90 Días
            </span>
          </h2>
          <p className="text-xl text-zinc-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Si en 90 días no recuperas al menos{' '}
            <span className="text-white font-bold">2 clientes que antes perdías</span>, te{' '}
            <span className="text-emerald-400 font-bold">devolvemos tu inversión completa</span>.{' '}
            Sin letras chiquitas. Sin trucos. Sin condiciones ocultas.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mt-10">
            {[
              { week: 'Semana 0', label: 'Medición basal de leads y conversiones' },
              { week: 'Semanas 4–8', label: 'Evaluaciones parciales con ajustes' },
              { week: 'Semana 12', label: 'Evaluación final: si no funciona, devolución' },
            ].map((step, i) => (
              <Reveal key={i} delay={i}>
                <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800">
                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-2">{step.week}</p>
                  <p className="text-sm text-zinc-400">{step.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── FAQ ───────────────────────────────────────────────────────
const faqs = [
  {
    q: '¿Qué es ValiAutoFlow?',
    a: 'El sistema operativo de negocios que une CRM con IA, ERP, facturación CFDI 4.0 y WhatsApp en una sola plataforma. Convierte leads en clientes de forma automática, sin que necesites estar presente.',
  },
  {
    q: '¿En cuánto tiempo puedo tener ValiAutoFlow funcionando?',
    a: 'El proceso de implementación toma entre 7 y 21 días hábiles. Semana 1: diagnóstico y configuración. Semana 2: migración y entrenamiento de IA. Semana 3: facturación CFDI y operación completa.',
  },
  {
    q: '¿ValiAutoFlow funciona para mi industria?',
    a: 'Sí. Está diseñado para clínicas, agencias automotrices, inmobiliarias, despachos, restaurantes y cualquier negocio que reciba leads por WhatsApp. Tenemos módulos especializados por industria.',
  },
  {
    q: '¿Se conecta con mi facturador actual?',
    a: 'ValiAutoFlow incluye facturación CFDI 4.0 integrada con timbrado SAT. En la mayoría de los casos reemplaza tu facturador actual. Si ya tienes un PAC, coordinamos la migración sin interrupciones.',
  },
  {
    q: '¿Puedo personalizar los agentes de IA?',
    a: 'Completamente. Defines nombre, personalidad, productos que vende, preguntas frecuentes, objeciones comunes y el tono de cada conversación. El agente aprende tu negocio durante la implementación.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Cifrado end-to-end, hosting en México, backups diarios y cumplimiento con LFPDPPP. VallGuard gestiona roles y permisos para que cada persona solo vea lo que necesita.',
  },
  {
    q: '¿Hay contrato de permanencia?',
    a: 'No. Nuestros planes son mensuales y puedes cancelar en cualquier momento. La implementación se cobra una sola vez, independientemente de la duración de tu suscripción.',
  },
  {
    q: '¿Qué pasa si no me funciona?',
    a: 'Aplicamos la Garantía 90 Días: si en 90 días no recuperas al menos 2 clientes que antes perdías, te devolvemos el costo de implementación completo. Sin letras chiquitas.',
  },
  {
    q: '¿Soportan multi-sucursal?',
    a: 'Sí. Desde el plan Empresarial puedes gestionar sucursales ilimitadas con reportes consolidados, usuarios por sucursal y configuraciones independientes por cada ubicación.',
  },
  {
    q: '¿Puedo usar mi número de WhatsApp actual?',
    a: 'Sí. Conectamos tu número actual mediante QR en menos de 2 minutos. No necesitas número nuevo ni API oficial de Meta ni aprobación de plantillas.',
  },
  {
    q: '¿Cuánto cuesta la implementación?',
    a: `Básico: $${fmtMXN(PLANS.starter.implementationCost ?? 0)} MXN. Pro: $${fmtMXN(PLANS.pro.implementationCost ?? 0)} MXN (con 50% de descuento para los primeros 10 clientes). Empresarial: $${fmtMXN(PLANS.enterprise.implementationCost ?? 0)} MXN. Todos más IVA.`,
  },
  {
    q: '¿Qué incluye la implementación?',
    a: 'Diagnóstico del negocio, configuración completa, migración de datos históricos, entrenamiento de agentes IA, configuración de facturación CFDI 4.0, capacitación del equipo y 30 días de acompañamiento post-lanzamiento.',
  },
  {
    q: '¿ValiAutoFlow reemplaza mi sistema actual?',
    a: 'En la mayoría de los casos, sí. Reemplaza CRM, facturador, sistema de inventario, nómina y herramientas de marketing por WhatsApp. Reducirás de 5+ sistemas a uno solo.',
  },
  {
    q: '¿Necesito equipo técnico para usar ValiAutoFlow?',
    a: 'No. La plataforma está diseñada para dueños de negocio. La configuración inicial la hace nuestro equipo. El uso diario es tan simple como responder un mensaje de WhatsApp.',
  },
]

function FAQItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal delay={i * 0.03}>
      <div className="border border-zinc-800 rounded-xl bg-zinc-900 overflow-hidden hover:border-zinc-700 transition-colors">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-left px-6 py-5"
        >
          <span className="text-sm font-semibold text-white pr-4">{q}</span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 shrink-0 transition-transform duration-300 ${
              open ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number] }}
              className="overflow-hidden"
            >
              <p className="px-6 pb-5 text-sm text-zinc-400 leading-relaxed">{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  )
}

function FAQ() {
  return (
    <section id="faq" className="bg-zinc-950 py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Preguntas Frecuentes</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Todo lo que necesitas saber
          </h2>
        </Reveal>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <FAQItem key={i} q={f.q} a={f.a} i={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ─────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="relative bg-zinc-900 py-24 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-teal-500/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[120px]" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
            Tu negocio merece{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              funcionar sin ti
            </span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            No esperes a perder otro lead, otra venta, otro día.{' '}
            <span className="text-zinc-200">ValiAutoFlow ya está funcionando. Tu competencia ya lo sabe.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/signup"
              className="flex items-center gap-3 px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-base transition-all hover:scale-105 shadow-2xl shadow-emerald-500/30"
            >
              Crear cuenta gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          <p className="text-2xl font-extrabold text-white mb-1">
            <a
              href="https://wa.me/529842084424?text=DEMO"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              984 208 4424
            </a>
          </p>
          <p className="text-xs text-zinc-500 mb-8">Respuesta en menos de 5 minutos</p>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
            {['30 días gratis', 'Sin permanencia', 'Garantía 90 días', 'Implementación en días'].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Footer ────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-zinc-950 border-t border-zinc-800 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icon.svg" alt="ValiAutoFlow" width={28} height={22} />
              <span className="text-sm font-black text-white tracking-tight">
                VALI<span className="text-emerald-400">AutoFlow</span>
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mb-5">
              Automatización Inteligente de Ventas. El sistema operativo que hace que tu negocio
              funcione sin ti.
            </p>
            <p className="text-xs text-zinc-600 italic mb-5">&ldquo;Tu negocio funciona sin ti&rdquo;</p>
            <div className="flex items-center gap-2">
              {[
                { icon: Facebook, href: 'https://facebook.com/valiautoflow' },
                { icon: Instagram, href: 'https://instagram.com/valiautoflow' },
                { icon: Linkedin, href: 'https://linkedin.com/company/valiautoflow' },
              ].map((s, i) => (
                <a
                  key={i}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all"
                >
                  <s.icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-4">Producto</h4>
            <ul className="space-y-2.5 text-sm">
              {['CRM + IA', 'ERP Integrado', 'Connected Flow', 'Planes y Precios', 'Implementación'].map((l) => (
                <li key={l}>
                  <a href="#solucion" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-4">Empresa</h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#casos" className="text-zinc-500 hover:text-emerald-400 transition-colors">Casos de Éxito</a></li>
              <li><a href="#faq" className="text-zinc-500 hover:text-emerald-400 transition-colors">Preguntas Frecuentes</a></li>
              <li><Link href="/terms" className="text-zinc-500 hover:text-emerald-400 transition-colors">Términos y Condiciones</Link></li>
              <li><Link href="/privacy" className="text-zinc-500 hover:text-emerald-400 transition-colors">Política de Privacidad</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-4">Contacto</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="https://wa.me/529842084424?text=DEMO"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-zinc-500 hover:text-emerald-400 transition-colors"
                >
                  <Phone className="h-4 w-4 mt-0.5 shrink-0" />
                  WhatsApp: 984 208 4424
                </a>
              </li>
              <li className="flex items-start gap-2 text-zinc-500">
                <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                <a href="mailto:info@valiautoflow.com" className="hover:text-emerald-400 transition-colors">
                  info@valiautoflow.com
                </a>
              </li>
              <li className="flex items-start gap-2 text-zinc-500">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                Cancún, Quintana Roo, México
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600 text-center md:text-left">
            © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-600">
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Términos y Condiciones</Link>
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Política de Privacidad</Link>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-zinc-700 text-center max-w-3xl mx-auto leading-relaxed">
          Aviso Legal: ValiAutoFlow S.A. de C.V., Cancún, Quintana Roo, México. Precios en MXN + IVA.
          La oferta de lanzamiento aplica únicamente para los primeros 10 clientes. Garantía 90 días desde go-live.
          Para consultas: <a href="mailto:legal@valiautoflow.com" className="text-zinc-600 hover:text-zinc-400">legal@valiautoflow.com</a>
        </p>
      </div>
    </footer>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      <Navbar />
      <main>
        <Hero />
        <MissionStrip />
        <Problem />
        <Dream />
        <Solution />
        <ConnectedFlow />
        <Pricing />
        <ImplementationTimeline />
        <SuccessCases />
        <Liberty />
        <Guarantee />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
