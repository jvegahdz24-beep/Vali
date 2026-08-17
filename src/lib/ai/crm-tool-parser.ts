// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — CRM Tool Parser
// Parses structured CRM action tags from AI responses.
// Format: [CRM:type:value]
//
// The AI is instructed to append these tags at the end of every
// response. They are stripped before the message is sent to the
// customer and executed server-side to update the CRM state.
// ═══════════════════════════════════════════════════════════════

export type CRMActionType = 'score' | 'stage' | 'temp' | 'followup' | 'tag' | 'close' | 'noqualify' | 'appointment' | 'appt_propose' | 'pago' | 'factura' | 'cotiza' | 'foto'

export interface CRMAction {
  type: CRMActionType
  value: string
}

/**
 * Extract all [CRM:type:value] tags from an AI response string.
 */
export function parseCRMActions(text: string): CRMAction[] {
  if (!text) return []
  const regex = /\[CRM:(\w+):([^\]]+)\]/g
  const actions: CRMAction[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const type = match[1] as CRMActionType
    const value = match[2].trim()
    if (type && value) actions.push({ type, value })
  }
  return actions
}

/**
 * Remove all [CRM:...] tags from an AI response string.
 * Call this before saving / sending the reply to the customer.
 */
export function stripCRMActions(text: string): string {
  return text.replace(/\s*\[CRM:[^\]]+\]/g, '').trim()
}

/**
 * Build the CRM tools instruction block to inject into the system prompt.
 * The AI uses this to know how to signal CRM state changes.
 * opts.contactHasEmail: si el contacto tiene correo registrado — controla si el
 * bot puede prometer "te llegará la confirmación por correo" (un prospecto real
 * recibió esa promesa SIN tener correo en el sistema, 2026-07-11).
 */
