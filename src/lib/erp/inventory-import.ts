// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Importación masiva de inventario (autos) con IA.
// Patrón inspirado en cliniodent (escaneo/importación de expedientes):
//  - Archivos por filas (CSV/Excel/JSON-array): la IA mapea los ENCABEZADOS
//    al esquema UNA vez (con una muestra) y el código aplica ese mapeo a TODAS
//    las filas → escala a miles sin gastar IA por fila.
//  - Texto no estructurado (SQL dump / JSON anidado / TXT): la IA extrae el
//    arreglo de vehículos directamente (con tope de tokens).
// Cada registro pasa por normalizeVehicle() que valida y produce `issues`
// (alertas por campo) para que el usuario revise antes de confirmar.
// ═══════════════════════════════════════════════════════════════

import { chatWithAIJson } from '@/lib/ai/providers'

const MAX_ROWS = 5000
const MAX_TEXT_CHARS = 60000

export interface AiOpts { provider?: string; model?: string; apiKey?: string }

export type FieldIssue = { field: string; reason: string; severity: 'error' | 'warn' }

export interface NormalizedVehicle {
  name: string
  price: number | null
  currency: string
  category: string | null // tipo: Nuevo | Seminuevo | Usado
  stock: number | null
  description: string | null
  isActive: boolean
  status: string // disponible | apartado | vendido
  imageUrl: string | null
  metadata: Record<string, unknown> // marca, modelo, year, version, vin, ...
  extra: { etiqueta: string; valor: string }[]
  issues: FieldIssue[]
}

// Campos estructurados destino del mapeo (reales en CatalogItem + los de metadata).
export const KNOWN_FIELDS = [
  'name', 'marca', 'modelo', 'year', 'version', 'vin', 'placas',
  'colorExterior', 'colorInterior', 'km', 'transmision', 'combustible',
  'motor', 'traccion', 'puertas', 'carroceria', 'condicion', 'ubicacion', 'sku',
  'price', 'currency', 'stock', 'category', 'status', 'description', 'imageUrl',
  // Campos de agencia/DMS (formato tipo "INVENTARIO PLAYA"):
  'fechaRecepcion', 'diasStock', 'vendedorAsignado', 'clienteAsignado',
] as const

// Campos que viven en las columnas reales de CatalogItem; el resto van a metadata.
const REAL_COLUMNS = new Set(['name', 'price', 'currency', 'stock', 'category', 'description', 'imageUrl'])
const META_FIELDS = new Set(KNOWN_FIELDS.filter((f) => !REAL_COLUMNS.has(f) && f !== 'status'))
const NUMBER_FIELDS = new Set(['year', 'puertas'])

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function normCategory(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  if (/semi|semin/.test(s)) return 'Seminuevo'
  if (/nuev|new|0\s?km/.test(s)) return 'Nuevo'
  if (/usad|used|seminuev/.test(s)) return 'Usado'
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function normStatus(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  // Códigos de agencia/DMS: IVN=disponible, AVN=apartado/preventa, DEM=demo,
  // VND=vendido, INMOVILIZADA y (UNIDAD) CONTAMINADA como estados especiales.
  if (/inmoviliz/.test(s)) return 'inmovilizada'
  if (/contamin/.test(s)) return 'contaminada'
  if (/^dem\b|demostraci|exhibici/.test(s)) return 'demo'
  if (/^avn\b|apart|reserv|preventa|separad/.test(s)) return 'apartado'
  if (/^vnd\b|vend|sold|entregad/.test(s)) return 'vendido'
  if (/^ivn\b|disponib|libre/.test(s)) return 'disponible'
  return 'disponible'
}
function normTransmision(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/cvt/.test(s)) return 'CVT'
  if (/auto|aut\b|at\b/.test(s)) return 'Automática'
  if (/man|std|estandar|estándar|mt\b/.test(s)) return 'Manual'
  return String(v).trim()
}
function normCombustible(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/dies|diés/.test(s)) return 'Diésel'
  if (/hibr|híbr|hybrid/.test(s)) return 'Híbrido'
  if (/elec|eléc|ev\b/.test(s)) return 'Eléctrico'
  if (/gas|magna|premium|nafta/.test(s)) return 'Gasolina'
  return String(v).trim()
}

