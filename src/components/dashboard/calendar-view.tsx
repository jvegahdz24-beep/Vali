'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import {
  Calendar,
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Phone,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Edit3,
  Car,
  Wrench,
  Building2,
  Truck,
  Sparkles,
  MessageCircle,
  ExternalLink,
  Clock,
  ListChecks,
  Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

// ── Types ──

interface AppointmentWithContact {
  id: string
  title: string
  description: string | null
  date: string
  duration: number
  type: string
  status: string
  createdAt?: string
  contactId: string | null
  contact: { id: string; firstName: string; lastName: string | null; phone: string | null; leadScore?: number | null } | null
}

interface CalendarStats {
  totalThisMonth: number
  completedThisMonth: number
  pendingThisMonth: number
  cancelledThisMonth: number
}

interface TeamMember {
  userId: string
  role: string
  messagesSent?: number
  user: { id: string; name: string | null; email: string; image?: string | null }
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

// Tipos de cita (verticales automotrices). Compatibles hacia atrás con los
// tipos base que ya existen en BD (call/meeting/followup/task).
interface TypeMeta {
  label: string
  dot: string           // color del punto/leyenda
  bar: string           // borde-izquierdo de la tarjeta
  chip: string          // fondo+texto de la tarjeta/badge
  icon: React.ReactNode
}
const typeConfig: Record<string, TypeMeta> = {
  test_drive: { label: 'Prueba de manejo', dot: 'bg-violet-500', bar: 'border-l-violet-500', chip: 'bg-violet-500/12 text-violet-600 dark:text-violet-300 border border-violet-500/30', icon: <Car className="h-3 w-3" /> },
  followup:   { label: 'Seguimiento',        dot: 'bg-emerald-500', bar: 'border-l-emerald-500', chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30', icon: <RefreshCw className="h-3 w-3" /> },
  delivery:   { label: 'Entrega de vehículo', dot: 'bg-indigo-500', bar: 'border-l-indigo-500', chip: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30', icon: <Truck className="h-3 w-3" /> },
  agency:     { label: 'Cita en agencia',    dot: 'bg-amber-500', bar: 'border-l-amber-500', chip: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border border-amber-500/30', icon: <Building2 className="h-3 w-3" /> },
  call:       { label: 'Llamada / Videollamada', dot: 'bg-rose-500', bar: 'border-l-rose-500', chip: 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border border-rose-500/30', icon: <Phone className="h-3 w-3" /> },
  service:    { label: 'Servicio / Postventa', dot: 'bg-cyan-500', bar: 'border-l-cyan-500', chip: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30', icon: <Wrench className="h-3 w-3" /> },
  meeting:    { label: 'Reunión',            dot: 'bg-purple-500', bar: 'border-l-purple-500', chip: 'bg-purple-500/12 text-purple-600 dark:text-purple-300 border border-purple-500/30', icon: <Users className="h-3 w-3" /> },
  task:       { label: 'Tarea',              dot: 'bg-teal-500', bar: 'border-l-teal-500', chip: 'bg-teal-500/12 text-teal-600 dark:text-teal-300 border border-teal-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
}
// Orden y catálogo mostrado en "Tipos de cita" (vertical auto).
const TYPE_ORDER = ['test_drive', 'followup', 'delivery', 'agency', 'call', 'service']
const typeMeta = (t: string): TypeMeta => typeConfig[t] || typeConfig.call

const statusConfig: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Confirmada', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' },
  completed: { label: 'Completada', chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30' },
  cancelled: { label: 'Cancelada', chip: 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30' },
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario', admin: 'Administrador', member: 'Asesor comercial', viewer: 'Solo lectura',
}

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAYS_MINI = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── Timezone handling (per-workspace) ──
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value
  const hour = map.hour === '24' ? '00' : map.hour
  const asIfUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +hour, +map.minute, +map.second)
  return asIfUtc - date.getTime()
}
function zParts(input: string | Date, tz: string): { dateStr: string; hour: number; minute: number } {
  const t = (typeof input === 'string' ? new Date(input) : input).getTime()
  const shifted = new Date(t + tzOffsetMs(new Date(t), tz))
  return { dateStr: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() }
}
function zInputToUtcISO(localStr: string, tz: string): string {
  const guess = new Date(localStr + ':00Z').getTime()
  const off = tzOffsetMs(new Date(guess), tz)
  return new Date(guess - off).toISOString()
}
function utcISOToZInput(iso: string, tz: string): string {
  const t = new Date(iso).getTime()
  return new Date(t + tzOffsetMs(new Date(t), tz)).toISOString().slice(0, 16)
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1 // Monday = 0
}
function startOfWeekMon(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  r.setHours(0, 0, 0, 0)
  return r
}
function isSameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface CalendarViewProps {
  workspaceId: string
  onViewChange?: (view: string) => void
  onOpenContact?: (contactId: string) => void
}

export function CalendarView({ workspaceId, onViewChange, onOpenContact }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [appointments, setAppointments] = useState<AppointmentWithContact[]>([])
  const [upcoming, setUpcoming] = useState<AppointmentWithContact[]>([])
  const [stats, setStats] = useState<CalendarStats>({ totalThisMonth: 0, completedThisMonth: 0, pendingThisMonth: 0, cancelledThisMonth: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [contacts, setContacts] = useState<{ id: string; firstName: string; lastName: string | null }[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [timezone, setTimezone] = useState<string>('America/Mexico_City')
  const [reminders, setReminders] = useState<{ appointment: boolean; followup: boolean }>({ appointment: true, followup: true })
  const [savingReminder, setSavingReminder] = useState(false)

  // Cita seleccionada → panel de detalle a la derecha
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'detalles' | 'cliente' | 'notas'>('detalles')

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithContact | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Bloquear día completo (la IA no agenda ese día)
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [blockDate, setBlockDate] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockSaving, setBlockSaving] = useState(false)

  const handleBlockDay = async () => {
    if (!blockDate) return
    setBlockSaving(true)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: `Bloqueado — ${blockReason.trim() || 'No disponible'}`,
          description: 'Día bloqueado: la IA no agenda citas este día.',
          date: `${blockDate}T08:00`,
          duration: 720, // 8:00–20:00 → cubre todo el horario de atención
          type: 'blocked',
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Día bloqueado (${blockDate}) — la IA no agendará citas ese día`)
      setShowBlockDialog(false); setBlockDate(''); setBlockReason('')
      fetchAppointments()
    } catch { toast.error('No se pudo bloquear el día') } finally { setBlockSaving(false) }
  }

  // Acceso directo desde el Tablero/Bandeja ("Agendar Cita") → abre el modal al
  // llegar. Formato: 'new-appointment' o 'new-appointment:<contactId>' — con
  // contactId, el CLIENTE llega YA seleccionado (antes te mandaba "al general").
  useEffect(() => {
    try {
      const qa = sessionStorage.getItem('vaf-quick-action') || ''
      if (qa === 'new-appointment' || qa.startsWith('new-appointment:')) {
        sessionStorage.removeItem('vaf-quick-action')
        const contactId = qa.includes(':') ? qa.split(':')[1] : ''
        if (contactId) setFormData((prev) => ({ ...prev, contactId }))
        setShowCreateDialog(true)
      }
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [formData, setFormData] = useState({
    title: '', description: '', date: '', duration: '30', type: 'test_drive', contactId: '',
  })

  const fetchAppointments = useCallback(async () => {
    try {
      setIsLoading(true)
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      // Traemos un rango amplio (mes anterior → mes siguiente) para que la vista
      // semanal a caballo entre meses y la agenda tengan datos completos.
      const startDate = new Date(year, month - 1, 1).toISOString()
      const endDate = new Date(year, month + 2, 1).toISOString()
      const params = new URLSearchParams({ workspaceId, startDate, endDate })
      const res = await fetch(`/api/calendar?${params}`)
      if (!res.ok) throw new Error('Error al cargar citas')
      const data = await res.json()
      setAppointments(data.appointments || [])
      setStats(data.stats || { totalThisMonth: 0, completedThisMonth: 0, pendingThisMonth: 0, cancelledThisMonth: 0 })
      setUpcoming(data.upcoming || [])
      if (data.timezone) setTimezone(data.timezone)
    } catch {
      toast.error('Error al cargar citas')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, currentDate])

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`/api/contacts?workspaceId=${workspaceId}&limit=50`)
        if (res.ok) {
          const data = await res.json()
          setContacts((data.contacts || data.items || []).map((c: { id: string; firstName: string; lastName: string | null }) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName })))
        }
      } catch { /* ignore */ }
    }
    run()
  }, [workspaceId])

  // Equipo real (dueño + miembros)
  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/teams?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : (Array.isArray(d?.members) ? d.members : [])
        setTeam(list as TeamMember[])
      })
      .catch(() => {})
  }, [workspaceId])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  useEffect(() => {
    if (!workspaceId) return
    let stop = false
    fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (stop || !d?.workspace?.settings) return
        try {
          const s = JSON.parse(d.workspace.settings)
          if (s.reminders) setReminders({ appointment: s.reminders.appointment !== false, followup: s.reminders.followup !== false })
        } catch { /* */ }
      })
      .catch(() => {})
    return () => { stop = true }
  }, [workspaceId])

  const toggleReminder = async (key: 'appointment' | 'followup') => {
    const next = { ...reminders, [key]: !reminders[key] }
    setReminders(next)
    setSavingReminder(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminders: next }),
      })
      if (!res.ok) throw new Error()
      toast.success('Recordatorios actualizados')
    } catch {
      setReminders(reminders)
      toast.error('No se pudo actualizar')
    } finally {
      setSavingReminder(false)
    }
  }

  const filteredAppointments = typeFilter === 'all'
    ? appointments
    : appointments.filter((a) => a.type === typeFilter)

  const selectedAppt = useMemo(
    () => appointments.find((a) => a.id === selectedId) || null,
    [appointments, selectedId]
  )

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return filteredAppointments.filter((a) => zParts(a.date, timezone).dateStr === dateStr)
  }

  // Navegación
  const goToPrev = () => setCurrentDate((prev) => {
    const d = new Date(prev)
    if (viewMode === 'month' || viewMode === 'agenda') d.setMonth(d.getMonth() - 1)
    else if (viewMode === 'week') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    return d
  })
  const goToNext = () => setCurrentDate((prev) => {
    const d = new Date(prev)
    if (viewMode === 'month' || viewMode === 'agenda') d.setMonth(d.getMonth() + 1)
    else if (viewMode === 'week') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    return d
  })
  const goToToday = () => setCurrentDate(new Date())

  // CRUD
  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.date) return
    try {
      setIsSaving(true)
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, title: formData.title, description: formData.description || null,
          date: zInputToUtcISO(formData.date, timezone), duration: parseInt(formData.duration),
          type: formData.type, contactId: formData.contactId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cita creada exitosamente')
      setShowCreateDialog(false)
      setFormData({ title: '', description: '', date: '', duration: '30', type: 'test_drive', contactId: '' })
      await fetchAppointments()
    } catch {
      toast.error('Error al crear cita')
    } finally { setIsSaving(false) }
  }

  const handleUpdate = async () => {
    if (!selectedAppointment || !formData.title.trim()) return
    try {
      setIsSaving(true)
      const res = await fetch('/api/calendar', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedAppointment.id, title: formData.title, description: formData.description || null,
          date: zInputToUtcISO(formData.date, timezone), duration: parseInt(formData.duration),
          type: formData.type, contactId: formData.contactId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cita actualizada')
      setShowEditDialog(false)
      setSelectedAppointment(null)
      await fetchAppointments()
    } catch {
      toast.error('Error al actualizar cita')
    } finally { setIsSaving(false) }
  }

  const toggleStatus = async (apt: AppointmentWithContact, newStatus: string) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apt.id, status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Cita marcada como ${statusConfig[newStatus]?.label || newStatus}`)
      await fetchAppointments()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  const handleDelete = async () => {
    if (!selectedAppointment) return
    try {
      const res = await fetch(`/api/calendar?id=${selectedAppointment.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Cita eliminada')
      setShowDeleteDialog(false)
      setShowEditDialog(false)
      setSelectedAppointment(null)
      if (selectedId === selectedAppointment.id) setSelectedId(null)
      await fetchAppointments()
    } catch {
      toast.error('Error al eliminar cita')
    }
  }

  const openCreateDialog = (date?: string) => {
    setFormData({ title: '', description: '', date: date || utcISOToZInput(new Date().toISOString(), timezone), duration: '30', type: 'test_drive', contactId: '' })
    setShowCreateDialog(true)
  }
  const openEditDialog = (apt: AppointmentWithContact) => {
    setSelectedAppointment(apt)
    setFormData({
      title: apt.title, description: apt.description || '', date: utcISOToZInput(apt.date, timezone),
      duration: String(apt.duration), type: apt.type, contactId: apt.contactId || '',
    })
    setShowEditDialog(true)
  }

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })

  // ══════════ Vistas del calendario ══════════
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const today = new Date()

    const cells: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    return (
      <div className="grid grid-cols-7 border border-border/60 rounded-xl overflow-hidden">
        {DAYS_ES.map((day) => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border/60">{day}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="min-h-[92px] bg-muted/10 border-b border-r border-border/30" />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = isSameYMD(new Date(year, month, day), today)
          const dayAppointments = getAppointmentsForDate(new Date(dateStr))
          return (
            <div key={dateStr}
              className={cn('min-h-[92px] p-1.5 border-b border-r border-border/30 cursor-pointer transition-colors hover:bg-muted/20', isToday && 'bg-emerald-500/5')}
              onClick={() => openCreateDialog(`${dateStr}T09:00`)}>
              <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium mb-1', isToday ? 'bg-emerald-600 text-white' : 'text-foreground')}>{day}</div>
              <div className="space-y-0.5">
                {dayAppointments.slice(0, 3).map((apt) => {
                  const m = typeMeta(apt.type)
                  return (
                    <div key={apt.id}
                      className={cn('text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium cursor-pointer', m.chip, (apt.status === 'completed' || apt.status === 'cancelled') && 'opacity-50 line-through')}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(apt.id); setDetailTab('detalles') }}>
                      {timeOf(apt.date)} {apt.title}
                    </div>
                  )
                })}
                {dayAppointments.length > 3 && <p className="text-[9px] text-muted-foreground pl-1.5">+{dayAppointments.length - 3} más</p>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderWeekView = () => {
    const startOfWeek = startOfWeekMon(currentDate)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); days.push(d) }
    const today = new Date()
    const hours = Array.from({ length: 13 }, (_, i) => i + 8) // 08:00 – 20:00

    return (
      <div className="border border-border/60 rounded-xl overflow-hidden">
        <div className="grid grid-cols-8 bg-muted/40 border-b border-border/60">
          <div className="p-2 text-[10px] text-muted-foreground">Hora</div>
          {days.map((d) => {
            const isToday = isSameYMD(d, today)
            return (
              <div key={d.toISOString()} className={cn('p-2 text-center', isToday && 'bg-emerald-500/10')}>
                <div className="text-xs font-medium text-muted-foreground">{DAYS_ES[d.getDay() === 0 ? 6 : d.getDay() - 1]} {d.getDate()}</div>
              </div>
            )
          })}
        </div>
        <ScrollArea className="max-h-[560px]">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-border/30 min-h-[54px]">
              <div className="p-1.5 text-[10px] text-muted-foreground text-right border-r border-border/30">{String(hour).padStart(2, '0')}:00</div>
              {days.map((d) => {
                const dateStr = d.toISOString().split('T')[0]
                const hourApts = filteredAppointments.filter((apt) => { const p = zParts(apt.date, timezone); return p.dateStr === dateStr && p.hour === hour })
                return (
                  <div key={`${dateStr}-${hour}`} className="p-0.5 border-r border-border/30 space-y-0.5 cursor-pointer hover:bg-muted/10"
                    onClick={() => openCreateDialog(`${dateStr}T${String(hour).padStart(2, '0')}:00`)}>
                    {hourApts.map((apt) => {
                      const m = typeMeta(apt.type)
                      return (
                        <div key={apt.id}
                          className={cn('rounded-md border-l-2 px-1.5 py-1 cursor-pointer', m.chip, m.bar, selectedId === apt.id && 'ring-2 ring-emerald-500/60', (apt.status === 'cancelled') && 'opacity-50')}
                          onClick={(e) => { e.stopPropagation(); setSelectedId(apt.id); setDetailTab('detalles') }}>
                          <p className="text-[9px] font-semibold leading-tight">{timeOf(apt.date)}</p>
                          <p className="text-[10px] font-medium leading-tight truncate">{apt.title}</p>
                          {apt.contact && <p className="text-[9px] opacity-80 leading-tight truncate">{apt.contact.firstName} {apt.contact.lastName || ''}</p>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </ScrollArea>
      </div>
    )
  }

  const renderDayView = () => {
    const dateStr = currentDate.toISOString().split('T')[0]
    const dayApts = filteredAppointments.filter((a) => zParts(a.date, timezone).dateStr === dateStr)
    const hours = Array.from({ length: 13 }, (_, i) => i + 8)
    return (
      <div className="border border-border/60 rounded-xl overflow-hidden">
        <div className="p-3 bg-muted/40 border-b border-border/60 text-center">
          <span className="text-sm font-semibold capitalize">{currentDate.toLocaleDateString('es-MX', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <ScrollArea className="max-h-[560px]">
          {hours.map((hour) => {
            const hourApts = dayApts.filter((a) => zParts(a.date, timezone).hour === hour)
            return (
              <div key={hour} className="grid grid-cols-[64px_1fr] border-b border-border/30 min-h-[54px]">
                <div className="p-2 text-xs text-muted-foreground text-right border-r border-border/30 bg-muted/10">{String(hour).padStart(2, '0')}:00</div>
                <div className="p-1.5 space-y-1 cursor-pointer hover:bg-muted/10" onClick={() => openCreateDialog(`${dateStr}T${String(hour).padStart(2, '0')}:00`)}>
                  {hourApts.map((apt) => {
                    const m = typeMeta(apt.type)
                    return (
                      <div key={apt.id}
                        className={cn('rounded-lg border-l-2 px-2.5 py-1.5 cursor-pointer flex items-center justify-between gap-2', m.chip, m.bar, selectedId === apt.id && 'ring-2 ring-emerald-500/60')}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(apt.id); setDetailTab('detalles') }}>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate flex items-center gap-1.5">{m.icon} {apt.title}</p>
                          {apt.contact && <p className="text-[10px] opacity-80 truncate">{apt.contact.firstName} {apt.contact.lastName || ''}</p>}
                        </div>
                        <span className="text-[10px] shrink-0">{timeOf(apt.date)} · {apt.duration}min</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </ScrollArea>
      </div>
    )
  }

  const renderAgendaView = () => {
    // Lista cronológica del mes visible, agrupada por día.
    const year = currentDate.getFullYear(), month = currentDate.getMonth()
    const monthApts = filteredAppointments
      .filter((a) => { const p = zParts(a.date, timezone); const dd = new Date(p.dateStr); return dd.getFullYear() === year && dd.getMonth() === month })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const groups: Record<string, AppointmentWithContact[]> = {}
    for (const a of monthApts) { const k = zParts(a.date, timezone).dateStr; (groups[k] ||= []).push(a) }
    const keys = Object.keys(groups)
    return (
      <div className="border border-border/60 rounded-xl overflow-hidden">
        <ScrollArea className="max-h-[600px]">
          {keys.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Sin citas este mes.</div>
          ) : keys.map((k) => {
            const d = new Date(k)
            return (
              <div key={k}>
                <div className="px-4 py-2 bg-muted/40 border-b border-border/40 text-xs font-semibold capitalize sticky top-0">
                  {d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div className="divide-y divide-border/30">
                  {groups[k].map((apt) => {
                    const m = typeMeta(apt.type)
                    return (
                      <button key={apt.id} onClick={() => { setSelectedId(apt.id); setDetailTab('detalles') }}
                        className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors', selectedId === apt.id && 'bg-emerald-500/5')}>
                        <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{timeOf(apt.date)}</span>
                        <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', m.chip)}>{m.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate">{apt.title}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">{m.label}{apt.contact ? ` · ${apt.contact.firstName} ${apt.contact.lastName || ''}` : ''}</span>
                        </span>
                        <Badge className={cn('h-5 text-[9px] px-2 shrink-0', statusConfig[apt.status]?.chip)}>{statusConfig[apt.status]?.label || apt.status}</Badge>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </ScrollArea>
      </div>
    )
  }

  const headerLabel = viewMode === 'month' || viewMode === 'agenda'
    ? `${MONTHS_ES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : viewMode === 'week'
      ? (() => { const s = startOfWeekMon(currentDate); const e = new Date(s); e.setDate(e.getDate() + 6); return `${s.getDate()} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}` })()
      : currentDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Estadísticas de la semana visible (reales, calculadas en cliente) ──
  const weekStats = useMemo(() => {
    const s = startOfWeekMon(currentDate)
    const e = new Date(s); e.setDate(e.getDate() + 7)
    const inWeek = appointments.filter((a) => { const t = new Date(a.date).getTime(); return t >= s.getTime() && t < e.getTime() })
    const total = inWeek.length
    const pending = inWeek.filter((a) => a.status === 'pending').length
    const completed = inWeek.filter((a) => a.status === 'completed').length
    const cancelled = inWeek.filter((a) => a.status === 'cancelled').length
    return { total, pending, completed, cancelled }
  }, [appointments, currentDate])

  // Conteo por tipo (sobre el rango cargado) para "Tipos de cita"
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of appointments) c[a.type] = (c[a.type] || 0) + 1
    return c
  }, [appointments])

  const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">Calendario Auto</h3>
            <p className="text-sm text-muted-foreground">Gestiona y automatiza tus citas, pruebas de manejo y seguimientos.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GCalButton workspaceId={workspaceId} />
          <Button size="sm" variant="outline" className="gap-1.5" title="Bloquea un día (viaje, festivo…): la IA NO agendará citas ese día" onClick={() => setShowBlockDialog(true)}>
            <Ban className="h-4 w-4 text-red-500" /> Bloquear día
          </Button>
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openCreateDialog()}>
            <Plus className="h-4 w-4" /> Nueva Cita
          </Button>
        </div>
      </div>

      {/* Bloquear día: crea un "bloqueo" de día completo que la IA respeta
          (no propone ni confirma citas ese día) y que se ve en el calendario. */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="sm:max-w-md overflow-x-hidden">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /> Bloquear día</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Día a bloquear</Label>
              <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Motivo (lo verá tu equipo)</Label>
              <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ej. Viaje, festivo, inventario…" />
            </div>
            <p className="text-[11px] text-muted-foreground">La IA no ofrecerá ni confirmará citas ese día — propondrá el siguiente día disponible. El bloqueo aparece en tu calendario (y en Google Calendar si está conectado).</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowBlockDialog(false)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5" disabled={!blockDate || blockSaving} onClick={handleBlockDay}>
                {blockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Bloquear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Layout de 3 regiones: sidebar · calendario · panel de detalle */}
      <div className="grid grid-cols-1 xl:grid-cols-[248px_1fr_340px] gap-4">
        {/* ─── Sidebar izquierdo ─── */}
        <div className="space-y-4 order-2 xl:order-1">
          {/* Vista del equipo (real) */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vista del equipo</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground">Cargando equipo…</p>
              ) : team.map((m) => {
                const name = m.user.name || m.user.email.split('@')[0]
                const initials = name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <button key={m.userId} onClick={() => onViewChange?.('team')}
                    className="w-full flex items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-muted/40 transition-colors">
                    <span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">{initials}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium truncate">{name}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{ROLE_LABEL[m.role] || m.role}</span>
                    </span>
                  </button>
                )
              })}
              <button onClick={() => onViewChange?.('team')} className="w-full text-[11px] text-emerald-500 hover:underline pt-1">Gestionar equipo →</button>
            </CardContent>
          </Card>

          {/* Mini calendario */}
          <Card className="border-border/60">
            <CardContent className="pt-4">
              <MiniCalendar
                current={currentDate}
                timezone={timezone}
                appointments={appointments}
                onPick={(d) => { setCurrentDate(d); setViewMode('day') }}
                onNav={(dir) => setCurrentDate((p) => { const x = new Date(p); x.setMonth(x.getMonth() + dir); return x })}
              />
            </CardContent>
          </Card>

          {/* Tipos de cita (conteos reales, filtra al hacer clic) */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipos de cita</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {TYPE_ORDER.map((t) => {
                const m = typeConfig[t]
                const active = typeFilter === t
                return (
                  <button key={t} onClick={() => setTypeFilter(active ? 'all' : t)}
                    className={cn('w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', active ? 'bg-muted' : 'hover:bg-muted/40')}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', m.dot)} />
                      <span className="text-xs truncate">{m.label}</span>
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">{typeCounts[t] || 0}</span>
                  </button>
                )
              })}
              {typeFilter !== 'all' && <button onClick={() => setTypeFilter('all')} className="w-full text-[11px] text-emerald-500 hover:underline pt-1">Quitar filtro</button>}
            </CardContent>
          </Card>

          {/* Estadísticas (Semana) — reales */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estadísticas (Semana)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[
                { l: 'Citas programadas', v: weekStats.total, sub: null as string | null },
                { l: 'Confirmadas', v: weekStats.pending, sub: `${pctOf(weekStats.pending, weekStats.total)}%` },
                { l: 'Completadas', v: weekStats.completed, sub: `${pctOf(weekStats.completed, weekStats.total)}%` },
                { l: 'Canceladas', v: weekStats.cancelled, sub: `${pctOf(weekStats.cancelled, weekStats.total)}%` },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{r.l}</span>
                  <span className="text-xs font-semibold tabular-nums">{r.v}{r.sub ? <span className="text-muted-foreground font-normal"> ({r.sub})</span> : null}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recordatorios automáticos (toggles reales, respetados por el cron) */}
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recordatorios automáticos</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { key: 'appointment' as const, t: 'Recordatorio de cita', s: '1 h antes por WhatsApp' },
                { key: 'followup' as const, t: 'Seguimiento automático', s: 'Reactiva leads sin respuesta' },
              ].map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">{r.t}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.s}</p>
                  </div>
                  <button onClick={() => toggleReminder(r.key)} disabled={savingReminder}
                    className={cn('relative h-5 w-9 rounded-full shrink-0 transition-colors disabled:opacity-60', reminders[r.key] ? 'bg-emerald-500' : 'bg-muted')}
                    title={reminders[r.key] ? 'Activado' : 'Desactivado'}>
                    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', reminders[r.key] ? 'left-4' : 'left-0.5')} />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ─── Calendario central ─── */}
        <div className="space-y-3 order-1 xl:order-2 min-w-0">
          {/* Controles */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-8">Hoy</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNext}><ChevronRight className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold ml-1 capitalize">{headerLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border/60 overflow-hidden">
                {(['day', 'week', 'month', 'agenda'] as ViewMode[]).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={cn('px-3 py-1.5 text-xs font-medium transition-colors', viewMode === mode ? 'bg-emerald-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted')}>
                    {mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : mode === 'day' ? 'Día' : 'Agenda'}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-violet-500/40 text-violet-500 hover:bg-violet-500/10"
                title="Pídele al Copiloto IA que organice tu agenda" onClick={() => onViewChange?.('copilot')}>
                <Sparkles className="h-3.5 w-3.5" /> IA Agenda
              </Button>
            </div>
          </div>

          {/* Rejilla */}
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
          ) : viewMode === 'month' ? renderMonthView()
            : viewMode === 'week' ? renderWeekView()
              : viewMode === 'day' ? renderDayView()
                : renderAgendaView()}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            {TYPE_ORDER.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', typeConfig[t].dot)} />{typeConfig[t].label}</span>
            ))}
          </div>

          {/* Próximas citas (Hoy) */}
          <ProximasCitasHoy appointments={appointments} timezone={timezone} onOpen={(id) => { setSelectedId(id); setDetailTab('detalles') }} onSeeAll={() => setViewMode('agenda')} />
        </div>

        {/* ─── Panel de detalle derecho ─── */}
        <div className="order-3 min-w-0">
          {selectedAppt ? (
            <DetailPanel
              apt={selectedAppt}
              timezone={timezone}
              onClose={() => setSelectedId(null)}
              tab={detailTab}
              setTab={setDetailTab}
              onEdit={() => openEditDialog(selectedAppt)}
              onComplete={() => toggleStatus(selectedAppt, 'completed')}
              onCancel={() => toggleStatus(selectedAppt, 'cancelled')}
              onOpenContact={onOpenContact}
            />
          ) : (
            <EmptyDetail stats={stats} appointments={appointments} />
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Nueva Cita</DialogTitle></DialogHeader>
          <AppointmentForm formData={formData} setFormData={setFormData} contacts={contacts} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={!formData.title.trim() || !formData.date || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Crear Cita
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-5 w-5" /> Editar Cita</DialogTitle></DialogHeader>
          {selectedAppointment && (
            <>
              <AppointmentForm formData={formData} setFormData={setFormData} contacts={contacts} />
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Estado</Label>
                <div className="flex gap-2 flex-wrap">
                  {selectedAppointment.status !== 'completed' && (
                    <Button size="sm" variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => toggleStatus(selectedAppointment, 'completed')}><CheckCircle2 className="h-3.5 w-3.5" /> Completar</Button>
                  )}
                  {selectedAppointment.status !== 'pending' && (
                    <Button size="sm" variant="outline" className="gap-1 text-amber-600 border-amber-500/40 hover:bg-amber-500/10" onClick={() => toggleStatus(selectedAppointment, 'pending')}><RefreshCw className="h-3.5 w-3.5" /> Pendiente</Button>
                  )}
                  {selectedAppointment.status !== 'cancelled' && (
                    <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-500/40 hover:bg-red-500/10" onClick={() => toggleStatus(selectedAppointment, 'cancelled')}><XCircle className="h-3.5 w-3.5" /> Cancelar</Button>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-500/10 border-red-500/40" onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4 mr-1.5" /> Eliminar</Button>
                <div className="flex gap-2">
                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleUpdate} disabled={isSaving}>{isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Guardar</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cita?</AlertDialogTitle>
            <AlertDialogDescription>¿Estás seguro de eliminar &quot;{selectedAppointment?.title}&quot;? Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ══════════ Subcomponentes ══════════

function AppointmentForm({ formData, setFormData, contacts }: {
  formData: { title: string; description: string; date: string; duration: string; type: string; contactId: string }
  setFormData: (v: typeof formData) => void
  contacts: { id: string; firstName: string; lastName: string | null }[]
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>Título *</Label>
        <Input placeholder="Ej: Prueba de manejo Toyota RAV4" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Fecha y Hora *</Label>
          <Input type="datetime-local" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label>Duración</Label>
          <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="45">45 min</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
              <SelectItem value="90">1.5 horas</SelectItem>
              <SelectItem value="120">2 horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>Tipo</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_ORDER.concat(['meeting', 'task']).map((t) => (
                <SelectItem key={t} value={t}><span className="flex items-center gap-1.5">{typeConfig[t].icon}{typeConfig[t].label}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Contacto</Label>
          <Select value={formData.contactId || '__none__'} onValueChange={(v) => setFormData({ ...formData, contactId: v === '__none__' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin contacto</SelectItem>
              {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName || ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Notas</Label>
        <Textarea placeholder="Notas opcionales..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
      </div>
    </div>
  )
}

function MiniCalendar({ current, timezone, appointments, onPick, onNav }: {
  current: Date; timezone: string; appointments: AppointmentWithContact[]
  onPick: (d: Date) => void; onNav: (dir: number) => void
}) {
  const year = current.getFullYear(), month = current.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = new Date()
  const daysWithAppts = useMemo(() => {
    const set = new Set<string>()
    for (const a of appointments) set.add(zParts(a.date, timezone).dateStr)
    return set
  }, [appointments, timezone])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onNav(-1)} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs font-semibold">{MONTHS_ES[month]} {year}</span>
        <button onClick={() => onNav(1)} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DAYS_MINI.map((d, i) => <div key={i} className="text-[10px] text-muted-foreground py-1">{d}</div>)}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />
          const isToday = isSameYMD(new Date(year, month, day), today)
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const has = daysWithAppts.has(dateStr)
          return (
            <button key={dateStr} onClick={() => onPick(new Date(year, month, day))}
              className={cn('relative h-7 rounded-md text-[11px] flex items-center justify-center hover:bg-muted transition-colors', isToday && 'bg-emerald-600 text-white font-semibold hover:bg-emerald-600')}>
              {day}
              {has && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-emerald-500" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ProximasCitasHoy({ appointments, timezone, onOpen, onSeeAll }: {
  appointments: AppointmentWithContact[]; timezone: string
  onOpen: (id: string) => void; onSeeAll: () => void
}) {
  const today = new Date()
  const todayStr = zParts(today, timezone).dateStr
  const items = appointments
    .filter((a) => zParts(a.date, timezone).dateStr === todayStr && a.status !== 'cancelled')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4)
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Próximas citas (Hoy)</CardTitle>
        <button onClick={onSeeAll} className="text-[11px] text-emerald-500 hover:underline">Ver agenda completa →</button>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">Sin citas para hoy.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {items.map((apt) => {
              const m = typeMeta(apt.type)
              const time = new Date(apt.date).toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
              return (
                <button key={apt.id} onClick={() => onOpen(apt.id)} className={cn('rounded-lg border-l-2 p-2.5 text-left hover:shadow-sm transition-all', m.chip, m.bar)}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">{m.icon} {time}</div>
                  <p className="text-xs font-medium truncate mt-1">{apt.title}</p>
                  {apt.contact && <p className="text-[10px] opacity-80 truncate">{apt.contact.firstName} {apt.contact.lastName || ''}</p>}
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyDetail({ stats, appointments }: { stats: CalendarStats; appointments: AppointmentWithContact[] }) {
  // Tendencia real de citas por día (últimos 14 días)
  const days = useMemo(() => {
    const out: { d: string; n: number }[] = []
    const base = new Date(); base.setHours(0, 0, 0, 0)
    for (let i = 13; i >= 0; i--) {
      const day = new Date(base.getTime() - i * 86400000)
      const n = appointments.filter((a) => isSameYMD(new Date(a.date), day)).length
      out.push({ d: `${day.getDate()}`, n })
    }
    return out
  }, [appointments])
  const hasData = days.some((x) => x.n > 0)
  return (
    <div className="space-y-4 xl:sticky xl:top-4">
      <Card className="border-border/60">
        <CardContent className="py-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3"><CalendarDays className="h-6 w-6 text-muted-foreground" /></div>
          <p className="text-sm font-medium">Selecciona una cita</p>
          <p className="text-xs text-muted-foreground mt-1">Haz clic en cualquier cita del calendario para ver sus detalles, cliente y acciones.</p>
        </CardContent>
      </Card>
      <Card className="border-border/60">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Impacto de agenda</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <p className="text-[10px] text-muted-foreground">Citas agendadas (este mes)</p>
          <p className="text-2xl font-bold leading-none mt-0.5">{stats.totalThisMonth}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            <span className="text-blue-500 font-medium">{stats.completedThisMonth} completadas</span> · <span className="text-emerald-500 font-medium">{stats.pendingThisMonth} pendientes</span>
          </p>
          <div className="h-16 mt-2 -mx-1">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={days} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="calImpact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="n" stroke="#10b981" strokeWidth={2} fill="url(#calImpact)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">Aún sin tendencia</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DetailPanel({ apt, timezone, onClose, tab, setTab, onEdit, onComplete, onCancel, onOpenContact }: {
  apt: AppointmentWithContact; timezone: string; onClose: () => void
  tab: 'detalles' | 'cliente' | 'notas'; setTab: (t: 'detalles' | 'cliente' | 'notas') => void
  onEdit: () => void; onComplete: () => void; onCancel: () => void
  onOpenContact?: (contactId: string) => void
}) {
  const m = typeMeta(apt.type)
  const d = new Date(apt.date)
  const dateLabel = d.toLocaleDateString('es-MX', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const startTime = d.toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
  const endTime = new Date(d.getTime() + apt.duration * 60000).toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
  const isAI = /\bia\b|asistente|autom/i.test(apt.description || '')
  const canal = isAI ? 'Asistente IA' : (apt.contact?.phone ? 'WhatsApp' : 'Manual')
  const createdLabel = apt.createdAt ? new Date(apt.createdAt).toLocaleDateString('es-MX', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const contactName = apt.contact ? `${apt.contact.firstName} ${apt.contact.lastName || ''}`.trim() : null
  const score = apt.contact?.leadScore ?? null

  const row = (label: string, value: React.ReactNode, icon?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">{icon}{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )

  return (
    <Card className="border-border/60 xl:sticky xl:top-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', m.chip)}>{m.icon}</span>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{apt.title}</CardTitle>
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center shrink-0"><XCircle className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="mt-1"><Badge className={cn('h-5 text-[10px] px-2', statusConfig[apt.status]?.chip)}>{statusConfig[apt.status]?.label || apt.status}</Badge></div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {([['detalles', 'Detalles'], ['cliente', 'Cliente'], ['notas', 'Notas']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn('flex-1 rounded-md py-1.5 text-xs font-medium transition-colors', tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>

        {tab === 'detalles' && (
          <div className="divide-y divide-border/40">
            {row('Fecha', <span className="capitalize">{dateLabel}</span>, <Calendar className="h-3.5 w-3.5" />)}
            {row('Hora', `${startTime} – ${endTime}`, <Clock className="h-3.5 w-3.5" />)}
            {row('Duración', `${apt.duration} min`, <Clock className="h-3.5 w-3.5" />)}
            {row('Tipo de cita', <span className="inline-flex items-center gap-1.5">{m.icon}{m.label}</span>, <ListChecks className="h-3.5 w-3.5" />)}
            {row('Estado', statusConfig[apt.status]?.label || apt.status, <CheckCircle2 className="h-3.5 w-3.5" />)}
            {row('Creada', createdLabel, <Calendar className="h-3.5 w-3.5" />)}
            {row('Canal de origen', canal, <MessageCircle className="h-3.5 w-3.5" />)}
          </div>
        )}

        {tab === 'cliente' && (
          contactName ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold flex items-center justify-center">
                  {contactName.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{contactName}</p>
                  {apt.contact?.phone && <p className="text-xs text-muted-foreground truncate">{apt.contact.phone}</p>}
                </div>
              </div>
              {score !== null && (
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Score gBrain</span>
                    <span className={cn('text-lg font-bold', score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-muted-foreground')}>{score}<span className="text-xs text-muted-foreground font-normal">/100</span></span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{score >= 70 ? 'Muy alta intención de compra' : score >= 40 ? 'Interés medio' : 'Interés inicial'}</p>
                </div>
              )}
              {apt.contactId && (
                <Button variant="outline" className="w-full gap-1.5 text-xs" onClick={() => onOpenContact?.(apt.contactId!)}>
                  <ExternalLink className="h-3.5 w-3.5" /> Ver perfil completo
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">Esta cita no tiene un contacto asociado.</p>
          )
        )}

        {tab === 'notas' && (
          apt.description ? (
            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{apt.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">Sin notas. Usa &quot;Reagendar&quot; para agregar notas.</p>
          )
        )}

        {/* Acciones rápidas */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Acciones rápidas</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" disabled={!apt.contactId}
              title={apt.contactId ? 'Abrir el chat para enviar el recordatorio' : 'Cita sin contacto'} onClick={() => apt.contactId && onOpenContact?.(apt.contactId)}>
              <MessageCircle className="h-3.5 w-3.5" /> Enviar recordatorio
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /> Reagendar</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-blue-600 border-blue-500/40 hover:bg-blue-500/10" disabled={apt.status === 'completed'} onClick={onComplete}><CheckCircle2 className="h-3.5 w-3.5" /> Completada</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-red-600 border-red-500/40 hover:bg-red-500/10" disabled={apt.status === 'cancelled'} onClick={onCancel}><XCircle className="h-3.5 w-3.5" /> Cancelar cita</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Conexión con Google Calendar (PERSONAL: cada usuario vincula SU cuenta;
//    las citas se sincronizan a todos los calendarios conectados del equipo) ──
function GCalButton({ workspaceId }: { workspaceId: string }) {
  const [st, setSt] = useState<{ appReady: boolean; connected: boolean; email: string | null; teamConnected?: number } | null>(null)
  useEffect(() => {
    fetch(`/api/gcal/connect?workspaceId=${workspaceId}&status=1`).then(r => r.ok ? r.json() : null).then(j => j && setSt(j)).catch(() => {})
  }, [workspaceId])
  if (!st) return null
  if (st.connected) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-300/60"
        title={`Tu cuenta ${st.email || 'de Google'} recibe las citas automáticamente${st.teamConnected && st.teamConnected > 1 ? ` (${st.teamConnected} cuentas conectadas en el equipo)` : ''} — clic para desconectar la tuya`}
        onClick={async () => { if (!confirm('¿Desconectar TU Google Calendar? (las cuentas de tus compañeros no se tocan)')) return; await fetch(`/api/gcal/connect?workspaceId=${workspaceId}`, { method: 'DELETE' }); setSt(s => s ? { ...s, connected: false } : s) }}>
        ✓ Google Calendar{st.email ? ` · ${st.email.split('@')[0]}` : ''}
      </Button>
    )
  }
  return (
    <Button size="sm" variant="outline" className="gap-1.5"
      title="Vincula TU cuenta de Google: las citas del sistema aparecerán solas en tu calendario"
      onClick={() => {
        if (!st.appReady) { alert('La integración con Google todavía no está activada en el servidor (el administrador la activa UNA sola vez, ~10 min). Una vez activa, con este botón cada quien conecta su propia cuenta de Google en dos clics.'); return }
        window.location.href = `/api/gcal/connect?workspaceId=${workspaceId}`
      }}>
      Conectar Google Calendar
    </Button>
  )
}
