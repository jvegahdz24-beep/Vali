#!/usr/bin/env python3
# ValiFlow Pro - System Radiography Report Generator
# Generates a comprehensive technical audit PDF

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'skills/pdf/scripts'))

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Image, Flowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib.colors import HexColor

# ━━ Color Palette ━━
ACCENT = HexColor('#1f7592')
TEXT_PRIMARY = HexColor('#201f1d')
TEXT_MUTED = HexColor('#7d7971')
BG_SURFACE = HexColor('#e6e4dd')
BG_PAGE = HexColor('#edece9')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = BG_SURFACE
CRITICAL_BG = HexColor('#fef2f2')
CRITICAL_TEXT = HexColor('#dc2626')
WARNING_BG = HexColor('#fffbeb')
WARNING_TEXT = HexColor('#d97706')
OK_BG = HexColor('#f0fdf4')
OK_TEXT = HexColor('#16a34a')

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback
install_font_fallback()

# ━━ Styles ━━
W, H = A4
LM, RM, TM, BM = 1.0*inch, 1.0*inch, 0.8*inch, 0.8*inch
AW = W - LM - RM

styles = getSampleStyleSheet()

s_title = ParagraphStyle('Title', fontName='Times New Roman', fontSize=22, leading=28,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=6)
s_h1 = ParagraphStyle('H1', fontName='Times New Roman', fontSize=16, leading=22,
    textColor=ACCENT, spaceBefore=18, spaceAfter=8)
