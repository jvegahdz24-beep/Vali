// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — 9 Business Archetypes
// Complete configuration for each business type:
// pipeline stages, sample contacts, deals, agent personality, etc.
// ═══════════════════════════════════════════════════════════════

export interface ArchetypeStage {
  name: string
  color: string
  probability: number
  isWon?: boolean
  isLost?: boolean
}

export interface ArchetypeContact {
  firstName: string
  lastName: string
  phone: string
  email: string
  source: string
  tags: string[]
  leadScore: number
  temperature: 'cold' | 'warm' | 'hot'
}

export interface ArchetypeDeal {
  title: string
  value: number
  currency: string
  stageName: string
  source: string
}

export interface ArchetypeAgent {
  name: string
  type: 'qualifier' | 'sales' | 'followup' | 'coach' | 'custom'
  personality: string
  systemPrompt: string
}

export interface BusinessArchetype {
  id: string
  name: string
  description: string
  icon: string          // Emoji
  color: string         // Tailwind color
  gradientFrom: string  // CSS gradient
  gradientTo: string
  industry: string      // matches Workspace.industry
  pipelineStages: ArchetypeStage[]
  contacts: ArchetypeContact[]
  deals: ArchetypeDeal[]
  agents: ArchetypeAgent[]
  followUpTemplate: string
  quickReplies: string[]
  sampleConversation: { role: string; content: string }[]
}

// ─── 1. DENTISTA ──────────────────────────────────────────────

