// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Pre-built Automation Templates
// 20 plantillas listas para cargar en cualquier workspace
// ═══════════════════════════════════════════════════════════════

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  category: 'whatsapp' | 'leads' | 'ventas' | 'servicio' | 'marketing'
  triggerType: string
  triggerConfig: Record<string, unknown>
  actions: Array<{ type: string; description: string; config?: Record<string, unknown> }>
  icon: string
}

export const automationTemplates: AutomationTemplate[] = [
  // ── WhatsApp (6) ──
  {
    id: 'tpl-whatsapp-1',
    name: 'Bienvenida WhatsApp Automática',
    description: 'Envía mensaje de bienvenida personalizado cuando un nuevo contacto escribe por primera vez por WhatsApp.',
    category: 'whatsapp',
    triggerType: 'message_received',
    triggerConfig: { condition: 'first_message = true', channel: 'whatsapp' },
    actions: [
      { type: 'send_message', description: 'Enviar mensaje de bienvenida', config: { template: 'Hola [NOMBRE], bienvenido a [AGENCIA]. En qué podemos ayudarte hoy?' } },
      { type: 'tag_contact', description: 'Etiquetar como "Nuevo Lead"', config: { tag: 'nuevo_lead' } },
      { type: 'notify_team', description: 'Notificar al equipo de ventas' },
    ],
    icon: 'message-square',
  },
  {
    id: 'tpl-whatsapp-2',
    name: 'Clasificador IA de Mensajes',
    description: 'Usa IA para clasificar cada mensaje entrante y asignar al agente correcto según la intención del cliente.',
    category: 'whatsapp',
    triggerType: 'message_received',
    triggerConfig: { condition: 'always', channel: 'whatsapp' },
    actions: [
      { type: 'ai_classify', description: 'Clasificar intención con IA', config: { model: 'groq', intents: ['cotizacion', 'agendar_cita', 'soporte', 'queja', 'otro'] } },
      { type: 'assign_agent', description: 'Asignar al agente según intención' },
      { type: 'update_lead_score', description: 'Actualizar score del lead' },
    ],
    icon: 'brain',
  },
  {
    id: 'tpl-whatsapp-3',
    name: 'Agendar Cita Automáticamente',
    description: 'Detecta cuando un cliente quiere agendar una cita y responde con opciones de disponibilidad.',
    category: 'whatsapp',
    triggerType: 'message_received',
    triggerConfig: { condition: 'intent = agendar_cita', channel: 'whatsapp' },
    actions: [
      { type: 'send_message', description: 'Responder con horarios disponibles', config: { template: 'Perfecto! Tenemos disponibilidad: 1) Lunes 10am 2) Miércoles 3pm 3) Viernes 11am. Cuál prefieres?' } },
      { type: 'create_deal', description: 'Crear deal en pipeline', config: { stage: 'cita_agendada', value: 0 } },
    ],
    icon: 'calendar',
  },
  {
    id: 'tpl-whatsapp-4',
    name: 'Cotización Rápida',
    description: 'Cuando un cliente pregunta por precios, envía la cotización del vehículo correspondiente.',
    category: 'whatsapp',
    triggerType: 'message_received',
    triggerConfig: { condition: 'intent = cotizacion', channel: 'whatsapp' },
    actions: [
      { type: 'send_message', description: 'Enviar cotización del vehículo', config: { template: '[COTIZACION_VEHICULO] - Precio de lista: $[PRECIO] - Oferta especial: $[PRECIO_OFERTA] - Enganche desde: $[ENGANCHE] - Mensualidad desde: $[MENSUALIDAD]' } },
      { type: 'tag_contact', description: 'Etiquetar como "Interesado en precio"', config: { tag: 'precio_solicitado' } },
      { type: 'update_lead_score', description: 'Subir score a 75+', config: { score: 75 } },
    ],
    icon: 'dollar-sign',
  },
  {
    id: 'tpl-whatsapp-5',
    name: 'Seguimiento Post-Visita',
    description: 'Envía mensaje de seguimiento 2 horas después de una visita agendada al showroom.',
    category: 'whatsapp',
    triggerType: 'schedule',
    triggerConfig: { condition: 'after_visit', delay_hours: 2 },
    actions: [
      { type: 'send_message', description: 'Enviar seguimiento post-visita', config: { template: 'Hola [NOMBRE], esperamos que tu visita a [AGENCIA] haya sido excelente. Te gustó el [VEHICULO]? Podemos agendarte una prueba de manejo.' } },
      { type: 'update_lead_score', description: 'Actualizar score según respuesta' },
    ],
    icon: 'phone-call',
  },
  {
    id: 'tpl-whatsapp-6',
    name: 'Soporte 24/7 con IA',
    description: 'Responde automáticamente preguntas frecuentes fuera de horario usando IA.',
    category: 'whatsapp',
    triggerType: 'message_received',
    triggerConfig: { condition: 'outside_business_hours', channel: 'whatsapp' },
    actions: [
      { type: 'ai_respond', description: 'Responder con IA usando FAQ', config: { model: 'groq', personality: 'friendly', max_tokens: 200 } },
      { type: 'tag_contact', description: 'Etiquetar como "Fuera de horario"', config: { tag: 'after_hours' } },
      { type: 'create_task', description: 'Crear tarea de seguimiento para mañana' },
    ],
    icon: 'bot',
  },

  // ── Leads (4) ──
  {
    id: 'tpl-leads-1',
    name: 'Lead Scoring Automático',
    description: 'Calcula y actualiza el score de cada lead basándose en sus interacciones, mensajes y comportamiento.',
    category: 'leads',
    triggerType: 'event',
    triggerConfig: { condition: 'interaction_detected' },
    actions: [
      { type: 'calculate_score', description: 'Calcular score basado en interacciones', config: { factors: ['messages_sent', 'visits', 'quotes_requested', 'appointments'] } },
      { type: 'tag_contact', description: 'Etiquetar según score', config: { rules: [{ min: 80, tag: 'hot_lead' }, { min: 50, tag: 'warm_lead' }, { min: 20, tag: 'cold_lead' }] } },
    ],
    icon: 'target',
  },
  {
    id: 'tpl-leads-2',
    name: 'Reactivación de Leads Fríos',
    description: 'Envía mensaje de reactivación a leads que no han interactuado en 7+ días.',
    category: 'leads',
    triggerType: 'schedule',
    triggerConfig: { condition: 'no_interaction_days >= 7' },
    actions: [
      { type: 'send_message', description: 'Enviar mensaje de reactivación', config: { template: 'Hola [NOMBRE], sabemos que estás buscando el vehículo ideal. Tenemos nuevas llegadas que pueden interesarte. Te cuento?' } },
      { type: 'update_lead_score', description: 'Marcar como reactivado' },
    ],
    icon: 'refresh-cw',
  },
  {
    id: 'tpl-leads-3',
    name: 'Asignar por Región',
    description: 'Asigna automáticamente leads a vendedores según su zona geográfica o código postal.',
    category: 'leads',
    triggerType: 'event',
    triggerConfig: { condition: 'new_lead_created' },
    actions: [
      { type: 'detect_region', description: 'Detectar región del lead', config: { method: 'zip_code' } },
      { type: 'assign_agent', description: 'Asignar al agente de la región', config: { rules: [{ region: 'norte', agent: 'agente_norte' }, { region: 'sur', agent: 'agente_sur' }] } },
      { type: 'notify_team', description: 'Notificar al agente asignado' },
    ],
    icon: 'map-pin',
  },
  {
    id: 'tpl-leads-4',
    name: 'Detectar Leads Duplicados',
    description: 'Detecta y fusiona automáticamente leads duplicados basándose en teléfono o email.',
    category: 'leads',
    triggerType: 'event',
    triggerConfig: { condition: 'new_contact_created' },
    actions: [
      { type: 'detect_duplicate', description: 'Buscar duplicados por teléfono/email' },
      { type: 'merge_contacts', description: 'Fusionar si encuentra duplicado', config: { strategy: 'keep_latest' } },
      { type: 'notify_team', description: 'Notificar al equipo sobre fusión' },
    ],
    icon: 'copy',
  },

  // ── Ventas (4) ──
  {
    id: 'tpl-ventas-1',
    name: 'Notificación de Nuevo Deal',
    description: 'Notifica al equipo de ventas cuando se crea un nuevo deal en el pipeline.',
    category: 'ventas',
    triggerType: 'event',
    triggerConfig: { condition: 'deal_created' },
    actions: [
      { type: 'notify_team', description: 'Notificar a todos los vendedores', config: { message: 'Nuevo deal creado: [DEAL_NAME] por $[VALUE]' } },
      { type: 'assign_agent', description: 'Asignar al vendedor disponible' },
    ],
    icon: 'bell',
  },
  {
    id: 'tpl-ventas-2',
    name: 'Recordatorio de Cotización Pendiente',
    description: 'Envía recordatorio al cliente si no ha respondido a una cotización en 48 horas.',
    category: 'ventas',
    triggerType: 'schedule',
    triggerConfig: { condition: 'quote_no_response_hours >= 48' },
    actions: [
      { type: 'send_message', description: 'Enviar recordatorio de cotización', config: { template: 'Hola [NOMBRE], te enviamos la cotización del [VEHICULO] hace unos días. Quisiera saber si la pudiste revisar. Puedo resolver cualquier duda.' } },
      { type: 'tag_contact', description: 'Etiquetar como "Follow-up pendiente"', config: { tag: 'followup_pending' } },
    ],
    icon: 'clock',
  },
  {
    id: 'tpl-ventas-3',
    name: 'Alerta de Deal Estancado',
    description: 'Notifica al gerente cuando un deal lleva más de 5 días sin movimiento en el pipeline.',
    category: 'ventas',
    triggerType: 'schedule',
    triggerConfig: { condition: 'deal_stalled_days >= 5' },
    actions: [
      { type: 'notify_team', description: 'Alertar al gerente de ventas', config: { priority: 'high', message: 'Deal estancado: [DEAL_NAME] - sin actividad por 5+ días' } },
      { type: 'tag_contact', description: 'Etiquetar como "En riesgo"', config: { tag: 'at_risk' } },
    ],
    icon: 'alert-triangle',
  },
  {
    id: 'tpl-ventas-4',
    name: 'Celebración de Cierre',
    description: 'Envía mensaje de felicitación y solicitud de referidos cuando se cierra un deal.',
    category: 'ventas',
    triggerType: 'deal_stage_change',
    triggerConfig: { condition: 'new_stage = ganado' },
    actions: [
      { type: 'send_message', description: 'Felicitación al cliente', config: { template: 'Felicidades [NOMBRE]! Tu [VEHICULO] está listo. Gracias por confiar en [AGENCIA]. Si conoces a alguien que busque auto, refiérenos y ambos ganamos.' } },
      { type: 'notify_team', description: 'Notificar cierre al equipo' },
      { type: 'tag_contact', description: 'Etiquetar como "Cliente"', config: { tag: 'cliente' } },
    ],
    icon: 'trophy',
  },

  // ── Servicio (3) ──
  {
    id: 'tpl-servicio-1',
    name: 'Encuesta de Satisfacción',
    description: 'Envía encuesta de satisfacción 24 horas después de una compra o servicio.',
    category: 'servicio',
    triggerType: 'schedule',
    triggerConfig: { condition: 'after_purchase_hours = 24' },
    actions: [
      { type: 'send_message', description: 'Enviar encuesta de satisfacción', config: { template: 'Hola [NOMBRE], gracias por tu compra en [AGENCIA]. Del 1 al 10, qué tan satisfecho estás con tu experiencia? Tu opinión nos ayuda a mejorar.' } },
      { type: 'tag_contact', description: 'Marcar como "Encuesta enviada"', config: { tag: 'survey_sent' } },
    ],
    icon: 'star',
  },
  {
    id: 'tpl-servicio-2',
    name: 'Recordatorio de Servicio',
    description: 'Envía recordatorio de servicio preventivo basándose en el kilometraje o tiempo desde el último servicio.',
    category: 'servicio',
    triggerType: 'schedule',
    triggerConfig: { condition: 'service_due_date_reached' },
    actions: [
      { type: 'send_message', description: 'Recordatorio de servicio', config: { template: 'Hola [NOMBRE], tu [VEHICULO] está próximo a su servicio preventivo. Agéndalo con nosotros y recibe 10% de descuento en refacciones.' } },
      { type: 'create_task', description: 'Crear tarea de seguimiento' },
    ],
    icon: 'wrench',
  },
  {
    id: 'tpl-servicio-3',
    name: 'FAQ Automático',
    description: 'Responde automáticamente a las preguntas más frecuentes sobre servicios, garantías y horarios.',
    category: 'servicio',
    triggerType: 'message_received',
    triggerConfig: { condition: 'intent = faq', channel: 'whatsapp' },
    actions: [
      { type: 'ai_respond', description: 'Responder FAQ con IA', config: { model: 'groq', knowledge_base: 'faq_servicio' } },
      { type: 'tag_contact', description: 'Etiquetar como "Consulta FAQ"', config: { tag: 'faq_query' } },
    ],
    icon: 'help-circle',
  },

  // ── Marketing (3) ──
  {
    id: 'tpl-marketing-1',
    name: 'Feliz Cumpleaños',
    description: 'Envía mensaje de felicitación de cumpleaños con oferta especial.',
    category: 'marketing',
    triggerType: 'schedule',
    triggerConfig: { condition: 'contact_birthday_today' },
    actions: [
      { type: 'send_message', description: 'Felicitación de cumpleaños', config: { template: 'Feliz cumpleaños [NOMBRE]! Para celebrar contigo, te ofrecemos 15% de descuento en tu próximo servicio. Válido por 30 días.' } },
      { type: 'tag_contact', description: 'Marcar como "Birthday 2026"', config: { tag: 'birthday_2026' } },
    ],
    icon: 'cake',
  },
  {
    id: 'tpl-marketing-2',
    name: 'Promoción Mensual',
    description: 'Envía promoción del mes a todos los leads calientes con vehículos disponibles.',
    category: 'marketing',
    triggerType: 'schedule',
    triggerConfig: { condition: 'monthly_promo_day = 1' },
    actions: [
      { type: 'send_campaign', description: 'Enviar campaña a leads calientes', config: { filter: 'lead_score >= 60', template: '[PROMO DEL MES] - Financiamiento desde 0% enganche. Vehículos desde $[PRECIO_MIN]. Visítanos en [AGENCIA].' } },
      { type: 'notify_team', description: 'Reporte de envíos realizados' },
    ],
    icon: 'megaphone',
  },
  {
    id: 'tpl-marketing-3',
    name: 'Recordatorio Tenencia/Seguro',
    description: 'Envía recordatorio de tenencia y seguro antes de la fecha de vencimiento.',
    category: 'marketing',
    triggerType: 'schedule',
    triggerConfig: { condition: 'tenencia_due_days <= 30' },
    actions: [
      { type: 'send_message', description: 'Recordatorio de tenencia/seguro', config: { template: 'Hola [NOMBRE], te recordamos que la tenencia de tu [VEHICULO] vence pronto. Podemos ayudarte con el trámite. Contáctanos.' } },
      { type: 'create_task', description: 'Crear tarea de seguimiento' },
    ],
    icon: 'file-text',
  },
]

export const templateCategories = [
  { id: 'whatsapp', name: 'WhatsApp', icon: 'message-square', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'leads', name: 'Leads', icon: 'target', color: 'bg-blue-100 text-blue-700' },
  { id: 'ventas', name: 'Ventas', icon: 'dollar-sign', color: 'bg-amber-100 text-amber-700' },
  { id: 'servicio', name: 'Servicio', icon: 'wrench', color: 'bg-purple-100 text-purple-700' },
  { id: 'marketing', name: 'Marketing', icon: 'megaphone', color: 'bg-pink-100 text-pink-700' },
]
