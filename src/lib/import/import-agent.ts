// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Import Intelligence Agent (IA Clasificadora)
// Analyzes parsed file data, classifies leads, maps columns,
// and creates Contact + Deal records
// ═══════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import type { ParsedRow } from './file-parser'

// ─── Types ────────────────────────────────────────────────────

export interface ColumnMapping {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  product?: string
  budget?: string
  interest?: string
  stage?: string
  notes?: string
  customFields: Record<string, string>
}

export interface ImportAnalysis {
  columnMapping: ColumnMapping
  totalRows: number
  validRows: number
  skippedRows: number
  classification: {
    hot: number
    warm: number
    cold: number
  }
  detectedIndustry: string
  summary: string
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
  analysis: ImportAnalysis
}

// ─── AI Column Detection ──────────────────────────────────────

const COLUMN_DETECTION_PROMPT = `Eres un experto en análisis de datos de CRM. Recibes los headers de un archivo (Excel/CSV/PDF) y debes mapear cada columna a un campo del CRM.

Posibles campos del CRM:
- firstName: Nombre / Nombre(s) / First Name / name / nombre_completo
- lastName: Apellido / Apellidos / Last Name / apellido_paterno
- phone: Teléfono / Celular / Phone / Móvil / WhatsApp / telefono / celular
- email: Correo / Email / E-mail / mail
- product: Producto / Modelo / Artículo / Servicio / Item
- budget: Presupuesto / Precio / Monto / Amount / Price / precio
- interest: Interés / Etapa / Estado / Status / interés
- stage: Etapa pipeline / funnel / etapa
- notes: Notas / Observaciones / Comentarios / notes

Responde SOLO con JSON (sin markdown, sin backticks):
{
  "firstName": "column_name_or_null",
  "lastName": "column_name_or_null",
  "phone": "column_name_or_null",
  "email": "column_name_or_null",
  "product": "column_name_or_null",
  "budget": "column_name_or_null",
  "interest": "column_name_or_null",
  "stage": "column_name_or_null",
  "notes": "column_name_or_null",
  "customFields": {"otro_campo": "descripción breve"},
  "detectedIndustry": "automotive|realestate|retail|services|other",
  "confidence": 0.9
}`

/**
 * Use AI to detect column mapping from file headers
 */
export async function detectColumns(headers: string[]): Promise<ColumnMapping & { detectedIndustry: string }> {
  try {
    const zai = await ZAI.create()

    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: COLUMN_DETECTION_PROMPT },
        { role: 'user', content: `Headers del archivo:\n${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}\n\nMapea cada columna al campo del CRM que corresponda.` },
      ],
    })

    const content = response.choices[0]?.message?.content || ''
    // Clean markdown code blocks if present
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    const mapping = JSON.parse(jsonStr)

    return {
      firstName: mapping.firstName || null,
      lastName: mapping.lastName || null,
      phone: mapping.phone || null,
      email: mapping.email || null,
      product: mapping.product || null,
      budget: mapping.budget || null,
      interest: mapping.interest || null,
      stage: mapping.stage || null,
      notes: mapping.notes || null,
      customFields: mapping.customFields || {},
      detectedIndustry: mapping.detectedIndustry || '',
    }
  } catch (error) {
    console.error('[ImportAgent] AI column detection failed, using heuristic fallback:', error)
    return heuristicColumnMapping(headers)
  }
}

/**
 * Fallback: heuristic column mapping without AI
 */
