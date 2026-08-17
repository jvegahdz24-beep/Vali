// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — DB-Backed WhatsApp Auth State
// Loads credentials from SQLite → tmpdir, saves back on update.
// Survives server restarts in ephemeral filesystems (ChatGLM Space).
// ═══════════════════════════════════════════════════════════════

import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'
import { db } from '@/lib/db'

// Retry helper kept for an extra safety layer on auth saves.
// Global retry is already handled in db.ts via $extends — this
// wrapper is intentionally lightweight: no $disconnect() call so
// the shared singleton pool is never disrupted under concurrent
// workspace saves.
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 300): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (err: any) {
      lastErr = err
      const isTransient = err?.code === 'P1017' || err?.code === 'P1001' || err?.code === 'P1008'
      if (!isTransient || i === retries - 1) throw err
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

export class DbAuthState {
  private workspaceId: string
  private tmpDir: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
    this.tmpDir = path.join(tmpdir(), 'wa-auth-' + workspaceId)
  }

  async load(): Promise<string> {
    await fs.mkdir(this.tmpDir, { recursive: true })
    // Si ya hay credenciales LOCALES, son más nuevas que la copia de la BD
    // (la BD se guarda con retraso). Restaurar desde BD encima de sesiones
    // vivas hace ROLLBACK de los contadores Signal → "Bad MAC" → mensajes
    // indescifrables/perdidos. La BD solo se usa en frío (tmpdir vacío).
    try {
      await fs.access(path.join(this.tmpDir, 'creds.json'))
      return this.tmpDir
    } catch { /* no hay copia local — restaurar desde BD */ }
    const record = await db.whatsAppAuth.findUnique({
      where: { workspace: this.workspaceId }
    })
    if (record?.authData) {
      try {
        const files: Record<string, any> = JSON.parse(record.authData)
        for (const [filename, data] of Object.entries(files)) {
          const filePath = path.join(this.tmpDir, filename)
          await fs.writeFile(filePath, JSON.stringify(data))
        }
        console.log('[DB-AUTH] Cargados', Object.keys(files).length, 'archivos desde DB')
      } catch (err) {
        console.error('[DB-AUTH] Error cargando:', err)
      }
    } else {
      console.log('[DB-AUTH] Sin credenciales en DB — se necesita QR')
    }
    return this.tmpDir
  }

  // Debounce: creds.update dispara en ráfagas (cada mensaje rota llaves) y cada
  // guardado serializa >16k archivos a un solo blob MySQL — martillear eso en
  // cada evento congelaba el proceso y alimentaba el ciclo de reconexiones.
  // Se guarda como mucho una vez por minuto (con guardado pendiente al final).
  private _lastSaveAt = 0
  private _saveTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly SAVE_MIN_INTERVAL_MS = 60_000

  async save(): Promise<void> {
    const since = Date.now() - this._lastSaveAt
    if (since < DbAuthState.SAVE_MIN_INTERVAL_MS) {
      if (!this._saveTimer) {
        this._saveTimer = setTimeout(() => {
          this._saveTimer = null
          this.saveNow().catch((err) => console.error('[DB-AUTH] Error en guardado diferido:', err))
        }, DbAuthState.SAVE_MIN_INTERVAL_MS - since)
        if (typeof (this._saveTimer as any).unref === 'function') (this._saveTimer as any).unref()
      }
      return
    }
    await this.saveNow()
  }

  private async saveNow(): Promise<void> {
    this._lastSaveAt = Date.now()
    try {
      const files: Record<string, any> = {}
      const entries = await fs.readdir(this.tmpDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(this.tmpDir, entry.name)
          try {
            const content = await fs.readFile(filePath, 'utf-8')
            try { files[entry.name] = JSON.parse(content) } catch { files[entry.name] = content }
          } catch (err: any) {
            // Baileys may delete a pre-key file between readdir and readFile (TOCTOU race)
            if (err.code === 'ENOENT') continue
            throw err
          }
        }
      }
      if (Object.keys(files).length === 0) return
      await withRetry(() => db.whatsAppAuth.upsert({
        where: { workspace: this.workspaceId },
        update: { authData: JSON.stringify(files) },
        create: { workspace: this.workspaceId, authData: JSON.stringify(files) },
      }))
      console.log('[DB-AUTH] Guardados', Object.keys(files).length, 'archivos en DB')
    } catch (err) { console.error('[DB-AUTH] Error guardando:', err) }
  }

  async clear(): Promise<void> {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
    try {
      await db.whatsAppAuth.deleteMany({ where: { workspace: this.workspaceId } })
      await fs.rm(this.tmpDir, { recursive: true, force: true })
      console.log('[DB-AUTH] Credenciales eliminadas')
    } catch (err) { console.error('[DB-AUTH] Error limpiando:', err) }
  }
}