async function aiJson<T>(system: string, user: string, opts: AiOpts): Promise<T> {
  const { data } = await chatWithAIJson<T>(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    opts.provider || 'glm',
    opts.model,
    { temperature: 0.1, maxTokens: 4000, tenantApiKey: opts.apiKey, disableThinking: true },
  )
  return data
}

/** La IA decide a qué campo del esquema corresponde cada encabezado del archivo. */
export async function mapHeaders(headers: string[], sample: Record<string, unknown>[], opts: AiOpts): Promise<Record<string, string>> {
  const system = `Eres un asistente de migración de inventario AUTOMOTRIZ. Recibes los ENCABEZADOS de un archivo de autos (de otro sistema/hoja) y filas de muestra. Devuelve SOLO JSON: {"mapping": {"<encabezado>": "<destino>"}}.
"destino" debe ser uno de: ${KNOWN_FIELDS.join(', ')}, "__extra" (dato útil sin campo equivalente → se guarda como extra) o "__ignore" (IDs internos, timestamps, columnas inútiles).
Reglas: marca/make/fabricante→marca; modelo/model→modelo; año/year/modelo-año→year; versión/trim/equipamiento→version; precio/price/costo/valor→price; moneda/currency→currency; kilometraje/km/millaje/mileage/odometro→km; transmisión/caja→transmision; combustible/fuel/motor-combustible→combustible; motor/engine/cilindrada/litros→motor; tracción/drivetrain/4x4/awd→traccion; puertas/doors→puertas; color/exterior→colorExterior; interior→colorInterior; vin/serie/niv→vin; placas/plates/matricula→placas; existencia/stock/cantidad/disponibles→stock; tipo/condición/estado(nuevo,usado,seminuevo)→category; estatus/situación(disponible,apartado,vendido)→status; ubicación/sucursal/lote/agencia→ubicacion; sku/folio/clave/codigo→sku; foto/imagen/url-imagen→imageUrl; nombre/título/descripción-corta→name; notas/descripción/observaciones→description.
NO inventes encabezados que no estén en la lista. Mapea cada encabezado exactamente una vez. Si un encabezado no encaja en ningún campo conocido pero tiene info útil, usa "__extra".`
  const user = `Encabezados: ${JSON.stringify(headers)}\nMuestra (primeras filas): ${JSON.stringify(sample.slice(0, 3))}`
  const out = await aiJson<{ mapping?: Record<string, string> }>(system, user, opts)
  const m = out?.mapping || {}
  const mapping: Record<string, string> = {}
  for (const h of headers) mapping[h] = String(m[h] ?? '__extra').trim()
  return mapping
}

// ─── Mapeo heurístico de encabezados + contenido (SIN IA) ─────
// Dos señales combinadas para ser UNIVERSAL con cualquier formato:
//  1) Sinónimos del NOMBRE del encabezado (diccionario amplio ES/EN).
//  2) Detección por el CONTENIDO de la columna (mira los valores): aunque
//     el encabezado tenga un nombre raro, si los valores son "Automática/
//     Manual/CVT" es transmisión; si son "Gasolina/Diésel" es combustible;
//     si son años, kilometrajes, VINs, etc. los reconoce igual.
// Funciona aunque el proveedor de IA esté caído. La IA queda como refuerzo.

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normHeader = (h: string) => stripAccents(String(h).toLowerCase()).replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim()
const normVal = (v: unknown) => stripAccents(String(v ?? '').toLowerCase()).trim()

