// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Seed Demo Data
// POST /api/seed — Seeds realistic business automation services data
// Unified under jvegahdz24@gmail.com workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES, PLANS } from '@/lib/constants'
import crypto from 'crypto'
import { randomPick, randomInt, randomDaysBack } from '@/lib/seeded-random'

// SHA-256 password hashing (bcrypt OOM-kills in low-memory environments)
function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

// ─── Demo Data Constants ─────────────────────────────────────

const MEXICAN_NAMES = [
  { first: 'Carlos', last: 'Hernández' },
  { first: 'María', last: 'González' },
  { first: 'José', last: 'López' },
  { first: 'Ana', last: 'Martínez' },
  { first: 'Roberto', last: 'Rodríguez' },
  { first: 'Laura', last: 'Pérez' },
  { first: 'Miguel', last: 'Sánchez' },
  { first: 'Patricia', last: 'Ramírez' },
  { first: 'Fernando', last: 'Torres' },
  { first: 'Sofía', last: 'Flores' },
  { first: 'Diego', last: 'Rivera' },
  { first: 'Valentina', last: 'Gómez' },
  { first: 'Andrés', last: 'Díaz' },
  { first: 'Camila', last: 'Morales' },
  { first: 'Ricardo', last: 'Jiménez' },
  { first: 'Isabella', last: 'Romero' },
  { first: 'Eduardo', last: 'Vargas' },
  { first: 'Natalia', last: 'Castro' },
  { first: 'Alejandro', last: 'Medina' },
  { first: 'Gabriela', last: 'Herrera' },
  { first: 'Luis', last: 'Aguilar' },
  { first: 'Daniela', last: 'Ortiz' },
  { first: 'Pablo', last: 'Navarro' },
  { first: 'Renata', last: 'Ríos' },
]

const SERVICES = [
  { name: 'Automatización WhatsApp', minPrice: 8500, category: 'automatización' },
  { name: 'CRM Personalizado', minPrice: 20000, category: 'crm' },
  { name: 'Desarrollo Web', minPrice: 15000, category: 'desarrollo' },
  { name: 'Consultoría IA', minPrice: 10000, category: 'ia' },
  { name: 'Marketing Digital', minPrice: 5000, category: 'marketing' },
  { name: 'Análisis de Datos', minPrice: 12000, category: 'datos' },
  { name: 'Soporte Técnico', minPrice: 3000, category: 'soporte' },
  { name: 'Integración de APIs', minPrice: 18000, category: 'desarrollo' },
  { name: 'Chatbot Inteligente', minPrice: 7500, category: 'automatización' },
  { name: 'Business Intelligence', minPrice: 22000, category: 'datos' },
  { name: 'App Móvil', minPrice: 35000, category: 'desarrollo' },
  { name: 'E-commerce', minPrice: 25000, category: 'desarrollo' },
  { name: 'Automatización Email', minPrice: 4000, category: 'automatización' },
  { name: 'Redes Sociales', minPrice: 6000, category: 'marketing' },
  { name: 'SEO & SEM', minPrice: 8000, category: 'marketing' },
  { name: 'Cloud Migration', minPrice: 30000, category: 'ia' },
  { name: 'Data Pipeline', minPrice: 16000, category: 'datos' },
  { name: 'Landing Page', minPrice: 8000, category: 'desarrollo' },
  { name: 'Flujos Automatizados', minPrice: 9000, category: 'automatización' },
  { name: 'Auditoría Digital', minPrice: 7000, category: 'consultoría' },
]

const MEXICAN_CITIES = [
  'CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana',
  'Cancún', 'Querétaro', 'Mérida', 'León', 'Aguascalientes',
]

const SOURCES = ['whatsapp', 'facebook', 'instagram', 'google', 'webform', 'referral', 'telegram']
const PHONES_MOCK = [
  '5512345678', '5523456789', '5534567890', '5545678901', '5556789012',
  '5567890123', '5578901234', '5589012345', '5590123456', '5501234567',
  '3312345678', '3323456789', '3334567890', '3345678901', '3356789012',
  '8112345678', '8123456789', '8134567890', '8145678901', '8156789012',
  '2212345678', '2223456789', '9981234567', '9992345678', '4421234567',
]

