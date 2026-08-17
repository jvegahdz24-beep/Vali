// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Audit Log (Section 13: ValiGuard)
// Records every data access for GDPR/compliance traceability
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

export type AuditAction =
  | 'view_contact'
  | 'view_conversation'
  | 'export_csv'
  | 'assign_agent'
  | 'delete_contact'
  | 'bulk_action'
  | 'login'
  | 'login_failed'
  | 'permission_change'

/** Extrae la IP de origen de la petición (respeta proxy/Cloudflare). */
export function getRequestIp(req: Request): string | undefined {
  const h = req.headers
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  )
}

/**
 * Log a data access event to ConsentLog for GDPR traceability.
 * Intentionally non-blocking — errors are swallowed to never break the main flow.
 */
export async function logAudit(opts: {
  workspaceId: string
  userId?: string
  action: AuditAction
  resourceId?: string
  resourceType?: string
  ip?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.consentLog.create({
      data: {
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        action: opts.action,
        resourceId: opts.resourceId,
        resourceType: opts.resourceType,
        ip: opts.ip,
        metadata: JSON.stringify(opts.metadata ?? {}),
      },
    })
  } catch (err) {
    // Audit log failure must never break business logic
    console.error('[logAudit] Failed to write audit entry:', err)
  }
}
