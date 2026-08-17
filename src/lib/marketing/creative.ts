// ═══════════════════════════════════════════════════════════════
// Datos del creativo de marketing para un auto del inventario.
// Toma un CatalogItem (+ su metadata automotriz) y los datos de marca
// del workspace, y arma el objeto que consumen las plantillas (Satori).
// ═══════════════════════════════════════════════════════════════

export interface CarCreative {
  id: string
  title: string
  brand?: string
  model?: string
  version?: string
  year?: string
  price?: number | null
  currency: string
  km?: string
  transmision?: string
  combustible?: string
  carroceria?: string
  ubicacion?: string
  condicion?: string
  category?: string | null
  photo?: string | null // URL ABSOLUTA (Satori la descarga)
  status: string
  // Marca del concesionario
  dealerName: string
  logo?: string | null
  phone?: string | null
  site?: string | null
  accent: string // color de acento de marca
  badge?: string | null
  hideBrand?: boolean // ocultar logo/nombre (sin marca de agua)
}

export interface CreativeOverrides { accent?: string; hideBrand?: boolean; badge?: string | null; headline?: string }

interface CatalogItemLike {
  id: string; name: string; price?: number | null; currency?: string | null
  category?: string | null; imageUrl?: string | null; metadata?: string | null
}
interface WorkspaceLike {
  name: string; logo?: string | null; settings?: string | null
}

const STATUS_BADGE: Record<string, string> = {
  disponible: 'DISPONIBLE', apartado: 'APARTADO', vendido: 'VENDIDO',
}

/** Convierte una ruta de imagen (posiblemente relativa) en URL absoluta. */
export function absoluteUrl(src: string | null | undefined, base: string): string | null {
  if (!src) return null
  const s = String(src).trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^data:/i.test(s)) return s
  return `${base.replace(/\/$/, '')}/${s.replace(/^\//, '')}`
}

const kmText = (km?: string): string | undefined => {
  if (!km) return undefined
  const s = String(km).trim()
  if (!s) return undefined
  return /^\d+$/.test(s) ? `${Number(s).toLocaleString('es-MX')} km` : s
}

export function buildCarCreative(item: CatalogItemLike, ws: WorkspaceLike, baseUrl: string, ov: CreativeOverrides = {}): CarCreative {
  let m: Record<string, unknown> = {}
  try { m = JSON.parse(item.metadata || '{}') } catch { /* */ }
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(ws.settings || '{}') } catch { /* */ }
  // Configuración rápida del negocio (Piloto → "Datos del negocio"):
  // respaldo cuando el auto o el workspace no traen el dato.
  const biz = ((s.marketing as Record<string, unknown>)?.business as Record<string, string>) || {}

  const images = Array.isArray(m.images) ? (m.images as string[]) : []
  const photo = absoluteUrl(images[0] || item.imageUrl || null, baseUrl)
  const status = String(m.status || 'disponible')

  return {
    id: item.id,
    title: item.name,
    brand: (m.marca as string) || undefined,
    model: (m.modelo as string) || undefined,
    version: (m.version as string) || undefined,
    year: (m.year as string) || undefined,
    price: item.price ?? null,
    currency: item.currency || 'MXN',
    km: kmText(m.km as string),
    transmision: (m.transmision as string) || undefined,
    combustible: (m.combustible as string) || undefined,
    carroceria: (m.carroceria as string) || undefined,
    ubicacion: (m.ubicacion as string) || biz.ubicacion || undefined,
    condicion: (m.condicion as string) || undefined,
    category: item.category ?? null,
    photo,
    status,
    dealerName: biz.dealerName || ws.name,
    logo: absoluteUrl(ws.logo, baseUrl),
    phone: biz.phone || (s.phone as string) || (s.whatsappNumber as string) || null,
    site: biz.site || (s.website as string) || (s.site as string) || null,
    accent: ov.accent || (s.brandColor as string) || '#10b981',
    badge: ov.badge !== undefined ? ov.badge : (item.category || STATUS_BADGE[status] || null),
    hideBrand: ov.hideBrand || false,
  }
}

/** Selección determinística de plantilla por id (para variar entre autos). */
export function pickTemplate(id: string, count: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % count
}

export const money = (n?: number | null, currency = 'MXN'): string =>
  n != null ? `$${Number(n).toLocaleString('es-MX')} ${currency}` : 'Consultar'
