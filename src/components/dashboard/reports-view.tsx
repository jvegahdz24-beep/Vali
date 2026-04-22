'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Download,
  RefreshCw,
  Loader2,
  Filter,
  CalendarDays,
  FileSpreadsheet,
  Code2,
  MessageCircle,
  BarChart3,
  Users,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ── Types ──

interface ReportHistory {
  id: string
  type: string
  format: string
  date: string
  rows: number
}

const reportTypes = [
  { value: 'contacts', label: 'Contactos', icon: <Users className="h-4 w-4" />, description: 'Lista completa de contactos' },
  { value: 'deals', label: 'Deals', icon: <BarChart3 className="h-4 w-4" />, description: 'Pipeline y oportunidades' },
  { value: 'conversations', label: 'Conversaciones', icon: <MessageCircle className="h-4 w-4" />, description: 'Historial de conversaciones' },
  { value: 'analytics', label: 'Analíticas', icon: <Code2 className="h-4 w-4" />, description: 'Resumen de métricas generales' },
]

const formatOptions = [
  { value: 'csv', label: 'CSV', icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
  { value: 'json', label: 'JSON', icon: <Code2 className="h-3.5 w-3.5" /> },
]

interface ReportsViewProps {
  workspaceId: string
}

export function ReportsView({ workspaceId }: ReportsViewProps) {
  const [reportType, setReportType] = useState('contacts')
  const [format, setFormat] = useState('csv')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewData, setPreviewData] = useState<string[]>([])
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [reportHistory, setReportHistory] = useState<ReportHistory[]>([])

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('valiflow_report_history')
    if (saved) {
      try {
        setReportHistory(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  const saveToHistory = useCallback((type: string, fmt: string, rows: number) => {
    const entry: ReportHistory = {
      id: Date.now().toString(),
      type,
      format: fmt,
      date: new Date().toISOString(),
      rows,
    }
    const updated = [entry, ...reportHistory.filter((h) => h.type !== type).slice(0, 9)]
    setReportHistory(updated)
    localStorage.setItem('valiflow_report_history', JSON.stringify(updated))
  }, [reportHistory])

  const generateReport = async () => {
    setIsGenerating(true)
    setPreviewData([])
    setPreviewHeaders([])
    setPreviewRows([])

    try {
      const params = new URLSearchParams({
        workspaceId,
        type: reportType,
        format: 'json', // Always fetch JSON for preview
      })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error('Error al generar reporte')
      const data = await res.json()

      setPreviewHeaders(data.headers || [])
      setPreviewRows(data.data || [])
      setTotalRows(data.totalRows || 0)

      toast.success(`Reporte generado: ${data.totalRows} registros`)
    } catch {
      toast.error('Error al generar el reporte')
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadReport = async () => {
    try {
      const params = new URLSearchParams({
        workspaceId,
        type: reportType,
        format,
      })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error('Error al descargar')

      if (format === 'csv') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reporte_${reportType}_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reporte_${reportType}_${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
      }

      saveToHistory(reportType, format, totalRows)
      toast.success('Reporte descargado exitosamente')
    } catch {
      toast.error('Error al descargar el reporte')
    }
  }

  const typeLabel = reportTypes.find((t) => t.value === reportType)?.label || reportType

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50">
            <FileText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Reportes</h3>
            <p className="text-sm text-muted-foreground">
              Genera y descarga reportes de tu negocio
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600" />
              Configuración del Reporte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Report Type */}
            <div className="grid gap-2">
              <Label>Tipo de Reporte</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        {t.icon}
                        <div>
                          <span className="font-medium">{t.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="grid gap-2">
              <Label>Formato</Label>
              <div className="grid grid-cols-2 gap-2">
                {formatOptions.map((f) => (
                  <Button
                    key={f.value}
                    variant={format === f.value ? 'default' : 'outline'}
                    className={cn(
                      'gap-2 justify-center',
                      format === f.value && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    )}
                    onClick={() => setFormat(f.value)}
                  >
                    {f.icon}
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Rango de Fechas
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => { setStartDate(''); setEndDate('') }}
                >
                  Limpiar fechas
                </Button>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              <Button
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={generateReport}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Generar Reporte
              </Button>
              {previewRows.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={downloadReport}
                >
                  <Download className="h-4 w-4" />
                  Descargar {formatLabel(format)}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <div className="lg:col-span-2 space-y-4">
          {isGenerating ? (
            <Card className="border-border/60">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                  <p className="text-sm text-muted-foreground">Generando reporte...</p>
                </div>
              </CardContent>
            </Card>
          ) : previewRows.length > 0 ? (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                    Vista Previa — {typeLabel}
                  </CardTitle>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                    {totalRows} registros
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60">
                        {previewHeaders.slice(0, 8).map((h) => (
                          <TableHead key={h} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/40">
                      {previewRows.slice(0, 10).map((row, i) => (
                        <TableRow key={i} className="hover:bg-muted/30">
                          {previewHeaders.slice(0, 8).map((h) => (
                            <TableCell key={h} className="py-2.5 text-xs max-w-[200px] truncate">
                              {String(row[h] ?? '—')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalRows > 10 && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Mostrando 10 de {totalRows} registros. Descarga el reporte completo.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60">
              <CardContent className="p-12 text-center">
                <div className="p-4 rounded-2xl bg-emerald-50 w-fit mx-auto mb-4">
                  <FileText className="h-10 w-10 text-emerald-600" />
                </div>
                <h4 className="text-sm font-semibold mb-1">Sin vista previa</h4>
                <p className="text-xs text-muted-foreground">
                  Configura tu reporte y haz clic en &quot;Generar Reporte&quot; para ver una vista previa.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Report History */}
          {reportHistory.length > 0 && (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  Reportes Recientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reportHistory.slice(0, 5).map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-emerald-50">
                          {reportTypes.find((t) => t.value === h.type)?.icon || <FileText className="h-3.5 w-3.5 text-emerald-600" />}
                        </div>
                        <div>
                          <p className="text-xs font-medium">
                            {reportTypes.find((t) => t.value === h.type)?.label || h.type}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(h.date).toLocaleString('es-MX')} · {h.rows} registros
                          </p>
                        </div>
                      </div>
                      <Badge className="text-[9px] px-1.5 py-0 bg-zinc-100 text-zinc-600 border-0 uppercase font-bold">
                        {h.format}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function formatLabel(format: string) {
  switch (format) {
    case 'csv': return 'CSV'
    case 'json': return 'JSON'
    default: return format.toUpperCase()
  }
}
