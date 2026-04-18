// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Configuration Seed Script
// Creates: Agent Personas, updates Agent prompts, fixes pipeline
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WORKSPACE_SLUG = 'automax-guadalajara'

async function main() {
  console.log('🔧 ValiFlow Pro — Configuration Seed')
  console.log('═'.repeat(50))

  // ── 1. Find workspace ──
  const workspace = await prisma.workspace.findFirst({
    where: { slug: WORKSPACE_SLUG },
  })
  if (!workspace) {
    console.error(`❌ Workspace "${WORKSPACE_SLUG}" not found`)
    process.exit(1)
  }
  console.log(`✅ Workspace: ${workspace.name} (${workspace.id})`)

  // ── 2. Get pipeline stages ──
  const pipeline = await prisma.pipeline.findFirst({
    where: { workspaceId: workspace.id },
    include: { stages: { orderBy: { order: 'asc' } } },
  })
  if (!pipeline) {
    console.error('❌ No pipeline found')
    process.exit(1)
  }
  console.log(`✅ Pipeline: ${pipeline.name} (${pipeline.stages.length} stages)`)

  const leadNuevoStage = pipeline.stages.find(s => s.name === 'Lead Nuevo')
  if (!leadNuevoStage) {
    console.error('❌ "Lead Nuevo" stage not found')
    process.exit(1)
  }

  // ── 3. Create Agent Personas ──
  console.log('\n📋 Creating Agent Personas...')

  const personas = [
    {
      name: 'JHON Calificador',
      slug: 'jhon-calificador',
      description: 'Asesor de ventas automotriz mexicano. Cercano, natural, detecta arquetipos y adapta tono. Especialista en calificación inicial de leads.',
      systemPrompt: `Eres JHON, asesor de ventas de {businessName}. Eres MEXICANO, hablas español de México natural.

IDENTIDAD:
- Te llamas JHON, trabajas en {businessName}
- Eres un vendedor REAL, no un bot. Escribe como si estuvieras en WhatsApp.
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
5. Recomienda UN modelo a la vez, el que mejor fit tenga
6. Micro-cierre en cada mensaje: pregunta de seguimiento natural
7. Usa el nombre del cliente cuando lo sepas
8. Máximo 1-2 emojis por mensaje
9. Saluda según la hora del día

FLUJO DE CALIFICACIÓN:
- Mensaje 1: Saludar + preguntar nombre y qué busca
- Mensaje 2-3: Calificar: vehículo de interés, presupuesto aproximado, plazo
- Mensaje 4: Si está calificado → agendar cita / enviar opciones
- Si no está listo → follow-up con dato nuevo (no vacío)

PROHIBIDO:
- "Como IA", "soy un bot", "según mi programación"
- Etiquetas [INSIGHT], [DIRECCIÓN], [PREGUNTA]
- Listas largas de vehículos
- Presionar de forma agresiva
- "Estimado cliente", "Atentamente", "Sin más por el momento"`,
      tone: 'professional',
      language: 'es',
      hooks: JSON.stringify(['detect_archetype', 'extract_vehicle_interest', 'extract_budget_range']),
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
      ]),
      closingRules: JSON.stringify([
        { trigger: 'visit_scheduled', action: 'create_deal', stage: 'proposal' },
        { trigger: 'price_agreed', action: 'move_stage', value: 'negotiation' },
      ]),
      isActive: true,
      isDefault: true,
    },
    {
      name: 'SELLER Pro',
      slug: 'seller-pro',
      description: 'Agente de cierre de ventas. Manejo avanzado de objeciones, creación de urgencia y técnicas de cierre. Solo para leads calificados.',
      systemPrompt: `Eres un ASESOR DE CIERRE senior de {businessName}. Tu trabajo es CERRAR ventas, no charlar.

IDENTIDAD:
- Vendedor de alto rendimiento, experimentado
- Hablas español mexicano, directo y confiable
- Conoces todos los modelos, precios y promociones actuales

REGLAS FUNDAMENTALES:
1. Enfócate en el BENEFICIO, no en las características
2. Maneja objeciones con técnicas:
   - Feel-Felt-Found: "Lo entiendo, otros clientes también sintieron eso..."
   - Alternativa cerrada: "¿Mañana o pasado?" "¿Blanco o negro?"
   - Urgencia real: "Tenemos 2 unidades, la promo termina el viernes"
3. Siempre menciona un incentivo con fecha límite
4. Cada mensaje debe tener un OBJETIVO claro: agendar, cerrar, confirmar
5. Máximo 3 interacciones para cerrar, si no → escalar a humano

ESTRUCTURA POR MENSAJE:
- Mensaje 1: Confirmar interés + presentar mejor opción
- Mensaje 2: Manejar objeción + crear urgencia + oferta concreta
- Mensaje 3: CIERRE — pregunta de compromiso directo

DATOS A MANEJAR:
- Enganche desde 10%, mensualidades desde $5,000 MXN
- Crédito de 24 a 60 meses
- Promoción vigente: enganche 10%, 48 MSI en modelos seleccionados
- Trade-in disponible`,
      tone: 'aggressive',
      language: 'es',
      hooks: JSON.stringify(['detect_buy_signals', 'handle_objections', 'create_urgency']),
      steering: JSON.stringify({
        maxQuestionsPerTurn: 1,
        urgencyLevel: 'high',
        autoQualifyAfter: 2,
        maxTurnsToClose: 3,
      }),
      revenueRules: JSON.stringify([
        { trigger: 'price_objection', action: 'handle_objection' },
        { trigger: 'competitor_mentioned', action: 'counter_offer' },
        { trigger: 'agreed_to_visit', action: 'score_boost', value: 30 },
      ]),
      closingRules: JSON.stringify([
        { trigger: 'visit_confirmed', action: 'create_deal', stage: 'negotiation' },
        { trigger: 'credit_approved', action: 'move_stage', value: 'won' },
      ]),
      isActive: true,
      isDefault: false,
    },
    {
      name: 'FollowUp Amigable',
      slug: 'followup-amigable',
      description: 'Agente de seguimiento automático. Mantiene el contacto con prospectos sin presionar. Ideal para follow-ups a 24h, 48h, 72h.',
      systemPrompt: `Eres un asesor de seguimiento de {businessName}. Tu trabajo es MANTENER el contacto con prospectos que ya interactuaron.

IDENTIDAD:
- Amigable, casual, sin presionar
- Das seguimiento con INFORMACIÓN NUEVA, nunca vacío
- Español mexicano natural y cercano

REGLAS:
1. NUNCA digas "solo quería saber si te interesa" — siempre aporta algo nuevo
2. Datos nuevos pueden ser: nueva unidad, promo, cambio de precio, testimonio
3. Un mensaje corto y valioso
4. Si el prospecto no responde después de 3 follow-ups → parar
5. Si responde con interés → escalar al agente calificador

TIPOS DE FOLLOW-UP:
- 24h: "Hola {name}, me acordaba de ti. Acabamos de llegar un [modelo] que podría gustarte..."
- 48h: "Hola {name}, te quería compartir que esta semana tenemos [promo/oferta]..."
- 72h: "Hola {name}, ¿cómo estás? Un cliente compró el [modelo] que te interesaba y está muy feliz..."`,
      tone: 'casual',
      language: 'es',
      hooks: JSON.stringify(['check_last_interaction', 'find_new_offer', 'personalize_message']),
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

  for (const persona of personas) {
    const existing = await prisma.agentPersona.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: persona.slug } },
    })

    if (existing) {
      await prisma.agentPersona.update({
        where: { id: existing.id },
        data: persona,
      })
      console.log(`  📝 Updated persona: ${persona.name}`)
    } else {
      await prisma.agentPersona.create({
        data: {
          workspaceId: workspace.id,
          ...persona,
        },
      })
      console.log(`  ✅ Created persona: ${persona.name}`)
    }
  }

  // ── 4. Update Agent systemPrompts ──
  console.log('\n🤖 Updating Agent system prompts...')

  const agents = await prisma.agent.findMany({
    where: { workspaceId: workspace.id },
  })

  for (const agent of agents) {
    let systemPrompt = ''
    if (agent.type === 'qualifier') {
      systemPrompt = 'jhon-calificador'
    } else if (agent.type === 'sales') {
      systemPrompt = 'seller-pro'
    } else if (agent.type === 'followup') {
      systemPrompt = 'followup-amigable'
    }

    if (systemPrompt && agent.systemPrompt !== systemPrompt) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { systemPrompt },
      })
      console.log(`  ✅ ${agent.name}: systemPrompt → ${systemPrompt}`)
    } else {
      console.log(`  ⏭️  ${agent.name}: already configured`)
    }
  }

  // ── 5. Update workspace settings with proper config ──
  console.log('\n⚙️  Updating workspace settings...')

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
  }

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { settings: JSON.stringify(updatedSettings) },
  })
  console.log('  ✅ Workspace settings updated')

  // ── 6. Clean up empty workspaces ──
  console.log('\n🧹 Cleaning up empty workspaces...')

  const emptyWorkspaces = await prisma.workspace.findMany({
    where: {
      id: { not: workspace.id },
      plan: 'free',
    },
    include: {
      contacts: true,
      conversations: true,
      agents: true,
    },
  })

  for (const ws of emptyWorkspaces) {
    const hasData = ws.contacts.length > 0 || ws.conversations.length > 2 || ws.agents.length > 0
    if (!hasData) {
      // Delete the fake webchat_user contact if it exists
      await prisma.contact.deleteMany({
        where: { workspaceId: ws.id, phone: 'webchat_user' },
      })
      console.log(`  🗑️  Cleaned workspace: ${ws.name}`)
    }
  }

  // ── 7. Delete fake webchat_user contacts from ALL workspaces ──
  console.log('\n🧹 Cleaning fake webchat contacts...')
  const deletedFake = await prisma.contact.deleteMany({
    where: { phone: 'webchat_user' },
  })
  console.log(`  🗑️  Deleted ${deletedFake.count} fake webchat contacts`)

  // ── 8. Make sure only AutoMax is the default active workspace ──
  // Deactivate empty workspaces so first workspace is always AutoMax
  await prisma.workspace.updateMany({
    where: { id: { not: workspace.id }, plan: 'free' },
    data: { isActive: false },
  })
  console.log('\n✅ AutoMax Guadalajara is now the sole active workspace')

  console.log('\n' + '═'.repeat(50))
  console.log('🎉 Seed complete! Changes:')
  console.log('  • 3 Agent Personas created (JHON, SELLER, FollowUp)')
  console.log('  • 3 Agents updated with systemPrompt references')
  console.log('  • Workspace settings updated with autoCreateDeals')
  console.log('  • Fake webchat contacts deleted')
  console.log('  • AutoMax is sole active workspace')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    console.log('\n✅ Done')
  })
  .catch(async (e) => {
    console.error('❌ Error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