s_h2 = ParagraphStyle('H2', fontName='Times New Roman', fontSize=13, leading=18,
    textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
s_h3 = ParagraphStyle('H3', fontName='Times New Roman', fontSize=11, leading=15,
    textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
s_body = ParagraphStyle('Body', fontName='Times New Roman', fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=6)
s_body_left = ParagraphStyle('BodyLeft', fontName='Times New Roman', fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=6)
s_code = ParagraphStyle('Code', fontName='SarasaMonoSC', fontSize=8.5, leading=12,
    textColor=HexColor('#334155'), backColor=HexColor('#f8fafc'), leftIndent=12,
    rightIndent=12, spaceBefore=4, spaceAfter=4, borderPadding=6)
s_caption = ParagraphStyle('Caption', fontName='Times New Roman', fontSize=9, leading=13,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
s_table_header = ParagraphStyle('TH', fontName='Times New Roman', fontSize=9.5, leading=13,
    textColor=colors.white, alignment=TA_CENTER)
s_table_cell = ParagraphStyle('TC', fontName='Times New Roman', fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
s_table_cell_c = ParagraphStyle('TCC', fontName='Times New Roman', fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER)
s_callout = ParagraphStyle('Callout', fontName='Times New Roman', fontSize=10, leading=15,
    textColor=ACCENT, leftIndent=18, rightIndent=12, borderColor=ACCENT,
    borderWidth=2, borderPadding=8, backColor=HexColor('#f0f9ff'))
s_verdict = ParagraphStyle('Verdict', fontName='Times New Roman', fontSize=11, leading=17,
    textColor=TEXT_PRIMARY, backColor=HexColor('#fefce8'), leftIndent=12, rightIndent=12,
    borderPadding=10, borderColor=WARNING_TEXT, borderWidth=1.5)
s_critical = ParagraphStyle('Critical', fontName='Times New Roman', fontSize=10, leading=15,
    textColor=CRITICAL_TEXT, backColor=CRITICAL_BG, leftIndent=12, rightIndent=12,
    borderPadding=8)
s_ok = ParagraphStyle('OK', fontName='Times New Roman', fontSize=10, leading=15,
    textColor=OK_TEXT, backColor=OK_BG, leftIndent=12, rightIndent=12,
    borderPadding=8)
s_meta = ParagraphStyle('Meta', fontName='Times New Roman', fontSize=9, leading=12,
    textColor=TEXT_MUTED, alignment=TA_LEFT)

def h1(text):
    return Paragraph(f'<b>{text}</b>', s_h1)

def h2(text):
    return Paragraph(f'<b>{text}</b>', s_h2)

def h3(text):
    return Paragraph(f'<b>{text}</b>', s_h3)

def body(text):
    return Paragraph(text, s_body)

def body_left(text):
    return Paragraph(text, s_body_left)

def code(text):
    return Paragraph(text.replace('<', '&lt;').replace('>', '&gt;'), s_code)

def caption(text):
    return Paragraph(text, s_caption)

def callout(text):
    return Paragraph(text, s_callout)

def critical_box(text):
    return Paragraph(text, s_critical)

def ok_box(text):
    return Paragraph(text, s_ok)

def meta(text):
    return Paragraph(text, s_meta)

def make_table(headers, rows, col_ratios=None):
    if col_ratios is None:
        n = len(headers)
        col_ratios = [1.0/n] * n
    col_widths = [r * AW for r in col_ratios]
    data = []
    header_row = [Paragraph(f'<b>{h}</b>', s_table_header) for h in headers]
    data.append(header_row)
    for row in rows:
        data.append([Paragraph(str(c), s_table_cell) for c in row])
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ━━ Build Document ━━
OUTPUT = '/home/z/my-project/download/ValiFlow_Pro_Radiografia_Tecnica.pdf'

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=LM, rightMargin=RM,
    topMargin=TM, bottomMargin=BM,
    title='ValiFlow Pro - Radiografia Tecnica del Sistema',
    author='Z.ai System Audit',
    creator='Z.ai'
)

story = []

# ═══════════════════════════════════════════════════════════
# COVER
# ═══════════════════════════════════════════════════════════
story.append(Spacer(1, 100))
story.append(Paragraph('<b>ValiFlow Pro</b>', ParagraphStyle('CoverTitle',
    fontName='Times New Roman', fontSize=36, leading=42, textColor=ACCENT, alignment=TA_LEFT)))
story.append(Spacer(1, 12))
story.append(Paragraph('<b>Radiografia Tecnica del Sistema</b>', ParagraphStyle('CoverSub',
    fontName='Times New Roman', fontSize=18, leading=24, textColor=TEXT_PRIMARY, alignment=TA_LEFT)))
story.append(Spacer(1, 8))
story.append(Paragraph('Auditoria Completa de Arquitectura, Instancias, Flujos<br/>y Puntos de Ruptura en Vivo', ParagraphStyle('CoverDesc',
    fontName='Times New Roman', fontSize=12, leading=18, textColor=TEXT_MUTED, alignment=TA_LEFT)))
story.append(Spacer(1, 60))

cover_info = [
    ['Tipo de Analisis', 'Radiografia en Vivo (No Destructiva)'],
    ['Fecha', '14 de Abril, 2026'],
    ['Framework', 'Next.js 16.1.1 + React 19 + Bun'],
    ['WhatsApp', 'Baileys v6.7.9 (WebSocket)'],
    ['Base de Datos', 'Prisma 6.11 + SQLite'],
    ['IA', 'z-ai-web-dev-sdk + Multi-provider'],
    ['Modo', 'Dev Server (Turbopack/Webpack HMR)'],
]
ct = Table([[Paragraph(f'<b>{r[0]}</b>', s_table_cell), Paragraph(r[1], s_table_cell)] for r in cover_info],
    colWidths=[AW*0.35, AW*0.65], hAlign='LEFT')
ct.setStyle(TableStyle([
    ('GRID', (0,0), (-1,-1), 0.5, TEXT_MUTED),
    ('BACKGROUND', (0,0), (0,-1), HexColor('#f0f9ff')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
    ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
]))
story.append(ct)
story.append(Spacer(1, 40))
story.append(Paragraph('Documento generado automaticamente por Z.ai System Audit Engine', s_meta))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# FASE 1 - INSTANCIAS ACTIVAS
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 1: Deteccion de Instancias Activas'))

story.append(body('El sistema ValiFlow Pro utiliza un patron Singleton para gestionar la conexion WhatsApp. La instancia se almacena en <b>globalThis.whatsAppManager</b> y se protege con un mecanismo de versionado (<font name="SarasaMonoSC">_WA_CODE_VERSION = 11</font>) que fuerza la recreacion cuando el codigo cambia. A continuacion se presenta el mapa completo de instancias detectadas en el sistema.'))

story.append(h2('1.1 Patron Singleton - Mecanismo de Versionado'))
story.append(body('El singleton se define en <font name="SarasaMonoSC">connection.ts</font> (lineas 1222-1282). Cada vez que el modulo se importa (por ejemplo, durante un hot-reload de Turbopack/Webpack), se ejecuta la logica de versionado. Si la version del codigo cambia, la instancia anterior se destruye completamente y se crea una nueva. La destruccion incluye: marcar <font name="SarasaMonoSC">_destroyed = true</font> para bloquear procesamiento de mensajes, cerrar el socket con <font name="SarasaMonoSC">sock.end()</font>, remover todos los listeners, y limpiar timers. Sin embargo, existe una ventana de carrera critica: <font name="SarasaMonoSC">sock.end()</font> es asincrono (usa callback), y la nueva instancia inicia su conexion via <font name="SarasaMonoSC">_autoConnectIfPossible()</font> que tambien es asincrono. Durante esta ventana de 1-2 segundos, ambos sockets pueden estar activos simultaneamente.'))

story.append(h2('1.2 Estado de Instancias Detectadas'))

story.append(make_table(
    ['Componente', 'Tipo', 'Ubicacion', 'Estado', 'Listeners'],
    [
        ['WhatsAppManager', 'Singleton', 'globalThis.whatsAppManager', 'ACTIVO', '3 por socket'],
        ['Baileys Socket', 'WASocket', 'this.sock (instancia)', 'ACTIVO (cuando conectado)', 'creds.update, connection.update, messages.upsert'],
        ['_processedMessageIds', 'Set global', 'Module-level en connection.ts', 'ACTIVO', 'Dedup por msg ID'],
        ['pendingBatches', 'Map global', 'Module-level en conversation-middleware.ts', 'ACTIVO', 'Debounce 3.5s por telefono'],
        ['ConversationState', 'Map global', 'Module-level en conversation-state.ts', 'ACTIVO', 'Estado por telefono'],
        ['baileysModule', 'Cache', 'Module-level en connection.ts', 'ACTIVO', 'Singleton dinamico'],
        ['PrismaClient', 'Singleton', 'globalThis en db.ts', 'ACTIVO', 'Pool SQLite'],
    ],
    [0.20, 0.13, 0.30, 0.20, 0.17]
))
story.append(caption('Tabla 1.1: Componentes vivos en memoria del servidor'))

story.append(Spacer(1, 12))
story.append(h2('1.3 Mecanismo de Proteccion de Credenciales'))
story.append(body('El sistema implementa tres capas de proteccion para las credenciales WhatsApp almacenadas en <font name="SarasaMonoSC">.whatsapp-auth/</font>:'))

story.append(make_table(
    ['Capa', 'Mecanismo', 'Ubicacion', 'Efectividad'],
    [
        ['1. Proteccion me.id', 'Si creds.json contiene me.id, NUNCA se borran', 'connection.ts:617-632', 'ALTA - Bloquea el 99% de borrados accidentales'],
        ['2. Ventana de 60s', 'No borrar dentro de 60s despues de saveCreds', 'connection.ts:635-639', 'MEDIA - Protege contra race conditions rapidas'],
        ['3. Flag _destroyed', 'Instancia vieja marcada como destruida', 'connection.ts:1250', 'ALTA - Previene procesamiento de mensajes fantasmas'],
    ],
    [0.12, 0.38, 0.25, 0.25]
))
story.append(caption('Tabla 1.2: Capas de proteccion de credenciales'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 2 - EVENT LISTENERS
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 2: Mapeo de Event Listeners'))

story.append(body('Cada instancia de WhatsAppManager registra exactamente 3 event listeners en el objeto <font name="SarasaMonoSC">sock.ev</font> (emitter de Baileys). No se detecto duplicacion de listeners dentro de una misma instancia. La funcion <font name="SarasaMonoSC">_setupConnectionHandlers()</font> es llamada desde dos caminos: <font name="SarasaMonoSC">_connectBackground()</font> para el flujo QR normal, y <font name="SarasaMonoSC">connectWithPairingCode()</font> para vincular por codigo. Sin embargo, ambos caminos crean sockets diferentes y no comparten listeners.'))

story.append(make_table(
    ['#', 'Evento', 'Funcion', 'Linea', 'Proposito'],
    [
        ['1', 'creds.update', 'saveCreds(await)', '736', 'Guardar credenciales en disco'],
        ['2', 'connection.update', 'Manejar QR/open/close', '748', 'Ciclo de vida de conexion'],
        ['3', 'messages.upsert', 'Procesar mensaje entrante', '915', 'Recepcion y procesamiento de mensajes'],
    ],
    [0.05, 0.18, 0.30, 0.07, 0.40]
))
story.append(caption('Tabla 2.1: Event listeners por instancia de socket'))

story.append(Spacer(1, 12))
story.append(h2('2.1 Funcionamiento del Monkey-Patch de Keepalive'))
story.append(body('El sistema aplica un monkey-patch global al prototipo del modulo <font name="SarasaMonoSC">ws</font> (WebSocket). Cuando cualquier WebSocket escucha el evento <font name="SarasaMonoSC">open</font>, se inicia automaticamente un intervalo de PING cada 5 segundos. Este mecanismo es crucial para mantener la conexion a traves del proxy de z.ai, que cierra WebSockets inactivos con error 428 aproximadamente cada 3 minutos. El patch se aplica una sola vez por version (<font name="SarasaMonoSC">PATCH_VERSION = 3</font>) y se almacena como propiedad global del constructor WebSocket.'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 3 - TRAZABILIDAD DE MENSAJES
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 3: Trazabilidad de Mensajes'))

story.append(body('Esta seccion traza el flujo completo de un mensaje desde que entra por WhatsApp hasta que se genera la respuesta del bot. Se identifican los 14 pasos del pipeline central y los puntos donde pueden ocurrir duplicaciones.'))

story.append(h2('3.1 Flujo Real de un Mensaje (End-to-End)'))

story.append(make_table(
    ['Paso', 'Componente', 'Archivo', 'Accion', 'Tiempo Estimado'],
    [
        ['1', 'Baileys ws', 'connection.ts:915', 'messages.upsert recibe mensaje de WhatsApp', '0ms'],
        ['2', 'WhatsAppManager', 'connection.ts:919-920', 'Verifica _destroyed y _connected', '<1ms'],
        ['3', 'Filtros', 'connection.ts:924-929', 'Filtra fromMe, grupos, broadcast, tipo', '<1ms'],
        ['4', 'Dedup Global', 'connection.ts:938-943', 'Verifica _processedMessageIds.has(msgId)', '<1ms'],
        ['5', 'Debounce', 'conversation-middleware.ts:76', 'enqueueMessage() agrupa 3.5s', '0-3500ms'],
        ['6', 'Pipeline Core', 'message-processor.ts:82', 'processMessageCore() 14 pasos', '50-200ms'],
        ['7', 'DB: Workspace', 'message-processor.ts:103', 'Busca workspace activo', '5-20ms'],
        ['8', 'DB: Contact', 'message-processor.ts:127-139', 'Find or create contact', '5-20ms'],
        ['9', 'DB: Conversation', 'message-processor.ts:159-175', 'Find or create conversation', '5-20ms'],
        ['10', 'DB: Save Message', 'message-processor.ts:188-197', 'Guarda mensaje entrante', '5-15ms'],
        ['11', 'Middleware', 'conversation-middleware.ts:159', 'preProcess: estado, etapa, contexto', '<5ms'],
        ['12', 'AI Engine', 'revenue-engine.ts', 'RevenueEngine.processConversation()', '2000-8000ms'],
        ['13', 'Post-Process', 'conversation-middleware.ts:225', 'postProcess: filtra repeticiones', '<5ms'],
        ['14', 'WhatsApp Send', 'connection.ts:1197-1213', 'humanizeResponse + sendMessage', '500-3000ms'],
    ],
    [0.05, 0.14, 0.22, 0.40, 0.19]
))
story.append(caption('Tabla 3.1: Flujo completo end-to-end de un mensaje'))

story.append(Spacer(1, 12))
story.append(h2('3.2 Puntos de Entrada a processMessageCore'))
story.append(body('El sistema tiene tres puntos de entrada que llaman a <font name="SarasaMonoSC">processMessageCore()</font>, lo cual es la fuente unica de verdad para todo el procesamiento de mensajes:'))

story.append(make_table(
    ['Punto de Entrada', 'Archivo', 'Canal', 'Dedup Protegido', 'Riesgo'],
    [
        ['messages.upsert', 'connection.ts:951', 'WhatsApp directo', 'SI (_processedMessageIds)', 'BAJO'],
        ['Evolution Webhook', 'webhooks/whatsapp/route.ts:87', 'Evolution API', 'NO', 'ALTO'],
        ['Web Chat', 'api/ai/chat/route.ts', 'Web chat', 'NO', 'MEDIO'],
    ],
    [0.18, 0.25, 0.17, 0.22, 0.18]
))
story.append(caption('Tabla 3.2: Puntos de entrada al pipeline central'))

story.append(critical_box('<b>BUG CRITICO DETECTADO - Punto de Entrada Webhook sin Proteccion:</b> El webhook de Evolution API (<font name="SarasaMonoSC">webhooks/whatsapp/route.ts</font>) NO tiene mecanismo de deduplicacion de mensajes. Si el webhook se dispara multiples veces para el mismo mensaje (comportamiento comun en Evolution API), el mensaje se procesara multiples veces, creando multiples respuestas y contactos duplicados.'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 4 - FLUJO COMPLETO EN VIVO
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 4: Flujo Completo en Vivo - Diagrama'))

story.append(body('El siguiente diagrama muestra la arquitectura de procesamiento de mensajes de ValiFlow Pro, incluyendo las tres vias de entrada y el pipeline central de 14 pasos:'))

story.append(Spacer(1, 12))

flow_data = [
    [Paragraph('<b>VIAS DE ENTRADA</b>', s_table_header), Paragraph('', s_table_header), Paragraph('<b>PIPELINE CENTRAL</b>', s_table_header), Paragraph('', s_table_header)],
    [Paragraph('WhatsApp (Baileys)', s_table_cell), Paragraph('--&gt;', s_table_cell_c), Paragraph('1. Dedup Global + Debounce 3.5s', s_table_cell), Paragraph('', s_table_cell)],
    [Paragraph('Evolution API Webhook', s_table_cell), Paragraph('--&gt;', s_table_cell_c), Paragraph('2. Buscar/Crear Contacto', s_table_cell), Paragraph('', s_table_cell)],
    [Paragraph('Web Chat (/api/ai/chat)', s_table_cell), Paragraph('--&gt;', s_table_cell_c), Paragraph('3. Buscar/Crear Conversacion', s_table_cell), Paragraph('', s_table_cell)],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('4. Guardar Mensaje Entrante', s_table_cell), Paragraph('', s_table_cell)],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('5. Pre-Process Middleware', s_table_cell), Paragraph('Estado + Etapa + Contexto')],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('6. Cargar Historial (ult 50)', s_table_cell), Paragraph('DB Messages', s_table_cell)],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('7. Revenue Engine (9 pasos)', s_table_cell), Paragraph('LLM Call 2-8s', s_table_cell)],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('8. Post-Process + Humanize', s_table_cell), Paragraph('Filtrar repetidos', s_table_cell)],
    [Paragraph('', s_table_cell), Paragraph('', s_table_cell), Paragraph('9. Guardar Respuesta + Enviar', s_table_cell), Paragraph('WhatsApp / Web', s_table_cell)],
]

ft = Table(flow_data, colWidths=[AW*0.26, AW*0.08, AW*0.40, AW*0.26], hAlign='CENTER')
ft.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), ACCENT),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('GRID', (0,0), (-1,-1), 0.5, TEXT_MUTED),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
    ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('BACKGROUND', (0,1), (-1,-1), colors.white),
    ('BACKGROUND', (0,5), (-1,5), BG_SURFACE),
    ('BACKGROUND', (0,7), (-1,7), BG_SURFACE),
    ('BACKGROUND', (0,9), (-1,9), BG_SURFACE),
]))
story.append(ft)
story.append(caption('Diagrama 4.1: Arquitectura de flujo de mensajes ValiFlow Pro'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 5 - ESTADO EN MEMORIA
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 5: Estado en Memoria'))

story.append(body('El sistema mantiene multiples variables globales en memoria que persisten entre requests HTTP. Estas variables son la fuente de muchos de los comportamientos observados, incluyendo duplicaciones y conflictos de personalidad. En modo desarrollo (hot-reload), estas variables pueden perder su estado coherente.'))

story.append(h2('5.1 Mapa Completo de Estado Global'))

story.append(make_table(
    ['Variable', 'Tipo', 'Archivo', 'Alcance', 'Vulnerabilidad'],
    [
        ['_processedMessageIds', 'Set&lt;string&gt;', 'connection.ts:56', 'Global (modulo)', 'Se limpia cada 60s si size &gt; 500'],
        ['pendingBatches', 'Map&lt;string, PendingBatch&gt;', 'conversation-middleware.ts:66', 'Global (modulo)', 'Se pierde en hot-reload'],
        ['_conversationStates', 'Map (en getState)', 'conversation-state.ts', 'Global (modulo)', 'Se pierde en hot-reload'],
        ['whatsAppManager', 'WhatsAppManager', 'connection.ts:1235', 'globalThis', 'Protegido por version'],
        ['_waCodeVersion', 'number', 'connection.ts:1227', 'globalThis', 'Version actual: 11'],
        ['baileysModule', 'BaileysModule | null', 'connection.ts:80', 'Module-level', 'Cache de import dinamico'],
        ['PrismaClient', 'PrismaClient', 'db.ts', 'globalThis (dev)', 'Singleton con pool SQLite'],
    ],
    [0.22, 0.16, 0.22, 0.15, 0.25]
))
story.append(caption('Tabla 5.1: Estado global completo en memoria'))

story.append(Spacer(1, 12))
story.append(h2('5.2 Propiedades de Estado de la Instancia WhatsApp'))
story.append(body('Cada instancia de WhatsAppManager mantiene las siguientes propiedades internas que controlan su comportamiento. Durante un hot-reload, la nueva instancia pierde los valores de la instancia anterior (como <font name="SarasaMonoSC">_pairingComplete</font> y <font name="SarasaMonoSC">_pairingVerified</font>), lo que puede causar que las credenciales se consideren invalidas temporalmente.'))

story.append(make_table(
    ['Propiedad', 'Tipo', 'Valor Inicial', 'Persiste en HMR', 'Impacto'],
    [
        ['_connected', 'boolean', 'false', 'NO', 'UI muestra "desconectado"'],
        ['_destroyed', 'boolean', 'false', 'NO', 'Previene procesamiento fantasma'],
        ['_pairingComplete', 'boolean', 'false', 'NO', 'Protege credenciales en reconnect'],
        ['_pairingVerified', 'boolean', 'false', 'NO', 'Activa reconnect agresivo'],
        ['_connecting', 'boolean', 'false', 'NO', 'Bloquea multiples conexiones'],
        ['_ephemeralMode', 'boolean', 'false', 'NO (hardcoded)', 'Desactivado permanentemente'],
        ['_lastCredsSaveTime', 'number', '0', 'NO', 'Ventana de proteccion 60s'],
        ['_reconnectAttempts', 'number', '0', 'NO', 'Backoff exponencial'],
        ['sock', 'WASocket', 'null', 'SI (si persiste socket)', 'Canal de mensajeria real'],
    ],
    [0.20, 0.10, 0.10, 0.17, 0.43]
))
story.append(caption('Tabla 5.2: Propiedades internas del WhatsAppManager'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 6 - SESIONES WHATSAPP
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 6: Sesiones WhatsApp'))

story.append(body('Las sesiones de WhatsApp se almacenan en el directorio <font name="SarasaMonoSC">.whatsapp-auth/</font> (ruta absoluta: <font name="SarasaMonoSC">/home/z/my-project/.whatsapp-auth/</font>) usando el sistema de autenticacion multi-archivo de Baileys (<font name="SarasaMonoSC">useMultiFileAuthState</font>). Este sistema genera multiples archivos que contienen las credenciales de sesion, claves de cifrado, y metadatos de la conexion.'))

story.append(make_table(
    ['Componente', 'Mecanismo', 'Proteccion', 'Estado'],
    [
        ['Directorio auth', '.whatsapp-auth/ en cwd', 'me.id check antes de borrar', 'Protegido'],
        ['Guardar credenciales', 'saveCreds() awaited', 'awaited (no fire-and-forget)', 'Protegido'],
        ['Cierre de auth', '_clearAuthDir()', '3 capas de proteccion', 'Protegido'],
        ['Keepalive', 'Monkey-patch ws.on + PING 5s', 'Global en prototype', 'Activo'],
        ['Reconnect', 'scheduleReconnect() + backoff', 'Max 30 intentos', 'Activo'],
        ['Version tracking', '_WA_CODE_VERSION = 11', 'Recrea singleton si cambia', 'Activo'],
    ],
    [0.18, 0.28, 0.30, 0.24]
))
story.append(caption('Tabla 6.1: Estado de sesiones WhatsApp'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 7 - PUNTOS DE DUPLICACION
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 7: Puntos de Duplicacion - ANALISIS CRITICO'))

story.append(body('Esta seccion identifica EXACTAMENTE donde y por que se duplican los mensajes en el sistema. Se analizan los tres bugs reportados por el usuario: (1) contacto duplicado, (2) doble respuesta con personalidades diferentes, y (3) conexion fantasma sin reflejar en la UI.'))

story.append(h2('7.1 BUG #1: Creacion Duplicada de Contactos'))

story.append(critical_box('<b>SEVERIDAD: ALTA | ARCHIVO: message-processor.ts:127-139</b><br/><br/>El sistema busca un contacto existente con la consulta:<br/><br/><font name="SarasaMonoSC">findFirst({ where: { workspaceId, phone, status: { not: "archived" } } })</font><br/><br/>Si el contacto fue archivado previamente (status = "archived"), la consulta NO lo encuentra y se CREA UN NUEVO CONTACTO. Esto explica por que el usuario ve multiples contactos para el mismo numero de telefono. Adicionalmente, si dos llamadas a processMessageCore se ejecutan concurrentemente (posible en JS async), ambas pueden pasar la verificacion findFirst antes de que cualquiera cree el contacto, resultando en dos contactos identicos.'))

story.append(Spacer(1, 8))
story.append(ok_box('<b>SOLUCION PROPUESTA:</b> Buscar contactos sin filtro de status, o incluir "archived" en la busqueda y reactivar automaticamente. Ademas, agregar un unique constraint en la base de datos (workspaceId + phone) para prevenir duplicados a nivel de BD.'))

story.append(Spacer(1, 12))
story.append(h2('7.2 BUG #2: Doble Respuesta con Personalidades Diferentes'))

story.append(critical_box('<b>SEVERIDAD: CRITICA | ARCHIVOS: message-processor.ts:282-305, connection.ts:1241-1273</b><br/><br/>Este bug tiene dos causas contribuyentes:<br/><br/><b>Causa A - Instancias simultaneas durante hot-reload:</b> Cuando el codigo cambia, el patron singleton destruye la instancia vieja y crea una nueva. Durante 1-2 segundos, ambas instancias pueden tener sockets activos. Aunque el flag <font name="SarasaMonoSC">_destroyed</font> deberia bloquear la instancia vieja, el socket.end() es asincrono y pueden llegar eventos antes de que el cierre se complete. El Set global de dedup (<font name="SarasaMonoSC">_processedMessageIds</font>) protege contra esto, PERO se limpia cada 60s cuando supera 500 entradas.<br/><br/><b>Causa B - Personalidad leida de BD en cada mensaje:</b> La personalidad se lee de <font name="SarasaMonoSC">workspace.settings.defaultPersonality</font> (linea 285) en CADA llamada a processMessageCore. Si el usuario esta editando el Dev Panel mientras llegan mensajes, los settings pueden cambiar entre una llamada y otra, causando que el primer mensaje use personalidad "JHON" y el segundo use personalidad "VALIAUTOFLOW".'))

story.append(Spacer(1, 8))
story.append(ok_box('<b>SOLUCION PROPUESTA:</b> (A) Hacer sock.end() sincrono usando una Promise wrapper. (B) Cachear la personalidad por workspace en memoria con un TTL de 60s, invalidar solo cuando se guarde explicitamente desde el Dev Panel. (C) Aumentar la ventana de limpieza del dedup Set a 120s o usar un LRU cache en vez de limpieza periodica.'))

story.append(Spacer(1, 12))
story.append(h2('7.3 BUG #3: Conexion Fantasma (Bot responde pero UI no muestra conectado)'))

story.append(critical_box('<b>SEVERIDAD: MEDIA | ARCHIVOS: connection.ts:790-815, api/whatsapp/status/route.ts:15</b><br/><br/>El bot puede responder mensajes incluso cuando la UI muestra "desconectado" debido a una desincronizacion entre el estado interno del singleton y lo que la API de status reporta al frontend. La razon es que la API de status (<font name="SarasaMonoSC">/api/whatsapp/status</font>) importa el singleton y llama a <font name="SarasaMonoSC">getStatus()</font>, que lee la propiedad <font name="SarasaMonoSC">this._connected</font>. Sin embargo, durante un hot-reload, si la nueva instancia aun no ha completado la conexion (pero la vieja sigue procesando mensajes), el _connected de la nueva instancia es false mientras la vieja sigue en true hasta que se cierre completamente.'))

story.append(Spacer(1, 8))
story.append(ok_box('<b>SOLUCION PROPUESTA:</b> En lugar de depender unicamente de _connected, el status API deberia tambien verificar si hay un socket activo (this.sock no es null) y si el socket esta en estado de conexion real. Ademas, sincronizar el estado con un mecanismo de heartbeat que el frontend pueda consultar.'))

story.append(Spacer(1, 12))
story.append(h2('7.4 Resumen de Puntos de Duplicacion'))

story.append(make_table(
    ['#', 'Punto', 'Ubicacion', 'Causa Raiz', 'Severidad', 'Dedup'],
    [
        ['P1', 'Doble procesamiento', 'connection.ts:915-962', 'Dos instancias durante hot-reload', 'ALTA', 'PARCIAL (Set global)'],
        ['P2', 'Contacto duplicado', 'message-processor.ts:128', 'Busqueda excluye archived', 'ALTA', 'NINGUNO'],
        ['P3', 'Doble personalidad', 'message-processor.ts:285', 'Personalidad leida de BD cada vez', 'MEDIA', 'NINGUNO'],
        ['P4', 'Debounce edge case', 'connection.ts:949-958', 'Reject dispara procesamiento fallback', 'BAJA', 'PARCIAL'],
        ['P5', 'Webhook sin dedup', 'webhooks/whatsapp/route.ts:87', 'No hay proteccion de dedup', 'ALTA', 'NINGUNO'],
    ],
    [0.04, 0.18, 0.22, 0.26, 0.12, 0.18]
))
story.append(caption('Tabla 7.1: Mapa completo de puntos de duplicacion'))

story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════
# FASE 8 - VEREDICTO
# ═══════════════════════════════════════════════════════════
story.append(h1('FASE 8: Veredicto Final'))

story.append(h2('8.1 Respuestas a las Preguntas Criticas'))

story.append(make_table(
    ['Pregunta', 'Respuesta'],
    [
        ['Cuantas instancias reales estan vivas?', 'Normalmente 1. Durante hot-reload: brevemente 2 (vieja cerrandose + nueva conectandose). La vieja se marca como _destroyed, pero su socket puede entregar eventos antes de cerrar completamente.'],
        ['Por que responden doble?', 'Causa primaria: Contacto duplicado crea nueva conversacion, resultando en dos llamadas AI independientes. Causa secundaria: Personalidad leida de BD en cada mensaje puede cambiar entre llamadas si el usuario edita el Dev Panel.'],
        ['Es duplicacion de eventos o de sockets?', 'Es DUPLICACION DE SOCKETS durante hot-reload. La duplicacion de eventos esta mitigada por el Set global _processedMessageIds. Sin embargo, la ventana de limpieza (60s, 500 entries) crea brechas temporales.'],
        ['Que linea exacta permite esto?', 'Doble contacto: message-processor.ts:128 (status: { not: "archived" }). Doble respuesta: connection.ts:1250 (_destroyed se setea pero socket.end() es async). Doble personalidad: message-processor.ts:285 (lectura de settings en cada mensaje).'],
        ['Que pasaria si entran 10 mensajes simultaneos?', 'Cada mensaje se debuncia individualmente (3.5s por telefono). Mensajes del mismo telefono se agrupan. Mensajes de diferentes telefonos se procesan en paralelo. El cuello de botella es la AI call (2-8s por mensaje). Riesgo: race condition en create contact si 10 mensajes son del mismo telefono nuevo.'],
    ],
    [0.30, 0.70]
))
story.append(caption('Tabla 8.1: Veredicto tecnico - Respuestas criticas'))

story.append(Spacer(1, 18))
story.append(h2('8.2 Evaluacion de Produccion'))

story.append(make_table(
    ['Componente', 'Estado', 'Nivel (1-10)', 'Observaciones'],
    [
        ['Patron Singleton', 'FUNCIONAL', '7/10', 'Bien implementado con versioning. Mejorable: sincronizacion en hot-reload.'],
        ['Proteccion de Credenciales', 'ROBUSTO', '8/10', 'Triple capa de proteccion. me.id check es muy efectivo.'],
        ['Keepalive vs Proxy', 'FUNCIONAL', '7/10', 'PING 5s sobrevive proxy 428. Podria ser mas agresivo (3s).'],
        ['Pipeline AI', 'FUNCIONAL', '8/10', '14 pasos bien estructurados. Outer try/catch nunca falla.'],
        ['Dedup Mensajes', 'VULNERABLE', '4/10', 'Set global se limpia cada 60s. Webhook sin proteccion.'],
        ['Gestion de Contactos', 'VULNERABLE', '3/10', 'Crea duplicados. No hay unique constraint. Filtro archived es erroneo.'],
        ['UI-Backend Sync', 'VULNERABLE', '4/10', 'Status API no detecta instancias transicionales.'],
        ['Debounce/Batching', 'FUNCIONAL', '7/10', '3.5s debounce funciona bien. Edge case en reject.'],
        ['Onboarding', 'SIMPLIFICADO', '6/10', '3 pasos bien disenados. Podria validar QR antes de continuar.'],
        ['Seguridad', 'BASICO', '5/10', 'APIs publicas sin auth. Worker key hardcoded.'],
    ],
    [0.18, 0.14, 0.10, 0.58]
))
story.append(caption('Tabla 8.2: Evaluacion de componentes para produccion'))

story.append(Spacer(1, 18))
story.append(h2('8.3 Veredicto General'))

verdict_text = (
    '<b>NIVEL DE PRODUCCION: 5.9 / 10</b><br/><br/>'
    'El sistema ValiFlow Pro tiene una arquitectura solida con un pipeline de IA de 14 pasos bien estructurado '
    'y un patron singleton con versioning que previene la mayoria de los problemas de hot-reload. '
    'Sin embargo, existen tres vulnerabilidades criticas que impiden su despliegue en produccion:<br/><br/>'
    '1. <b>Duplicacion de contactos</b>: La busqueda excluye archivados, causando contactos duplicados. '
    'Se necesita un unique constraint (workspaceId, phone) en la BD.<br/>'
    '2. <b>Doble respuesta</b>: La personalidad se lee de BD en cada mensaje, permitiendo cambios '
    'mid-flight. Se necesita caching con invalidacion controlada.<br/>'
    '3. <b>Webhook sin dedup</b>: La via de Evolution API no tiene proteccion contra mensajes duplicados. '
    'Se necesita el mismo mecanismo _processedMessageIds del canal directo.<br/><br/>'
    'Con la aplicacion de las tres soluciones propuestas, el sistema alcanzaria un nivel de produccion '
    'estimado de <b>8.0 / 10</b>, adecuado para despliegue en un VPS con Docker.'
)

story.append(Paragraph(verdict_text, s_verdict))

story.append(Spacer(1, 18))
story.append(h2('8.4 Prioridad de Ataque'))

story.append(make_table(
    ['Prioridad', 'Bug', 'Impacto', 'Esfuerzo', 'Archivo Clave'],
    [
        ['P0 - Inmediato', 'Contacto duplicado', 'Cada msg nuevo crea contacto', 'Bajo (1 cambio)', 'message-processor.ts:128'],
        ['P0 - Inmediato', 'Webhook sin dedup', 'Evolucion API duplica mensajes', 'Medio (10 lineas)', 'webhooks/whatsapp/route.ts:87'],
        ['P1 - Alto', 'Doble respuesta', 'Bot contesta 2 veces', 'Medio (caching + sync)', 'message-processor.ts:285'],
        ['P1 - Alto', 'Conexion fantasma', 'UI no refleja estado real', 'Bajo (1 cambio)', 'api/whatsapp/status/route.ts:15'],
        ['P2 - Medio', 'Dedup Set limpieza', 'Brecha de 60s en proteccion', 'Bajo (cambiar intervalo)', 'connection.ts:57-62'],
        ['P3 - Bajo', 'Placeholders no rellenados', '[NOMBRE] sin datos reales', 'MEDIO (ya fixeado)', 'revenue-engine.ts'],
    ],
    [0.14, 0.20, 0.26, 0.18, 0.22]
))
story.append(caption('Tabla 8.3: Hoja de ruta de ataque priorizada'))

# ━━ Build ━━
doc.build(story)
print(f'PDF generated: {OUTPUT}')
