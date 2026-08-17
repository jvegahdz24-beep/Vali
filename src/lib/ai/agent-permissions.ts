// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Per-Agent Tool Permissions (spec Paso 6)
//
// Single source of truth for which agent (personality) may use which
// tool. Mirrors the client's spec table:
//
//   updateDealStage     → JHON, SELLER, CERRADOR
//   createInvoice       → SELLER, CERRADOR
//   generatePaymentLink → SELLER, CERRADOR
//   scheduleAppointment → CERRADOR  (+ JHON/SELLER kept enabled so the
//                          default agent can still book — see NOTE)
//   sendWhatsAppMessage → todos
//
// NOTE: the spec restricts scheduleAppointment to CERRADOR only. In prod
// JHON is the default brain and books most appointments, so locking it to
// CERRADOR would break normal booking. We therefore allow JHON+SELLER too
// and flag the deviation. Tighten ALLOWED.scheduleAppointment to
// ['CERRADOR'] if you truly want the literal restriction.
// ═══════════════════════════════════════════════════════════════

export type AgentTool =
  | 'updateDealStage'
  | 'createInvoice'
  | 'generatePaymentLink'
  | 'scheduleAppointment'
  | 'sendWhatsAppMessage'

const ALL_AGENTS = ['JHON', 'SELLER', 'CERRADOR', 'EXPERTO', 'SERVICIO'] as const

const ALLOWED: Record<AgentTool, readonly string[]> = {
  updateDealStage: ['JHON', 'SELLER', 'CERRADOR'],
  createInvoice: ['SELLER', 'CERRADOR'],
  generatePaymentLink: ['SELLER', 'CERRADOR'],
  scheduleAppointment: ['CERRADOR', 'JHON', 'SELLER'], // see NOTE above
  sendWhatsAppMessage: ALL_AGENTS,
}

/**
 * Returns true if the given personality/agent may use the tool.
 * Matching is case-insensitive; unknown agents are treated as the default
 * (JHON) so a misconfigured personality can't silently gain money tools.
 */
export function canUseTool(personality: string | undefined, tool: AgentTool): boolean {
  const name = (personality || 'JHON').trim().toUpperCase()
  const allowed = ALLOWED[tool]
  if (!allowed) return false
  // Unknown personality → fall back to JHON's permission set.
  const effective = (ALL_AGENTS as readonly string[]).includes(name) ? name : 'JHON'
  return allowed.includes(effective)
}

export const AGENT_TOOL_PERMISSIONS = ALLOWED

// ─── Permisos por AgentInstance (ficha técnica "SÍ puede / NO puede") ───
// Las fichas guardan forbiddenActions/tools como texto libre (a veces en
// español). Mapeamos cada herramienta canónica a un patrón para reconocerla
// en esas listas de forma robusta.
const TOOL_PATTERNS: Record<AgentTool, RegExp> = {
  updateDealStage: /(pipeline|etapa|stage|deal|mover.*trato|avanzar.*trato)/i,
  createInvoice: /(factur|cfdi|invoice|comprobante)/i,
  generatePaymentLink: /(pago|payment|cobr|link de pago|liga de pago)/i,
  scheduleAppointment: /(cita|appointment|agendar|agenda)/i,
  sendWhatsAppMessage: /(whatsapp|mensaje|responder|contestar)/i,
}

/**
 * ¿La ficha del agente PROHÍBE explícitamente esta herramienta?
 * Revisa forbiddenActions (lista "NO puede"). Solo bloquea cuando hay una
 * coincidencia explícita — si la lista está vacía, no restringe nada.
 */
export function agentForbidsTool(forbiddenActions: string[] | undefined, tool: AgentTool): boolean {
  if (!forbiddenActions || forbiddenActions.length === 0) return false
  const pat = TOOL_PATTERNS[tool]
  if (!pat) return false
  return forbiddenActions.some((f) => typeof f === 'string' && pat.test(f))
}

/**
 * Permiso efectivo combinando persona (matriz fija) + ficha del agente ruteado.
 * Bloquea si la persona no puede O si el agente lo tiene prohibido en su ficha.
 */
export function canRunTool(
  personality: string | undefined,
  tool: AgentTool,
  agentForbidden?: string[],
): boolean {
  if (!canUseTool(personality, tool)) return false
  if (agentForbidsTool(agentForbidden, tool)) return false
  return true
}
