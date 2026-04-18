// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Seed Demo Data
// POST /api/seed — Seeds realistic Mexican automotive sector data
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES, PLANS } from '@/lib/constants'
import bcrypt from 'bcryptjs'

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

const VEHICLES = [
  { model: 'Nissan Sentra', price: 420000, category: 'sedan' },
  { model: 'Nissan Versa', price: 310000, category: 'sedan' },
  { model: 'Nissan Kicks', price: 455000, category: 'suv' },
  { model: 'Nissan Frontier', price: 620000, category: 'pickup' },
  { model: 'Toyota Corolla', price: 398000, category: 'sedan' },
  { model: 'Toyota RAV4', price: 560000, category: 'suv' },
  { model: 'Toyota Hilux', price: 680000, category: 'pickup' },
  { model: 'Honda Civic', price: 450000, category: 'sedan' },
  { model: 'Honda CR-V', price: 590000, category: 'suv' },
  { model: 'Mazda CX-5', price: 535000, category: 'suv' },
  { model: 'Volkswagen Jetta', price: 430000, category: 'sedan' },
  { model: 'Volkswagen Tiguan', price: 580000, category: 'suv' },
  { model: 'Chevrolet Tracker', price: 475000, category: 'suv' },
  { model: 'Chevrolet Silverado', price: 850000, category: 'pickup' },
  { model: 'Kia Sportage', price: 520000, category: 'suv' },
  { model: 'Hyundai Tucson', price: 505000, category: 'suv' },
  { model: 'Ford Mustang', price: 950000, category: 'deportivo' },
  { model: 'Ford Ranger', price: 720000, category: 'pickup' },
  { model: 'Kia Seltos', price: 445000, category: 'suv' },
  { model: 'Mazda 3', price: 410000, category: 'sedan' },
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
  'Hola, busco información sobre un auto nuevo',
  'Buenos días, quiero saber precios de SUV',
  'Me interesa el financiamiento de un sedan',
  '¿Cuánto enganche necesito para un auto?',
  'Hola vi su anuncio en Facebook, quiero información',
  'Tengo un Nissan de trade-in, me interesa cambiarlo',
  '¿Tienen disponibilidad para prueba de manejo?',
  'Quiero agendar una cita para ver el auto',
  'Cuál es el precio del Nissan Sentra 2024?',
  '¿A cuántos meses puedo financiar?',
  'Tengo mi crédito INFONAVIT, ¿puedo usarlo?',
  '¿Cuánto es la mensualidad de un SUV?',
  'Me interesa pero está muy caro',
  '¿Tienen promociones este mes?',
  'Ya vi en otra agencia un mejor precio',
  'Lo voy a pensar, necesito consultar con mi esposa',
  '¿Qué documentos necesito para el crédito?',
  'TengoBURO limpio, ¿me aprueban rápido?',
  '¿Tienen unidades en color blanco?',
  'Quiero algo economico para mi primera compra',
]

