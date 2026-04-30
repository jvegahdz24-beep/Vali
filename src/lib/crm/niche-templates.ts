// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Niche Template System (Automatizaciones por Nicho)
// Pre-built templates for different industries
// Applies system prompts, pipeline stages, follow-up rules
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────

export interface NicheTemplate {
  id: string
  name: string
  industry: string
  description: string
  systemPrompt: string
  scoringRules: {
    highValueSignals: string[]
    negativeSignals: string[]
  }
  followUpTemplates: {
    triggerType: string
    name: string
    messageTemplate: string
    delayHours: number
  }[]
  pipelineStages: {
    name: string
    color: string
    order: number
    probability: number
    isWon: boolean
    isLost: boolean
  }[]
}

// ─── Built-in Templates ──────────────────────────────────────

const TEMPLATES: NicheTemplate[] = [
  // 1. AUTOMOTRIZ ──────────────────────────────────────────
  {
    id: 'automotriz',
    name: 'Automotriz — Agencia de Autos',
    industry: 'automotriz',
    description: 'Optimizado para agencias automotrices. Venta de vehículos nuevos y usados, financiamiento, seguros y servicio.',
    systemPrompt: `Eres JHON, el asistente virtual de ventas de la agencia automotriz. Tu objetivo es calificar leads, agendar visitas al showroom y cerrar ventas.

REGLAS:
- Sé amigable pero profesional, usa un tono entusiasta
- Pregunta por modelo de interés, presupuesto y forma de pago (contado/financiamiento)
- Ofrece agendar prueba de manejo o visita al showroom
- Menciona financiamiento disponible y seguros
- Nunca des precios exactos sin confirmar con el asesor
- Si el lead está caliente (score >= 70), sugiere agendar llamada con ejecutivo
- Usa emojis moderadamente para mantener tono cercano

FLUJO IDEAL:
1. Saludo + pregunta vehículo de interés
2. Calificar presupuesto y forma de pago
3. Presentar opciones disponibles
4. Agendar prueba de manejo / visita showroom
5. Seguimiento post-visita
6. Cierre o re-agendamiento`,
    scoringRules: {
      highValueSignals: ['precio', 'financiamiento', 'prueba de manejo', 'visita', 'seguro', 'modelo', 'agendar', 'interesado', 'comprar'],
      negativeSignals: ['no thanks', 'no me interesa', 'solo estoy viendo', 'ya compré', 'spam'],
    },
    followUpTemplates: [
      { triggerType: 'inactivity', name: 'Recordatorio 24h', messageTemplate: 'Hola {{firstName}}, vi que estabas interesado(a) en un vehículo. ¿Sigues buscando? Tenemos nuevas llegadas que podrían interesarte. 🚗', delayHours: 24 },
      { triggerType: 'inactivity', name: 'Recordatorio 3 días', messageTemplate: 'Hola {{firstName}}, queremos asegurarnos de encontrar el auto perfecto para ti. ¿Tienes alguna pregunta sobre modelos o financiamiento?', delayHours: 72 },
      { triggerType: 'scheduled', name: 'Post-prueba de manejo', messageTemplate: 'Hola {{firstName}}, ¡gracias por tu visita! ¿Qué te pareció el {{vehicle}}? Estamos aquí para resolver cualquier duda.', delayHours: 4 },
    ],
    pipelineStages: [
      { name: 'Lead Nuevo', color: '#94a3b8', order: 0, probability: 10, isWon: false, isLost: false },
      { name: 'Contactado', color: '#60a5fa', order: 1, probability: 20, isWon: false, isLost: false },
      { name: 'Cualificado', color: '#fbbf24', order: 2, probability: 40, isWon: false, isLost: false },
      { name: 'Prueba Agendada', color: '#a78bfa', order: 3, probability: 50, isWon: false, isLost: false },
      { name: 'Propuesta', color: '#fb923c', order: 4, probability: 60, isWon: false, isLost: false },
      { name: 'Negociación', color: '#f87171', order: 5, probability: 75, isWon: false, isLost: false },
      { name: 'Cerrado Ganado', color: '#4ade80', order: 6, probability: 100, isWon: true, isLost: false },
      { name: 'Cerrado Perdido', color: '#9ca3af', order: 7, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 2. INMOBILIARIA ────────────────────────────────────────
  {
    id: 'inmobiliaria',
    name: 'Inmobiliaria — Bienes Raíces',
    industry: 'inmobiliaria',
    description: 'Para agencias inmobiliarias. Propiedades en venta y renta, visitas, ofertas, créditos hipotecarios.',
    systemPrompt: `Eres JHON, asistente virtual de la agencia inmobiliaria. Ayudas a clientes a encontrar su propiedad ideal.

REGLAS:
- Pregunta tipo de propiedad, zona/ubicación preferida, presupuesto y número de recámaras
- Ofrece agendar visita presencial o virtual
- Menciona opciones de crédito hipotecario disponibles
- Si no hay propiedades que coincidan, pregunta si desea búsqueda personalizada
- Mantén tono profesional y confiable
- Nunca des precio sin confirmar con el agente

FLUJO:
1. Saludo + tipo de propiedad y zona
2. Calificar presupuesto y necesidades
3. Mostrar opciones disponibles
4. Agendar visita
5. Seguimiento post-visita
6. Oferta / negociación`,
    scoringRules: {
      highValueSignals: ['comprar', 'rentar', 'visita', 'recámara', 'presupuesto', 'crédito', 'hipoteca', 'ubicación', 'zona', 'precio'],
      negativeSignals: ['no me interesa', 'ya encontré', 'muy caro', 'lejos'],
    },
    followUpTemplates: [
      { triggerType: 'inactivity', name: 'Nuevas propiedades', messageTemplate: 'Hola {{firstName}}, tenemos nuevas propiedades en tu zona de interés. ¿Te gustaría verlas? 🏠', delayHours: 48 },
      { triggerType: 'inactivity', name: 'Recordatorio 5 días', messageTemplate: 'Hola {{firstName}}, seguimos buscando la propiedad ideal para ti. ¿Tienes actualizada tu búsqueda?', delayHours: 120 },
    ],
    pipelineStages: [
      { name: 'Lead Nuevo', color: '#94a3b8', order: 0, probability: 10, isWon: false, isLost: false },
      { name: 'Búsqueda Activa', color: '#60a5fa', order: 1, probability: 25, isWon: false, isLost: false },
      { name: 'Visita Agendada', color: '#a78bfa', order: 2, probability: 40, isWon: false, isLost: false },
      { name: 'Propuesta', color: '#fbbf24', order: 3, probability: 60, isWon: false, isLost: false },
      { name: 'Negociación', color: '#fb923c', order: 4, probability: 75, isWon: false, isLost: false },
      { name: 'Contrato Firmado', color: '#4ade80', order: 5, probability: 100, isWon: true, isLost: false },
      { name: 'No Calificado', color: '#9ca3af', order: 6, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 3. SALUD ───────────────────────────────────────────────
  {
    id: 'salud',
    name: 'Salud — Médico / Dental',
    industry: 'salud',
    description: 'Para consultorios médicos y clínicas dentales. Citas, recordatorios, seguimiento de pacientes.',
    systemPrompt: `Eres JHON, asistente virtual del consultorio. Ayudas a pacientes a agendar citas y resolver dudas administrativas.

REGLAS:
- Pregunta nombre completo, motivo de consulta y disponibilidad horaria
- Ofrece horarios disponibles del día o los próximos 3 días
- Confirma cita con fecha, hora y doctor(a)
- Envía recordatorio 24h antes de la cita
- NUNCA des diagnósticos ni recomendaciones médicas
- Mantén tono empático y profesional
- Para urgencias, indica llamar al número de emergencias

FLUJO:
1. Saludo + motivo de consulta
2. Revisar disponibilidad
3. Agendar cita
4. Confirmación + datos del doctor
5. Recordatorio pre-cita
6. Seguimiento post-cita`,
    scoringRules: {
      highValueSignals: ['cita', 'consulta', 'dolor', 'urgencia', 'revisión', 'doctor', 'horario', 'agendar'],
      negativeSignals: ['cancelar', 'no puedo', 'ya no necesito'],
    },
    followUpTemplates: [
      { triggerType: 'scheduled', name: 'Recordatorio 24h', messageTemplate: 'Hola {{firstName}}, te recordamos tu cita mañana a las {{time}} con el(a) Dr(a) {{doctor}}. ¿Confirmas tu asistencia? 🏥', delayHours: 23 },
      { triggerType: 'inactivity', name: 'Seguimiento post-cita', messageTemplate: 'Hola {{firstName}}, esperamos que te hayas sentido bien después de tu consulta. ¿Necesitas agendar otra cita?', delayHours: 168 },
    ],
    pipelineStages: [
      { name: 'Nuevo Paciente', color: '#94a3b8', order: 0, probability: 30, isWon: false, isLost: false },
      { name: 'Cita Agendada', color: '#60a5fa', order: 1, probability: 60, isWon: false, isLost: false },
      { name: 'Atendido', color: '#4ade80', order: 2, probability: 100, isWon: true, isLost: false },
      { name: 'Seguimiento', color: '#fbbf24', order: 3, probability: 50, isWon: false, isLost: false },
      { name: 'Cita Cancelada', color: '#9ca3af', order: 4, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 4. RESTAURANTE ─────────────────────────────────────────
  {
    id: 'restaurante',
    name: 'Restaurante — Reservaciones',
    industry: 'restaurante',
    description: 'Para restaurantes. Reservaciones, menú, eventos especiales, promociones.',
    systemPrompt: `Eres JHON, asistente virtual del restaurante. Ayudas con reservaciones, información del menú y eventos.

REGLAS:
- Pregunta número de personas, fecha, hora y ocasión especial
- Confirma reservación con todos los detalles
- Informa sobre platillos del día y promociones
- Para eventos grupales, ofrece menú especial
- Mantén tono cálido y acogedor
- Menciona alergias y restricciones alimenticias

FLUJO:
1. Saludo + reservación o consulta
2. Revisar disponibilidad
3. Confirmar reservación
4. Recordatorio del día
5. Encuesta post-visita`,
    scoringRules: {
      highValueSignals: ['reservar', 'mesa', 'grupo', 'evento', 'menú', 'horario', 'cumpleaños', 'aniversario'],
      negativeSignals: ['cancelar', 'lugar equivocado', 'muy caro'],
    },
    followUpTemplates: [
      { triggerType: 'scheduled', name: 'Recordatorio de reservación', messageTemplate: 'Hola {{firstName}}, te recordamos tu reservación hoy a las {{time}} para {{guests}} personas. ¡Te esperamos! 🍽️', delayHours: 4 },
      { triggerType: 'inactivity', name: 'Invitación regreso', messageTemplate: 'Hola {{firstName}}, ¡nos encantó tenerte en nuestro restaurante! Tenemos nuevos platillos del día. ¿Te gustaría reservar de nuevo? 🍕', delayHours: 336 },
    ],
    pipelineStages: [
      { name: 'Nueva Consulta', color: '#94a3b8', order: 0, probability: 20, isWon: false, isLost: false },
      { name: 'Reservación Confirmada', color: '#60a5fa', order: 1, probability: 80, isWon: false, isLost: false },
      { name: 'Atendido', color: '#4ade80', order: 2, probability: 100, isWon: true, isLost: false },
      { name: 'Reservación Cancelada', color: '#9ca3af', order: 3, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 5. EDUCACION ───────────────────────────────────────────
  {
    id: 'educacion',
    name: 'Educación — Cursos y Formación',
    industry: 'educacion',
    description: 'Para academias, centros de formación y cursos en línea. Inscripciones, horarios, precios.',
    systemPrompt: `Eres JHON, asistente virtual del centro educativo. Ayudas con información de cursos, inscripciones y horarios.

REGLAS:
- Pregunta curso de interés, nivel y disponibilidad
- Ofrece información sobre temario, duración y precios
- Facilita proceso de inscripción
- Menciona opciones de financiamiento o descuentos
- Mantén tono motivador y profesional

FLUJO:
1. Saludo + curso de interés
2. Información del programa
3. Requisitos y costos
4. Inscripción
5. Bienvenida al curso
6. Seguimiento de progreso`,
    scoringRules: {
      highValueSignals: ['curso', 'inscribir', 'precio', 'horario', 'certificado', 'clase', 'aprender', 'programa'],
      negativeSignals: ['muy caro', 'no tengo tiempo', 'ya tomé otro'],
    },
    followUpTemplates: [
      { triggerType: 'inactivity', name: 'Seguimiento inscripción', messageTemplate: 'Hola {{firstName}}, vimos que te interesa el curso de {{course}}. ¿Tienes alguna pregunta sobre el programa? 📚', delayHours: 48 },
      { triggerType: 'inactivity', name: 'Próxima cohorte', messageTemplate: 'Hola {{firstName}}, ¡las inscripciones para la nueva cohorte están abiertas! Solo quedan pocos lugares. 🎓', delayHours: 168 },
    ],
    pipelineStages: [
      { name: 'Lead Nuevo', color: '#94a3b8', order: 0, probability: 10, isWon: false, isLost: false },
      { name: 'Interesado', color: '#60a5fa', order: 1, probability: 30, isWon: false, isLost: false },
      { name: 'En Proceso de Inscripción', color: '#fbbf24', order: 2, probability: 60, isWon: false, isLost: false },
      { name: 'Inscrito', color: '#4ade80', order: 3, probability: 100, isWon: true, isLost: false },
      { name: 'No Insrito', color: '#9ca3af', order: 4, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 6. LEGAL ───────────────────────────────────────────────
  {
    id: 'legal',
    name: 'Legal — Servicios Jurídicos',
    industry: 'legal',
    description: 'Para despachos legales. Consultas, seguimiento de casos, documentos, citas.',
    systemPrompt: `Eres JHON, asistente virtual del despacho legal. Ayudas con agendar consultas y dar información general.

REGLAS:
- Pregunta área legal (civil, penal, laboral, familiar, mercantil)
- Agendar consulta con el abogado especializado
- NUNCA des asesoría legal ni opiniones sobre casos
- Para documentos, indica traer identificación oficial y documentos relevantes
- Mantén tono profesional y confidencial

FLUJO:
1. Saludo + área de necesidad
2. Calificar tipo de caso
3. Agendar consulta
4. Confirmación + documentos a traer
5. Seguimiento post-consulta
6. Seguimiento de caso`,
    scoringRules: {
      highValueSignals: ['consulta', 'demanda', 'divorcio', 'contrato', 'herencia', 'accidente', 'juicio', 'abogado'],
      negativeSignals: ['no necesito', 'ya resolví', 'otro despacho'],
    },
    followUpTemplates: [
      { triggerType: 'scheduled', name: 'Recordatorio consulta', messageTemplate: 'Hola {{firstName}}, recordatorio de tu consulta legal mañana a las {{time}}. Recuerda traer tu identificación oficial y los documentos relacionados. ⚖️', delayHours: 20 },
      { triggerType: 'inactivity', name: 'Seguimiento caso', messageTemplate: 'Hola {{firstName}}, queremos saber cómo va tu caso. ¿Necesitas agendar una consulta de seguimiento?', delayHours: 336 },
    ],
    pipelineStages: [
      { name: 'Nueva Consulta', color: '#94a3b8', order: 0, probability: 20, isWon: false, isLost: false },
      { name: 'Consulta Agendada', color: '#60a5fa', order: 1, probability: 40, isWon: false, isLost: false },
      { name: 'Caso Activo', color: '#fbbf24', order: 2, probability: 60, isWon: false, isLost: false },
      { name: 'Caso Resuelto', color: '#4ade80', order: 3, probability: 100, isWon: true, isLost: false },
      { name: 'Caso Cerrado Sin Resolver', color: '#9ca3af', order: 4, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 7. TIENDA ──────────────────────────────────────────────
  {
    id: 'tienda',
    name: 'Tienda — E-commerce Retail',
    industry: 'tienda',
    description: 'Para tiendas en línea. Catálogo de productos, pedidos, envíos, devoluciones.',
    systemPrompt: `Eres JHON, asistente virtual de la tienda. Ayudas con catálogo de productos, pedidos y seguimiento de envíos.

REGLAS:
- Pregunta producto de interés o número de pedido
- Ofrece buscar en el catálogo
- Da información de precios, disponibilidad y tiempos de envío
- Para seguimiento de pedido, solicita número de orden
- Para devoluciones, explica el proceso paso a paso
- Mantén tono amigable y servicial

FLUJO:
1. Saludo + consulta o número de pedido
2. Búsqueda en catálogo
3. Información de producto
4. Proceso de compra
5. Confirmación de pedido
6. Seguimiento de envío`,
    scoringRules: {
      highValueSignals: ['comprar', 'pedido', 'precio', 'envío', 'catálogo', 'producto', 'stock', 'descuento', 'devolución'],
      negativeSignals: ['no me sirve', 'muy caro', 'cancelar pedido'],
    },
    followUpTemplates: [
      { triggerType: 'scheduled', name: 'Seguimiento de envío', messageTemplate: 'Hola {{firstName}}, tu pedido #{{orderId}} está en camino. Puedes rastrearlo aquí: [enlace]. ¿Necesitas algo más? 📦', delayHours: 48 },
      { triggerType: 'inactivity', name: 'Carrito abandonado', messageTemplate: 'Hola {{firstName}}, vimos que dejaste productos en tu carrito. ¿Quieres completar tu compra? Tenemos un 10% extra solo por hoy. 🛒', delayHours: 2 },
    ],
    pipelineStages: [
      { name: 'Visitante', color: '#94a3b8', order: 0, probability: 10, isWon: false, isLost: false },
      { name: 'Interesado', color: '#60a5fa', order: 1, probability: 30, isWon: false, isLost: false },
      { name: 'Carrito Lleno', color: '#fbbf24', order: 2, probability: 50, isWon: false, isLost: false },
      { name: 'Pedido Confirmado', color: '#a78bfa', order: 3, probability: 80, isWon: false, isLost: false },
      { name: 'Compra Completada', color: '#4ade80', order: 4, probability: 100, isWon: true, isLost: false },
      { name: 'Devolución', color: '#f87171', order: 5, probability: 0, isWon: false, isLost: true },
    ],
  },

  // 8. GENERICO ────────────────────────────────────────────
  {
    id: 'generico',
    name: 'Genérico — Negocio General',
    industry: 'generico',
    description: 'Plantilla base para cualquier negocio. Se adapta a consultas generales, citas y seguimiento.',
    systemPrompt: `Eres JHON, asistente virtual de la empresa. Tu objetivo es atender, calificar leads y derivar al equipo correcto.

REGLAS:
- Saluda cordialmente y pregunta en qué puedes ayudar
- Identifica la necesidad del contacto
- Califica el interés (alto/medio/bajo)
- Agendar cita o llamada si es necesario
- Derivar a un humano cuando no puedas resolver
- Mantén tono profesional y amigable
- Responde siempre en español

FLUJO:
1. Saludo + identificar necesidad
2. Calificar interés
3. Ofrecer ayuda / agendar
4. Seguimiento si es necesario
5. Cierre o derivación`,
    scoringRules: {
      highValueSignals: ['interesado', 'cotización', 'precio', 'agendar', 'cita', 'comprar', 'servicio'],
      negativeSignals: ['no gracias', 'no me interesa', 'equívoco'],
    },
    followUpTemplates: [
      { triggerType: 'inactivity', name: 'Seguimiento 24h', messageTemplate: 'Hola {{firstName}}, ¿pudiste revisar la información que te compartimos? Estamos para resolver tus dudas.', delayHours: 24 },
      { triggerType: 'inactivity', name: 'Re-engagement 7 días', messageTemplate: 'Hola {{firstName}}, esperamos que estés bien. Tenemos novedades que podrían interesarte. ¿Te gustaría saber más?', delayHours: 168 },
    ],
    pipelineStages: [
      { name: 'Lead Nuevo', color: '#94a3b8', order: 0, probability: 10, isWon: false, isLost: false },
      { name: 'Contactado', color: '#60a5fa', order: 1, probability: 25, isWon: false, isLost: false },
      { name: 'Cualificado', color: '#fbbf24', order: 2, probability: 50, isWon: false, isLost: false },
      { name: 'Propuesta', color: '#fb923c', order: 3, probability: 70, isWon: false, isLost: false },
      { name: 'Cerrado Ganado', color: '#4ade80', order: 4, probability: 100, isWon: true, isLost: false },
      { name: 'Cerrado Perdido', color: '#9ca3af', order: 5, probability: 0, isWon: false, isLost: true },
    ],
  },
]

// ─── Public API ───────────────────────────────────────────────

/**
 * Get all available niche templates.
 */
export function getAvailableTemplates(): NicheTemplate[] {
  return TEMPLATES
}

/**
 * Get a single template by ID.
 */
export function getTemplateById(templateId: string): NicheTemplate | undefined {
  return TEMPLATES.find(t => t.id === templateId)
}

/**
 * Apply a template to a workspace. Updates system prompt, industry,
 * creates pipeline stages if needed, and creates follow-up rules.
 */
export async function applyTemplate(workspaceId: string, templateId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const template = getTemplateById(templateId)
    if (!template) {
      return { success: false, error: `Template "${templateId}" no encontrado` }
    }

    // 1. Update workspace industry
    const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      return { success: false, error: 'Workspace no encontrado' }
    }

    // 2. Update workspace settings with niche configuration
    const settings = JSON.parse(workspace.settings || '{}')
    settings.niche = templateId
    settings.nicheAppliedAt = new Date().toISOString()
    settings.scoringRules = template.scoringRules

    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        industry: template.industry,
        settings: JSON.stringify(settings),
      },
    })

    // 3. Create pipeline stages if none exist
    const existingPipeline = await db.pipeline.findFirst({
      where: { workspaceId, isActive: true },
      include: { stages: true },
    })

    if (!existingPipeline) {
      // Create new pipeline with template stages
      const pipeline = await db.pipeline.create({
        data: {
          workspaceId,
          name: `Pipeline ${template.name}`,
          description: `Pipeline generado por plantilla ${template.name}`,
          isActive: true,
          order: 0,
          stages: {
            create: template.pipelineStages.map(stage => ({
              name: stage.name,
              color: stage.color,
              order: stage.order,
              probability: stage.probability,
              isWon: stage.isWon,
              isLost: stage.isLost,
            })),
          },
        },
      })
      console.log(`[NicheTemplates] Created pipeline with ${template.pipelineStages.length} stages for workspace ${workspaceId}`)
    } else if (existingPipeline.stages.length === 0) {
      // Add stages to existing empty pipeline
      for (const stage of template.pipelineStages) {
        await db.pipelineStage.create({
          data: {
            pipelineId: existingPipeline.id,
            name: stage.name,
            color: stage.color,
            order: stage.order,
            probability: stage.probability,
            isWon: stage.isWon,
            isLost: stage.isLost,
          },
        })
      }
      console.log(`[NicheTemplates] Added ${template.pipelineStages.length} stages to existing pipeline for workspace ${workspaceId}`)
    }

    // 4. Create follow-up rules from template
    for (const followUp of template.followUpTemplates) {
      // Check if a rule with same name already exists
      const existing = await db.followUpRule.findFirst({
        where: { workspaceId, name: followUp.name },
      })

      if (!existing) {
        await db.followUpRule.create({
          data: {
            workspaceId,
            name: followUp.name,
            description: `Regla de seguimiento generada por plantilla ${template.name}`,
            triggerType: followUp.triggerType,
            triggerConfig: JSON.stringify({ delayHours: followUp.delayHours }),
            channel: 'whatsapp',
            messageTemplate: followUp.messageTemplate,
            isActive: true,
            maxRetries: 3,
            cooldownHours: followUp.delayHours,
            priority: 5,
          },
        })
      }
    }

    console.log(`[NicheTemplates] Template "${templateId}" applied to workspace ${workspaceId}`)
    return { success: true }
  } catch (err) {
    console.warn('[NicheTemplates] applyTemplate error (non-critical):', err instanceof Error ? err.message : err)
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