function heuristicColumnMapping(headers: string[]): ColumnMapping & { detectedIndustry: string } {
  const lower = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

  const find = (patterns: string[]): string | null => {
    for (const pattern of patterns) {
      const idx = lower.findIndex(h => h.includes(pattern))
      if (idx >= 0) return headers[idx]
    }
    return null
  }

  return {
    firstName: find(['nombre', 'name', 'first', 'cliente', 'contacto']) ?? undefined,
    lastName: find(['apellido', 'last', 'surname']) ?? undefined,
    phone: find(['telefono', 'phone', 'cel', 'movil', 'whatsapp', 'celular', 'mobile']) ?? undefined,
    email: find(['email', 'correo', 'mail', 'e-mail']) ?? undefined,
    product: find(['producto', 'articulo', 'servicio', 'modelo', 'model', 'item', 'product', 'vehicle', 'auto', 'carro']) ?? undefined,
    budget: find(['presupuesto', 'precio', 'price', 'monto', 'amount', 'valor', 'value']) ?? undefined,
    interest: find(['interes', 'interest', 'estado', 'status', 'etapa']) ?? undefined,
    stage: find(['etapa', 'stage', 'funnel', 'pipeline', 'fase']) ?? undefined,
    notes: find(['nota', 'note', 'observacion', 'comentario', 'comment']) ?? undefined,
    customFields: {},
    detectedIndustry: '',
  }
}

// ─── Lead Classification ──────────────────────────────────────

/**
 * Classify a row of data into hot/warm/cold based on available signals
 * Uses simple heuristics — no AI call needed per row for performance
 */
export function classifyLead(row: ParsedRow, mapping: ColumnMapping): 'hot' | 'warm' | 'cold' {
  let score = 0

  // Has phone number
  const phone = mapping.phone ? String(row[mapping.phone] || '') : ''
  if (phone.length >= 8) score += 30

  // Has email
  const email = mapping.email ? String(row[mapping.email] || '') : ''
  if (email.includes('@')) score += 20

  // Has budget/price mentioned
  const budget = mapping.budget ? String(row[mapping.budget] || '') : ''
  if (budget && /\d/.test(budget)) score += 25

  // Has specific product interest
  const productInterest = mapping.product ? String(row[mapping.product] || '') : ''
  if (productInterest && productInterest.length > 2) score += 15

  // Has interest/stage that indicates buying intent
  const interest = mapping.interest ? String(row[mapping.interest] || '').toLowerCase() : ''
  if (interest.includes('compra') || interest.includes('compro') || interest.includes('comprar') ||
      interest.includes('cotiz') || interest.includes('interesado') || interest.includes('urgente') ||
      interest.includes('compra') || interest.includes('hot')) {
    score += 10
  }

  if (score >= 60) return 'hot'
  if (score >= 30) return 'warm'
  return 'cold'
}

// ─── Main Import Pipeline ────────────────────────────────────

/**
 * Full import pipeline:
 * 1. Detect columns (AI + heuristic fallback)
 * 2. Parse each row
 * 3. Classify leads
 * 4. Create/update Contacts
 * 5. Create Deals in pipeline
 */