const AI_RESPONSES = [
  '¡Hola! Bienvenido a nuestra agencia. Me gustaría conocer un poco más sobre lo que buscas. ¿Qué tipo de vehículo tienes en mente y cuál es tu presupuesto aproximado?',
  '¡Excelente elección! Las SUV son muy versátiles y perfectas para la ciudad. ¿Lo usarías principalmente para ciudad o también viajes largos?',
  'Perfecto, el financiamiento es una excelente opción. Tenemos planes desde 24 hasta 48 meses sin intereses. ¿Cuál es el monto mensual con el que te sentirías cómodo?',
  'El enganche varía según el modelo. Tenemos opciones desde 10% del valor del vehículo. Para darte una mejor opción, ¿cuál es tu presupuesto total?',
  '¡Gracias por contactarnos! Me encantaría ayudarte a encontrar el vehículo ideal. ¿Ya tienes algún modelo en mente o quieres que te muestre las opciones disponibles?',
  '¡Perfecto! El trade-in es una excelente opción para reducir el enganche. ¿Podrías decirme el modelo, año y kilometraje de tu auto actual?',
  '¡Por supuesto! Las pruebas de manejo son completamente gratuitas y sin compromiso. ¿Qué día de la semana te queda mejor?',
  '¡Excelente idea! Agendar una cita es el mejor paso. ¿Te gustaría venir por la mañana o por la tarde? Tenemos disponibilidad de lunes a sábado.',
  'El Sentra es uno de nuestros mejores vendedores. Tiene excelente valor de reventa y bajo consumo. ¿Te gustaría saber sobre financiamiento o pagaría de contado?',
  'Ofrecemos planes flexibles de 24 a 60 meses. A 48 meses sin intereses el Sentra quedaría en aproximadamente $8,700 MXN mensuales. ¿Te gustaría agendar una cita para verlo?',
  'El INFONAVIT se puede utilizar en algunos desarrollos, pero para vehículos contado es diferente. Sin embargo, tenemos opciones de crédito automotriz muy accesibles.',
  'Las mensualidades de SUV dependen del modelo. ¿Te interesa algo compacto como una Kicks ($9,200/mes) o algo más grande como un Pathfinder ($15,800/mes)?',
  'Entiendo tu preocupación sobre el precio. Sin embargo, un auto no es un gasto, es una herramienta que genera valor. Hablemos de financiamiento: desde $5,000 MXN mensuales. ¿Cuánto pagarías al mes?',
  '¡Sí! Este mes tenemos una promoción especial: enganche desde 10% y 48 meses sin intereses en modelos seleccionados. ¿Te gustaría saber más detalles?',
  'Entiendo que has comparado precios. ¿Pudiste verificar que incluye el mismo seguro, garantía y servicio? Nuestro paquete integral es muy competitivo.',
  'Es excelente que consultes con tu pareja. ¿Qué te parece si agendamos una cita para que vengan juntos? Así pueden ver el auto, hacer prueba de manejo y tomar la decisión juntos.',
  'Para el crédito necesitas: identificación oficial, comprobante de domicilio (no mayor a 3 meses), comprobante de ingresos y dos referencias. ¿Tienes estos documentos listos?',
  '¡Excelente! Tener BURO limpio acelera mucho el proceso. La aprobación puede ser en menos de 24 horas. ¿Te gustaría iniciar el proceso ahora?',
  '¡Sí! Tenemos unidades en varios colores incluyendo blanco, gris plata y negro. ¿Te gustaría que te aparte una para que la veas?',
  '¡Perfecto para tu primera compra! Te recomiendo algo económico pero confiable. El Nissan Versa o el Kia Seltos son excelentes opciones para empezar. ¿Cuál te llama más la atención?',
]

const TAGS_OPTIONS = [
  'interesa_suv', 'interesa_sedan', 'interesa_pickup', 'interesa_deportivo',
  'tiene_interes_financiero', 'enganche_bajo', 'buero_limpio', 'infonavit',
  'comparando_precios', 'tiene_objeciones', 'referencia', 'whatsapp_incoming',
  'facebook_lead', 'google_lead', 'conversacion_activa', 'alto_engagement',
  'vehiculo: sentra', 'vehiculo: versa', 'vehiculo: kicks', 'vehiculo: frontier',
  'vehiculo: corolla', 'vehiculo: civic', 'vehiculo: cx-5', 'vehiculo: tiguan',
  'vehiculo: tracker', 'vehiculo: sportage',
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(daysBack: number): Date {
  const now = new Date()
  return new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000)
}

function randomPhone(): string {
  return randomPick(PHONES_MOCK)
}

function randomEmail(name: string): string {
  const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']
  return `${name.toLowerCase().replace(/\s/g, '')}${randomBetween(1, 99)}@${randomPick(domains)}`
}

