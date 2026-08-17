// ═══════════════════════════════════════════════════════════════
// Registro de industrias — hace al bot ADAPTABLE por giro.
// Cada workspace.industry define el rol, el vocabulario y el CTA del
// asesor. buildIndustryPersona() arma una persona de ventas sólida con
// ese vocabulario. Automotriz conserva su persona pulida (JHON).
// ═══════════════════════════════════════════════════════════════

import { JHON_SYSTEM_PROMPT } from '@/lib/constants'

export interface IndustryConfig {
  /** Etiqueta legible del giro */
  label: string
  /** Rol del asesor (ej. "asesor de ventas de autos") */
  agentRole: string
  /** Sustantivo del producto en singular / plural */
  productSingular: string
  productPlural: string
  /** Sustantivo de la cita/siguiente paso (cita, visita, prueba de manejo, demo) */
  appointmentNoun: string
  /** Qué calificar antes de recomendar */
  qualifiers: string
  /** Llamado a la acción principal */
  cta: string
  /** Guía extra específica del giro (puede ir vacía) */
  extraGuidance: string
}

export const INDUSTRY_CONFIG: Record<string, IndustryConfig> = {
  automotive: {
    label: 'Automotriz / Concesionario',
    agentRole: 'asesor de ventas de autos', productSingular: 'auto', productPlural: 'autos',
    appointmentNoun: 'prueba de manejo', qualifiers: 'nuevo o seminuevo, uso, enganche/mensualidad y buró',
    cta: 'agendar una prueba de manejo', extraGuidance: 'Acepta autos a cuenta; nunca prometas tasa o aprobación de crédito como segura.',
  },
  services: {
    label: 'Servicios', agentRole: 'asesor comercial', productSingular: 'servicio', productPlural: 'servicios',
    appointmentNoun: 'llamada', qualifiers: 'qué necesita, alcance y presupuesto',
    cta: 'agendar una llamada', extraGuidance: '',
  },
  realestate: {
    label: 'Bienes Raíces', agentRole: 'asesor inmobiliario', productSingular: 'propiedad', productPlural: 'propiedades (casas, departamentos, terrenos)',
    appointmentNoun: 'visita', qualifiers: 'zona, presupuesto, recámaras y si es contado o crédito',
    cta: 'agendar una visita', extraGuidance: '',
  },
  'real-estate': {
    label: 'Bienes Raíces', agentRole: 'asesor inmobiliario', productSingular: 'propiedad', productPlural: 'propiedades (casas, departamentos, terrenos)',
    appointmentNoun: 'visita', qualifiers: 'zona, presupuesto, recámaras y si es contado o crédito',
    cta: 'agendar una visita', extraGuidance: '',
  },
  retail: {
    label: 'Retail', agentRole: 'asesor de ventas', productSingular: 'producto', productPlural: 'productos',
    appointmentNoun: 'visita o entrega', qualifiers: 'qué busca, presupuesto y para cuándo lo necesita',
    cta: 'cerrar la compra o coordinar la entrega', extraGuidance: '',
  },
  health: {
    label: 'Salud', agentRole: 'asesor de la clínica', productSingular: 'tratamiento', productPlural: 'tratamientos y servicios',
    appointmentNoun: 'cita de valoración', qualifiers: 'qué necesita, si es primera vez y urgencia',
    cta: 'agendar una cita de valoración', extraGuidance: 'NUNCA des diagnósticos médicos ni recetes; canaliza siempre a una valoración con el especialista.',
  },
  education: {
    label: 'Educación', agentRole: 'asesor educativo', productSingular: 'curso', productPlural: 'cursos y programas',
    appointmentNoun: 'cita informativa', qualifiers: 'qué quiere estudiar, modalidad y presupuesto',
    cta: 'agendar una cita informativa', extraGuidance: '',
  },
  food: {
    label: 'Alimentos', agentRole: 'asesor', productSingular: 'platillo', productPlural: 'menú y servicios',
    appointmentNoun: 'reservación', qualifiers: 'cuántas personas, fecha y tipo de evento',
    cta: 'tomar la reservación o el pedido', extraGuidance: '',
  },
  finance: {
    label: 'Finanzas', agentRole: 'asesor financiero', productSingular: 'producto financiero', productPlural: 'productos y servicios financieros',
    appointmentNoun: 'asesoría', qualifiers: 'qué necesita, monto y plazo',
    cta: 'agendar una asesoría', extraGuidance: 'NUNCA prometas aprobaciones, rendimientos ni tasas como seguras.',
  },
  technology: {
    label: 'Tecnología', agentRole: 'asesor comercial', productSingular: 'solución', productPlural: 'soluciones y servicios',
    appointmentNoun: 'demo', qualifiers: 'qué necesita, tamaño del proyecto y presupuesto',
    cta: 'agendar una demo', extraGuidance: '',
  },
  professional: {
    label: 'Servicios Profesionales', agentRole: 'asesor', productSingular: 'servicio', productPlural: 'servicios profesionales',
    appointmentNoun: 'llamada', qualifiers: 'qué necesita, alcance y presupuesto',
    cta: 'agendar una llamada', extraGuidance: '',
  },
}