export async function processImport(
  rows: ParsedRow[],
  headers: string[],
  workspaceId: string,
): Promise<ImportResult> {
  console.log(`[Import] Starting import for workspace ${workspaceId}: ${rows.length} rows`)

  // 1. Detect column mapping
  const mappingResult = await detectColumns(headers)
  const columnMapping: ColumnMapping = {
    firstName: mappingResult.firstName,
    lastName: mappingResult.lastName,
    phone: mappingResult.phone,
    email: mappingResult.email,
    product: mappingResult.product,
    budget: mappingResult.budget,
    interest: mappingResult.interest,
    stage: mappingResult.stage,
    notes: mappingResult.notes,
    customFields: mappingResult.customFields,
  }
  const detectedIndustry = mappingResult.detectedIndustry

  console.log(`[Import] Column mapping:`, columnMapping)
  console.log(`[Import] Detected industry:`, detectedIndustry)

  // 2. Get pipeline for deal creation
  const pipeline = await db.pipeline.findFirst({
    where: { workspaceId, isActive: true },
    include: { stages: { orderBy: { order: 'asc' } } },
  })

  const firstStage = pipeline?.stages[0]

  // 3. Process each row
  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []
  let hot = 0, warm = 0, cold = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      // Extract fields
      const firstName = columnMapping.firstName ? String(row[columnMapping.firstName] || '').trim() : ''
      const lastName = columnMapping.lastName ? String(row[columnMapping.lastName] || '').trim() : ''
      const phone = columnMapping.phone ? String(row[columnMapping.phone] || '').trim() : ''
      const email = columnMapping.email ? String(row[columnMapping.email] || '').trim() : ''
      const product = columnMapping.product ? String(row[columnMapping.product] || '').trim() : ''
      const budget = columnMapping.budget ? String(row[columnMapping.budget] || '').trim() : ''
      const interest = columnMapping.interest ? String(row[columnMapping.interest] || '').trim() : ''
      const notes = columnMapping.notes ? String(row[columnMapping.notes] || '').trim() : ''

      // Skip rows without at least a name or phone
      if (!firstName && !phone && !email) {
        skipped++
        continue
      }

      // Classify lead
      const classification = classifyLead(row, columnMapping)
      if (classification === 'hot') hot++
      else if (classification === 'warm') warm++
      else cold++

      // Calculate lead score
      const leadScore = classification === 'hot' ? 80 : classification === 'warm' ? 50 : 20

      // Build tags
      const tags: string[] = ['import']
      if (classification === 'hot') tags.push('lead_caliente')
      if (classification === 'warm') tags.push('lead_tibio')
      if (classification === 'cold') tags.push('lead_frio')
      if (product) tags.push('interes_producto')
      if (interest) tags.push(interest.toLowerCase().replace(/\s+/g, '_'))

      // Build custom fields
      const customFields: Record<string, string> = {}
      Object.entries(columnMapping.customFields).forEach(([key, colName]) => {
        const value = String(row[colName] || '').trim()
        if (value) customFields[key] = value
      })
      if (product) customFields.producto_interes = product
      if (budget) customFields.presupuesto = budget

      // Clean phone number (remove non-digits, add +52 if Mexican)
      let cleanPhone = phone.replace(/[^\d]/g, '')
      if (cleanPhone.length === 10) cleanPhone = `52${cleanPhone}`
      else if (cleanPhone.length === 12 && cleanPhone.startsWith('044')) cleanPhone = `52${cleanPhone.slice(3)}`
      else if (cleanPhone.length > 13) cleanPhone = cleanPhone.slice(-13)

      // 4. Upsert contact
      const existingContact = cleanPhone
        ? await db.contact.findFirst({
            where: { workspaceId, phone: cleanPhone, status: { not: 'archived' } },
          })
        : email
          ? await db.contact.findFirst({
              where: { workspaceId, email, status: { not: 'archived' } },
            })
          : null

      let contactId: string
      if (existingContact) {
        // Update existing contact
        const updateData: Record<string, unknown> = { lastMessageAt: new Date() }
        if (firstName && !existingContact.firstName) updateData.firstName = firstName
        if (lastName && !existingContact.lastName) updateData.lastName = lastName
        if (email && !existingContact.email) updateData.email = email
        if (leadScore > existingContact.leadScore) updateData.leadScore = leadScore
        if (tags.length > 0) {
          const existingTags: string[] = JSON.parse(existingContact.tags || '[]')
          const newTags = tags.filter(t => !existingTags.includes(t))
          if (newTags.length > 0) {
            updateData.tags = JSON.stringify([...existingTags, ...newTags])
          }
        }
        if (Object.keys(customFields).length > 0) {
          const existingFields = JSON.parse(existingContact.customFields || '{}')
          updateData.customFields = JSON.stringify({ ...existingFields, ...customFields })
        }
        if (notes) updateData.notes = notes

        await db.contact.update({
          where: { id: existingContact.id },
          data: updateData as any,
        })
        contactId = existingContact.id
        updated++
      } else {
        // Create new contact
        const newContact = await db.contact.create({
          data: {
            workspaceId,
            firstName: firstName || 'Contacto',
            lastName: lastName || null,
            phone: cleanPhone || null,
            email: email || null,
            source: 'import',
            tags: JSON.stringify(tags),
            customFields: JSON.stringify(customFields),
            leadScore,
            notes: notes || null,
          },
        })
        contactId = newContact.id
        created++
      }

      // 5. Create deal if pipeline exists and row has buying signals
      if (firstStage && (classification === 'hot' || classification === 'warm')) {
        const dealTitle = firstName
          ? `${firstName} ${lastName || ''} — ${product || 'Prospecto'}`.trim()
          : product || 'Prospecto importado'

        // Parse budget to number
        const budgetNum = parseFloat(budget.replace(/[^0-9.]/g, '')) || 0

        // Check if deal already exists for this contact
        const existingDeal = await db.deal.findFirst({
          where: {
            workspaceId,
            contactId,
            status: 'active',
          },
        })

        if (!existingDeal) {
          await db.deal.create({
            data: {
              workspaceId,
              pipelineId: pipeline.id,
              stageId: firstStage.id,
              contactId,
              title: dealTitle,
              value: budgetNum,
              currency: 'MXN',
              source: 'import',
              status: 'active',
              description: notes || `Importado del archivo. Clasificación: ${classification}. Producto: ${product || 'N/A'}`,
            },
          })
        }
      }

      // Log progress every 50 rows
      if ((i + 1) % 50 === 0) {
        console.log(`[Import] Processed ${i + 1}/${rows.length} rows (created: ${created}, updated: ${updated}, skipped: ${skipped})`)
      }
    } catch (err) {
      const errorMsg = `Fila ${i + 1}: ${err instanceof Error ? err.message : 'Error desconocido'}`
      errors.push(errorMsg)
      skipped++
      // Don't throw — continue processing other rows
    }
  }

  console.log(`[Import] Complete: created=${created}, updated=${updated}, skipped=${skipped}, errors=${errors.length}`)

  // 6. Generate AI summary of the import
  const summary = await generateImportSummary({
    totalRows: rows.length,
    validRows: created + updated,
    skippedRows: skipped,
    hot, warm, cold,
    detectedIndustry,
    fileName: '',
    headers,
    columnMapping,
  })

  return {
    created,
    updated,
    skipped,
    errors,
    analysis: {
      columnMapping,
      totalRows: rows.length,
      validRows: created + updated,
      skippedRows: skipped,
      classification: { hot, warm, cold },
      detectedIndustry,
      summary,
    },
  }
}

