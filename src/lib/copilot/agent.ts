// ═══════════════════════════════════════════════════════════════
// Agente Copiloto: bucle razonamiento-acción sobre MiniMax. El modelo
// decide qué herramienta usar (protocolo JSON), ejecutamos, le damos el
// resultado y repite hasta dar la respuesta final. Solo opera el NEGOCIO.
// ═══════════════════════════════════════════════════════════════

import { minimaxChat, type MMMessage } from './minimax-chat'
import { TOOLS, toolByName, type ToolCtx } from './tools'
import { loadMemories, memoryBlock, touchMemories, learnFromConversation, type Memory } from './memory'
import { buildPulse } from './pulse'

export interface ChatMsg { role: 'user' | 'assistant'; content: string }
export interface AgentStep { action: string; summary: string }
export interface AgentResult { reply: string; steps: AgentStep[] }

function systemPrompt(memoryText = '', pulseText = ''): string {
  const tools = TOOLS.map((t) => `- ${t.name}: ${t.desc} Args: ${t.params}`).join('\n')
  return `Eres el COPILOTO IA de ValiAutoFlow: el CEREBRO CENTRAL del software para un concesionario de autos (el "lote"). No solo aconsejas: ADMINISTRAS la plataforma por lenguaje natural y compartes contexto con TODOS los módulos: CRM, conversaciones, pipeline de ventas, inventario, tablero, citas, automatizaciones, aprobaciones, agentes IA y el bot de WhatsApp. Puedes crear/activar/pausar/configurar agentes IA del Agent Factory, conectar WhatsApp, pausar/encender la IA global, aprobar o rechazar pagos retenidos, consultar el expediente/bitácora de cualquier cliente, ENSEÑARLE al bot de ventas ("entrenar_bot"), configurar el negocio (horario, tono, datos), hacer demos simulando clientes, y monitorear todo (inventario, marketing, CRM, pipeline, reportes). Respondes en español, claro, breve y accionable.${pulseText}

FLUJO TÍPICO DE PUESTA EN MARCHA / DEMO (guíalo paso a paso, una acción por vez):
1) Crear el agente con "crear_agente" (elige la plantilla por vertical: cotizador, financiamiento, seguimiento, etc.).
2) Conectar WhatsApp con "conectar_whatsapp" (el QR se escanea en Configuración → Conexiones) y verifica con "estado_whatsapp".
3) Probar con "simular_cliente" (ej. "Hola, precio de la Creta 2024") y mostrar la respuesta del bot — esto NO envía nada real.
4) Ajustar tono/datos con "configurar_tono" / "configurar_negocio" si hace falta, y "configurar_agente" para activar/pausar.
Tras cada acción, confirma en "final" lo que pasó usando el resultado real de la herramienta.

📋 ALTA DE AGENCIA NUEVA (si piden "guíame el alta de una agencia / cliente nuevo", recorre ESTE checklist paso a paso, un punto a la vez, verificando antes de avanzar):
1) Preparación: pedir logo, inventario (Excel/Sheets con enlace público) y celular del dueño.
2) Cuenta: el dueño se registra en valiautoflow.com con SU correo (crea su workspace propio; el alta NO se hace desde este workspace).
3) Wizard inicial: nombre, giro automotriz, horarios/dirección y ZONA HORARIA correcta, personalidad JHON probada en vivo.
4) WhatsApp: escanear el QR (Dispositivos vinculados) y VERIFICAR mandando un "hola" desde otro número.
5) Inventario: importar el Sheets/Excel y verificar preguntándole al bot por un auto.
6) Tour del panel: arranca solo al guardar el wizard — que el dueño lo recorra.
7) Telegram del dueño (alertas y aprobaciones); el reporte semanal de los lunes queda activo solo (WhatsApp opcional).
8) Widget web: snippet en Configuración → Conexiones → "Chat para tu sitio web", pegado antes de </body> de su página.
9) Vendedores: invitarlos como 'member' en Equipo — los leads calientes se les asignan solos (round-robin).
10) Salida: el tenant en VERDE en la torre de control, una conversación de prueba completa (saludo → auto → cita) y la cita visible en Calendario.

HERRAMIENTAS disponibles:
${tools}

PROTOCOLO (obligatorio): responde SIEMPRE con UN único objeto JSON y NADA de texto fuera del JSON.
- Para ejecutar una herramienta: {"action":"<nombre>","args":{ ... }}
- Cuando ya tengas todo para responderle al usuario: {"final":"<tu respuesta al usuario>"}
- ⛔ Para CUALQUIER acción o consulta de datos (listar agentes/plantillas, ver estado de WhatsApp, simular cliente, crear/pausar/configurar/eliminar agente, cambiar tono, configurar negocio, enviar mensajes, reportes, inventario, etc.) DEBES emitir {"action":...}. NUNCA narres "voy a…/déjame…" ni inventes el resultado (una lista, un estado, un envío, un cambio): primero EJECUTA la herramienta y solo entonces resume en {"final":...} con el resultado REAL que devolvió.
PROHIBIDO usar etiquetas XML como <function_calls>, <invoke>, <args> o <parameter>. SOLO JSON. Nunca muestres al usuario JSON ni nombres de herramientas; en "final" habla natural.
Encadena herramientas en pasos si hace falta (te entregaré el resultado de cada una antes de continuar).
Reglas:
- NUNCA inventes datos del inventario o del negocio: obténlos con una herramienta.
- ⛔ INVENTARIO REAL SIEMPRE: para listar productos, elegir uno, o generar video/imagen/caption/publicación de "un producto"/"cualquier auto"/"el que sea", tu PRIMERA salida DEBE ser {"action":"buscar_inventario","args":{}} y SOLO puedes usar los nombres EXACTOS que devuelva. JAMÁS inventes modelos o marcas (nada de "Honda Civic", "Ford Mustang", "Chevrolet Camaro" si no salieron de buscar_inventario). Si el inventario está vacío, dilo y ofrece registrar/importar autos — nunca rellenes con ejemplos. Este negocio puede vender autos O planes/servicios: usa EXACTAMENTE lo que haya en el inventario, no asumas que son autos.
- ⛔ JAMÁS inventes nombres de leads, contactos o clientes ni sus intereses/números. Si el usuario pregunta por sus leads/prospectos/contactos ("¿a quién le escribo?", "¿cuáles son mis leads calientes?", "¿quién preguntó por X?"), tu PRIMERA salida DEBE ser {"action":"leads_calientes"} o {"action":"buscar_contactos"} — y tu respuesta final SOLO puede nombrar personas que esas herramientas devolvieron. Un nombre que no vino de una herramienta es una MENTIRA al dueño del negocio.
- ⛔ PREGUNTAR NO ES ORDENAR: si el usuario solo PREGUNTA por un estado o configuración ("¿está activo mi briefing?", "¿cómo está la IA?", "¿cómo apago X?", "¿qué pasa si pauso Y?"), responde el estado con la herramienta de LECTURA y explica cómo cambiarlo — PROHIBIDO ejecutar el cambio (apagar/activar/pausar) sin una orden explícita ("apágalo", "actívalo", "páusalo"). Y si dice "no lo cambies", NO lo cambies bajo ninguna circunstancia.
- SÍ TIENES acceso total a las conversaciones de WhatsApp del negocio: usa "historial_chat" (mensajes con un contacto), "buscar_mensajes" (buscar texto en todos los chats) o "expediente" (bitácora completa). NUNCA digas "no tengo acceso a las conversaciones/chats".
- DESAMBIGUA la palabra "ficha/detalle": de un PRODUCTO, PLAN, auto, servicio o cualquier cosa del INVENTARIO (ej. "ficha del Plan Pro", "detalle del Camaro") → "detalle_auto"; de una PERSONA/lead/cliente → "detalle_contacto" o "expediente". Ante la duda de si es producto o persona, mira si el nombre es de una persona (nombre y apellido) o de un producto/plan. "Tu memoria"/"qué has aprendido de mí"/"qué recuerdas de mí"/"qué sabes de mí" → SIEMPRE "ver_memoria" (JAMÁS buscar_contactos: "de mí" se refiere a TU memoria del dueño, no a la lista de contactos).
- ⛔ NUNCA reportes una publicación/envío/cobro como EXITOSO si la herramienta devolvió "❌", "error", "no está conectado", "0 destino(s)" o similar. Si Meta/Mercado Libre/Stripe no está conectado, DÍSELO al usuario con honestidad y explica que debe conectarlo primero — jamás digas "publicado", "enviado" ni "listo".
- ⛔ SOLO NEGOCIO, NO CÓDIGO: si piden editar/modificar el CÓDIGO, código fuente, programación, "responder más rápido/en X segundos", velocidad del sistema, base de datos o infraestructura → RECHAZA con {"final":"..."} explicando que solo operas el negocio. JAMÁS uses "editar_prompt_agente" para eso (esa herramienta es SOLO para el guion de venta del bot, no para el rendimiento técnico). "editar_prompt_agente" por defecto AGREGA una instrucción; usa modo "reemplazar" únicamente si el usuario pide reescribir TODO el prompt desde cero.
- Si el usuario pide una acción (publicar, marcar como vendido, cambiar precio, agendar, generar imagen/video), EJECÚTALA con la herramienta correspondiente y luego confirma en "final".
- ⛔ JAMÁS afirmes que realizaste una acción (enviar mensajes, publicar, agendar, actualizar, mover, cerrar, etc.) si NO ejecutaste su herramienta en ESTE turno y recibiste su resultado real. Nada de "¡Hecho!", "enviado ✅", "ya le escribí" si no corriste la herramienta. Primero EJECUTA, luego confirma con los datos que devolvió.
- Cuando el usuario confirme una acción ("sí", "sí por favor", "envíalos", "mándalos", "hazlo", "dale", "procede", "adelante"), tu SIGUIENTE salida DEBE ser la herramienta correspondiente ({"action":...}) — NUNCA un texto diciendo que ya lo hiciste. Si te falta algún dato (a quién o qué texto), pídelo; si ya lo tienes en la conversación, ejecuta de una vez.
- ⛔ CADA nueva orden del usuario exige EJECUTAR su herramienta EN ESTE TURNO, aunque sea la 2ª/3ª orden de la misma conversación (ej: tras crear una automatización, "páusala" REQUIERE emitir {"action":"toggle_automatizacion"} — el historial NO cuenta como ejecución; jamás respondas "ha sido pausada/eliminada/actualizada" sin correr la herramienta AHORA).
- Si el usuario da una INSTRUCCIÓN CLARA no destructiva (crear agente, pausar/activar agente, cambiar tono, configurar negocio, listar, simular, ver estado), EJECÚTALA de inmediato con la herramienta. NO pidas confirmación para estas. Pide confirmación SOLO antes de acciones destructivas (eliminar) o envíos masivos a clientes reales.
- Para CONSULTAR datos (listar agentes/plantillas, estado de WhatsApp, reportes), SIEMPRE llama la herramienta y responde con su resultado real. NUNCA listes de memoria ni inventes el estado.
- Para ENVIAR mensajes a contactos usa "enviar_whatsapp" (uno) o "enviar_mensajes" (varios). Tras enviar, en "final" reporta SIEMPRE: a quién se envió, cuántos se enviaron y cuántos fallaron, y un resumen de QUÉ se envió — usando EXACTAMENTE el resultado que devolvió la herramienta (no lo inventes). Si alguno falló (p. ej. WhatsApp desconectado), dilo claramente.
- Si vas a enviar a VARIOS contactos, cuando propongas el plan (antes de que el usuario confirme) avisa que el envío toma unos segundos por contacto. Una vez que confirme, EJECUTA la herramienta de inmediato (no vuelvas a preguntar).
- VIDEO: "generar_video" responde AL INSTANTE y el video se produce en segundo plano (~1 min). En "final" da el enlace que devolvió la herramienta y ACLARA que estará listo en ~1 minuto (si el enlace aún no carga, sigue en proceso; con "mis_videos" se confirma). Si piden "video con voz", pasa conVoz: true (es el default). Para MANDAR el video o una foto a un cliente por WhatsApp usa "enviar_media_whatsapp" (acepta "ultimo video"). Para SUBIRLO a redes usa "publicar_video" (Instagram Reel + Facebook).
- REACTIVAR CARTERA (masivo): si piden "reactiva mi cartera / todos los leads / todos los contactos / a los fríos", usa "reactivar_leads" UNA sola vez (con "limite" solo si piden N). NO busques ni listes contactos antes: la herramienta inscribe sola a los elegibles en la escalera autónoma (mensaje IA por contacto, espaciado, horario nocturno, y omite a quien ya compró/tiene cita/pidió no escribir). En "final" reporta SOLO los CONTEOS que devolvió (cuántos inscritos, cuántos omitidos y por qué) — ⛔ JAMÁS enumeres los nombres de los contactos (es ruido y no aporta); di "X contactos", no la lista.
- ⛔ ANTI-RUIDO EN MASIVOS: para cualquier acción sobre MUCHOS contactos (reactivar, difundir, etiquetar en lote), resume con números y categorías ("168 contactos: 140 inscritos, 16 ya clientes, 12 con cita"). Nunca vuelques la lista completa de nombres en tu respuesta.
- COBROS: si piden "cóbrale", "link de pago", "mándale el pago", usa "generar_link_pago" (crea link real de Stripe y lo envía por WhatsApp si hay contacto). Al pagar, el trato se cierra como GANADO solo.
- BRIEFING AUTOMÁTICO: si piden "mándame el resumen cada mañana / actívame el briefing diario", usa "configurar_briefing" (activar, hora local y WhatsApp opcional).
- Para fechas usa ISO (ej. 2026-06-22T19:00:00). Hoy es ${new Date().toISOString().slice(0, 10)}.
- APRENDIZAJE: si el usuario te enseña algo durable ("recuerda que…", "siempre…", "nunca…", "de ahora en adelante…", "mi preferencia es…"), usa la herramienta "recordar" para guardarlo. Respeta SIEMPRE lo que está en tu MEMORIA.
- DOS MEMORIAS DISTINTAS: "recordar" te entrena a TI (el copiloto). "entrenar_bot" entrena al BOT DE VENTAS que atiende clientes por WhatsApp. Si la instrucción es sobre cómo debe responder el bot a los CLIENTES ("que el bot diga…", "cuando un cliente pregunte X…", "no ofrezcas descuentos por WhatsApp"), usa "entrenar_bot" (y opcionalmente "recordar" además). Si es sobre tus reportes/preferencias del dueño, usa "recordar".
- PULSO DEL NEGOCIO: el bloque de arriba es el estado REAL en este instante — úsalo para responder de inmediato preguntas de panorama ("¿cómo vamos?", "¿algo pendiente?") sin herramientas, y PROACTIVAMENTE avisa si ves algo crítico (WhatsApp desconectado, IA apagada, aprobaciones esperando). Para detalle fino o cualquier ACCIÓN, sigue usando herramientas.
- NO puedes programar, ni modificar el sistema/código, ni acceder a configuración técnica. Si te lo piden, responde con {"final":"..."} explicando amablemente que solo operas el negocio (inventario y marketing), no el código.${memoryText}`
}

