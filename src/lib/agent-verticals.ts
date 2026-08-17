// Clasificación de verticales del Agent Factory — pura y client-safe (sin db).
// "Conversacional/En vivo": el agente atiende mensajes entrantes de WhatsApp y
// toma el control de la respuesta. El resto son agentes de back-office que aún
// NO tienen runtime (no se ejecutan automáticamente) → "Próximamente".

export const CONVERSATIONAL_VERTICALS = new Set<string>([
  'ventas', 'seguimiento', 'seguros', 'financiamiento', 'precalificacion',
  'cotizador', 'planes-pago', 'recordatorio-pagos', 'soporte', 'logistica',
  'inventario', 'cross-selling', 'lead-recovery',
])

/** ¿El vertical atiende mensajes entrantes (es "En vivo") o es back-office? */
export function isConversationalVertical(vertical: string): boolean {
  return CONVERSATIONAL_VERTICALS.has((vertical || '').toLowerCase())
}
