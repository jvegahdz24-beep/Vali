# ValiAutoFlow — Informe de correcciones de conectividad y preparación de despliegue

**Fecha:** 17 de agosto de 2026
**Rama de entrega:** `production-ready`
**Base de código:** release unificado de seguridad y conectividad de ValiAutoFlow.
**Alcance:** correcciones funcionales P0–P1, endurecimiento del build y validación del despliegue SSH. No se modificó `main`, no se enviaron mensajes externos y no se alteraron datos de producción.

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
| Build | Preparación de producción | `npm run build` ejecuta Prisma, Webpack y `scripts/copy-build-assets.cjs`; el artifact exige `server.js`, `.next/static` y `public` dentro de `.next/standalone/`. |

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
| Producción y calidad | `package.json`, `next.config.ts`, `.github/workflows/ci-cd.yml`, `scripts/copy-build-assets.cjs`, `docs/DESPLIEGUE.md`, `src/middleware.ts` → `src/proxy.ts`, `src/app/api/debug/system/route.ts`, `vitest.config.ts`, `src/lib/ai/__tests__/humanizer.test.ts`, `.env.example` |

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
| `68626a5` | Publicar el artifact standalone requerido por el deploy SSH y hacer obligatorio su upload. |
| `916237e` | Completar el artifact con assets, corregir el layout remoto SSH, añadir health check y documentar la separación Linux/SSH frente a Windows/NSSM. |
| `9179297` | Hacer confiable la ejecución del worker de follow-ups, propagar fallos HTTP y usar el último inbound real con filtros de workspace. |
| `9a9e170` | Evitar conexiones Prisma y bootstrap WhatsApp durante build/tests y fijar `metadataBase` público. |

## Validación ejecutada

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores**. |
| `npx vitest run --reporter=dot` | **45 archivos y 465 pruebas aprobadas**. |
| `git diff --check` | **Sin errores de whitespace**. |
| `npm run build` | **Build de producción completado** con Prisma generado, Webpack, `server.js`, `.next/static` y `public` dentro de `.next/standalone/` (138 MB verificados). |
| CI/CD run `32050356672` | **Lint/typecheck, tests y build aprobados**; el artifact `standalone-build` se subió y descargó correctamente. |
| Job `deploy` del run `32050356672` | **Bloqueado antes de SSH** porque `DEPLOY_SSH_KEY` y `DEPLOY_HOST` llegaron vacíos; no se ejecutó ningún cambio en producción. |
| Diagnóstico aislado por archivo Vitest | **45/45 archivos aprobados**. |
| `node --check` | **Scripts Node válidos**: runner de cron y copier de assets. |
| `npm run lint` | **0 errores y 54 warnings preexistentes**, principalmente reglas de React Hooks y directivas ESLint no utilizadas. |

La prueba heredada `getRandomDelay` en `humanizer.test.ts` era probabilística: una bonificación de longitud podía ser superada por la varianza aleatoria. No se ocultó ni se excluyó. Se corrigió el test para controlar `Math.random` durante la aserción, preservando la cobertura del comportamiento y eliminando el falso negativo. La suite final pasó con 465/465 pruebas.

Durante los tests que inicializan Prisma se observan avisos de conexión contra un endpoint MySQL local de prueba no disponible. No son fallos de Vitest ni conexiones a producción; reflejan que esos tests unitarios no levantan una base de datos. El proveedor real configurado en el schema sigue siendo MySQL.

## Hallazgos forenses adicionales y correcciones aplicadas

La investigación posterior a la primera release confirmó cuatro defectos operativos que podían dejar el sistema parcialmente funcional aunque la suite de pruebas permaneciera verde. El artifact anterior contenía `server.js`, pero el pipeline no copiaba explícitamente `public/` ni `.next/static/`; por ello el servidor podía arrancar sin recursos visuales o chunks estáticos. El build ahora ejecuta un copier multiplataforma que falla si falta cualquiera de los componentes y verifica sus destinos.

El deploy SSH también copiaba el directorio `standalone` como una carpeta anidada, mientras que el runtime esperado por Next.js requiere `server.js` en la raíz del directorio de aplicación. El workflow ahora copia el contenido, configura host/puerto remotos, reinicia PM2 o arranca `server.js` como fallback y comprueba `/api/health` antes de marcar éxito. `DEPLOY_KNOWN_HOSTS` es opcional; si no se proporciona, el workflow obtiene la clave del host mediante `ssh-keyscan`.

El runner de follow-ups de Windows llamaba únicamente al cron de alertas y no al endpoint worker protegido. Ahora la tarea `follow-ups` ejecuta primero el worker con `WORKER_KEY`, después las alertas con `CRON_SECRET`, registra cada resultado y devuelve error cuando una llamada HTTP falla. El runner Node recibió el mismo contrato: los errores ya no quedan absorbidos por `Promise.allSettled`.

El análisis funcional de leads estancados usaba `conversation.lastMessageAt`, que puede corresponder a un mensaje saliente. Se corrigió para seleccionar el último mensaje `inbound` real y se añadieron filtros explícitos de `workspaceId` a las consultas relacionadas. Finalmente, Prisma y WhatsApp dejaron de abrir conexiones o timers durante `next build` y tests; los efectos de runtime se mantienen únicamente cuando se ejecuta el servidor.