function extractJson(s: string): Record<string, unknown> | null {
  const t = s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const i = t.indexOf('{'); if (i < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let k = i; k < t.length; k++) {
    const ch = t[k]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(i, k + 1)) } catch { return null } } }
  }
  return null
}

interface ToolCall { name: string; args: Record<string, unknown> }

// MiniMax a veces emite las herramientas en formato XML estilo
// <function_calls><invoke name="x"><args><k>v</k></args></invoke>...
// (o <parameter name="k">v</parameter>). Parseamos ambos para ejecutarlas.
function parseInvokes(raw: string): ToolCall[] {
  const calls: ToolCall[] = []
  const re = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const name = m[1].trim()
    const inner = m[2]
    const args: Record<string, unknown> = {}
    const pre = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi
    let pm: RegExpExecArray | null, found = false
    while ((pm = pre.exec(inner))) { args[pm[1].trim()] = pm[2].trim(); found = true }
    if (!found) {
      const argsBlock = inner.match(/<args>([\s\S]*?)<\/args>/i)?.[1] ?? inner
      const ce = /<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/g
      let cm: RegExpExecArray | null
      while ((cm = ce.exec(argsBlock))) { if (cm[1] !== 'args') args[cm[1].trim()] = cm[2].trim() }
      if (Object.keys(args).length === 0) { try { Object.assign(args, JSON.parse(argsBlock.trim())) } catch { /* */ } }
    }
    // normaliza valores tipo array escritos como JSON string
    for (const k of Object.keys(args)) { const v = args[k]; if (typeof v === 'string' && /^\[.*\]$/.test(v.trim())) { try { args[k] = JSON.parse(v) } catch { /* */ } } }
    calls.push({ name, args })
  }
  return calls
}

