'use client'

import { useState } from 'react'
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
  DollarSign,
  Users,
  Calendar,
  Building2,
  TrendingUp,
  ArrowRight,
  UserCheck,
  UserX,
} from 'lucide-react'
import { ScoreRing } from '@/components/ui/score-ring'

// ── Types ──

interface Vendedor {
  id: string
  nombre: string
  leads: number
  conversion: number
  enLinea: boolean
  score: number
}

interface ClienteSaaS {
  id: string
  agencia: string
  plan: 'Enterprise' | 'Pro' | 'Free'
  mrr: number
  estatus: 'Activo' | 'Trial'
}

interface AdminViewProps {
  workspaceId: string
}

// ── Mock Data ──

const mockAdminMetrics = {
  mrrTotal: 187500,
  leadsTotales: 1423,
  citasConfirmadas: 287,
  clientesSaaS: 64,
}

const mockFunnel = [
  { etapa: 'Lead', valor: 1423, pct: 100 },
  { etapa: 'Respuesta', valor: 891, pct: 63 },
  { etapa: 'Calificado', valor: 534, pct: 38 },
  { etapa: 'Cita', valor: 287, pct: 20 },
  { etapa: 'Venta', valor: 96, pct: 7 },
]

const mockVendedores: Vendedor[] = [
  { id: '1', nombre: 'Ricardo Álvarez Fuentes', leads: 342, conversion: 12.4, enLinea: true, score: 92 },
  { id: '2', nombre: 'Patricia Vega Salinas', leads: 298, conversion: 9.8, enLinea: true, score: 85 },
  { id: '3', nombre: 'Miguel Ángel Castro', leads: 256, conversion: 7.2, enLinea: false, score: 68 },
  { id: '4', nombre: 'Sofía Hernández Luna', leads: 213, conversion: 11.1, enLinea: true, score: 88 },
  { id: '5', nombre: 'Andrés Manuel Reyes', leads: 178, conversion: 5.6, enLinea: false, score: 52 },
  { id: '6', nombre: 'Valentina Morales Ibarra', leads: 136, conversion: 14.7, enLinea: true, score: 95 },
]

const mockClientes: ClienteSaaS[] = [
  { id: '1', agencia: 'AutoGrupo del Norte', plan: 'Enterprise', mrr: 8500, estatus: 'Activo' },
  { id: '2', agencia: 'Motors CDMX', plan: 'Enterprise', mrr: 7200, estatus: 'Activo' },
  { id: '3', agencia: 'Autos Premier Jalisco', plan: 'Pro', mrr: 4500, estatus: 'Activo' },
  { id: '4', agencia: 'Dealership Monterrey', plan: 'Pro', mrr: 4500, estatus: 'Activo' },
  { id: '5', agencia: 'AutoMax Puebla', plan: 'Pro', mrr: 4500, estatus: 'Trial' },
  { id: '6', agencia: 'CarConnect Guadalajara', plan: 'Free', mrr: 0, estatus: 'Trial' },
  { id: '7', agencia: 'Grupo Automotriz León', plan: 'Enterprise', mrr: 9200, estatus: 'Activo' },
  { id: '8', agencia: 'SellAuto Querétaro', plan: 'Free', mrr: 0, estatus: 'Trial' },
]

// ── Helpers ──

function formatMRR(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPlanBadge(plan: string) {
  switch (plan) {
    case 'Enterprise':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Enterprise
        </Badge>
      )
    case 'Pro':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Pro
        </Badge>
      )
    case 'Free':
      return (
        <Badge className="bg-zinc-100 text-zinc-600 border-0 text-[10px] px-2 py-0.5 font-semibold">
          Free
        </Badge>
      )
    default:
      return null
  }
}

function getEstatusBadge(estatus: string) {
  switch (estatus) {
    case 'Activo':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 gap-1">
          <UserCheck className="h-3 w-3" />
          Activo
        </Badge>
      )
    case 'Trial':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-2 py-0.5 gap-1">
          <Calendar className="h-3 w-3" />
          Trial
        </Badge>
      )
    default:
      return null
  }
}

