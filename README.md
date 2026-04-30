<p align="center">
  <img src="public/logo.svg" alt="ValiAutoFlow" width="280" />
</p>

<h1 align="center">ValiAutoFlow</h1>

<p align="center">
  <strong>CRM Inteligente con IA + WhatsApp Business</strong><br/>
  Automatiza ventas, gestiona contactos y cierra tratos — todo desde un solo lugar.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma" alt="Prisma 6" />
  <img src="https://img.shields.io/badge/Baileys-7-25D366?logo=whatsapp" alt="Baileys v7" />
  <img src="https://img.shields.io/badge/SQLite-4-003B57?logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

<p align="center">
  <a href="#-caracteristicas">Características</a> &bull;
  <a href="#-instalacion-rapida">Instalación</a> &bull;
  <a href="#-arquitectura">Arquitectura</a> &bull;
  <a href="#-configuracion-de-whatsapp">WhatsApp</a> &bull;
  <a href="#-despliegue">Despliegue</a> &bull;
  <a href="DEPLOY.md">Guía de Deploy</a>
</p>

---

## Características

### CRM Completo
- **Gestión de Contactos** — CRUD completo con etiquetas, notas, historial de conversaciones y búsqueda avanzada
- **Pipeline de Ventas** — Kanban board drag & drop con etapas personalizables, valores estimados y cierre automático
- **Conversaciones Inteligentes** — Bandeja de entrada unificada con análisis IA en tiempo real por cada mensaje
- **Equipos** — Gestión de agentes con asignación de contactos y métricas individuales

### IA Integrada (z-ai-web-dev-sdk)
- **Asistente de Ventas IA** — Personalidades configurables (Amigable, Profesional, Cerrador, Consultivo)
- **Análisis de Conversaciones** — Detecta intención, sentimiento, urgencia y suggested next step por mensaje
- **Revenue Engine** — Motor de cierre que identifica oportunidades y genera respuestas de venta
- **Humanizador** — Transforma respuestas IA a lenguaje natural y cercano
- **Detección de Arquetipos** — Clasifica contactos por perfil de compra automáticamente

### WhatsApp Business
- **Conexión Nativa** — Via Baileys v7 (WhatsApp Web protocol), QR scan, reconexión automática
- **Mensajería Completa** — Texto, imágenes, video, audio/voceos, documentos PDF/Word/Excel, stickers, ubicaciones y contactos
- **Descarga Automática de Media** — Los archivos entrantes se descargan y guardan con thumbnails
- **Envío de Media** — Sube archivos desde el panel y envíalos directamente por WhatsApp
- **Webhooks** — Endpoint deduplicado con TTL de 10 minutos para mensajes procesados

### Panel de Control
- **Dashboard con Métricas** — KPIs en tiempo real, gráficos de conversión y actividad reciente
- **Analytics** — Análisis de conversaciones, leads fríos, oportunidades perdidas y candidatos de reactivación
- **Automatizaciones** — Reglas automatizadas con triggers y acciones configurables
- **Modo Developer** — Panel de logs, testeo de prompts, inspección de DB y exportación de datos
- **Billing** — Integración con Stripe para suscripciones y portal de facturación

### Seguridad y Calidad
- **Rate Limiting** — Protección por IP en auth (10/min), AI chat (20/min), WhatsApp (30/min)
- **Validación Zod** — Schemas estrictos en todas las APIs (4.0+)
- **TypeScript Full** — 154 archivos, 24K+ líneas, 0 errores de compilación
- **Ghost Connection Fix** — Detección de conexiones zombie WhatsApp con `isSocketAlive()`
- **Contact Dedup** — Prevención de duplicados buscando en TODOS los contactos (incluidos archivados)

---

## Instalación Rápida

### Requisitos Previos
- **Node.js** 18+ o **Bun** 1.0+
- **npm** o **bun** package manager

### 1. Clonar e Instalar