## Riesgos pendientes antes de producción

El riesgo principal de despliegue es la incompatibilidad entre el proveedor declarado en `prisma/schema.prisma` —MySQL— y cualquier proyecto Supabase PostgreSQL que se pretenda utilizar como base de datos. No debe ejecutarse una migración contra Supabase ni configurarse `DATABASE_URL` de PostgreSQL hasta completar una migración formal del schema, revisar tipos Prisma, regenerar todas las migraciones y validar los cambios en un entorno aislado.

La migración `add_import_job` fue escrita para MySQL porque ese es el proveedor actual del repositorio. Debe aplicarse únicamente a una base MySQL compatible. Si el destino definitivo es Supabase, la migración debe convertirse de forma controlada antes del despliegue, no mediante una sustitución manual de la URL.

El worker de follow-ups requiere que el entorno objetivo invoque periódicamente el endpoint protegido mediante `WORKER_KEY`. En Windows, `scripts/cron-runner.ps1 -Endpoint follow-ups` ya ejecuta worker y alertas en orden; en Linux/PM2, `scripts/run-cron.mjs` mantiene el mismo contrato. Debe existir una sola agenda activa para evitar duplicación.

El publicador de Marketing aún depende de que cada proveedor esté correctamente conectado y autorizado. El nuevo contrato evita falsos positivos, pero no puede fabricar una confirmación cuando faltan credenciales o permisos de un canal.

El pipeline de deploy ya genera y descarga correctamente el artifact standalone, pero el job SSH permanece bloqueado por la ausencia de los secretos de repositorio `DEPLOY_SSH_KEY` y `DEPLOY_HOST`. El log comprobado mostró ambos valores vacíos y falló antes de abrir la conexión; por tanto, no existe evidencia de conexión ni de modificación del servidor productivo. Además, la guía vigente describe un servidor Windows/NSSM, mientras que el workflow SSH presupone un host POSIX; deben elegirse y configurar explícitamente ambas rutas, no mezclarlas.

## Checklist de despliegue seguro

Antes de reintentar el deploy SSH se deben configurar en GitHub Actions los secretos `DEPLOY_SSH_KEY` —clave privada del usuario de despliegue— y `DEPLOY_HOST` —destino en formato `usuario@host`—. Se recomienda añadir `DEPLOY_KNOWN_HOSTS`; si se omite, el workflow usa `ssh-keyscan`. Las variables opcionales `DEPLOY_REMOTE_DIR` y `DEPLOY_PORT` permiten adaptar el host sin editar el workflow. También deben existir en el servidor el directorio destino, Node.js compatible, `curl` y `pm2` —o un mecanismo equivalente para el arranque inicial—.

Antes de reiniciar la aplicación, el administrador del servidor debe ejecutar `prisma migrate deploy` contra una base MySQL compatible, con respaldo previo y revisión del estado de migraciones. El workflow actual no automatiza esa operación. También deben confirmarse `DATABASE_URL`, `NEXTAUTH_SECRET` de longitud suficiente, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` y `WORKER_KEY`, además de las credenciales de los proveedores realmente usados. `SEED_ENABLED`, `DEMO_MODE` y `NEXUS_ENABLED` deben permanecer en `false` en producción.

Después de habilitar los secretos, se debe relanzar el workflow y validar login, aislamiento multi-tenant, automatización manual, claim de follow-up, permisos de Agent Factory, importaciones, Analytics y publicación por canal. Este trabajo no ejecutó migraciones externas, no abrió una sesión SSH y no modificó datos de producción.

## Estado de entrega

El código corregido está subido a GitHub en la rama `production-ready`; el Pull Request **#4** ya fue integrado en la línea de trabajo y la rama activa de despliegue es la release unificada. El run CI/CD `32050356672`, disparado por el commit `68626a5`, terminó con lint/typecheck, 465 pruebas y build aprobados. El artifact `standalone-build` se generó, se subió y se descargó correctamente en el job deploy.

El despliegue productivo **no se completó**. El job `deploy` falló antes de abrir SSH porque los secretos `DEPLOY_SSH_KEY` y `DEPLOY_HOST` no están configurados —o no son visibles para este workflow— en el repositorio. El fallo no demuestra un problema del código ni del artifact y no se realizaron cambios en el servidor productivo.

El siguiente paso manual para Jonathan es configurar los secretos de Actions, confirmar si el destino es un host Linux/SSH o el servidor Windows/NSSM documentado, preparar el usuario y directorio remotos, y ejecutar la migración MySQL pendiente de forma controlada. Después debe relanzarse el workflow y realizar las pruebas de humo funcionales antes de considerar la release desplegada. La alternativa Vercel no se utilizó porque el proyecto existente está enlazado a otro repositorio y la aplicación mantiene un schema Prisma MySQL; migrar a Supabase PostgreSQL requeriría un proyecto técnico separado, no un cambio de URL.

**Autor:** Manus AI
