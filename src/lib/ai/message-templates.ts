// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Message Templates
// Pre-built templates for common sales scenarios in Mexican Spanish
// Variables: {{nombre}}, {{producto}}, {{precio}}, {{negocio}}, etc.
// ═══════════════════════════════════════════════════════════════

export interface MessageTemplate {
  id: string
  name: string
  category: 'welcome' | 'followup' | 'appointment' | 'price' | 'testdrive' | 'demo' | 'closing' | 'reengagement' | 'promotion'
  description: string
  template: string
  variables: string[]
  timing?: string
}

// ─── Template Definitions ────────────────────────────────────

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // ── Welcome (New Lead) ──
  {
    id: 'welcome_new_lead',
    name: 'Bienvenida a Nuevo Lead',
    category: 'welcome',
    description: 'Primer mensaje cuando un lead nuevo escribe por primera vez',
    template: '{{saludo}} 👋 Soy {{vendedor}} de {{negocio}}. Me llegó tu mensaje y aquí ando para ayudarte. ¿Con quién tengo el gusto?',
    variables: ['saludo', 'vendedor', 'negocio'],
    timing: 'Inmediato al primer mensaje',
  },
  {
    id: 'welcome_after_hours',
    name: 'Bienvenida Fuera de Horario',
    category: 'welcome',
    description: 'Mensaje automático cuando el lead escribe fuera de horario',
    template: '¡Buenas noches! 😊 Gracias por escribir a {{negocio}}. En este momento estamos fuera de horario pero te contesto primero que amanezca. ¿Qué buscas? Te dejo anotado.',
    variables: ['negocio'],
    timing: 'Fuera de horario (9pm-8am)',
  },

  // ── Follow-up Messages ──
  {
    id: 'followup_3_days',
    name: 'Seguimiento Día 3',
    category: 'followup',
    description: 'Follow-up a los 3 días sin respuesta',
    template: 'Qué transa {{nombre}}? 👋 ¿Pudiste revisar la info del {{producto}}? Si tienes cualquier duda, aquí ando.',
    variables: ['nombre', 'producto'],
    timing: '3 días sin respuesta',
  },
  {
    id: 'followup_7_days',
    name: 'Seguimiento Día 7',
    category: 'followup',
    description: 'Follow-up a los 7 días con novedad',
    template: '¡Buenas! {{nombre}} te cuento que está entrando una nueva opción de {{producto}} y se me hizo que te puede interesar. ¿Sigues buscando?',
    variables: ['nombre', 'producto'],
    timing: '7 días sin respuesta',
  },
  {
    id: 'followup_15_days',
    name: 'Seguimiento Día 15',
    category: 'followup',
    description: 'Seguimiento con enfoque por arquetipo',
    template: 'Oye {{nombre}}! Te tengo una novedad: hay una promo de pago inicial bajo para {{producto}}. Solo aplica esta semana. ¿Te interesa o lo dejo pasar?',
    variables: ['nombre', 'producto'],
    timing: '15 días sin respuesta',
  },
  {
    id: 'followup_30_days',
    name: 'Seguimiento Día 30',
    category: 'followup',
    description: 'Re-engagement suave sin presión',
    template: '{{nombre}} no te escribo para presionar. Solo para saber si puedo ayudarte cuando estés listo 😊 ¿Aún te interesa {{producto}}?',
    variables: ['nombre', 'producto'],
    timing: '30 días sin respuesta',
  },
  {
    id: 'followup_60_days',
    name: 'Seguimiento Día 60',
    category: 'followup',
    description: 'Re-engagement con dato nuevo concreto',
    template: 'Qué onda {{nombre}}! Se acabaron las opciones {{año}} de {{producto}} y están entrando los nuevos. Los precios van a subir. ¿Sigue en tus planes?',
    variables: ['nombre', 'producto', 'año'],
    timing: '60 días sin respuesta',
  },

  // ── Appointment ──
  {
    id: 'appointment_confirmation',
    name: 'Confirmación de Cita',
    category: 'appointment',
    description: 'Confirmar cita agendada en negocio',
    template: 'Listo {{nombre}}! Te agendo para el {{dia}} a las {{hora}} en {{negocio}}. 📍 Dirección: {{direccion}}. ¿Confirmas o prefieres otro horario?',
    variables: ['nombre', 'dia', 'hora', 'negocio', 'direccion'],
    timing: 'Inmediato al agendar',
  },
  {
    id: 'appointment_reminder',
    name: 'Recordatorio de Cita',
    category: 'appointment',
    description: 'Recordatorio 1 día antes de la cita',
    template: 'Hola {{nombre}}! Solo te recuerdo que mañana tienes tu cita a las {{hora}} para conocer {{producto}}. Trae tu identificación 👍',
    variables: ['nombre', 'hora', 'producto'],
    timing: '1 día antes de la cita',
  },
  {
    id: 'appointment_day_of',
    name: 'Recordatorio Mismo Día',
    category: 'appointment',
    description: 'Recordatorio el día de la cita',
    template: '{{nombre}} tu cita es HOY a las {{hora}}! Estamos en {{negocio}}, pídeme en recepción. Nos vemos ahí 👋',
    variables: ['nombre', 'hora', 'negocio'],
    timing: '2 horas antes de la cita',
  },

  // ── Price Quote ──
  {
    id: 'price_quote_initial',
    name: 'Cotización Inicial',
    category: 'price',
    description: 'Enviar cotización con precio y condiciones',
    template: '{{nombre}}, te paso la cotización de {{producto}}:\n\n💰 Precio: {{precio}} MXN\n🤝 Pago inicial desde: {{inicial}}\n💳 {{pagos}} pagos mensuales\n\n¿Qué te parece? Si quieres agendar para conocerlo, lo arreglamos.',
    variables: ['nombre', 'producto', 'precio', 'inicial', 'pagos'],
  },
  {
    id: 'price_negotiation',
    name: 'Negociación de Precio',
    category: 'price',
    description: 'Manejar objeción de precio',
    template: 'Te entiendo {{nombre}}, es una inversión importante. Mira, con {{inicial}} de pago inicial y {{pagos}} pagos mensuales te quedan en {{cuota}} al mes. Es menos de lo que imaginas. ¿Hablamos de opciones?',
    variables: ['nombre', 'inicial', 'pagos', 'cuota'],
  },
  {
    id: 'price_special_offer',
    name: 'Oferta Especial',
    category: 'price',
    description: 'Presentar oferta especial o descuento',
    template: '{{nombre}} tengo algo para ti! 🎉 Por esta semana {{producto}} tiene un descuento de {{descuento}}. Precio normal {{precio}}, ahora en {{precio_oferta}}. Solo aplica con el pedido esta semana. ¿Lo quieres?',
    variables: ['nombre', 'producto', 'descuento', 'precio', 'precio_oferta'],
  },

  // ── Demostración ──
  {
    id: 'demo_invitation',
    name: 'Invitación a Demostración',
    category: 'demo',
    description: 'Invitar a demostración del producto/servicio',
    template: '{{nombre}} la mejor forma de saber si {{producto}} es para ti es conocerlo. ¿Qué dices si vienes y lo pruebas? Tenemos espacios disponibles para demostración. ¿Lunes o martes te queda mejor?',
    variables: ['nombre', 'producto'],
  },
  {
    id: 'demo_followup',
    name: 'Post Demostración',
    category: 'demo',
    description: 'Seguimiento después de la demostración',
    template: 'Qué onda {{nombre}}! ¿Qué te pareció {{producto}}? Me da que te gustó jaja. Si quieres que chequemos números o detalles, me avisas y lo armamos.',
    variables: ['nombre', 'producto'],
    timing: '2 horas después de la demostración',
  },

  // ── Closing / Thank You ──
  {
    id: 'closing_congrats',
    name: 'Felicitaciones Compra',
    category: 'closing',
    description: 'Mensaje de felicitaciones después de la compra',
    template: '¡Felicidades {{nombre}}! 🎉 Tu {{producto}} está en proceso. En breve te paso los datos de entrega. Gracias por confiar en {{negocio}}. ¡Disfrútalo mucho!',
    variables: ['nombre', 'producto', 'negocio'],
  },
  {
    id: 'closing_referral_request',
    name: 'Pedido de Referido',
    category: 'closing',
    description: 'Pedir referido después de la compra',
    template: '{{nombre}} me da gusto que ya estés disfrutando tu {{producto}}! Por si conoces a alguien que también esté buscando, me ayudas compartiendo mi contacto? Me llevo una comisión por referido jaja 😄',
    variables: ['nombre', 'producto'],
    timing: '7 días después de la compra',
  },

  // ── Re-engagement ──
  {
    id: 'reengagement_cold_lead',
    name: 'Re-engagement Lead Frío',
    category: 'reengagement',
    description: 'Reactivar un lead que no ha respondido en más de 30 días',
    template: 'Qué onda {{nombre}}! Sé que escribimos hace rato pero acaban de llegar nuevas opciones de {{producto}}. Cambiaron bastante de la última vez que platicamos. ¿Te cuento?',
    variables: ['nombre', 'producto'],
    timing: '30+ días sin respuesta',
  },
  {
    id: 'reengagement_lost_deal',
    name: 'Re-engagement Trato Perdido',
    category: 'reengagement',
    description: 'Intentar recuperar un trato que se perdió',
    template: '{{nombre}}! Sé que en su momento no pudimos cerrar pero las condiciones cambiaron. Hay nuevas opciones disponibles y tenemos precios ajustados. ¿Te interesa que te cuente?',
    variables: ['nombre'],
    timing: '60 días después de trato perdido',
  },

  // ── Promotions ──
  {
    id: 'promotion_weekend',
    name: 'Promoción de Fin de Semana',
    category: 'promotion',
    description: 'Promoción especial de fin de semana',
    template: '🔥 PROMO FIN DE SEMANA 🔥\n\n{{nombre}}! Este fin de semana en {{negocio}} tenemos:\n• {{producto}} desde {{precio}} MXN\n• Pago inicial desde {{inicial}}\n• {{pagos}} pagos mensuales\n\nSolo aplica viernes a domingo. ¿Te interesa que te aparte?',
    variables: ['nombre', 'negocio', 'producto', 'precio', 'inicial', 'pagos'],
    timing: 'Jueves por la tarde',
  },
  {
    id: 'promotion_month_end',
    name: 'Cierre de Mes',
    category: 'promotion',
    description: 'Urgencia de cierre de mes',
    template: '{{nombre}} te aviso rápido: este mes hay cuota y los precios cambian a partir del próximo. Si te interesa {{producto}}, ahorita es el mejor momento. ¿Lo checamos o lo dejo para después?',
    variables: ['nombre', 'producto'],
    timing: 'Últimos 3 días del mes',
  },
  {
    id: 'promotion_new_option',
    name: 'Llegada de Nueva Opción',
    category: 'promotion',
    description: 'Avisar de la llegada de una nueva opción',
    template: '{{nombre}}! Acaba de llegar {{producto}} {{año}} y está padre. Tiene {{caracteristicas}}. Los primeros en pedirse se llevan el mejor precio. ¿Quieres que te mande fotos?',
    variables: ['nombre', 'producto', 'año', 'caracteristicas'],
  },
]

// ─── Helper Functions ─────────────────────────────────────────

/**
 * Fill a template with the given variables.
 * Replaces {{variable}} placeholders with the provided values.
 */
export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

/**
 * Get templates by category.
 */
export function getTemplatesByCategory(category: MessageTemplate['category']): MessageTemplate[] {
  return MESSAGE_TEMPLATES.filter(t => t.category === category)
}

/**
 * Get a specific template by ID.
 */
export function getTemplateById(id: string): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find(t => t.id === id)
}

/**
 * Get appropriate greeting based on time of day.
 */
export function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Get a random casual greeting.
 */
export function getRandomGreeting(): string {
  const greetings = [
    'Qué onda',
    'Buen día',
    'Hola',
    'Qué transa',
    'Buenas',
    'Qué pasa',
  ]
  return greetings[Math.floor(Math.random() * greetings.length)]
}
