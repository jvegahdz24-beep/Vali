# ValiAutoFlow — Auditoría forense de seguridad y calidad

**Fecha:** 17 de agosto de 2026

**Autor:** Manus AI

**Repositorio:** `jvegahdz24-beep/Vali`

**Rama:** `audit/import-valiautoflow-2026-08-17`
**Estado:** cambios aplicados localmente, verificados y listos para commit y Pull Request; no fusionados a `main`.

> **Conclusión ejecutiva.** La auditoría confirmó varias superficies P0/P1 que podían permitir acceso no autorizado entre workspaces, exposición de trazas internas, ejecución de operaciones administrativas y fallos funcionales silenciosos. Las superficies críticas identificadas fueron corregidas o cerradas por defecto en la rama auditada. El código pasa TypeScript y la suite completa de Vitest en el entorno local. El principal riesgo residual es de arquitectura: partes del subsistema Nexus y algunos modelos históricos no están respaldados por `prisma/schema.prisma`; por eso se mantienen aislados mediante feature flags y una frontera de compatibilidad tipada, no se presentan como funcionalidad persistente disponible.

## 1. Alcance, método y límites

Se revisaron rutas App Router, middleware, autorización, aislamiento multi-tenant, webhooks, OAuth, sesiones WhatsApp efímeras, event bus, orquestador, automatizaciones CRM, workers, correo, logging, Telegram, analytics, memoria y contratos de tipos. La evidencia se obtuvo de la rama de auditoría y de los registros locales de pruebas; no se enviaron mensajes, no se realizaron pagos, no se modificaron datos de `valiautoflow.com` y no se utilizó producción como fixture.

El análisis fue estático y dinámico sobre la copia local. La suite confirma comportamiento del código bajo mocks y configuración de prueba, pero no sustituye una validación posterior con una base de datos de staging, credenciales de sandbox de Meta/Stripe/Google/Telegram, Redis y despliegue multi-réplica.

| Área | Evidencia principal | Resultado |
|---|---|---|
| Compilación | `tsc-final.log` | TypeScript terminó con estado 0 |
| Pruebas | `vitest-full-final3.log` | 41 suites y 449 casos aprobados |
| Pruebas afectadas | `affected-round6.log` | Suites de timeline y processor aprobadas |
| Integridad del diff | `git diff --check` | Sin errores de whitespace |
| Producción | Restricción operativa | Sin mensajes ni escrituras realizadas |

## 2. Matriz ejecutiva de riesgo

| ID | Superficie | Riesgo confirmado | Estado en esta rama | Prioridad posterior |
|---|---|---|---|---|
| F-001 | Orquestador | Endpoint sin autenticación, límites ni respuesta mínima | Corregido | P0 cerrado; validar en staging |
| F-002 | Contexto/memoria | Posible lectura o escritura fuera del workspace | Cerrado por ownership y gate Nexus | P0 cerrado técnicamente; migración pendiente |
| F-003 | Sesiones efímeras | IDOR y envío externo usando una sesión ajena | Corregido | P0 cerrado; prueba de integración pendiente |
| F-004 | Seed y demo login | Provisionamiento y autenticación con controles débiles o credenciales por defecto | Cerrado por defecto | P0 cerrado; revisar operación de staging |
| F-005 | OAuth Google Calendar | `state` manipulable, sin firma, nonce ni expiración | Corregido | P1 cerrado; validar callback real |
| F-006 | Webhook Meta | Ausencia de autenticación HMAC en Messenger/Instagram | Corregido | P1 cerrado; activar secreto en staging |
| F-007 | Webhooks y respuestas | Filtración de texto de IA, IDs y routing interno | Corregido | P1 cerrado |
| F-008 | Event bus/SSE | Contrato roto, nombres legacy y API de eventos expuesta | Corregido o deshabilitado | P1 cerrado en proceso-local; persistencia pendiente |
| F-009 | Cron briefing | Secreto débil o duplicación de envíos | Endurecido | P1; requiere lock distribuido en multi-réplica |
| F-010 | Nexus/Prisma | Código usa modelos que no existen en el schema | Aislado y documentado | P1/P2; migración de diseño pendiente |
| F-011 | Telegram | Consultas contra modelo inexistente y estado no respaldado | Migrado a contratos existentes | P1 cerrado en compilación; revisar staging |
| F-012 | Build/dependencias | Imports de colas sin dependencias declaradas | Corregido | P1 cerrado |
| F-013 | RBAC | Owner de workspace podía abrir vistas administrativas/desarrollador | Corregido | P1 cerrado |
| F-014 | CRM/catalogo | Test permitía derivar precio desde tags generados por IA | Test alineado con fuente validada | P2 cerrado en esta rama |