```bash
git clone https://github.com/tu-usuario/valiautoflow.git
cd valiautoflow
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Si | Path SQLite: `file:./db/custom.db` |
| `NEXTAUTH_URL` | Si | URL de tu app: `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Si | String aleatorio 32+ chars. `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_NAME` | No | Nombre visible en UI (default: ValiAutoFlow) |
| `SEED_PIN` | Si | PIN para proteger endpoint de seed |

### 3. Inicializar Base de Datos

```bash
npx prisma db push
npx prisma generate
```

### 4. (Opcional) Cargar Datos Demo

```bash
curl -X POST "http://localhost:3000/api/seed?pin=TU_SEED_PIN"
```

Crea usuario demo: `demo@valiflow.com` / `demo1234` con datos de ejemplo del sector automotriz.

### 5. Levantar el Servidor

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm run start
```

Abre **http://localhost:3000** en tu navegador.

---

## Arquitectura

```
valiautoflow/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (public)/landing/     # Landing page pública
│   │   ├── login/                # Autenticación
│   │   ├── signup/               # Registro
│   │   ├── api/                  # 23 API route groups
│   │   │   ├── auth/             # Login, registro, Google OAuth, logout
│   │   │   ├── whatsapp/         # Connect, QR, status, send-media, logout
│   │   │   ├── webhooks/         # WhatsApp webhook con dedup
│   │   │   ├── contacts/         # CRUD de contactos
│   │   │   ├── conversations/    # Mensajes con media
│   │   │   ├── pipeline/         # Kanban stages
│   │   │   ├── deals/            # Gestión de tratos
│   │   │   ├── analytics/        # Análisis de conversaciones
│   │   │   ├── ai/               # Chat completions
│   │   │   ├── billing/          # Stripe checkout/portal/webhook
│   │   │   ├── automations/      # Reglas automatizadas
│   │   │   ├── teams/            # Gestión de equipos
│   │   │   ├── upload/           # Subida de archivos
│   │   │   ├── media/            # Serve de media con Range support
│   │   │   └── developer/        # Logs, prompts, API keys, export
│   │   └── page.tsx              # Dashboard principal
│   ├── components/
│   │   ├── dashboard/            # 16 componentes del panel
│   │   │   ├── inbox.tsx         # Bandeja con 9 tipos de media
│   │   │   ├── crm-pipeline.tsx  # Kanban drag & drop
│   │   │   ├── analytics-view.tsx
│   │   │   ├── contacts-view.tsx
│   │   │   └── ...
│   │   └── ui/                   # 42 componentes shadcn/ui
│   ├── lib/
│   │   ├── ai/                   # 8 módulos de IA
│   │   │   ├── agent-router.ts   # Router de personalidades
│   │   │   ├── message-processor.ts
│   │   │   ├── revenue-engine.ts
│   │   │   ├── archetype-detector.ts
│   │   │   ├── personalities.ts
│   │   │   └── ...
│   │   ├── whatsapp/
│   │   │   ├── connection.ts     # Baileys v7 connection manager
│   │   │   ├── media-handler.ts  # Download, upload, thumbnails
│   │   │   └── db-auth-state.ts  # Session persistence
│   │   ├── crm/                  # Auto-deal engine
│   │   ├── stripe.ts             # Billing integration
│   │   └── ...
│   └── hooks/                    # Custom React hooks
├── prisma/
│   └── schema.prisma             # 26 modelos de datos
├── public/                       # Static assets
├── DEPLOY.md                     # Guía de despliegue completa
└── .env.example                  # Template de configuración
```

### Stack Técnico

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router, Server Components) |
| Lenguaje | TypeScript 5 (strict mode) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui |
| ORM | Prisma 6 + SQLite (migrable a PostgreSQL) |
| WhatsApp | @whiskeysockets/baileys v7 |
| IA | z-ai-web-dev-sdk (chat completions, image generation) |
| Pagos | Stripe (checkout, portal, webhooks) |
| Auth | NextAuth.js (credentials + Google OAuth) |
| Drag & Drop | @dnd-kit/core + sortable |
| Charts | Recharts |
| Validación | Zod 4 |
| Build | Bun runtime |

---

## Configuración de WhatsApp

### Conectar por Primera Vez

1. Inicia el servidor: `npm run dev`
2. Abre el dashboard e inicia sesión
3. Ve a **Configuración > WhatsApp**
4. Haz clic en **"Conectar WhatsApp"**
5. Escanea el código QR con tu WhatsApp (Menú > Dispositivos vinculados)
6. La conexión se guarda en `.whatsapp-auth/` y persiste entre reinicios

### Media Soportado

| Tipo | Entrante | Saliente | Preview |
|------|----------|----------|---------|
| Imágenes (JPG, PNG, WebP) | Auto-descarga con thumbnail | Subida + envío | Grid de miniaturas |
| Video (MP4) | Auto-descarga, streaming con Range | Subida + envío | Player nativo |
| Audio / Voceos | Auto-descarga, waveform player | Subida + envío | Visualizador de onda |
| Documentos (PDF, DOC, XLS) | Auto-descarga | Subida + envío | Icono + tamaño |
| Stickers | Mostrado en chat | Envío soportado | Render full-size |
| Ubicaciones | Parse de coordenadas | No aplica | Mapa preview |
| Contactos vCard | Parse de datos | No aplica | Card con info |

### Consideraciones

- **Sesión persistente**: El directorio `.whatsapp-auth/` contiene la sesión. Haz backup regular.
- **Una sola conexión**: Un número WhatsApp por instancia de ValiAutoFlow.
- **Rate limits**: WhatsApp limita la frecuencia de mensajes. El rate limiter integrado previene baneos.
- **Reconexión automática**: Hasta 10 intentos con backoff exponencial.

---

## Despliegue

Para instrucciones detalladas de producción (Docker, Nginx, SSL, scaling), consulta:

> [DEPLOY.md](DEPLOY.md) — Guía completa de despliegue

### Resumen Rápido (Producción)

```bash
# 1. Configura .env con valores de producción
cp .env.example .env
# Edita NEXTAUTH_URL, NEXTAUTH_SECRET, DATABASE_URL

