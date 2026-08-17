# ValiAutoFlow — Documentación Técnica: Guía de Operación

> Versión: 1.0 · Última actualización: 2026-08-03
> Complementa a [ARQUITECTURA.md](./ARQUITECTURA.md) y [DESPLIEGUE.md](./DESPLIEGUE.md).

Guía para operar, monitorear y diagnosticar el sistema en producción día a día.

---

## 1. Control del servicio

```powershell
C:\tools\nssm.exe status  amadsite_s704ag     # estado (SERVICE_RUNNING / STOPPED)
C:\tools\nssm.exe restart amadsite_s704ag     # reinicio (usa esto para aplicar .env de servidor)
C:\tools\nssm.exe stop    amadsite_s704ag
C:\tools\nssm.exe start   amadsite_s704ag
```

Comprobación rápida de salud:
```powershell
Invoke-WebRequest -Uri 'https://valiautoflow.com/login' -UseBasicParsing -TimeoutSec 20 |
  Select-Object -ExpandProperty StatusCode    # 200 = sano
```

- **200** en `/login` → app arriba.
- **502/503** → la app no responde (servicio caído, build roto o aún arrancando ~40s).

---

## 2. Logs

| Log | Ruta | Contenido |
|---|---|---|
| Aplicación | `C:\Hosting\s704ag\.amad-service.log` | stdout/stderr de Next: conexión WhatsApp, procesamiento de mensajes, IA, errores. |
| Crons | `C:\Hosting\s704ag\.cron-logs\<endpoint>.log` | Resultado de cada corrida (automations, follow-ups, etc.). |

Comandos útiles:
```powershell
Get-Content C:\Hosting\s704ag\.amad-service.log -Tail 60                       # últimas líneas
Get-Content C:\Hosting\s704ag\.amad-service.log -Tail 200 | Select-String 'error|Error|failed|Bad MAC'
Get-Content C:\Hosting\s704ag\.cron-logs\automations.log -Tail 10              # crons
```

Señales sanas esperadas en `.amad-service.log`:
- `[WA:<workspace>] ✅ CONNECTED` — WhatsApp conectado por tenant.
- `[WA:<workspace>] Reply sent to <phone> (... chars)` — el bot respondió.
- `[AI] MiniMax ... success` — la IA respondió.

---

## 3. Monitoreo de las automatizaciones (cron)

Cada tarea deja su resultado en `.cron-logs\<endpoint>.log`. Verificar que corren y devuelven `OK 200`:
```powershell
Get-Content C:\Hosting\s704ag\.cron-logs\automations.log -Tail 5   # cada 5 min
Get-Content C:\Hosting\s704ag\.cron-logs\follow-ups.log  -Tail 5   # cada 10 min
```
Un `ERROR — ... refused (localhost:3105)` puntual suele coincidir con un reinicio/deploy; si es **persistente**, la app está caída.

Disparo manual de un cron (para diagnóstico), usando `CRON_SECRET` del `.env`:
```powershell
$s = (Select-String -Path C:\Hosting\s704ag\.env -Pattern '^CRON_SECRET=(.+)$').Matches.Groups[1].Value.Trim()
Invoke-WebRequest -Uri 'http://localhost:3105/api/cron/automations' -Headers @{Authorization="Bearer $s"} -UseBasicParsing
```
La respuesta JSON incluye contadores: `workspacesProcessed`, `leadAutomations.sent`, `calendar.published`, `approvalTimeouts`, etc.

---

## 4. WhatsApp (Baileys) — operación

- Cada tenant se conecta por **QR** desde Configuración → Conexiones. La sesión se guarda en la BD (auth state) y hay un **watchdog** que reconecta cada 45s si se cae.
- Si un número **deja de responder**:
  1. Revisar en el log `STATUS:` y `✅ CONNECTED` para ese `workspaceId`.
  2. Si aparece `Bad MAC` o socket zombi, el sistema mata el socket y reintenta solo; si persiste, reiniciar el servicio.
  3. Verificar que la **IA del bot** no esté pausada (Tablero → "IA del bot") ni la conversación en modo Manual.
- **Trampa conocida:** un proceso node "zombi" ocupando el puerto tras un redeploy. Por eso el despliegue mata los procesos node residuales antes de arrancar (ver DESPLIEGUE §3).

---

## 5. Rendimiento de la base de datos

MySQL `db_s704ag`. Ajustes críticos ya aplicados en `my.ini`:
- `max_allowed_packet = 64M` (evita que sesiones grandes de WhatsApp rompan el guardado).
- `innodb_buffer_pool_size = 512M` y `innodb_flush_log_at_trx_commit = 2` (endpoints pasaron de decenas de segundos a decenas de ms).

