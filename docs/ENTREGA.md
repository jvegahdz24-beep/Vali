# ValiAutoFlow — Paquete de Documentación Técnica

> Fecha de preparación: 2026-08-03
> Sistema: ValiAutoFlow (CRM de ventas con IA, multi-tenant) — https://valiautoflow.com

## Contenido de este paquete

Este ZIP contiene la **documentación técnica completa** del sistema, en formato Markdown (legible en cualquier editor de texto, GitHub, o convertible a PDF/Word):

| Archivo | Descripción |
|---|---|
| `README.md` | Índice general de la documentación. |
| `ARQUITECTURA.md` | Arquitectura del sistema: stack tecnológico, diagramas, estructura del proyecto, modelo multi-tenant, pipeline de IA, canales de comunicación, módulo de marketing, automatizaciones, seguridad, integraciones y modelo de datos (73 modelos). |
| `DESPLIEGUE.md` | Instrucciones de despliegue: entorno de producción, despliegue paso a paso, cambios de configuración y esquema, recuperación desde cero, CI/CD y checklist. |
| `OPERACION.md` | Guía de operación: control del servicio, logs, monitoreo, respaldos, problemas comunes y mantenimiento. |
| `ONBOARDING-AGENCIA.md` | Alta y puesta en marcha de una agencia (tenant). |

## Notas
- La documentación describe el sistema **tal como está desplegado en producción** (Next.js 16, MySQL, servicio NSSM, Apache, Cloudflare, IA MiniMax).
- El **manual de usuario final** (no técnico) está integrado dentro del propio panel, en la vista **"Manual de uso"**: índice navegable, capturas reales, **videos guía por módulo** (Full HD) y tour interactivo.

---
ValiAutoFlow · Documentación técnica · v1.0
