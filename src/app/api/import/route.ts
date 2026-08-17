// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Import API
// POST /api/import — Import CSV file for contacts or deals
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'

/** Normaliza un encabezado a clave (minúsculas, guiones bajos, sin acentos). */
function headerKey(h: string): string {
  return String(h).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
}

/** Parsea un archivo Excel (.xlsx/.xls) → filas como objetos (mismas claves que CSV). */
function parseExcel(buf: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }) as unknown[][]
  if (grid.length < 2) return []
  const headers = (grid[0] as unknown[]).map((h) => headerKey(String(h)))
  const results: Record<string, string>[] = []
  for (let i = 1; i < grid.length; i++) {
    const vals = grid[i] as unknown[]
    if (!vals || vals.every((v) => v === '' || v == null)) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = String(vals[idx] ?? '').trim() })
    results.push(row)
  }
  return results
}

/** Normaliza un teléfono: deja dígitos y un posible '+' inicial. */
function normalizePhone(raw: string): string {
  if (!raw) return ''
  const t = raw.trim()
  const plus = t.startsWith('+') ? '+' : ''
  return plus + t.replace(/[^\d]/g, '')
}

/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields, newlines in quotes, and BOM.
 */
function parseCSV(csvText: string): Record<string, string>[] {
  // Remove BOM if present
  const text = csvText.replace(/^\uFEFF/, '').trim()
  if (!text) return []

  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(current)
      current = ''
    } else if (char === '\r' && !inQuotes) {
      // skip \r
    } else {
      current += char
    }
  }
  if (current.trim()) lines.push(current)

  if (lines.length < 2) return []

  // Parse header row
  const headers = splitCSVLine(lines[0])

  // Parse data rows
  const results: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = splitCSVLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      const key = header.trim().toLowerCase().replace(/\s+/g, '_')
      row[key] = (values[idx] || '').trim()
    })
    results.push(row)
  }

  return results
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null
    const workspaceId = formData.get('workspaceId') as string | null

    if (!file) {
      throw new ApiError(400, 'Archivo no proporcionado')
    }
    if (!type || !['contacts', 'deals'].includes(type)) {
      throw new ApiError(400, 'Tipo inválido. Usa: contacts o deals')
    }
    if (!workspaceId) {
      throw new ApiError(400, 'workspaceId es requerido')
    }

    await requireWorkspace(workspaceId, session.userId)

    // Validate file type (CSV o Excel)
    const lowerName = file.name.toLowerCase()
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') ||
      file.type.includes('spreadsheet') || file.type.includes('ms-excel')
    const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain'
    if (!isExcel && !isCsv) {
      throw new ApiError(400, 'Solo se aceptan archivos CSV o Excel (.csv, .xlsx, .xls)')
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError(400, 'El archivo excede el tamaño máximo de 10MB')
    }

    const rows = isExcel ? parseExcel(await file.arrayBuffer()) : parseCSV(await file.text())

    if (rows.length === 0) {
      throw new ApiError(400, 'El archivo está vacío o no tiene datos válidos (revisa que la primera fila sean los encabezados)')
    }

    let imported = 0
    let errors: Array<{ row: number; message: string }> = []

    if (type === 'contacts') {
      // 1) Normalizar cada fila a un candidato de contacto
      interface Candidate { row: number; firstName: string; lastName: string | null; phone: string; email: string; source: string; tagsArray: string[]; status: string }
      const candidates: Candidate[] = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        let firstName = (r.nombre || r.firstname || r.first_name || r.nombre_pila || r.nombre_completo || r.full_name || r.name || r.contacto || '').trim()
        let lastName = (r.apellido || r.apellidos || r.lastname || r.last_name || '').trim()
        // Si sólo vino un nombre completo (sin apellido), separar por el primer espacio
        if (!lastName && firstName.includes(' ')) {
          const parts = firstName.split(/\s+/)
          firstName = parts.shift() || firstName
          lastName = parts.join(' ')
        }
        if (!firstName) { errors.push({ row: i + 2, message: 'Falta el campo nombre' }); continue }
        const phone = normalizePhone(r.telefono || r.teléfono || r.phone || r.celular || r.movil || r.móvil || r.tel || r.whatsapp || r.numero || r.número || '')
        const email = (r.correo || r.email || r.correo_electronico || r.e_mail || r.mail || '').trim()
        const source = (r.fuente || r.source || r.origen || 'importacion').trim() || 'importacion'
        const tags = (r.etiquetas || r.tags || r.etiqueta || '').trim()
        const status = (r.estado || r.status || 'active').trim() || 'active'
        candidates.push({
          row: i + 2, firstName: firstName.slice(0, 191), lastName: lastName ? lastName.slice(0, 191) : null,
          phone, email, source,
          tagsArray: tags ? tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [],
          status,
        })
      }

      // 2) Dedup contra la BD en UNA consulta (por teléfono) + dedup dentro del archivo
      const phones = Array.from(new Set(candidates.map((c) => c.phone).filter(Boolean)))
      const existingRows = phones.length
        ? await db.contact.findMany({ where: { workspaceId, phone: { in: phones } }, select: { phone: true } })
        : []
      const existingPhones = new Set(existingRows.map((e) => e.phone))
      const seenPhones = new Set<string>()
      const toCreate: Array<{ workspaceId: string; firstName: string; lastName: string | null; phone: string | null; email: string | null; source: string; tags: string; status: string }> = []
      for (const c of candidates) {
        if (c.phone && (existingPhones.has(c.phone) || seenPhones.has(c.phone))) {
          errors.push({ row: c.row, message: `Teléfono duplicado: ${c.phone}` })
          continue
        }
        if (c.phone) seenPhones.add(c.phone)
        toCreate.push({
          workspaceId, firstName: c.firstName, lastName: c.lastName, phone: c.phone || null,
          email: c.email || null, source: c.source, tags: JSON.stringify(c.tagsArray), status: c.status,
        })
      }

      // 3) Insertar en lotes (rápido para miles de filas)
      const CHUNK = 250
      for (let i = 0; i < toCreate.length; i += CHUNK) {
        const chunk = toCreate.slice(i, i + CHUNK)
        try {
          const res = await db.contact.createMany({ data: chunk })
          imported += res.count
        } catch {
          // Si un lote falla, reintentar fila por fila para no perder todo el lote
          for (const c of chunk) {
            try { await db.contact.create({ data: c }); imported++ }
            catch (err) { errors.push({ row: 0, message: err instanceof Error ? err.message : 'Error al crear contacto' }) }
          }
        }
      }
    } else if (type === 'deals') {
      // Get default pipeline and first stage
      const pipeline = await db.pipeline.findFirst({
        where: { workspaceId, isActive: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      })

      if (!pipeline || pipeline.stages.length === 0) {
        throw new ApiError(400, 'No hay pipeline configurado en este workspace')
      }

      const defaultStage = pipeline.stages[0]

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        try {
          const title = row.trato || row.title || row.nombre || row.titulo || ''
          if (!title) {
            errors.push({ row: i + 2, message: 'Falta el campo título/trato' })
            continue
          }

          const value = parseFloat(row.valor || row.value || row.monto || '0') || 0
          const currency = row.moneda || row.currency || 'MXN'
          const stageName = row.etapa || row.stage || ''
          const contactEmail = row.contacto_email || row.contact_email || row.email_contacto || ''

          // Find contact by email if provided
          let contactId: string | null = null
          if (contactEmail) {
            const contact = await db.contact.findFirst({
              where: { workspaceId, email: contactEmail },
            })
            if (contact) {
              contactId = contact.id
            }
          }

          // Find stage by name if provided
          let stageId = defaultStage.id
          if (stageName) {
            const stage = pipeline.stages.find(
              (s) => s.name.toLowerCase() === stageName.toLowerCase()
            )
            if (stage) stageId = stage.id
          }

          await db.deal.create({
            data: {
              workspaceId,
              pipelineId: pipeline.id,
              stageId,
              contactId,
              title,
              value,
              currency,
              source: 'manual',
            },
          })
          imported++
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Error al crear trato'
          errors.push({ row: i + 2, message })
        }
      }
    }

    return Response.json({
      success: true,
      imported,
      total: rows.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 20), // Only return first 20 errors
      message: `Se importaron ${imported} de ${rows.length} registros exitosamente`,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