Si el servidor "se siente lento", verificar **primero** `innodb_buffer_pool_size`.

---

## 6. Pausar / controlar la IA

- **Global (todo el workspace):** Tablero → tarjeta "IA del bot" → Pausar 1h/3h (se reactiva sola) o Apagar. Estando pausada, los mensajes entrantes **se siguen guardando** en el CRM pero el bot no responde.
- **Una sola conversación:** botón IA/Manual dentro del chat.
- Por lenguaje natural: pedírselo al **Copiloto IA** ("pausa la IA 1 hora").

---

## 7. Respaldos

- **Código:** el repositorio git hace auto-commit periódico (respalda el código y la configuración versionada). El código también está en GitHub.
- **Base de datos (recomendado):** configurar un `mysqldump` **diario** de `db_s704ag` con rotación (p. ej. 7–14 días) mediante una tarea programada. Ejemplo de comando:
  ```powershell
  # (ajustar ruta de mysqldump, usuario/clave desde DATABASE_URL, y carpeta destino)
  & "C:\ruta\a\mysqldump.exe" --single-transaction --routines --triggers `
     -u <USUARIO> -p<CLAVE> db_s704ag | Out-File -Encoding utf8 "D:\backups\db_s704ag_$(Get-Date -Format yyyyMMdd).sql"
  ```
  Guardar los respaldos **fuera** del disco de la app y, de ser posible, en almacenamiento externo (otra unidad o nube).
- **Sesiones de WhatsApp:** viven en la BD (auth state), por lo que el respaldo de la BD también las cubre.

> Estado actual: el respaldo diario dedicado de la BD **debe configurarse** si aún no existe. Ver también el checklist de contrato (Entregables 6.1 #7).

---

## 8. Problemas comunes y solución

| Síntoma | Causa probable | Solución |
|---|---|---|
| Sitio da **502/503** | App caída / build roto / arrancando | Revisar `.amad-service.log`; si el build falló, corregir y redeployar; esperar ~40s tras arrancar. |
| **502** en una acción larga (video, importación grande) | Timeout de Apache (~30s) | Esa acción debe ser asíncrona; para importaciones grandes usar CSV/Excel. |
| El bot **no responde** a un número | IA pausada, conversación en Manual, WhatsApp desconectado | Verificar "IA del bot", modo IA/Manual del chat, y `CONNECTED` en el log. |
| **Imágenes** entrantes no se ven en el inbox | (Resuelto) faltaba ruta de miniatura | Ya corregido; si reaparece, revisar `/api/media/[id]/thumbnail`. |
| Cron marca `ERROR refused (localhost:3105)` | App reiniciando o caída | Puntual = normal en deploy; persistente = levantar el servicio. |
| Publicar en Meta/TikTok falla | Cuenta no conectada / app sin auditar / cuenta no privada (sandbox) | Revisar Configuración → Conexiones; en sandbox de TikTok la cuenta debe ser privada. |
| Login redirige a `localhost` | (Resuelto) redirect absoluto tras proxy | Ya usa Location relativa; si reaparece, revisar `auth/logout` y callbacks. |
| Cambié `.env` y no aplica | No se reinició / es `NEXT_PUBLIC_*` | Reiniciar servicio; si es `NEXT_PUBLIC_*`, rebuild. |

---

## 9. Tareas de mantenimiento recomendadas

- **Diario:** confirmar login 200; ojear `.cron-logs\automations.log` y `follow-ups.log`; confirmar respaldo de BD.
- **Semanal:** revisar `.amad-service.log` por errores repetidos; espacio en disco (los logs y `public/marketing/videos` crecen); estado de las conexiones de cada tenant.
- **Al onboardear un tenant:** WhatsApp por QR, inventario cargado, personalidad del asesor, canales de marketing conectados. Ver [ONBOARDING-AGENCIA.md](./ONBOARDING-AGENCIA.md).
- **Periódico:** rotar el token de GitHub del `git remote`; revisar vencimiento de tokens OAuth (Meta/Google/TikTok/MELI) por tenant.

---

## 10. Contactos y referencias
- Arquitectura del sistema: [ARQUITECTURA.md](./ARQUITECTURA.md)
- Despliegue y recuperación: [DESPLIEGUE.md](./DESPLIEGUE.md)
- Manual de usuario (para el cliente final): dentro del panel, vista **Manual de uso** (con videos guía por módulo).