## 3. Hallazgos y correcciones principales

### 3.1 Orquestador: autenticación, tenant scope, límites y redacción

La ruta `src/app/api/orchestrator/chat/route.ts` aceptaba parámetros sensibles desde el caller sin garantizar sesión, pertenencia del workspace, permiso de agente ni límites razonables. También podía devolver trazas internas del orquestador. La corrección ahora exige autenticación, comprueba que el workspace y el contacto pertenecen al actor autorizado, aplica RBAC, limita el payload y usa rate limiting. La respuesta pública se reduce a los campos comerciales necesarios; no expone razonamiento, eventos internos, contexto de perfil, tokens, modelo ni latencias de depuración.

El procesador central `src/lib/ai/message-processor.ts` normaliza el canal a la representación canónica en minúsculas y rechaza valores no soportados antes de consultar o escribir datos. Esto corrige el defecto funcional en el que el webhook oficial de Meta enviaba `WHATSAPP` mientras los tipos y filtros del sistema esperaban `whatsapp`.

### 3.2 Aislamiento de memoria y Nexus

El orquestador podía intentar leer o persistir memoria Nexus con un scope incompleto. La corrección agrega un gate estricto: si `NEXUS_ENABLED` no es exactamente `true`, el orquestador no lee ni escribe delegaciones Nexus. Las rutas `/api/nexus` también quedan cerradas por el middleware mientras el subsistema no tenga una migración validada.

La frontera de compatibilidad de `src/lib/nexus-prisma-compat.ts` existe únicamente para que TypeScript pueda analizar módulos históricos. No crea tablas, no ejecuta migraciones y no convierte las delegaciones ausentes en almacenamiento funcional. Esta distinción es deliberada: compilar no significa que Nexus esté listo para producción.

### 3.3 Sesiones WhatsApp efímeras

Las rutas `connect`, `status`, `send` y `delete` ahora exigen sesión autenticada, membership del workspace y ownership de la sesión. Cada sesión mantiene `ownerId` y `workspaceId`; las búsquedas, el conteo, `anyConnected` y `destroyAll` respetan el mismo scope. Se añadieron límites de cantidad de sesiones, timeout, longitud de mensaje y formato del destinatario.

La ruta de envío verifica primero la conversación y el contacto dentro del workspace antes de ejecutar el envío externo. Los fallbacks de tool-calling y marketing reciben el workspace explícitamente, evitando que una automatización de un tenant seleccione una sesión conectada por otro tenant.

### 3.4 Webhooks Meta y WhatsApp

`src/app/api/webhooks/meta/route.ts` ahora valida `x-hub-signature-256` sobre el cuerpo crudo mediante HMAC-SHA256 y `META_APP_SECRET`, con límite de tamaño y rechazo seguro si el secreto no está configurado. El challenge GET continúa validándose contra la configuración de `MetaChannel`.

El webhook de WhatsApp ya no devuelve texto generado por IA, IDs de contacto, metadata de routing ni detalles de estrategia. Devuelve únicamente un acuse mínimo. La superficie GET informativa queda cerrada con 404. El webhook oficial Meta de WhatsApp usa ahora el canal canónico `whatsapp` y el procesador central conserva una normalización defensiva adicional.

### 3.5 Seed y demo login

`/api/seed` quedó cerrado salvo cuando `SEED_ENABLED=true` y el request presenta el PIN administrativo configurado mediante variable de entorno. La comparación del PIN es resistente a timing attacks, las credenciales proceden del entorno y no existen contraseñas o correos hardcodeados. GET devuelve 404.

`/api/auth/demo-login` devuelve 404 cuando la demo no está configurada. Cuando se habilita, exige `DEMO_MODE=true`, token de acceso configurado y credenciales de entorno con contraseña mínima. Se eliminaron los valores por defecto inseguros.

### 3.6 OAuth Google Calendar

El estado OAuth de Google Calendar dejó de ser un identificador crudo. Ahora usa payload firmado, expiración de diez minutos, nonce aleatorio y cookie HttpOnly de correlación. El callback verifica firma, expiración, nonce y binding antes de guardar tokens. La medida reduce manipulación de `state`, replay y asociación de tokens con otro actor.

### 3.7 Stripe y webhooks de pago

