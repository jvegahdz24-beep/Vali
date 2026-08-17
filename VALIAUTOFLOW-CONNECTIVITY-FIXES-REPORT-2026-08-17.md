# ValiAutoFlow — Informe de correcciones de conectividad y preparación de despliegue

**Fecha:** 17 de agosto de 2026
**Rama:** `audit/functional-connectivity-fixes-2026-08-17`
**Base de comparación:** `audit/import-valiautoflow-2026-08-17`
**Alcance:** correcciones funcionales P0–P1, endurecimiento del build y preparación de despliegue. No se modificó `main`, no se enviaron mensajes externos y no se alteraron datos de producción.

## Resumen ejecutivo

Se implementaron las correcciones prioritarias identificadas en la auditoría funcional. Las automatizaciones manuales ahora ejecutan acciones reales a través de un ejecutor compartido; los follow-ups tienen claim atómico, recuperación de tareas abandonadas y un único consumidor operativo; Agent Factory aplica de forma efectiva la matriz base, la allow-list y las prohibiciones; el historial de importaciones cuenta con un modelo Prisma real; Marketing informa resultados por canal y no declara publicación exitosa sin confirmación del proveedor; Analytics identifica explícitamente sus respuestas como snapshots obtenidos por polling; y los cambios de etapa de Deals se registran de forma durable antes de publicarse al bus en memoria.

Además, se corrigió el build de producción para ejecutar `prisma generate` y Webpack de forma reproducible, se trasladó la convención de `middleware.ts` a `proxy.ts` para Next 16, se eliminó una exportación inválida de una Route de App Router y se documentaron defaults seguros para seed, demo y Nexus.

## Cambios funcionales aplicados

| Prioridad | Corrección | Resultado verificable |
|---|---|---|
| P0.1 | Ejecutor compartido de automatizaciones | `send_message`, `update_contact`, `add_tag` y `webhook` comparten una implementación real; el endpoint manual dejó de limitarse a contar contactos. |
| P0.2 | Consumo único de follow-ups | Claim atómico `pending → processing`, recuperación TTL de tareas atascadas y cron delegado permanentemente al worker. |
| P0.3 | Permisos efectivos de Agent Factory | La herramienta debe pasar la matriz base, la allow-list cuando existe y `forbiddenActions`. |
| P1.1 | Eventos CRM durables | `deal.stage_changed` se registra en `EngineEvent` antes de emitirse al bus local. |
| P1.2 | Historial de importaciones | Nuevo modelo `ImportJob`, migración MySQL y endpoint sin `@ts-ignore` ni fallback silencioso a lista vacía. |
| P1.3 | Publicación de Marketing | Respuesta por canal con estados `published`, `failed`, `skipped` o `partial`; los errores y resultados se persisten. |
| P1.4 | Analytics | La API y la interfaz muestran que los datos son `snapshot/polling`, con refresco cada 30 segundos, no push en tiempo real. |
| Build | Preparación de producción | `npm run build` ejecuta `prisma generate && next build --webpack`; el build final terminó correctamente. |

## Archivos principales modificados

| Área | Archivos |
|---|---|
| Automatizaciones | `src/lib/automations/executor.ts`, `src/lib/automations/__tests__/executor.test.ts`, `src/app/api/automations/trigger/route.ts`, `src/app/api/automations/[id]/run/route.ts` |
| Follow-ups | `src/lib/followups/task-claim.ts`, `src/lib/followups/__tests__/task-claim.test.ts`, `src/app/api/followups/worker/route.ts`, `src/app/api/cron/follow-ups/route.ts` |
| Agent Factory | `src/lib/ai/agent-permissions.ts`, `src/lib/ai/message-processor.ts`, `src/lib/ai/agent-permissions.test.ts` |
| Importaciones | `prisma/schema.prisma`, `prisma/migrations/20260817110000_add_import_job/migration.sql`, `src/app/api/import/jobs/route.ts` |
| Marketing | `src/lib/marketing/publish.ts`, `src/lib/marketing/publish-results.ts`, `src/lib/marketing/publish-results.test.ts`, `src/app/api/marketing/publish/route.ts` |
| Analytics | `src/app/api/analytics/route.ts`, `src/components/dashboard/analytics-view.tsx` |
| Eventos CRM | `src/lib/engine/durable-events.ts`, `src/lib/engine/durable-events.test.ts`, `src/app/api/deals/route.ts` |
| Producción y calidad | `package.json`, `src/middleware.ts` → `src/proxy.ts`, `src/app/api/debug/system/route.ts`, `vitest.config.ts`, `src/lib/ai/__tests__/humanizer.test.ts`, `.env.example` |

## Commits de la rama