// ─── Seed Endpoint ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ─── Production guard ───────────────────────────────────
    // Block in production unless SEED_PIN is set
    if (process.env.NODE_ENV === 'production' && !process.env.SEED_PIN) {
      return NextResponse.json(
        { error: 'Seed endpoint is disabled in production' },
        { status: 404 }
      )
    }

    // ─── PIN Protection only for destructive reset operations ──
    // Standard seed (idempotent create-if-not-exists) works without PIN
    // Destructive reset requires ?reset=true&pin=PIN
    const { searchParams } = new URL(req.url)
    const isReset = searchParams.get('reset') === 'true'

    if (isReset) {
      const providedPin = searchParams.get('pin')
      const expectedPin = process.env.SEED_PIN || 'VALIFLOW_DEMO_2024'
      if (providedPin !== expectedPin) {
        return NextResponse.json(
          { error: 'PIN de seguridad requerido para reset. Contacta al administrador.', code: 'FORBIDDEN' },
          { status: 403 }
        )
      }
    }

    // Check if data already exists (idempotent)
    const existingWorkspace = await db.workspace.findFirst()
    if (existingWorkspace) {
      // Check if demo user exists
      const existingDemoUser = await db.user.findUnique({
        where: { email: 'demo@valiflow.com' },
      })
      if (existingDemoUser) {
        return NextResponse.json({
          success: false,
          message: 'Demo data already exists.',
          workspaceId: existingWorkspace.id,
        })
      }
    }

    console.log('[Seed] Starting demo data creation...')

    // ─── 1. Create Demo User (with hashed password) ────────
    const hashedPassword = await bcrypt.hash('demo1234', 12)

    // Check if demo user already exists
    let demoUser = await db.user.findUnique({
      where: { email: 'demo@valiflow.com' },
    })

    if (!demoUser) {
      demoUser = await db.user.create({
        data: {
          name: 'Administrador Demo',
          email: 'demo@valiflow.com',
          password: hashedPassword,
          role: 'owner',
          phone: '5512340000',
          timezone: 'America/Mexico_City',
          locale: 'es-MX',
        },
      })
      console.log(`[Seed] User created: ${demoUser.email}`)
    } else {
      // Update password hash if needed
      await db.user.update({
        where: { id: demoUser.id },
        data: { password: hashedPassword },
      })
      console.log(`[Seed] User already exists, password updated: ${demoUser.email}`)
    }

    // ─── 2. Create Demo Workspace ───────────────────────────
    let workspace = await db.workspace.findFirst({
      where: { ownerId: demoUser.id },
    })

    if (!workspace) {
      const defaultPlan = PLANS.pro
      workspace = await db.workspace.create({
        data: {
          name: 'Mi Negocio',
          slug: 'mi-negocio',
          ownerId: demoUser.id,
          industry: 'automotive',
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
          }),
          members: {
            create: {
              userId: demoUser.id,
              role: 'owner',
            },
          },
          subscription: {
            create: {
              plan: 'pro',
              status: 'active',
              provider: 'stripe',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              amount: defaultPlan.price,
              currency: 'MXN',
              interval: 'monthly',
            },
          },
        },
      })
      console.log(`[Seed] Workspace created: ${workspace.name}`)
    } else {
      console.log(`[Seed] Workspace already exists: ${workspace.name}`)
    }

    // Skip seeding demo data if workspace already has data
    const existingContacts = await db.contact.count({
      where: { workspaceId: workspace.id },
    })

    if (existingContacts > 0) {
      console.log('[Seed] Demo data already seeded, skipping...')
      return NextResponse.json({
        success: false,
        message: 'Demo data already seeded.',
        workspaceId: workspace.id,
      })
    }

    // ─── 3. Create Demo Agents ──────────────────────────────
    const agents = await Promise.all([
      db.agent.create({
        data: {
          workspaceId: workspace.id,
          name: 'JHON — Calificador Principal',
          type: 'qualifier',
          description: 'Agente principal de calificación de leads. Detecta intención de compra y califica prospectos.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 10,
          isActive: true,
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
          name: 'SELLER Pro — Cierre de Ventas',
          type: 'sales',
          description: 'Agente especializado en cierre de ventas y manejo de objeciones avanzadas.',
          model: 'groq',
          modelName: 'llama-3.3-70b-versatile',
          temperature: 0.8,
          maxTokens: 4096,
          personality: 'JHON',
          priority: 8,
          isActive: true,
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
          name: 'FollowUp Bot — Recordatorios',
          type: 'followup',
          description: 'Agente de seguimiento automático que mantiene el contacto con prospectos.',
          model: 'groq',
          modelName: 'llama-3.1-8b-instant',
          temperature: 0.5,
          maxTokens: 2048,
          personality: 'friendly',
          priority: 5,
          isActive: true,
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

    // ─── 4. Create Demo Contacts ────────────────────────────
    const contacts: Array<{ id: string; firstName: string; lastName: string; leadScore: number; vehicle: typeof VEHICLES[0] }> = []

    for (let i = 0; i < 20; i++) {
      const nameData = MEXICAN_NAMES[i]
      const phone = PHONES_MOCK[i]
      const source = randomPick(SOURCES)
      const vehicle = randomPick(VEHICLES)
      const leadScore = randomBetween(10, 95)

      const tags: string[] = [source === 'whatsapp' ? 'whatsapp_incoming' : `${source}_lead`]
      tags.push(`vehiculo: ${vehicle.model.toLowerCase().split(' ')[1]}`)
      if (vehicle.category === 'suv') tags.push('interesa_suv')
      else if (vehicle.category === 'sedan') tags.push('interesa_sedan')
      else if (vehicle.category === 'pickup') tags.push('interesa_pickup')

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
            preferredVehicle: vehicle.model,
            budget: vehicle.price + randomBetween(-50000, 100000),
            tradeIn: randomBetween(0, 1) === 1,
            creditScore: randomPick(['bueno', 'excelente', 'regular']),
          }),
          notes: `Interesado en ${vehicle.model}. Presupuesto ~$${(vehicle.price / 1000).toFixed(0)}k MXN. Canal: ${source}.`,
          lastMessageAt: randomDate(3),
          createdAt: randomDate(30),
        },
      })

      contacts.push({
        id: contact.id,
        firstName: nameData.first,
        lastName: nameData.last,
        leadScore,
        vehicle,
      })
    }
    console.log(`[Seed] ${contacts.length} contacts created`)

    // ─── 5. Create Pipeline ─────────────────────────────────
    const pipeline = await db.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Pipeline de Ventas — AutoMax',
        description: 'Pipeline principal de ventas automotrices',
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
      const vehicle = contact.vehicle

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
      const dealValue = vehicle.price + randomBetween(-30000, 80000)

      await db.deal.create({
        data: {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: contact.id,
          title: `${contact.firstName} ${contact.lastName} — ${vehicle.model}`,
          value: dealValue,
          currency: 'MXN',
          description: `Interés en ${vehicle.model} ${vehicle.category}. Contacto por ${contact.leadScore > 60 ? 'WhatsApp directo' : 'redes sociales'}.`,
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
      const contact = contacts.find((c) => c.id === conversation.contactId)
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
          intent: randomPick(['greeting', 'question', 'buy_signal', 'objection', 'appointment', 'price_inquiry', 'vehicle_inquiry', 'financing']),
          action: randomPick(['question', 'educate', 'follow_up', 'close', 'handle_objection']),
          createdAt: randomDate(10),
        },
      })
    }
    console.log(`[Seed] Agent logs created`)

    // ─── 9. Create Automations ──────────────────────────────
    await Promise.all([
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'Seguimiento 24h — Lead Nuevo',
          description: 'Envía mensaje de seguimiento a leads que no han respondido en 24 horas',
          triggerType: 'inactivity',
          triggerConfig: JSON.stringify({ hours: 24, stage: 'new' }),
          actions: JSON.stringify([
            { type: 'send_message', channel: 'whatsapp', template: 'Hola {{name}}, ¿tuviste oportunidad de revisar la información que te compartimos?' },
          ]),
          isActive: true,
        },
      }),
      db.automation.create({
        data: {
          workspaceId: workspace.id,
          name: 'Lead Score > 80 — Notificación',
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
            { type: 'send_message', channel: 'whatsapp', delayHours: 168, template: 'Hola {{name}}, ¿cómo te va con tu nuevo auto? Esperamos que estés disfrutándolo. Recuerda que tu primer servicio es gratuito.' },
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
            'preferred_vehicle',
            'budget_range',
            'payment_preference',
            'objection_history',
            'last_interaction_summary',
          ]),
          value: JSON.stringify({
            vehicle: contact.vehicle.model,
            budget: `$${(contact.vehicle.price / 1000).toFixed(0)}k MXN`,
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
          secret: 'demo-whatsapp-secret',
          isActive: true,
        },
        {
          workspaceId: workspace.id,
          channel: 'telegram',
          webhookUrl: '/api/webhooks/telegram',
          secret: 'demo-telegram-secret',
          isActive: false,
        },
      ],
    })
    console.log(`[Seed] Webhook configs created`)

    // ─── 12. Create Analytics Events ────────────────────────
    const eventTypes = [
      'message_sent', 'message_received', 'ai_message_sent', 'deal_created',
      'deal_won', 'conversation_created', 'contact_created', 'agent_used',
      'whatsapp_message_received',
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
          }),
          createdAt: randomDate(30),
        },
      })
    }
    console.log(`[Seed] 50 analytics events created`)

    // ─── Done! ──────────────────────────────────────────────
    const summary = {
      workspace: workspace.name,
      user: demoUser.email,
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