// Orden importa: lo más específico primero (p.ej. color interior antes que color).
const HEADER_SYNONYMS: [string, string[]][] = [
  ['colorInterior', ['color interior', 'interior', 'tapiceria', 'vestidura']],
  ['colorExterior', ['color exterior', 'color', 'exterior', 'pintura']],
  ['imageUrl', ['url imagen', 'imagen url', 'foto url', 'url foto', 'imagenes', 'imagen', 'fotos', 'foto', 'image', 'picture', 'photo', 'thumbnail']],
  ['name', ['nombre del vehiculo', 'veh description', 'vehicle description', 'descripcion del vehiculo', 'nombre', 'titulo', 'title', 'name', 'descripcion corta', 'unidad', 'vehiculo', 'auto', 'producto', 'articulo']],
  ['marca', ['marca', 'make', 'fabricante', 'brand', 'armadora', 'manufacturer', 'mfg', 'mfr']],
  ['modelo', ['modelo año', 'modelo ano', 'modelo', 'model', 'linea', 'submarca', 'mdl']],
  ['year', ['model year', 'ano modelo', 'año modelo', 'año', 'ano', 'anio', 'year', 'modelo year']],
  ['version', ['version', 'trim', 'equipamiento', 'paquete', 'edicion', 'acabado', 'nivel']],
  ['price', ['precio de venta', 'precio venta', 'precio publico', 'precio lista', 'pvp', 'precio', 'price', 'valor', 'importe', 'monto', 'precio final']],
  ['currency', ['moneda', 'currency', 'divisa']],
  ['km', ['kilometraje', 'kilometros', 'millaje', 'mileage', 'odometro', 'recorrido', 'km', 'kms']],
  ['transmision', ['caja de cambios', 'transmision', 'caja', 'transmission', 'gearbox', 'cambios']],
  ['combustible', ['tipo de combustible', 'combustible', 'fuel', 'fuel type', 'gasolina', 'energia', 'motorizacion']],
  ['motor', ['motor', 'engine', 'cilindrada', 'litros', 'cilindros', 'displacement']],
  ['traccion', ['tren motriz', 'traccion', 'drivetrain', 'traction', 'rodada', 'drive']],
  ['puertas', ['num puertas', 'numero de puertas', 'puertas', 'doors', 'no puertas']],
  ['carroceria', ['tipo de carroceria', 'carroceria', 'tipo de auto', 'tipo de vehiculo', 'tipo de unidad', 'segmento', 'estilo', 'body type', 'body', 'tipo']],
  ['condicion', ['estado fisico', 'condicion fisica', 'estado general', 'estado de la unidad', 'condicion', 'estado']],
  ['vin', ['numero de serie', 'num de serie', 'no de serie', 'num serie', 'serie', 'chasis', 'vin', 'niv', 'vin ficticio']],
  ['placas', ['placas', 'plates', 'matricula', 'patente']],
  ['stock', ['existencias', 'existencia', 'cantidad', 'disponibles', 'stock', 'unidades disponibles', 'piezas']],
  ['category', ['condicion de venta', 'tipo de venta', 'categoria', 'clasificacion', 'nuevo usado', 'nuevo o usado']],
  ['status', ['estatus', 'status', 'situacion', 'disponibilidad', 'estado de venta', 'estatus de venta', 'est']],
  ['fechaRecepcion', ['fecha de recepcion', 'fecha recepcion', 'fecha de llegada', 'fecha llegada', 'd re', 'dre', 'fecha ingreso', 'recepcion']],
  ['diasStock', ['dias en stock', 'dias stock', 'd st', 'dst', 'dias en piso', 'dias piso', 'dias en lote', 'antiguedad']],
  ['vendedorAsignado', ['vendedor asignado', 'vendedor', 'asesor', 'asesor asignado', 'ejecutivo', 'salesperson']],
  ['clienteAsignado', ['cliente asignado', 'cliente', 'comprador', 'a nombre de', 'apartado por']],
  ['ubicacion', ['ubicacion', 'sucursal', 'agencia', 'lote', 'sede', 'plaza', 'ciudad', 'location']],
  ['sku', ['sku', 'folio', 'clave', 'codigo', 'referencia', 'id interno', 'id', 'codigo interno']],
  ['description', ['descripcion', 'observaciones', 'comentarios', 'notas', 'detalles', 'detalle', 'remarks', 'notes']],
]

