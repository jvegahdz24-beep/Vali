'use client'

// ═══════════════════════════════════════════════════════════════
// Importación masiva de inventario asistida por IA.
// Orígenes: archivo (CSV/Excel/JSON/SQL/TXT), pegar texto, o enlace
// (Google Sheets / Drive / URL). La IA mapea/extrae los datos y se
// muestran en una tabla de revisión con ALERTAS por campo (igual que
// el escaneo de expedientes de cliniodent). El usuario corrige y confirma.
// ═══════════════════════════════════════════════════════════════

import { useRef, useState } from 'react'
import {
  Upload, FileText, Link2, Sparkles, Loader2, AlertTriangle, X, Check,
  CheckCircle2, ClipboardPaste, Table2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TRANSMISIONES, COMBUSTIBLES, TRACCIONES, PUERTAS, YEARS } from '@/lib/inventory-options'

interface FieldIssue { field: string; reason: string; severity: 'error' | 'warn' }
interface VehicleRec {
  name: string
  price: number | null
  currency: string
  category: string | null
  stock: number | null
  description: string | null
  isActive: boolean
  status: string
  imageUrl: string | null
  metadata: Record<string, unknown>
  extra: { etiqueta: string; valor: string }[]
  issues: FieldIssue[]
  _include?: boolean
}

type Tab = 'file' | 'text' | 'link'

// Parsea una TABLA de Markdown (| col | col |) a headers + filas. Devuelve null
// si el texto no contiene una tabla válida (entonces se usa IA sobre el texto).
function parseMarkdownTable(text: string): { headers: string[]; rows: Record<string, unknown>[] } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('|'))
  if (lines.length < 2) return null
  const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const isSep = (l: string) => /^\|?[\s:|-]+\|?$/.test(l) && l.includes('-')
  // Encuentra la fila de encabezados: la primera seguida de una fila separadora.
  let hIdx = -1
  for (let i = 0; i < lines.length - 1; i++) { if (!isSep(lines[i]) && isSep(lines[i + 1])) { hIdx = i; break } }
  if (hIdx < 0) return null
  const headers = cells(lines[hIdx]).map((h, i) => h || `Columna ${i + 1}`)
  if (!headers.length) return null
  const rows: Record<string, unknown>[] = []
  for (let i = hIdx + 2; i < lines.length; i++) {
    if (isSep(lines[i])) continue
    const c = cells(lines[i])
    if (!c.some((x) => x)) continue
    const o: Record<string, unknown> = {}
    headers.forEach((h, idx) => { o[h] = c[idx] ?? '' })
    rows.push(o)
  }
  return rows.length ? { headers, rows } : null
}

