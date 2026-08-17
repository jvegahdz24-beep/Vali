// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Dynamic Context Builder
// Inyecta contexto del negocio del usuario en el prompt sin
// modificar el prompt maestro. Separación: LÓGICA | CONFIG | DATOS
// ═══════════════════════════════════════════════════════════════

/**
 * Settings del workspace que contienen la configuración del negocio.
 * Se lee de workspace.settings (JSON) en la DB.
 */
export interface BusinessContext {
  businessType?: string      // Tipo de negocio: "clínica dental", "restaurante", "taller mecánico"
  offer?: string             // Qué vende: "servicios dentales", "comida italiana", "reparación de autos"
  avgTicket?: string         // Ticket promedio: "$2,000 MXN", "$500 MXN", "$3,000 MXN"
  leadSource?: string        // Canal principal: "redes sociales", "Google", "referidos", "WhatsApp"
  goal?: string              // Objetivo: "generar ventas", "agendar citas", "cerrar contratos"
  businessAddress?: string   // Dirección física: "Av. Insurgentes 123, Col. Roma, CDMX"
  businessPhone?: string     // Teléfono de contacto: "+52 55 1234 5678"
  businessHours?: string     // Horario de atención: "Lun–Vie 9am–6pm, Sáb 10am–2pm"
  appointmentUrl?: string    // Liga para agendar cita: "https://calendly.com/minegocio"
}

/**
 * Valores por defecto seguros — NUNCA deja el contexto vacío.
 */
const DEFAULTS: Required<BusinessContext> = {
  businessType: 'negocio local',
  offer: 'servicios',
  avgTicket: 'no especificado',
  leadSource: 'redes sociales',
  goal: 'generar ventas',
  businessAddress: '',
  businessPhone: '',
  businessHours: '',
  appointmentUrl: '',
}

/**
 * Construye el bloque de contexto dinámico que se inyecta ANTES del prompt maestro.
 *
 * Uso:
 *   const context = buildDynamicContext(workspace.settings)
 *   const systemPrompt = `${context}\n\n${MASTER_PROMPT}`
 *
 * Reglas:
 *   - Siempre retorna un string válido (nunca vacío, nunca null)
 *   - Usa defaults si faltan campos
 *   - No modifica el prompt maestro
 *   - Se inyecta UNA SOLA VEZ, arriba del todo
 */
export function buildDynamicContext(settings: Record<string, unknown> | null | undefined): string {
  const s = (settings || {}) as BusinessContext

  const businessType = s.businessType || DEFAULTS.businessType
  const offer = s.offer || DEFAULTS.offer
  const avgTicket = s.avgTicket || DEFAULTS.avgTicket
  const leadSource = s.leadSource || DEFAULTS.leadSource
  const goal = s.goal || DEFAULTS.goal
  const businessAddress = s.businessAddress || ''
  const businessPhone = s.businessPhone || ''
  const businessHours = s.businessHours || ''
  const appointmentUrl = s.appointmentUrl || ''

  const contactLines: string[] = []
  if (businessAddress) contactLines.push(`- Dirección: ${businessAddress}`)
  if (businessPhone) contactLines.push(`- Teléfono: ${businessPhone}`)
  if (businessHours) contactLines.push(`- Horario: ${businessHours}`)
  if (appointmentUrl) contactLines.push(`- Agendar cita: ${appointmentUrl}`)

  const contactBlock = contactLines.length > 0
    ? `\n${contactLines.join('\n')}`
    : ''

  return `INFORMACIÓN DEL NEGOCIO:

- Tipo de negocio: ${businessType}
- Qué vende: ${offer}
- Ticket promedio: ${avgTicket}
- Canal principal: ${leadSource}
- Objetivo: ${goal}${contactBlock}

INSTRUCCIONES DE ADAPTACIÓN:

Adapta toda la conversación a este contexto.
Habla como experto en este tipo de negocio.
Usa ejemplos, analogías y cierres relevantes a esta industria.
${contactLines.length > 0 ? 'Cuando el cliente pregunte por dirección, teléfono, horario o citas, usa los datos de arriba — NUNCA inventes ni uses placeholders.' : ''}
No cambies la estructura de ventas.
No rompas la lógica de diagnóstico → problema → solución → cierre.`
}
