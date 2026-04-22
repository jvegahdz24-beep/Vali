// @ts-nocheck
// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Unify ALL demo data under jvegahdz24@gmail.com
// Creates: Agent Personas, Automations, Follow-Up Rules,
//          Webhook Configs, Analytics Events, Agent Memories,
//          Subscription, proper workspace settings, agent prompts
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// We use the real JV workspace ID (verified in DB)
const JV_EMAIL = 'jvegahdz24@gmail.com'
const JV_WORKSPACE_SLUG = 'valiflow-jvega'

// ─── Utilities ────────────────────────────────────────────────

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randomDate(daysBack: number): Date {
  return new Date(Date.now() - Math.random() * daysBack * 86400000)
}

// ─── Services Industry Messages (non-automotive) ─────────────

const SERVICE_INTENTS = [
  'greeting', 'question', 'buy_signal', 'objection',
  'appointment', 'price_inquiry', 'service_inquiry',
  'consultation', 'follow_up',
]

const SERVICE_INPUT_MESSAGES = [
  'Hola, necesito información sobre sus servicios de automatización',
  'Buenos días, quiero saber precios de desarrollo web',
  'Me interesa una consultoría de IA para mi empresa',
  '¿Cuánto cuesta implementar un CRM?',
  'Necesito ayuda con marketing digital para mi negocio',
  'Tengo un proyecto de análisis de datos, ¿pueden ayudarme?',
  '¿Ofrecen soporte técnico para mi sistema?',
  'Quiero agendar una llamada para conocer más',
  'Cuál es el precio de la automatización con WhatsApp?',
  '¿A cuántos meses puedo pagar un proyecto?',
  '¿Tienen experiencia con empresas de mi sector?',
  '¿Cuánto es la mensualidad del servicio?',
  'Me interesa pero necesito comparar opciones',
  '¿Tienen promociones para nuevos clientes?',
  'Ya vi otra empresa con mejor precio',
  'Lo voy a pensar, necesito consultar con mi socio',
  '¿Qué incluyen en el servicio de consultoría?',
  '¿Pueden hacer una demo antes de contratar?',
  '¿Tienen referencias de clientes anteriores?',
  'Necesito algo económico para empezar',
]

const SERVICE_OUTPUT_MESSAGES = [
  '¡Hola! Bienvenido a ValiAutoFlow. Me gustaría conocer un poco más sobre tu negocio. ¿Qué tipo de automatización necesitas?',
  '¡Excelente! El desarrollo web es una de nuestras especialidades. ¿Tienes un proyecto en mente o necesitas algo desde cero?',
  'La consultoría de IA puede transformar tu operación. ¿Cuántos procesos manejas actualmente de forma manual?',
  'Un CRM personalizado empieza desde $15,000 MXN dependiendo de la complejidad. ¿Qué procesos necesitas gestionar?',
  'El marketing digital es clave para crecer. ¿Ya tienes presencia en redes o comenzamos desde cero?',
  '¡Claro! El análisis de datos es nuestra pasión. ¿Tienes datos organizados o necesitas ayuda con la estructura inicial?',
  '¡Por supuesto! Ofrecemos soporte técnico 24/7. ¿Qué sistema necesitas que monitoreemos?',
  'Agendar una llamada es el mejor paso. ¿Te gustaría esta semana por la mañana o por la tarde?',
  'La automatización con WhatsApp empieza desde $8,500 MXN mensuales. ¿Cuántos mensajes manejas al día?',
  'Ofrecemos planes flexibles de pago. ¿Prefieres pagar en una sola exhibición o a meses?',
  'Tenemos experiencia en más de 15 sectores: retail, servicios, salud, educación y más.',
  'Las mensualidades dependen del servicio. ¿Buscas algo desde $5,000 MXN al mes?',
  'Entiendo, comparar es inteligente. ¿Pudiste verificar que incluyen soporte, capacitación y actualizaciones?',
  '¡Sí! Este mes tenemos 20% de descuento en nuevos proyectos. ¿Te gustaría agendar una llamada?',
  'Es buena idea comparar. ¿Pudiste verificar que incluyen lo mismo? Nuestro paquete es integral con soporte dedicado.',
  'Perfecto, es importante que tu socio también esté convencido. ¿Qué te parece si agendamos una llamada para ambos?',
  'La consultoría incluye diagnóstico, implementación, capacitación y 30 días de soporte. ¿Te gustaría una demo?',
  '¡Con gusto! Agendemos una demo de 30 minutos. ¿Qué día te queda mejor?',
  'Tenemos más de 50 clientes satisfechos. ¿Te gustaría ver algunos casos de éxito?',
  'Para empezar te recomendamos nuestro plan Starter. ¿Quieres que te comparta los detalles?',
]