| Commit | Descripción |
|---|---|
| `0a8e928` | Ejecutar acciones de automatización mediante ejecutor compartido. |
| `8ae114a` | Hacer single-consumer el procesamiento de follow-ups. |
| `9bccabd` | Aplicar allow-lists efectivas de herramientas para agentes. |
| `6baa39c` | Persistir historial de trabajos de importación. |
| `ff3ec01` | Reportar resultados de publicación de Marketing. |
| `403a6c8` | Etiquetar snapshots de Analytics. |
| `3bd3f09` | Persistir eventos de cambio de etapa de Deals. |
| `4df4169` | Endurecer el build de producción de Next. |
| `11b4de8` | Estabilizar la aserción aleatoria heredada de humanización. |
| `4f381a1` | Alinear el entorno de Vitest con Prisma y autenticación. |
| `7c019d2` | Documentar defaults seguros de runtime. |

## Validación ejecutada

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores**. |
| `npx vitest run --reporter=dot` | **45 archivos y 465 pruebas aprobadas**. |
| `git diff --check` | **Sin errores de whitespace**. |
| `npm run build` | **Build de producción completado** con Prisma generado y Webpack. |
| Diagnóstico aislado por archivo Vitest | **45/45 archivos aprobados**. |

La prueba heredada `getRandomDelay` en `humanizer.test.ts` era probabilística: una bonificación de longitud podía ser superada por la varianza aleatoria. No se ocultó ni se excluyó. Se corrigió el test para controlar `Math.random` durante la aserción, preservando la cobertura del comportamiento y eliminando el falso negativo. La suite final pasó con 465/465 pruebas.

Durante los tests que inicializan Prisma se observan avisos de conexión contra un endpoint MySQL local de prueba no disponible. No son fallos de Vitest ni conexiones a producción; reflejan que esos tests unitarios no levantan una base de datos. El proveedor real configurado en el schema sigue siendo MySQL.

## Riesgos pendientes antes de producción

El riesgo principal de despliegue es la incompatibilidad entre el proveedor declarado en `prisma/schema.prisma` —MySQL— y cualquier proyecto Supabase PostgreSQL que se pretenda utilizar como base de datos. No debe ejecutarse una migración contra Supabase ni configurarse `DATABASE_URL` de PostgreSQL hasta completar una migración formal del schema, revisar tipos Prisma, regenerar todas las migraciones y validar los cambios en un entorno aislado.

La migración `add_import_job` fue escrita para MySQL porque ese es el proveedor actual del repositorio. Debe aplicarse únicamente a una base MySQL compatible. Si el destino definitivo es Supabase, la migración debe convertirse de forma controlada antes del despliegue, no mediante una sustitución manual de la URL.

El worker de follow-ups requiere que Vercel o el entorno objetivo invoque de forma periódica el endpoint protegido del worker mediante `WORKER_KEY`. El cron de alertas ya no debe procesar tareas de follow-up; cualquier configuración que siga llamando solo al cron antiguo dejará tareas pendientes sin ejecutar.

El publicador de Marketing aún depende de que cada proveedor esté correctamente conectado y autorizado. El nuevo contrato evita falsos positivos, pero no puede fabricar una confirmación cuando faltan credenciales o permisos de un canal.

## Checklist de despliegue seguro

Antes de un despliegue productivo se debe confirmar el proyecto Vercel correcto, el entorno de base de datos compatible con MySQL, la presencia de `DATABASE_URL`, `NEXTAUTH_SECRET` de longitud suficiente, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` y `WORKER_KEY`, además de las credenciales de los proveedores realmente usados. `SEED_ENABLED`, `DEMO_MODE` y `NEXUS_ENABLED` deben permanecer en `false` en producción.

La rama debe desplegarse primero como Preview. Después de validar login, aislamiento multi-tenant, automatización manual, claim de follow-up, permisos de Agent Factory, importaciones, Analytics y publicación por canal, se puede promover a producción. Las migraciones deben ejecutarse con el procedimiento del proveedor de base de datos y con respaldo previo; este trabajo no ejecutó migraciones externas ni modificó datos.

## Estado de entrega

El código está subido a GitHub en la rama `audit/functional-connectivity-fixes-2026-08-17` y el Pull Request **#4** está abierto contra `audit/import-valiautoflow-2026-08-17`. El despliegue productivo queda condicionado a resolver la compatibilidad MySQL/PostgreSQL y a confirmar las variables de entorno del proyecto Vercel.

Se intentó un Preview aislado. La carga directa fue rechazada por el límite de Vercel de 300 archivos; el repositorio contiene 909 archivos rastreados necesarios para el árbol completo. También se solicitó enlazar un proyecto Vercel separado al repositorio corregido, pero el proyecto devuelto no apareció posteriormente en el inventario del equipo y las consultas de lectura devolvieron 404/403. Por ello no se declara un Preview como exitoso y no se modificó el proyecto productivo existente, que está enlazado a otro repositorio.

El siguiente paso seguro es corregir la visibilidad/permisos de la integración Vercel del equipo o enlazar manualmente el proyecto Preview al repositorio `jvegahdz24-beep/Vali`; después, un nuevo push de la rama debe generar el Preview. No se debe promover a producción hasta validar ese Preview y resolver la compatibilidad MySQL/PostgreSQL.

**Autor:** Manus AI