function getOnlineBadge(enLinea: boolean) {
  return enLinea ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-2 py-0.5 gap-1">
      <UserCheck className="h-3 w-3" />
      En línea
    </Badge>
  ) : (
    <Badge className="bg-zinc-100 text-zinc-500 border-0 text-[10px] px-2 py-0.5 gap-1">
      <UserX className="h-3 w-3" />
      Offline
    </Badge>
  )
}

// ── Component ──

export function AdminView({ workspaceId }: AdminViewProps) {
  const [metrics] = useState(mockAdminMetrics)
  const [funnel] = useState(mockFunnel)
  const [vendedores] = useState(mockVendedores)
  const [clientes] = useState(mockClientes)

  const metricCards = [
    {
      title: 'MRR Total',
      value: formatMRR(metrics.mrrTotal),
      description: 'Ingresos mensuales recurrentes',
      icon: <DollarSign className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Leads Totales',
      value: metrics.leadsTotales.toLocaleString('es-MX'),
      description: 'Prospectos en el embudo',
      icon: <Users className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Citas Confirmadas',
      value: metrics.citasConfirmadas.toLocaleString('es-MX'),
      description: 'Citas agendadas este mes',
      icon: <Calendar className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Clientes SaaS',
      value: metrics.clientesSaaS.toString(),
      description: 'Agencias suscritas',
      icon: <Building2 className="h-4 w-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Admin</h3>
          <p className="text-sm text-muted-foreground">
            Gestión del negocio SaaS y métricas de ventas
          </p>
        </div>
      </div>

      {/* Metric Cards */}
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

      {/* Funnel Visualization */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Embudo de Conversión
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {funnel.map((step, index) => {
              const conversionRate =
                index > 0 && funnel[index - 1].valor > 0
                  ? Math.round((step.valor / funnel[index - 1].valor) * 100)
                  : null

              return (
                <div key={step.etapa} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{step.etapa}</span>
                      {conversionRate !== null && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] px-1.5 py-0 gap-0.5">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {conversionRate}%
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground font-medium">
                      {step.valor.toLocaleString('es-MX')}
                      <span className="text-muted-foreground/60 ml-1">({step.pct}%)</span>
                    </span>
                  </div>
                  <div className="h-7 bg-muted/50 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-md transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(step.pct, 3)}%`,
                        opacity: 1 - index * 0.15,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Vendedores Table */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-semibold text-muted-foreground">
                      Nombre
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Leads
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Conversión %
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Estatus
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Score
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {vendedores.map((vendedor) => (
                    <TableRow key={vendedor.id} className="hover:bg-muted/30">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {vendedor.nombre
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                            {vendedor.nombre}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center text-sm font-medium text-foreground">
                        {vendedor.leads}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <Badge
                          className={cn(
                            'border-0 text-[10px] px-2 py-0.5 font-semibold',
                            vendedor.conversion >= 10
                              ? 'bg-emerald-100 text-emerald-700'
                              : vendedor.conversion >= 7
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-orange-100 text-orange-700'
                          )}
                        >
                          {vendedor.conversion}%
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getOnlineBadge(vendedor.enLinea)}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center">
                          <ScoreRing score={vendedor.score} size={36} strokeWidth={3} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Clientes SaaS Table */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600" />
              Clientes SaaS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-semibold text-muted-foreground">
                      Agencia
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Plan
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      MRR
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                      Estatus
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {clientes.map((cliente) => (
                    <TableRow key={cliente.id} className="hover:bg-muted/30">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {cliente.agencia
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate max-w-[170px]">
                            {cliente.agencia}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getPlanBadge(cliente.plan)}
                      </TableCell>
                      <TableCell className="py-3 text-center text-sm font-semibold text-foreground">
                        {cliente.mrr > 0 ? formatMRR(cliente.mrr) : '—'}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {getEstatusBadge(cliente.estatus)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