# 2. Build
npm run build

# 3. Inicia
npm run start
# Sirve en http://localhost:3000
```

### Checklist de Seguridad Pre-Deploy

- [ ] `NEXTAUTH_SECRET` es un string aleatorio fuerte
- [ ] `SEED_PIN` fue cambiado del valor default
- [ ] HTTPS/SSL configurado (Let's Encrypt)
- [ ] `.env` NO está en el repo
- [ ] `.whatsapp-auth/` NO es accesible desde la web
- [ ] Firewall restringe puerto 3000 (solo localhost/nginx)
- [ ] Backups automáticos de la DB programados

---

## Estructura del Proyecto

| Métrica | Valor |
|---------|-------|
| Archivos fuente | 154 |
| Líneas de código | 24,000+ |
| Modelos Prisma | 26 |
| API Routes | 23 grupos |
| Componentes UI | 42 (shadcn/ui) |
| Componentes Dashboard | 16 |
| Módulos de IA | 8 |
| Comandos Git | 4 commits + tag `v2.0.1-stable` |

---

## Roadmap

- [ ] Migración a PostgreSQL para escalabilidad multi-tenant
- [ ] Soporte multi-número WhatsApp (Evolution API)
- [ ] App móvil (React Native) para agentes en campo
- [ ] Integración con Google Calendar para agendar citas
- [ ] Sistema de email marketing con plantillas
- [ ] Dashboard de reportes exportable a PDF/Excel
- [ ] API pública para integraciones de terceros

---

## Licencia

MIT — Libre para uso personal y comercial.

---

<p align="center">
  Construido con dedicación para automatizar ventas y crecer negocios.
</p>
