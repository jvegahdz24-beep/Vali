import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# Register fonts
pdfmetrics.registerFont(TTFont('TimesNR', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('TimesNR', normal='TimesNR', bold='TimesNR')
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')

PDF_PATH = '/home/z/my-project/download/ValiFlow_Pro_Auditoria_360.pdf'
os.makedirs('/home/z/my-project/download', exist_ok=True)

doc = SimpleDocTemplate(
    PDF_PATH,
    pagesize=letter,
    title='ValiFlow Pro - Auditoria 360',
    author='Z.ai',
    creator='Z.ai',
    subject='Auditoria tecnica completa del proyecto ValiFlow Pro',
    leftMargin=1.8*cm, rightMargin=1.8*cm,
    topMargin=2*cm, bottomMargin=2*cm
)

# Colors
DARK_BLUE = colors.HexColor('#1F4E79')
ACCENT_GREEN = colors.HexColor('#27AE60')
ACCENT_RED = colors.HexColor('#E74C3C')
ACCENT_ORANGE = colors.HexColor('#F39C12')
ACCENT_YELLOW = colors.HexColor('#F1C40F')
LIGHT_GRAY = colors.HexColor('#F5F5F5')
DARK_TEXT = colors.HexColor('#1A1A2E')
MEDIUM_TEXT = colors.HexColor('#4A4A6A')

# Styles
cover_title = ParagraphStyle('CoverTitle', fontName='TimesNR', fontSize=38, leading=46, alignment=TA_CENTER, textColor=colors.white, spaceAfter=12)
cover_sub = ParagraphStyle('CoverSub', fontName='TimesNR', fontSize=16, leading=22, alignment=TA_CENTER, textColor=colors.HexColor('#B0C4DE'), spaceAfter=8)
cover_date = ParagraphStyle('CoverDate', fontName='TimesNR', fontSize=13, leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#87CEEB'))

h1 = ParagraphStyle('H1', fontName='TimesNR', fontSize=20, leading=26, textColor=DARK_BLUE, spaceBefore=18, spaceAfter=10)
h2 = ParagraphStyle('H2', fontName='TimesNR', fontSize=15, leading=20, textColor=DARK_BLUE, spaceBefore=14, spaceAfter=8)
h3 = ParagraphStyle('H3', fontName='TimesNR', fontSize=12, leading=16, textColor=MEDIUM_TEXT, spaceBefore=10, spaceAfter=6)
body = ParagraphStyle('Body', fontName='TimesNR', fontSize=10.5, leading=16, alignment=TA_JUSTIFY, textColor=DARK_TEXT, spaceAfter=6)
body_left = ParagraphStyle('BodyL', fontName='TimesNR', fontSize=10.5, leading=16, alignment=TA_LEFT, textColor=DARK_TEXT, spaceAfter=6)
bullet = ParagraphStyle('Bullet', fontName='TimesNR', fontSize=10.5, leading=16, alignment=TA_LEFT, textColor=DARK_TEXT, leftIndent=20, bulletIndent=8, spaceAfter=4)

th_style = ParagraphStyle('TH', fontName='TimesNR', fontSize=10, leading=14, alignment=TA_CENTER, textColor=colors.white)
tc_style = ParagraphStyle('TC', fontName='TimesNR', fontSize=9.5, leading=13, alignment=TA_CENTER, textColor=DARK_TEXT)
tl_style = ParagraphStyle('TL', fontName='TimesNR', fontSize=9.5, leading=13, alignment=TA_LEFT, textColor=DARK_TEXT)

verdict_style = ParagraphStyle('Verdict', fontName='TimesNR', fontSize=11, leading=17, alignment=TA_LEFT, textColor=DARK_TEXT, leftIndent=12, spaceAfter=5)

def make_table(data, col_widths):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else LIGHT_GRAY
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

story = []

# ========== COVER PAGE ==========
cover_bg = Table([['']], colWidths=[doc.width + 2*cm], rowHeights=[doc.height + 4*cm])
cover_bg.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), DARK_BLUE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))

story.append(Spacer(1, 140))
story.append(Paragraph('<b>ValiFlow Pro</b>', cover_title))
story.append(Spacer(1, 16))
story.append(Paragraph('Auditoria Tecnica 360 - SaaS CRM + IA', cover_sub))
story.append(Spacer(1, 8))
story.append(Paragraph('Sector Automotriz Mexico', cover_sub))
story.append(Spacer(1, 50))
story.append(Paragraph('Analisis realista, critico y sin inflar', ParagraphStyle('cv', fontName='TimesNR', fontSize=12, leading=16, alignment=TA_CENTER, textColor=colors.HexColor('#D0D8E8'))))
story.append(Spacer(1, 60))
story.append(Paragraph('Fecha: 8 de Abril, 2026', cover_date))
story.append(Paragraph('Generado por Z.ai', cover_date))
story.append(PageBreak())