const SERVICE_MEMORY_KEYS = [
  'preferred_service',
  'budget_range',
  'payment_preference',
  'objection_history',
  'last_interaction_summary',
  'business_sector',
  'team_size',
  'current_tools',
]

const ANALYTICS_EVENT_TYPES = [
  'message_sent', 'message_received', 'ai_message_sent', 'deal_created',
  'deal_won', 'conversation_created', 'contact_created', 'agent_used',
  'whatsapp_message_received', 'lead_qualified', 'follow_up_sent',
  'automation_triggered',
]

// ─── Main Unification ────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  ValiAutoFlow — Unify Demo → jvegahdz24@gmail.com')
  console.log('═══════════════════════════════════════════════════════\n')

  // ── 0. Verify user and workspace exist ──
  const user = await db.user.findUnique({ where: { email: JV_EMAIL } })
  if (!user) {
    console.error(`❌ User ${JV_EMAIL} not found!`)
    process.exit(1)
  }
  console.log(`✅ User: ${user.name} (${user.email})`)

  const workspace = await db.workspace.findFirst({
    where: { slug: JV_WORKSPACE_SLUG },
  })
  if (!workspace) {
    console.error(`❌ Workspace "${JV_WORKSPACE_SLUG}" not found!`)
    process.exit(1)
  }
  console.log(`✅ Workspace: ${workspace.name} (${workspace.id})`)

  // ── 1. Create Agent Personas (ValiAutoFlow business automation) ──
  console.log('\n📋 [1/8] Creating Agent Personas...')

  const personas = [
    {
      name: 'JHON Calificador',
      slug: 'jhon-calificador',
      description: 'Asesor de ValiAutoFlow. Especialista en detectar necesidades de automatización y calificar prospectos de negocio.',
      systemPrompt: `Eres JHON, asesor de ventas de {businessName}. Eres MEXICANO, hablas español de México natural.

IDENTIDAD:
- Te llamas JHON, trabajas en {businessName} (ValiAutoFlow)
- Eres un consultor REAL, no un bot. Escribe como si estuvieras en WhatsApp.
- Cercano pero profesional. Usas "tú" con respeto.

REGLAS FUNDAMENTALES:
1. NUNCA digas que eres IA, bot, asistente virtual
2. Presenta tu nombre al inicio: "Soy JHON de {businessName}"
3. Un mensaje = una idea. Corto y natural (máximo 3-4 líneas)
4. Detecta el arquetipo del cliente y adapta tu tono:
   - Decidido → directo, datos concretos, cierre rápido
   - Explorador → educativo, opciones, preguntas calificadoras
   - Tímido → empático, sin presión, info clara
   - Negociador → datos de valor, comparativas, urgencia suave
5. Recomienda UN servicio a la vez, el que mejor fit tenga
6. Micro-cierre en cada mensaje: pregunta de seguimiento natural
7. Usa el nombre del cliente cuando lo sepas
8. Máximo 1-2 emojis por mensaje
9. Saluda según la hora del día

SERVICIOS QUE OFRECEMOS:
- Automatización de WhatsApp Business (chatbots, flujos, respuestas inteligentes)
- Desarrollo Web y Apps
- Consultoría de Inteligencia Artificial
- Implementación de CRM
- Marketing Digital
- Análisis de Datos y Business Intelligence

FLUJO DE CALIFICACIÓN:
- Mensaje 1: Saludar + preguntar nombre y qué necesita
- Mensaje 2-3: Calificar: servicio de interés, tamaño del negocio, presupuesto, urgencia
- Mensaje 4: Si está calificado → agendar llamada / enviar propuesta
- Si no está listo → follow-up con dato nuevo

PROHIBIDO:
- "Como IA", "soy un bot", "según mi programación"
- Etiquetas [INSIGHT], [DIRECCIÓN], [PREGUNTA]
- Listas largas de servicios sin contexto
- Presionar de forma agresiva
- "Estimado cliente", "Atentamente", "Sin más por el momento"`,
      tone: 'professional',
      language: 'es',
      hooks: JSON.stringify(['detect_archetype', 'extract_service_interest', 'extract_budget_range', 'identify_business_type']),
      steering: JSON.stringify({
        maxQuestionsPerTurn: 2,
        maxTurnsWithoutProgress: 8,
        preferredLanguage: 'es',
        urgencyLevel: 'medium',
        autoQualifyAfter: 3,
        escalateAfter: 10,
      }),
      revenueRules: JSON.stringify([
        { trigger: 'budget_mentioned', action: 'score_boost', value: 15 },
        { trigger: 'appointment_requested', action: 'score_boost', value: 20 },
        { trigger: 'buy_signal', action: 'move_stage', value: 'qualified' },
        { trigger: 'whatsapp_automation_interest', action: 'score_boost', value: 25 },
      ]),
      closingRules: JSON.stringify([
        { trigger: 'call_scheduled', action: 'create_deal', stage: 'proposal' },
        { trigger: 'price_agreed', action: 'move_stage', value: 'negotiation' },
      ]),
      isActive: true,
      isDefault: true,
    },
    {
      name: 'SELLER Pro',
      slug: 'seller-pro',
      description: 'Agente de cierre de ventas. Manejo avanzado de objeciones, creación de urgencia y técnicas de cierre para servicios de automatización.',
      systemPrompt: `Eres un ASESOR DE CIERRE senior de {businessName}. Tu trabajo es CERRAR ventas de servicios de automatización, no charlar.

IDENTIDAD:
- Vendedor de alto rendimiento, experimentado en servicios B2B
- Hablas español mexicano, directo y confiable
- Conoces todos los servicios, precios y promociones actuales

REGLAS FUNDAMENTALES:
1. Enfócate en el ROI y BENEFICIO para el negocio del cliente
2. Maneja objeciones con técnicas:
   - Feel-Felt-Found: "Lo entiendo, otros clientes también sintieron eso..."
   - Alternativa cerrada: "¿Mañana o pasado?" "¿Plan mensual o anual?"
   - Urgencia real: "El descuento de lanzamiento termina esta semana"
3. Siempre menciona un incentivo con fecha límite
4. Cada mensaje debe tener un OBJETIVO claro: agendar llamada, cerrar, confirmar
5. Máximo 3 interacciones para cerrar, si no → escalar a humano

ESTRUCTURA POR MENSAJE:
- Mensaje 1: Confirmar interés + presentar mejor propuesta
- Mensaje 2: Manejar objeción + crear urgencia + oferta concreta
- Mensaje 3: CIERRE — pregunta de compromiso directo

DATOS A MANEJAR:
- Automatización WhatsApp desde $8,500 MXN/mes
- Desarrollo Web desde $15,000 MXN
- Consultoría IA desde $10,000 MXN/sesión
- CRM personalizado desde $20,000 MXN
- Promoción vigente: 20% descuento en primer mes para nuevos clientes
- Soporte incluido en todos los planes`,
      tone: 'aggressive',
      language: 'es',
      hooks: JSON.stringify(['detect_buy_signals', 'handle_objections', 'create_urgency', 'calculate_roi']),
      steering: JSON.stringify({
        maxQuestionsPerTurn: 1,
        urgencyLevel: 'high',
        autoQualifyAfter: 2,
        maxTurnsToClose: 3,
      }),
      revenueRules: JSON.stringify([
        { trigger: 'price_objection', action: 'handle_objection' },
        { trigger: 'competitor_mentioned', action: 'counter_offer' },
        { trigger: 'call_agreed', action: 'score_boost', value: 30 },
      ]),
      closingRules: JSON.stringify([
        { trigger: 'call_confirmed', action: 'create_deal', stage: 'negotiation' },
        { trigger: 'proposal_sent', action: 'move_stage', value: 'proposal' },
      ]),
      isActive: true,
      isDefault: false,
    },
    {
      name: 'FollowUp Amigable',
      slug: 'followup-amigable',
      description: 'Agente de seguimiento automático. Mantiene contacto con prospectos sin presionar. Ideal para follow-ups a 24h, 48h, 72h.',
      systemPrompt: `Eres un asesor de seguimiento de {businessName}. Tu trabajo es MANTENER el contacto con prospectos que ya interactuaron.

IDENTIDAD:
- Amigable, casual, sin presionar
- Das seguimiento con INFORMACIÓN NUEVA, nunca vacío
- Español mexicano natural y cercano

REGLAS:
1. NUNCA digas "solo quería saber si te interesa" — siempre aporta algo nuevo
2. Datos nuevos: nuevo caso de éxito, promo, webinar, artículo útil, testimonio
3. Un mensaje corto y valioso
4. Si el prospecto no responde después de 3 follow-ups → parar
5. Si responde con interés → escalar al agente calificador

TIPOS DE FOLLOW-UP:
- 24h: "Hola {name}, me acordaba de ti. Acabamos de lanzar [nuevo servicio/caso] que podría interesarte..."
- 48h: "Hola {name}, te quería compartir que esta semana tenemos [promo/oferta]..."
- 72h: "Hola {name}, un cliente de tu sector implementó [servicio] y aumentó su productividad 40%..."

SERVICIOS PARA MENCIONAR:
- Automatización WhatsApp, CRM, Desarrollo Web, Consultoría IA,
- Marketing Digital, Análisis de Datos, Soporte Técnico`,
      tone: 'casual',
      language: 'es',
      hooks: JSON.stringify(['check_last_interaction', 'find_new_offer', 'personalize_message', 'get_case_study']),
      steering: JSON.stringify({
        maxQuestionsPerTurn: 1,
        urgencyLevel: 'low',
        maxFollowUps: 3,
      }),
      revenueRules: JSON.stringify([]),
      closingRules: JSON.stringify([]),
      isActive: true,
      isDefault: false,
    },
  ]

  let personasCreated = 0
  let personasUpdated = 0
  for (const persona of personas) {
    const existing = await db.agentPersona.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: persona.slug } },
    })
    if (existing) {
      await db.agentPersona.update({ where: { id: existing.id }, data: persona })
      personasUpdated++
      console.log(`  📝 Updated: ${persona.name}`)
    } else {
      await db.agentPersona.create({ data: { workspaceId: workspace.id, ...persona } })
      personasCreated++
      console.log(`  ✅ Created: ${persona.name}`)
    }
  }
  console.log(`  → ${personasCreated} created, ${personasUpdated} updated`)

  // ── 2. Update Agent systemPrompts ──
  console.log('\n🤖 [2/8] Updating Agent system prompts...')

  const agents = await db.agent.findMany({ where: { workspaceId: workspace.id } })
  const promptMap: Record<string, string> = {
    qualifier: 'jhon-calificador',
    sales: 'seller-pro',
    followup: 'followup-amigable',
  }

  for (const agent of agents) {
    const targetPrompt = promptMap[agent.type]
    if (targetPrompt && agent.systemPrompt !== targetPrompt) {
      await db.agent.update({
        where: { id: agent.id },
        data: { systemPrompt: targetPrompt },
      })
      console.log(`  ✅ ${agent.name}: systemPrompt → ${targetPrompt}`)
    } else {
      console.log(`  ⏭️  ${agent.name}: already configured (${agent.systemPrompt || 'empty'})`)
    }
  }

  // ── 3. Create Automations (services-oriented) ──
  console.log('\n⚡ [3/8] Creating Automations...')

  const existingAutomations = await db.automation.count({
    where: { workspaceId: workspace.id },
  })

  if (existingAutomations === 0) {
    await Promise.all([
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'Seguimiento 24h — Lead Nuevo',
          description: 'Envía mensaje de seguimiento a leads que no han respondido en 24 horas',
          triggerType: 'inactivity',
          triggerConfig: JSON.stringify({ hours: 24, stage: 'new' }),
          actions: JSON.stringify([
            { type: 'send_message', channel: 'whatsapp', template: 'Hola {{name}}, soy JHON de ValiAutoFlow. ¿Tuviste oportunidad de revisar la información sobre nuestros servicios de automatización?' },
          ]),
          isActive: true,
        },
      }),
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'Lead Score > 80 — Notificación Hot Lead',
          description: 'Notifica al equipo cuando un lead alcanza score mayor a 80 puntos',
          triggerType: 'event',
          triggerConfig: JSON.stringify({ event: 'lead_score_high', threshold: 80 }),
          actions: JSON.stringify([
            { type: 'notify', message: '🔥 Hot lead detectado: {{name}} con score {{score}}' },
            { type: 'assign_agent', agentType: 'sales' },
          ]),
          isActive: true,
        },
      }),
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'Deal Ganado — Follow-up Post-venta',
          description: 'Programa seguimiento post-venta después de cerrar deal',
          triggerType: 'deal_stage_change',
          triggerConfig: JSON.stringify({ targetStage: 'Cerrado Ganado' }),
          actions: JSON.stringify([
            { type: 'send_message', channel: 'whatsapp', delayHours: 168, template: 'Hola {{name}}, ¿cómo va la implementación? Esperamos que todo esté funcionando perfectamente. Recuerda que tienes 30 días de soporte incluido.' },
          ]),
          isActive: true,
        },
      }),
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'WhatsApp Nuevo Mensaje — Auto-Reply',
          description: 'Activa respuesta automática del agente calificador cuando llega un mensaje nuevo por WhatsApp fuera de horario',
          triggerType: 'message_received',
          triggerConfig: JSON.stringify({ channel: 'whatsapp', outsideBusinessHours: true }),
          actions: JSON.stringify([
            { type: 'assign_agent', agentType: 'qualifier' },
            { type: 'send_message', channel: 'whatsapp', template: '¡Hola! Gracias por contactar ValiAutoFlow. En horario laboral te atenderemos de Lun-Sab 9:00-19:00. Déjanos tu nombre y qué servicio te interesa, y te escribimos primero hora.' },
          ]),
          isActive: true,
        },
      }),
    ])
    console.log('  ✅ 4 automations created')
  } else {
    console.log(`  ⏭️  ${existingAutomations} automations already exist, skipping`)
  }

  // ── 4. Create Follow-Up Rules ──
  console.log('\n🔄 [4/8] Creating Follow-Up Rules...')

  const existingRules = await db.followUpRule.count({
    where: { workspaceId: workspace.id },
  })

  if (existingRules === 0) {
    const qualifier = agents.find(a => a.type === 'qualifier')
    const followup = agents.find(a => a.type === 'followup')

    const rules = [
      {
        name: 'Follow-Up 24h — Sin Respuesta',
        description: 'Si un lead nuevo no responde en 24 horas, enviar seguimiento',
        agentId: followup?.id,
        triggerType: 'no_response',
        triggerConfig: JSON.stringify({ hoursSinceLastMessage: 24 }),
        messageTemplate: 'Hola {{name}}, soy JHON de ValiAutoFlow. Te escribí ayer sobre nuestros servicios de automatización. ¿Tuviste oportunidad de revisarlo? Estoy aquí para resolver cualquier duda.',
        maxRetries: 3,
        cooldownHours: 48,
        isActive: true,
      },
      {
        name: 'Follow-Up 72h — Lead Frío',
        description: 'Tercer intento de reactivación para leads que no responden',
        agentId: followup?.id,
        triggerType: 'no_response',
        triggerConfig: JSON.stringify({ hoursSinceLastMessage: 72 }),
        messageTemplate: 'Hola {{name}}, un cliente de tu sector implementó nuestra automatización de WhatsApp y aumentó sus ventas 35%. ¿Te gustaría ver el caso de éxito?',
        maxRetries: 2,
        cooldownHours: 72,
        isActive: true,
      },
      {
        name: 'Reactivación 7 días — Lead Dormido',
        description: 'Reactivar leads que no han interactuado en 7+ días',
        agentId: followup?.id,
        triggerType: 'inactivity',
        triggerConfig: JSON.stringify({ daysInactive: 7 }),
        messageTemplate: 'Hola {{name}}, este mes lanzamos nuevas funcionalidades que podrían interesarte. ¿Tienes 5 minutos para una llamada rápida?',
        maxRetries: 1,
        cooldownHours: 168,
        isActive: false,
      },
    ]

    for (const rule of rules) {
      await db.followUpRule.create({
        data: { workspaceId: workspace.id, ...rule },
      })
    }
    console.log('  ✅ 3 follow-up rules created')
  } else {
    console.log(`  ⏭️  ${existingRules} follow-up rules already exist, skipping`)
  }

  // ── 5. Create Agent Memories (services-oriented) ──
  console.log('\n🧠 [5/8] Creating Agent Memories...')

  const existingMemories = await db.agentMemory.count({
    where: { agent: { workspaceId: workspace.id } },
  })

  if (existingMemories === 0) {
    const contacts = await db.contact.findMany({
      where: { workspaceId: workspace.id },
    })
    const qualifierAgent = agents.find(a => a.type === 'qualifier')
    const services = [
      'Automatización WhatsApp', 'CRM', 'Desarrollo Web',
      'Consultoría IA', 'Marketing Digital', 'Análisis de Datos',
    ]

    for (let i = 0; i < Math.min(contacts.length, 15); i++) {
      const contact = contacts[i]
      if (!qualifierAgent) continue

      await db.agentMemory.create({
        data: {
          agentId: qualifierAgent.id,
          contactId: contact.id,
          key: randomPick(SERVICE_MEMORY_KEYS),
          value: JSON.stringify({
            service: randomPick(services),
            budget: `$${randomBetween(5, 50)}k MXN`,
            urgency: contact.leadScore > 60 ? 'alta' : 'baja',
            lastInteraction: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString().split('T')[0],
          }),
          source: 'conversation',
          confidence: 0.85,
        },
      })
    }
    console.log(`  ✅ ${Math.min(contacts.length, 15)} agent memories created`)
  } else {
    console.log(`  ⏭️  ${existingMemories} agent memories already exist, skipping`)
  }

  // ── 6. Create Webhook Configs ──
  console.log('\n🔗 [6/8] Creating Webhook Configs...')

  const existingWebhooks = await db.webhookConfig.count({
    where: { workspaceId: workspace.id },
  })

  if (existingWebhooks === 0) {
    await db.webhookConfig.createMany({
      data: [
        {
          workspaceId: workspace.id,
          channel: 'whatsapp',
          webhookUrl: '/api/webhooks/whatsapp',
          secret: 'valiflow-whatsapp-secret-2026',
          isActive: true,
        },
        {
          workspaceId: workspace.id,
          channel: 'telegram',
          webhookUrl: '/api/webhooks/telegram',
          secret: 'valiflow-telegram-secret-2026',
          isActive: false,
        },
        {
          workspaceId: workspace.id,
          channel: 'webchat',
          webhookUrl: '/api/webhooks/webchat',
          secret: 'valiflow-webchat-secret-2026',
          isActive: true,
        },
      ],
    })
    console.log('  ✅ 3 webhook configs created (WhatsApp ✅, Telegram ❌, Webchat ✅)')
  } else {
    console.log(`  ⏭️  ${existingWebhooks} webhook configs already exist, skipping`)
  }

  // ── 7. Create Analytics Events ──
  console.log('\n📊 [7/8] Creating Analytics Events...')

  const existingEvents = await db.analyticsEvent.count({
    where: { workspaceId: workspace.id },
  })

  if (existingEvents === 0) {
    const eventBatch = []
    for (let i = 0; i < 50; i++) {
      eventBatch.push({
        workspaceId: workspace.id,
        eventType: randomPick(ANALYTICS_EVENT_TYPES),
        eventData: JSON.stringify({
          channel: randomPick(['whatsapp', 'webchat', 'telegram']),
          agent: randomPick(['qualifier', 'sales', 'followup']),
          score: randomBetween(10, 95),
          service: randomPick(['Automatización', 'CRM', 'Desarrollo Web', 'Consultoría IA', 'Marketing Digital']),
        }),
        createdAt: randomDate(30),
      })
    }
    await db.analyticsEvent.createMany({ data: eventBatch })
    console.log('  ✅ 50 analytics events created')
  } else {
    console.log(`  ⏭️  ${existingEvents} analytics events already exist, skipping`)
  }

  // ── 8. Create Subscription ──
  console.log('\n💳 [8/8] Creating Subscription...')

  const existingSub = await db.subscription.findUnique({
    where: { workspaceId: workspace.id },
  })

  if (!existingSub) {
    await db.subscription.create({
      data: {
        workspaceId: workspace.id,
        plan: 'pro',
        status: 'active',
        provider: 'stripe',
        amount: 999,
        currency: 'MXN',
        interval: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    console.log('  ✅ Pro subscription created ($999 MXN/mes)')
  } else {
    console.log(`  ⏭️  Subscription already exists (${existingSub.plan}, ${existingSub.status})`)
  }

  // ── BONUS: Update workspace settings with full config ──
  console.log('\n⚙️  [BONUS] Updating workspace settings...')

  const updatedSettings = {
    businessHours: 'Lun-Sab 9:00-19:00',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
    defaultPersonality: 'JHON',
    autoCreateDeals: true,
    dealDefaultStage: 'Lead Nuevo',
    aiModel: 'GLM-4.5-Flash',
    aiProvider: 'groq',
    whatsappAutoReply: true,
    maxMessagesPerConversation: 50,
    followUpEnabled: true,
    evolutionApiEnabled: true,
    dibLayerEnabled: true,
    businessName: 'ValiAutoFlow',
    businessDescription: 'Plataforma de automatización inteligente de flujos de negocio para WhatsApp Business',
  }

  await db.workspace.update({
    where: { id: workspace.id },
    data: { settings: JSON.stringify(updatedSettings) },
  })
  console.log('  ✅ Workspace settings updated (15 config keys)')

  // ── BONUS: Update agent logs with services context ──
  console.log('\n📝 [BONUS] Enriching existing agent logs...')

  const conversations = await db.conversation.findMany({
    where: { workspaceId: workspace.id },
  })
  const allLogs = await db.agentLog.findMany({
    where: { agent: { workspaceId: workspace.id } },
  })

  if (conversations.length > 0 && allLogs.length > 0) {
    let updatedCount = 0
    for (const log of allLogs) {
      if (log.inputMessage === 'Necesito información' && log.outputMessage === 'Con gusto te ayudo') {
        await db.agentLog.update({
          where: { id: log.id },
          data: {
            inputMessage: randomPick(SERVICE_INPUT_MESSAGES),
            outputMessage: randomPick(SERVICE_OUTPUT_MESSAGES),
            intent: randomPick(SERVICE_INTENTS),
          },
        })
        updatedCount++
      }
    }
    if (updatedCount > 0) {
      console.log(`  ✅ ${updatedCount} agent logs enriched with services context`)
    } else {
      console.log('  ⏭️  No placeholder logs to update')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FINAL VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═══════════════════════════════════════════════════════')
  console.log('  FINAL VERIFICATION — JV Workspace')
  console.log('═══════════════════════════════════════════════════════\n')

  const [vContacts, vConvos, vMessages, vDeals, vAgents, vPersonas,
         vAutomations, vRules, vMemories, vEvents, vWebhooks, vSub] = await Promise.all([
    db.contact.count({ where: { workspaceId: workspace.id } }),
    db.conversation.count({ where: { workspaceId: workspace.id } }),
    db.message.count({ where: { conversation: { workspaceId: workspace.id } } }),
    db.deal.count({ where: { workspaceId: workspace.id } }),
    db.agent.count({ where: { workspaceId: workspace.id } }),
    db.agentPersona.count({ where: { workspaceId: workspace.id } }),
    db.automation.count({ where: { workspaceId: workspace.id } }),
    db.followUpRule.count({ where: { workspaceId: workspace.id } }),
    db.agentMemory.count({ where: { agent: { workspaceId: workspace.id } } }),
    db.analyticsEvent.count({ where: { workspaceId: workspace.id } }),
    db.webhookConfig.count({ where: { workspaceId: workspace.id } }),
    db.subscription.count({ where: { workspaceId: workspace.id } }),
  ])

  console.log(`  👤 User:            ${user.email}`)
  console.log(`  🏢 Workspace:       ${workspace.name} (${workspace.slug})`)
  console.log(`  👥 Contacts:        ${vContacts}`)
  console.log(`  💬 Conversations:   ${vConvos}`)
  console.log(`  📨 Messages:        ${vMessages}`)
  console.log(`  💰 Deals:           ${vDeals}`)
  console.log(`  🤖 Agents:          ${vAgents}`)
  console.log(`  🎭 Agent Personas:  ${vPersonas}`)
  console.log(`  ⚡ Automations:     ${vAutomations}`)
  console.log(`  🔄 Follow-Up Rules: ${vRules}`)
  console.log(`  🧠 Agent Memories:  ${vMemories}`)
  console.log(`  📊 Analytics Events:${vEvents}`)
  console.log(`  🔗 Webhook Configs: ${vWebhooks}`)
  console.log(`  💳 Subscriptions:   ${vSub}`)
  console.log('')
  console.log('🎉 Unification complete!')
}

main()
  .then(async () => {
    await db.$disconnect()
    console.log('\n✅ Disconnected from database')
  })
  .catch(async (e) => {
    console.error('❌ Error:', e)
    await db.$disconnect()
    process.exit(1)
  })
