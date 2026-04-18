'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Bot,
  Smartphone,
  BarChart3,
  RefreshCw,
  TrendingUp,
  Shield,
  MessageCircle,
  QrCode,
  Sparkles,
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'
import { PLANS } from '@/lib/constants'
import Image from 'next/image'
import Link from 'next/link'

const features = [
  {
    icon: <Bot className="h-6 w-6" />,
    title: 'Agentes IA que venden por ti',
    description: 'Agentes inteligentes con personalidad mexicana que califican leads, negocian y cierran ventas 24/7.',
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: 'WhatsApp directo sin API de Meta',
    description: 'Conecta tu WhatsApp personal o empresarial. Sin costos adicionales de Meta Business API.',
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: 'CRM con pipeline visual',
    description: 'Gestiona tu pipeline de ventas con kanban drag-and-drop. Nunca pierdas un lead.',
  },
  {
    icon: <RefreshCw className="h-6 w-6" />,
    title: 'Automatizaciones inteligentes',
    description: 'Seguimientos automáticos, triggers basados en eventos y flujos de trabajo personalizados.',
  },
  {
    icon: <TrendingUp className="h-6 w-6" />,
    title: 'Analíticas en tiempo real',
    description: 'Métricas de conversión, rendimiento por agente, funnels y reportes detallados.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Cumplimiento ValiGuard',
    description: 'Consentimiento integrado, manejo responsable de datos y cumplimiento regulatorio.',
  },
]

const steps = [
  {
    number: '01',
    icon: <QrCode className="h-8 w-8" />,
    title: 'Conecta tu WhatsApp',
    description: 'Escanea un código QR y en segundos tu WhatsApp estará conectado. Sin configuraciones complicadas.',
  },
  {
    number: '02',
    icon: <Sparkles className="h-8 w-8" />,
    title: 'Configura tu agente IA',
    description: 'Elige entre 4 personalidades: JHON (automotriz), Profesional, Amigable o Agresivo. Personaliza el tono.',
  },
  {
    number: '03',
    icon: <MessageCircle className="h-8 w-8" />,
    title: 'Empieza a vender automáticamente',
    description: 'Tu agente responde leads, califica prospectos y programa seguimientos sin intervención humana.',
  },
]

const faqs = [
  {
    question: '¿Necesito pagar la API de Meta Business para usar WhatsApp?',
    answer: 'No. ValiAutoFlow se conecta directamente a WhatsApp sin necesidad de la API oficial de Meta. Esto reduce costos significativamente y elimina la complejidad de configuración.',
  },
  {
    question: '¿Cómo funcionan los agentes IA?',
    answer: 'Nuestros agentes usan modelos de lenguaje avanzados (LLaMA, DeepSeek, Gemini, OpenAI) con system prompts especializados para el sector automotriz mexicano. Detectan intención, califican leads y responden con personalidad humana.',
  },
  {
    question: '¿Puedo personalizar la personalidad del agente?',
    answer: 'Sí. Ofrecemos 4 personalidades pre-configuradas (JHON, Profesional, Amigable, Agresivo) y puedes personalizar completamente el system prompt, tono, lenguaje y comportamiento del agente.',
  },
  {
    question: '¿Es seguro conectar mi WhatsApp?',
    answer: 'ValiAutoFlow cumple con ValiGuard, nuestro sistema de cumplimiento que integra consentimiento en cada conversación, maneja datos responsablemente y cumple con regulaciones de protección de datos.',
  },
  {
    question: '¿Cuánto tiempo toma la configuración inicial?',
    answer: 'Menos de 5 minutos. Conectas WhatsApp con un QR, eliges la personalidad de tu agente y listo. El onboarding guiado te lleva paso a paso.',
  },
  {
    question: '¿Puedo tomar el control manual de una conversación?',
    answer: 'Sí. En cualquier momento puedes cambiar al modo manual para responder personalmente. También puedes transferir conversaciones entre agentes y humanos.',
  },
]

