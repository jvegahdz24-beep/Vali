// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Marketing AI Generation Endpoint
// POST /api/marketing/generate
// Generates strategies, copy, scripts, audience profiles using AI
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { chatWithAI } from '@/lib/ai/providers'

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`${ip}:marketing:generate`, RATE_LIMITS.aiChat.limit, RATE_LIMITS.aiChat.windowMs)
    if (!rl.success) {
      return Response.json({ error: 'Demasiados intentos.', code: 'RATE_LIMITED' }, { status: 429 })
    }

    const session = await requireAuth(req)
    const body = await req.json()
    const {
      workspaceId,
      type, // 'strategy' | 'copy' | 'copy_ad' | 'video_script' | 'story' | 'calendar' | 'audience' | 'optimize' | 'reactivate'
      objective,       // ventas, leads, branding, retencion
      channels,        // ['instagram','facebook',...]
      tone,            // profesional, casual, urgente, empatico
      audience,        // description of target audience
      product,         // product/service being marketed
      brand,           // brand name / style
      pipelineStage,   // current CRM pipeline stage context
      saveTo,          // campaignId to save content to (optional)
      count,           // number of variations (default 1)
      campaignId,      // for optimize: specific campaign to analyze
    } = body

    if (!workspaceId || !type) {
      return Response.json({ error: 'workspaceId y type son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    // ── Fetch CRM context for richer personalization ──
    const [contactCount, hotLeads, wonDeals, workspace] = await Promise.all([
      db.contact.count({ where: { workspaceId } }),
      db.leadProfile.count({ where: { workspaceId, temperature: 'hot' } }),
      db.deal.count({ where: { workspaceId, status: 'won' } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, industry: true } }),
    ])

    const crmContext = `
Datos del CRM del negocio:
- Industria: ${workspace?.industry || 'general'}
- Total contactos: ${contactCount}
- Leads calientes: ${hotLeads}
- Deals ganados: ${wonDeals}
- Etapa de pipeline activa: ${pipelineStage || 'no especificada'}
`.trim()

    // Contexto de CRM ENRIQUECIDO para la estrategia: segmentación REAL del
    // negocio (temperatura, fuentes, arquetipos, objeciones y embudo). Antes la
    // estrategia solo recibía 3 conteos agregados. (Auditoría A.2.7 §Pantalla 2.)
    let strategyContext = crmContext
    if (type === 'strategy') {
      const [warmLeads, coldLeads, sources, archetypes, objections, dealsByStatus] = await Promise.all([
        db.leadProfile.count({ where: { workspaceId, temperature: 'warm' } }),
        db.leadProfile.count({ where: { workspaceId, temperature: 'cold' } }),
        db.contact.groupBy({ by: ['source'], where: { workspaceId }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 6 }),
        db.leadProfile.groupBy({ by: ['archetype'], where: { workspaceId }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 6 }),
        db.leadProfile.findMany({ where: { workspaceId, NOT: { mainObjection: null } }, select: { mainObjection: true }, take: 120 }),
        db.deal.groupBy({ by: ['status'], where: { workspaceId }, _count: { id: true } }),
      ])
      const objFreq: Record<string, number> = {}
      for (const o of objections) { if (o.mainObjection) objFreq[o.mainObjection] = (objFreq[o.mainObjection] || 0) + 1 }
      const topObj = Object.entries(objFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([o, n]) => `${o} (${n})`)
      const fmt = (arr: Array<Record<string, unknown>>, key: string) => arr.map((x) => `${(x[key] as string) || 'sin dato'}: ${(x._count as { id: number }).id}`).join(', ')
      strategyContext = `${crmContext}
- Temperatura de leads: caliente ${hotLeads}, tibio ${warmLeads}, frío ${coldLeads}
- Fuentes de contactos: ${fmt(sources as Array<Record<string, unknown>>, 'source') || 'sin datos'}
- Arquetipos de lead: ${fmt(archetypes as Array<Record<string, unknown>>, 'archetype') || 'sin datos'}
- Principales objeciones reales de tus leads: ${topObj.length ? topObj.join('; ') : 'sin datos'}
- Embudo (deals por estado): ${fmt(dealsByStatus as Array<Record<string, unknown>>, 'status') || 'sin datos'}`.trim()
    }

    const requestedChannels = Array.isArray(channels)
      ? channels.map(String)
      : typeof channels === 'string'
        ? channels.split(',').map((channel: string) => channel.trim())
        : []
    // Telegram YA es un canal válido del módulo → se incluye (antes se filtraba).
    const marketingChannels = requestedChannels.filter((channel: string) => !!channel)
    const channelList = marketingChannels.length ? marketingChannels.join(', ') : 'Instagram, Facebook'
    const variations = Math.min(parseInt(String(count || 1)), 5)

    // ── Build prompt based on type ──
    let systemPrompt = `Eres un experto en marketing digital, publicidad en redes sociales y copywriting de alta conversión. 
Respondes siempre en español. Generas contenido específico, accionable y listo para publicar.
No uses frases genéricas. Adapta el tono y el mensaje al canal y audiencia indicados.`

    let userPrompt = ''

    if (type === 'strategy') {
      userPrompt = `Genera una estrategia de marketing digital completa con estos datos:
- Negocio/Producto: ${product || 'el negocio'}
- Marca: ${brand || workspace?.name || 'la empresa'}
- Objetivo principal: ${objective || 'leads'}
- Canales: ${channelList}
- Audiencia: ${audience || 'público general interesado en el producto'}
- Tono de comunicación: ${tone || 'profesional'}
${strategyContext}

Usa los datos reales del CRM de arriba para segmentar y priorizar (menciónalos explícitamente).

La estrategia debe incluir:
1. Descripción del público objetivo (3 segmentos)
2. Propuesta de valor central (1 párrafo)
3. Tácticas por canal (1-2 por canal)
4. Embudo de ventas (TOFU, MOFU, BOFU) con acciones concretas
5. KPIs recomendados
6. Plan de contenido semanal (frecuencia por canal)

Devuelve la respuesta estructurada en secciones con encabezados markdown.`
    } else if (type === 'copy' || type === 'copy_ad') {
      userPrompt = `Genera ${variations} variación(es) de copy publicitario para:
- Producto/Servicio: ${product || 'el producto'}
- Canal: ${channelList}
- Objetivo: ${objective || 'leads'}
- Audiencia: ${audience || 'público objetivo'}
- Tono: ${tone || 'profesional'}
- Marca: ${brand || workspace?.name}

Para cada variación incluye:
- Headline (título llamativo, máx 10 palabras)
- Cuerpo del anuncio (2-3 párrafos cortos)
- CTA (llamada a la acción)
- Hashtags relevantes (si aplica para Instagram/TikTok)

Formato: separa cada variación con "---VARIACIÓN [N]---"`
    } else if (type === 'video_script') {
      userPrompt = `Genera ${variations} guión(es) de video para Reels/TikTok/Story sobre:
- Producto/Servicio: ${product || 'el producto'}
- Canal: ${channelList}
- Objetivo: ${objective || 'branding'}
- Audiencia: ${audience || 'público objetivo'}
- Tono: ${tone || 'casual y energético'}
- Marca: ${brand || workspace?.name}

Para cada guión incluye:
- Hook (primeros 3 segundos): [texto en pantalla + acción]
- Desarrollo (10-25 segundos): descripción de escenas + diálogos
- CTA final (últimos 3-5 segundos)
- Texto/caption sugerido para la publicación
- Hashtags

Formato: separa cada guión con "---GUIÓN [N]---"`
    } else if (type === 'story') {
      userPrompt = `Genera ${variations} story(ies) para Instagram/Facebook sobre:
- Producto/Servicio: ${product || 'el producto'}
- Objetivo: ${objective || 'leads'}
- Audiencia: ${audience || 'público objetivo'}
- Tono: ${tone || 'casual'}
- Marca: ${brand || workspace?.name}

Para cada story incluye:
- Texto principal (corto, impactante)
- Elemento interactivo sugerido (encuesta, pregunta, cuenta regresiva, link)
- CTA
- Paleta de colores/estilo visual sugerido

Formato: separa cada story con "---STORY [N]---"`
    } else if (type === 'calendar') {
      const weeks = parseInt(String(count || 4))
      userPrompt = `Genera un calendario de contenido para ${weeks} semanas para:
- Negocio: ${workspace?.name || 'el negocio'} (industria: ${workspace?.industry})
- Canales: ${channelList}
- Objetivo: ${objective || 'leads y branding'}
- Tono: ${tone || 'profesional'}
- Audiencia: ${audience || 'clientes potenciales'}

Para cada semana y canal, especifica:
- Día y hora óptima de publicación
- Tipo de contenido (post, reel, story, etc)
- Tema/idea del contenido (1 frase descriptiva)
- Objetivo específico de esa publicación

Devuelve en formato de tabla markdown por semana.`
    } else if (type === 'audience') {
      userPrompt = `Analiza y genera perfiles de audiencia para:
- Negocio: ${workspace?.name || 'el negocio'} (industria: ${workspace?.industry})
- Producto/Servicio: ${product || 'los servicios del negocio'}
- Objetivo: ${objective || 'leads'}
${crmContext}

Genera 2 perfiles de buyer persona, CADA UNO en 5-6 líneas concisas (sin relleno):
- Nombre ficticio + demografía breve
- Canal/horario preferido y pain point principal
- Motivación de compra + tipo de contenido que consume
- Canal y tono recomendado + nivel de intención estimado

Cierra con 3 bullets: oportunidades de remarketing y segmentos de CRM a priorizar.
Sé DIRECTO y accionable; no excedas ~350 palabras en total.`
    } else if (type === 'optimize') {
      // Fetch campaign(s) with their content and metrics
      const campaignWhere = campaignId
        ? { id: campaignId, workspaceId }
        : { workspaceId, status: 'active' }

      const campaigns = await db.marketingCampaign.findMany({
        where: campaignWhere,
        include: {
          contents: {
            select: { id: true, type: true, channel: true, status: true, title: true, aiGenerated: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          _count: { select: { contents: true, calendarEntries: true } },
        },
        take: 5,
      })

      const campaignSummaries = campaigns.map(c => {
        const channels = (() => { try { return JSON.parse(c.channels) } catch { return [] } })()
        const metrics = (() => { try { return JSON.parse(c.metrics) } catch { return {} } })()
        const contentByStatus = c.contents.reduce((acc: Record<string, number>, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1
          return acc
        }, {})
        return `Campaña: ${c.name}
  - Objetivo: ${c.objective} | Estado: ${c.status}
  - Canales: ${channels.join(', ')}
  - Presupuesto: ${c.budget ? `$${c.budget} ${c.currency}` : 'no definido'}
  - Contenidos: ${c._count.contents} total (${Object.entries(contentByStatus).map(([k, v]) => `${k}: ${v}`).join(', ')})
  - Publicaciones calendariadas: ${c._count.calendarEntries}
  - Métricas registradas: ${JSON.stringify(metrics) === '{}' ? 'sin datos aún' : JSON.stringify(metrics)}`
      }).join('\n\n')

      userPrompt = `Analiza las siguientes campañas de marketing activas y proporciona recomendaciones concretas de optimización:

${campaignSummaries || 'No hay campañas activas todavía.'}

${crmContext}

Proporciona un análisis estructurado que incluya:
1. **Evaluación por campaña**: puntos fuertes y débiles de cada una
2. **Mix de canales**: si los canales elegidos son los óptimos para el objetivo
3. **Contenido**: equilibrio entre tipos de contenido (ads, posts orgánicos, videos, stories)
4. **Presupuesto**: distribución recomendada si hay varias campañas activas
5. **Próximas acciones prioritarias**: 3-5 acciones concretas con mayor impacto esperado
6. **KPIs a monitorear**: métricas clave para cada campaña
7. **Oportunidades de mejora**: segmentos o canales no explotados

Sé específico, usa datos del CRM cuando sea relevante, y da recomendaciones accionables.`
    } else if (type === 'reactivate') {
      // Fetch cold/reactivable leads for context
      const [coldLeads, reactivableLeads, topObjections] = await Promise.all([
        db.leadProfile.count({ where: { workspaceId, temperature: 'cold' } }),
        db.leadProfile.count({ where: { workspaceId, isReactivable: true } }),
        db.leadProfile.groupBy({
          by: ['mainObjection'],
          where: { workspaceId, mainObjection: { not: null } },
          _count: true,
          orderBy: { _count: { mainObjection: 'desc' } },
          take: 5,
        }),
      ])

      const objectionsText = topObjections
        .filter(o => o.mainObjection)
        .map(o => `- "${o.mainObjection}" (${o._count} leads)`)
        .join('\n')

      userPrompt = `Genera mensajes de reactivación humanizados para leads fríos con estos datos del CRM:
- Leads fríos totales: ${coldLeads}
- Leads marcados como reactivables: ${reactivableLeads}
- Principales objeciones registradas:
${objectionsText || '  (sin objeciones registradas)'}

${crmContext}

Genera 3 mensajes de reactivación para cada canal especificado: ${channelList}

Para cada mensaje:
1. Sé empático, NO suenes a spam ni a venta agresiva
2. Menciona algo de valor (contenido gratuito, consejo, novedad)
3. Usa un CTA suave (pregunta abierta, no "compra ya")
4. Adapta el formato al canal (WhatsApp permite emojis moderados)
5. Incluye una variante de seguimiento (segundo mensaje si no responden en 3 días)

También sugiere el mejor momento del día y día de la semana para enviarlos.
Formato: separa cada mensaje con "---MENSAJE [N] — [canal]---"`
    } else if (type === 'message') {
      // Mensaje directo (DM / WhatsApp / Telegram) — contrato §Pantalla 1.
      userPrompt = `Genera ${variations} mensaje(s) directo(s) para enviar a un cliente o lead por mensajería (WhatsApp/Telegram/DM):
- Producto/Servicio: ${product || 'el producto'}
- Canal: ${channelList}
- Objetivo: ${objective || 'retención'}
- Audiencia: ${audience || 'clientes del negocio'}
- Tono: ${tone || 'casual y cercano'}
- Marca: ${brand || workspace?.name}
${crmContext}

Requisitos de cada mensaje:
- Corto (2 a 4 líneas), conversacional, como un WhatsApp real (NO un post de red social).
- Personalizable: escribe {{nombre}} donde iría el nombre del cliente.
- Aporta algo de valor y cierra con un CTA suave (una pregunta que invite a responder).
- Máximo 1-2 emojis. Nada de sonar a spam ni venta agresiva.

Devuelve SOLO el/los mensaje(s), listos para enviar. Si es más de uno, sepáralos con "---MENSAJE [N]---".`
    } else {
      return Response.json({ error: `Tipo de generación no soportado: ${type}` }, { status: 400 })
    }

    // MiniMax aborta a los 45s (tope para no colgar WhatsApp). Los tipos que
    // generan MUCHA salida estructurada ('audience' = 3 personas × 7 puntos,
    // 'reactivate' = varios mensajes) pasaban de 45s y fallaban (visto 2026-07-22)
    // — se les recorta el maxTokens para que terminen a tiempo. Un reintento
    // único cubre el vacío/timeout ocasional; si falla, error claro (no en blanco).
    const genMsgs = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ]
    const heavy = type === 'audience' || type === 'reactivate'
    const genTokens = heavy ? 1800 : 3000
    const empty = (res: { content?: string }) => !(res.content && res.content.trim())
    let result
    try {
      result = await chatWithAI(genMsgs, 'glm', undefined, { temperature: 0.8, maxTokens: genTokens })
    } catch { result = { content: '' } }
    if (empty(result)) {
      console.warn(`[Marketing:generate] vacío/timeout (tipo=${type}), reintento`)
      try { result = await chatWithAI(genMsgs, 'glm', undefined, { temperature: 0.7, maxTokens: genTokens }) } catch { result = { content: '' } }
    }
    if (empty(result)) {
      return Response.json({ error: 'La IA está saturada en este momento. Intenta de nuevo en unos segundos.' }, { status: 503 })
    }

    // Optionally save generated content to DB
    if (saveTo && (type === 'copy' || type === 'copy_ad' || type === 'video_script' || type === 'story')) {
      const channelFirst = marketingChannels[0] || 'instagram'
      await db.marketingContent.create({
        data: {
          workspaceId,
          campaignId: saveTo,
          type: type === 'copy' ? 'copy_ad' : type,
          channel: channelFirst,
          title: `${type} - ${product || 'contenido'} (IA)`,
          content: result.content,
          tone: tone || 'neutral',
          objective: objective || 'leads',
          aiGenerated: true,
          metadata: JSON.stringify({ channels, audience, brand, generatedAt: new Date().toISOString() }),
        },
      })
    }

    return Response.json({
      success: true,
      result: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