// Lista de marcas/fabricantes para reconocer columnas de marca y nombre por su
// contenido (universal: aunque el encabezado se llame "MFG", "Armadora", etc.).
const BRAND_SET = new Set([
  'toyota', 'honda', 'nissan', 'mazda', 'chevrolet', 'chevy', 'ford', 'volkswagen', 'vw', 'kia', 'hyundai',
  'jeep', 'dodge', 'ram', 'chrysler', 'audi', 'bmw', 'mercedes', 'mercedes benz', 'mercedes-benz', 'tesla',
  'subaru', 'mitsubishi', 'suzuki', 'renault', 'peugeot', 'fiat', 'seat', 'volvo', 'lexus', 'acura', 'infiniti',
  'gmc', 'buick', 'cadillac', 'lincoln', 'mini', 'porsche', 'jaguar', 'land rover', 'range rover', 'ferrari',
  'lamborghini', 'maserati', 'bentley', 'rolls royce', 'alfa romeo', 'citroen', 'opel', 'skoda', 'dacia',
  'chery', 'byd', 'mg', 'jac', 'baic', 'geely', 'great wall', 'gwm', 'changan', 'jetour', 'omoda', 'jaecoo',
  'smart', 'isuzu', 'daihatsu', 'scion', 'hummer', 'pontiac', 'saturn', 'mercury', 'genesis', 'polestar',
  'rivian', 'lucid', 'cupra', 'datsun', 'lada',
])
const isWholeBrand = (v: string) => {
  const t = v.split(/\s+/).filter(Boolean)
  return BRAND_SET.has(v) || (t.length <= 2 && BRAND_SET.has(t.slice(0, 2).join(' ')))
}
const startsWithBrand = (v: string) => {
  const t = v.split(/\s+/).filter(Boolean)
  return t.length > 0 && (BRAND_SET.has(t[0]) || BRAND_SET.has(t.slice(0, 2).join(' ')))
}

// Detección por CONTENIDO: patrones de valores muy distintivos por campo.
// (Se usan junto a los sinónimos; el contenido suele ser la señal más fuerte.)
const VALUE_TESTS: [string, (v: string) => boolean][] = [
  ['year', (v) => { const m = v.match(/^(19|20)\d{2}/); return !!m && +m[0] >= 1950 && +m[0] <= 2100 }],
  ['marca', (v) => isWholeBrand(v)], // la celda es exactamente una marca → columna de marca
  ['name', (v) => v.split(/\s+/).filter(Boolean).length >= 2 && startsWithBrand(v) && !isWholeBrand(v)], // marca + modelo → nombre
  ['transmision', (v) => /^(autom|manual|cvt|estandar|secuencial|tiptronic|dsg|doble embrague|s tronic)/.test(v) || /^(at|mt|std|a\/t|m\/t)$/.test(v)],
  ['combustible', (v) => /^(gasolin|diesel|hibrid|electric|nafta|premium|magna|hybrid|flex|gnc|glp|bencina)/.test(v) || /^(gas|ev)$/.test(v)],
  ['status', (v) => /^(disponible|vendid|apartad|reservad|separad|entregad|en mantenim|mantenim|en proceso|pausad)/.test(v)],
  ['category', (v) => /^(nuevo|usado|seminuev|semi nuev|0 ?km|de agencia|preowned|pre owned)/.test(v)],
  ['condicion', (v) => /^(buen|regular|excelente|mal|muy buen|optim|impecable|deterior|aceptable)/.test(v)],
  ['carroceria', (v) => /^(suv|sedan|hatchback|hatch|pickup|pick up|coupe|convertible|cabrio|van|minivan|camioneta|crossover|familiar|deportivo|compacto|subcompacto|station|wagon|roadster)/.test(v)],
  ['km', (v) => /\d[\d.,\s]*\s*(km|kms|kilom|mi|millas)\b/.test(v)],
  ['vin', (v) => /^[a-hj-npr-z0-9]{17}$/i.test(v.replace(/\s/g, ''))],
  ['price', (v) => /^[$€]/.test(v) || /\b(mxn|usd|eur)\b/.test(v)],
]

