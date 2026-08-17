'use client'

// ═══════════════════════════════════════════════════════════════
// Manual de Usuario interactivo — guía completa del sistema dentro del panel.
// Índice navegable + búsqueda + capturas reales (public/manual) con zoom +
// pasos, casos de uso y FAQ por módulo. Pensado para que el cliente aprenda
// a usar TODO sin ayuda externa.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  BookOpen, Search, ChevronRight, ChevronLeft, X, Rocket, LayoutDashboard,
  Inbox, TrendingUp, Car, Users, Bot, Factory, Sparkles, Megaphone, Brain,
  BarChart3, CalendarDays, MessageSquareCode, Store, Shield, Settings,
  HelpCircle, CheckCircle2, Lightbulb, ListChecks, Image as ImageIcon,
  Layers, MousePointerClick, Filter as FilterIcon, Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FaqItem { q: string; a: string }
export interface Shot { img: string; caption: string } // img = nombre de archivo en /public/manual (sin .png)
export interface Detail { name: string; detail: string } // ej. botón/pestaña/filtro → qué hace / qué muestra
export interface Connect { name: string; steps: string[] } // procedimiento de conexión/activación
export interface Reference {
  tabs?: Detail[]      // pestañas del módulo y qué contiene cada una
  buttons?: Detail[]   // cada botón/control → qué hace / qué pasa al pulsarlo
  filters?: Detail[]   // cada filtro → qué muestra / cómo se usa
  connect?: Connect[]  // cómo conectar/activar/configurar (APIs, WhatsApp, Telegram, etc.)
}
export interface Section {
  id: string
  icon: React.ElementType
  title: string
  tagline: string
  what: string
  steps?: string[]
  cases?: FaqItem[]
  tips?: string[]
  shot?: string // captura principal (archivo en /public/manual)
  video?: string // video guía del módulo (archivo .mp4 en /public/manual, sin extensión)
  gallery?: Shot[] // pasos ilustrados (modales/flujos)
  reference?: Reference // detalle exhaustivo: pestañas/botones/filtros/conexiones
}