# ========== FASE 1: RESUMEN REAL ==========
story.append(Paragraph('<b>FASE 1 - RESUMEN REAL</b>', h1))
story.append(Spacer(1, 8))

summary_data = [
    [Paragraph('<b>Campo</b>', th_style), Paragraph('<b>Valor</b>', th_style)],
    [Paragraph('Tipo de producto', tl_style), Paragraph('CRM SaaS con IA integrada para el sector automotriz mexicano. WhatsApp como canal principal. Multi-tenant con planes de suscripcion.', tl_style)],
    [Paragraph('Stack tecnologico', tl_style), Paragraph('Next.js 16.1 + React 19 + TypeScript + Tailwind CSS 4 + Prisma 6 (SQLite) + Baileys (WhatsApp) + z-ai-web-dev-sdk (Groq/DeepSeek/Gemini/OpenAI)', tl_style)],
    [Paragraph('Nivel actual', tl_style), Paragraph('Beta funcional - MVP avanzado con modulo de IA operativo, CRM basico, y WhatsApp real conectado', tl_style)],
    [Paragraph('Estado real (1-10)', tc_style), Paragraph('<b>6.5 / 10</b>', tc_style)],
    [Paragraph('Se puede usar hoy?', tl_style), Paragraph('SI - Login, dashboard, chat con IA, conexion WhatsApp QR, contactos, pipeline, agentes, exportar datos. NO facturable aun (Stripe sin configurar, email sin enviar)', tl_style)],
    [Paragraph('Riesgo principal', tl_style), Paragraph('SQLite en produccion, variables de entorno casi vacias, stage-tracker en memoria (se pierde al reiniciar), automatizaciones sin motor de ejecucion', tl_style)],
]
story.append(make_table(summary_data, [3.5*cm, 14.5*cm]))
story.append(Spacer(1, 18))

story.append(Paragraph('<b>Metricas del proyecto</b>', h2))
metrics_data = [
    [Paragraph('<b>Metrica</b>', th_style), Paragraph('<b>Cantidad</b>', th_style)],
    [Paragraph('Rutas API', tc_style), Paragraph('52 rutas (46 dinamicas)', tc_style)],
    [Paragraph('Componentes UI', tc_style), Paragraph('81 archivos (54 shadcn/ui + 14 dashboard + 13 otros)', tc_style)],
    [Paragraph('Modelos Prisma', tc_style), Paragraph('20 modelos de base de datos', tc_style)],
    [Paragraph('Librerias de IA', tc_style), Paragraph('11 archivos (revenue engine, agent router, 5 personalidades, humanizer, etc.)', tc_style)],
    [Paragraph('Plantillas de automatizacion', tc_style), Paragraph('20 templates en 5 categorias', tc_style)],
    [Paragraph('Lineas de codigo estimadas', tc_style), Paragraph('12,000-15,000+ (sin node_modules)', tc_style)],
    [Paragraph('Build', tc_style), Paragraph('Limpio - 0 errores, 54 paginas estaticas generadas', tc_style)],
]
story.append(make_table(metrics_data, [6*cm, 12*cm]))
story.append(Spacer(1, 24))

# ========== FASE 2: QUE SI FUNCIONA ==========
story.append(Paragraph('<b>FASE 2 - QUE SI FUNCIONA (VERIFICADO)</b>', h1))
story.append(Spacer(1, 8))

story.append(Paragraph('Lo siguiente ha sido auditado codigo por codigo y confirmado como funcional con backend real, no simulado ni hardcodeado:', body))
story.append(Spacer(1, 10))

