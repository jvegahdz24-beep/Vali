// ═══════════════════════════════════════════════════════════════
// Instrumentación del servidor (Next la carga una vez al arrancar).
// Guardián de proceso: los streams SSE (Copiloto en vivo, Event Bus)
// disparan "TypeError: Invalid state: ReadableStream is already closed"
// dentro de Next cuando el navegador corta a media transmisión — era un
// uncaughtException que TUMBABA el proceso completo (visto en producción
// 2026-07-14: PM2 perdió el proceso y quedó un huérfano sirviendo un
// build viejo). Ese error es inofensivo: se ignora. Cualquier otro
// uncaught mantiene la semántica original (log + salir para que PM2
// reinicie limpio).
// ═══════════════════════════════════════════════════════════════

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.on('uncaughtException', (err: unknown) => {
      const e = err as { code?: string; message?: string } | undefined
      const msg = String(e?.message || err || '')
      if (e?.code === 'ERR_INVALID_STATE' && msg.includes('ReadableStream')) {
        console.warn('[Guard] Stream SSE cerrado por el cliente a media transmisión (ignorado)')
        return
      }
      console.error('[Guard] uncaughtException fatal:', err)
      process.exit(1)
    })
    process.on('unhandledRejection', (err: unknown) => {
      const e = err as { code?: string; message?: string } | undefined
      const msg = String(e?.message || err || '')
      if (e?.code === 'ERR_INVALID_STATE' && msg.includes('ReadableStream')) {
        console.warn('[Guard] Stream SSE cerrado por el cliente (rejection ignorada)')
        return
      }
      // Mantener el comportamiento por defecto de solo loguear rejections.
      console.error('[Guard] unhandledRejection:', err)
    })
  }
}