export function InventoryImportModal({ workspaceId, onClose, onImported }: {
  workspaceId: string
  onClose: () => void
  onImported: (n: number) => void
}) {
  const [tab, setTab] = useState<Tab>('file')
  const [step, setStep] = useState<'source' | 'review'>('source')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')
  const [records, setRecords] = useState<VehicleRec[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string> | undefined>()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [committing, setCommitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const runPreview = async (payload: Record<string, unknown>, msg: string) => {
    setLoading(true); setLoadingMsg(msg); setError('')
    try {
      const res = await fetch('/api/catalog/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, mode: 'preview', ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 502 || res.status === 504) throw new Error('El archivo es muy grande o tardó demasiado en procesarse. Para listas largas usa CSV o Excel (se procesan al instante, sin IA).')
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo procesar el archivo')
      const recs: VehicleRec[] = (data.records || []).map((r: VehicleRec) => ({ ...r, _include: true }))
      if (!recs.length) throw new Error('No se detectaron vehículos')
      setRecords(recs); setWarnings(data.warnings || []); setMapping(data.mapping); setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar')
    } finally { setLoading(false); setLoadingMsg('') }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setLoading(true); setLoadingMsg('Leyendo archivo…'); setError('')
    try {
      const name = file.name.toLowerCase()
      let payload: Record<string, unknown>
      if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const XLSX = await import('xlsx')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        // Lee como matriz para detectar la fila de encabezados real (muchos
        // Excel traen filas de título/logo arriba antes de los encabezados).
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as unknown[][]
        if (!aoa.length) { setError('El archivo no tiene filas de datos'); setLoading(false); return }
        const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
        const HINTS = ['marca', 'modelo', 'model', 'precio', 'price', 'año', 'ano', 'anio', 'year', 'km', 'kilom', 'millaje', 'version', 'color', 'combustible', 'fuel', 'transmis', 'motor', 'engine', 'vin', 'serie', 'stock', 'existenc', 'placa', 'puerta', 'traccion', 'ubicac', 'sucursal', 'sku', 'folio', 'clave', 'nombre', 'auto', 'vehic', 'condic', 'estado', 'cantidad']
        let headerIdx = -1, bestScore = -1
        const scan = Math.min(aoa.length, 15)
        for (let i = 0; i < scan; i++) {
          const cells = (aoa[i] || []).map(norm)
          const nonEmpty = cells.filter((c) => c).length
          const hits = cells.filter((c) => c && HINTS.some((h) => c.includes(h))).length
          const score = hits * 100 + nonEmpty
          if (hits > 0 && score > bestScore) { bestScore = score; headerIdx = i }
        }
        if (headerIdx < 0) headerIdx = aoa.findIndex((r) => (r || []).some((c) => norm(c))) // sin pistas: primera fila con datos
        if (headerIdx < 0) headerIdx = 0
        const rawHeaders = (aoa[headerIdx] || []).map((h, idx) => norm(h) ? String(h).trim() : `Columna ${idx + 1}`)
        const dataRows = aoa.slice(headerIdx + 1).filter((r) => (r || []).some((c) => norm(c)))
        if (!dataRows.length) { setError('El archivo no tiene filas de datos debajo de los encabezados'); setLoading(false); return }
        const rows = dataRows.map((r) => {
          const o: Record<string, unknown> = {}
          rawHeaders.forEach((h, idx) => { o[h] = (r as unknown[])[idx] ?? '' })
          return o
        })
        payload = { kind: 'rows', headers: rawHeaders, rows }
      } else if (name.endsWith('.json')) {
        const t = await file.text()
        let parsed: unknown
        try { parsed = JSON.parse(t) } catch { setError('El JSON no es válido'); setLoading(false); return }
        const arr = Array.isArray(parsed) ? parsed
          : Array.isArray((parsed as Record<string, unknown>)?.items) ? (parsed as Record<string, unknown[]>).items
          : Array.isArray((parsed as Record<string, unknown>)?.vehicles) ? (parsed as Record<string, unknown[]>).vehicles
          : null
        payload = arr && arr.length && typeof arr[0] === 'object'
          ? { kind: 'rows', headers: Object.keys(arr[0] as object), rows: arr }
          : { kind: 'text', text: t }
      } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
        // Markdown: si trae una TABLA la parseamos a filas (rápido, sin IA ni
        // timeout del proxy). Si es texto libre, cae a extracción con IA.
        const t = await file.text()
        const table = parseMarkdownTable(t)
        payload = table ? { kind: 'rows', headers: table.headers, rows: table.rows } : { kind: 'text', text: t }
      } else {
        payload = { kind: 'text', text: await file.text() }
      }
      await runPreview(payload, payload.kind === 'rows' ? 'Ordenando los datos…' : 'La IA está ordenando los datos…')
    } catch (e) {
      setError('Error al leer el archivo: ' + (e instanceof Error ? e.message : ''))
      setLoading(false)
    }
  }

  const setField = (i: number, patch: Partial<VehicleRec>) =>
    setRecords((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const setMeta = (i: number, key: string, val: string) =>
    setRecords((prev) => prev.map((r, idx) => idx === i ? { ...r, metadata: { ...r.metadata, [key]: val } } : r))

  // Select para un campo de metadata (conserva valor importado fuera de la lista)
  const metaSel = (i: number, key: string, options: string[], hasIssue = false) => {
    const cur = String(records[i].metadata?.[key] ?? '')
    const opts = !cur || options.includes(cur) ? options : [cur, ...options]
    return (
      <select value={cur} onChange={(e) => setMeta(i, key, e.target.value)}
        className={cn('h-8 text-xs rounded-md border border-input bg-background px-1.5 w-full', hasIssue && 'border-amber-400')}>
        <option value="">—</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  const commit = async () => {
    const included = records.filter((r) => r._include && r.name?.trim())
    if (!included.length) { toast.error('Selecciona al menos un vehículo válido'); return }
    setCommitting(true)
    try {
      const res = await fetch('/api/catalog/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, mode: 'commit', records: included }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo importar')
      toast.success(`${data.created} vehículo(s) importados`)
      onImported(data.created)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo importar')
    } finally { setCommitting(false) }
  }

  const includedCount = records.filter((r) => r._include && r.name?.trim()).length
  const withIssues = records.filter((r) => r.issues?.length).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => !committing && !loading && onClose()}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" /> Importar inventario con IA
          </h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {step === 'source' ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            {/* Source tabs */}
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
              {([['file', 'Archivo', Upload], ['text', 'Pegar texto', ClipboardPaste], ['link', 'Enlace', Link2]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => { setTab(k); setError('') }}
                  className={cn('flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors',
                    tab === k ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {tab === 'file' && (
              <div
                className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer hover:border-emerald-300 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
              >
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json,.sql,.txt,.md,.markdown,text/markdown" className="hidden"
                  onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
                <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Arrastra o haz clic para subir</p>
                <p className="text-xs text-muted-foreground mt-1">CSV · Excel (.xlsx/.xls) · JSON · SQL · Markdown (.md) · TXT</p>
              </div>
            )}

            {tab === 'text' && (
              <div className="space-y-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
                  placeholder="Pega aquí un dump SQL, JSON, o una lista de autos en texto…"
                  className="text-xs font-mono" />
                <Button disabled={!text.trim()} onClick={() => runPreview({ kind: 'text', text }, 'La IA está extrayendo los autos…')} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Procesar con IA
                </Button>
              </div>
            )}

            {tab === 'link' && (
              <div className="space-y-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/… o drive.google.com/…" className="text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  Comparte el Google Sheet/archivo como <strong>«Cualquiera con el enlace»</strong>. También sirve cualquier URL pública a un CSV/JSON.
                </p>
                <Button disabled={!url.trim()} onClick={() => runPreview({ source: 'url', url }, 'Descargando y procesando con IA…')} className="gap-2">
                  <Link2 className="h-4 w-4" /> Importar del enlace
                </Button>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Loader2 className="h-4 w-4 animate-spin" /> {loadingMsg}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
              La IA analiza el archivo, identifica qué columna es cada dato (marca, modelo, precio, año, km…) y los ordena.
              Si algo no le cuadra, te lo marca con una alerta para que lo revises antes de importar.
            </div>
          </div>
        ) : (
          /* ── REVIEW ── */
          <>
            <div className="px-5 py-3 border-b shrink-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="bg-emerald-100 text-emerald-700 border-0">{records.length} detectados</Badge>
                <Badge className="bg-blue-100 text-blue-700 border-0">{includedCount} seleccionados</Badge>
                {withIssues > 0 && <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><AlertTriangle className="h-3 w-3" />{withIssues} con alertas</Badge>}
              </div>
              {warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-600">⚠ {w}</p>)}
              {mapping && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer flex items-center gap-1"><Table2 className="h-3 w-3" /> Mapeo de columnas detectado por la IA</summary>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(mapping).map(([h, d]) => (
                      <span key={h} className="rounded bg-muted px-1.5 py-0.5"><b>{h}</b> → {d}</span>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="flex-1 overflow-auto px-2 py-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="p-2 w-8"></th>
                    <th className="p-2 min-w-[200px]">Modelo / nombre</th>
                    <th className="p-2 min-w-[120px]">Precio</th>
                    <th className="p-2 min-w-[90px]">Año</th>
                    <th className="p-2 min-w-[90px]">Km</th>
                    <th className="p-2 min-w-[120px]">Transmisión</th>
                    <th className="p-2 min-w-[120px]">Combustible</th>
                    <th className="p-2 min-w-[110px]">Tracción</th>
                    <th className="p-2 min-w-[80px]">Puertas</th>
                    <th className="p-2 min-w-[120px]">Tipo</th>
                    <th className="p-2 min-w-[120px]">Estatus</th>
                    <th className="p-2 min-w-[200px]">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const issueFor = (f: string) => r.issues?.find((x) => x.field === f)
                    const hasErr = r.issues?.some((x) => x.severity === 'error')
                    return (
                      <tr key={i} className={cn('border-b align-top', !r._include && 'opacity-50', hasErr && 'bg-red-50/40')}>
                        <td className="p-2">
                          <input type="checkbox" checked={!!r._include} onChange={(e) => setField(i, { _include: e.target.checked })} />
                        </td>
                        <td className="p-2">
                          <Input value={r.name} onChange={(e) => setField(i, { name: e.target.value })}
                            className={cn('h-8 text-xs', issueFor('name') && 'border-red-400')} />
                        </td>
                        <td className="p-2">
                          <Input value={r.price ?? ''} onChange={(e) => setField(i, { price: e.target.value ? Number(String(e.target.value).replace(/[^\d.]/g, '')) : null })}
                            className={cn('h-8 text-xs', issueFor('price') && 'border-amber-400')} />
                        </td>
                        <td className="p-2">{metaSel(i, 'year', YEARS, !!issueFor('year'))}</td>
                        <td className="p-2">
                          <Input value={String(r.metadata?.km ?? '')} onChange={(e) => setMeta(i, 'km', e.target.value)}
                            className={cn('h-8 text-xs', issueFor('km') && 'border-amber-400')} />
                        </td>
                        <td className="p-2">{metaSel(i, 'transmision', TRANSMISIONES)}</td>
                        <td className="p-2">{metaSel(i, 'combustible', COMBUSTIBLES)}</td>
                        <td className="p-2">{metaSel(i, 'traccion', TRACCIONES)}</td>
                        <td className="p-2">{metaSel(i, 'puertas', PUERTAS)}</td>
                        <td className="p-2">
                          <select value={r.category ?? ''} onChange={(e) => setField(i, { category: e.target.value || null })}
                            className="h-8 text-xs rounded-md border border-input bg-background px-1.5 w-full">
                            <option value="">—</option>
                            <option>Nuevo</option><option>Seminuevo</option><option>Usado</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <select value={r.status} onChange={(e) => setField(i, { status: e.target.value })}
                            className="h-8 text-xs rounded-md border border-input bg-background px-1.5 w-full">
                            <option value="disponible">Disponible</option>
                            <option value="apartado">Apartado</option>
                            <option value="vendido">Vendido</option>
                          </select>
                        </td>
                        <td className="p-2">
                          {r.issues?.length ? (
                            <div className="space-y-0.5">
                              {r.issues.map((x, k) => (
                                <div key={k} className={cn('flex items-start gap-1 text-[10px]', x.severity === 'error' ? 'text-red-600' : 'text-amber-600')}>
                                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> <span>{x.reason}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> OK</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t shrink-0">
              <Button variant="ghost" onClick={() => { setStep('source'); setRecords([]) }} disabled={committing}>← Volver</Button>
              <Button onClick={commit} disabled={committing || includedCount === 0} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Importar {includedCount} vehículo(s)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
