import { db } from '@/lib/db'

// Bitácora de Mercado Libre — registra cada acción (y errores) para trazabilidad.
export async function logMeli(workspaceId: string, action: string, opts?: {
  targetType?: string; targetId?: string; status?: 'ok' | 'error'; message?: string; metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.meliLog.create({
      data: {
        workspaceId, action,
        targetType: opts?.targetType ?? null,
        targetId: opts?.targetId ?? null,
        status: opts?.status ?? 'ok',
        message: opts?.message ?? null,
        metadata: JSON.stringify(opts?.metadata ?? {}),
      },
    })
  } catch { /* la bitácora nunca rompe el flujo */ }
}