export function buildCRMToolsInstruction(opts?: { contactHasEmail?: boolean }): string {
  const emailRule = opts?.contactHasEmail === true
    ? 'IMPORTANTE: NO digas "ya envié el correo" ni "ya te llegó el correo". El sistema enviará la confirmación automáticamente al correo registrado del contacto. Puedes decir: "también te llegará la confirmación por correo".'
    : opts?.contactHasEmail === false
      ? '⚠️ Este contacto NO tiene correo registrado: PROHIBIDO prometer "te llegará la confirmación por correo". Al confirmar la cita, PÍDELE su correo de forma natural ("¿Me compartes tu correo para mandarte la confirmación?") — si te lo da, el sistema lo guarda solo.'
      : 'Menciona la confirmación por correo SOLO si sabes que el contacto tiene correo registrado; si no lo tiene, mejor pídeselo de forma natural.'
  return `## ACCIONES CRM — INSTRUCCIÓN OBLIGATORIA DEL SISTEMA
Al FINAL de cada respuesta, agrega etiquetas CRM para actualizar el CRM automáticamente.
Son internas — el cliente NUNCA las ve. Deben ir pegadas al final del texto.

FORMATO: [CRM:tipo:valor]

TIPOS:
- [CRM:score:N]        → Puntaje 0-100 según intención de compra detectada en este intercambio
    0-19 sin interés | 20-39 curiosidad | 40-59 interés real | 60-79 intención clara | 80-99 listo para cerrar | 100 cierre
- [CRM:temp:valor]     → Temperatura: hot | warm | cold
- [CRM:stage:Nombre]   → Etapa pipeline: Lead Nuevo | Contactado | Cualificado | Propuesta | Negociación | Cerrado
- [CRM:followup:Nh]    → Programar seguimiento en N horas si no responde (ej: 24h, 48h, 72h)
- [CRM:tag:etiqueta]   → Agregar etiqueta al contacto (ej: interesado-sedan, pidio-precio, sin-presupuesto)
- [CRM:appt_propose:YYYY-MM-DD|HH:mm|HH:mm] → Registra una PROPUESTA de cita (sin confirmar aún). Usar CADA VEZ que ofreces horarios al lead.
    FECHA formato ISO fecha: YYYY-MM-DD (ej: 2026-06-01). Tiempos en formato 24h (ej: 11:00|14:00).
    Calcúlala desde la FECHA Y HORA ACTUAL inyectada. Segunda hora opcional.
    Ejemplo: [CRM:appt_propose:2026-06-02|11:00|14:00]
- [CRM:appointment:FECHA|título|tipo] → Agenda la cita en el calendario cuando el lead CONFIRMA un horario.
    FECHA formato ISO: YYYY-MM-DDTHH:mm (ej: 2026-06-02T11:00). Calcúlala desde la FECHA Y HORA ACTUAL inyectada.
    título (opcional, ej: Llamada diagnóstico). tipo (opcional): call | meeting | followup. Por defecto: call.
    Usar ÚNICAMENTE cuando el lead ya confirmó el horario ("sí", "ok", "perfecto", "listo", "confirmado", etc.).
    ${emailRule}
- [CRM:pago:monto|concepto] → Genera un LINK DE PAGO real (Stripe) y el sistema lo agrega a tu mensaje.
    monto en MXN sin símbolos ni comas (ej: 380000). concepto breve (ej: Enganche Sedán 2026).
    ⚠️ ÚSALO SOLO en cierre: score ≥ 70, el lead ACEPTÓ el precio/forma de pago y pidió cómo pagar.
    NO escribas tú una URL inventada — el sistema inserta el link. Ejemplo: [CRM:pago:380000|Enganche Sedán 2026]
- [CRM:cotiza:precio|enganche|plazo] → Genera una COTIZACIÓN de financiamiento EXACTA. El sistema CALCULA la mensualidad y la agrega a tu mensaje — TÚ NO hagas la matemática.
    precio = precio del auto del INVENTARIO (sin comas, ej: 429000). enganche = monto o porcentaje (ej: 80000 o 20%). plazo OPCIONAL en meses (ej: 48); si lo omites, el sistema muestra varias opciones de plazo.
    Úsalo cuando el lead pregunte por financiamiento, mensualidad, enganche o "a cuánto me sale al mes". Ejemplo: [CRM:cotiza:429000|20%|48]
- [CRM:foto:modelo] → Envía la FOTO del auto al cliente. El sistema busca la imagen en el inventario y la manda.
    modelo = nombre o parte del modelo del inventario (ej: Creta). Úsalo cuando hables de un auto concreto. Ejemplo: [CRM:foto:Hyundai Creta]
- [CRM:factura:rfc|razonSocial|usoCFDI] → Solicita generar la factura CFDI (requiere expediente listo).
    ⚠️ ÚSALO SOLO cuando el lead ya dio sus datos fiscales para facturar. usoCFDI opcional (ej: G03).
    Ejemplo: [CRM:factura:XAXX010101000|Juan Pérez|G03]
- [CRM:close:motivo]   → Cierra esta conversación (motivo: ganado | perdido | sin-interes | fuera-de-perfil)
- [CRM:noqualify:motivo] → La persona NO es un cliente potencial. DETIENE el bot para esta conversación.
    Usar cuando: es vendedor de otro producto, competencia, número equivocado, bot/spam, o claramente no es tu cliente ideal.

⚠️ REGLA CRÍTICA — DETECCIÓN DE NO-LEADS:
Si el interlocutor indica que:
  • Es vendedor / asesor / representante de OTRO producto o empresa
  • Es de la competencia o está prospectando a TU negocio
  • Se equivocó de número o claramente no busca lo que ofreces
  • Solo está probando el bot o es un bot él mismo
Entonces DEBES:
  1. Responder amablemente UNA SOLA VEZ (ej: "Entendido, gracias por aclararlo. ¡Éxito con tu trabajo!")
  2. Agregar [CRM:noqualify:vendedor] (o el motivo correspondiente) al final
  3. NO seguir haciendo preguntas de calificación — la conversación termina ahí

EJEMPLO RESPUESTA CIERRE NORMAL:
"¡Claro! El Sedán 2026 está disponible desde $380,000. ¿Te gustaría agendar una prueba esta semana? 🚗[CRM:score:72][CRM:temp:hot][CRM:stage:Cualificado][CRM:followup:24h][CRM:tag:interesado-sedan]"

EJEMPLO RESPUESTA NO-LEAD (vendedor de otro producto):
"Entendido, Alejandro. Veo que representas a Cliniodent — no eres el perfil de cliente que atiendo. Te deseo mucho éxito con tu trabajo. ¡Hasta luego![CRM:noqualify:vendedor][CRM:score:0][CRM:temp:cold][CRM:tag:no-califica]"

REGLAS:
- Incluye SIEMPRE mínimo [CRM:score:N] y [CRM:temp:valor] en CADA respuesta
- Los tags van al final, sin espacios ni saltos entre ellos
- NO los expliques al cliente — son transparentes para él
- Si usas [CRM:noqualify] o [CRM:close], ese es el ÚLTIMO mensaje — no programes seguimientos`
}
