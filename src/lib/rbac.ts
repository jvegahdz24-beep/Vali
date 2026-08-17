// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — RBAC (Role-Based Access Control)
// Fuente única de verdad de qué puede VER y HACER cada rol dentro de
// un workspace. Pura (sin imports de Next/DB) para usarse igual en el
// cliente (ocultar UI) y en el servidor (rechazar APIs).
//
// Roles de workspace (WorkspaceMember.role):
//   owner   — Dueño: control total, incl. facturación y panel avanzado.
//   admin   — Admin: todo menos facturación y panel avanzado.
//   member  — Miembro/Vendedor: CRM operativo, SOLO sus datos asignados.
//   viewer  — Lector: solo lectura.
// El rol GLOBAL de plataforma (User.role === 'superadmin') es aparte y
// ve absolutamente todo; se maneja con `isSuperAdmin`.
// ═══════════════════════════════════════════════════════════════

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer']

export function isWorkspaceRole(x: unknown): x is WorkspaceRole {
  return typeof x === 'string' && (WORKSPACE_ROLES as string[]).includes(x)
}

/** Normaliza cualquier string de rol a un WorkspaceRole conocido (default: viewer, el más restrictivo). */
export function normalizeRole(role: string | null | undefined): WorkspaceRole {
  return isWorkspaceRole(role) ? role : 'viewer'
}

// ─── Capacidades (acciones) ──────────────────────────────────
// Lo que un rol puede HACER, independientemente de la vista.

export type Capability =
  | 'crm.write'        // crear/editar contactos, deals, citas; enviar mensajes; mover pipeline
  | 'crm.viewAll'      // ver TODOS los datos del workspace (si no, solo lo asignado a uno mismo)
  | 'analytics.view'   // ver analíticas y reportes
  | 'agents.manage'    // configurar agentes IA / playground / agent factory
  | 'automations.manage'
  | 'valiguard.view'
  | 'team.manage'      // invitar, cambiar rol, eliminar miembros
  | 'settings.manage'  // editar configuración del workspace
  | 'settings.advanced'// panel de desarrollador / pestaña Avanzado
  | 'billing.manage'   // facturación / suscripción

const ROLE_CAPABILITIES: Record<WorkspaceRole, Capability[]> = {
  owner: [
    'crm.write', 'crm.viewAll', 'analytics.view', 'agents.manage', 'automations.manage',
    'valiguard.view', 'team.manage', 'settings.manage', 'settings.advanced', 'billing.manage',
  ],
  admin: [
    'crm.write', 'crm.viewAll', 'analytics.view', 'agents.manage', 'automations.manage',
    'valiguard.view', 'team.manage', 'settings.manage',
  ],
  // Vendedor: opera el CRM pero SOLO sobre lo asignado a él (sin crm.viewAll).
  member: ['crm.write'],
  // Lector: ve datos y analíticas, no escribe.
  viewer: ['crm.viewAll', 'analytics.view'],
}

export function hasCapability(role: string | null | undefined, cap: Capability): boolean {
  return ROLE_CAPABILITIES[normalizeRole(role)].includes(cap)
}

/** ¿El rol ve TODOS los datos del workspace, o solo lo asignado a su usuario? */
export function canViewAllData(role: string | null | undefined): boolean {
  return hasCapability(role, 'crm.viewAll')
}

// ─── Visibilidad de módulos (vistas del sidebar) ─────────────
// Clave = id de ViewType. Lista = roles que pueden ABRIR esa vista.
// developer/admin quedan vacíos: son exclusivos de superadmin (plataforma).

export const MODULE_ROLES: Record<string, WorkspaceRole[]> = {
  dashboard: ['owner', 'admin', 'member', 'viewer'],
  manual: ['owner', 'admin', 'member', 'viewer'],
  inbox: ['owner', 'admin', 'member', 'viewer'],
  pipeline: ['owner', 'admin', 'member', 'viewer'],
  inventory: ['owner', 'admin', 'member', 'viewer'],
  contacts: ['owner', 'admin', 'member', 'viewer'],
  calendar: ['owner', 'admin', 'member', 'viewer'],
  // Solo lectura para viewer; member NO ve analíticas/reportes.
  analytics: ['owner', 'admin', 'viewer'],
  reports: ['owner', 'admin', 'viewer'],
  // Módulos de administración del workspace.
  agents: ['owner', 'admin'],
  'agent-factory': ['owner', 'admin'],
  gbrain: ['owner', 'admin'],
  playground: ['owner', 'admin'],
  'chat-demo': ['owner', 'admin'],
  marketing: ['owner', 'admin'],
  automations: ['owner', 'admin'],
  valiguard: ['owner', 'admin'],
  meli: ['owner', 'admin'],
  copilot: ['owner', 'admin', 'member'],
  settings: ['owner', 'admin'],
  'settings:whatsapp': ['owner', 'admin'],
  team: ['owner', 'admin'],
  // Panel Desarrollador: el DUEÑO ve el de SU propio workspace. 'admin' de
  // plataforma sigue exclusivo de superadmin.
  developer: ['owner', 'admin'],
  admin: [],
}

/**
 * ¿Puede el usuario abrir esta vista? Superadmin de plataforma ve todo.
 */
export function canViewModule(
  role: string | null | undefined,
  viewId: string,
  opts?: { isSuperAdmin?: boolean },
): boolean {
  if (opts?.isSuperAdmin) return true
  const allowed = MODULE_ROLES[viewId]
  if (!allowed) return false // vista desconocida → denegar por defecto
  return allowed.includes(normalizeRole(role))
}