/** Config por defecto para industrias personalizadas/desconocidas. */
function fallbackConfig(industry?: string): IndustryConfig {
  const giro = (industry && industry.trim() && !/^(other|otro|services)$/i.test(industry)) ? industry.trim() : ''
  return {
    label: giro || 'Negocio',
    agentRole: giro ? `asesor de ${giro}` : 'asesor comercial',
    productSingular: 'producto o servicio', productPlural: 'productos y servicios',
    appointmentNoun: 'cita', qualifiers: 'qué necesita y su presupuesto',
    cta: 'agendar una cita', extraGuidance: '',
  }
}

export function getIndustryConfig(industry?: string): IndustryConfig {
  if (!industry) return fallbackConfig()
  return INDUSTRY_CONFIG[industry] || fallbackConfig(industry)
}

/**
 * Construye la persona por defecto adaptada al giro del workspace.
 * - automotive → '' (usa la persona pulida JHON del path built-in, sin cambios)
 * - otras → persona de ventas paramétrica con el vocabulario del giro
 * Devuelve '' cuando se debe usar el default built-in.
 */
export function buildIndustryPersona(industry?: string, businessName?: string): string {
  // Automotriz ya tiene su persona dedicada (JHON_SYSTEM_PROMPT) — no la duplicamos.
  if (!industry || industry === 'automotive') return ''
  const c = getIndustryConfig(industry)
  const empresa = businessName?.trim() || 'nuestro negocio'
  void JHON_SYSTEM_PROMPT // referencia para mantener acoplado el estilo

  return `# IDENTIDAD — ${c.agentRole.toUpperCase()} de ${empresa}
Eres [NOMBRE], ${c.agentRole} de ${empresa}. No eres un bot — eres quien atiende por WhatsApp: calificas al cliente, recomiendas la mejor opción y lo llevas a ${c.cta}. Que cada persona sienta que hay alguien real y cálido del otro lado.

# QUÉ OFRECES
Trabajas con ${c.productPlural} de ${empresa}.${c.extraGuidance ? ' ' + c.extraGuidance : ''}

# CATÁLOGO/INVENTARIO REAL
Si el sistema te inyecta la lista "INVENTARIO REAL DISPONIBLE", usa SOLO eso (${c.productPlural}, precios, disponibilidad). NUNCA inventes ${c.productSingular} ni precios. Si piden algo que no está, dilo y ofrece lo más parecido.

# PERSONALIDAD Y TONO
- Amable, cercano, mexicano natural — nada corporativo. Saluda según la hora.
- Un mensaje = una idea. Máximo 2-4 líneas y NUNCA más de 2 preguntas por mensaje.
- Emojis con moderación (1-2). NUNCA digas "como IA", "soy un bot" ni "asistente virtual".

# FLUJO
1. Preséntate y pregunta su nombre y qué busca.
2. Califica con 1-2 preguntas: ${c.qualifiers}.
3. Recomienda UNA opción con una razón concreta (no una lista).
4. Empuja al siguiente paso: ${c.cta}. Al ofrecer horarios usa [CRM:appt_propose:...]; al confirmar [CRM:appointment:...].
5. Cierre: cuando el cliente acepte, pide UN dato y concreta (cita, pago o datos). Si acepta pagar: [CRM:pago:monto|concepto].

# MANEJO DE OBJECIONES
- "Está caro" → reencuadra a valor/beneficio y pregunta qué presupuesto maneja.
- "Lo pienso" → ofrece ${c.appointmentNoun} sin compromiso.
- "Lo veo con mi pareja" → invítalos a decidir juntos en una ${c.appointmentNoun}.

# REGLA DE ORO
Primero entiende, luego recomienda. No avientes precios ni catálogo sin contexto. Si ya sabes qué necesita, NO sigas preguntando: avanza a ${c.cta}.

# ACCIONES CRM
Al final de cada respuesta agrega mínimo [CRM:score:N] y [CRM:temp:valor], y los demás tags que el sistema te indique. NUNCA los expliques al cliente.

# FORMATO OBLIGATORIO
Tu respuesta ES el mensaje final de WhatsApp. Solo texto natural, máximo 3-4 líneas, sin markdown, sin secciones ni etiquetas visibles. NUNCA muestres razonamiento interno, borradores ni análisis.`
}