const INITIAL_MESSAGES = [
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

const AI_RESPONSES = [
  '¡Hola! Bienvenido a ValiAutoFlow. Me gustaría conocer un poco más sobre tu negocio. ¿Qué tipo de automatización necesitas?',
  '¡Excelente! El desarrollo web es una de nuestras especialidades. ¿Tienes un proyecto en mente o necesitas algo desde cero?',
  'La consultoría de IA puede transformar tu operación. ¿Cuántos procesos manejas actualmente de forma manual?',
  'Un CRM personalizado empieza desde $15,000 MXN dependiendo de la complejidad. ¿Qué procesos necesitas gestionar?',
  '¡Gracias por contactarnos! Me encantaría ayudarte a encontrar la solución ideal para tu negocio. ¿Ya tienes algún sistema en mente?',
  'El marketing digital es clave para crecer. ¿Ya tienes presencia en redes o comenzamos desde cero?',
  '¡Por supuesto! Agendar una llamada es sin compromiso. ¿Qué día te queda mejor?',
  '¡Excelente idea! Una llamada es el mejor paso. ¿Te gustaría esta semana por la mañana o por la tarde?',
  'La automatización con WhatsApp es nuestro servicio más popular. Reduce respuestas manuales hasta 80%. ¿Te gustaría saber más?',
  'Ofrecemos planes flexibles de pago. ¿Prefieres pagar en una sola exhibición o a meses con descuento?',
  'Tenemos experiencia en más de 15 sectores: retail, servicios, salud, educación y más. ¿En qué sector estás?',
  'Las mensualidades dependen del servicio. ¿Buscas algo desde $5,000 MXN al mes?',
  'Entiendo, comparar es inteligente. ¿Pudiste verificar que incluyen soporte, capacitación y actualizaciones?',
  '¡Sí! Este mes tenemos 20% de descuento en nuevos proyectos. ¿Te gustaría agendar una llamada?',
  'Es buena idea comparar. Nuestro paquete es integral con soporte dedicado. ¿Qué incluye la otra opción?',
  'Perfecto, es importante que tu socio también esté convencido. ¿Qué te parece si agendamos una llamada para ambos?',
  'La consultoría incluye diagnóstico, implementación, capacitación y 30 días de soporte. ¿Te gustaría una demo?',
  '¡Con gusto! Agendemos una demo de 30 minutos. ¿Qué día te queda mejor?',
  'Tenemos más de 50 clientes satisfechos. ¿Te gustaría ver algunos casos de éxito?',
  'Para empezar te recomendamos nuestro plan Starter. ¿Quieres que te comparta los detalles?',
]

const TAGS_OPTIONS = [
  'interesa_automatización', 'interesa_crm', 'interesa_desarrollo_web',
  'interesa_consultoría_ia', 'interesa_marketing_digital', 'interesa_análisis_de_datos',
  'tiene_interes_financiero', 'alto_presupuesto', 'buero_limpio',
  'comparando_precios', 'tiene_objeciones', 'referencia', 'whatsapp_incoming',
  'facebook_lead', 'google_lead', 'conversacion_activa', 'alto_engagement',
  'servicio: whatsapp_bot', 'servicio: crm', 'servicio: web', 'servicio: ia',
  'servicio: marketing', 'servicio: datos', 'servicio: soporte',
]

// randomPick and randomInt are imported from @/lib/seeded-random
// randomBetween is aliased to randomInt for backward compatibility
const randomBetween = randomInt

/** Backward-compatible wrapper */
function randomDate(daysBack: number): Date {
  return randomDaysBack(daysBack)
}

function randomPhone(): string {
  return randomPick(PHONES_MOCK)
}

function randomEmail(name: string): string {
  const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']
  return `${name.toLowerCase().replace(/\s/g, '')}${randomInt(1, 99)}@${randomPick(domains)}`
}

// ─── Seed Endpoint ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ─── Production guard: ALWAYS disabled in production ────
    // Demo seed is permanently disabled. Real leads come from WhatsApp only.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Seed endpoint is permanently disabled in production. Real contacts are created via WhatsApp.', code: 'SEED_DISABLED' },
        { status: 404 }
      )
    }

    // ─── PIN Protection only for destructive reset operations ──
    const { searchParams } = new URL(req.url)
    const isReset = searchParams.get('reset') === 'true'

    if (isReset) {
      const providedPin = searchParams.get('pin')
      const expectedPin = process.env.SEED_PIN
      if (!expectedPin) {
        return NextResponse.json(
          { error: 'SEED_PIN no configurado. No se permite reset sin PIN.', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }
      if (providedPin !== expectedPin) {
        return NextResponse.json(
          { error: 'PIN de seguridad requerido para reset. Contacta al administrador.', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }
    }

    // ─── 1. Find or Create JV User ──────────────────────────
    console.log('[Seed] Starting demo data creation for ValiAutoFlow...')

    const hashedPassword = hashPassword('valiflow2026')

    let user = await db.user.findUnique({
      where: { email: 'jvegahdz24@gmail.com' },
    })

    // Migrate legacy bcrypt hash → SHA-256 if needed
    if (user && user.password && (user.password.startsWith('$2b$') || user.password.startsWith('$2a$'))) {
      await db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })
      console.log('[Seed] Migrated password from bcrypt → SHA-256')
    }

    if (!user) {
      user = await db.user.create({
        data: {
          name: 'JVega',
          email: 'jvegahdz24@gmail.com',
          password: hashedPassword,
          role: 'owner',
          phone: '5512340000',
          timezone: 'America/Mexico_City',
          locale: 'es-MX',
        },
      })
      console.log(`[Seed] User created: ${user.email}`)
    } else {
      console.log(`[Seed] User exists: ${user.email}`)
    }

    // ─── 2. Find or Create ValiAutoFlow Workspace ───────────
    let workspace = await db.workspace.findFirst({
      where: { slug: 'valiflow-jvega' },
    })

    if (!workspace) {
      const defaultPlan = PLANS.pro
      workspace = await db.workspace.create({
        data: {
          name: 'ValiAutoFlow',
          slug: 'valiflow-jvega',
          ownerId: user.id,
          industry: 'services',
          logo: null,
          plan: 'pro',
          maxContacts: defaultPlan.limits.maxContacts,
          maxAgents: defaultPlan.limits.maxAgents,
          maxConversations: defaultPlan.limits.maxConversations,
          whatsappPhoneId: 'demo-evolution-instance',
          settings: JSON.stringify({
            businessHours: 'Lun-Sab 9:00-19:00',
            timezone: 'America/Mexico_City',
            currency: 'MXN',
            defaultPersonality: 'JHON',
            autoCreateDeals: true,
            dealDefaultStage: 'Lead Nuevo',
            aiModel: 'GLM-4.5-Flash',
            aiProvider: 'groq',
            whatsappAutoReply: true,
            followUpEnabled: true,
            evolutionApiEnabled: true,
            dibLayerEnabled: true,
            businessName: 'ValiAutoFlow',
          }),
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
          subscription: {
            create: {
              plan: 'pro',
              status: 'active',
              provider: 'stripe',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date('2026-05-25T12:00:00.000Z'),
              amount: 999,
              currency: 'MXN',
              interval: 'monthly',
            },
          },
        },
      })
      console.log(`[Seed] Workspace created: ${workspace.name}`)
    } else {
      console.log(`[Seed] Workspace exists: ${workspace.name}`)
    }

    // Skip seeding if workspace already has data
    const existingContacts = await db.contact.count({
      where: { workspaceId: workspace.id },
    })

    if (existingContacts > 0) {
      console.log('[Seed] Data already seeded, skipping...')
      return NextResponse.json({
        success: false,
        message: 'Data already seeded.',
        workspaceId: workspace.id,
      })
    }

    // ─── 3. Create Agents ──────────────────────────────────
    const agents = await Promise.all([
      db.agent.create({
        data: {
          workspaceId: workspace.id,
          name: 'JHON — Calificador',
          type: 'qualifier',
          description: 'Agente principal de calificación. Detecta necesidades de automatización y califica prospectos.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 10,
          isActive: true,
          systemPrompt: 'jhon-calificador',
          config: JSON.stringify({
            hooks: [],
            steering: {
              maxQuestionsPerTurn: 2,
              maxTurnsWithoutProgress: 8,
              preferredLanguage: 'es',
              urgencyLevel: 'medium',
              autoQualifyAfter: 3,
              escalateAfter: 10,
            },
            fallbackBehavior: 'default_response',
          }),
        },
      }),
      db.agent.create({
        data: {
          workspaceId: workspace.id,
          name: 'SELLER Pro — Cierre',
          type: 'sales',
          description: 'Agente especializado en cierre de ventas y manejo de objeciones avanzadas.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.8,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 8,
          isActive: true,
          systemPrompt: 'seller-pro',
          config: JSON.stringify({
            steering: {
              maxQuestionsPerTurn: 1,
              urgencyLevel: 'high',
              autoQualifyAfter: 2,
            },
            fallbackBehavior: 'transfer_human',
          }),
        },
      }),
      db.agent.create({
        data: {
          workspaceId: workspace.id,
          name: 'FollowUp Bot',
          type: 'followup',
          description: 'Agente de seguimiento automático que mantiene el contacto con prospectos.',
          model: 'groq',
          modelName: 'llama-3.1-8b-instant',
          temperature: 0.5,
          maxTokens: 2048,
          personality: 'friendly',
          priority: 5,
          isActive: true,
          systemPrompt: 'followup-amigable',
          config: JSON.stringify({
            steering: {
              maxQuestionsPerTurn: 1,
              urgencyLevel: 'low',
            },
          }),
        },
      }),
    ])
    console.log(`[Seed] ${agents.length} agents created`)

    // ─── 4. Create Contacts (services-oriented) ─────────────
    const contacts: Array<{ id: string; firstName: string; lastName: string; leadScore: number; service: typeof SERVICES[0] }> = []

    for (let i = 0; i < 20; i++) {
      const nameData = MEXICAN_NAMES[i]
      const phone = PHONES_MOCK[i]
      const source = randomPick(SOURCES)
      const service = randomPick(SERVICES)
      const leadScore = randomBetween(10, 95)

      const tags: string[] = [source === 'whatsapp' ? 'whatsapp_incoming' : `${source}_lead`]
      tags.push(`interesa_${service.category}`)
      tags.push(`servicio: ${service.name.toLowerCase().split(' ')[0]}`)

      if (leadScore > 60) {
        tags.push('tiene_interes_financiero', 'conversacion_activa')
      }
      if (leadScore > 80) {
        tags.push('alto_engagement')
      }
      if (leadScore < 40) {
        tags.push('comparando_precios')
      }

      const contact = await db.contact.create({
        data: {
          workspaceId: workspace.id,
          firstName: nameData.first,
          lastName: nameData.last,
          phone,
          email: randomEmail(nameData.first),
          source,
          status: leadScore > 30 ? 'active' : randomBetween(0, 1) === 0 ? 'inactive' : 'active',
          leadScore,
          tags: JSON.stringify(tags),
          customFields: JSON.stringify({
            city: randomPick(MEXICAN_CITIES),
            preferredService: service.name,
            budget: service.minPrice + randomBetween(-2000, 15000),
            teamSize: randomPick(['1-5', '5-20', '20-50', '50+']),
            currentTools: randomPick(['ninguno', 'Excel', 'WhatsApp manual', 'Otro CRM', 'Google Sheets']),
          }),
          notes: `Interesado en ${service.name}. Presupuesto ~$${((service.minPrice + randomBetween(0, 10000)) / 1000).toFixed(0)}k MXN. Canal: ${source}.`,
          lastMessageAt: randomDate(3),
          createdAt: randomDate(30),
        },
      })

      contacts.push({
        id: contact.id,
        firstName: nameData.first,
        lastName: nameData.last,
        leadScore,
        service,
      })
    }
    console.log(`[Seed] ${contacts.length} contacts created`)

    // ─── 5. Create Pipeline ─────────────────────────────────
    const pipeline = await db.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Pipeline de Ventas — ValiAutoFlow',
        description: 'Pipeline principal de servicios de automatización',
        order: 0,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
            name: stage.name,
            color: stage.color,
            order: index,
            probability: stage.probability,
            isWon: stage.name.toLowerCase().includes('ganado'),
            isLost: stage.name.toLowerCase().includes('perdido'),
          })),
        },
      },
    })
    console.log(`[Seed] Pipeline created with ${DEFAULT_PIPELINE_STAGES.length} stages`)

    const stages = await db.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: 'asc' },
    })

    // ─── 6. Create Conversations & Messages ─────────────────
    const conversations: Array<{ id: string; contactId: string }> = []

    for (let i = 0; i < 15; i++) {
      const contact = contacts[i]
      const messageCount = randomBetween(2, 8)
      const createdAt = randomDate(20)

      const conversation = await db.conversation.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          channel: randomPick(['whatsapp', 'whatsapp', 'whatsapp', 'telegram', 'webchat']),
          status: contact.leadScore > 60 ? 'active' : randomPick(['active', 'active', 'closed', 'pending']),
          assignedAgentId: contact.leadScore > 70 ? 'sales' : 'qualifier',
          unreadCount: randomBetween(0, 3),
          lastMessageAt: randomDate(2),
          externalId: `ev_${randomBetween(10000, 99999)}`,
          metadata: JSON.stringify({ instance: 'demo-evolution-instance' }),
          createdAt,
        },
      })

      for (let j = 0; j < messageCount; j++) {
        const isInbound = j % 2 === 0
        const msgDate = new Date(createdAt.getTime() + j * randomBetween(120000, 3600000))

        await db.message.create({
          data: {
            conversationId: conversation.id,
            content: isInbound
              ? randomPick(INITIAL_MESSAGES)
              : randomPick(AI_RESPONSES),
            type: 'text',
            direction: isInbound ? 'inbound' : 'outbound',
            senderType: isInbound ? 'contact' : 'agent',
            isAiGenerated: !isInbound,
            status: randomPick(['sent', 'delivered', 'read']),
            createdAt: msgDate,
          },
        })
      }

      conversations.push({ id: conversation.id, contactId: contact.id })
    }
    console.log(`[Seed] ${conversations.length} conversations with messages created`)

    // ─── 7. Create Deals ────────────────────────────────────
    let dealCount = 0

    for (let i = 0; i < 12; i++) {
      const contact = contacts[i]
      const service = contact.service

      let stageIndex: number
      let dealStatus: string

      if (contact.leadScore >= 85) {
        stageIndex = randomBetween(0, 1) === 0 ? 5 : 4
        dealStatus = stageIndex === 5 ? 'won' : 'active'
      } else if (contact.leadScore >= 60) {
        stageIndex = randomBetween(3, 4)
        dealStatus = 'active'
      } else if (contact.leadScore >= 40) {
        stageIndex = randomBetween(2, 3)
        dealStatus = 'active'
      } else if (contact.leadScore >= 20) {
        stageIndex = randomBetween(0, 1)
        dealStatus = 'active'
      } else {
        stageIndex = randomBetween(0, 6)
        dealStatus = stageIndex === 6 ? 'lost' : 'active'
      }

      const stage = stages[stageIndex]
      const dealValue = service.minPrice + randomBetween(-2000, 30000)

      await db.deal.create({
        data: {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: contact.id,
          title: `${contact.firstName} ${contact.lastName} — ${service.name}`,
          value: dealValue,
          currency: 'MXN',
          description: `Interés en ${service.name}. Contacto por ${contact.leadScore > 60 ? 'WhatsApp directo' : 'redes sociales'}.`,
          source: randomPick(['whatsapp', 'facebook', 'google', 'manual']),
          status: dealStatus,
          wonAt: dealStatus === 'won' ? randomDate(15) : null,
          lostAt: dealStatus === 'lost' ? randomDate(10) : null,
          lostReason: dealStatus === 'lost' ? randomPick(['precio', 'no_responde', 'competicion', 'sin_presupuesto']) : null,
          expectedCloseDate: randomDate(30),
          order: randomBetween(0, 5),
          createdAt: randomDate(25),
        },
      })
      dealCount++
    }
    console.log(`[Seed] ${dealCount} deals created`)

    // ─── 8. Create Agent Logs ───────────────────────────────
    for (let i = 0; i < 20; i++) {
      const conversation = randomPick(conversations)
      const agent = randomPick(agents)

      await db.agentLog.create({
        data: {
          agentId: agent.id,
          conversationId: conversation.id,
          inputMessage: randomPick(INITIAL_MESSAGES),
          outputMessage: randomPick(AI_RESPONSES),
          model: 'llama-3.3-70b-versatile',
          tokensUsed: randomBetween(200, 1500),
          latencyMs: randomBetween(500, 3000),
          confidence: randomBetween(60, 99) / 100,
          intent: randomPick(['greeting', 'question', 'buy_signal', 'objection', 'appointment', 'price_inquiry', 'service_inquiry', 'consultation']),
          action: randomPick(['question', 'educate', 'follow_up', 'close', 'handle_objection']),
          createdAt: randomDate(10),
        },
      })
    }
    console.log(`[Seed] Agent logs created`)

    // ─── 9. Create Automations (services-oriented) ──────────
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
          description: 'Notifica al equipo cuando un lead alcanza score mayor a 80',
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
            { type: 'send_message', channel: 'whatsapp', delayHours: 168, template: 'Hola {{name}}, ¿cómo va la implementación? Esperamos que todo funcione perfecto. Recuerda que tienes 30 días de soporte incluido.' },
          ]),
          isActive: true,
        },
      }),
    ])
    console.log(`[Seed] 3 automations created`)

    // ─── 10. Create Agent Memories ──────────────────────────
    for (let i = 0; i < 10; i++) {
      const contact = contacts[i]
      const agent = agents[0]

      await db.agentMemory.create({
        data: {
          agentId: agent.id,
          contactId: contact.id,
          key: randomPick([
            'preferred_service',
            'budget_range',
            'payment_preference',
            'objection_history',
            'last_interaction_summary',
            'business_sector',
          ]),
          value: JSON.stringify({
            service: contact.service.name,
            budget: `$${((contact.service.minPrice + randomBetween(0, 10000)) / 1000).toFixed(0)}k MXN`,
            city: randomPick(MEXICAN_CITIES),
            urgency: contact.leadScore > 60 ? 'alta' : 'baja',
          }),
          source: 'conversation',
          confidence: 0.85,
        },
      })
    }
    console.log(`[Seed] Agent memories created`)

    // ─── 11. Create Webhook Configs ─────────────────────────
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
      ],
    })
    console.log(`[Seed] Webhook configs created`)

    // ─── 12. Create Analytics Events ────────────────────────
    const eventTypes = [
      'message_sent', 'message_received', 'ai_message_sent', 'deal_created',
      'deal_won', 'conversation_created', 'contact_created', 'agent_used',
      'whatsapp_message_received', 'lead_qualified', 'automation_triggered',
    ]

    for (let i = 0; i < 50; i++) {
      await db.analyticsEvent.create({
        data: {
          workspaceId: workspace.id,
          eventType: randomPick(eventTypes),
          eventData: JSON.stringify({
            channel: randomPick(['whatsapp', 'webchat']),
            agent: randomPick(['qualifier', 'sales', 'followup']),
            score: randomBetween(10, 95),
            service: randomPick(['Automatización', 'CRM', 'Desarrollo Web', 'Consultoría IA', 'Marketing Digital']),
          }),
          createdAt: randomDate(30),
        },
      })
    }
    console.log(`[Seed] 50 analytics events created`)

    // ─── Done! ──────────────────────────────────────────────
    const summary = {
      workspace: workspace.name,
      user: user.email,
      contacts: contacts.length,
      conversations: conversations.length,
      deals: dealCount,
      agents: agents.length,
      automations: 3,
      analyticsEvents: 50,
    }

    console.log('[Seed] ✅ Demo data creation complete!')
    console.log(`[Seed] Summary:`, JSON.stringify(summary, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Demo data seeded successfully',
      summary,
      workspaceId: workspace.id,
    })
  } catch (error) {
    console.error('[Seed Error]', error)
    return NextResponse.json(
      { error: 'Failed to seed demo data' },
      { status: 500 }
    )
  }
}

// GET endpoint to check seed status
export async function GET(req: NextRequest) {
  try {
    // GET status check — always allow (needed by frontend to detect if DB is ready)
    // Only POST (actual seeding) is guarded in production

    const workspaceCount = await db.workspace.count()
    const contactCount = await db.contact.count()
    const conversationCount = await db.conversation.count()
    const dealCount = await db.deal.count()
    const agentCount = await db.agent.count()

    const isSeeded = workspaceCount > 0

    return NextResponse.json({
      seeded: isSeeded,
      stats: {
        workspaces: workspaceCount,
        contacts: contactCount,
        conversations: conversationCount,
        deals: dealCount,
        agents: agentCount,
      },
    })
  } catch (error) {
    console.error('[Seed Status Error]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
