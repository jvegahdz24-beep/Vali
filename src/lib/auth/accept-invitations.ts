// ═══════════════════════════════════════════════════════════════
// Auto-aceptación de invitaciones pendientes por email.
// Se llama en CADA punto donde un usuario completa autenticación
// (login, signup por email, Google OAuth) para que unirse a un equipo
// NUNCA dependa de volver a la página /accept-invite (que se rompía en
// el flujo de Google OAuth: no arrastra el callbackUrl → la invitación
// quedaba huérfana y el usuario terminaba con su propio workspace).
// Reportado por Jhon 2026-07-05.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

/**
 * Acepta todas las invitaciones PENDIENTES (no aceptadas, no expiradas) cuyo
 * email coincide con el del usuario. Crea la membresía en cada workspace y
 * marca la invitación como aceptada. Idempotente y tolerante a fallos: si algo
 * falla NO rompe el login (devuelve lo que sí pudo unir).
 *
 * @returns lista de { workspaceId, role } a los que se unió (para redirección opcional)
 */
export async function acceptPendingInvitations(
  userId: string,
  email: string
): Promise<{ workspaceId: string; role: string }[]> {
  const joined: { workspaceId: string; role: string }[] = []
  try {
    const now = new Date()
    // MySQL usa colación case-insensitive por defecto → email = coincide sin importar mayúsculas.
    const pending = await db.invitation.findMany({
      where: { email, acceptedAt: null, expiresAt: { gt: now } },
      select: { id: true, workspaceId: true, role: true },
    })
    for (const inv of pending) {
      try {
        // No degradar una membresía existente (update vacío): solo unir si falta.
        await db.workspaceMember.upsert({
          where: { userId_workspaceId: { userId, workspaceId: inv.workspaceId } },
          create: { userId, workspaceId: inv.workspaceId, role: inv.role },
          update: {},
        })
        await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: now } })
        joined.push({ workspaceId: inv.workspaceId, role: inv.role })
      } catch (e) {
        console.warn('[acceptPendingInvitations] fallo al aceptar invitación', inv.id, e instanceof Error ? e.message : e)
      }
    }
  } catch (e) {
    console.warn('[acceptPendingInvitations] error general (no crítico):', e instanceof Error ? e.message : e)
  }
  return joined
}
