// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — File Parser (xlsx, csv, pdf)
// Extracts structured data from uploaded files
// ═══════════════════════════════════════════════════════════════

import * as XLSX from 'xlsx'

export interface ParsedRow {
  [key: string]: string | number | boolean | null | undefined
}

export interface ParseResult {
  rows: ParsedRow[]
  headers: string[]
  totalRows: number
  sheetName: string
  fileType: string
}

/**
 * Parse an Excel file (.xlsx, .xls) or CSV
 */
export function parseExcelOrCSV(buffer: ArrayBuffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    cellNF: false,
    cellText: true,
  })

  // Use the first sheet
  const sheetName = workbook.SheetNames[0] || 'Sheet1'
  const sheet = workbook.Sheets[sheetName]

  if (!sheet) {
    throw new Error(`No se encontró hoja de cálculo en "${fileName}"`)
  }

  // Convert to array of arrays
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  if (rawData.length === 0) {
    throw new Error('El archivo está vacío')
  }

  // First row = headers
  const headers = (rawData[0] as (string | number | null)[]).map((h, i) =>
    h ? String(h).trim() : `Columna_${i + 1}`
  )

  // Remaining rows = data
  const rows: ParsedRow[] = []
  for (let i = 1; i < rawData.length; i++) {
    const rawRow = rawData[i] as (string | number | boolean | null)[]
    if (rawRow.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
      continue // skip completely empty rows
    }
    const row: ParsedRow = {}
    headers.forEach((header, colIdx) => {
      row[header] = rawRow[colIdx] ?? null
    })
    rows.push(row)
  }

  return {
    rows,
    headers,
    totalRows: rows.length,
    sheetName,
    fileType: fileName.split('.').pop() || 'unknown',
  }
}

/**
 * Parse a PDF file — extracts text content
 * Note: For tabular PDFs, this extracts text blocks.
 * Complex table extraction requires additional processing.
 */
export async function parsePDF(buffer: ArrayBuffer, fileName: string): Promise<ParseResult> {
  // Dynamic import to avoid issues in client-side
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = (await import('pdf-parse') as any).default || (await import('pdf-parse'))

  const uint8Array = new Uint8Array(buffer)
  const pdfData = await pdfParse(uint8Array)

  const text = pdfData.text || ''

  if (!text.trim()) {
    throw new Error('No se pudo extraer texto del PDF')
  }

  // Try to detect if the PDF contains tabular data
  const lines = text.split('\n').filter(l => l.trim().length > 0)

  // Heuristic: if most lines have multiple tab/space-separated values,
  // treat as tabular data
  const tabularLines = lines.filter(l => {
    const parts = l.split(/[\t|]+/).filter(p => p.trim().length > 0)
    return parts.length >= 2
  })

  if (tabularLines.length > lines.length * 0.5) {
    // Treat as tabular
    const separator = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : /\s{2,}/

    const allRows = lines
      .map(line => line.split(separator).map(cell => cell.trim()).filter(Boolean))
      .filter(row => row.length >= 2)

    if (allRows.length === 0) {
      throw new Error('No se detectaron filas de datos en el PDF')
    }

    const headers = allRows[0].map((h, i) => h || `Columna_${i + 1}`)
    const rows: ParsedRow[] = []

    for (let i = 1; i < allRows.length; i++) {
      const row: ParsedRow = {}
      headers.forEach((header, colIdx) => {
        row[header] = allRows[i][colIdx] ?? null
      })
      rows.push(row)
    }

    return {
      rows,
      headers,
      totalRows: rows.length,
      sheetName: 'PDF',
      fileType: 'pdf',
    }
  }

  // Non-tabular PDF: create a single "content" row
  return {
    rows: [{ contenido: text.substring(0, 50000) }],
    headers: ['contenido'],
    totalRows: 1,
    sheetName: 'PDF',
    fileType: 'pdf',
  }
}

/**
 * Main parser: auto-detect file type and parse
 */
export async function parseFile(buffer: ArrayBuffer, fileName: string): Promise<ParseResult> {
  const ext = fileName.toLowerCase().split('.').pop() || ''

  if (['xlsx', 'xls'].includes(ext)) {
    return parseExcelOrCSV(buffer, fileName)
  }

  if (ext === 'csv') {
    return parseExcelOrCSV(buffer, fileName)
  }

  if (ext === 'pdf') {
    return parsePDF(buffer, fileName)
  }

  throw new Error(`Formato no soportado: .${ext}. Usa Excel (.xlsx, .xls), CSV o PDF.`)
}

/**
 * Detect the size of a file in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
