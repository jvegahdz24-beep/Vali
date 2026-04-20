// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Data Export Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Convert an array of objects to CSV string
 * Handles nested objects, dates, and special characters
 */
export function objectsToCSV<T extends Record<string, unknown>>(
  data: T[],
  options?: {
    columns?: string[]
    headers?: Record<string, string>
    delimiter?: string
  }
): string {
  if (data.length === 0) return ''

  const delimiter = options?.delimiter || ','
  const columns = options?.columns || Object.keys(data[0])
  const headers = options?.headers || {}

  // Build header row
  const headerRow = columns.map((col) => {
    const label = headers[col] || col
    return escapeCSVField(label, delimiter)
  })

  // Build data rows
  const dataRows = data.map((row) => {
    return columns.map((col) => {
      const value = row[col]
      return escapeCSVField(formatCSVValue(value), delimiter)
    })
  })

  return [headerRow.join(delimiter), ...dataRows.map((row) => row.join(delimiter))].join('\n')
}

/**
 * Escape a field for CSV format
 */
function escapeCSVField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Format a value for CSV output
 */
function formatCSVValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * Trigger a file download in the browser
 */
export function triggerDownload(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\ufeff' + content], { type: mimeType }) // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export contacts to CSV
 */
export function exportContactsCSV(contacts: Array<Record<string, unknown>>) {
  const headers: Record<string, string> = {
    firstName: 'Nombre',
    lastName: 'Apellido',
    phone: 'Teléfono',
    email: 'Correo',
    source: 'Fuente',
    status: 'Estado',
    leadScore: 'Lead Score',
    tags: 'Etiquetas',
    createdAt: 'Fecha de creación',
    lastMessageAt: 'Último mensaje',
  }

  const columns = ['firstName', 'lastName', 'phone', 'email', 'source', 'status', 'leadScore', 'tags', 'createdAt', 'lastMessageAt']

  const csv = objectsToCSV(contacts, { columns, headers })
  triggerDownload(csv, `valiflow-contactos-${new Date().toISOString().slice(0, 10)}.csv`)
}

/**
 * Export deals to CSV
 */
export function exportDealsCSV(deals: Array<Record<string, unknown>>) {
  const headers: Record<string, string> = {
    title: 'Trato',
    value: 'Valor',
    currency: 'Moneda',
    status: 'Estado',
    source: 'Fuente',
    contactName: 'Contacto',
    stageName: 'Etapa',
    createdAt: 'Fecha de creación',
    updatedAt: 'Última actualización',
  }

  const columns = ['title', 'value', 'currency', 'status', 'source', 'contactName', 'stageName', 'createdAt', 'updatedAt']

  const csv = objectsToCSV(deals, { columns, headers })
  triggerDownload(csv, `valiflow-tratos-${new Date().toISOString().slice(0, 10)}.csv`)
}

/**
 * Export conversations to CSV
 */
export function exportConversationsCSV(conversations: Array<Record<string, unknown>>) {
  const headers: Record<string, string> = {
    contactName: 'Contacto',
    channel: 'Canal',
    status: 'Estado',
    lastMessagePreview: 'Último mensaje',
    unreadCount: 'No leídos',
    lastMessageAt: 'Última actividad',
    createdAt: 'Fecha de creación',
  }

  const columns = ['contactName', 'channel', 'status', 'lastMessagePreview', 'unreadCount', 'lastMessageAt', 'createdAt']

  const csv = objectsToCSV(conversations, { columns, headers })
  triggerDownload(csv, `valiflow-conversaciones-${new Date().toISOString().slice(0, 10)}.csv`)
}
