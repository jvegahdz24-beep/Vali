# ValiAutoFlow — Documentación Técnica

Documentación técnica del sistema **ValiAutoFlow** (CRM de ventas con IA, multi-tenant) en producción en `https://valiautoflow.com`.

## Índice

| Documento | Contenido |
|---|---|
| [ARQUITECTURA.md](./ARQUITECTURA.md) | **Arquitectura del sistema**: stack real (Next.js 16 / MySQL / NSSM / Apache / Cloudflare), diagramas, estructura del proyecto, modelo multi-tenant, pipeline de IA, canales (WhatsApp/Meta/Telegram), módulo de Marketing, automatizaciones/cron, seguridad, integraciones y modelo de datos. |
| [DESPLIEGUE.md](./DESPLIEGUE.md) | **Instrucciones de despliegue**: entorno de producción, reglas de oro (EPERM, NSSM), despliegue estándar paso a paso, cambios de `.env` y de esquema, assets estáticos, levantar desde cero (recuperación), CI de GitHub Actions y checklist. |
| [OPERACION.md](./OPERACION.md) | **Guía de operación**: control del servicio, logs, monitoreo de crons, operación de WhatsApp, rendimiento de BD, pausar la IA, respaldos, problemas comunes y mantenimiento. |
| [ONBOARDING-AGENCIA.md](./ONBOARDING-AGENCIA.md) | Alta y puesta en marcha de una agencia (tenant). |

## Resumen en una frase

Panel web (Next.js) donde un asesor de IA (MiniMax) atiende WhatsApp y otros canales 24/7 por cada empresa (tenant), con datos aislados, publicando y automatizando marketing multicanal, cobrado con Stripe, servido tras Apache/Cloudflare y mantenido vivo por un servicio de Windows (NSSM) en `C:\Hosting\s704ag`.

> Para el **manual de usuario final** (no técnico), usar la vista **"Manual de uso"** dentro del panel: índice navegable, capturas, videos guía por módulo y tour interactivo.
