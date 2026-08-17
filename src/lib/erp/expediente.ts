// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Expediente Integrator (Revenue Engine submódulo 8)
// Vincula documentos (INE, RFC, comprobante, contrato, cotización,
// factura) al expediente digital de cada contacto. Habilita el
// cierre y la facturación CFDI sin intervención humana.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logTimelineEvent } from '@/lib/erp/bitacora'

const DOC_LABEL: Record<string, string> = {
  ine: 'INE',
  identificacion: 'identificación',
  rfc: 'RFC / constancia fiscal',
  comprobante_domicilio: 'comprobante de domicilio',
  contrato: 'contrato',
  cotizacion: 'cotización',
  factura: 'factura',
  otro: 'documento',
}

export const EXPEDIENTE_CATEGORIES = [
  'ine',
  'identificacion',
  'rfc',
  'comprobante_domicilio',
  'contrato',
  'cotizacion',
  'factura',
  'otro',
] as const

export type ExpedienteCategory = (typeof EXPEDIENTE_CATEGORIES)[number]

/** Documents required before a contact can be invoiced / closed. */
export const REQUIRED_FOR_INVOICE: ExpedienteCategory[] = ['rfc', 'identificacion']

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'docx', 'xlsx', 'xml']

export interface AttachmentInput {
  fileName: string
  mimeType?: string
  filePath: string
  fileSize?: number
  source?: 'upload' | 'whatsapp' | 'system'
  mediaFileId?: string
  category?: ExpedienteCategory
  notes?: string
  uploadedBy?: string
}

/**
 * Infers an expediente category from a file name / caption using simple
 * keyword rules. Pure function — safe to unit test. Falls back to 'otro'.
 */
export function detectExpedienteCategory(nameOrCaption: string): ExpedienteCategory {
  const raw = (nameOrCaption || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  // Word-separated form so tokens like "INE_frente" / "RFC.pdf" match word boundaries.
  const s = raw.replace(/[^a-z0-9]+/g, ' ')
  const ext = raw.split('.').pop() || ''

  if (ext === 'xml') return 'factura'
  if (/\bine\b|credencial|elector/.test(s)) return 'ine'
  if (/pasaporte|licencia|identif/.test(s)) return 'identificacion'
  if (/\brfc\b|constancia.*fiscal|situacion fiscal|cedula fiscal/.test(s)) return 'rfc'
  if (/comprobante.*dom|recibo.*(luz|cfe|agua|telmex)|domicilio/.test(s)) return 'comprobante_domicilio'
  if (/contrato|convenio/.test(s)) return 'contrato'
  if (/cotiza|presupuesto|quote/.test(s)) return 'cotizacion'
  if (/factura|cfdi/.test(s)) return 'factura'
  return 'otro'
}

/** Returns true if the file extension is an allowed document type. */
export function isAllowedDocument(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return ALLOWED_EXTENSIONS.includes(ext)
}

export interface ExpedienteLinkResult {
  contactId: string
  linked: number
  skipped: { fileName: string; reason: string }[]
}

/**
 * Links one or more attachments to a contact's expediente. Skips files with
 * disallowed extensions. Auto-detects category when not provided.
 */
export async function linkToExpediente(
  workspaceId: string,
  contactId: string,
  attachments: AttachmentInput[],
): Promise<ExpedienteLinkResult> {
  const skipped: { fileName: string; reason: string }[] = []
  const toCreate: AttachmentInput[] = []

  for (const att of attachments) {
    if (!isAllowedDocument(att.fileName)) {
      skipped.push({ fileName: att.fileName, reason: `Extensión no permitida` })
      continue
    }
    toCreate.push(att)
  }

  let linked = 0
  for (const att of toCreate) {
    // De-dupe: skip if the same mediaFile is already filed for this contact
    if (att.mediaFileId) {
      const existing = await db.expedienteFile.findFirst({
        where: { contactId, mediaFileId: att.mediaFileId },
        select: { id: true },
      })
      if (existing) {
        skipped.push({ fileName: att.fileName, reason: 'Ya estaba en el expediente' })
        continue
      }
    }
    const category = att.category ?? detectExpedienteCategory(att.notes || att.fileName)
    await db.expedienteFile.create({
      data: {
        workspaceId,
        contactId,
        category,
        fileName: att.fileName,
        mimeType: att.mimeType ?? 'application/octet-stream',
        fileSize: att.fileSize ?? 0,
        filePath: att.filePath,
        source: att.source ?? 'upload',
        mediaFileId: att.mediaFileId ?? null,
        notes: att.notes ?? null,
        uploadedBy: att.uploadedBy ?? null,
      },
    })
    // Anota el documento en la bitácora del expediente (trazabilidad).
    await logTimelineEvent({
      workspaceId,
      contactId,
      type: 'document',
      title: `📎 Documento recibido: ${DOC_LABEL[category] ?? category}`,
      detail: att.fileName,
      dedupeKey: att.mediaFileId ?? att.fileName,
      source: att.source === 'whatsapp' ? 'system' : 'human',
      importance: 'normal',
    })
    linked++
  }

  return { contactId, linked, skipped }
}

/** Returns the full expediente (all files) for a contact, newest first. */
export async function getExpediente(workspaceId: string, contactId: string) {
  return db.expedienteFile.findMany({
    where: { workspaceId, contactId },
    orderBy: { createdAt: 'desc' },
  })
}

export interface ExpedienteSummary {
  contactId: string
  totalFiles: number
  filesByCategory: Record<string, number>
  lastUpload: Date | null
  /** Whether the docs required for invoicing are present. */
  readyForInvoice: boolean
  missingForInvoice: ExpedienteCategory[]
}

/**
 * Aggregated status of a contact's expediente, including whether the documents
 * required to issue an invoice / close are present.
 */
export async function getExpedienteSummary(
  workspaceId: string,
  contactId: string,
): Promise<ExpedienteSummary> {
  const files = await db.expedienteFile.findMany({
    where: { workspaceId, contactId },
    select: { category: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const filesByCategory: Record<string, number> = {}
  for (const f of files) {
    filesByCategory[f.category] = (filesByCategory[f.category] || 0) + 1
  }

  const present = new Set(Object.keys(filesByCategory))
  // INE counts as identificacion for invoicing purposes.
  if (present.has('ine')) present.add('identificacion')
  const missingForInvoice = REQUIRED_FOR_INVOICE.filter((c) => !present.has(c))

  return {
    contactId,
    totalFiles: files.length,
    filesByCategory,
    lastUpload: files[0]?.createdAt ?? null,
    readyForInvoice: missingForInvoice.length === 0,
    missingForInvoice,
  }
}

/**
 * Convenience used by the message pipeline: when an inbound message carries a
 * document attachment, file it into the contact's expediente automatically.
 * Non-throwing — failures are swallowed so they never break message handling.
 */
export async function autoAttachMediaToExpediente(params: {
  workspaceId: string
  contactId: string
  mediaFileId: string
  fileName: string
  mimeType: string
  fileSize?: number
  filePath: string
  caption?: string
}): Promise<void> {
  try {
    if (!isAllowedDocument(params.fileName)) return
    await linkToExpediente(params.workspaceId, params.contactId, [
      {
        fileName: params.fileName,
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        filePath: params.filePath,
        source: 'whatsapp',
        mediaFileId: params.mediaFileId,
        category: detectExpedienteCategory(params.caption || params.fileName),
        notes: params.caption,
      },
    ])
  } catch (err) {
    console.warn('[Expediente] autoAttach failed (non-critical):', err instanceof Error ? err.message : err)
  }
}
