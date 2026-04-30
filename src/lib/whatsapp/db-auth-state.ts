// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — DB-Backed WhatsApp Auth State
// Loads credentials from SQLite → tmpdir, saves back on update.
// Survives server restarts in ephemeral filesystems (ChatGLM Space).
// ═══════════════════════════════════════════════════════════════

import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class DbAuthState {
  private workspaceId: string
  private tmpDir: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
    this.tmpDir = path.join(tmpdir(), 'wa-auth-' + workspaceId)
  }

  async load(): Promise<string> {
    await fs.mkdir(this.tmpDir, { recursive: true })
    const record = await prisma.whatsAppAuth.findUnique({
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

  async save(): Promise<void> {
    try {
      const files: Record<string, any> = {}
      const entries = await fs.readdir(this.tmpDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(this.tmpDir, entry.name)
          const content = await fs.readFile(filePath, 'utf-8')
          try { files[entry.name] = JSON.parse(content) } catch { files[entry.name] = content }
        }
      }
      if (Object.keys(files).length === 0) return
      await prisma.whatsAppAuth.upsert({
        where: { workspace: this.workspaceId },
        update: { authData: JSON.stringify(files) },
        create: { workspace: this.workspaceId, authData: JSON.stringify(files) }
      })
      console.log('[DB-AUTH] Guardados', Object.keys(files).length, 'archivos en DB')
    } catch (err) { console.error('[DB-AUTH] Error guardando:', err) }
  }

  async clear(): Promise<void> {
    try {
      await prisma.whatsAppAuth.deleteMany({ where: { workspace: this.workspaceId } })
      await fs.rm(this.tmpDir, { recursive: true, force: true })
      console.log('[DB-AUTH] Credenciales eliminadas')
    } catch (err) { console.error('[DB-AUTH] Error limpiando:', err) }
  }
}
