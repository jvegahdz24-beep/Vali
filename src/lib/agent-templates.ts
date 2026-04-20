// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Pre-built Agent Templates
// 8 agent templates listos para cargar en cualquier workspace
// ═══════════════════════════════════════════════════════════════

export interface AgentTemplate {
  id: string
  name: string
  description: string
  type: 'qualifier' | 'sales' | 'followup' | 'coach' | 'custom'
  personality: string
  model: string
  modelName: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  priority: number
  icon: string
  category: 'ventas' | 'soporte' | 'marketing' | 'general'
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: 'tpl-agent-1',
    name: 'JHON — Consultor Comercial',
    description: 'Agente estrella de ventas para cualquier industria. Diagnostica necesidades del cliente, califica leads y cierra ventas por WhatsApp con conversaciones naturales.',
    type: 'sales',
    personality: 'JHON',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
    priority: 10,
    icon: 'car',
    category: 'ventas',
  },
  {
    id: 'tpl-agent-2',
    name: 'Calificador Inteligente',
    description: 'Clasifica automáticamente cada lead entrante según su intención de compra, presupuesto y urgencia. Asigna puntuación y etiqueta para priorizar seguimiento.',
    type: 'qualifier',
    personality: 'Professional',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    maxTokens: 2048,
    systemPrompt: '',
    priority: 8,
    icon: 'target',
    category: 'ventas',
  },
  {
    id: 'tpl-agent-3',
    name: 'Cerrador B2B Corporativo',
    description: 'Especialista en ventas corporativas y flotas. Comunica en tono profesional, maneja términos como TCO, ROI y depreciación. Ideal para clientes institucionales.',
    type: 'sales',
    personality: 'Professional',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    maxTokens: 4096,
    systemPrompt: '',
    priority: 7,
    icon: 'briefcase',
    category: 'ventas',
  },
  {
    id: 'tpl-agent-4',
    name: 'Asistente Amigable Retail',
    description: 'Vendedor casual y divertido que hace la experiencia de comprar un auto emocionante. Usa emojis, lenguaje coloquial mexicano y un tono cálido y cercano.',
    type: 'sales',
    personality: 'Friendly',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.8,
    maxTokens: 4096,
    systemPrompt: '',
    priority: 6,
    icon: 'smile',
    category: 'ventas',
  },
  {
    id: 'tpl-agent-5',
    name: 'Seguimiento Automático',
    description: 'Mantiene el contacto activo con leads que dejaron de responder. Envía mensajes de seguimiento personalizados según el arquetipo y días de inactividad.',
    type: 'followup',
    personality: 'JHON',
    model: 'groq',
    modelName: 'llama-3.1-8b-instant',
    temperature: 0.6,
    maxTokens: 2048,
    systemPrompt: '',
    priority: 5,
    icon: 'phone',
    category: 'general',
  },
  {
    id: 'tpl-agent-6',
    name: 'Soporte 24/7 WhatsApp',
    description: 'Responde automáticamente preguntas frecuentes fuera de horario laboral. Maneja consultas sobre horarios, ubicación, servicios y transfiere a un humano cuando es necesario.',
    type: 'custom',
    personality: 'Friendly',
    model: 'groq',
    modelName: 'llama-3.1-8b-instant',
    temperature: 0.4,
    maxTokens: 2048,
    systemPrompt: '',
    priority: 3,
    icon: 'headphones',
    category: 'soporte',
  },
  {
    id: 'tpl-agent-7',
    name: 'Coach de Ventas IA',
    description: 'Analiza conversaciones de ventas y proporciona retroalimentación al equipo. Identifica oportunidades perdidas, objeciones mal manejadas y sugiere mejoras.',
    type: 'coach',
    personality: 'Professional',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    maxTokens: 4096,
    systemPrompt: '',
    priority: 4,
    icon: 'graduation-cap',
    category: 'general',
  },
  {
    id: 'tpl-agent-8',
    name: 'Cerrador de Alta Presión',
    description: 'Especialista en cierre rápido usando urgencia, escasez y técnicas de cierre alternativo. Ideal para leads calientes que necesitan un último empujón.',
    type: 'sales',
    personality: 'Aggressive',
    model: 'groq',
    modelName: 'llama-3.3-70b-versatile',
    temperature: 0.6,
    maxTokens: 4096,
    systemPrompt: '',
    priority: 9,
    icon: 'zap',
    category: 'ventas',
  },
]

export const agentTemplateCategories = [
  { id: 'ventas', name: 'Ventas', icon: 'briefcase', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'soporte', name: 'Soporte', icon: 'headphones', color: 'bg-blue-100 text-blue-700' },
  { id: 'marketing', name: 'Marketing', icon: 'megaphone', color: 'bg-pink-100 text-pink-700' },
  { id: 'general', name: 'General', icon: 'settings', color: 'bg-zinc-100 text-zinc-700' },
]
