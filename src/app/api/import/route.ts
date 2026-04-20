// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Import API
// POST /api/import — Import CSV file for contacts or deals
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'

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

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      throw new ApiError(400, 'Solo se aceptan archivos CSV')
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new ApiError(400, 'El archivo excede el tamaño máximo de 5MB')
    }

    const csvText = await file.text()
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      throw new ApiError(400, 'El archivo CSV está vacío o no tiene datos válidos')
    }

    let imported = 0
    let errors: Array<{ row: number; message: string }> = []

    if (type === 'contacts') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        try {
          const firstName = row.nombre || row.firstname || row.first_name || row.nombre_pila || ''
          if (!firstName) {
            errors.push({ row: i + 2, message: 'Falta el campo nombre' })
            continue
          }

          const lastName = row.apellido || row.lastname || row.last_name || ''
          const phone = row.telefono || row.phone || row.celular || row.tel || ''
          const email = row.correo || row.email || row.correo_electronico || ''
          const source = row.fuente || row.source || 'manual'
          const tags = row.etiquetas || row.tags || ''
          const status = row.estado || row.status || 'active'

          // Check for duplicate phone
          if (phone) {
            const existing = await db.contact.findFirst({
              where: { workspaceId, phone },
            })
            if (existing) {
              errors.push({ row: i + 2, message: `Teléfono duplicado: ${phone}` })
              continue
            }
          }

          const tagsArray = tags
            ? tags.split(';').map((t) => t.trim()).filter(Boolean)
            : []

          await db.contact.create({
            data: {
              workspaceId,
              firstName,
              lastName: lastName || null,
              phone: phone || null,
              email: email || null,
              source,
              tags: JSON.stringify(tagsArray),
              status,
            },
          })
          imported++
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Error al crear contacto'
          errors.push({ row: i + 2, message })
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
