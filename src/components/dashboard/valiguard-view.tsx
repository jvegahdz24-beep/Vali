'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Shield,
  ShieldCheck,
  FileCheck,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { ScoreRing } from '@/components/ui/score-ring'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ──

interface ComplianceContact {
  id: string
  nombre: string
  consentimiento: number
  estatusSellado: 'sellado' | 'pendiente' | 'vencido'
  cumplimiento: number
}

interface ComplianceMetrics {
  consentimientos: number
  registrosAuditables: number
  sellados: number
  cumplimiento: number
  totalContactos: number
  contactosActivos: number
  contactosBloqueados: number
  leadsCalificados: number
  leadsCalientes: number
  ingresosSellados: number
}

interface ValiGuardViewProps {
  workspaceId: string
}

// ── Helpers ──

function getSelladoBadge(estatus: string) {
  switch (estatus) {
    case 'sellado':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Sellado
        </Badge>
      )
    case 'pendiente':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-2 py-0.5 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Pendiente
        </Badge>
      )
    case 'vencido':
      return (
        <Badge className="bg-red-100 text-red-700 border-0 text-[10px] px-2 py-0.5 gap-1">
          <XCircle className="h-3 w-3" />
          Vencido
        </Badge>
      )
    default:
      return null
  }
}

function getCumplimientoBadge(pct: number) {
  if (pct >= 80) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
        {pct}%
      </Badge>
    )
  }
  if (pct >= 60) {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
        {pct}%
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
      {pct}%
    </Badge>
  )
}

// ── Component ──

export function ValiGuardView({ workspaceId }: ValiGuardViewProps) {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null)
  const [contacts, setContacts] = useState<ComplianceContact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!workspaceId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/valiguard?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const data = await res.json()
      setMetrics(data.metrics)
      setContacts(data.contacts || [])
    } catch {
      // Use fallback zeros
      setMetrics({
        consentimientos: 0,
        registrosAuditables: 0,
        sellados: 0,
        cumplimiento: 0,
        totalContactos: 0,
        contactosActivos: 0,
        contactosBloqueados: 0,
        leadsCalificados: 0,
        leadsCalientes: 0,
        ingresosSellados: 0,
      })
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const metricCards = [
    {
      title: 'Consentimientos',
      value: `${metrics?.consentimientos ?? 0}%`,
      description: 'Tasa de consentimiento de datos',
      icon: <ShieldCheck className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Registros Auditables',
      value: (metrics?.registrosAuditables ?? 0).toLocaleString('es-MX'),
      description: 'Total de registros con bitácora',
      icon: <FileCheck className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Sellados',
      value: (metrics?.sellados ?? 0).toLocaleString('es-MX'),
      description: 'Deals cerrados exitosamente',
      icon: <Lock className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Cumplimiento',
      value: `${metrics?.cumplimiento ?? 0}%`,
      description: 'Nivel general LFPDPPP',
      icon: <Shield className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50">
            <Shield className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">ValiGuard</h3>
              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 gap-1">
                <Lock className="h-3 w-3" />
                LFPDPPP
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Cumplimiento de protección de datos personales
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <Skeleton className="h-8 w-8 rounded-lg mb-3" />
                <Skeleton className="h-6 w-20 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((metric) => (
            <Card key={metric.title} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', metric.bg)}>
                    <span className={metric.color}>{metric.icon}</span>
                  </div>
                </div>
                <p className="text-xl font-bold text-foreground">{metric.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{metric.title}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{metric.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Compliance Table */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Cumplimiento por Contacto
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No hay contactos para mostrar</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-semibold text-muted-foreground">
                      Nombre
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Consentimiento %
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Estatus Sellado
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Cumplimiento
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} className="hover:bg-muted/30">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {contact.nombre
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                            {contact.nombre}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center">
                          <ScoreRing score={contact.consentimiento} size={40} strokeWidth={3} />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getSelladoBadge(contact.estatusSellado)}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getCumplimientoBadge(contact.cumplimiento)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