/**
 * Generate a human-readable summary of the import using AI
 */
async function generateImportSummary(params: {
  totalRows: number
  validRows: number
  skippedRows: number
  hot: number
  warm: number
  cold: number
  detectedIndustry: string
  fileName: string
  headers: string[]
  columnMapping: ColumnMapping
}): Promise<string> {
  try {
    const zai = await ZAI.create()

    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente de CRM. Genera un resumen breve (2-3 oraciones) de una importación de datos. Usa español. Sé específico con los números.',
        },
        {
          role: 'user',
          content: `Importación completada:
- Total filas: ${params.totalRows}
- Filas procesadas: ${params.validRows}
- Filas omitidas: ${params.skippedRows}
- Leads calientes: ${params.hot}
- Leads tibios: ${params.warm}
- Leads fríos: ${params.cold}
- Industria detectada: ${params.detectedIndustry}
- Columnas: ${params.headers.join(', ')}
- Mapeo: ${JSON.stringify(params.columnMapping)}

Genera un resumen conciso para el usuario.`,
        },
      ],
    })

    return response.choices[0]?.message?.content || `${params.validRows} contactos procesados.`
  } catch {
    return `Se procesaron ${params.validRows} contactos: ${params.hot} calientes, ${params.warm} tibios, ${params.cold} fríos. ${params.skippedRows} filas omitidas.`
  }
}