const CORE_FIELDS = new Set(['name', 'marca', 'modelo', 'price', 'year'])

/**
 * Mapea encabezados → campos del esquema combinando NOMBRE (sinónimos) y
 * CONTENIDO (valores de la columna), sin IA. Asignación GLOBAL por mejor
 * puntaje: se asignan primero los pares (encabezado, campo) más fuertes.
 * El contenido pesa más que el nombre → universal con cualquier formato.
 * Así "Precio venta" gana a "Precio compra/Margen", "Año"/"Tipo" caen en su
 * campo correcto, y columnas con nombre raro se reconocen por sus valores.
 */
export function heuristicMapHeaders(headers: string[], rows: Record<string, unknown>[] = []): Record<string, string> {
  type Cand = { header: string; idx: number; field: string; score: number }
  const cands: Cand[] = []

  headers.forEach((header, idx) => {
    const h = normHeader(header)
    if (!h) return

    // (1) Señal por NOMBRE de encabezado.
    for (const [field, syns] of HEADER_SYNONYMS) {
      let best = 0
      for (const syn of syns) {
        if (h === syn) best = Math.max(best, syn.length + 1) // exacto: leve preferencia
        else if (h.includes(syn)) best = Math.max(best, syn.length) // el encabezado contiene el sinónimo
      }
      if (best > 0) cands.push({ header, idx, field, score: best })
    }

    // (2) Señal por CONTENIDO: muestrea valores y prueba patrones distintivos.
    const sample: string[] = []
    for (const r of rows) {
      const v = r?.[header]
      if (v === null || v === undefined) continue
      const s = normVal(v)
      if (s) sample.push(s)
      if (sample.length >= 25) break
    }
    if (sample.length >= 3) {
      for (const [field, test] of VALUE_TESTS) {
        const frac = sample.filter(test).length / sample.length
        if (frac >= 0.6) cands.push({ header, idx, field, score: 12 + Math.round(frac * 8) }) // 12–20, supera a la mayoría de nombres
      }
    }
  })

  // Sesgo para PRECIO: preferir venta/público/lista; castigar compra/costo/margen.
  for (const c of cands) {
    if (c.field !== 'price') continue
    const h = normHeader(c.header)
    if (/venta|publico|lista|pvp|final/.test(h)) c.score += 8
    if (/compra|costo|adquisic|margen|utilidad|ganancia|inversion|mayoreo|factura/.test(h)) c.score -= 12
  }

  // Mayor puntaje primero; empate → columna más a la izquierda.
  cands.sort((a, b) => b.score - a.score || a.idx - b.idx)
  const mapping: Record<string, string> = {}
  const usedField = new Set<string>()
  for (const c of cands) {
    if (mapping[c.header] || usedField.has(c.field) || c.score <= 0) continue
    mapping[c.header] = c.field
    usedField.add(c.field)
  }
  for (const header of headers) if (!mapping[header]) mapping[header] = '__extra'
  return mapping
}

function coreMappedCount(mapping: Record<string, string>): number {
  return new Set(Object.values(mapping).filter((d) => CORE_FIELDS.has(d))).size
}

function hasNameSource(mapping: Record<string, string>): boolean {
  return Object.values(mapping).some((d) => d === 'name' || d === 'marca' || d === 'modelo')
}

