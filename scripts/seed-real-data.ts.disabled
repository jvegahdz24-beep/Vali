import { db } from '@/lib/db'

const WS_ID = 'cmoef1vz50002rojbfqtjodk9'

async function seed() {
  console.log('=== Wiping generic data ===')
  
  await db.agentLog.deleteMany({ where: { agent: { workspaceId: WS_ID } } })
  await db.agentMemory.deleteMany({ where: { agent: { workspaceId: WS_ID } } })
  await db.analyticsEvent.deleteMany({ where: { workspaceId: WS_ID } })
  await db.followUpTask.deleteMany({ where: { workspaceId: WS_ID } })
  await db.followUpRule.deleteMany({ where: { workspaceId: WS_ID } })
  await db.message.deleteMany({ where: { conversation: { workspaceId: WS_ID } } })
  await db.conversation.deleteMany({ where: { workspaceId: WS_ID } })
  await db.deal.deleteMany({ where: { workspaceId: WS_ID } })
  await db.contact.deleteMany({ where: { workspaceId: WS_ID } })
  await db.automationLog.deleteMany({ where: { automation: { workspaceId: WS_ID } } })
  await db.automation.deleteMany({ where: { workspaceId: WS_ID } })
  
  console.log('Generic data wiped.')

  const pipeline = await db.pipeline.findFirst({ where: { workspaceId: WS_ID } })
  const stages = await db.pipelineStage.findMany({ where: { pipelineId: pipeline!.id }, orderBy: { order: 'asc' } })
  const agents = await db.agent.findMany({ where: { workspaceId: WS_ID } })
  const jhonAgent = agents.find(a => a.name.includes('JHON'))!

  console.log('Stages:', stages.map(s => s.name))
  console.log('Agents:', agents.map(a => a.name))

  // ═══ REAL CONTACTS ═══
  const contactsData = [
    { firstName: 'Jonathan', lastName: 'Vega', phone: '5512340001', email: 'jonathan.vega@gmail.com', source: 'whatsapp', leadScore: 85, temperature: 'hot' as const, tags: ['whatsapp_incoming', 'interesa_automatización', 'alto_engagement', 'hot_lead'], notes: 'Prospecto calificado. Alta intención de compra. Reactivando negocio de servicios.', customFields: { city: 'CDMX', sector: 'servicios', teamSize: '5-20' } },
    { firstName: 'Sonya', lastName: 'RnSl', phone: '5598765432', email: 'sonya.rnsl@outlook.com', source: 'whatsapp', leadScore: 72, temperature: 'warm' as const, tags: ['whatsapp_incoming', 'reactivación', 'interesa_crm', 'conversacion_activa'], notes: 'Lead de reactivación. Tienda en Guadalajara.', customFields: { city: 'Guadalajara', sector: 'comercio', teamSize: '1-5' } },
    { firstName: 'Roberto', lastName: 'Méndez', phone: '3323456780', email: 'roberto.m@hotmail.com', source: 'facebook', leadScore: 55, temperature: 'warm' as const, tags: ['facebook_lead', 'interesa_marketing_digital', 'conversacion_activa'], notes: 'Interesado en marketing digital. Comparando opciones.', customFields: { city: 'Guadalajara', sector: 'retail', teamSize: '5-20' } },
    { firstName: 'María', lastName: 'Delgado', phone: '8112345670', email: 'maria.delgado@gmail.com', source: 'google', leadScore: 42, temperature: 'cold' as const, tags: ['google_lead', 'interesa_crm', 'comparando_precios'], notes: 'Buscando CRM para su empresa de servicios.', customFields: { city: 'Monterrey', sector: 'servicios', teamSize: '20-50' } },
    { firstName: 'Carlos', lastName: 'Estrada', phone: '5545678900', email: 'carlos.e@outlook.com', source: 'whatsapp', leadScore: 90, temperature: 'hot' as const, tags: ['whatsapp_incoming', 'interesa_automatización', 'tiene_interes_financiero', 'hot_lead'], notes: 'Muy interesado. Pidió demo. Presupuesto confirmado.', customFields: { city: 'CDMX', sector: 'financiero', teamSize: '20-50' } },
  ]

  const created: any[] = []
  for (const c of contactsData) {
    const contact = await db.contact.create({
      data: {
        workspaceId: WS_ID, firstName: c.firstName, lastName: c.lastName, phone: c.phone,
        email: c.email, source: c.source, status: 'active', leadScore: c.leadScore,
        temperature: c.temperature, tags: JSON.stringify(c.tags),
        customFields: JSON.stringify(c.customFields), notes: c.notes,
        lastMessageAt: new Date(), createdAt: new Date(Date.now() - Math.random() * 15 * 86400000),
      },
    })
    created.push(contact)
    console.log('  Contact:', c.firstName, c.lastName, '| Score:', c.leadScore, '| Temp:', c.temperature)
  }

  // ═══ JONATHAN VEGA — Full qualifying conversation ═══
  const jonathanConvo = await db.conversation.create({
    data: { workspaceId: WS_ID, contactId: created[0].id, channel: 'whatsapp', status: 'active', assignedAgentId: jhonAgent.id, lastMessageAt: new Date(), lastMessagePreview: 'Dame más detalles de cómo funciona', externalId: 'ev_jonathan_001', metadata: JSON.stringify({ instance: 'demo-evolution-instance' }) },
  })

  const jMsgs = [
    { c: 'Hola, vi su página de automatización con WhatsApp', d: 'inbound', h: 48 },
    { c: 'Me llamo Jonathan, tengo un negocio de servicios', d: 'inbound', h: 47.5 },
    { c: 'Recibo como 150 mensajes al día y no puedo con todos', d: 'inbound', h: 47 },
    { c: '¿Cuánto cuesta el sistema?', d: 'inbound', h: 46.5 },
    { c: 'Quiero volver a activar mi negocio, lo tuve que pausar', d: 'inbound', h: 24 },
    { c: 'Dame más detalles de cómo funciona', d: 'inbound', h: 1 },
    { c: '¡Buenas tardes! Soy Jhon. ¿Con quién tengo el gusto?', d: 'outbound', h: 47.8 },
    { c: 'Qué onda Jonathan. ¿Qué tipo de servicios manejas? Así te digo si la automatización te sirve.', d: 'outbound', h: 47.3 },
    { c: '150 mensajes diarios sin automatizar es pesado. La mayoría de nuestros clientes pasa de horas a segundos de respuesta.', d: 'outbound', h: 46.8 },
    { c: 'Antes de darte un número, ¿cuánto tiempo le dedicas a responder manualmente? Así calculo el ROI real.', d: 'outbound', h: 46.3 },
    { c: 'Jonathan, que quieras reactivar me dice que ya sabes lo que necesitas. ¿Qué fue lo que te hizo pausar?', d: 'outbound', h: 23.8 },
    { c: 'Claro. Te conectas con WhatsApp Business, configuras flujos automáticos y el bot responde mientras tú cierras ventas. ¿Agendamos una llamada?', d: 'outbound', h: 0.8 },
  ]

  for (const m of jMsgs) {
    await db.message.create({
      data: { conversationId: jonathanConvo.id, content: m.c, type: 'text', direction: m.d, senderType: m.d === 'inbound' ? 'contact' : 'agent', isAiGenerated: m.d === 'outbound', status: m.d === 'outbound' ? 'delivered' : 'read', createdAt: new Date(Date.now() - m.h * 3600000) },
    })
  }
  console.log('  Jonathan: 12 messages (6 inbound + 6 outbound)')

  // ═══ SONYA RNSL — Reactivation conversation ═══
  const sonyaConvo = await db.conversation.create({
    data: { workspaceId: WS_ID, contactId: created[1].id, channel: 'whatsapp', status: 'active', assignedAgentId: jhonAgent.id, lastMessageAt: new Date(Date.now() - 3 * 86400000), lastMessagePreview: 'Necesito reactivar mi cuenta', externalId: 'ev_sonya_001', metadata: JSON.stringify({ instance: 'demo-evolution-instance' }) },
  })

  const sMsgs = [
    { c: 'Hola, quiero saber sobre el sistema de automatización', d: 'inbound', h: 72 },
    { c: 'Me llamo Sonya', d: 'inbound', h: 71.5 },
    { c: 'Tengo una tienda en Guadalajara', d: 'inbound', h: 71 },
    { c: 'Necesito reactivar mi cuenta', d: 'inbound', h: 70 },
    { c: '¡Buenos días! Soy Jhon. ¿Con quién tengo el gusto?', d: 'outbound', h: 71.8 },
    { c: 'Qué onda Sonya. Una tienda en Guadalajara, qué padre. ¿Vendes por WhatsApp también?', d: 'outbound', h: 71.3 },
    { c: 'Sonya, entiendo que necesitas reactivar. ¿Qué fue lo que detuvo la última vez? Así evitamos que pase de nuevo.', d: 'outbound', h: 70.5 },
  ]

  for (const m of sMsgs) {
    await db.message.create({
      data: { conversationId: sonyaConvo.id, content: m.c, type: 'text', direction: m.d, senderType: m.d === 'inbound' ? 'contact' : 'agent', isAiGenerated: m.d === 'outbound', status: m.d === 'outbound' ? 'delivered' : 'read', createdAt: new Date(Date.now() - m.h * 3600000) },
    })
  }
  console.log('  Sonya: 7 messages (4 inbound + 3 outbound)')

  // ═══ DEALS ═══
  const deals = [
    { ci: 0, t: 'Jonathan Vega — Automatización WhatsApp', v: 18500, si: 3 },
    { ci: 1, t: 'Sonya RnSl — Reactivación + CRM', v: 12000, si: 2 },
    { ci: 4, t: 'Carlos Estrada — Automatización Full', v: 35000, si: 4 },
    { ci: 2, t: 'Roberto Méndez — Marketing Digital', v: 8500, si: 1 },
    { ci: 3, t: 'María Delgado — CRM Personalizado', v: 20000, si: 0 },
  ]

  for (const d of deals) {
    await db.deal.create({
      data: { workspaceId: WS_ID, pipelineId: pipeline!.id, stageId: stages[d.si].id, contactId: created[d.ci].id, title: d.t, value: d.v, currency: 'MXN', status: 'active', source: 'whatsapp', createdAt: new Date(Date.now() - Math.random() * 20 * 86400000), expectedCloseDate: new Date(Date.now() + 15 * 86400000) },
    })
    console.log('  Deal:', d.t, '| Stage:', stages[d.si].name)
  }

  // ═══ AGENT LOGS ═══
  await db.agentLog.createMany({
    data: [
      { agentId: jhonAgent.id, conversationId: jonathanConvo.id, inputMessage: 'Hola, vi su página de automatización con WhatsApp', outputMessage: '¡Buenas tardes! Soy Jhon. ¿Con quién tengo el gusto?', model: 'glm-4.5-flash', tokensUsed: 350, latencyMs: 1200, confidence: 0.95, intent: 'greeting', action: 'question' },
      { agentId: jhonAgent.id, conversationId: jonathanConvo.id, inputMessage: 'Quiero volver a activar mi negocio', outputMessage: 'Jonathan, que quieras reactivar me dice que ya sabes lo que necesitas.', model: 'glm-4.5-flash', tokensUsed: 420, latencyMs: 1500, confidence: 0.92, intent: 'buy_signal', action: 'follow_up' },
      { agentId: jhonAgent.id, conversationId: sonyaConvo.id, inputMessage: 'Necesito reactivar mi cuenta', outputMessage: 'Sonya, entiendo que necesitas reactivar.', model: 'glm-4.5-flash', tokensUsed: 380, latencyMs: 1300, confidence: 0.88, intent: 'buy_signal', action: 'follow_up' },
    ],
  })

  // ═══ AGENT MEMORY (Jonathan — DB persistence state) ═══
  await db.agentMemory.createMany({
    data: [
      { agentId: jhonAgent.id, contactId: created[0].id, key: 'conversation_state_v2', value: JSON.stringify({ nombre: 'Jonathan', tipo_negocio: 'servicios', dolor: 'no puede contestar 150 mensajes/día', leads_semanales: 150, compra_flag: true, etapa: 'solucion', datos_confirmados: ['nombre', 'tipo_negocio', 'dolor', 'leads_semanales', 'compra_flag'], preguntasEnEtapa: 1, turnosSinProgreso: 0, ultimaPregunta: '¿Agendamos una llamada para mostrártelo?' }), source: 'conversation', confidence: 1.0, expiresAt: new Date(Date.now() + 48 * 3600000) },
      { agentId: jhonAgent.id, contactId: created[0].id, key: 'preferred_service', value: JSON.stringify({ service: 'Automatización WhatsApp', budget: '~$18,500 MXN', urgency: 'alta' }), source: 'conversation', confidence: 0.9 },
      { agentId: jhonAgent.id, contactId: created[1].id, key: 'conversation_state_v2', value: JSON.stringify({ nombre: 'Sonya', tipo_negocio: 'tienda', dolor: 'necesita reactivar', etapa: 'diagnostico', datos_confirmados: ['nombre', 'tipo_negocio'], preguntasEnEtapa: 0, turnosSinProgreso: 0 }), source: 'conversation', confidence: 1.0, expiresAt: new Date(Date.now() + 48 * 3600000) },
    ],
  })

  // ═══ ANALYTICS ═══
  await db.analyticsEvent.createMany({
    data: [
      { workspaceId: WS_ID, eventType: 'message_received', eventData: JSON.stringify({ channel: 'whatsapp', contact: 'Jonathan Vega' }) },
      { workspaceId: WS_ID, eventType: 'ai_message_sent', eventData: JSON.stringify({ channel: 'whatsapp', contact: 'Jonathan Vega' }) },
      { workspaceId: WS_ID, eventType: 'deal_created', eventData: JSON.stringify({ contact: 'Jonathan Vega', value: 18500 }) },
      { workspaceId: WS_ID, eventType: 'lead_qualified', eventData: JSON.stringify({ contact: 'Jonathan Vega', score: 85 }) },
      { workspaceId: WS_ID, eventType: 'buy_signal_detected', eventData: JSON.stringify({ contact: 'Jonathan Vega', signal: 'reactivacion_negocio' }) },
      { workspaceId: WS_ID, eventType: 'message_received', eventData: JSON.stringify({ channel: 'whatsapp', contact: 'Sonya RnSl' }) },
      { workspaceId: WS_ID, eventType: 'buy_signal_detected', eventData: JSON.stringify({ contact: 'Sonya RnSl', signal: 'reactivacion' }) },
      { workspaceId: WS_ID, eventType: 'deal_created', eventData: JSON.stringify({ contact: 'Carlos Estrada', value: 35000 }) },
      { workspaceId: WS_ID, eventType: 'message_received', eventData: JSON.stringify({ channel: 'whatsapp', contact: 'Carlos Estrada' }) },
      { workspaceId: WS_ID, eventType: 'automation_triggered', eventData: JSON.stringify({ automation: 'Seguimiento 24h', contact: 'Roberto Méndez' }) },
    ],
  })

  // ═══ VERIFY ═══
  const [cCount, convCount, mCount, dCount, alCount, memCount] = await Promise.all([
    db.contact.count({ where: { workspaceId: WS_ID } }),
    db.conversation.count({ where: { workspaceId: WS_ID } }),
    db.message.count({ where: { conversation: { workspaceId: WS_ID } } }),
    db.deal.count({ where: { workspaceId: WS_ID } }),
    db.agentLog.count({ where: { agent: { workspaceId: WS_ID } } }),
    db.agentMemory.count({ where: { agent: { workspaceId: WS_ID } } }),
  ])

  console.log('\n=== FINAL STATE ===')
  console.log(`  Contacts: ${cCount}`)
  console.log(`  Conversations: ${convCount}`)
  console.log(`  Messages: ${mCount}`)
  console.log(`  Deals: ${dCount}`)
  console.log(`  Agent Logs: ${alCount}`)
  console.log(`  Agent Memories: ${memCount}`)
  console.log('\n✅ Real data restored!')
}

seed().catch(e => { console.error('ERROR:', e); process.exit(1) }).finally(() => db.$disconnect())