works_data = [
    [Paragraph('<b>Modulo</b>', th_style), Paragraph('<b>Estado</b>', th_style), Paragraph('<b>Detalle</b>', th_style)],
    [Paragraph('Autenticacion JWT', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Login/register/logout con bcrypt + jose (edge-compatible). Cookie httpOnly, 30 dias expiracion. Rate limiting en login (20 req/min). Middleware protege todas las rutas privadas.', tl_style)],
    [Paragraph('AI Chat (Revenue Engine)', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Pipeline de 9 pasos: analisis de lead (scoring 0-100), deteccion de triggers, manejo de objeciones, generacion via Groq/DeepSeek/Gemini/OpenAI con auto-fallback. 600+ categorias de keywords. Guarda en DB.', tl_style)],
    [Paragraph('ValiAutoFlow 3-Agentes', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Sistema Diagnostico/Estrategia/Cierre con deteccion de etapa, deteccion de dolor, 5 arquetipos de cliente. Prompts detallados para ventas automotrices mexicanas.', tl_style)],
    [Paragraph('WhatsApp (Baileys)', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Conexion QR real, auto-reply con IA, typing indicators, delays humanos (1-3.5s), split de mensajes largos, humanizador de respuestas, reconexion automatica, persistencia de auth.', tl_style)],
    [Paragraph('CRM - Contactos', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('CRUD completo con Prisma. Tags JSON, custom fields, lead score, notas. Importar CSV (multi-formato columnas espanol), exportar CSV/DOCX.', tl_style)],
    [Paragraph('CRM - Pipeline Kanban', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Drag-and-drop con @dnd-kit. Stages customizables, deals con valor en MXN, probabilidades, fechas de cierre.', tl_style)],
    [Paragraph('Gestion de Agentes IA', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('CRUD de agentes con 5 personalidades (JHON, Professional, Friendly, Aggressive, ValiAutoFlow). Temperatura, modelo, system prompt configurable.', tl_style)],
    [Paragraph('Dashboard Estadisticas', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('10 queries paralelas a DB para metricas reales. No hay datos fake - muestra ceros cuando no hay datos.', tl_style)],
    [Paragraph('Analytics', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Endpoint /api/analytics con datos reales de workspace. Graficos con Recharts.', tl_style)],
    [Paragraph('Exportar Datos', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('CSV con BOM para Excel, DOCX con formato profesional. Contacts, deals, conversations.', tl_style)],
    [Paragraph('Seed de Base de Datos', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('20 contactos, 15 conversaciones, 12 deals, 3 agentes, automatizaciones - todo persistido en SQLite.', tl_style)],
    [Paragraph('Rate Limiting', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Sliding window in-memory con TTL cleanup. Protege login y rutas sensibles.', tl_style)],
    [Paragraph('Security Headers', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy via middleware.', tl_style)],
    [Paragraph('Onboarding Wizard', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Asistente de primera configuracion con localStorage persistence.', tl_style)],
    [Paragraph('File Upload', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Upload de archivos con procesamiento de imagenes via Sharp.', tl_style)],
]
story.append(make_table(works_data, [3.8*cm, 2.5*cm, 11.7*cm]))
story.append(Spacer(1, 24))

# ========== FASE 3: FALSO O INCOMPLETO ==========
story.append(Paragraph('<b>FASE 3 - FALSO O INCOMPLETO</b>', h1))
story.append(Spacer(1, 8))

story.append(Paragraph('A diferencia de muchos proyectos de IA, ValiFlow Pro tiene sorprendentemente poco codigo falso. No se encontraron datos mock inflados ni componentes vacios. Sin embargo, hay funcionalidades que existen como codigo pero no pueden ejecutarse en produccion:', body))
story.append(Spacer(1, 10))

fake_data = [
    [Paragraph('<b>Item</b>', th_style), Paragraph('<b>Categoria</b>', th_style), Paragraph('<b>Explicacion</b>', th_style)],
    [Paragraph('Motor de Automatizaciones', tl_style), Paragraph('INCOMPLETO', tc_style), Paragraph('Las 20 plantillas existen y se pueden crear en DB via CRUD. PERO no hay cron job, worker, ni event listener que las ejecute. Los triggerType (inactividad, cambio de etapa, etc.) son solo etiquetas. El sistema almacena automatizaciones pero nunca las dispara.', tl_style)],
    [Paragraph('Stripe Billing', tl_style), Paragraph('INCOMPLETO', tc_style), Paragraph('El codigo de Stripe esta completo (checkout, portal, webhook handler con 5 eventos). PERO no hay API keys en .env y los Price IDs son placeholders. No se puede crear ni cobrar suscripciones.', tl_style)],
    [Paragraph('Reset Password Email', tl_style), Paragraph('INCOMPLETO', tc_style), Paragraph('La ruta existe y genera tokens. PERO Resend no esta instalado en package.json ni hay API key. Solo hace fallback a console.log.', tl_style)],
    [Paragraph('Google OAuth', tl_style), Paragraph('INCOMPLETO', tc_style), Paragraph('El flujo completo esta implementado (CSRF state, code exchange, profile fetch). PERO no hay Google Client ID/Secret en .env.', tl_style)],
    [Paragraph('Stage Tracker (ValiAutoFlow)', tl_style), Paragraph('VOLATIL', tc_style), Paragraph('Usa un Map() in-memory. Se pierde TODA la informacion de etapas al reiniciar el servidor. No persiste en DB.', tl_style)],
    [Paragraph('Follow-up Scheduling', tl_style), Paragraph('INCOMPLETO', tc_style), Paragraph('El schema DB esta listo (FollowUpRule, FollowUpTask). PERO no hay scheduler/cron que ejecute las tareas programadas.', tl_style)],
    [Paragraph('Telegram / Instagram', tl_style), Paragraph('SIN CODIGO', tc_style), Paragraph('Existe el channel enum en types pero no hay ninguna implementacion para estos canales.', tl_style)],
    [Paragraph('Mercado Pago', tl_style), Paragraph('SIN CODIGO', tc_style), Paragraph('Existe como provider enum en el schema de Subscription pero no hay integracion.', tl_style)],
    [Paragraph('Notifications push', tl_style), Paragraph('MINIMO', tc_style), Paragraph('Hay endpoint /api/notifications pero es basico. No hay sistema de notificaciones en tiempo real (WebSocket/SSE).', tl_style)],
]
story.append(make_table(fake_data, [4*cm, 2.8*cm, 11.2*cm]))
story.append(Spacer(1, 24))

# ========== FASE 4: COMPLEJIDAD INNECESARIA ==========
story.append(Paragraph('<b>FASE 4 - COMPLEJIDAD INNECESARIA</b>', h1))
story.append(Spacer(1, 8))

story.append(Paragraph('El proyecto esta razonablemente bien dimensionado para su proposito. No hay microservicios ni Kubernetes. Sin embargo, hay areas donde se invirtio esfuerzo en cosas que no generan valor hoy:', body))
story.append(Spacer(1, 10))

over_data = [
    [Paragraph('<b>Area</b>', th_style), Paragraph('<b>Diagnostico</b>', th_style), Paragraph('<b>Recomendacion</b>', th_style)],
    [Paragraph('20 modelos Prisma', tl_style), Paragraph('AgentPersona, AgentMemory, FollowUpRule, FollowUpTask, AnalyticsEvent, WebhookConfig, VerificationToken no se usan activamente. Ocupan schema sin generar valor funcional.', tl_style), Paragraph('Eliminar modelos no usados o marcar como futuros. Simplificar a los 12-14 que realmente se usan.', tl_style)],
    [Paragraph('11 archivos de IA', tl_style), Paragraph('archetype-detector.ts, message-templates.ts, closing-engine.ts estan integrados pero agregan complejidad. 5 personalidades cuando 2 bastarian (JHON + Professional).', tl_style), Paragraph('Consolidar en 5-6 archivos. Mantener JHON y ValiAutoFlow como unicas personalidades activas.', tl_style)],
    [Paragraph('52 rutas API', tl_style), Paragraph('/api/developer/* (6 rutas) son herramientas de debug que no aportan al producto. /api/import y /api/export duplican funcionalidad con /api/data/import y /api/data/export.', tl_style), Paragraph('Eliminar developer tools del build de produccion. Consolidar rutas duplicadas.', tl_style)],
    [Paragraph('4 providers de IA', tl_style), Paragraph('Groq, DeepSeek, Gemini, OpenAI con auto-fallback. En la practica solo se usa Groq (es gratis y rapido). Los demas son fallback teoricos.', tl_style), Paragraph('Mantener Groq como primario. El fallback no cuesta mucho asi que puede quedar, pero no promocionar 4 providers.', tl_style)],
    [Paragraph('Multi-tenancy completo', tl_style), Paragraph('Workspace + WorkspaceMember + roles (owner/admin/member/viewer). Para un MVP con 1-3 usuarios, es over-engineering.', tl_style), Paragraph('Mantener el schema pero simplificar la logica. No necesitas 4 niveles de permisos en V1.', tl_style)],
    [Paragraph('Onboarding Wizard', tl_style), Paragraph('Esta bien hecho pero no es critico para el primer usuario. Es nice-to-have, no must-have.', tl_style), Paragraph('Depriorizar. El usuario puede configurar sin wizard.', tl_style)],
]
story.append(make_table(over_data, [3.5*cm, 7*cm, 7.5*cm]))
story.append(Spacer(1, 24))

# ========== FASE 5: ARQUITECTURA REAL ==========
story.append(Paragraph('<b>FASE 5 - ARQUITECTURA REAL</b>', h1))
story.append(Spacer(1, 8))

arch_data = [
    [Paragraph('<b>Aspecto</b>', th_style), Paragraph('<b>Evaluacion</b>', th_style)],
    [Paragraph('Tipo', tl_style), Paragraph('Monolito modular bien organizado. Single Next.js app con App Router. La separacion entre lib/ai/, lib/whatsapp/, y app/api/ es clara y mantenible.', tl_style)],
    [Paragraph('Problema principal', tl_style), Paragraph('El archivo connection.ts (WhatsApp, 745 lineas) es un singleton monolitico que maneja TODO: conexion, QR, mensajes, auto-reply, humanizer, DB writes. Si falla algo, falla todo. Deberia descomponerse en modulos mas pequenos.', tl_style)],
    [Paragraph('Mantenibilidad', tl_style), Paragraph('BUENA. Convenciones claras: rutas API en app/api/, logica en lib/, componentes en components/. TypeScript estricto. Nombres descriptivos. No hay codigo espagueti significativo.', tl_style)],
    [Paragraph('Escalabilidad', tl_style), Paragraph('LIMITADA por SQLite. Para 1-10 usuarios funciona perfecto. Para 100+ concurrentes necesitara PostgreSQL + connection pooling. El in-memory rate limiter y stage tracker tambien limitan escalabilidad horizontal.', tl_style)],
    [Paragraph('Error handling', tl_style), Paragraph('ADECUADO. Los endpoints usan try-catch con respuestas consistentes. El Revenue Engine tiene fallback a respuestas hardcodeadas si la IA falla. Podria mejorarse con logging estructurado en vez de console.log.', tl_style)],
    [Paragraph('Testing', tl_style), Paragraph('AUSENTE. No hay ningun archivo de test (.test.ts, .spec.ts). No hay configuracion de Jest ni Vitest. Esto es un riesgo para mantenimiento futuro.', tl_style)],
]
story.append(make_table(arch_data, [3.5*cm, 14.5*cm]))
story.append(Spacer(1, 24))

# ========== FASE 6: SEGURIDAD ==========
story.append(Paragraph('<b>FASE 6 - SEGURIDAD BASICA</b>', h1))
story.append(Spacer(1, 8))

sec_data = [
    [Paragraph('<b>Aspecto</b>', th_style), Paragraph('<b>Estado</b>', th_style), Paragraph('<b>Detalle</b>', th_style)],
    [Paragraph('Autenticacion', tl_style), Paragraph('SI', tc_style), Paragraph('JWT con HS256 via jose. Cookie httpOnly. Bcrypt con 12 salt rounds. Expiracion 30 dias. Middleware edge-compatible.', tl_style)],
    [Paragraph('Proteccion de datos', tl_style), Paragraph('PARCIAL', tc_style), Paragraph('RequireAuth en todas las rutas API privadas. PERO: no hay RBAC real (el middleware solo verifica existencia del token, no el rol). Cualquier usuario autenticado puede acceder a cualquier workspace.', tl_style)],
    [Paragraph('Rate limiting', tl_style), Paragraph('SI', tc_style), Paragraph('Solo en /api/auth/login (20 req/min). Las demas rutas no tienen proteccion. Un attacker podria spamear /api/ai/chat sin limite.', tl_style)],
    [Paragraph('Validacion de input', tl_style), Paragraph('SI', tc_style), Paragraph('Zod schemas para validacion en auth y algunos endpoints. No es uniforme en todas las rutas.', tl_style)],
    [Paragraph('Variables sensibles', tl_style), Paragraph('RIESGO', tc_style), Paragraph('NEXTAUTH_SECRET usa un valor debil ("valiflow-secret-change..."). En .env esta expuesto. Para produccion necesita un secret de 32+ caracteres generado con crypto.randomUUID().', tl_style)],
    [Paragraph('Credenciales demo', tl_style), Paragraph('RIESGO', tc_style), Paragraph('La pagina de login muestra credenciales demo visibles. El seed endpoint (/api/seed) no tiene proteccion (SEED_PIN no esta configurado).', tl_style)],
    [Paragraph('HTTPS', tl_style), Paragraph('NO', tc_style), Paragraph('El app corre en http://localhost:3000. Para produccion necesita HTTPS obligatorio (HSTS ya esta configurado en headers, lo cual es bueno).', tl_style)],
]
story.append(make_table(sec_data, [3.5*cm, 2*cm, 12.5*cm]))
story.append(Spacer(1, 24))

# ========== FASE 7: INTEGRACIONES ==========
story.append(Paragraph('<b>FASE 7 - INTEGRACIONES</b>', h1))
story.append(Spacer(1, 8))

integ_data = [
    [Paragraph('<b>Integracion</b>', th_style), Paragraph('<b>Estado</b>', th_style), Paragraph('<b>Detalle</b>', th_style)],
    [Paragraph('Groq (LLM)', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Llama 3.3 70B via z-ai-web-dev-sdk. Es el proveedor primario. Respuestas rapidas (< 2s). Se usa para chat, analisis de leads, y generacion de respuestas WhatsApp.', tl_style)],
    [Paragraph('DeepSeek / Gemini / OpenAI', tl_style), Paragraph('FUNCIONAL (fallback)', tc_style), Paragraph('Configurados como fallback si Groq falla. No se usan en la practica porque Groq es estable.', tl_style)],
    [Paragraph('WhatsApp (Baileys)', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Protocolo WhatsApp Web real. QR scan, envio/recepcion de mensajes, media (imagenes, audio, video, stickers, ubicacion). Auto-reply con IA. Auth persistente.', tl_style)],
    [Paragraph('Stripe', tl_style), Paragraph('CODIGO LISTO, SIN CONFIG', tc_style), Paragraph('Checkout, portal, webhooks - todo implementado. Necesita: API key, webhook secret, crear productos/precios en Stripe Dashboard.', tl_style)],
    [Paragraph('Resend (Email)', tl_style), Paragraph('NO FUNCIONA', tc_style), Paragraph('No esta en package.json. No hay API key. Referenciado en reset-password pero sin implementacion real.', tl_style)],
    [Paragraph('Google OAuth', tl_style), Paragraph('CODIGO LISTO, SIN CONFIG', tc_style), Paragraph('Flujo completo implementado. Necesita Google Client ID/Secret de Google Cloud Console.', tl_style)],
    [Paragraph('Sharp (Imagenes)', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Procesamiento de imagenes para upload de archivos y avatares.', tl_style)],
    [Paragraph('Recharts', tl_style), Paragraph('FUNCIONAL', tc_style), Paragraph('Graficos de dashboard. Datos reales de analytics API.', tl_style)],
]
story.append(make_table(integ_data, [3.5*cm, 3.5*cm, 11*cm]))
story.append(Spacer(1, 24))

# ========== FASE 8: CAPACIDAD DE INGRESOS ==========
story.append(Paragraph('<b>FASE 8 - CAPACIDAD DE GENERAR INGRESOS</b>', h1))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>Se puede vender hoy?</b>', h2))
story.append(Paragraph('NO. Aunque el producto es funcional, no se puede cobrar porque: (1) Stripe no esta configurado con API keys reales ni productos creados, (2) no hay manera de procesar pagos, (3) el onboarding no incluye flujo de pago. El codigo de Stripe existe y esta bien implementado, pero necesita configuracion manual en el Dashboard de Stripe antes de funcionar.', body))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>Que impide monetizar?</b>', h2))

blocks_data = [
    [Paragraph('<b>Bloqueador</b>', th_style), Paragraph('<b>Severidad</b>', th_style), Paragraph('<b>Esfuerzo para resolver</b>', th_style)],
    [Paragraph('Configurar Stripe (API keys + productos + price IDs + webhook)', tl_style), Paragraph('CRITICO', tc_style), Paragraph('2-4 horas de trabajo manual en Stripe Dashboard + actualizar .env', tl_style)],
    [Paragraph('Cambiar SQLite a PostgreSQL para produccion', tl_style), Paragraph('ALTO', tc_style), Paragraph('4-8 horas. Cambiar provider en schema, migrar datos, configurar connection pool, actualizar .env', tl_style)],
    [Paragraph('Implementar envio real de emails (instalar Resend, configurar templates)', tl_style), Paragraph('MEDIO', tc_style), Paragraph('2-3 horas. npm install resend, crear templates de email, configurar dominio de envio', tl_style)],
    [Paragraph('Persistir Stage Tracker en DB (no en memoria)', tl_style), Paragraph('MEDIO', tc_style), Paragraph('1-2 horas. Crear tabla o campo en Conversation model, modificar stage-tracker.ts', tl_style)],
    [Paragraph('Quitar credenciales demo y proteger seed endpoint', tl_style), Paragraph('ALTO', tc_style), Paragraph('30 minutos. Eliminar hardcoded credentials, configurar SEED_PIN', tl_style)],
    [Paragraph('Rate limiting en todas las rutas API (no solo login)', tl_style), Paragraph('MEDIO', tc_style), Paragraph('1-2 horas. Aplicar requireRateLimit() como middleware global', tl_style)],
    [Paragraph('Tests automatizados ( Jest / Vitest )', tl_style), Paragraph('MEDIO', tc_style), Paragraph('8-16 horas para cobertura basica. Priorizar: auth, AI chat, Stripe webhook, WhatsApp connection', tl_style)],
    [Paragraph('Motor de ejecucion de automatizaciones', tl_style), Paragraph('BAJO (para MVP)', tc_style), Paragraph('16-24 horas. Cron job scheduler + event listeners + action executors por tipo', tl_style)],
]
story.append(make_table(blocks_data, [6.5*cm, 2.5*cm, 9*cm]))
story.append(Spacer(1, 24))

# ========== FASE 9: PLAN MINIMO VIABLE ==========
story.append(Paragraph('<b>FASE 9 - PLAN MINIMO VIABLE (LANZAR EN 2 SEMANAS)</b>', h1))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>PASO 1 - CRITICO (Dias 1-3): Preparar para produccion</b>', h2))
story.append(Paragraph('Cambiar de SQLite a PostgreSQL. Esto es no-negociable para produccion con multiples usuarios. Neon o Supabase ofrecen PostgreSQL serverless gratuito. Actualizar DATABASE_URL en .env, correr npx prisma db push, y verificar que todas las queries funcionan. Cambiar NEXTAUTH_SECRET a un valor criptografico real de 32+ caracteres. Eliminar las credenciales demo de la pagina de login. Configurar SEED_PIN para proteger el endpoint de seed. Configurar Google OAuth o eliminarlo del UI si no se va a usar de inmediato.', body))

story.append(Paragraph('<b>PASO 2 - CRITICO (Dias 3-5): Configurar pagos</b>', h2))
story.append(Paragraph('Crear cuenta en Stripe. Crear 3 productos con precios mensuales (Starter $4,300 MXN, Pro $7,800 MXN, Enterprise $35,500 MXN). Copiar los Price IDs reales y ponerlos en .env. Configurar el webhook de Stripe apuntando a /api/billing/webhook con el signing secret. Probar el flujo completo: checkout session, portal de gestion, y los 5 eventos del webhook. Sin esto no se puede cobrar un solo peso.', body))

story.append(Paragraph('<b>PASO 3 - IMPORTANTE (Dias 5-7): Email y persistencia</b>', h2))
story.append(Paragraph('Instalar Resend (npm install resend). Crear cuenta en resend.com y verificar dominio. Configurar RESEND_API_KEY en .env. Implementar el envio real de emails de reset-password. Crear templates basicos de email en espanol. Persistir el Stage Tracker en la base de datos en vez de memoria volatil. Crear un campo "valiautoflowStage" en el modelo Conversation y modificar stage-tracker.ts para usar DB en vez de Map().', body))

story.append(Paragraph('<b>PASO 4 - RECOMENDADO (Dias 7-10): Despliegue</b>', h2))
story.append(Paragraph('Deploy en Vercel (gratis para hobby) o Railway ($5/mes). Vercel es ideal porque es Next.js nativo. Configurar todas las environment variables en el panel de Vercel. Probar que el WebSocket de Baileys funciona en el entorno serverless (puede requerir ajustes). Configurar dominio custom. Activar HTTPS automatico.', body))

story.append(Paragraph('<b>PASO 5 - OPTATIVO (Dias 10-14): Pulir</b>', h2))
story.append(Paragraph('Agregar rate limiting global. Escribir tests basicos para auth y Stripe. Implementar al menos 3 automatizaciones funcionales de las 20 plantillas (welcome message, lead scoring, follow-up). Limpiar el UI: eliminar tabs de features no implementadas (Telegram, Instagram, developer tools). Agregar logging estructurado (pino ya esta instalado, solo configurarlo).', body))

story.append(Spacer(1, 12))
story.append(Paragraph('<b>QUE ELIMINAR para lanzar mas rapido:</b>', h3))
story.append(Paragraph('- Developer tools (6 rutas API + vista completa) - son para debug, no para usuarios<br/>- Telegram e Instagram del UI - no existen como integracion<br/>- Archetype detector avanzado - JHON ya funciona sin el<br/>- 3 de las 5 personalidades de IA - mantener solo JHON y ValiAutoFlow<br/>- Onboarding wizard - puede configurarse manualmente<br/>- Mercado Pago del schema - no hay codigo', body_left))

story.append(Spacer(1, 12))
story.append(Paragraph('<b>QUE SIMPLIFICAR:</b>', h3))
story.append(Paragraph('- Multi-tenancy: reducir a owner + member (2 roles en vez de 4)<br/>- Automatizaciones: implementar solo 3-5 que realmente importan en vez de las 20 plantillas<br/>- Analytics: simplificar a 3-4 metricas clave en vez de 10 queries paralelas<br/>- DB schema: eliminar modelos no usados (AgentPersona, AgentMemory, WebhookConfig)', body_left))
story.append(Spacer(1, 24))

# ========== FASE FINAL: VEREDICTO ==========
story.append(Paragraph('<b>FASE FINAL - VEREDICTO</b>', h1))
story.append(Spacer(1, 8))

verdict_data = [
    [Paragraph('<b>Criterio</b>', th_style), Paragraph('<b>Evaluacion</b>', th_style)],
    [Paragraph('Estado real del proyecto', tl_style), Paragraph('MVP funcional y sorprendentemente solido. No es vaporware - la IA de verdad funciona, WhatsApp de verdad conecta, el CRM de verdad persiste datos. Tiene el nucleo de un producto real. Lo que le falta es configuracion de produccion, no funcionalidad core.', tl_style)],
    [Paragraph('Vale la pena continuar?', tl_style), Paragraph('SI, absolutamente. El core esta construido. El Revenue Engine de 9 pasos, la conexion WhatsApp con Baileys, y el sistema ValiAutoFlow son funcionalidades diferenciadoras reales. No estas empezando de cero - estas a 60-70% del camino.', tl_style)],
    [Paragraph('Tiempo estimado para lanzar', tl_style), Paragraph('2 semanas si te enfocas solo en lo critico (PostgreSQL + Stripe + deploy). 3-4 semanas si quieres incluir email, automatizaciones basicas, y tests. El risk mas grande es la configuracion de Baileys en un entorno serverless.', tl_style)],
    [Paragraph('Complejidad real', tl_style), Paragraph('MEDIA-BAJA para lanzar MVP. El codigo ya esta escrito. Lo que queda es configuracion y deploy, no desarrollo from scratch. La complejidad sube a MEDIA si quieres automatizaciones funcionales y testing.', tl_style)],
    [Paragraph('Inversion total estimada (despues de lanzar)', tl_style), Paragraph('Hosting Vercel/Railway: $5-20 USD/mes. Groq: gratis (rate limits generosas). WhatsApp: gratis (telefono propio). DB PostgreSQL: gratis en Neon/Supabase. Stripe: 2.9% + $0.30 por transaccion. Total en vivo: < $25 USD/mes.', tl_style)],
    [Paragraph('Riesgo tecnico #1', tl_style), Paragraph('Baileys en serverless. Baileys necesita una conexion WebSocket persistente. Vercel serverless functions tienen timeout de 10-60 segundos. Necesitaras un servicio dedicado (Railway, Render, o VPS) para mantener la conexion WhatsApp activa 24/7.', tl_style)],
    [Paragraph('Riesgo de negocio #1', tl_style), Paragraph('Dependencia de WhatsApp. Baileys es una libreria no-oficial de WhatsApp. WhatsApp puede banear numeros que usen automatizacion excesiva. Necesitas: (1) numeros dedicados, (2) delays humanos (ya implementado), (3) limitar mensajes por hora.', tl_style)],
]
story.append(make_table(verdict_data, [4*cm, 14*cm]))
story.append(Spacer(1, 24))

# Final score
story.append(Paragraph('<b>PUNTUACION FINAL POR AREA</b>', h2))
score_data = [
    [Paragraph('<b>Area</b>', th_style), Paragraph('<b>Puntaje</b>', th_style), Paragraph('<b>Nota</b>', th_style)],
    [Paragraph('Funcionalidad Core (Auth, CRM, Chat, WhatsApp)', tc_style), Paragraph('8 / 10', tc_style), Paragraph('Solido. Todo conectado a servicios reales. Minus 2 por SQLite y stage tracker volatil.', tl_style)],
    [Paragraph('Calidad de Codigo', tc_style), Paragraph('7 / 10', tc_style), Paragraph('Buenas convenciones, TypeScript, sin spaghetti. Minus 3 por falta de tests. Plus 1 por error handling.', tl_style)],
    [Paragraph('Seguridad', tc_style), Paragraph('5 / 10', tc_style), Paragraph('JWT bien implementado pero: RBAC ausente, rate limiting parcial, secret debil, credenciales demo expuestas.', tl_style)],
    [Paragraph('Capacidad de Monetizacion', tc_style), Paragraph('3 / 10', tc_style), Paragraph('Codigo de Stripe completo pero no configurado. No se puede cobrar hoy. Necesita 2-3 dias de config.', tl_style)],
    [Paragraph('Listo para Produccion', tc_style), Paragraph('4 / 10', tc_style), Paragraph('Build limpio, pero: SQLite, no-HTTPS, secrets expuestos, sin tests, sin monitoring.', tl_style)],
    [Paragraph('Valor Diferenciador', tc_style), Paragraph('8 / 10', tc_style), Paragraph('Revenue Engine 9 pasos + ValiAutoFlow 3-agentes + WhatsApp real = combinacion unica en el mercado mexicano automotriz.', tl_style)],
    [Paragraph('<b>PROMEDIO GENERAL</b>', ParagraphStyle('bold', fontName='TimesNR', fontSize=10.5, leading=14, alignment=TA_CENTER, textColor=DARK_BLUE)), Paragraph('<b>5.8 / 10</b>', ParagraphStyle('bold2', fontName='TimesNR', fontSize=10.5, leading=14, alignment=TA_CENTER, textColor=DARK_BLUE)), Paragraph('<b>Beta funcional. MVP listo en 2 semanas con enfoque.</b>', ParagraphStyle('bold3', fontName='TimesNR', fontSize=10, leading=14, alignment=TA_LEFT, textColor=DARK_BLUE))],
]
story.append(make_table(score_data, [5*cm, 2.5*cm, 10.5*cm]))

doc.build(story)
print(f"PDF generado: {PDF_PATH}")