El webhook de billing conserva la verificación de firma sobre el cuerpo crudo y ahora reduce la respuesta pública a un acuse mínimo. La lógica de suscripción no se amplió con una tabla inventada: la deduplicación durable de eventos Stripe sigue siendo una tarea explícita para staging y una migración posterior si el modelo actual no permite una clave única atómica para `event.id`.

### 3.8 Cron de briefing

El cron exige secreto configurado también fuera de producción, lo compara en tiempo constante, limita la ejecución y devuelve una respuesta agregada sin IDs de tenants. Se añadió lock local y un claim sobre settings para reducir duplicaciones. En despliegues multi-réplica debe sustituirse el lock en memoria por una operación distribuida en base de datos o Redis antes de prometer exactamente una ejecución.

### 3.9 Event bus y SSE

`src/lib/event-bus.ts` fue reemplazado por un contrato tipado con envelope, wildcard, middleware, DLQ con backoff y singleton compatible. Los consumidores SSE y el dashboard se alinearon a eventos canónicos como `deal.stage_changed`, `automation.triggered`, `message.received` y `contact.updated`. Se eliminaron publicaciones legacy sin contrato activo.

La API de eventos del sistema dejó de consultar modelos o métodos inexistentes. Ahora exige autenticación, membership y capacidad RBAC de diagnóstico. GET expone estadísticas mínimas de proceso; POST devuelve 501 explícito mientras no exista almacenamiento durable y un replay auditado. La solución evita falsa sensación de durabilidad: el bus sigue siendo process-local.

### 3.10 RBAC y dashboard

La capacidad de abrir vistas `developer` y `admin` quedó limitada a superadministración global. Un owner o administrador de workspace no puede elevarse desde `canViewModule` para entrar a superficies administrativas de plataforma. El dashboard también se adaptó al contrato de vistas real, evitando que una vista conocida por el layout llegue a un shell que no la puede renderizar.

### 3.11 Telegram, workers y dependencias

`telegram-control` dejó de consultar `db.telegramBot`, un modelo ausente del schema actual. La configuración del bot se resuelve desde `Workspace`, el estado de pausa desde settings y el chat del propietario desde el contrato existente de usuario. `cmdFollowups` usa consultas explícitas a `Contact` y `FollowUpRule` con scope de workspace.

El worker de follow-ups dejó de depender de relaciones `include` que no existen y carga las entidades mediante consultas compatibles con el schema. Las dependencias utilizadas por el código, `bullmq` e `ioredis`, quedaron declaradas en `package.json` y el lockfile.

### 3.12 CRM, memoria, correo y calidad de pruebas

El plan enforcer usa los límites de `PLANS` en lugar de una columna inexistente del workspace. El motor de memoria descarta resultados de ranking que no pertenecen al conjunto cargado, en vez de fabricar objetos incompletos. El correo devuelve resultados estructurados y no lanza excepciones por configuración ausente; también se añadió el flujo de reset de contraseña sin introducir secretos.

La suite de pruebas fue estabilizada sin debilitar producción. Se corrigieron mocks de `AgentRouter`, event bus, Prisma, conexión WhatsApp y API routes; el test de catálogo utiliza `leadProfile.preferredProduct` como fuente validada y no trata tags generados por IA como autoridad de precio.

## 4. Subsistema Nexus: decisión y deuda explícita

La auditoría encontró que el código histórico referencia delegaciones Prisma que no están en `prisma/schema.prisma`, incluyendo agentes, perfiles, memorias, conversaciones, contratos de herramientas y estados cognitivos. Añadir modelos automáticamente habría sido inseguro: no existe evidencia suficiente para inferir relaciones, índices, cascadas, retención, permisos o una migración compatible con los datos reales.

La decisión de esta rama es la opción conservadora:

1. **No se agregan modelos Prisma inventados.**
2. **Se mantiene una frontera TypeScript explícita y documentada.**
3. **Las rutas Nexus permanecen cerradas mediante `NEXUS_ENABLED`.**
4. **El orquestador no lee ni escribe memoria Nexus mientras el flag no esté activado.**
5. **La persistencia de agentes efímeros y analytics no migrados permanece cerrada mediante flags propios.**

Antes de habilitar Nexus se requiere un diseño separado con modelos, migración, revisión de tenant scope, pruebas de retención, índices, autorización de herramientas, estrategia de rollback y validación en staging. El feature flag no debe activarse como solución temporal de despliegue.

## 5. Verificación reproducible