/** ¿El error proviene de que el proveedor de IA no está disponible (sin saldo, etc.)? */
function isAiUnavailable(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /glm|z\.?ai|provider|balance|429|quota|saldo|insufficient/.test(m)
}

/** Aplica el mapeo a una fila → registro crudo del esquema (antes de normalizar). */
export function rowToRaw(row: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
  const rec: Record<string, unknown> = { __extra: [] as { etiqueta: string; valor: string }[] }
  for (const [header, destRaw] of Object.entries(mapping)) {
    const dest = destRaw
    const val = row[header]
    if (val === null || val === undefined || String(val).trim() === '') continue
    if (dest === '__ignore') continue
    if (dest === '__extra' || !(KNOWN_FIELDS as readonly string[]).includes(dest)) {
      ;(rec.__extra as { etiqueta: string; valor: string }[]).push({ etiqueta: header, valor: String(val) })
      continue
    }
    rec[dest] = val
  }
  return rec
}

/** Extrae un arreglo de vehículos desde texto no estructurado (SQL/JSON/TXT) con IA. */
export async function extractFromText(text: string, opts: AiOpts): Promise<Record<string, unknown>[]> {
  const truncated = text.slice(0, MAX_TEXT_CHARS)
  const system = `Eres un asistente de migración de inventario automotriz. Del texto (dump SQL, JSON o texto libre) extrae TODOS los vehículos. Devuelve SOLO JSON: {"vehicles":[ {...} ]}. Cada vehículo con estos campos (null si falta, NO inventes): name, marca, modelo, year, version, vin, placas, colorExterior, colorInterior, km, transmision, combustible, motor, traccion, puertas, ubicacion, sku, price, currency, stock, category(Nuevo/Seminuevo/Usado), status(disponible/apartado/vendido/demo/inmovilizada/contaminada — códigos DMS: IVN=disponible, AVN=apartado, DEM=demo, VND=vendido), fechaRecepcion, diasStock, vendedorAsignado, clienteAsignado, description, extra:[{etiqueta,valor}] para datos sin campo equivalente.`
  const out = await aiJson<{ vehicles?: Record<string, unknown>[] }>(system, `Texto:\n${truncated}`, opts)
  const arr = Array.isArray(out?.vehicles) ? out!.vehicles! : (Array.isArray(out) ? (out as unknown as Record<string, unknown>[]) : [])
  return arr
}