const planKeys = ['free', 'starter', 'pro', 'enterprise'] as const
const planLabels: Record<string, string> = {
  free: 'Gratis',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

function PricingCard({ planKey, isPopular }: { planKey: string; isPopular: boolean }) {
  const plan = PLANS[planKey]
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 lg:p-8 border transition-all duration-300 ${
        isPopular
          ? 'border-2 border-emerald-500 shadow-xl shadow-emerald-500/15 scale-[1.03] bg-white'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-emerald-600/30">
            MÁS POPULAR
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-zinc-900">{plan.name}</h3>
        <div className="mt-3 flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-4xl font-extrabold text-zinc-900">Gratis</span>
          ) : (
            <>
              <span className="text-4xl font-extrabold text-zinc-900">${plan.price.toLocaleString('es-MX')}</span>
              <span className="text-sm text-zinc-500">MXN/mes</span>
            </>
          )}
        </div>
      </div>
      <ul className="space-y-3 flex-1 mb-8">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <Check className="h-4.5 w-4.5 text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-sm text-zinc-600">{feature}</span>
          </li>
        ))}
      </ul>
      <Link href={plan.price === 0 ? '/signup' : `/signup?plan=${planKey}`}>
        <Button
          className={`w-full h-11 font-semibold text-sm ${
            isPopular
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-zinc-900 hover:bg-zinc-800 text-white'
          }`}
        >
          {plan.price === 0 ? 'Comenzar Gratis' : 'Comenzar Prueba'}
        </Button>
      </Link>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-zinc-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-sm font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          className={`h-4.5 w-4.5 text-zinc-400 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? 'max-h-48 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-sm text-zinc-600 leading-relaxed">{answer}</p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600">
                <Bot className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">ValiAutoFlow</span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">Funciones</a>
              <a href="#how-it-works" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">Cómo funciona</a>
              <a href="#pricing" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">Precios</a>
              <a href="#faq" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">FAQ</a>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-sm font-medium text-zinc-700">
                  Iniciar Sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold h-9 px-4">
                  Comenzar Gratis
                </Button>
              </Link>
            </div>

            {/* Mobile toggle */}
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-zinc-100 space-y-3">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-zinc-600 py-2">Funciones</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-zinc-600 py-2">Cómo funciona</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-zinc-600 py-2">Precios</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-zinc-600 py-2">FAQ</a>
              <div className="pt-3 flex gap-2">
                <Link href="/login" className="flex-1">
                  <Button variant="outline" className="w-full text-sm">Iniciar Sesión</Button>
                </Link>
                <Link href="/signup" className="flex-1">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm">Comenzar Gratis</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        {/* Background gradient — animated */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 animate-hero-gradient" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-teal-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-700">+500 concesionarias ya lo usan</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6 animate-fade-in">
              Automatiza tus ventas{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">
                con IA y WhatsApp
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              Agentes IA que venden por ti 24/7. CRM con pipeline visual. Automatizaciones inteligentes.
              Todo desde WhatsApp, sin API de Meta.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-slide-up">
              <Link href="/signup">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white h-13 px-10 text-base font-semibold gap-2 shadow-lg shadow-emerald-600/30 hover:shadow-xl hover:shadow-emerald-600/30 hover:scale-[1.02] transition-all duration-200">
                  Comenzar Gratis
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-13 px-10 text-base font-medium border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-all duration-200">
                  Ver Demo
                </Button>
              </Link>
            </div>

            <p className="mt-5 text-xs text-zinc-400">Sin tarjeta de crédito · Configuración en 5 minutos</p>
          </div>

          {/* Hero image */}
          <div className="mt-16 lg:mt-20 max-w-5xl mx-auto">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-2xl shadow-zinc-900/10 bg-zinc-950">
              <Image
                src="/hero-illustration.png"
                alt="ValiAutoFlow Dashboard"
                width={1344}
                height={768}
                className="w-full h-auto"
                priority
              />
              {/* Gradient fade at bottom */}
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Números que hablan ─── */}
      <section className="py-16 lg:py-20 bg-gradient-to-b from-white to-zinc-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3 block">Números que hablan</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Resultados reales de nuestros clientes
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { value: '500+', label: 'Agencias confían en nosotros', sublabel: 'en México y LATAM' },
              { value: '50K+', label: 'Conversaciones procesadas por IA', sublabel: 'mensajes automatizados al mes' },
              { value: '35%', label: 'Más ventas cerradas', sublabel: 'incremento promedio en conversiones' },
            ].map((stat, i) => (
              <div key={i} className="text-center animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                <p className="text-5xl sm:text-6xl font-extrabold text-emerald-600 tracking-tight animate-count-up">{stat.value}</p>
                <p className="text-lg font-bold text-zinc-900 mt-2">{stat.label}</p>
                <p className="text-sm text-zinc-500 mt-1">{stat.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Social Proof ─── */}
      <section className="py-16 border-y border-zinc-100 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-zinc-500 mb-8">
            Confiado por agencias en Monterrey, Guadalajara, CDMX, Querétaro
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {['AutoMax', 'Premium Cars', 'Grupo Automotriz del Pacífico', 'Motors MX', 'AutoElite', 'CarWorld'].map((name) => (
              <div key={name} className="text-lg font-bold text-zinc-300 tracking-tight">{name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3 block">Funciones</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Todo lo que necesitas para vender más
            </h2>
            <p className="text-zinc-600 text-lg">
              Una plataforma completa que automatiza cada paso del proceso de ventas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl border border-zinc-200 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all duration-300"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 mb-4 group-hover:bg-emerald-200 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-base font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-gradient-to-b from-zinc-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3 block">Cómo funciona</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Listo en 3 simples pasos
            </h2>
            <p className="text-zinc-600 text-lg">
              De cero a automatizado en menos de 5 minutos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <div key={i} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[1px] bg-gradient-to-r from-zinc-300 to-transparent" />
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 mb-6">
                  {step.icon}
                </div>
                <span className="text-xs font-bold text-emerald-600 tracking-wider uppercase">{step.number}</span>
                <h3 className="text-lg font-bold mt-2 mb-3">{step.title}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3 block">Precios</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Un plan para cada etapa
            </h2>
            <p className="text-zinc-600 text-lg">
              Comienza gratis y escala cuando estés listo.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {planKeys.map((key) => (
              <PricingCard
                key={key}
                planKey={key}
                isPopular={key === 'pro'}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-20 lg:py-28 bg-zinc-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3 block">FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 px-6 sm:px-8">
            {faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-8 py-16 sm:px-16 sm:py-20 text-center overflow-hidden">
            {/* Decorative blobs */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-teal-400/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
                Comienza a automatizar tu negocio hoy
              </h2>
              <p className="text-emerald-100 text-lg max-w-xl mx-auto mb-10">
                Únete a las 500+ concesionarias que ya venden más con ValiAutoFlow.
              </p>
              <Link href="/signup">
                <Button size="lg" className="bg-white text-emerald-700 hover:bg-emerald-50 h-12 px-8 text-base font-semibold gap-2 shadow-lg">
                  Comenzar Gratis
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-zinc-200 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold">ValiAutoFlow</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="/signup" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Privacidad</a>
              <a href="/signup" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Términos</a>
              <a href="mailto:soporte@valiflow.com" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Contacto</a>
            </div>
            <p className="text-xs text-zinc-400">
              © {new Date().getFullYear()} ValiAutoFlow. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