// ─── Contenido del manual ─────────────────────────────────────
// ÚNICA FUENTE del contenido de ayuda del Manual. (El tour interactivo vive
// en guided-tour.tsx con sus propios textos cortos por paso.)
export const SECTIONS: Section[] = [
  {
    id: 'inicio', icon: Rocket, title: 'Primeros pasos', tagline: 'Pon a funcionar tu sistema en minutos',
    shot: 'dashboard', video: 'dashboard',
    what: 'ValiAutoFlow es tu central de ventas: un asesor con Inteligencia Artificial atiende WhatsApp por ti las 24 horas, califica a cada cliente, da seguimiento y agenda citas, mientras tú lo controlas todo desde este panel. Si es tu primera vez, sigue estos 4 pasos para dejarlo listo.',
    steps: [
      'Conecta tu WhatsApp: ve a Configuración → Conexiones y escanea el código QR con tu teléfono (el mismo número que ya usas). Tarda menos de 2 minutos y NO necesitas la API oficial de Meta.',
      'Carga tu inventario: entra a Inventario → "Registrar auto" para agregar uno por uno, o "Importar" para subir muchos de golpe (Excel/CSV/Google Sheets).',
      'Configura tu negocio: en Configuración pon horarios, dirección, teléfono y el tono de tu asesor IA para que hable como tu marca.',
      'Activa tus agentes: en Agentes IA / Agent Factory enciende el asesor de ventas. ¡Listo! El bot ya contesta y vende solo.',
    ],
    cases: [
      { q: '¿Qué es el Tour de bienvenida?', a: 'Un recorrido interactivo que ilumina los botones REALES del panel uno por uno y te explica qué hace cada uno, navegando por los módulos en vivo (30 paradas, ~3 minutos). Sale automáticamente al terminar tu configuración inicial, y puedes repetirlo cuando quieras con el botón morado "Ver tour de bienvenida" aquí en el Manual.' },
      { q: '¿Cómo salgo o navego dentro del tour?', a: 'Con los botones Anterior/Siguiente, las flechas ← → del teclado, o "Saltar" para salirte en cualquier momento (también la tecla Esc). En celular el tour abre solo el menú cuando necesita mostrarte un módulo.' },
    ],
    tips: [
      'Usa el Copiloto IA (botón morado abajo a la derecha) en cualquier momento: pídele cosas en español y las hace por ti.',
      'Si eres nuevo, el sistema te muestra un asistente de configuración guiado la primera vez que entras, y al guardarlo arranca el Tour de bienvenida que te enseña el panel botón por botón.',
      '¿Se te olvidó dónde estaba algo? Repite el tour desde este Manual ("Ver tour de bienvenida") o búscalo en el índice de la izquierda.',
    ],
    reference: {
      buttons: [
        { name: 'Asistente de configuración (primera vez)', detail: '8 pasos que dejan todo listo: nombre y giro del negocio, horarios/dirección/zona horaria, personalidad del asesor IA (con prueba en vivo), conexión de WhatsApp por QR, llaves de voz (opcional) e importación de inventario. Al pulsar "Guardar y conocer mi panel" arranca el Tour de bienvenida.' },
        { name: 'Tour de bienvenida (interactivo)', detail: 'Recorre el panel EN VIVO: oscurece la pantalla, ilumina el botón real con un marco violeta y te explica para qué sirve. Navega solo entre módulos (Tablero → Conversaciones → Ventas → Inventario → …) y termina en el Copiloto. Repetible desde este Manual las veces que quieras.' },
      ],
    },
  },
  {
    id: 'dashboard', icon: LayoutDashboard, title: 'Tablero', tagline: 'La foto general de tu negocio',
    shot: 'dashboard', video: 'dashboard',
    what: 'El Tablero es lo primero que ves al entrar. Resume cómo va tu operación: conversaciones activas, leads (clientes potenciales), ventas en proceso, citas próximas y alertas importantes — todo de un vistazo.',
    steps: [
      'Revisa las tarjetas de arriba: muestran tus números clave del día (leads, mensajes, citas, ventas).',
      'Mira las alertas: el sistema te avisa de leads calientes sin atender, autos sin foto o citas próximas.',
      'Haz clic en cualquier tarjeta o alerta para ir directo al módulo correspondiente.',
      'Tarjeta "IA del bot": el switch GLOBAL de tu asesor IA. Pausa 1h o 3h (se reactiva sola), Apagar (indefinido) o Encendida. Pausada, el bot no responde a NADIE pero los mensajes se siguen guardando en el CRM.',
    ],
    cases: [
      { q: '¿Por dónde empiezo cada día?', a: 'Abre el Tablero, atiende primero las alertas de "leads calientes" y luego revisa Conversaciones. El Copiloto también puede resumirte el día: pídele "resúmeme el día".' },
      { q: '¿Cómo apago la IA un rato (junta, inventario físico, evento)?', a: 'En el Tablero, tarjeta "IA del bot": pulsa "Pausar 1h" o "Pausar 3h" y se reactiva sola al vencer. "Apagar" la deja apagada hasta que pulses "Encendida". También puedes pedírselo al Copiloto: "pausa la IA 1 hora". Para silenciar solo UNA conversación, usa el botón IA/Manual dentro del chat.' },
    ],
    tips: ['Los números se actualizan solos. Si algo se ve en cero al inicio, es porque aún no hay datos en ese rubro.'],
    reference: {
      buttons: [
        { name: 'Tarjetas KPI (arriba)', detail: 'Cada tarjeta es un número clave del día y es CLICABLE: Contactos → Contactos; Conversaciones → Conversaciones; Tratos Ganados / Ingresos → Ventas (Pipeline); Tasa de Conversión → Analíticas; Agentes IA → Agentes. Muestran también la variación vs. el periodo anterior.' },
        { name: 'IA del bot (switch global)', detail: 'Controla el asesor IA de TODO el workspace. "Encendida" = responde normal; "Pausar 1h"/"Pausar 3h" = se detiene y se reactiva sola al vencer; "Apagar" = queda apagada hasta que la vuelvas a encender. Mientras está pausada, los mensajes entrantes se siguen guardando en el CRM (no se pierden), pero el bot no contesta a nadie.' },
        { name: 'Seguimientos automáticos', detail: 'Tarjeta con los follow-ups programados (próximos y enviados hoy). Muestra a quién y cuándo va el próximo mensaje; incluye los que esperan tu OK por Telegram. Clic para ver el detalle del contacto.' },
        { name: 'Aprobaciones', detail: 'Cuando la IA quiere ejecutar algo sensible (cobrar, facturar) aparece aquí para tu OK antes de ejecutarse. El switch "Exigir aprobación" activa/desactiva ese control.' },
        { name: 'Alertas críticas', detail: 'Leads calientes sin atender, citas próximas, autos sin foto, etc. Cada alerta es clicable y te lleva directo a resolverla. "Ver todas" abre el listado completo (48h).' },
        { name: 'Citas de hoy / próximas', detail: 'Agenda del día con hora, cliente y tipo. Clic abre el expediente o el detalle de la cita.' },
        { name: 'Actividad reciente', detail: 'Bitácora en vivo de lo que va pasando (mensajes, cambios de etapa, ventas). "Ver todo" abre el historial.' },
        { name: 'Mensaje masivo (campaña)', detail: 'Botón para enviar un mensaje a muchos leads filtrados (por temperatura, etiqueta, actividad, canal o etapa) con espaciado anti-baneo. Ver "Marketing IA → Campañas".' },
        { name: 'Nueva cotización', detail: 'Crea y envía una cotización directa a un contacto por WhatsApp desde el Tablero, sin entrar a la conversación.' },
        { name: 'Campanita (notificaciones)', detail: 'Arriba a la derecha: avisos del sistema (leads, citas, aprobaciones). Cada uno navega al lugar correspondiente; "Todas" muestra las de las últimas 48h.' },
        { name: 'Mi Perfil', detail: 'Menú de tu usuario (arriba derecha): datos, rol, cambiar contraseña y cerrar sesión.' },
      ],
    },
  },
  {
    id: 'inbox', icon: Inbox, title: 'Conversaciones', tagline: 'Todos tus chats de WhatsApp en un solo lugar',
    shot: 'inbox', video: 'inbox',
    what: 'Es tu bandeja de WhatsApp dentro del sistema. Ves todas las conversaciones, lo que el bot respondió, el perfil de cada cliente (su interés, presupuesto y "temperatura"), y puedes tomar el control manualmente cuando quieras.',
    steps: [
      'Selecciona una conversación de la lista izquierda para abrir el chat.',
      'Lee el historial. Los mensajes del bot aparecen marcados como IA.',
      'Para escribir tú: usa la barra de abajo. El botón 📎 envía imágenes, videos o documentos al cliente.',
      'Botón IA / Manual: cambia entre que responda el bot (IA) o que respondas solo tú (Manual) en esa conversación.',
      'Abre el Expediente (panel lateral) para ver el perfil completo del cliente y su línea de tiempo.',
    ],
    cases: [
      { q: '¿Cómo tomo el control de un chat?', a: 'Abre la conversación y pulsa el botón "IA" para cambiarlo a "Manual". El bot dejará de responder ahí y tú escribes directo. Vuelve a "IA" para que el bot retome.' },
      { q: '¿Cómo le mando una foto de un auto al cliente?', a: 'Abre el chat, escribe un texto (opcional, será el pie de foto), pulsa 📎, elige la imagen y se envía al instante por WhatsApp.' },
      { q: '¿Cómo corrijo una respuesta mala del bot?', a: 'Usa "Corregir IA" en la conversación para enseñarle la respuesta correcta; el bot aprende de esa corrección.' },
    ],
    tips: ['La "temperatura" (🔥 caliente / 🌤️ tibio / ❄️ frío) te dice a quién darle prioridad. Atiende primero a los calientes.'],
    gallery: [
      { img: 'flow-inbox-chat', caption: 'Conversación abierta: a la izquierda la lista de chats, en el centro el historial, y abajo la barra para escribir y el botón 📎 para enviar archivos.' },
    ],
    reference: {
      buttons: [
        { name: 'IA / Manual', detail: 'Alterna si el bot responde en esa conversación. "IA" = el bot contesta los mensajes del cliente; "Manual" = el bot queda en silencio y respondes solo tú. (Tu envío manual nunca dispara al bot.)' },
        { name: 'Expediente 📄', detail: 'Abre el panel del lead a la derecha: score, temperatura, arquetipo, presupuesto, vehículo de interés, objeción, próxima cita, documentos y la bitácora cronológica.' },
        { name: 'Adjuntar 📎', detail: 'Envía una imagen, video, audio o documento (PDF/Word/Excel/CSV) al cliente por WhatsApp en un paso. Si escribiste texto, se usa como pie de foto. Requiere que el contacto tenga teléfono.' },
        { name: 'Llamar 📞 / Email ✉️', detail: 'Abre la app de llamada (tel:) o el correo (mailto:) del contacto. Se ven atenuados si no hay número/correo.' },
        { name: 'Estrella ⭐ (favorito)', detail: 'Marca la conversación como favorita; las favoritas se ordenan primero en la lista.' },
        { name: 'Menú ⋮', detail: 'Opciones: Ver perfil (abre Contactos), Crear trato (crea una oportunidad en Ventas), Transferir a humano (te la asigna y la deja activa) y Cerrar conversación.' },
        { name: 'Estado (badge)', detail: 'Clic en el badge (Activa/Pendiente/Cerrada/Bot) para cambiar el estado de la conversación.' },
        { name: 'Buscar en mensajes 🔍', detail: 'Resalta dentro del chat abierto los mensajes que contienen tu texto.' },
        { name: 'Corregir IA (clic derecho en un mensaje del bot)', detail: 'Solo Dueño/Admin y solo sobre mensajes de la IA: abre el entrenador para enseñarle la respuesta correcta (la IA aprende de esa corrección).' },
        { name: 'Respuestas rápidas', detail: 'Chips sobre la barra (Agendar cita, Enviar precios, Seguimiento 24h, Gracias) que insertan una plantilla en el texto (no la envían).' },
        { name: 'Cargar más conversaciones', detail: 'Al final de la lista, trae 100 conversaciones más (aparece si hay más de las cargadas).' },
      ],
      filters: [
        { name: 'Buscar conversaciones', detail: 'Filtra la lista por nombre del contacto o por el texto del último mensaje.' },
        { name: 'Canal', detail: 'Muestra solo las conversaciones de un canal (Todos, WhatsApp, etc.).' },
        { name: 'Punto ámbar (lead frío)', detail: 'Indica que el último mensaje fue hace más de 3 días — buen momento para reactivar.' },
      ],
    },
  },
  {
    id: 'pipeline', icon: TrendingUp, title: 'Ventas (Pipeline)', tagline: 'Tu embudo de ventas visual',
    shot: 'pipeline', video: 'pipeline',
    what: 'El Pipeline organiza tus oportunidades de venta en columnas (etapas): desde "Lead Nuevo" hasta "Cerrado Ganado". Arrastras cada trato según avanza, para que nunca pierdas de vista una venta.',
    steps: [
      'Cada tarjeta es un trato (una oportunidad de venta con un cliente).',
      'Arrastra una tarjeta de una columna a otra para mover el trato de etapa (ej. de "Contactado" a "Propuesta").',
      'Crea un trato nuevo con el botón "+", eligiendo cliente, auto y valor.',
      'Cierra un trato como Ganado o Perdido cuando concluya.',
    ],
    cases: [
      { q: '¿Para qué sirven las etapas?', a: 'Te dicen en qué punto va cada cliente para saber qué hacer: a un "Lead Nuevo" lo contactas; a uno en "Negociación" le cierras. El bot mueve algunos automáticamente.' },
      { q: 'Arrastré un trato y volvió a su lugar', a: 'Significa que no se guardó (por permisos o conexión). El sistema te avisa con un mensaje rojo; vuelve a intentarlo.' },
    ],
    tips: ['Pídele al Copiloto "mueve a Juan a Negociación" y lo hace por ti sin arrastrar nada.'],
    reference: {
      tabs: [
        { name: 'Kanban', detail: 'Vista de columnas (tablero) — arrastras las tarjetas entre etapas.' },
        { name: 'Lista', detail: 'Vista de lista agrupada por etapa; marca "Estancado" los tratos con más de 7 días sin moverse.' },
      ],
      buttons: [
        { name: 'Nuevo Trato', detail: 'Crea una oportunidad: nombre del trato, valor estimado, etapa (obligatoria) y contacto opcional (buscable).' },
        { name: 'Arrastrar tarjeta', detail: 'Mueve el trato a otra etapa (se guarda solo). Si el backend rechaza, revierte y avisa. Arrástralo a "Cerrado Ganado/Perdido" para cerrarlo: se marca ganado/perdido AUTOMÁTICO (cuenta en "Ganados del Mes" del Tablero).' },
        { name: 'Conexiones automáticas', detail: 'El pipeline mueve el resto del sistema solo: al entrar a "Negociación" la unidad del trato se APARTA en Inventario; si sale sin ganar o se pierde, se LIBERA; al GANAR, la unidad se marca VENDIDA y el contacto recibe la etiqueta "cliente".' },
        { name: 'Abrir tarjeta (Detalle)', detail: 'Edita nombre, valor, etapa y descripción; ve datos del lead (teléfono, objeción, presupuesto, tags). Botones: Guardar y Eliminar (borra el trato).' },
      ],
      filters: [
        { name: 'Fuente', detail: 'Filtra por origen del lead (WhatsApp, Telegram, Instagram, Web, Google, Facebook, Manual).' },
        { name: 'Score mín.', detail: 'Muestra solo tratos con score de lead ≥ 30/50/70/80.' },
      ],
    },
  },
  {
    id: 'inventory', icon: Car, title: 'Inventario', tagline: 'Tus autos — lo que el bot cotiza',
    shot: 'inventory', video: 'inventory',
    what: 'Aquí registras los autos que vendes. ES IMPORTANTE: el asesor IA SOLO puede cotizar y ofrecer lo que esté en este inventario. Si un auto no está aquí, el bot no lo conoce.',
    steps: [
      'Agrega un auto con "Registrar auto": llena marca, modelo, año, precio, kilometraje, fotos, etc.',
      '¿Tienes muchos? Usa "Importar": sube un Excel, CSV, JSON, SQL, TXT o Markdown (.md), pega el texto directo o un enlace de Google Sheets, y la IA acomoda los datos por ti.',
      'Usa los filtros (tipo, estatus, marca) y el buscador para encontrar autos rápido.',
      'Cambia el estatus de un auto (Disponible / Apartado / Vendido) para mantenerlo actualizado.',
      'Exporta tu inventario a Excel cuando lo necesites con "Exportar".',
    ],
    cases: [
      { q: 'El bot no menciona un auto que sí tengo', a: 'Verifica que esté registrado aquí y marcado como "Disponible". El bot solo ofrece lo que está en el inventario.' },
      { q: '¿Cómo subo 50 autos de golpe?', a: 'Usa "Importar" con tu archivo de Excel/CSV o un Google Sheets. La IA reconoce las columnas automáticamente.' },
    ],
    tips: ['Sube buenas fotos: el módulo de Marketing IA las usa para crear publicaciones automáticamente.'],
    gallery: [
      { img: 'flow-inventory-form', caption: 'Botón "Registrar auto": formulario para dar de alta un vehículo (marca, modelo, año, versión, color, kilometraje, precio, fotos…).' },
      { img: 'flow-inventory-import', caption: 'Botón "Importar": carga masiva desde Excel, CSV, JSON, SQL, TXT, Markdown (.md) o un enlace de Google Sheets — la IA reconoce las columnas por ti.' },
    ],
    reference: {
      buttons: [
        { name: 'Registrar auto', detail: 'Abre el formulario de alta. Único campo obligatorio: el Título/modelo (lo que cotiza el bot). Secciones: Datos del vehículo, Comercial (precio, stock, SKU, Tipo, Estatus), Fotos (la 1ª es la Principal) y Notas. Checkbox "Disponible para el bot" (si lo apagas, el bot no lo ofrece).' },
        { name: 'Importar', detail: 'Carga masiva con IA (ver "Paso a paso"): archivo CSV/Excel/JSON/SQL/TXT, texto pegado, o enlace de Google Sheets. La IA detecta las columnas; tú revisas y confirmas.' },
        { name: 'Exportar', detail: 'Descarga TODO tu inventario a un Excel (.xlsx) con todas las columnas.' },
        { name: 'Tarjetas / Tabla', detail: 'Cambia entre vista de tarjetas (con foto) y vista de tabla (más datos por fila).' },
        { name: 'Editar (lápiz) / Eliminar (bote)', detail: 'Sobre cada auto: editar abre el formulario; eliminar pide confirmación y lo borra.' },
        { name: 'Cambiar estatus', detail: 'El estatus (Disponible / Apartado / Vendido) se cambia desde el formulario del auto (Comercial → Estatus). Los "Vendido" no cuentan en el valor de inventario.' },
      ],
      filters: [
        { name: 'Buscar', detail: 'Busca por modelo, color, VIN, SKU, marca o tipo.' },
        { name: 'Tipo', detail: 'Filtra por condición: Nuevo, Seminuevo o Usado.' },
        { name: 'Estatus', detail: 'Filtra por Disponible, Apartado o Vendido.' },
        { name: 'Marca', detail: 'Filtra por marca (aparece si tienes autos con marca capturada).' },
      ],
    },
  },
  {
    id: 'contacts', icon: Users, title: 'Contactos', tagline: 'Tu base de clientes',
    shot: 'contacts', video: 'contacts',
    what: 'El directorio de todas las personas que han escrito o que agregaste. Cada contacto guarda su teléfono, etiquetas, score (puntaje de interés) y su historial.',
    steps: [
      'Busca y filtra contactos por nombre (funciona con nombre completo), teléfono, estado, etiquetas o score.',
      '¿Tienes una lista de prospectos? Usa "Importar" y sube tu CSV o Excel — se cargan en segundos.',
      'Abre un contacto para ver su perfil y conversaciones.',
      'Selecciona varios (casillas) para acciones masivas: etiquetar, archivar o eliminar.',
    ],
    cases: [
      { q: '¿Cómo subo mi lista de prospectos (Excel/CSV)?', a: 'Botón "Importar" → selecciona tu archivo (.csv, .xlsx o .xls, hasta 10 MB). Reconoce columnas en español (Nombre, Apellido, Teléfono, Correo, Fuente, Etiquetas) y omite los teléfonos duplicados automáticamente. Hay una plantilla de ejemplo descargable en el mismo diálogo. También puedes pegarle la lista al Copiloto: "importa estos prospectos: …".' },
      { q: '¿Qué es una etiqueta?', a: 'Una marca para clasificar clientes (ej. "interesado-creta", "desinteresado"). Te ayuda a filtrarlos y organizarlos.' },
      { q: '¿Por qué un cliente aparece como "desinteresado"?', a: 'El sistema lo marca automáticamente si no respondió tras 2 seguimientos. Así no se le sigue insistiendo. Puedes quitarle la etiqueta si quieres reactivarlo.' },
    ],
    tips: ['El score (0-100) mide qué tan probable es que compre. Mayor score = más prioridad.', 'Los 5 indicadores de arriba (totales, nuevos del mes, clientes, calientes, sin contacto 30 días) se calculan con tus datos reales.'],
    reference: {
      buttons: [
        { name: 'Nuevo Contacto', detail: 'Crea uno a mano: nombre (obligatorio), apellido, teléfono, email, fuente y etiquetas (separadas por coma). Si el teléfono ya existe, te avisa.' },
        { name: 'Importar', detail: 'Sube tu lista de prospectos en CSV o Excel (hasta 10 MB). Mapea columnas en español/inglés, separa nombre y apellido, normaliza teléfonos y omite duplicados. Al terminar te muestra cuántos entraron y cuáles se omitieron (y por qué).' },
        { name: 'Exportar CSV', detail: 'Descarga los contactos actualmente cargados/filtrados a un CSV (nombre, teléfono, email, score, fuente, estado, etiquetas).' },
        { name: 'Abrir contacto (fila)', detail: 'Abre su ficha lateral: información, métricas (score, mensajes, tratos), datos detectados y etiquetas. Botones Enviar Mensaje y Llamar.' },
        { name: 'Menú ⋮ por fila', detail: 'Ver detalle, Enviar mensaje (abre el chat) o Archivar (lo saca de activos).' },
      ],
      filters: [
        { name: 'Buscar', detail: 'Por nombre, teléfono o email.' },
        { name: 'Estado', detail: 'Activos / Inactivos / Archivados.' },
        { name: 'Fuente', detail: 'WhatsApp, Instagram, Facebook, Web Chat, Referencia, Telegram.' },
        { name: 'Filtros avanzados', detail: 'Rango de Lead Score (0–100), Etiquetas (multi-selección) y Ordenar por (última actividad, score, fecha, nombre) asc/desc.' },
      ],
      connect: [
        { name: '🏷️ Acciones masivas (selecciona con las casillas)', steps: [
          'Marca varios contactos con las casillas (o "seleccionar todos").',
          'Aparece una barra verde con: Asignar Etiqueta (les pone la etiqueta que escribas), Archivar, Exportar (CSV) y Eliminar (borrado permanente).',
          'La etiqueta "desinteresado" la pone solo el sistema cuando alguien no responde tras 2 seguimientos; puedes quitarla si quieres reactivarlo.',
        ]},
      ],
    },
  },
  {
    id: 'agents', icon: Factory, title: 'Agentes IA', tagline: 'Tus vendedores virtuales (Agent Factory)',
    shot: 'agent-factory', video: 'agents',
    what: 'Aquí viven los "empleados virtuales" que atienden tu WhatsApp. El asesor base (JHON) siempre responde, y desde este módulo agregas ESPECIALISTAS: por plantilla (cotizador, financiamiento, recuperación de leads, soporte…) o instalando un PACK por marca completo (Toyota, Hyundai, Nissan, KIA, Volkswagen, Chirey, Seminuevos, Motos) que trae experto de producto, asesor financiero de esa marca y postventa. Cada especialista entra automáticamente cuando el cliente menciona su tema o un modelo (ej. "Tiggo 7", "Hilux"), y el sistema mide cuántos mensajes, CITAS y VENTAS generó cada agente.',
    steps: [
      'La forma rápida: en la "Biblioteca de Empleados" instala un pack completo con un clic (ej. "Especialistas Chirey") y quedan listos los 3 empleados de esa marca.',
      'O por plantilla: abre "Plantillas", elige la que necesitas e "Instanciar"; personalízala (nombre, tono, palabras clave que la activan) y créala. Queda activa al instante.',
      'Usa el botón "Probar" para chatear con el agente y ver cómo responde antes de soltarlo con clientes.',
      'En "Agentes activos" pausa/activa cada uno; el interruptor "Ruteo" de arriba apaga TODOS los especialistas de golpe (queda solo JHON).',
      'Revisa resultados: en "Métricas por agente" (o pidiéndolo al Copiloto) ves quién genera más citas y ventas, no solo mensajes.',
    ],
    cases: [
      { q: '¿Necesito varios agentes?', a: 'No al inicio. Con el asesor base basta. Agrega especialistas o un pack de marca cuando quieras respuestas más expertas (financiamiento, seguros, o toda la gama de una marca).' },
      { q: '¿Qué es un "pack por marca"?', a: 'Un escuadrón listo para instalar en un clic: experto de producto que domina la gama de la marca (con las palabras clave de sus modelos reales), asesor del financiamiento de esa marca, y postventa. Ideal si vendes una marca específica: se activan solos cuando el cliente menciona un modelo.' },
      { q: '¿Cómo sé qué agente me da resultados?', a: 'El sistema cuenta por agente: mensajes atendidos, CITAS generadas y VENTAS atribuidas. Pídele al Copiloto "métricas de agentes" y te dice cuál produce de verdad.' },
      { q: '¿Qué pasa si dos agentes pueden atender lo mismo?', a: 'El sistema elige el más adecuado según las palabras del cliente, la intención detectada y la prioridad que les pusiste. Si cambia el especialista a media charla, el nuevo retoma el hilo sin volver a presentarse.' },
      { q: '¿Qué significa "Próximamente" en un agente?', a: 'Que es de back-office (apoyo interno): puedes crearlo y probarlo, pero aún no atiende WhatsApp por sí solo. Los marcados "En vivo" sí atienden clientes.' },
    ],
    tips: [
      'Pídeselo al Copiloto: "crea un agente de financiamiento" o "instala el pack de Chirey" y lo arma por ti.',
      'Los packs de marca traen las palabras clave de los modelos reales (Tiggo, Hilux, Tucson, Versa…), así que se activan aunque el cliente solo escriba el nombre del modelo.',
    ],
    gallery: [
      { img: 'flow-agent-probar', caption: 'Botón "Probar": chatea con el agente como si fueras un cliente, para validar cómo responde antes de activarlo con clientes reales.' },
    ],
    reference: {
      tabs: [
        { name: 'Biblioteca de Empleados', detail: 'El "App Store" de agentes: packs completos que instalas con un clic — por marca (Toyota, Hyundai, Nissan, KIA, Volkswagen, Chirey, Seminuevos, Motos) o de agencia/marketing. Cada pack trae varios empleados listos.' },
        { name: 'Agentes activos', detail: 'Los agentes ya creados y funcionando. 🟢 En vivo = atiende WhatsApp; ⚙️ Próximamente = back-office (aún no ejecuta solo).' },
        { name: 'Organigrama', detail: 'Vista de jerarquía: gBrain (cerebro) → Orquestador JHON → departamentos por especialidad. Solo lectura.' },
        { name: 'Plantillas', detail: 'Catálogo de plantillas (base o propias). Desde aquí instancias un agente nuevo uno por uno.' },
      ],
      buttons: [
        { name: 'Ruteo activado / pausado', detail: 'Interruptor global (kill-switch). Encendido: los especialistas rutean según el mensaje. Apagado: solo responde el asesor base JHON.' },
        { name: 'Instanciar (en una plantilla)', detail: 'Crea un agente a partir de la plantilla: nombre, cliente, tono, palabras clave (routing), etapas que atiende, temperatura, prioridad y modelo. Queda activo.' },
        { name: 'Probar', detail: 'Chatea con el agente como cliente para ver cómo responde. Es simulación pura: NO envía nada por WhatsApp.' },
        { name: 'Pausar / Activar', detail: 'Enciende o apaga ese agente en concreto.' },
        { name: 'Eliminar (bote)', detail: 'Borra el agente (pide confirmación).' },
        { name: 'Nueva plantilla / Editar / Ver', detail: 'Crea una plantilla propia o edita una editable. Las plantillas base son de solo lectura (usa "Ver"); duplícalas para personalizar.' },
      ],
      filters: [
        { name: 'Buscar plantilla', detail: 'Filtra el catálogo por nombre o vertical. Las que atienden clientes (En vivo) salen primero.' },
      ],
    },
  },
  {
    id: 'copilot', icon: Sparkles, title: 'Copiloto IA', tagline: 'El cerebro central: opera TODO el sistema hablándole',
    shot: 'copilot-widget', video: 'copilot',
    what: 'El Copiloto es el CEREBRO CENTRAL de la plataforma. Es el botón morado flotante (abajo a la derecha) disponible en TODA la plataforma. En cada conversación arranca ya sabiendo el estado real de tu negocio (el "pulso": leads calientes, tratos abiertos, citas de hoy, inventario, aprobaciones pendientes, estado de WhatsApp y de la IA) — pregúntale "¿cómo vamos?" y te responde al instante con datos reales. Le pides cosas en español normal y las EJECUTA de verdad — más de 85 habilidades: contactos, WhatsApp (texto, fotos y videos), ventas, citas, inventario, marketing, automatizaciones, cobros, APROBACIONES (aprobar/rechazar pagos retenidos), el switch global de la IA, expedientes de clientes, agentes IA, Mercado Libre, Telegram y reportes. Además puede ENTRENAR al bot de ventas: dile "enséñale al bot que…" y esa lección se aplica en las conversaciones con tus clientes. Mientras trabaja ves el progreso en vivo y nunca afirma haber hecho algo sin hacerlo.',
    steps: [
      'Pulsa el botón morado ✨ (abajo a la derecha) para abrirlo.',
      'Escríbele lo que quieres en español, como se lo dirías a un asistente.',
      'Mira el progreso en vivo: te muestra cada acción mientras la ejecuta (✓ al completarla).',
      'Confirma cuando te pida (ej. antes de enviar mensajes masivos o borrar algo).',
      'Al final verás un desplegable con las acciones que ejecutó realmente.',
    ],
    cases: [
      { q: '¿Qué le puedo pedir? (operación diaria)', a: '"Ponme al día" (briefing del día), "¿todo funciona bien?" (chequeo del sistema), "¿a qué leads les escribo primero?", "diagnostica el motor de conversión", "¿quién ha mencionado financiamiento en los chats?", "resúmeme la conversación con Juan".' },
      { q: '¿Qué le puedo pedir? (acciones de venta)', a: '"Registra un contacto llamado Juan con teléfono…", "importa estos prospectos" (le pegas la lista o un enlace de Google Sheets), "envíale un WhatsApp a Ana que diga…", "crea una oportunidad de $250,000 para Luis", "muévela a Negociación", "agéndame una cita mañana a las 4 con Pedro", "cancélala", "anota en su expediente que…".' },
      { q: '¿Qué le puedo pedir? (marketing y cobros)', a: '"Hazme un video del [auto] con voz estilo premium", "mándale el último video por WhatsApp a Juan", "publica el video en Instagram y Facebook", "genera una imagen del [auto]", "genera un link de pago de $5,000 por el anticipo y mándaselo a Ana" (requiere Stripe conectado en Configuración → Pagos; al pagar, el trato se marca GANADO solo).' },
      { q: '¿Qué le puedo pedir? (administración)', a: '"Crea un agente cotizador", "pausa el agente de seguimiento", "edita el prompt de JHON", "crea una automatización que… ", "pausa/ejecuta la automatización X", "activa el briefing diario a las 8", "manda este reporte a Telegram", "exporta el inventario a Excel", "recuerda que mi color corporativo es…".' },
      { q: '¿Qué le puedo pedir? (cerebro central)', a: '"¿Cómo vamos hoy?" (te resume el pulso real), "¿hay aprobaciones pendientes?" y "apruébala/recházala" (ejecuta el pago retenido), "pausa la IA del bot 1 hora" / "enciéndela" (el switch global del Tablero), "ponme al día con Juan" (su expediente y bitácora completos), "enséñale al bot que cuando pregunten por crédito pida primero el enganche disponible" (crea una lección real para el bot de ventas), "¿qué lecciones tiene el bot?".' },
      { q: '¿Es seguro? ¿No va a mandar mensajes sin permiso?', a: 'Para acciones que afectan clientes (envíos masivos) o destructivas (eliminar) te pide confirmación. Además tiene un guardián interno: si dice que hizo algo, es porque la acción se ejecutó de verdad — está verificado contra la base de datos.' },
      { q: '¿Los videos tardan?', a: 'El video comercial se produce en segundo plano (~1-2 min). El Copiloto te da el enlace al instante y te avisa por Telegram cuando está listo. Pregúntale "mis videos" para ver los últimos generados.' },
    ],
    tips: [
      'Activa el briefing automático una sola vez ("actívame el briefing diario a las 8") y cada mañana te llega el resumen por Telegram sin pedirlo.',
      'El Copiloto APRENDE: dile "recuerda que…" y aplicará esa preferencia siempre. Pregúntale "¿qué has aprendido?" para ver su memoria.',
      'Dos memorias distintas: "recuerda que…" entrena AL COPILOTO (tus preferencias); "enséñale al bot que…" entrena AL BOT DE VENTAS que atiende a tus clientes por WhatsApp.',
      'Se oculta solo cuando abres una ventana/formulario para no estorbar, y reaparece al cerrarla.',
    ],
    gallery: [
      { img: 'flow-copilot-panel', caption: 'Panel del Copiloto abierto: te saluda con un resumen del día y sugerencias; escríbele tu pedido en la barra de abajo y mira el progreso en vivo mientras ejecuta.' },
    ],
    reference: {
      buttons: [
        { name: 'Briefing diario automático', detail: 'Dile "actívame el briefing diario a las [hora]" y cada mañana te llega por Telegram el resumen: actividad, leads calientes, citas de hoy/mañana y salud del sistema. Puedes añadir un WhatsApp ("…y mándalo también al 521…"). Para apagarlo: "desactiva el briefing diario".' },
        { name: 'Enviar fotos/videos a clientes', detail: '"Mándale la foto del [auto] a Juan" o "mándale el último video a Ana con el texto…". El archivo llega por WhatsApp y queda registrado en la conversación.' },
        { name: 'Cobros (link de pago)', detail: '"Cóbrale $8,000 a Luis por el apartado" → crea un link de pago real (Stripe) y se lo envía por WhatsApp. Cuando el cliente paga, el trato se cierra como GANADO automáticamente. Requiere tu clave de Stripe en Configuración → Pagos.' },
        { name: 'Automatizaciones por chat', detail: '"¿Qué automatizaciones tengo?", "crea una que etiquete a los nuevos", "pausa la de reactivación", "ejecútala ahora" — todo sin salir del chat.' },
        { name: 'Simular cliente (demo)', detail: '"Simula un cliente que pregunta el precio del [auto]" → te muestra EXACTAMENTE qué respondería el bot, sin enviar nada real. Perfecto para demos y pruebas.' },
      ],
    },
  },
  {
    id: 'marketing', icon: Megaphone, title: 'Marketing IA', tagline: 'Tu agencia de marketing completa, con IA',
    shot: 'marketing', video: 'marketing',
    what: 'Es tu departamento de marketing entero dentro del panel: crea las imágenes y videos de tus autos, escribe los textos, los publica en redes, responde comentarios, mide qué anuncio te trae ventas y hasta te manda un reporte. Todo con Inteligencia Artificial y usando las fotos y datos reales de tu inventario. Se organiza en pestañas; cada una hace una cosa. Lo mínimo para empezar: elige un auto, genera su creativo y publícalo (o deja el Piloto Automático trabajando).',
    steps: [
      'Paso 1 — Crea el creativo: en "Estudio de Diseños" elige un auto y su formato (Feed cuadrado o Historia vertical) y plantilla (Clásica, Ficha u Oferta). La imagen se arma sola con la foto real, el precio, las specs y tu logo.',
      'Paso 2 — Escribe el texto: pulsa "Generar caption con IA" y tienes el texto + hashtags listos para Instagram o Facebook. Con "A/B" el sistema te da 2-3 versiones (emocional, precio, urgencia) para que elijas la que más venda.',
      'Paso 3 — Publica o programa: "Publicar ahora" lo sube a tus redes conectadas; "Agendar" lo programa; o mándalo al Estado de WhatsApp. Si activaste Aprobación, primero te llega a Telegram para tu OK.',
      'Paso 4 — Deja que trabaje solo: enciende el "Piloto Automático" y el sistema elige autos, crea contenido y publica en los mejores horarios sin que hagas nada.',
      'Paso 5 — Mide: en "Optimización" ves qué anuncio te trajo leads y ventas, y las métricas reales de cada publicación (alcance, me gusta, comentarios).',
    ],
    cases: [
      { q: '¿Cómo sé qué anuncio me está trayendo ventas?', a: 'En la pestaña Optimización, sección "Resultados por anuncio": el sistema conecta cada cliente que llegó por un anuncio (a tu WhatsApp) con las ventas cerradas, y te muestra qué anuncio trajo más leads y cuáles se convirtieron. Dejas de adivinar en qué invertir.' },
      { q: '¿La IA crea las fotos de los autos?', a: 'Sí. En "Fotos con IA" el sistema genera fotos publicitarias profesionales de tus autos (estilo showroom, calle, lujo o aventura) sin necesidad de fotógrafo ni estudio, listas para publicar. También puede usar la foto real del auto como referencia.' },
      { q: '¿El bot responde los comentarios de mis publicaciones?', a: 'Sí. Cuando alguien comenta "precio?" o "sigue disponible?" en tus publicaciones de Facebook, la IA responde al instante y lo invita a escribirte por WhatsApp. (Requiere que tu cuenta de Meta tenga el permiso de gestión de comentarios.)' },
      { q: '¿Puedo revisar antes de que se publique algo?', a: 'Sí, activa el modo Aprobación: cuando el sistema quiera publicar, te llega el borrador a Telegram y no sale hasta que tú lo apruebas (o lo rechazas). Control total.' },
      { q: '¿Qué estilos de video hay?', a: 'Cuatro, cada uno con su look, música y voz: Impacto (oferta agresiva), Premium (lujo elegante), Dinámico (urbano juvenil), Ficha (informativo limpio). Si no eliges, se usa uno al azar para que tus videos nunca se vean repetidos. El video usa hasta 6 fotos reales del auto, con voz que dice specs y precio sincronizados, música y efectos.' },
      { q: '¿Puedo convertir una reseña de un cliente feliz en publicidad?', a: 'Sí. Con "Testimonios" el sistema convierte la reseña en una imagen profesional de prueba social (con tu logo, la cita, 5 estrellas y el nombre del cliente) — de lo que más convierte al vender autos.' },
      { q: '¿Necesito conectar Facebook/Instagram?', a: 'Para publicar directo y ver métricas reales, sí (te guiamos en la pestaña Configuración). Mientras, puedes generar todo el contenido, descargarlo y publicarlo a mano, o mandarlo al Estado de WhatsApp (que no requiere nada externo).' },
    ],
    tips: [
      'Mientras mejores fotos tenga el auto en Inventario, mejores quedan los creativos y videos.',
      'El video tarda ~1-2 minutos en producirse; el Copiloto te avisa por Telegram cuando está listo.',
      'Todo lo puedes pedir por voz al Copiloto: "hazme un video del Tucson con voz", "genera una foto del Versa estilo showroom", "publica el último video en Instagram", "mándame el reporte de marketing".',
      'Publica al Estado de WhatsApp: muchísima gente ve autos ahí todos los días, y no necesita conectar ninguna red.',
    ],
    reference: {
      tabs: [
        { name: 'Estudio de Diseños', detail: 'Crea la IMAGEN del creativo (Feed cuadrado o Historia vertical) con plantillas Clásica/Ficha/Oferta, precio y tu logo, más el caption con IA. Funciona sin conectar redes: puedes descargar el PNG.' },
        { name: 'Estudio de Video', detail: 'Genera VIDEOS comerciales: intro de marca → gancho → specs (una por toma) → precio → cierre con tu WhatsApp. 4 estilos, música, efectos y voz sincronizada. ~11-14 seg, listos para Reels/TikTok/WhatsApp.' },
        { name: 'Fotos con IA', detail: 'La IA (MiniMax) CREA fotos publicitarias profesionales de tus autos por estilo (showroom, calle, lujo, aventura). Sin fotógrafo ni estudio. Puede usar la foto real como referencia.' },
        { name: 'Piloto Automático', detail: 'El sistema estudia el mercado, elige un auto, crea el contenido y publica solo en los mejores horarios. Si activaste Aprobación, cada publicación espera tu OK por Telegram.' },
        { name: 'Campañas', detail: 'Organiza tu marketing por campaña: objetivo, presupuesto y canales. Todo tu contenido queda ordenado por campaña.' },
        { name: 'Contenido IA', detail: 'Genera con IA: estrategias, textos publicitarios (copy), guiones de video, historias, ideas de calendario y análisis de audiencia u optimización.' },
        { name: 'Calendario', detail: 'Planea y agenda tus publicaciones en un calendario visual, con sugerencias por temporada (Buen Fin, Día del Padre, Fiestas Patrias) y tu mejor horario según cuándo te escriben tus clientes.' },
        { name: 'Biblioteca', detail: 'Guarda todo el contenido generado para reutilizarlo cuando quieras. Nada se pierde.' },
        { name: 'Audiencia', detail: 'Analiza tu base de clientes: totales, calientes/tibios/fríos, de dónde llegan y qué tipo de comprador son. El botón "Analizar con IA" arma perfiles de tu cliente ideal.' },
        { name: 'Optimización', detail: 'El centro de resultados: métricas REALES de Meta (alcance, me gusta, comentarios), la sección "Resultados por anuncio" (qué anuncio trajo leads y ventas) y recomendaciones de la IA para mejorar.' },
        { name: 'Automatización', detail: 'Crea reglas de marketing que corren solas según lo que pase con tus clientes (por etapa, temperatura, etiqueta o inactividad).' },
        { name: 'Configuración', detail: 'Donde conectas Facebook, Instagram (y, si los usas, TikTok y Google) pegando sus credenciales, y activas el modo Aprobación.' },
      ],
      buttons: [
        { name: 'Feed / Historia + plantillas (Clásica/Ficha/Oferta)', detail: 'Elige formato y plantilla; la vista previa se regenera. "Descargar feed" baja el PNG; "Regenerar" refresca la imagen.' },
        { name: 'Generar caption con IA', detail: 'Escribe el texto + hashtags para Instagram o Facebook. Luego lo copias o lo publicas.' },
        { name: 'A/B (variantes)', detail: 'Genera 2-3 versiones del texto con enfoques distintos (emocional, precio, urgencia). Publica dos y compara cuál rinde mejor en Optimización.' },
        { name: 'Publicar ahora / Agendar', detail: 'Publica el creativo en las redes/formatos seleccionados (requiere una red conectada), o prográmalo para una fecha/hora. Con Aprobación activa, primero pide tu OK por Telegram.' },
        { name: 'Publicar al Estado de WhatsApp', detail: 'Sube el creativo del auto al Estado de WhatsApp, visible para tus contactos. No requiere conectar ninguna red.' },
        { name: 'Analizar con IA (Audiencia)', detail: 'Genera perfiles de tu cliente ideal y oportunidades de remarketing a partir de tu CRM real.' },
        { name: 'Piloto: Activado / Desactivado', detail: 'Enciende/apaga el bot de publicación — se guarda al instante.' },
        { name: 'Reporte de marketing', detail: 'Genera y envía por Telegram un resumen ejecutivo: alcance, leads generados, ventas atribuidas, próximas oportunidades y mejor horario.' },
      ],
      connect: [
        { name: 'Conectar Facebook / Instagram (para publicar y ver métricas)', steps: [
          'Ve a Marketing → pestaña "Configuración".',
          'Abre la tarjeta "Meta Business (Facebook)" y/o "Instagram Business". Cada una trae un tutorial "¿Cómo obtener las credenciales?".',
          'Pega los datos que pide (Access Token, Page ID / Instagram Business Account ID, etc.) y pulsa "Guardar".',
          'Cuando quede conectado, ya puedes "Publicar ahora", ver métricas reales en Optimización y activar la auto-respuesta a comentarios.',
        ]},
        { name: 'Activar Aprobación antes de publicar', steps: [
          'En Configuración de Marketing (o pidiéndoselo al Copiloto: "activa la aprobación de marketing"), enciende el modo Aprobación por Telegram.',
          'A partir de ahí, cada borrador que quiera publicar el sistema te llega a Telegram con botones para Aprobar o Rechazar.',
          'Solo se publica lo que apruebas.',
        ]},
      ],
    },
  },
  {
    id: 'automations', icon: Sparkles, title: 'Automatizaciones', tagline: 'Flujos de trabajo que corren solos 24/7',
    shot: 'automations', video: 'automations',
    what: 'Aquí viven las reglas que trabajan por ti sin que hagas nada: seguimientos automáticos, etiquetado de nuevos leads, notificaciones al equipo, reactivación de fríos y más. Cada automatización tiene un disparador (qué la enciende) y acciones (qué hace). Los 6 indicadores de arriba y la tabla muestran datos reales: cuántas veces ha corrido cada una y su tasa de éxito.',
    steps: [
      'Revisa los 6 indicadores: activas, ejecuciones totales, del mes, tasa de éxito, fallidas y última ejecución.',
      'En la tabla ve cada automatización: su disparador, sus acciones (iconos), ejecuciones y el interruptor para activar/pausar.',
      'Haz clic en una fila para ver su flujo completo en el panel derecho (disparador → acciones en orden).',
      'Crea una nueva con "Nueva automatización" o parte de una plantilla con "Importar automatización".',
    ],
    cases: [
      { q: '¿Qué es un disparador?', a: 'El evento que enciende la automatización: un mensaje recibido, un horario programado, un cambio de etapa en ventas, inactividad del cliente, etc.' },
      { q: '¿Por qué una automatización tiene 0 ejecuciones?', a: 'Porque su disparador aún no ha ocurrido (ej. una regla de "cambio de etapa" que nadie ha disparado). El tab "Sin ejecutar" las agrupa.' },
      { q: '¿Puedo crearlas hablando?', a: 'Sí: dile al Copiloto "crea una automatización que cuando llegue un mensaje etiquete al contacto como nuevo" — la crea activa. También puedes pedirle pausarla o ejecutarla ahora.' },
    ],
    tips: ['El donut del panel derecho muestra el resultado real de las ejecuciones registradas (exitosas/fallidas).'],
    reference: {
      tabs: [
        { name: 'Todas / Activas / Pausadas / Programadas / Sin ejecutar / Inactivas', detail: 'Filtran la tabla por estado o tipo. Los contadores son reales.' },
      ],
      buttons: [
        { name: 'Nueva automatización', detail: 'Crea una regla: nombre, descripción, tipo de disparador y condición.' },
        { name: 'Importar automatización', detail: 'Abre la galería de plantillas listas (seguimiento 24h, encuesta, reactivación…) para activar en un clic.' },
        { name: 'Interruptor (por fila)', detail: 'Activa o pausa esa automatización al instante.' },
        { name: 'Menú ⋮ (por fila)', detail: 'Editar, Ejecutar ahora (corrida manual que queda registrada) o Eliminar.' },
        { name: 'Panel derecho', detail: 'Flujo de la automatización seleccionada (disparador → acciones), estadísticas de ejecución (donut), acciones rápidas y ayuda.' },
      ],
    },
  },
  {
    id: 'gbrain', icon: Brain, title: 'gBrain', tagline: 'El cerebro: lo que sabe tu IA',
    shot: 'gbrain', video: 'gbrain',
    what: 'gBrain es la base de conocimiento que alimenta a todos tus agentes: tu catálogo, el tono de tu marca, los datos de tu negocio, las lecciones aprendidas y los agentes activos. Es donde defines "qué sabe" tu IA.',
    steps: [
      'Revisa el resumen: catálogo, tono, datos del negocio, lecciones y agentes.',
      'Edita el tono/personalidad de tu asesor directamente aquí.',
      'Actualiza datos del negocio (horarios, dirección, teléfono).',
    ],
    cases: [
      { q: '¿En qué se diferencia de Configuración?', a: 'gBrain es la vista resumida y enfocada a "qué sabe y cómo habla la IA". Configuración tiene todos los ajustes técnicos del sistema.' },
    ],
    tips: ['Si el bot da datos incorrectos del negocio, revísalos aquí.'],
    reference: {
      buttons: [
        { name: 'Guardar (arriba)', detail: 'Guarda el tono, el saludo y los datos del negocio; aplica desde el próximo mensaje del bot.' },
        { name: 'Tono y persona', detail: 'Editas el "tono del vendedor" y un "saludo inicial" opcional. (Si usas un prompt avanzado personalizado, ese tiene prioridad.)' },
        { name: 'Datos y políticas del negocio', detail: 'Editas horario, dirección, teléfono, zona horaria y enlace para agendar — el bot los usa al responder.' },
        { name: 'Catálogo / Lecciones / Agentes', detail: 'Solo lectura con accesos directos: "Gestionar inventario", "Entrenar IA" (Playground) y "Agent Factory".' },
        { name: 'Seguimiento automático', detail: 'Activa/desactiva la reactivación proactiva de leads inactivos. "Ver a quién escribiría" muestra la lista previa; "Reactivar ahora" agenda los envíos. (Manda WhatsApp a clientes reales.)' },
        { name: 'Aprobar por Telegram (control total)', detail: 'Con la casilla activada, cada seguimiento te llega a Telegram como borrador con botones Aprobar/Descartar. Si nadie responde en 3 horas, se envía automáticamente; y si el cliente ya contestó por su cuenta, el borrador se descarta solo.' },
        { name: 'Reglas de seguimiento', detail: 'Crea reglas "si lleva N días sin responder → enviar este mensaje" (soporta {{name}}); cada una se activa/pausa o se borra. Solo corren si el seguimiento automático está activo.' },
      ],
    },
  },
  {
    id: 'analytics', icon: BarChart3, title: 'Analíticas y Reportes', tagline: 'Mide tus resultados',
    shot: 'analytics', video: 'analytics',
    what: 'Analíticas te muestra el embudo de conversión, tasa de cierre y de dónde vienen tus clientes. Reportes te permite generar y exportar informes del periodo que elijas.',
    steps: [
      'En Analíticas revisa el embudo: cuántos leads pasan de una etapa a otra.',
      'Identifica dónde se te caen los clientes para mejorarlo.',
      'En Reportes elige el periodo (hoy, 7, 30, 90 días) y exporta a Excel si lo necesitas.',
    ],
    cases: [
      { q: '¿Qué es la tasa de conversión?', a: 'El porcentaje de leads que terminan comprando. Subirla es el objetivo: el diagnóstico del Copiloto te dice qué la está frenando.' },
      { q: '¿Puedo recibir el resumen sin entrar al panel?', a: 'Sí, de dos formas: (1) Briefing diario automático — dile al Copiloto "actívame el briefing diario a las 8" y cada mañana te llega por Telegram; (2) Comandos de Telegram — escríbele a tu bot /briefing, /top_leads, /pipeline, /stock, /agenda_hoy o /menu para ver todos.' },
    ],
    tips: ['Pídele al Copiloto "diagnostica el motor de conversión" para un análisis con acciones concretas.', 'Desde Telegram también puedes consultar el score de un cliente: /score_cliente Juan Pérez.'],
    reference: {
      buttons: [
        { name: 'Periodo (7 / 30 / 90 días)', detail: 'En Analíticas: cambia la ventana de tiempo de todas las métricas y gráficas.' },
        { name: 'Exportar (Analíticas)', detail: 'Descarga un CSV con métricas, embudo, canales, mejores contactos y rendimiento de agentes.' },
        { name: 'Embudo de Conversión', detail: 'Leads → Cualificados → Con propuesta → Cerrados; cada barra se expande para explicarla.' },
        { name: 'Tipo de Reporte (Reportes)', detail: 'Elige Contactos, Deals, Conversaciones o Analíticas.' },
        { name: 'Formato CSV / JSON', detail: 'Elige el formato de descarga del reporte.' },
        { name: 'Generar Reporte / Descargar', detail: 'Genera la vista previa (te dice cuántos registros) y luego descarga el archivo. Guarda un historial de los últimos reportes.' },
      ],
      filters: [
        { name: 'Rango de fechas (Reportes)', detail: 'Acota el reporte a un periodo Desde/Hasta.' },
      ],
    },
  },
  {
    id: 'calendar', icon: CalendarDays, title: 'Calendario', tagline: 'Tus citas y recordatorios',
    shot: 'calendar', video: 'calendar',
    what: 'Gestiona las citas que el bot (o tú) agendan con los clientes. El sistema envía recordatorios automáticos antes de cada cita y pregunta por la asistencia.',
    steps: [
      'Visualiza las citas próximas en el calendario.',
      'Crea o reagenda citas manualmente cuando haga falta.',
      'El bot agenda solo cuando el cliente acepta una cita por WhatsApp.',
    ],
    cases: [
      { q: '¿Se le recuerda al cliente?', a: 'Sí. El sistema manda un recordatorio automático ~1 hora antes y, tras la cita, pregunta si asistió.' },
    ],
    tips: ['Configura tu zona horaria en Configuración para que las horas salgan correctas.'],
    reference: {
      buttons: [
        { name: 'Nueva Cita', detail: 'Crea una cita: título, fecha y hora, duración, tipo (Llamada/Reunión/Seguimiento/Tarea), contacto opcional y notas.' },
        { name: 'Abrir cita (Editar)', detail: 'Edita cualquier dato. Para REAGENDAR, cambia la "Fecha y Hora" y guarda. Estado: Completar / Pendiente / Cancelar. También puedes Eliminar.' },
        { name: 'Mes / Semana / Día', detail: 'Cambia la vista del calendario. Clic en un día/hora vacío crea una cita ahí; clic en una cita la abre.' },
        { name: '‹ Hoy ›', detail: 'Navega entre periodos o vuelve a la fecha actual.' },
      ],
      filters: [
        { name: 'Tipo', detail: 'Muestra solo Llamadas, Reuniones, Seguimientos o Tareas (o Todos).' },
      ],
    },
  },
  {
    id: 'playground', icon: MessageSquareCode, title: 'Playground IA', tagline: 'Prueba y entrena a tu bot',
    shot: 'playground', video: 'playground',
    what: 'Un espacio seguro para conversar con tu asesor IA como si fueras un cliente, probar distintos escenarios (consulta general, negociación, objeción, cierre) y entrenarlo con ejemplos y lecciones.',
    steps: [
      'Elige un escenario (preset) o escribe libremente como cliente.',
      'Observa cómo responde el bot y ajusta su tono/conocimiento si hace falta.',
      'Usa la sección de Entrenar para darle conversaciones, archivos o lecciones de ejemplo.',
    ],
    cases: [
      { q: '¿Esto le escribe a clientes reales?', a: 'No. El Playground es una simulación privada; nada se envía por WhatsApp.' },
    ],
    tips: ['Prueba aquí cualquier cambio de tono/prompt ANTES de dejarlo en producción.'],
    reference: {
      tabs: [
        { name: 'Probar', detail: 'Chateas con el agente elegido como si fueras cliente. Nada se envía por WhatsApp.' },
        { name: 'Entrenar', detail: 'Enseñas a la IA con conversaciones, archivos y lecciones (correcciones in-context) para que mejore.' },
      ],
      buttons: [
        { name: 'Selector de agente', detail: 'Elige con qué agente quieres probar. Si no hay agentes, te avisa que crees uno.' },
        { name: 'Sandbox', detail: 'Modo de prueba libre: aparece un campo de System Prompt para probar instrucciones sin guardar nada en la base ni enviar por WhatsApp.' },
        { name: 'Escenarios (presets)', detail: 'Botones que mandan un mensaje típico: Consulta general, Consulta de precio, Objeción, Agendar cita.' },
        { name: 'Panel de Análisis', detail: 'Muestra lo que el "Revenue Engine" detecta en cada respuesta: acción, estrategia, ruteo de agente, tags CRM, estado de cita y tareas de seguimiento.' },
        { name: 'Limpiar', detail: 'Borra la conversación de prueba actual.' },
      ],
    },
  },
  {
    id: 'meli', icon: Store, title: 'Mercado Libre', tagline: 'Publica y gestiona sin salir del panel',
    shot: 'meli', video: 'meli',
    what: 'Conecta tu cuenta de Mercado Libre para publicar autos de tu inventario, y gestionar publicaciones, preguntas, órdenes y envíos desde aquí.',
    steps: [
      'En la pestaña Conexión, ingresa tus credenciales de Mercado Libre (App ID y Secret) y conecta tu cuenta.',
      'En Publicaciones verás tus autos del inventario; pulsa "Publicar" en el que quieras subir.',
      'Responde Preguntas y revisa Ventas/órdenes desde sus pestañas.',
    ],
    cases: [
      { q: '¿Qué necesito para conectarlo?', a: 'Una aplicación de desarrollador de Mercado Libre (App ID + Client Secret) con el redirect configurado. Es un paso único; te guiamos.' },
    ],
    tips: ['Solo aparecen para publicar los autos que tengas en Inventario.'],
    reference: {
      tabs: [
        { name: 'Conexión', detail: 'Conecta o desconecta tu cuenta de Mercado Libre.' },
        { name: 'Publicaciones', detail: 'Tus autos del inventario sin publicar (con botón Publicar) y tus publicaciones activas (pausar/reactivar/cerrar/ver).' },
        { name: 'Preguntas', detail: 'Preguntas de compradores; respondes desde aquí.' },
        { name: 'Ventas', detail: 'Tabla de órdenes/ventas (orden, producto, comprador, total, estado, fecha).' },
        { name: 'Bitácora', detail: 'Registro de cada acción hecha en Mercado Libre (con errores marcados en rojo).' },
      ],
      buttons: [
        { name: 'Publicar (por auto)', detail: 'Sube ese auto del inventario a Mercado Libre. Solo aparecen los que aún no están publicados.' },
        { name: 'Sincronizar', detail: 'Trae el estado más reciente de tus publicaciones desde Mercado Libre.' },
        { name: 'Ver / Pausar / Reactivar / Cerrar', detail: 'Sobre cada publicación activa: abrir en ML, pausarla, reactivarla o cerrarla.' },
        { name: 'Responder (Preguntas)', detail: 'Escribe la respuesta y envíala al comprador directamente.' },
      ],
      connect: [
        { name: '🛒 Conectar Mercado Libre (con tu app de desarrollador)', steps: [
          'Entra a developers.mercadolibre.com.mx/devcenter y crea una aplicación.',
          'Copia el App ID (Client ID) y el Client Secret y pégalos en la pestaña Conexión.',
          'En tu app de ML, pega EXACTAMENTE el "Redirect URI" que te muestra la pantalla (hay un botón para copiarlo) y guárdalo.',
          'Elige tu País/sitio (México = MLM) y pulsa "Conectar con Mercado Libre".',
          'Se abre Mercado Libre para que inicies sesión y pulses Autorizar; vuelves conectado (verás "Conectado como <tu cuenta>"). Para salir, usa "Desconectar".',
        ]},
      ],
    },
  },
  {
    id: 'valiguard', icon: Shield, title: 'ValiGuard', tagline: 'Seguridad, auditoría y cumplimiento en tiempo real',
    shot: 'valiguard', video: 'valiguard',
    what: 'ValiGuard es el centro de seguridad de tu negocio: monitorea TODA la actividad en tiempo real (qué hizo la IA, qué automatizaciones corrieron, quién inició sesión y desde qué dispositivo), registra cada acceso con su IP y ubicación, te deja revocar sesiones remotamente, y mantiene el cumplimiento de protección de datos (LFPDPPP) con el expediente auditable de cada contacto.',
    steps: [
      'Revisa los 5 indicadores de arriba: Eventos de hoy, Alertas activas, Usuarios activos, Accesos sospechosos y Cumplimiento (%).',
      'En "Eventos en vivo" ve todo lo que pasa: cada evento muestra fecha, quién lo hizo (IA/Sistema/Usuario), el módulo, detalles, IP/dispositivo y su nivel de riesgo.',
      'Haz clic en cualquier evento para abrir el panel "Detalle del evento" con la información completa y acciones recomendadas.',
      'En la pestaña "Sesiones" ve desde qué dispositivos se ha iniciado sesión (navegador, IP, ubicación) y revoca cualquier acceso con un clic.',
      'Usa "Exportar reporte" para descargar la bitácora filtrada en CSV.',
    ],
    cases: [
      { q: '¿Qué son los "Accesos sospechosos"?', a: 'Intentos fallidos de iniciar sesión en tu cuenta (últimos 7 días). Cada intento queda registrado con su IP y dispositivo. Si ves alguno que no reconoces, cambia tu contraseña.' },
      { q: '¿Cómo cierro la sesión de un dispositivo que no reconozco?', a: 'Pestaña "Sesiones" → busca el dispositivo → botón "Revocar". Esa sesión queda cerrada remotamente.' },
      { q: '¿Qué significa el nivel de riesgo (Alto/Medio/Bajo/Info)?', a: 'Qué tanta atención requiere el evento: Alto = revísalo (lead estancado, intento de acceso fallido, eliminación); Medio = dale seguimiento (lead caliente detectado, objeción); Bajo/Info = registro normal de trazabilidad.' },
      { q: '¿Qué significa "Sellado" en Cumplimiento?', a: 'Que el trato/expediente está cerrado correctamente con todo en regla. "Pendiente" aún le falta algo y "Vencido" requiere atención.' },
    ],
    tips: ['Pregúntale al Copiloto "¿todo funciona bien?" o "¿ha habido accesos sospechosos?" y te da el resumen sin abrir el módulo.'],
    reference: {
      tabs: [
        { name: 'Eventos en vivo', detail: 'El feed completo de actividad: acciones de la IA, automatizaciones, citas, scores, accesos — todo con actor, módulo, detalles y riesgo.' },
        { name: 'Accesos', detail: 'Solo los inicios de sesión (exitosos y fallidos) con IP, navegador, sistema y ubicación.' },
        { name: 'Sesiones', detail: 'Dispositivos con sesión iniciada: usuario, navegador/SO, IP, ubicación, cuándo entró y su estado. Botón "Revocar" para cerrar un acceso remotamente.' },
        { name: 'Logs de auditoría', detail: 'Rastro de acciones de usuarios: exportaciones de datos, eliminaciones de contactos, cambios de permisos.' },
        { name: 'Cambios críticos', detail: 'Solo los eventos de riesgo Alto — lo que exige tu atención.' },
        { name: 'Alertas', detail: 'Eventos de riesgo Alto y Medio juntos (la lista de pendientes de seguridad).' },
        { name: 'Cumplimiento', detail: 'La tabla LFPDPPP por contacto: consentimiento (%), estatus Sellado/Pendiente/Vencido y cumplimiento. Clic en un contacto abre su expediente con la bitácora cronológica.' },
      ],
      buttons: [
        { name: 'Rango temporal (Hoy / 7 / 30 días / Todo)', detail: 'Acota todos los eventos mostrados a ese periodo.' },
        { name: 'Buscar / Módulo / Riesgo', detail: 'Filtra los eventos por texto, por módulo de origen o por nivel de riesgo.' },
        { name: 'Exportar reporte', detail: 'Descarga en CSV los eventos actualmente filtrados (fecha, actor, evento, módulo, detalles, riesgo).' },
        { name: 'Clic en un evento (fila)', detail: 'Abre el panel "Detalle del evento": información general, detalles técnicos (IP, dispositivo, score…), acciones recomendadas, y botones Marcar como revisado / Ver contacto / Copiar detalles.' },
        { name: 'Revocar (en Sesiones)', detail: 'Cierra esa sesión remotamente: el dispositivo pierde el acceso (requiere rol Dueño/Admin).' },
      ],
    },
  },
  {
    id: 'settings', icon: Settings, title: 'Configuración', tagline: 'El centro de control del sistema',
    shot: 'settings', video: 'settings',
    what: 'Aquí ajustas todo: conectas WhatsApp, defines datos del negocio, el tono del asesor, tu plan, notificaciones, el equipo y las llaves de servicios externos (voz, etc.).',
    steps: [
      'Pestaña Conexiones: conecta WhatsApp por QR y, si quieres voz, pega tu llave de Groq/OpenAI para transcribir audios.',
      'Datos del negocio: nombre, industria, horarios, dirección, teléfono, zona horaria.',
      'Agente: define el tono/personalidad de tu asesor IA.',
      'Plan y facturación: revisa tu plan actual y consumo.',
    ],
    cases: [
      { q: '¿El bot ve imágenes y escucha audios?', a: 'Ve imágenes y lee documentos de fábrica. Para transcribir notas de voz, agrega tu llave de Groq (gratis) u OpenAI en Conexiones.' },
      { q: 'Se desconectó mi WhatsApp', a: 'Vuelve a Conexiones y escanea el QR de nuevo. Mantén el teléfono con internet.' },
    ],
    tips: ['Solo los roles Dueño/Admin pueden cambiar la configuración.'],
    gallery: [
      { img: 'flow-settings-conexiones', caption: 'Configuración → Conexiones: aquí conectas tu WhatsApp escaneando el código QR, y agregas tus llaves de voz (Groq/OpenAI) si quieres que el bot transcriba audios.' },
    ],
    reference: {
      tabs: [
        { name: 'General', detail: 'Datos del espacio: nombre del negocio, industria (9 opciones o una personalizada), logo, idioma (ES/EN), zona horaria, horario de atención de la IA (24h o personalizado) y parámetros de financiamiento (tasa anual, enganche mínimo, plazos).' },
        { name: 'Conexiones', detail: 'Donde conectas los canales: WhatsApp (QR directo o API oficial de Meta), Telegram (bot + alertas) y las llaves de voz/multimedia (Groq/OpenAI).' },
        { name: 'Agentes', detail: 'Personalidad del asesor (JHON/Profesional/Amigable/Agresivo), la "creatividad" (temperatura 0–1) y el editor del System Prompt del bot.' },
        { name: 'Facturación y Equipo', detail: 'Tu plan actual, consumo vs. límites (contactos, agentes, mensajes IA), comparación de planes para subir/bajar, facturas y miembros del equipo.' },
        { name: 'Módulos', detail: 'Ajustes de negocio por módulo: dirección, catálogo, citas, etc.' },
        { name: 'Avanzado', detail: 'Solo el Dueño. Chat IA de prueba, Automatizaciones y Panel de Desarrollador (API keys, modelos, webhooks).' },
      ],
      buttons: [
        { name: 'Guardar Cambios (General)', detail: 'Guarda nombre, industria, zona horaria, idioma, horario de la IA y financiamiento del negocio.' },
        { name: 'Subir logo', detail: 'Sube el logo de tu espacio (máx 2 MB). Se guarda localmente en tu navegador para mostrarlo en el panel.' },
        { name: 'Guardar Configuración (Agentes)', detail: 'Guarda la personalidad elegida y la creatividad (temperatura) del asesor.' },
        { name: 'Guardar Prompt', detail: 'Guarda el System Prompt (las instrucciones maestras del bot). "Reset por defecto" restaura el original.' },
        { name: 'Gestionar Suscripción', detail: 'Abre el portal de pagos (Stripe) para administrar tu suscripción y método de pago.' },
        { name: 'Upgrade / Downgrade', detail: 'En "Otros Planes": cambia de plan; te lleva al checkout del plan elegido.' },
      ],
      connect: [
        { name: '📱 Conectar WhatsApp (QR directo)', steps: [
          'Ve a Conexiones → bloque "WhatsApp Directo" y pulsa "Conectar WhatsApp" (aparece "Generando QR…").',
          'En tu teléfono abre WhatsApp → menú ⋮ → Dispositivos vinculados → Vincular un dispositivo.',
          'Apunta la cámara al código QR de la pantalla. El QR expira en 60 s; si caduca, pulsa "Refresh QR".',
          'Cuando el estado cambie a "Conectado" (verde) verás tu número. Para desconectar usa "Desconectar WhatsApp".',
          'Nota: es conexión no oficial (Baileys); úsala con tu número normal. Mantén el teléfono con internet.',
        ]},
        { name: '🟢 WhatsApp API oficial (Meta) — opcional', steps: [
          'En Conexiones → "WhatsApp Business API". Si no sabes obtener credenciales, pulsa "¿No sabes cómo obtener tus credenciales?" para el tutorial.',
          'Pega el Phone Number ID y el System User Access Token (permanente); el Business Account ID es opcional.',
          'Pulsa "Guardar y activar Meta API". El canal cambia a Meta Cloud API.',
          'Copia la URL del Webhook y el Verify Token que aparecen y pégalos en tu Meta Developer Console para recibir mensajes.',
          'Con Business ID puedes ver tus plantillas aprobadas ("Actualizar"). "Eliminar configuración" vuelve al modo QR.',
        ]},
        { name: '✈️ Conectar Telegram (bot + alertas)', steps: [
          'Paso 1 — crea tu bot: en Telegram abre @BotFather → /newbot → ponle nombre y un usuario que termine en "bot" → copia el token.',
          'En Conexiones → Telegram pega el "Token del bot" y el "Usuario del bot (sin @)" y pulsa "Guardar y conectar bot" (verifica el token y registra el webhook solo).',
          'Usa "Probar conexión" para confirmar que el bot responde.',
          'Paso 2 — vincula tu Telegram para recibir alertas (leads calientes, citas, pagos): pulsa "Generar enlace de Telegram" y ábrelo desde tu Telegram (o usa el /start con el token).',
          'Cuando quede "vinculado", recibirás las alertas ahí. "Desvincular" lo desconecta.',
        ]},
        { name: '🎤 Activar voz (transcripción de notas de audio)', steps: [
          'Las imágenes y documentos YA funcionan sin configurar nada. Solo el AUDIO necesita una llave.',
          'Consigue una API key GRATIS de Groq en console.groq.com/keys (o una de OpenAI).',
          'En Conexiones → "🎤 Voz e imágenes" pega la key en el campo Groq (u OpenAI) y pulsa "Guardar key".',
          'El indicador cambiará a "✅ Transcripción de voz ACTIVA": el bot ya entiende las notas de voz que le manden.',
        ]},
        { name: '💳 Conectar Pagos (Stripe) — cobros y cierre automático', steps: [
          'Sirve para que la IA (o tú por el Copiloto) genere LINKS DE PAGO y para que, cuando el cliente pague, el trato se marque GANADO solo.',
          'Crea/abre tu cuenta en stripe.com y copia tu Clave secreta (sk_live_… o sk_test_…).',
          'En Configuración busca la tarjeta "Pagos (cierre automático)" → "Conectar Stripe" → pega la clave secreta.',
          'Copia la URL de webhook que te muestra la tarjeta y agrégala en Stripe → Developers → Webhooks (evento: checkout.session.completed); pega el "Signing secret" (whsec_…) de vuelta en la tarjeta y guarda.',
          'Listo: pídele al Copiloto "genera un link de pago de $5,000 por el anticipo y mándaselo a [cliente]".',
        ]},
      ],
    },
  },
  {
    id: 'faq', icon: HelpCircle, title: 'Preguntas frecuentes', tagline: 'Dudas y casos comunes',
    what: 'Respuestas rápidas a las situaciones más comunes. Si no encuentras lo que buscas, pregúntale al Copiloto IA.',
    cases: [
      { q: 'El bot no responde a un cliente', a: 'Revisa 3 cosas: (1) que WhatsApp esté conectado (Configuración → Conexiones), (2) que la conversación esté en modo "IA" y no "Manual", y (3) que la IA no esté desactivada para ese contacto.' },
      { q: '¿El bot le sigue escribiendo a gente que no contesta?', a: 'No. Tras 2 seguimientos sin respuesta, el sistema se detiene solo y marca al contacto como "desinteresado". Si el cliente responde, el ciclo se reinicia.' },
      { q: '¿Cómo evito que el bot cotice un auto que no tengo?', a: 'El bot solo ofrece lo que esté en Inventario y marcado como Disponible. Mantén tu inventario al día.' },
      { q: '¿Puedo responder yo en vez del bot?', a: 'Sí. En cualquier conversación cambia el botón "IA" a "Manual" y escribe tú. El historial queda igual.' },
      { q: '¿Cómo hago un video profesional de un auto?', a: 'Pídeselo al Copiloto: "hazme un video del [auto] con voz". En ~2 minutos tienes un comercial con tus fotos, voz sincronizada, música y tu WhatsApp al final. Puedes pedir estilo: impacto, premium, dinamico o ficha. Y luego: "publícalo en Instagram y Facebook" o "mándaselo a [cliente]".' },
      { q: '¿Cómo importo mi lista de prospectos?', a: 'Contactos → botón "Importar" → sube tu CSV/Excel. O pégale la lista al Copiloto ("importa estos prospectos: …"). Los duplicados se omiten solos.' },
      { q: '¿Cómo cobro por chat?', a: 'Conecta tu Stripe en Configuración → Pagos y dile al Copiloto: "genera un link de pago de $X por [concepto] y mándaselo a [cliente]". Cuando pague, el trato se marca GANADO automáticamente.' },
      { q: '¿Cómo recibo el resumen del negocio cada mañana?', a: 'Dile al Copiloto "actívame el briefing diario a las 8". Te llegará por Telegram todos los días (requiere Telegram vinculado en Configuración → Conexiones).' },
      { q: '¿Alguien más entró a mi cuenta?', a: 'Revisa ValiGuard → pestañas "Accesos" y "Sesiones": cada inicio de sesión queda registrado con IP, navegador y ubicación. Puedes revocar cualquier sesión con un clic.' },
      { q: '¿Cómo apago o pauso TODA la IA un rato?', a: 'Tablero → tarjeta "IA del bot": Pausar 1h / Pausar 3h (se reactiva sola) o Apagar (hasta que la enciendas). Los mensajes de los clientes se siguen guardando. También por el Copiloto: "pausa la IA 1 hora".' },
      { q: '¿Cómo le enseño algo nuevo al bot de ventas?', a: 'Tres caminos: (1) clic derecho sobre una mala respuesta del bot en Conversaciones → "Corregir IA"; (2) Playground IA → pestaña Entrenar; (3) dile al Copiloto "enséñale al bot que…" y crea la lección por ti. Las lecciones se aplican desde la siguiente respuesta.' },
      { q: '¿Cómo apruebo un pago que la IA dejó pendiente?', a: 'En el Tablero, tarjeta "Aprobaciones" (aparece cuando el candado "Exigir aprobación" está activo), o dile al Copiloto "¿hay aprobaciones pendientes?" y luego "apruébala": genera el link y se lo envía al cliente.' },
      { q: '¿Cómo vuelvo a ver el tutorial de inicio (el tour)?', a: 'En este mismo Manual: botón morado "Ver tour de bienvenida" (en móvil dice "Tour"). Arranca el recorrido interactivo que ilumina cada botón del panel y navega por los módulos en vivo. Puedes repetirlo las veces que quieras.' },
      { q: '¿Qué hago si no sé usar algo?', a: 'Tres opciones: repite el Tour de bienvenida (botón morado arriba), busca el módulo en el índice de este Manual, o abre el Copiloto IA (botón morado flotante) y pregúntale directamente.' },
      { q: '¿El bot atiende a clientes que escriben en inglés?', a: 'Sí. Si un cliente escribe en inglés, el asesor le responde en inglés (y vuelve al español cuando el cliente cambia). No tienes que configurar nada.' },
      { q: '¿El bot cotiza bien los precios y las mensualidades?', a: 'Sí, y de forma exacta. Los precios los toma tal cual de tu Inventario (no los inventa) y las mensualidades las calcula con los parámetros de financiamiento de tu negocio (tasa, enganche mínimo y plazos que pones en Configuración → General). Si no tienes un auto o dato, lo dice en vez de improvisar.' },
      { q: '¿Qué hace el bot después de cerrar una venta?', a: 'Entra en modo POSTVENTA: felicita al cliente, coordina entrega/documentación y le da seguimiento de cortesía, sin volver a intentar venderle. La postventa está exenta de los frenos de seguimiento, así que el cliente que ya compró siempre recibe atención.' },
      { q: '¿Cómo maneja el bot las objeciones ("está caro", "lo voy a pensar")?', a: 'Tiene un guion de objeciones: reconoce la preocupación, aporta valor (financiamiento, comparativa, prueba social) y reencauza hacia la cita o el cierre, sin presionar de más. Si detecta que el cliente ya no quiere, deja de insistir.' },
      { q: '¿Cómo funcionan los seguimientos automáticos a fondo?', a: 'El bot usa una "escalera" de mensajes de seguimiento que va cambiando el enfoque (curiosidad, valor, prueba social, urgencia…) para no repetir lo mismo. En los primeros días insiste con tacto; tras 2 seguimientos sin respuesta se frena y marca "desinteresado", pero pasa al cliente a una cola de reactivación de largo plazo (mensajes espaciados por mes) para rescatarlo más adelante. Cualquier respuesta del cliente reinicia el ciclo. Si el cliente ya tiene una cita agendada, el seguimiento se cancela solo.' },
      { q: '¿Por qué la foto de un auto no se veía y ahora sí?', a: 'Se corrigió la forma en que el sistema entrega las fotos subidas al Inventario. Ya se muestran correctamente las nuevas y las que habías subido antes. Si subes una y no aparece al instante, recarga la página.' },
      { q: '¿Qué archivos puedo usar para importar inventario masivo?', a: 'Excel (.xlsx/.xls), CSV, JSON, SQL, TXT y ahora también Markdown (.md). También puedes pegar el texto directo o dar un enlace de Google Sheets. La IA reconoce las columnas (marca, modelo, precio, año, km…) y te deja revisar antes de guardar.' },
    ],
  },
]

