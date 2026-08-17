// ═══════════════════════════════════════════════════════════════
// Estatus de inventario + visibilidad (pedido de Jhon 2026-07-28).
//
// El status del auto (disponible/apartado/vendido y los PERSONALIZADOS) vive
// en CatalogItem.metadata.status. Las definiciones de estatus personalizados
// se guardan en Workspace.settings.inventoryStatuses (JSON, SIN migración).
//
// Cada estatus define:
//   • visibleToClient: si el BOT lo puede ofrecer al cliente (además de isActive)
//   • roles: qué roles del panel pueden VER los autos en ese estatus
//            (vacío = todos; Dueño/Admin siempre ven todo)
//
// Módulo PURO (sin imports de servidor) → lo usan tanto el frontend como el
// bot y las APIs.
// ═══════════════════════════════════════════════════════════════

export interface StatusDef {
  key: string
  label: string
  color: string          // hex para el punto/badge
  visibleToClient: boolean
  roles: string[]        // roles del panel que lo ven ([] = todos)
  builtin?: boolean
}

// Estatus de fábrica. 'disponible' lo ve el cliente; 'apartado'/'vendido' NO
// (antes un 'vendido' con isActive=true se seguía ofreciendo — esto lo corrige).
export const BUILTIN_STATUSES: StatusDef[] = [
  { key: 'disponible', label: 'Disponible', color: '#10b981', visibleToClient: true,  roles: [], builtin: true },
  { key: 'apartado',   label: 'Apartado',   color: '#f59e0b', visibleToClient: false, roles: [], builtin: true },
  { key: 'vendido',    label: 'Vendido',    color: '#ef4444', visibleToClient: false, roles: [], builtin: true },
]

const slug = (s: string) => s.toString().trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** Normaliza una definición cruda (de settings o del cliente) a StatusDef. */
export function normalizeStatusDef(raw: unknown): StatusDef | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = String(r.label || '').trim()
  const key = slug(String(r.key || label))
  if (!key || !label) return null
  const roles = Array.isArray(r.roles) ? r.roles.map(String).filter(Boolean) : []
  return {
    key,
    label,
    color: typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#6366f1',
    visibleToClient: r.visibleToClient !== false,
    roles,
  }
}

/** Lee los estatus personalizados guardados en Workspace.settings (JSON string u objeto). */
export function parseCustomStatuses(settings: string | Record<string, unknown> | null | undefined): StatusDef[] {
  let s: Record<string, unknown> = {}
  try { s = typeof settings === 'string' ? JSON.parse(settings || '{}') : (settings || {}) } catch { s = {} }
  const arr = Array.isArray(s.inventoryStatuses) ? s.inventoryStatuses : []
  const out: StatusDef[] = []
  const seen = new Set(BUILTIN_STATUSES.map(b => b.key))
  for (const raw of arr) {
    const def = normalizeStatusDef(raw)
    if (!def || seen.has(def.key)) continue // no puede pisar un builtin ni duplicar
    seen.add(def.key)
    out.push(def)
  }
  return out
}

/** Todos los estatus (fábrica + personalizados) para un workspace. */
export function allStatuses(settings: string | Record<string, unknown> | null | undefined): StatusDef[] {
  return [...BUILTIN_STATUSES, ...parseCustomStatuses(settings)]
}

/** Lee la clave de status de un item (desde su metadata JSON). */
export function statusKeyOf(metadata: string | Record<string, unknown> | null | undefined): string {
  let m: Record<string, unknown> = {}
  try { m = typeof metadata === 'string' ? JSON.parse(metadata || '{}') : (metadata || {}) } catch { m = {} }
  const st = String(m.status || '').trim()
  return st || 'disponible'
}

/** ¿El cliente/bot puede ver un auto con este status? (además de isActive). */
export function isStatusClientVisible(statusKey: string, statuses: StatusDef[]): boolean {
  const def = statuses.find(s => s.key === statusKey)
  return def ? def.visibleToClient : true // status desconocido → no lo ocultamos
}

/** ¿Un rol del panel puede ver autos en este status? Dueño/Admin siempre sí. */
export function roleCanSeeStatus(statusKey: string, role: string | null | undefined, statuses: StatusDef[]): boolean {
  if (role === 'owner' || role === 'admin' || role === 'superadmin') return true
  const def = statuses.find(s => s.key === statusKey)
  if (!def || !def.roles.length) return true // sin restricción → todos
  return def.roles.includes(String(role || ''))
}

/** Conjunto de claves de status OCULTAS al cliente (para filtrar lo que ofrece el bot). */
export function clientHiddenStatusKeys(settings: string | Record<string, unknown> | null | undefined): Set<string> {
  return new Set(allStatuses(settings).filter(s => !s.visibleToClient).map(s => s.key))
}