const DENTISTA: BusinessArchetype = {
  id: 'dentista',
  name: 'Consultorio Dental',
  description: 'Gestión de citas, tratamientos y seguimiento de pacientes',
  icon: '🦷',
  color: 'cyan',
  gradientFrom: '#06b6d4',
  gradientTo: '#0891b2',
  industry: 'health',
  pipelineStages: [
    { name: 'Nuevo Paciente', color: '#67e8f9', probability: 10 },
    { name: 'Primera Consulta', color: '#22d3ee', probability: 25 },
    { name: 'Diagnóstico', color: '#06b6d4', probability: 40 },
    { name: 'Plan de Tratamiento', color: '#0891b2', probability: 55 },
    { name: 'Cita Programada', color: '#0e7490', probability: 75 },
    { name: 'Tratamiento Completado', color: '#059669', probability: 100, isWon: true },
    { name: 'No Asistió', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'María', lastName: 'González', phone: '+525511234567', email: 'maria.gonzalez@email.com', source: 'whatsapp', tags: ['paciente', 'endodoncia'], leadScore: 85, temperature: 'hot' },
    { firstName: 'Carlos', lastName: 'Hernández', phone: '+525522345678', email: 'carlos.h@email.com', source: 'instagram', tags: ['paciente', 'ortodoncia'], leadScore: 72, temperature: 'warm' },
    { firstName: 'Ana', lastName: 'Martínez', phone: '+525533456789', email: 'ana.mtz@email.com', source: 'manual', tags: ['paciente', 'blanqueamiento'], leadScore: 60, temperature: 'warm' },
    { firstName: 'Roberto', lastName: 'López', phone: '+525544567890', email: 'roberto.l@email.com', source: 'webform', tags: ['paciente', 'implante'], leadScore: 90, temperature: 'hot' },
    { firstName: 'Laura', lastName: 'Pérez', phone: '+525555678901', email: 'laura.p@email.com', source: 'whatsapp', tags: ['paciente', 'limpieza'], leadScore: 45, temperature: 'cold' },
    { firstName: 'Miguel', lastName: 'Torres', phone: '+525566789012', email: 'miguel.t@email.com', source: 'whatsapp', tags: ['paciente', 'brackets'], leadScore: 78, temperature: 'warm' },
    { firstName: 'Sofía', lastName: 'Díaz', phone: '+525577890123', email: 'sofia.d@email.com', source: 'instagram', tags: ['paciente', 'carilla'], leadScore: 55, temperature: 'cold' },
    { firstName: 'Fernando', lastName: 'Ruiz', phone: '+525588901234', email: 'fernando.r@email.com', source: 'manual', tags: ['lead', 'consulta'], leadScore: 30, temperature: 'cold' },
  ],
  deals: [
    { title: 'Endodoncia - María González', value: 4500, currency: 'MXN', stageName: 'Tratamiento Completado', source: 'whatsapp' },
    { title: 'Brackets - Carlos Hernández', value: 18000, currency: 'MXN', stageName: 'Plan de Tratamiento', source: 'instagram' },
    { title: 'Blanqueamiento - Ana Martínez', value: 2800, currency: 'MXN', stageName: 'Cita Programada', source: 'manual' },
    { title: 'Implante Dental - Roberto López', value: 25000, currency: 'MXN', stageName: 'Diagnóstico', source: 'webform' },
    { title: 'Limpieza Dental - Laura Pérez', value: 800, currency: 'MXN', stageName: 'Primera Consulta', source: 'whatsapp' },
    { title: 'Carilla Porcelana - Sofía Díaz', value: 8500, currency: 'MXN', stageName: 'Nuevo Paciente', source: 'instagram' },
  ],
  agents: [
    {
      name: 'Asistente Dental',
      type: 'qualifier',
      personality: 'professional',
      systemPrompt: 'Eres un asistente virtual de consultorio dental. Tono profesional y empático. Ayudas a agendar citas, confirmar horarios, explicar tratamientos básicos (limpieza, blanqueamiento, endodoncia, ortodoncia, implantes). Siempre preguntas si el paciente tiene dolor o molestias. Confirmas fecha, hora y doctor asignado. Idioma: español.',
    },
    {
      name: 'DentalBot Recordatorio',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot recordatorio de citas dentales. Tono amigable y cercano. Enviar recordatorios 24h antes de la cita, confirmar asistencia, ofrecer re-agendar si no pueden asistir. Mencionar la importancia de no faltar a citas de seguimiento.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, te recordamos tu cita mañana a las {hora} con el Dr. {doctor}. ¿Confirmas tu asistencia? Responde "Sí" para confirmar o "Reagendar" para cambiar la fecha.',
  quickReplies: ['Agendar cita', 'Precios de tratamientos', 'Ubicación del consultorio', 'Confirmar cita', 'Cancelar cita', '¿Aceptan seguro?'],
  sampleConversation: [
    { role: 'contact', content: 'Hola, quiero agendar una cita para una limpieza dental' },
    { role: 'agent', content: '¡Hola! Bienvenido a nuestro consultorio 🦷 Con gusto te agendo. ¿Tienes preferencia de día y hora? Tenemos disponible este viernes a las 10:00 AM y sábado a las 11:00 AM.' },
    { role: 'contact', content: 'El sábado a las 11 está perfecto' },
    { role: 'agent', content: '¡Perfecto! Tu cita queda programada:\n\n📅 Sábado 10 de mayo\n⏰ 11:00 AM\n👨‍⚕️ Dra. María Fernández\n🦷 Limpieza dental general\n💰 $800 MXN\n\n¿Es tu primera visita? Necesitarás llenar una ficha médica.' },
  ],
}

// ─── 2. ABOGADO ──────────────────────────────────────────────

const ABOGADO: BusinessArchetype = {
  id: 'abogado',
  name: 'Despacho de Abogados',
  description: 'Gestión de casos, consultorías legales y seguimiento de clientes',
  icon: '⚖️',
  color: 'violet',
  gradientFrom: '#8b5cf6',
  gradientTo: '#7c3aed',
  industry: 'professional',
  pipelineStages: [
    { name: 'Consulta Inicial', color: '#c4b5fd', probability: 15 },
    { name: 'Revisión de Caso', color: '#a78bfa', probability: 30 },
    { name: 'Estrategia Legal', color: '#8b5cf6', probability: 50 },
    { name: 'Documentación', color: '#7c3aed', probability: 65 },
    { name: 'Negociación / Mediación', color: '#6d28d9', probability: 80 },
    { name: 'Caso Resuelto', color: '#059669', probability: 100, isWon: true },
    { name: 'Caso Abandonado', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Juan', lastName: 'Ramírez', phone: '+525511122233', email: 'juan.r@email.com', source: 'whatsapp', tags: ['cliente', 'divorcio'], leadScore: 88, temperature: 'hot' },
    { firstName: 'Patricia', lastName: 'Morales', phone: '+525522233344', email: 'patricia.m@email.com', source: 'manual', tags: ['cliente', 'laboral'], leadScore: 75, temperature: 'warm' },
    { firstName: 'Arturo', lastName: 'Sánchez', phone: '+525533344455', email: 'arturo.s@email.com', source: 'webform', tags: ['lead', 'civil'], leadScore: 50, temperature: 'cold' },
    { firstName: 'Carmen', lastName: 'Flores', phone: '+525544455566', email: 'carmen.f@email.com', source: 'whatsapp', tags: ['cliente', 'penal'], leadScore: 92, temperature: 'hot' },
    { firstName: 'Eduardo', lastName: 'Vargas', phone: '+525555566677', email: 'eduardo.v@email.com', source: 'instagram', tags: ['lead', 'empresarial'], leadScore: 65, temperature: 'warm' },
    { firstName: 'Gabriela', lastName: 'Mendoza', phone: '+525566677788', email: 'gabriela.m@email.com', source: 'whatsapp', tags: ['cliente', 'migratorio'], leadScore: 80, temperature: 'warm' },
    { firstName: 'Ricardo', lastName: 'Castro', phone: '+525577788899', email: 'ricardo.c@email.com', source: 'manual', tags: ['lead', 'herencia'], leadScore: 40, temperature: 'cold' },
    { firstName: 'Isabel', lastName: 'Ortiz', phone: '+525588899900', email: 'isabel.o@email.com', source: 'whatsapp', tags: ['cliente', 'familia'], leadScore: 70, temperature: 'warm' },
  ],
  deals: [
    { title: 'Divorcio - Juan Ramírez', value: 15000, currency: 'MXN', stageName: 'Negociación / Mediación', source: 'whatsapp' },
    { title: 'Despido Injusto - Patricia Morales', value: 35000, currency: 'MXN', stageName: 'Estrategia Legal', source: 'manual' },
    { title: 'Demanda Civil - Arturo Sánchez', value: 8000, currency: 'MXN', stageName: 'Revisión de Caso', source: 'webform' },
    { title: 'Defensa Penal - Carmen Flores', value: 50000, currency: 'MXN', stageName: 'Documentación', source: 'whatsapp' },
    { title: 'Constitución Empresa - Eduardo Vargas', value: 25000, currency: 'MXN', stageName: 'Consulta Inicial', source: 'instagram' },
  ],
  agents: [
    {
      name: 'LegalBot Consultor',
      type: 'qualifier',
      personality: 'professional',
      systemPrompt: 'Eres un asistente legal virtual. Tono formal y profesional. Ayudas a capturar información inicial del caso: tipo de asunto legal, fecha de los hechos, partes involucradas, pruebas disponibles. Nunca das asesoría legal definitiva — siempre indicas que el abogado revisará el caso. Recopilas datos para agendar consulta.',
    },
    {
      name: 'Seguimiento Legal',
      type: 'followup',
      personality: 'professional',
      systemPrompt: 'Eres un asistente de seguimiento legal. Informas al cliente sobre el estado de su caso, recordatorios de fechas importantes (audiencias, plazos), solicitas documentos faltantes, confirmas citas con el abogado.',
    },
  ],
  followUpTemplate: 'Estimado/a {nombre}, le recordamos que su cita de revisión de caso es el {fecha} a las {hora}. Por favor traiga los documentos solicitados: {documentos}. ¿Tiene alguna duda?',
  quickReplies: ['Agendar consulta', 'Estado de mi caso', 'Costos de servicio', 'Documentos necesarios', 'Ubicación del despacho'],
  sampleConversation: [
    { role: 'contact', content: 'Necesito un abogado para un problema laboral, me despidieron sin causa' },
    { role: 'agent', content: 'Entiendo su situación, le ofrezco mi apoyo. En nuestro despacho especializados en derecho laboral. Necesito algunos datos:\n\n1. ¿Cuánto tiempo trabajó en la empresa?\n2. ¿Le dieron alguna carta de despido?\n3. ¿Tenía contrato?\n\nAgendemos una consulta de valoración sin costo. ¿Qué día le queda bien esta semana?' },
    { role: 'contact', content: 'Trabajé 3 años, no me dieron carta y sí tenía contrato' },
    { role: 'agent', content: 'Gracias por la información. Con 3 años de antigüedad y contrato, su caso tiene buenos elementos para una demanda por despido injustificado. Los montos pueden ir de 3 a 12 meses de salario.\n\n📅 Agendemos su consulta:\n• Martes 10:00 AM - Disponible\n• Jueves 3:00 PM - Disponible\n\n¿Cuál prefiere?' },
  ],
}

// ─── 3. ESCUELA / MAESTRO ─────────────────────────────────────

const ESCUELA: BusinessArchetype = {
  id: 'escuela',
  name: 'Escuela / Academia',
  description: 'Inscripciones, seguimiento de alumnos y comunicación con padres',
  icon: '🏫',
  color: 'amber',
  gradientFrom: '#f59e0b',
  gradientTo: '#d97706',
  industry: 'education',
  pipelineStages: [
    { name: 'Interesado', color: '#fde68a', probability: 10 },
    { name: 'Agendó Visita', color: '#fcd34d', probability: 25 },
    { name: 'Visita Realizada', color: '#fbbf24', probability: 40 },
    { name: 'Evaluación / Examen', color: '#f59e0b', probability: 55 },
    { name: 'Inscripción', color: '#d97706', probability: 75 },
    { name: 'Alumno Activo', color: '#059669', probability: 100, isWon: true },
    { name: 'No Inscrito', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Rosa', lastName: 'Guerrero', phone: '+525511889900', email: 'rosa.g@email.com', source: 'whatsapp', tags: ['madre', 'primaria'], leadScore: 82, temperature: 'hot' },
    { firstName: 'Andrés', lastName: 'Medina', phone: '+525522990011', email: 'andres.m@email.com', source: 'instagram', tags: ['padre', 'secundaria'], leadScore: 68, temperature: 'warm' },
    { firstName: 'Lucía', lastName: 'Ríos', phone: '+525533001122', email: 'lucia.r@email.com', source: 'manual', tags: ['madre', 'preescolar'], leadScore: 90, temperature: 'hot' },
    { firstName: 'Óscar', lastName: 'Delgado', phone: '+525544112233', email: 'oscar.d@email.com', source: 'webform', tags: ['padre', 'bachillerato'], leadScore: 55, temperature: 'cold' },
    { firstName: 'Patricia', lastName: 'Juárez', phone: '+525555223344', email: 'patricia.j@email.com', source: 'whatsapp', tags: ['madre', 'primaria'], leadScore: 73, temperature: 'warm' },
    { firstName: 'Jorge', lastName: 'Romero', phone: '+525566334455', email: 'jorge.r@email.com', source: 'whatsapp', tags: ['padre', 'ingles'], leadScore: 85, temperature: 'hot' },
    { firstName: 'Teresa', lastName: 'Aguilar', phone: '+525577445566', email: 'teresa.a@email.com', source: 'instagram', tags: ['madre', 'preescolar'], leadScore: 42, temperature: 'cold' },
    { firstName: 'Raúl', lastName: 'Navarro', phone: '+525588556677', email: 'raul.n@email.com', source: 'manual', tags: ['padre', 'secundaria'], leadScore: 35, temperature: 'cold' },
  ],
  deals: [
    { title: 'Inscripción Primaria - Hijo de Rosa', value: 8500, currency: 'MXN', stageName: 'Alumno Activo', source: 'whatsapp' },
    { title: 'Inscripción Secundaria - Hija de Andrés', value: 12000, currency: 'MXN', stageName: 'Evaluación / Examen', source: 'instagram' },
    { title: 'Inscripción Preescolar - Hijo de Lucía', value: 6500, currency: 'MXN', stageName: 'Inscripción', source: 'manual' },
    { title: 'Curso de Inglés - Hija de Jorge', value: 4500, currency: 'MXN', stageName: 'Visita Realizada', source: 'whatsapp' },
    { title: 'Bachillerato - Hijo de Óscar', value: 15000, currency: 'MXN', stageName: 'Agendó Visita', source: 'webform' },
  ],
  agents: [
    {
      name: 'EduBot Inscripciones',
      type: 'qualifier',
      personality: 'friendly',
      systemPrompt: 'Eres un asistente de inscripciones escolares. Tono cálido y amable. Informas sobre niveles educativos, horarios, costos, metodología. Ayudas a agendar visitas guiadas y pruebas de evaluación. Siempre usas lenguaje accesible para padres de familia.',
    },
    {
      name: 'Seguimiento Escolar',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot de seguimiento escolar. Envías recordatorios de inscripciones, fechas límite de pagamientos, eventos escolares, reuniones de padres. Tono cercano y colaborativo con las familias.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, le recordamos que la fecha límite de inscripción es el {fecha}. Aún tenemos lugares disponibles para {grado}. ¿Desea agendar una visita? Responda "Visita" para coordinar.',
  quickReplies: ['Inscribir a mi hijo', 'Costos y planes', 'Agendar visita', 'Horarios', 'Niveles disponibles', 'Becas'],
  sampleConversation: [
    { role: 'contact', content: 'Hola, quisiera información para inscribir a mi hija en primaria' },
    { role: 'agent', content: '¡Hola! Bienvenida a nuestra escuela 🏫 Con gusto le compartimos información:\n\n📊 **Primaria 2026**\n• Grupos: 1° a 6° (máximo 25 alumnos)\n• Horario: Lunes a Viernes 7:30 AM - 2:00 PM\n• Metodología: Aprendizaje activo + inglés diario\n• Costo mensual: $8,500 MXN\n• Inscripción: $5,000 MXN (una vez)\n\n¿Le gustaría agendar una visita guiada? Tenemos disponibles este miércoles o viernes.' },
    { role: 'contact', content: 'El viernes a las 10 AM, por favor' },
    { role: 'agent', content: '¡Perfecto! Visita programada:\n\n📅 Viernes 8 de mayo\n⏰ 10:00 AM\n📍 Av. Revolución 456, Col. Centro\n👨‍🏫 Le atenderá la Lic. Carmen Flores\n⏱ Duración: ~1 hora\n\nLe enviaré un recordatorio el día antes. ¿Algo más en lo que pueda ayudarle?' },
  ],
}

// ─── 4. INMOBILIARIA ──────────────────────────────────────────

const INMOBILIARIA: BusinessArchetype = {
  id: 'inmobiliaria',
  name: 'Inmobiliaria',
  description: 'Venta y renta de propiedades, gestión de clientes y citas',
  icon: '🏠',
  color: 'emerald',
  gradientFrom: '#10b981',
  gradientTo: '#059669',
  industry: 'real-estate',
  pipelineStages: [
    { name: 'Lead Nuevo', color: '#6ee7b7', probability: 5 },
    { name: 'Necesidades Identificadas', color: '#34d399', probability: 15 },
    { name: 'Propuestas Enviadas', color: '#10b981', probability: 30 },
    { name: 'Visita a Propiedad', color: '#059669', probability: 50 },
    { name: 'Negociación de Precio', color: '#047857', probability: 70 },
    { name: 'Contrato Firmado', color: '#059669', probability: 100, isWon: true },
    { name: 'Lead Frío', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Alejandro', lastName: 'Fuentes', phone: '+525511556677', email: 'alejandro.f@email.com', source: 'whatsapp', tags: ['comprador', 'casa'], leadScore: 88, temperature: 'hot' },
    { firstName: 'Verónica', lastName: 'Salazar', phone: '+525522667788', email: 'veronica.s@email.com', source: 'instagram', tags: ['compradora', 'departamento'], leadScore: 76, temperature: 'warm' },
    { firstName: 'Daniel', lastName: 'Castillo', phone: '+525533778899', email: 'daniel.c@email.com', source: 'webform', tags: ['vendedor', 'casa'], leadScore: 65, temperature: 'warm' },
    { firstName: 'Mariana', lastName: 'Ponce', phone: '+525544889900', email: 'mariana.p@email.com', source: 'whatsapp', tags: ['compradora', 'terreno'], leadScore: 55, temperature: 'cold' },
    { firstName: 'Héctor', lastName: 'Ibarra', phone: '+525555990011', email: 'hector.i@email.com', source: 'manual', tags: ['comprador', 'inversión'], leadScore: 92, temperature: 'hot' },
    { firstName: 'Claudia', lastName: 'Soto', phone: '+525566001122', email: 'claudia.s@email.com', source: 'whatsapp', tags: ['renta', 'departamento'], leadScore: 70, temperature: 'warm' },
    { firstName: 'Pablo', lastName: 'Herrera', phone: '+525577112233', email: 'pablo.h@email.com', source: 'instagram', tags: ['comprador', 'casa'], leadScore: 48, temperature: 'cold' },
    { firstName: 'Silvia', lastName: 'Vega', phone: '+525588223344', email: 'silvia.v@email.com', source: 'whatsapp', tags: ['vendedora', 'departamento'], leadScore: 60, temperature: 'warm' },
  ],
  deals: [
    { title: 'Casazona Satélite - Alejandro Fuentes', value: 3500000, currency: 'MXN', stageName: 'Contrato Firmado', source: 'whatsapp' },
    { title: 'Depto Polanco - Verónica Salazar', value: 4800000, currency: 'MXN', stageName: 'Negociación de Precio', source: 'instagram' },
    { title: 'Venta Casa Coyoacán - Daniel Castillo', value: 5200000, currency: 'MXN', stageName: 'Propuestas Enviadas', source: 'webform' },
    { title: 'Terreno Querétaro - Mariana Ponce', value: 1200000, currency: 'MXN', stageName: 'Visita a Propiedad', source: 'whatsapp' },
    { title: 'Inversión Condominio - Héctor Ibarra', value: 2800000, currency: 'MXN', stageName: 'Necesidades Identificadas', source: 'manual' },
  ],
  agents: [
    {
      name: 'InmoBot Asesor',
      type: 'qualifier',
      personality: 'JHON',
      systemPrompt: 'Eres un asesor inmobiliario virtual. Tono cálido pero profesional. Ayudas a encontrar propiedades según necesidades: ubicación, presupuesto, número de recámaras, tipo (casa/depto/terreno). Agendar visitas y enviar catálogos. Manejas venta y renta. Siempre preguntas sobre financiamiento.',
    },
    {
      name: 'InmoBot Seguimiento',
      type: 'followup',
      personality: 'professional',
      systemPrompt: 'Eres un bot de seguimiento inmobiliario. Envías nuevas propiedades que coincidan con las búsquedas del cliente, recordatorios de visitas, actualizaciones de precios. Ofreces alternativas si una propiedad ya no está disponible.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, encontramos una nueva propiedad que coincide con tu búsqueda: 🏠 {propiedad} en {ubicación}. Precio: {precio}. ¿Te gustaría agendar una visita? Responde "Visita" para coordinar.',
  quickReplies: ['Buscar casa', 'Buscar departamento', 'Renta', 'Inversión', 'Financiamiento', 'Agendar visita'],
  sampleConversation: [
    { role: 'contact', content: 'Busco una casa de 3 recámaras en el norte de la ciudad, presupuesto hasta 3 millones' },
    { role: 'agent', content: '¡Perfecto! Tengo excelentes opciones para ti 🏠\n\n1. **Residencial Satélite** - 3 recámaras, 2 baños, 180m², jardín - $2,850,000\n2. **Casa Club Del Valle** - 3 recámaras, 2.5 baños, 200m², terraza - $3,200,000\n3. **Villas Bulevar** - 3 recámaras, 3 baños, 220m², estacionamiento - $2,950,000\n\n¿Cuál te interesa visitar? Agendo de inmediato.' },
    { role: 'contact', content: 'La del Satélite, ¿puedo ir mañana?' },
    { role: 'agent', content: '¡Excelente elección! La casa del Satélite es una joya.\n\n📅 Visita programada:\n• Fecha: mañana\n• Hora: ¿11:00 AM o 3:00 PM?\n• Lugar: Residencial Satélite, #142, Club de Golf\n• Duración: 45 min\n\n¿A qué hora te queda mejor? También te puedo enviar el folleto completo con fotos, medidas y especificaciones.' },
  ],
}

// ─── 5. AGENCIA DE AUTOS ─────────────────────────────────────

const AGENCIA_AUTOS: BusinessArchetype = {
  id: 'autos',
  name: 'Agencia de Autos',
  description: 'Venta de vehículos nuevos y usados, gestión de prospectos',
  icon: '🚗',
  color: 'red',
  gradientFrom: '#ef4444',
  gradientTo: '#dc2626',
  industry: 'retail',
  pipelineStages: [
    { name: 'Nuevo Prospecto', color: '#fca5a5', probability: 10 },
    { name: 'Necesidades Identificadas', color: '#f87171', probability: 25 },
    { name: 'Cotización Enviada', color: '#ef4444', probability: 40 },
    { name: 'Prueba de Manejo', color: '#dc2626', probability: 60 },
    { name: 'Negociación de Precio', color: '#b91c1c', probability: 80 },
    { name: 'Venta Cerrada', color: '#059669', probability: 100, isWon: true },
    { name: 'No Compró', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Luis', lastName: 'Mendoza', phone: '+525511998877', email: 'luis.m@email.com', source: 'whatsapp', tags: ['comprador', 'sedán', 'nuevo'], leadScore: 85, temperature: 'hot' },
    { firstName: 'Natalia', lastName: 'Reyes', phone: '+525522009988', email: 'natalia.r@email.com', source: 'instagram', tags: ['compradora', 'SUV', 'seminuevo'], leadScore: 72, temperature: 'warm' },
    { firstName: 'Francisco', lastName: 'Guerra', phone: '+525533110099', email: 'francisco.g@email.com', source: 'webform', tags: ['comprador', 'pickup', 'nuevo'], leadScore: 90, temperature: 'hot' },
    { firstName: 'Daniela', lastName: 'Medrano', phone: '+525544221100', email: 'daniela.m@email.com', source: 'whatsapp', tags: ['compradora', 'compacto', 'usado'], leadScore: 58, temperature: 'cold' },
    { firstName: 'Antonio', lastName: 'Paredes', phone: '+525555332211', email: 'antonio.p@email.com', source: 'manual', tags: ['comprador', 'lujo'], leadScore: 95, temperature: 'hot' },
    { firstName: 'Mónica', lastName: 'Cruz', phone: '+525566443322', email: 'monica.c@email.com', source: 'whatsapp', tags: ['compradora', 'sedán', 'seminuevo'], leadScore: 68, temperature: 'warm' },
  ],
  deals: [
    { title: 'Honda Civic 2026 - Luis Mendoza', value: 520000, currency: 'MXN', stageName: 'Negociación de Precio', source: 'whatsapp' },
    { title: 'Toyota RAV4 2024 - Natalia Reyes', value: 480000, currency: 'MXN', stageName: 'Prueba de Manejo', source: 'instagram' },
    { title: 'Ford Ranger 2026 - Francisco Guerra', value: 680000, currency: 'MXN', stageName: 'Venta Cerrada', source: 'webform' },
    { title: 'Nissan Versa 2023 - Daniela Medrano', value: 220000, currency: 'MXN', stageName: 'Cotización Enviada', source: 'whatsapp' },
    { title: 'BMW X5 2025 - Antonio Paredes', value: 1800000, currency: 'MXN', stageName: 'Necesidades Identificadas', source: 'manual' },
  ],
  agents: [
    {
      name: 'AutoBot Vendedor',
      type: 'qualifier',
      personality: 'JHON',
      systemPrompt: 'Eres un asesor de agencia de autos. Tono entusiasta y dinámico. Ayudas a encontrar el auto ideal según necesidades y presupuesto. Informas sobre modelos, versiones, precios, financiamiento, seguros. Agendas pruebas de manejo. Siempre preguntas si es primer auto o cambio.',
    },
    {
      name: 'AutoBot Seguimiento',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot de seguimiento de agencia de autos. Envías ofertas especiales, nuevos modelos disponibles, promociones de financiamiento. Haces seguimiento post-venta para encuesta de satisfacción y recordatorios de servicio.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, te tengo una excelente noticia 🚗 {modelo} está disponible con un descuento especial del {descuento}%. ¿Te gustaría agendar tu prueba de manejo?',
  quickReplies: ['Buscar auto', 'Prueba de manejo', 'Financiamiento', 'Auto nuevo', 'Auto seminuevo', 'Seguro de auto'],
  sampleConversation: [
    { role: 'contact', content: 'Quiero un sedán económico, presupuesto hasta 400 mil pesos' },
    { role: 'agent', content: '¡Hola! Tengo las mejores opciones para ti 🚗\n\n1. **Nissan Versa 2025** - Desde $328,000 | 50km/L | 5 años garantía\n2. **MG5 2025** - Desde $349,000 | Amplio espacio | Equipo completo\n3. **Kia Rio 2025** - Desde $355,000 | El más vendido | Excelente valor\n\n📅 ¿Agendamos tu prueba de manejo? Tenemos disponibilidad hoy y mañana.\n💳 Financiamiento desde $5,900/mes con enganche del 20%.',
    { role: 'contact', content: 'Me interesa el Versa, quiero probarlo mañana' },
    { role: 'agent', content: '¡Excelente elección! El Versa es confiable y económico.\n\n📋 **Prueba de Manejo**\n📅 Mañana\n⏰ ¿10 AM o 2 PM?\n📍 Agencia Av. Industria 789\n🚗 Nissan Versa Advance 2025\n⏱ 30 minutos\n\n¿A qué hora te queda mejor? También puedo prepararte la cotización con financiamiento.' },
  ],
}

// ─── 6. PASTELERÍA ──────────────────────────────────────────

const PASTELERIA: BusinessArchetype = {
  id: 'pasteleria',
  name: 'Pastelería / Repostería',
  description: 'Pedidos personalizados, catálogo y entrega de pasteles',
  icon: '🎂',
  color: 'pink',
  gradientFrom: '#ec4899',
  gradientTo: '#db2777',
  industry: 'retail',
  pipelineStages: [
    { name: 'Consulta de Pedido', color: '#f9a8d4', probability: 10 },
    { name: 'Diseño Aprobado', color: '#f472b6', probability: 30 },
    { name: 'Anticipo Pagado', color: '#ec4899', probability: 50 },
    { name: 'En Producción', color: '#db2777', probability: 75 },
    { name: 'Listo para Entrega', color: '#be185d', probability: 90 },
    { name: 'Entregado', color: '#059669', probability: 100, isWon: true },
    { name: 'Pedido Cancelado', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Karla', lastName: 'Espinoza', phone: '+525511223344', email: 'karla.e@email.com', source: 'instagram', tags: ['cliente', 'boda'], leadScore: 95, temperature: 'hot' },
    { firstName: 'Lorena', lastName: 'Villa', phone: '+525522334455', email: 'lorena.v@email.com', source: 'whatsapp', tags: ['cliente', 'cumpleaños'], leadScore: 80, temperature: 'hot' },
    { firstName: 'Ivonne', lastName: 'Castellanos', phone: '+525533445566', email: 'ivonne.c@email.com', source: 'instagram', tags: ['cliente', 'baby shower'], leadScore: 72, temperature: 'warm' },
    { firstName: 'Ernesto', lastName: 'Palacios', phone: '+525544556677', email: 'ernesto.p@email.com', source: 'whatsapp', tags: ['cliente', 'corporativo'], leadScore: 85, temperature: 'hot' },
    { firstName: 'Mayra', lastName: 'Lara', phone: '+525555667788', email: 'mayra.l@email.com', source: 'manual', tags: ['cliente', 'xv años'], leadScore: 65, temperature: 'warm' },
    { firstName: 'César', lastName: 'Montoya', phone: '+525566778899', email: 'cesar.m@email.com', source: 'whatsapp', tags: ['cliente', 'aniversario'], leadScore: 78, temperature: 'warm' },
  ],
  deals: [
    { title: 'Pastel Boda 3 Leños - Karla Espinoza', value: 8500, currency: 'MXN', stageName: 'En Producción', source: 'instagram' },
    { title: 'Pastel Cumpleaños Niño - Lorena Villa', value: 1200, currency: 'MXN', stageName: 'Listo para Entrega', source: 'whatsapp' },
    { title: 'Cupcakes Baby Shower - Ivonne Castellanos', value: 2800, currency: 'MXN', stageName: 'Diseño Aprobado', source: 'instagram' },
    { title: 'Pastel Corporativo - Ernesto Palacios', value: 5000, currency: 'MXN', stageName: 'Anticipo Pagado', source: 'whatsapp' },
    { title: 'Pastel XV Años - Mayra Lara', value: 3500, currency: 'MXN', stageName: 'Consulta de Pedido', source: 'manual' },
  ],
  agents: [
    {
      name: 'DulceBot Repostería',
      type: 'qualifier',
      personality: 'friendly',
      systemPrompt: 'Eres un asistente de pastelería. Tono dulce y creativo. Ayudas con catálogo de pasteles, cotizaciones, sabores, diseños, tamaños. Manejas pedidos personalizados para bodas, cumpleaños, baby showers, xv años, corporativos. Preguntas sobre número de personas, fecha, alérgenos, diseño preferido.',
    },
    {
      name: 'DulceBot Producción',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot de seguimiento de pedidos de pastelería. Confirmas pedidos, envías fotos del avance, recordatorios de pickup/entrega, preguntas sobre modificaciones de último momento.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, tu pedido está {estatus}. {detalle}. ¿Necesitas algún cambio? Recuerda que la entrega es el {fecha}.',
  quickReplies: ['Ver catálogo', 'Cotizar pastel', 'Sabores disponibles', 'Pedidos personalizados', 'Zona de entrega', 'Precios'],
  sampleConversation: [
    { role: 'contact', content: 'Hola, necesito un pastel para la boda de mi hija, serán 150 personas' },
    { role: 'agent', content: '¡Felicidades! 🎂 Será un pastel hermoso.\n\nPara cotizar preciso:\n1. ¿Fecha de la boda?\n2. ¿Sabores preferidos? (vainilla, chocolate, red velvet, tres leches, etc.)\n3. ¿Algún diseño en mente?\n4. ¿Necesita top de porcelana?\n\n💡 **Referencia rápida:**\n• 3 leños (150 personas): $8,500 - $12,000\n• Decoración con flores: +$1,500\n• Topping personalizado: +$800\n\nMándame fotos de inspiración por aquí y preparo la cotización.',
    { role: 'contact', content: 'Es el 15 de junio, quiero 3 leños de vainilla y chocolate con flores' },
    { role: 'agent', content: 'Perfecto, armamos tu cotización:\n\n🎂 **Pastel Bodas**\n• 3 leños: 2 vainilla + 1 chocolate\n• Decoración floral natural\n• Topping "Felices Bodas {nombres}"\n• Base de porcelana (reutilizable)\n• 150 porciones\n• Entrega: 15 de junio\n\n💰 **Total: $10,800**\n💳 Anticipo: $3,240 (30%)\n\nPara confirmar, te envío el link de anticipo. ¿Todo bien?' },
  ],
}

// ─── 7. BARBERÍA ─────────────────────────────────────────────

const BARBERIA: BusinessArchetype = {
  id: 'barberia',
  name: 'Barbería',
  description: 'Citas de corte, barba y grooming masculino',
  icon: '💈',
  color: 'slate',
  gradientFrom: '#475569',
  gradientTo: '#334155',
  industry: 'services',
  pipelineStages: [
    { name: 'Nuevo Cliente', color: '#94a3b8', probability: 10 },
    { name: 'Primera Visita', color: '#64748b', probability: 30 },
    { name: 'Cliente Regular', color: '#475569', probability: 60 },
    { name: 'Cliente Frecuente', color: '#334155', probability: 80 },
    { name: 'Cliente VIP', color: '#059669', probability: 100, isWon: true },
    { name: 'Inactivo', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Diego', lastName: 'Ortiz', phone: '+525511667788', email: 'diego.o@email.com', source: 'whatsapp', tags: ['cliente', 'corte'], leadScore: 75, temperature: 'warm' },
    { firstName: 'Emiliano', lastName: 'Tapia', phone: '+525522778899', email: 'emiliano.t@email.com', source: 'instagram', tags: ['cliente', 'barba'], leadScore: 82, temperature: 'hot' },
    { firstName: 'Marco', lastName: 'Aguirre', phone: '+525533889900', email: 'marco.a@email.com', source: 'whatsapp', tags: ['cliente', 'corte+barba'], leadScore: 90, temperature: 'hot' },
    { firstName: 'Adrián', lastName: 'Zúñiga', phone: '+525544990011', email: 'adrian.z@email.com', source: 'manual', tags: ['lead', 'teñido'], leadScore: 45, temperature: 'cold' },
    { firstName: 'Santiago', lastName: 'Peña', phone: '+525555001122', email: 'santiago.p@email.com', source: 'whatsapp', tags: ['cliente', 'grooming'], leadScore: 68, temperature: 'warm' },
    { firstName: 'Raúl', lastName: 'Campos', phone: '+525566112233', email: 'raul.c@email.com', source: 'instagram', tags: ['cliente', 'corte+barba'], leadScore: 88, temperature: 'hot' },
  ],
  deals: [
    { title: 'Paquete 5 Cortes - Diego Ortiz', value: 1000, currency: 'MXN', stageName: 'Cliente Regular', source: 'whatsapp' },
    { title: 'Barba Express - Emiliano Tapia', value: 150, currency: 'MXN', stageName: 'Cliente Frecuente', source: 'instagram' },
    { title: 'Paquete Grooming VIP - Marco Aguirre', value: 1500, currency: 'MXN', stageName: 'Cliente VIP', source: 'whatsapp' },
    { title: 'Teñido Cabello - Adrián Zúñiga', value: 350, currency: 'MXN', stageName: 'Nueva Cliente', source: 'manual' },
  ],
  agents: [
    {
      name: 'BarberBot Agendador',
      type: 'qualifier',
      personality: 'JHON',
      systemPrompt: 'Eres un asistente de barbería. Tono fresco y casual. Agendar citas de corte, barba, teñido, grooming. Horario de lunes a sábado 9AM-8PM. Siempre confirmas nombre, servicio y hora. Manejas cancelaciones y re-agendas.',
    },
    {
      name: 'BarberBot Seguimiento',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot de recordatorio de barbería. Envías recordatorios de citas, promociones (2x1 en cortes los martes), ofertas de temporada. Mantienes a los clientes enganchados con contenido fresco.',
    },
  ],
  followUpTemplate: 'Qué onda {nombre}, te recordamos tu cita mañana a las {hora} con {barbero}. ¿Confirmas? También te informo que este martes tenemos 2x1 en cortes. Responde "Sí" para confirmar o "Cambiar" para reagendar.',
  quickReplies: ['Agendar corte', 'Corte + barba', 'Grooming completo', 'Teñido', 'Promociones', 'Precios'],
  sampleConversation: [
    { role: 'contact', content: 'Necesito un corte y barba para hoy si es posible' },
    { role: 'agent', content: 'Qué onda 👊 Tenemos horarios disponibles hoy:\n\n🕐 3:00 PM - Carlos\n🕐 5:30 PM - Miguel\n🕐 7:00 PM - Carlos\n\nServicios:\n✂️ Corte: $200\n🧔 Barba: $150\n✂️+🧔 Corte + Barba: $300\n\n¿Cuál horario te va mejor?' },
    { role: 'contact', content: 'A las 5:30 con Miguel por favor' },
    { role: 'agent', content: '¡Listo! ✅\n\n📅 Hoy\n🕐 5:30 PM\n💈 Miguel\n✂️ Corte + Barba\n💰 $300\n\n¡Nos vemos! Trae tu mejor cara 😎' },
  ],
}

// ─── 8. RESTAURANTE ─────────────────────────────────────────

const RESTAURANTE: BusinessArchetype = {
  id: 'restaurante',
  name: 'Restaurante',
  description: 'Reservaciones, pedidos a domicilio y fidelización de clientes',
  icon: '🍽️',
  color: 'orange',
  gradientFrom: '#f97316',
  gradientTo: '#ea580c',
  industry: 'restaurants',
  pipelineStages: [
    { name: 'Nuevo Cliente', color: '#fdba74', probability: 10 },
    { name: 'Primera Visita', color: '#fb923c', probability: 30 },
    { name: 'Cliente Recurrente', color: '#f97316', probability: 55 },
    { name: 'Programa de Lealtad', color: '#ea580c', probability: 75 },
    { name: 'Cliente VIP', color: '#059669', probability: 100, isWon: true },
    { name: 'Inactivo 30 días', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Gabriela', lastName: 'Torres', phone: '+525511445566', email: 'gabriela.t@email.com', source: 'whatsapp', tags: ['cliente', 'frecuente'], leadScore: 80, temperature: 'warm' },
    { firstName: 'Eduardo', lastName: 'Herrera', phone: '+525522556677', email: 'eduardo.h@email.com', source: 'instagram', tags: ['cliente', 'eventos'], leadScore: 90, temperature: 'hot' },
    { firstName: 'Mónica', lastName: 'Rangel', phone: '+525533667788', email: 'monica.r@email.com', source: 'whatsapp', tags: ['cliente', 'domicilio'], leadScore: 70, temperature: 'warm' },
    { firstName: 'Rafael', lastName: 'Cordero', phone: '+525544778899', email: 'rafael.c@email.com', source: 'manual', tags: ['lead', 'reservación'], leadScore: 45, temperature: 'cold' },
    { firstName: 'Andrea', lastName: 'Montemayor', phone: '+525555889900', email: 'andrea.m@email.com', source: 'whatsapp', tags: ['cliente', 'VIP'], leadScore: 95, temperature: 'hot' },
    { firstName: 'Cristian', lastName: 'Lira', phone: '+525566990011', email: 'cristian.l@email.com', source: 'instagram', tags: ['cliente', 'empresa'], leadScore: 85, temperature: 'hot' },
  ],
  deals: [
    { title: 'Evento Corporativo 30 personas - Eduardo Herrera', value: 18000, currency: 'MXN', stageName: 'Programa de Lealtad', source: 'instagram' },
    { title: 'Catering Cumpleaños - Gabriela Torres', value: 5500, currency: 'MXN', stageName: 'Cliente Recurrente', source: 'whatsapp' },
    { title: 'Cuenta Empresarial Mensual - Cristian Lira', value: 12000, currency: 'MXN', stageName: 'Cliente VIP', source: 'instagram' },
    { title: 'Reservación Fiesta - Rafael Cordero', value: 3500, currency: 'MXN', stageName: 'Primera Visita', source: 'manual' },
  ],
  agents: [
    {
      name: 'RestBot Mesero',
      type: 'qualifier',
      personality: 'JHON',
      systemPrompt: 'Eres un asistente de restaurante. Tono cálido y servicial. Manejas reservaciones, menú del día, pedidos a domicilio, eventos especiales. Siempre preguntas sobre alergias y número de personas. Horario: Lunes a Domingo 12PM-11PM.',
    },
    {
      name: 'RestBot Promos',
      type: 'followup',
      personality: 'friendly',
      systemPrompt: 'Eres un bot de promociones de restaurante. Envías el menú del día, platillos nuevos, promociones de la semana (2x1 los miércoles, happy hour viernes). Recuerdas a clientes inactivos con ofertas especiales.',
    },
  ],
  followUpTemplate: 'Hola {nombre}, te tenemos algo especial esta semana 🍽️ {promoción}. ¿Te gustaría hacer una reservación? Responde "Reservar" o "Menú" para ver opciones.',
  quickReplies: ['Reservar mesa', 'Menú del día', 'Pedir a domicilio', 'Eventos', 'Promociones', 'Ubicación'],
  sampleConversation: [
    { role: 'contact', content: 'Quiero reservar para este sábado, somos 6 personas' },
    { role: 'agent', content: '¡Hola! Con gusto te reservo 🍽️\n\n📅 Sábado\n👥 6 personas\n🕐 ¿12:30, 2:00 o 8:00 PM?\n📍 Terraza o salón interior\n\n¿Alguien tiene alguna alergia alimentaria? Tenemos opciones sin gluten y veganas.\n\nTe confirmo en cuanto me des la hora.',
    { role: 'contact', content: 'Las 2 PM en terraza por favor, sin alergias' },
    { role: 'agent', content: '¡Listo! Reservación confirmada ✅\n\n📅 Sábado\n🕐 2:00 PM\n👥 6 personas\n🌿 Terraza\n\nPara tu grupo te recomiendo:\n🥩 Arrachera al carbón (nuestra especialidad)\n🥑 Guacamole table-side\n🌮 Tacos Gobernador (nuevos en el menú)\n🍹 Margaritas de la casa 2x1\n\n¿Te gustaría pre-ordenar algo? También te puedo enviar el menú completo.' },
  ],
}

// ─── 9. GIMNASIO / SPA ──────────────────────────────────────

const GIMNASIO: BusinessArchetype = {
  id: 'gimnasio',
  name: 'Gimnasio / Spa',
  description: 'Inscripciones, clases, membresías y seguimiento de clientes',
  icon: '💪',
  color: 'indigo',
  gradientFrom: '#6366f1',
  gradientTo: '#4f46e5',
  industry: 'services',
  pipelineStages: [
    { name: 'Nuevo Interesado', color: '#a5b4fc', probability: 10 },
    { name: 'Agendó Clase Prueba', color: '#818cf8', probability: 25 },
    { name: 'Clase Prueba Realizada', color: '#6366f1', probability: 45 },
    { name: 'Evaluación Física', color: '#4f46e5', probability: 60 },
    { name: 'Inscrito', color: '#4338ca', probability: 80 },
    { name: 'Miembro Activo', color: '#059669', probability: 100, isWon: true },
    { name: 'No Inscrito', color: '#ef4444', probability: 0, isLost: true },
  ],
  contacts: [
    { firstName: 'Ricardo', lastName: 'Medina', phone: '+525511334455', email: 'ricardo.m@email.com', source: 'instagram', tags: ['lead', 'musculación'], leadScore: 78, temperature: 'warm' },
    { firstName: 'Valentina', lastName: 'Rojas', phone: '+525522445566', email: 'valentina.r@email.com', source: 'whatsapp', tags: ['lead', 'crossfit'], leadScore: 85, temperature: 'hot' },
    { firstName: 'Andrés', lastName: 'Pacheco', phone: '+525533556677', email: 'andres.p@email.com', source: 'webform', tags: ['cliente', 'spinning'], leadScore: 70, temperature: 'warm' },
    { firstName: 'Paulina', lastName: 'Serrano', phone: '+525544667788', email: 'paulina.s@email.com', source: 'manual', tags: ['lead', 'yoga'], leadScore: 60, temperature: 'cold' },
    { firstName: 'Gustavo', lastName: 'Ibarra', phone: '+525555778899', email: 'gustavo.i@email.com', source: 'whatsapp', tags: ['cliente', 'musculación'], leadScore: 92, temperature: 'hot' },
    { firstName: 'Camila', lastName: 'Fuentes', phone: '+525566889900', email: 'camila.f@email.com', source: 'instagram', tags: ['lead', 'funcional'], leadScore: 55, temperature: 'cold' },
  ],
  deals: [
    { title: 'Membresía 6 Meses - Ricardo Medina', value: 3600, currency: 'MXN', stageName: 'Evaluación Física', source: 'instagram' },
    { title: 'Membresía Anual - Valentina Rojas', value: 6000, currency: 'MXN', stageName: 'Inscrito', source: 'whatsapp' },
    { title: 'Paquete 20 Spinning - Andrés Pacheco', value: 1200, currency: 'MXN', stageName: 'Miembro Activo', source: 'webform' },
    { title: 'Membresía 12 Meses - Gustavo Ibarra', value: 7200, currency: 'MXN', stageName: 'Clase Prueba Realizada', source: 'whatsapp' },
    { title: 'Clases Yoga + Spa - Paulina Serrano', value: 2400, currency: 'MXN', stageName: 'Agendó Clase Prueba', source: 'manual' },
  ],
  agents: [
    {
      name: 'GymBot Asesor',
      type: 'qualifier',
      personality: 'aggressive',
      systemPrompt: 'Eres un asesor de gimnasio. Tono motivador y enérgico. Ayudas a elegir el plan de membresía ideal, agendar clases de prueba, informar sobre horarios y disciplinas. Siempre preguntas sobre objetivos fitness y nivel de experiencia. Promueves la disciplina y constancia.',
    },
    {
      name: 'GymBot Motivador',
      type: 'followup',
      personality: 'aggressive',
      systemPrompt: 'Eres un bot motivacional de gimnasio. Envías frases de motivación, recordatorios de clases, retos semanales. Usas lenguaje motivacional: "¡No te rindas!", "Hoy es tu día". Sigues a clientes inactivos para re-engagement.',
    },
  ],
  followUpTemplate: '¡Hola {nombre}! 💪 ¿Cómo va tu semana de entrenamiento? Tienes {clases_disponibles} clases agendadas esta semana. Recuerda: la constancia vence al talento. ¡Nos vemos en el gym!',
  quickReplies: ['Inscribirme', 'Clase de prueba', 'Horarios', 'Precios', 'Disciplinas', 'Personal trainer'],
  sampleConversation: [
    { role: 'contact', content: 'Quiero información sobre membresías y clases' },
    { role: 'agent', content: '¡Qué buena onda que quieres empezar! 💪\n\n**Planes disponibles:**\n\n🥉 Básico - $600/mes\n• Acceso al gym\n• Horario: 6AM-10PM\n\n🥈 Pro - $800/mes\n• Todo lo básico + 2 clases grupales/semana\n• Asesoría nutricional básica\n\n🥇 Elite - $1,000/mes\n• Todo lo Pro + clases ilimitadas\n• Personal trainer 2x/semana\n• Spa 2x/mes\n\n🔥 **Promo:** Inscríbete hoy y obtén 1 mes GRATIS en tu segundo mes.\n\n¿Agendamos tu clase de prueba GRATIS?',
    { role: 'contact', content: 'Me interesa el Elite, quiero la clase de prueba mañana' },
    { role: 'agent', content: '¡EXCELENTE decisión! 🔥 El plan Elite es nuestra mejor opción.\n\n📅 **Clase de prueba GRATIS**\n⏰ Mañana 7:00 AM o 6:00 PM\n🏋️ Musculación o Funcional (a tu elección)\n👨‍🏫 Con un coach certificado\n⏱ 1 hora\n\n📍 Trae ropa cómoda y agua.\n\n¿A qué hora prefieres? Después de la clase te hago la evaluación física sin costo para crear tu plan personalizado.' },
  ],
}

// ─── EXPORT ALL ARCHETYPES ────────────────────────────────────

export const BUSINESS_ARCHETYPES: BusinessArchetype[] = [
  DENTISTA,
  ABOGADO,
  ESCUELA,
  INMOBILIARIA,
  AGENCIA_AUTOS,
  PASTELERIA,
  BARBERIA,
  RESTAURANTE,
  GIMNASIO,
]

export const ARCHETYPE_MAP = new Map<string, BusinessArchetype>(
  BUSINESS_ARCHETYPES.map(a => [a.id, a])
)

export function getArchetype(id: string): BusinessArchetype | undefined {
  return ARCHETYPE_MAP.get(id)
}