| Comando o artefacto | Resultado |
|---|---|
| `npx tsc --noEmit` | Estado 0; sin diagnósticos TypeScript |
| `npx vitest run` | 41 archivos aprobados; 449 pruebas aprobadas |
| Suites afectadas de IA | Aprobadas después de completar mocks y fixtures |
| `git diff --check` | Sin errores |
| Modificación de producción | No realizada |
| Mensajes o pagos reales | No ejecutados |

Los avisos del entorno local no deben confundirse con fallos de la rama. Vitest muestra advertencias porque la copia de auditoría no tiene una configuración completa de producción: el `DATABASE_URL` local no corresponde al proveedor declarado por el schema, falta un `NEXTAUTH_SECRET` válido, faltan algunas claves de IA y algunos mocks no implementan delegaciones auxiliares. Ninguna de estas advertencias produjo fallos de aserción en la suite final.

## 6. Riesgos residuales antes de producción

| Riesgo residual | Por qué sigue abierto | Criterio de cierre |
|---|---|---|
| Event bus process-local | Se pierde estado al reiniciar y no hay coordinación entre réplicas | Persistencia durable, outbox o broker, replay autenticado y pruebas de orden/idempotencia |
| Lock del cron local | Dos réplicas podrían ejecutar la misma ventana | Lock distribuido con TTL y claim atómico en DB/Redis |
| Idempotencia Stripe | La firma no reemplaza deduplicación persistente | Tabla o entidad con `event.id` único y transacción de aplicación |
| Nexus sin migración | Los modelos no están definidos en Prisma | ADR, schema, migración, pruebas y autorización completas |
| OAuth real | La suite no intercambia códigos con proveedores sandbox | Pruebas de callback con firma, expiración, replay y estado cruzado |
| WhatsApp efímero en memoria | Un reinicio pierde sesiones y un cluster necesita registro compartido | Store distribuido o política operativa explícita de una sola réplica |
| Rate limit en memoria | No coordina réplicas | Redis o gateway con límite por actor/workspace |
| Configuración de entorno | La prueba local no representa secretos ni URLs de staging | `.env` de staging gestionado, rotación y smoke tests sin exponer secretos |
| Whitelist del middleware | La seguridad sigue parcialmente distribuida por handler | Política centralizada por grupos de rutas y tests de matriz de autorización |

## 7. Secuencia recomendada de próximos PR

**PR 1 — Validación de staging y contratos externos.** Ejecutar smoke tests contra sandbox de Meta, Stripe, Google Calendar y Telegram. Verificar firmas, retries, timeouts, replay, idempotencia y respuestas públicas con logs redactados.

**PR 2 — Durabilidad operacional.** Reemplazar locks y rate limits process-local por Redis o base de datos; implementar outbox/event log durable y deduplicación de webhooks Stripe.

**PR 3 — Diseño Nexus.** Publicar un ADR con entidades, relaciones, tenant scope, retención y permisos; después crear schema/migración y activar primero una ruta interna de lectura en staging.

**PR 4 — Reducción de superficie middleware.** Consolidar autorización por grupos de rutas, generar una matriz de endpoint–capacidad–scope y añadir pruebas negativas para cada prefijo sensible.

**PR 5 — Observabilidad segura.** Centralizar logs estructurados, correlation IDs, métricas de errores y alertas sin incluir contenido de mensajes, tokens, identificadores sensibles ni datos de contacto.

## 8. Decisión de despliegue

La rama está técnicamente preparada para revisión y Pull Request, no para fusión automática. La recomendación es **aprobar revisión humana del diff y del PR**, desplegar primero a staging con secretos de sandbox y validar integraciones externas antes de considerar merge a `main`. El subsistema Nexus debe permanecer deshabilitado hasta completar su migración formal.

## Referencias

[1]: https://github.com/jvegahdz24-beep/Vali/tree/audit/import-valiautoflow-2026-08-17 "Rama de auditoría de ValiAutoFlow"
[2]: ./src/app/api/orchestrator/chat/route.ts "Endpoint del orquestador"
[3]: ./src/app/api/whatsapp/ephemeral/send/route.ts "Envío WhatsApp efímero con ownership"
[4]: ./src/app/api/webhooks/meta/route.ts "Webhook Meta con HMAC"
[5]: ./src/lib/event-bus.ts "Contrato del event bus"
[6]: ./src/lib/nexus-prisma-compat.ts "Frontera temporal de modelos no migrados"
[7]: ../ValiAuditForensic/confirmed-findings.md "Registro forense acumulado"
[8]: ../ValiAuditForensic/vitest-full-final3.log "Log de Vitest final"
[9]: ../ValiAuditForensic/tsc-final.log "Log TypeScript final"