/** Normaliza un registro crudo y produce alertas (issues) por campo. */
export function normalizeVehicle(raw: Record<string, unknown>): NormalizedVehicle {
  const issues: FieldIssue[] = []
  const issue = (field: string, reason: string, severity: 'error' | 'warn' = 'warn') => issues.push({ field, reason, severity })

  const metadata: Record<string, unknown> = {}
  for (const f of META_FIELDS) {
    const v = raw[f]
    if (v === null || v === undefined || String(v).trim() === '') continue
    if (f === 'transmision') metadata[f] = normTransmision(v)
    else if (f === 'combustible') metadata[f] = normCombustible(v)
    else if (NUMBER_FIELDS.has(f)) { const n = num(v); if (n != null) metadata[f] = String(n) }
    else metadata[f] = String(v).trim()
  }

  // Nombre: usa 'name' o arma marca + modelo + año + versión.
  let name = String(raw.name ?? '').trim()
  if (!name) {
    name = [metadata.marca, metadata.modelo, metadata.year, metadata.version].filter(Boolean).join(' ').trim()
  }
  if (!name) issue('name', 'Falta el modelo/nombre del vehículo', 'error')

  const price = num(raw.price)
  if (raw.price != null && String(raw.price).trim() !== '' && price == null) issue('price', 'El precio no se pudo leer como número')
  if (price != null && (price < 1000 || price > 50_000_000)) issue('price', `Precio inusual ($${price.toLocaleString('es-MX')}) — verifícalo`)

  const category = normCategory(raw.category)
  const status = normStatus(raw.status)

  // Año
  const year = num(metadata.year)
  const nextYear = new Date().getFullYear() + 2
  if (year != null && (year < 1950 || year > nextYear)) {
    issue('year', `Año fuera de rango (${year}); revisa`, year < 1900 || year > nextYear + 1 ? 'error' : 'warn')
  }
  // Km
  const km = num(metadata.km)
  if (km != null) {
    metadata.km = String(km)
    if (category === 'Nuevo' && km > 1000) issue('km', 'Marcado como Nuevo pero con kilometraje alto')
    if (km < 0) issue('km', 'Kilometraje negativo', 'error')
  }
  // VIN
  const vin = String(metadata.vin ?? '').trim()
  if (vin && vin.replace(/\s/g, '').length !== 17) issue('vin', 'El VIN no tiene 17 caracteres')

  const stock = num(raw.stock)
  if (stock != null && stock < 0) issue('stock', 'Stock negativo', 'error')

  const extra = Array.isArray(raw.__extra) ? (raw.__extra as { etiqueta: string; valor: string }[])
    : Array.isArray(raw.extra) ? (raw.extra as { etiqueta: string; valor: string }[]) : []

  // ── REGLA DE ORO (agencias): la IA solo puede OFRECER unidades DISPONIBLES
  // y sin cliente/preventa. DEM/AVN/INMOVILIZADA/CONTAMINADA o con cliente
  // asignado quedan isActive=false → el bot NO las cotiza (evita dobles ventas).
  const clienteAsignado = String(metadata.clienteAsignado ?? '').trim()
  const vendedorAsignado = String(metadata.vendedorAsignado ?? '').trim()
  const sellableStates = new Set(['disponible'])
  const iaActive = sellableStates.has(status) && !clienteAsignado
  if (clienteAsignado) issue('clienteAsignado', `En preventa con "${clienteAsignado}"${vendedorAsignado ? ` (vendedor: ${vendedorAsignado})` : ''} — excluida de la IA`, 'warn')
  else if (status === 'demo') issue('status', 'Unidad de demostración — la IA no la ofrecerá automáticamente')
  else if (status === 'inmovilizada' || status === 'contaminada') issue('status', `Unidad ${status} — bloqueada para venta por IA`)
  // Días en stock: usar la columna si vino; si no, derivarla de la fecha de recepción
  if (metadata.diasStock != null && metadata.diasStock !== '') {
    const ds = num(metadata.diasStock)
    if (ds != null) metadata.diasStock = String(Math.max(0, Math.round(ds)))
  } else if (metadata.fechaRecepcion) {
    const fr = new Date(String(metadata.fechaRecepcion))
    if (!isNaN(fr.getTime())) metadata.diasStock = String(Math.max(0, Math.floor((Date.now() - fr.getTime()) / 86400000)))
  }

  return {
    name,
    price,
    currency: String(raw.currency ?? 'MXN').trim().toUpperCase() || 'MXN',
    category,
    stock: stock != null ? Math.round(stock) : null,
    description: raw.description ? String(raw.description).trim() : null,
    isActive: iaActive,
    status,
    imageUrl: raw.imageUrl ? String(raw.imageUrl).trim() : null,
    metadata,
    extra,
    issues,
  }
}

export interface ImportPreview {
  records: NormalizedVehicle[]
  count: number
  warnings: string[]
  mapping?: Record<string, string>
}