export function ManualView() {
  const [activeId, setActiveId] = useState('inicio')
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  // Dispara el TOUR GUIADO INTERACTIVO (lo monta DashboardLayout, que puede
  // navegar entre vistas y abrir el sidebar para iluminar los botones reales).
  const startTour = () => { try { window.dispatchEvent(new Event('vaf:start-tour')) } catch { /* */ } }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTIONS
    return SECTIONS.filter(s =>
      [s.title, s.tagline, s.what, ...(s.steps || []), ...(s.tips || []), ...(s.cases || []).flatMap(c => [c.q, c.a])]
        .join(' ').toLowerCase().includes(q)
    )
  }, [query])

  const active = SECTIONS.find(s => s.id === activeId) || SECTIONS[0]
  const idx = SECTIONS.findIndex(s => s.id === active.id)
  const prev = idx > 0 ? SECTIONS[idx - 1] : null
  const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null

  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [activeId])

  const go = (id: string) => { setActiveId(id) }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ── Índice (desktop) ── */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-muted/30 min-h-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center"><BookOpen className="h-5 w-5" /></div>
            <div><p className="font-semibold leading-none">Manual de usuario</p><p className="text-[11px] text-muted-foreground mt-0.5">Guía completa del sistema</p></div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en el manual…" className="w-full h-9 rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus:border-emerald-500" />
          </div>
          <button onClick={startTour} className="mt-2 w-full h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            <MousePointerClick className="h-4 w-4" /> Ver tour de bienvenida
          </button>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
          {filtered.map(s => {
            const Icon = s.icon
            return (
              <button key={s.id} onClick={() => go(s.id)} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors', active.id === s.id ? 'bg-emerald-500/15 text-emerald-600 font-medium' : 'hover:bg-muted text-foreground/80')}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.title}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground px-3 py-4">Sin resultados para “{query}”.</p>}
        </nav>
      </aside>

      {/* ── Selector (móvil) ── */}
      <div className="lg:hidden border-b border-border p-3 space-y-2 bg-muted/30">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en el manual…" className="w-full h-9 rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus:border-emerald-500" />
          </div>
          <button onClick={startTour} className="shrink-0 h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
            <MousePointerClick className="h-3.5 w-3.5" /> Tour
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {filtered.map(s => (
            <button key={s.id} onClick={() => go(s.id)} className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs border whitespace-nowrap', active.id === s.id ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 font-medium' : 'border-border text-muted-foreground')}>{s.title}</button>
          ))}
        </div>
      </div>

      {/* ── Contenido ── */}
      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto">
        <article className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
          {/* Encabezado */}
          <div className="flex items-start gap-3 mb-1">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-600 flex items-center justify-center shrink-0"><active.icon className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{active.title}</h1>
              <p className="text-sm text-muted-foreground">{active.tagline}</p>
            </div>
          </div>

          {/* Captura */}
          {active.shot && (
            <button onClick={() => setZoom(active.shot!)} className="group relative block w-full mt-5 rounded-xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/manual/${active.shot}.png`} alt={active.title} className="w-full block" loading="lazy" />
              <span className="absolute bottom-2 right-2 text-[11px] bg-black/60 text-white px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">Clic para ampliar 🔍</span>
            </button>
          )}

          {/* Video guía del módulo */}
          {active.video && (
            <section className="mt-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><MousePointerClick className="h-4 w-4" /> Video guía</h2>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={`/manual/${active.video}.mp4`} controls preload="metadata" playsInline className="w-full rounded-xl border border-border shadow-sm bg-black" />
              <p className="text-[12px] text-muted-foreground mt-2">Recorrido en video de este módulo. Púlsalo para verlo en pantalla completa.</p>
            </section>
          )}

          {/* ¿Para qué sirve? */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">¿Para qué sirve?</h2>
            <p className="text-[15px] leading-relaxed text-foreground/90">{active.what}</p>
          </section>

          {/* Pasos */}
          {active.steps && active.steps.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><ListChecks className="h-4 w-4" /> Cómo usarlo</h2>
              <ol className="space-y-2.5">
                {active.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="text-[15px] leading-relaxed text-foreground/90">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Paso a paso ilustrado (galería de flujos) */}
          {active.gallery && active.gallery.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><ImageIcon className="h-4 w-4" /> Paso a paso (con imágenes)</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {active.gallery.map((g, i) => (
                  <figure key={i} className="rounded-xl border border-border overflow-hidden bg-muted/20">
                    <button onClick={() => setZoom(g.img)} className="group relative block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/manual/${g.img}.png`} alt={g.caption} className="w-full block" loading="lazy" />
                      <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Ampliar 🔍</span>
                    </button>
                    <figcaption className="text-[13px] leading-snug text-foreground/80 p-3">{g.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* Referencia detallada: pestañas / botones / filtros / conexiones */}
          {active.reference?.tabs && active.reference.tabs.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><Layers className="h-4 w-4" /> Pestañas del módulo</h2>
              <DetailList items={active.reference.tabs} />
            </section>
          )}
          {active.reference?.buttons && active.reference.buttons.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><MousePointerClick className="h-4 w-4" /> Cada botón, para qué sirve</h2>
              <DetailList items={active.reference.buttons} />
            </section>
          )}
          {active.reference?.filters && active.reference.filters.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><FilterIcon className="h-4 w-4" /> Filtros — qué muestra cada uno</h2>
              <DetailList items={active.reference.filters} />
            </section>
          )}
          {active.reference?.connect && active.reference.connect.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><Plug className="h-4 w-4" /> Cómo conectar / activar / configurar</h2>
              <div className="space-y-3">
                {active.reference.connect.map((c, i) => (
                  <div key={i} className="rounded-xl border border-emerald-300/40 bg-emerald-50/50 dark:bg-emerald-500/10 p-4">
                    <p className="font-semibold text-[14px] text-emerald-700 dark:text-emerald-400 mb-2">{c.name}</p>
                    <ol className="space-y-1.5">
                      {c.steps.map((s, k) => (
                        <li key={k} className="flex gap-2.5 text-[14px] leading-relaxed text-foreground/90"><span className="shrink-0 h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-600 text-[11px] font-semibold flex items-center justify-center mt-0.5">{k + 1}</span>{s}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Casos comunes */}
          {active.cases && active.cases.length > 0 && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3"><HelpCircle className="h-4 w-4" /> Casos comunes</h2>
              <div className="space-y-2">
                {active.cases.map((c, i) => <FaqRow key={i} q={c.q} a={c.a} />)}
              </div>
            </section>
          )}

          {/* Tips */}
          {active.tips && active.tips.length > 0 && (
            <section className="mt-6 rounded-xl border border-amber-300/40 bg-amber-50/60 dark:bg-amber-500/10 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2"><Lightbulb className="h-4 w-4" /> Tips</h2>
              <ul className="space-y-1.5">
                {active.tips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-foreground/85"><CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />{t}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Navegación anterior / siguiente */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            {prev ? (
              <button onClick={() => go(prev.id)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" /> <span className="text-left"><span className="block text-[10px] uppercase">Anterior</span><span className="font-medium">{prev.title}</span></span>
              </button>
            ) : <span />}
            {next ? (
              <button onClick={() => go(next.id)} className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 ml-auto">
                <span className="text-right"><span className="block text-[10px] uppercase">Siguiente</span><span className="font-medium">{next.title}</span></span> <ChevronRight className="h-4 w-4" />
              </button>
            ) : <span />}
          </div>
        </article>
      </main>

      {/* ── Lightbox de la captura ── */}
      {zoom && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 animate-fade-in cursor-zoom-out">
          <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/manual/${zoom}.png`} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}

    </div>
  )
}

function DetailList({ items }: { items: { name: string; detail: string }[] }) {
  return (
    <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 px-3.5 py-2.5">
          <span className="text-[13.5px] font-semibold text-foreground shrink-0 sm:w-44">{it.name}</span>
          <span className="text-[13.5px] leading-relaxed text-foreground/75">{it.detail}</span>
        </div>
      ))}
    </div>
  )
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted/50">
        <span className="text-[14px] font-medium">{q}</span>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="px-3.5 pb-3 pt-0 text-[14px] leading-relaxed text-foreground/80">{a}</div>}
    </div>
  )
}