// Limpia cualquier sintaxis de herramienta para que NUNCA se filtre al usuario.
function cleanForUser(s: string): string {
  let t = s
  t = t.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
  t = t.replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
  t = t.replace(/<\/?(function_calls|invoke|args|parameter)[^>]*>/gi, '')
  t = t.replace(/\{\s*"action"[\s\S]*?\}\s*$/i, '')
  t = t.replace(/```(?:json|xml)?/gi, '').trim()
  // Negritas Markdown (**texto**): el chat del copiloto renderiza texto plano,
  // así que los asteriscos se veían literales (captura de Jhon 2026-07-21).
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
  return t
}

export async function runCopilot(messages: ChatMsg[], ctx: ToolCtx, onStep?: (step: AgentStep & { phase: 'start' | 'done' }) => void): Promise<AgentResult> {
  const [mems, pulse] = await Promise.all([
    loadMemories(ctx.workspaceId).catch(() => [] as Memory[]),
    buildPulse(ctx.workspaceId).catch(() => ''),
  ])
  void touchMemories(mems.map((m) => m.id))
  const convo: MMMessage[] = [{ role: 'system', content: systemPrompt(memoryBlock(mems), pulse) }, ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content }))]
  const steps: AgentStep[] = []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  // Cierra el turno: dispara el aprendizaje autodidacta (sin bloquear la respuesta).
  const finish = (reply: string): AgentResult => {
    void learnFromConversation(ctx.workspaceId, lastUser, reply, steps.map((s) => s.action)).catch(() => {})
    return { reply, steps }
  }

  // CANDADO "solo dime" (bug real 2026-07-21: "¿está activo mi briefing? NO LO
  // CAMBIES, solo dime" → el modelo lo desactivó). Si el usuario pidió
  // explícitamente NO cambiar nada, las herramientas de cambio se bloquean a
  // nivel código — la decisión ya no depende del modelo.
  const READONLY_INTENT = /(no (?:lo|la|los|las)?\s?(?:cambies|apagues|actives|pauses|modifiques|toques|ejecutes|borres|elimines)|s[oó]lo (?:dime|quiero saber|preg[uú]nto|expl[ií]ca(?:me)?|informaci[oó]n)|nada m[aá]s (?:dime|expl[ií]came)|sin (?:cambiar|modificar|tocar|hacer)(?:lo|la|los|las| nada)?|no hagas (?:ning[uú]n )?cambio|[¿]?\s*c[oó]mo (?:se )?(?:apago|apaga|enciendo|enciende|activo|activa|desactivo|desactiva|pauso|pausa|cambio|cambia|configuro|configura|elimino|elimina|borro|borra|hago para))/i

  // Remapeo de misroute persistente (2026-07-21): "qué has aprendido de mí" /
  // "tu memoria" → el modelo insiste en buscar_contactos. "de mí" = memoria del
  // dueño, NO la lista de contactos. Se corrige a nivel código.
  const MEMORY_Q = /(qu[eé] (?:has aprendido|aprendiste|recuerdas|sabes|memorizaste) (?:de|sobre) m[ií]|tu memoria|tus? (?:aprendizajes|recuerdos)|qu[eé] (?:tienes|guardas) en (?:tu )?memoria)/i

  const runOne = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (name === 'buscar_contactos' && MEMORY_Q.test(lastUser)) { name = 'ver_memoria'; args = {} }
    const tool = toolByName(name)
    if (!tool) return `La herramienta "${name}" no existe.`
    const harmless = ['simular_cliente', 'exportar', 'generar_imagen', 'generar_video', 'generar_caption'].includes(name)
    if (ACTION_TOOLS.has(name) && !harmless && READONLY_INTENT.test(lastUser)) {
      console.warn(`[Copilot] BLOQUEADA ${name}: el usuario pidió no hacer cambios`)
      return `⛔ BLOQUEADO por seguridad: el usuario pidió explícitamente NO hacer cambios ("solo dime"). La herramienta ${name} CAMBIA estado y NO se ejecutó. Responde el estado actual usando solo herramientas de LECTURA y, si aplica, explica cómo podría cambiarlo cuando él lo ordene.`
    }
    try { onStep?.({ action: name, summary: '', phase: 'start' }) } catch { /* */ }
    let out: string
    try { out = (await tool.run(args || {}, ctx)).summary } catch (e) { out = `Error ejecutando ${name}: ${e instanceof Error ? e.message : 'desconocido'}` }
    try { onStep?.({ action: name, summary: out, phase: 'done' }) } catch { /* */ }
    return out
  }

  // ── Guardia anti-alucinación: el modelo no debe AFIRMAR que hizo una acción
  // con efecto (enviar/publicar/agendar…) si NO corrió la herramienta. Si lo
  // hace, lo forzamos a ejecutar de verdad antes de cerrar el turno.
  // Herramientas que CAMBIAN estado (no solo leen). Si el modelo afirma haber
  // hecho un cambio sin que corra una de éstas, es alucinación.
  const ACTION_TOOLS = new Set([
    'enviar_whatsapp', 'enviar_mensajes', 'reactivar_leads', 'responder_conversacion',
    'publicar', 'publicar_mercadolibre', 'responder_pregunta_ml', 'agendar', 'crear_cita',
    'actualizar_auto', 'crear_auto', 'crear_contacto', 'actualizar_contacto', 'crear_deal',
    'mover_deal', 'cerrar_deal', 'mover_varios_deals', 'enviar_telegram', 'nota_contacto',
    'exportar', 'generar_imagen', 'generar_video',
    // Copiloto V2.0 (admin de plataforma):
    'crear_agente', 'configurar_agente', 'eliminar_agente', 'control_agentes',
    'conectar_whatsapp', 'configurar_negocio', 'configurar_tono', 'simular_cliente',
    'importar_inventario', 'crear_demo', 'compartir_demo', 'cambiar_plantilla_agente',
    'editar_prompt_agente', 'crear_campana_ads',
    // Copiloto V2.1 (media + automatizaciones + contactos):
    'enviar_media_whatsapp', 'crear_automatizacion', 'toggle_automatizacion',
    'ejecutar_automatizacion', 'importar_contactos', 'eliminar_auto', 'gestionar_cita',
    // Copiloto V2.2 (briefing automático + cobros + video a redes):
    'configurar_briefing', 'generar_link_pago', 'publicar_video',
    // Copiloto V3 (cerebro central: aprobaciones + IA global + entrenamiento del bot):
    'resolver_aprobacion', 'ia_global', 'entrenar_bot',
  ])
  // Afirma haber COMPLETADO una acción/cambio de estado. SOLO primera persona /
  // resultado de acción ("conecté", "quedó activado") — NO participios de estado
  // ("está conectado", "3 activas"): esos aparecen al CITAR lecturas legítimas
  // (estado_sistema, briefing, listar_*) y bloqueaban respuestas correctas.
  const claimsAction = (t: string) =>
    /(\benvi[eé]\b|\bmand[eé]\b|le[s]? (?:envi[eé]|escrib[ií]|mand[eé])|ya (?:le|les) (?:escrib|envi|mand)|(?:fue(?:ron)?|qued[oó]|he) enviad|publiqu[eé]|he publicado|agend[eé]|he agendado|qued[oó] agendad|actualic[eé]|he actualizado|qued[oó] actualizad|agregu[eé]|he agregado|le agregu|a[ñn]ad[ií]\b|he a[ñn]adido|\bcre[eé]\b|he creado|qued[oó] cread|paus[eé]\b|he pausado|qued[oó] pausad|activ[eé]\b|he activado|qued[oó] activad|desactiv[eé]\b|he desactivado|configur[eé]\b|he configurado|qued[oó] configurad|conect[eé]\b|he conectado|qued[oó] conectad|import[eé]\b|he importado|qued(?:aron|[oó]) importad|compart[ií]\b|he compartido|elimin[eé]\b|he eliminado|qued[oó] eliminad|simul[eé]\b|he simulado|el bot respondi[oó]|aqu[ií] (?:tienes|est[aá]) la simulaci|\bcerr[eé]\b|he cerrado|cambi[eé]\b|he cambiado|qued[oó] cambiad|mov[ií]\b|he movido|qued[oó] movid|¡\s*hecho\b|hecho\s*✅|ya (?:est[aá]|qued[oó]) (?:hecho|listo|creado|activo|pausado)|ha(?:n)? sido (?:pausad|activad|eliminad|borrad|cancelad|movid|actualizad|cambiad|enviad|agendad|cread|configurad|conectad|importad|publicad|ejecutad|complet|agregad|anotad|a[ñn]adid|registrad|guardad)|fue(?:ron)? (?:pausad|activad|eliminad|borrad|cancelad|movid|actualizad|cambiad|agendad|cread|configurad|ejecutad|agregad|anotad)|se (?:ha[n]? )?(?:paus[oó]|activ[oó]|elimin[oó]|borr[oó]|cancel[oó]|movi[oó]|actualiz[oó]|cambi[oó]|agend[oó]|cre[oó]|configur[oó]|ejecut[oó]|complet[oó]|agreg[oó]|anot[oó]|a[ñn]adi[oó]|registr[oó]|guard[oó])\b)/i.test(t)
  // Narra la INTENCIÓN de actuar/consultar pero no ejecutó nada ("déjame consultar…").
  const intendsAction = (t: string) =>
    /(d[eé]jame (?:consultar|revisar|buscar|ver|simular|crear|conectar|cambiar|configurar|pausar|activar|verificar)|voy a (?:consultar|revisar|crear|simular|conectar|cambiar|buscar|pausar|activar|configurar|verificar|hacer)|vamos a (?:hacer|crear|simular|consultar|probar)|ahora (?:consulto|reviso|creo|simulo|busco|verifico)|en un momento te|dame unos segundos|(?:cambiar|configurar|crear|pausar|activar|realizar|proceder|har)[eé]\b|lo har[eé]|proceder[eé]|confirma si deseas|deseas que proceda|quieres que proceda|¿\s*procedo|me confirmas si)/i.test(t)
  const ranStateChange = () => steps.some((s) => ACTION_TOOLS.has(s.action))
  const ranAnyTool = () => steps.length > 0
  // La ÚLTIMA orden del usuario es un imperativo de acción (agrega, pausa,
  // ejecuta, cambia, envía…). Si el turno cierra SIN ninguna herramienta,
  // es casi seguro una alucinación — forzamos ejecución sin depender de
  // detectar la frase exacta de la respuesta.
  const userDemandsAction = (t: string) =>
    /\b(agrega|agr[eé]gale|anota|an[oó]tale|apunta|registra|reg[ií]strame|crea|cr[eé]ame|pausa|activa|desactiva|enciende|apaga|ejecuta|corre|lanza|dispara|elimina|borra|quita|cambia|c[aá]mbiale|actualiza|modifica|mueve|mu[eé]velo|cancela|reagenda|reprograma|env[ií]a|env[ií]ale|manda|m[aá]ndale|escribe|escr[ií]bele|publica|importa|exporta|genera|gen[eé]rame|hazme|conecta|configura|conf[ií]gurame|guarda|recuerda|olvida|c[oó]brale|asigna|responde|resp[oó]ndele|reactiva|agenda|ag[eé]ndame|simula|marca|p[oó]nle|renombra)\b/i.test(t)
  // El usuario PREGUNTA por SUS datos (leads, contactos, ventas, citas…) —
  // visto en producción 2026-07-21: "¿A qué leads les escribo primero?" y el
  // modelo INVENTÓ "Juan Pérez/María López/Carlos Gómez" sin tocar la BD.
  // Una pregunta de datos exige al menos UNA herramienta de lectura este turno.
  const userAsksData = (t: string) =>
    /\b(leads?|prospectos?|contactos?|clientes?|citas?|ventas?|tratos?|deals?|inventario|autos?|unidades|conversaci\w*|seguimientos?|campa[ñn]as?|m[eé]tricas?|reportes?|estad[ií]sticas?|aprobaciones|agentes?|mensajes?|pendientes)\b/i.test(t) &&
    /(\?|¿|\b(cu[aá]l(es)?|qui[eé]n(es)?|qu[eé]|cu[aá]nt[oa]s?|c[oó]mo van?|dame|dime|mu[eé]strame|ens[eé][ñn]ame|lista|listame|a qui[eé]n|hay)\b)/i.test(t)
  // La respuesta ENUMERA elementos (lista numerada o viñetas con nombres) —
  // si nada se leyó de la BD este turno, esa lista es inventada.
  const looksLikeDataList = (t: string) => (t.match(/(?:^|\n)\s*(?:\d+[.)]|[-•*])\s+\S/g) || []).length >= 2
  const CORRECTION =
    'ALTO: NO ejecutaste ninguna herramienta en este turno. NUNCA narres que "vas a" hacer algo ni inventes el resultado (listas, estados, envíos, cambios, simulaciones). El usuario dio una orden: EMITE AHORA la herramienta correspondiente respondiendo SOLO con {"action":"<nombre>","args":{...}}. Si de verdad te falta un dato indispensable (a quién, qué texto, qué fecha), responde {"final":"<pregunta por el dato faltante>"} SIN afirmar que hiciste nada. Solo usa {"final":...} con resultado cuando ya tengas el resultado REAL de la herramienta.'
  const DATA_CORRECTION =
    'ALTO: el usuario pregunta por SUS DATOS REALES (leads/contactos/ventas/citas/inventario) y NO ejecutaste ninguna herramienta de lectura en este turno — cualquier nombre o cifra que escribas sería INVENTADO. EMITE AHORA la herramienta de lectura correspondiente respondiendo SOLO con {"action":"<nombre>","args":{...}} (ej: "leads_calientes", "buscar_contactos", "ver_pipeline", "buscar_inventario", "listar_agentes", "metricas_agentes", "estado_sistema") y responde al usuario ÚNICAMENTE con lo que la herramienta devuelva. Si devuelve vacío, dile que aún no hay datos — JAMÁS rellenes con ejemplos.'
  const INV_CORRECTION =
    'ALTO: estás listando o eligiendo PRODUCTOS/INVENTARIO pero los nombres NO salieron de una herramienta — son INVENTADOS (bug real: listaste "Honda Civic/Ford Mustang" que NO existen). EMITE AHORA {"action":"buscar_inventario","args":{}} y responde ÚNICAMENTE con los nombres EXACTOS que devuelva. Si vas a generar video/imagen/publicar de "cualquier producto", elige uno de esa lista real. Si buscar_inventario devuelve vacío, dilo — JAMÁS inventes modelos ni marcas.'
  // ¿El USUARIO pidió listar/usar inventario? (SOLO su mensaje, no la respuesta —
  // fix 2026-07-22: antes miraba el texto del reply y misfireaba cuando una lista
  // de LEADS mencionaba un producto → forzaba responder con inventario). Excluye
  // explícitamente intenciones de leads/contactos/citas/ventas/agentes.
  const userWantsInventory = /(video|imagen|creativo|caption|publica(?:r|ci[oó]n)?|inventario|cat[aá]logo|qu[eé] (?:productos?|autos?|coches?|veh[ií]culos?|modelos?)|productos? (?:tengo|hay|disponibles?)|autos? (?:tengo|hay|disponibles?))/i.test(lastUser)
    && !/(lead|prospecto|contacto|cliente|cita|venta|trato|deal|conversaci|mensaje|agente|memoria|automatizaci|reporte|analitic|anal[ií]tic)/i.test(lastUser)
  const inventoryHallucinated = (text) => {
    if (!userWantsInventory || !looksLikeDataList(text)) return false
    const toolText = steps.map((s) => (s.summary || '').toLowerCase()).join('\n')
    const listed = [...text.matchAll(/(?:^|\n)\s*(?:\d+[.)]|[-•*])\s*\*{0,2}([^\n—:$*]{3,50})/g)]
      .map((m) => m[1].replace(/\*/g, '').trim()).filter(Boolean)
    if (listed.length < 2) return false
    // Cada item listado debe aparecer (por su raíz) en alguna salida de tool de este turno
    const ungrounded = listed.some((n) => { const key = n.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').trim().slice(0, 12); return key.length >= 4 && !toolText.includes(key) })
    return ungrounded
  }

  let forced = 0
  // Devuelve true si debemos BLOQUEAR este "final" y forzar ejecución real.
  const blockFalseClaim = (text: string, raw: string): boolean => {
    if (forced >= 3) return false
    const fakeChange = claimsAction(text) && !ranStateChange()
    const narratedIntent = intendsAction(text) && !ranAnyTool()
    // Orden imperativa sin NINGUNA tool este turno → forzar (una pregunta
    // legítima por un dato faltante se permite: contiene "?" y no afirma).
    const ignoredOrder = userDemandsAction(lastUser) && !ranAnyTool() && !(text.includes('?') && !claimsAction(text))
    // Pregunta de DATOS sin ninguna lectura → la respuesta trae datos inventados
    // (también si la respuesta enumera una lista sin haber leído nada).
    const inventedData = !ranAnyTool() && (userAsksData(lastUser) || looksLikeDataList(text))
    // Inventario ALUCINADO: lista productos cuyos nombres no vinieron de una tool.
    const invHall = inventoryHallucinated(text)
    if (!fakeChange && !narratedIntent && !ignoredOrder && !inventedData && !invHall) return false
    forced++
    convo.push({ role: 'assistant', content: raw })
    const correction = invHall ? INV_CORRECTION : (inventedData && !fakeChange && !narratedIntent && !ignoredOrder ? DATA_CORRECTION : CORRECTION)
    convo.push({ role: 'user', content: correction })
    return true
  }

  for (let i = 0; i < 8; i++) {
    const raw = await minimaxChat(convo, { maxTokens: 1600, temperature: 0.3 })

    // 1) Acciones en formato JSON
    const obj = extractJson(raw)
    if (obj && obj.final !== undefined) {
      const text = cleanForUser(String(obj.final)) || 'Listo.'
      if (blockFalseClaim(text, raw)) continue
      return finish(text)
    }
    if (obj && typeof obj.action === 'string') {
      // Remapeo de misroute de memoria antes de despachar (telemetry correcta)
      let actName = obj.action
      let actArgs = (obj.args as Record<string, unknown>) || {}
      if (actName === 'buscar_contactos' && MEMORY_Q.test(lastUser)) { actName = 'ver_memoria'; actArgs = {} }
      const summary = await runOne(actName, actArgs)
      steps.push({ action: actName, summary })
      convo.push({ role: 'assistant', content: raw })
      convo.push({ role: 'user', content: `Observación de ${actName}:\n${summary}` })
      continue
    }

    // 2) Acciones en formato XML <invoke> (MiniMax a veces las emite así)
    const invokes = parseInvokes(raw)
    if (invokes.length) {
      const obs: string[] = []
      for (const c of invokes) { const summary = await runOne(c.name, c.args); steps.push({ action: c.name, summary }); obs.push(`Observación de ${c.name}:\n${summary}`) }
      convo.push({ role: 'assistant', content: raw })
      convo.push({ role: 'user', content: obs.join('\n\n') + '\n\nResponde al usuario en lenguaje natural (sin XML ni JSON) lo que hiciste.' })
      continue
    }

    // 3) Texto plano = respuesta final (limpiando cualquier resto de sintaxis)
    const clean = cleanForUser(raw)
    if (blockFalseClaim(clean || 'Listo.', raw)) continue
    return finish(clean || 'Listo.')
  }
  // Se acabaron los pasos: pide cierre
  try {
    const last = await minimaxChat([...convo, { role: 'user', content: 'Da ahora tu respuesta final al usuario en lenguaje natural (sin XML ni JSON), resumiendo lo realizado.' }], { maxTokens: 1200 })
    const o = extractJson(last)
    return finish(o?.final ? cleanForUser(String(o.final)) : (cleanForUser(last) || (steps.length ? steps[steps.length - 1].summary : 'Listo.')))
  } catch { return finish(steps.length ? steps[steps.length - 1].summary : 'Listo.') }
}