/** Procesa un payload ya parseado (filas o texto) → registros normalizados con alertas. */
export async function processInventoryImport(
  payload: { kind: 'rows'; headers: string[]; rows: Record<string, unknown>[] } | { kind: 'text'; text: string },
  opts: AiOpts,
): Promise<ImportPreview> {
  const warnings: string[] = []
  let rawRecords: Record<string, unknown>[] = []
  let mapping: Record<string, string> | undefined

  if (payload.kind === 'rows') {
    let rows = (payload.rows || []).filter((r) => r && typeof r === 'object')
    if (!rows.length) throw new Error('El archivo no contiene filas de datos')
    if (rows.length > MAX_ROWS) { warnings.push(`El archivo tiene ${rows.length} filas; se importarán las primeras ${MAX_ROWS}.`); rows = rows.slice(0, MAX_ROWS) }
    const headers = payload.headers?.length ? payload.headers : Object.keys(rows[0])

    // 1) Mapeo heurístico SIN IA. Si reconoce ≥2 columnas clave (marca/modelo/
    //    precio/año/nombre), confiamos en él y NO gastamos IA → funciona aunque
    //    el proveedor esté sin saldo.
    const heur = heuristicMapHeaders(headers, rows)
    if (coreMappedCount(heur) >= 2) {
      mapping = heur
    } else {
      // 2) Encabezados ambiguos: pedimos a la IA; si no está disponible,
      //    caemos al heurístico (si al menos da un nombre) o avisamos claro.
      try {
        mapping = await mapHeaders(headers, rows, opts)
      } catch (e) {
        if (!isAiUnavailable(e)) throw e
        if (!hasNameSource(heur)) {
          throw new Error(`No se pudieron identificar las columnas automáticamente y el asistente de IA no está disponible. Encabezados detectados: ${headers.join(', ') || '(ninguno)'}. Asegúrate de que el archivo tenga columnas como: marca, modelo, precio, año, km.`)
        }
        mapping = heur
        warnings.push('Las columnas se mapearon automáticamente (sin IA). Revisa los datos antes de importar.')
      }
    }
    rawRecords = rows.map((r) => rowToRaw(r, mapping!))
  } else {
    if (!payload.text || !payload.text.trim()) throw new Error('El contenido está vacío')
    if (payload.text.length > MAX_TEXT_CHARS) warnings.push('El contenido es muy grande; puede que no se extraigan todos los registros. Usa CSV/Excel para volúmenes grandes.')
    try {
      rawRecords = await extractFromText(payload.text, opts)
    } catch (e) {
      if (isAiUnavailable(e)) throw new Error('La lectura de texto/SQL requiere el asistente de IA, que ahora no está disponible. Para importar sin IA, sube un archivo CSV o Excel con encabezados (marca, modelo, precio, año, km).')
      throw e
    }
  }

  if (!rawRecords.length) throw new Error('No se detectaron vehículos en el archivo')
  const records = rawRecords
    .map((r) => normalizeVehicle(r))
    .filter((r) => r.name || r.extra.length || r.price != null)
  if (!records.length) throw new Error('No se pudo mapear ningún vehículo del archivo')

  return { records, count: records.length, warnings, mapping }
}

// ─── Parser CSV simple (servidor: para Google Sheets/Drive/URL) ───
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => { cur.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(cur); cur = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') pushField()
      else if (c === '\n') pushRow()
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || cur.length) pushRow()
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (!nonEmpty.length) return { headers: [], rows: [] }
  const headers = nonEmpty[0].map((h) => h.trim())
  const out = nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {}
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim() })
    return o
  })
  return { headers, rows: out }
}

/** Convierte un enlace de Google Sheets / Drive a una URL de descarga directa. */
export function resolveGoogleUrl(url: string): { downloadUrl: string; kind: 'sheet' | 'drive' | 'raw' } {
  const u = url.trim()
  const sheet = u.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheet) {
    const gid = u.match(/[#&?]gid=(\d+)/)?.[1]
    return { downloadUrl: `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`, kind: 'sheet' }
  }
  const drive = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || u.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/)
  if (drive) return { downloadUrl: `https://drive.google.com/uc?export=download&id=${drive[1]}`, kind: 'drive' }
  return { downloadUrl: u, kind: 'raw' }
}
