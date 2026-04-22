'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Edit3,
  Filter,
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
  contactId: string | null
  contact: { id: string; firstName: string; lastName: string | null; phone: string | null } | null
}

interface CalendarStats {
  totalThisMonth: number
  completedThisMonth: number
  pendingThisMonth: number
  cancelledThisMonth: number
}

type ViewMode = 'month' | 'week' | 'day'

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  call: { label: 'Llamada', color: 'text-blue-700', bg: 'bg-blue-100', icon: <Phone className="h-3 w-3" /> },
  meeting: { label: 'Reunión', color: 'text-purple-700', bg: 'bg-purple-100', icon: <Users className="h-3 w-3" /> },
  followup: { label: 'Seguimiento', color: 'text-amber-700', bg: 'bg-amber-100', icon: <RefreshCw className="h-3 w-3" /> },
  task: { label: 'Tarea', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle2 className="h-3 w-3" /> },
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-100' },
  completed: { label: 'Completada', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cancelled: { label: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100' },
}

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1 // Monday = 0
}

interface CalendarViewProps {
  workspaceId: string
}

export function CalendarView({ workspaceId }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [appointments, setAppointments] = useState<AppointmentWithContact[]>([])
  const [upcoming, setUpcoming] = useState<AppointmentWithContact[]>([])
  const [stats, setStats] = useState<CalendarStats>({ totalThisMonth: 0, completedThisMonth: 0, pendingThisMonth: 0, cancelledThisMonth: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [contacts, setContacts] = useState<{ id: string; firstName: string; lastName: string | null }[]>([])

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithContact | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [prefillDate, setPrefillDate] = useState<string>('')

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    duration: '30',
    type: 'call',
    contactId: '',
  })

  const fetchAppointments = useCallback(async () => {
    try {
      setIsLoading(true)
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month + 2).padStart(2, '0')}-01`

      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      })

      const res = await fetch(`/api/calendar?${params}`)
      if (!res.ok) throw new Error('Error al cargar citas')
      const data = await res.json()

      setAppointments(data.appointments || [])
      setStats(data.stats || { totalThisMonth: 0, completedThisMonth: 0, pendingThisMonth: 0, cancelledThisMonth: 0 })
      setUpcoming(data.upcoming || [])
    } catch {
      toast.error('Error al cargar citas')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, currentDate])

  // Fetch contacts for dropdown
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch(`/api/contacts?workspaceId=${workspaceId}&limit=50`)
        if (res.ok) {
          const data = await res.json()
          setContacts((data.contacts || data.items || []).map((c: { id: string; firstName: string; lastName: string | null }) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
          })))
        }
      } catch {
        // ignore
      }
    }
    fetchContacts()
  }, [workspaceId])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const filteredAppointments = typeFilter === 'all'
    ? appointments
    : appointments.filter((a) => a.type === typeFilter)

  // Group appointments by date for month view
  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return filteredAppointments.filter((a) => a.date.split('T')[0] === dateStr)
  }

  // Navigate
  const goToPrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev)
      if (viewMode === 'month') d.setMonth(d.getMonth() - 1)
      else if (viewMode === 'week') d.setDate(d.getDate() - 7)
      else d.setDate(d.getDate() - 1)
      return d
    })
  }

  const goToNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev)
      if (viewMode === 'month') d.setMonth(d.getMonth() + 1)
      else if (viewMode === 'week') d.setDate(d.getDate() + 7)
      else d.setDate(d.getDate() + 1)
      return d
    })
  }

  const goToToday = () => setCurrentDate(new Date())

  // Create appointment
  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.date) return
    try {
      setIsSaving(true)
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: formData.title,
          description: formData.description || null,
          date: new Date(formData.date).toISOString(),
          duration: parseInt(formData.duration),
          type: formData.type,
          contactId: formData.contactId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cita creada exitosamente')
      setShowCreateDialog(false)
      setFormData({ title: '', description: '', date: '', duration: '30', type: 'call', contactId: '' })
      await fetchAppointments()
    } catch {
      toast.error('Error al crear cita')
    } finally {
      setIsSaving(false)
    }
  }

  // Update appointment
  const handleUpdate = async () => {
    if (!selectedAppointment || !formData.title.trim()) return
    try {
      setIsSaving(true)
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedAppointment.id,
          title: formData.title,
          description: formData.description || null,
          date: new Date(formData.date).toISOString(),
          duration: parseInt(formData.duration),
          type: formData.type,
          contactId: formData.contactId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cita actualizada')
      setShowEditDialog(false)
      setSelectedAppointment(null)
      await fetchAppointments()
    } catch {
      toast.error('Error al actualizar cita')
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle status
  const toggleStatus = async (apt: AppointmentWithContact, newStatus: string) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apt.id, status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Cita marcada como ${statusConfig[newStatus]?.label || newStatus}`)
      await fetchAppointments()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!selectedAppointment) return
    try {
      const res = await fetch(`/api/calendar?id=${selectedAppointment.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Cita eliminada')
      setShowDeleteDialog(false)
      setShowEditDialog(false)
      setSelectedAppointment(null)
      await fetchAppointments()
    } catch {
      toast.error('Error al eliminar cita')
    }
  }

  const openCreateDialog = (date?: string) => {
    setFormData({
      title: '',
      description: '',
      date: date || new Date().toISOString().slice(0, 16),
      duration: '30',
      type: 'call',
      contactId: '',
    })
    setPrefillDate(date || '')
    setShowCreateDialog(true)
  }

  const openEditDialog = (apt: AppointmentWithContact) => {
    setSelectedAppointment(apt)
    setFormData({
      title: apt.title,
      description: apt.description || '',
      date: apt.date.slice(0, 16),
      duration: String(apt.duration),
      type: apt.type,
      contactId: apt.contactId || '',
    })
    setShowEditDialog(true)
  }

  // ── Month View ──
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const cells: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    return (
      <div className="grid grid-cols-7 border border-border/60 rounded-lg overflow-hidden">
        {/* Day headers */}
        {DAYS_ES.map((day) => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border/60">
            {day}
          </div>
        ))}
        {/* Day cells */}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[90px] sm:min-h-[110px] bg-muted/10 border-b border-r border-border/30" />
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = dateStr === todayStr
          const dayAppointments = getAppointmentsForDate(new Date(dateStr))

          return (
            <div
              key={dateStr}
              className={cn(
                'min-h-[90px] sm:min-h-[110px] p-1.5 border-b border-r border-border/30 cursor-pointer transition-colors hover:bg-muted/20',
                isToday && 'bg-emerald-50/50'
              )}
              onClick={() => openCreateDialog(`${dateStr}T09:00`)}
            >
              <div className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium mb-1',
                isToday ? 'bg-emerald-600 text-white' : 'text-foreground'
              )}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium cursor-pointer',
                      typeConfig[apt.type]?.bg || 'bg-zinc-100',
                      typeConfig[apt.type]?.color || 'text-zinc-700',
                      apt.status === 'completed' && 'opacity-50 line-through',
                      apt.status === 'cancelled' && 'opacity-40 line-through'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditDialog(apt)
                    }}
                  >
                    {new Date(apt.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {apt.title}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <p className="text-[9px] text-muted-foreground pl-1.5">
                    +{dayAppointments.length - 3} más
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Week View ──
  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1))

    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      days.push(d)
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const hours = Array.from({ length: 12 }, (_, i) => i + 7) // 7am to 7pm

    return (
      <div className="border border-border/60 rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 bg-muted/30 border-b border-border/60">
          <div className="p-2 text-xs text-muted-foreground" />
          {days.map((d) => {
            const isToday = d.toISOString().split('T')[0] === todayStr
            return (
              <div key={d.toISOString()} className={cn('p-2 text-center text-xs', isToday && 'bg-emerald-50')}>
                <div className="font-medium text-muted-foreground">{DAYS_ES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                <div className={cn('h-6 w-6 rounded-full flex items-center justify-center mx-auto mt-0.5 text-xs font-semibold', isToday ? 'bg-emerald-600 text-white' : 'text-foreground')}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>
        {/* Time slots */}
        <ScrollArea className="max-h-[500px]">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-border/30">
              <div className="p-1.5 text-[10px] text-muted-foreground text-right border-r border-border/30">
                {String(hour).padStart(2, '0')}:00
              </div>
              {days.map((d) => {
                const dateStr = d.toISOString().split('T')[0]
                const hourApts = filteredAppointments.filter((apt) => {
                  const aptDate = new Date(apt.date)
                  return aptDate.toISOString().split('T')[0] === dateStr && aptDate.getHours() === hour
                })
                return (
                  <div
                    key={`${dateStr}-${hour}`}
                    className="p-0.5 border-r border-border/30 min-h-[40px] cursor-pointer hover:bg-muted/10"
                    onClick={() => openCreateDialog(`${dateStr}T${String(hour).padStart(2, '0')}:00`)}
                  >
                    {hourApts.map((apt) => (
                      <div
                        key={apt.id}
                        className={cn(
                          'text-[9px] px-1 py-0.5 rounded-md truncate font-medium cursor-pointer',
                          typeConfig[apt.type]?.bg || 'bg-zinc-100',
                          typeConfig[apt.type]?.color || 'text-zinc-700'
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditDialog(apt)
                        }}
                      >
                        {apt.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </ScrollArea>
      </div>
    )
  }

  // ── Day View ──
  const renderDayView = () => {
    const dateStr = currentDate.toISOString().split('T')[0]
    const dayApts = filteredAppointments.filter((a) => a.date.split('T')[0] === dateStr)
    const hours = Array.from({ length: 12 }, (_, i) => i + 7)

    return (
      <div className="border border-border/60 rounded-lg overflow-hidden">
        <div className="p-3 bg-muted/30 border-b border-border/60 text-center">
          <span className="text-sm font-semibold">
            {currentDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <ScrollArea className="max-h-[500px]">
          {hours.map((hour) => {
            const hourApts = dayApts.filter((a) => new Date(a.date).getHours() === hour)
            return (
              <div key={hour} className="grid grid-cols-2 border-b border-border/30">
                <div className="p-2 text-xs text-muted-foreground text-right border-r border-border/30 bg-muted/10">
                  {String(hour).padStart(2, '0')}:00
                </div>
                <div
                  className="p-1.5 min-h-[50px] cursor-pointer hover:bg-muted/10"
                  onClick={() => openCreateDialog(`${dateStr}T${String(hour).padStart(2, '0')}:00`)}
                >
                  {hourApts.map((apt) => (
                    <div
                      key={apt.id}
                      className={cn(
                        'text-xs p-1.5 rounded-md mb-1 cursor-pointer flex items-center justify-between',
                        typeConfig[apt.type]?.bg || 'bg-zinc-100'
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditDialog(apt)
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {typeConfig[apt.type]?.icon}
                        <span className={cn('font-medium', typeConfig[apt.type]?.color)}>
                          {apt.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {apt.duration}min
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </ScrollArea>
      </div>
    )
  }

  const headerLabel = viewMode === 'month'
    ? `${MONTHS_ES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : viewMode === 'week'
      ? `Semana del ${currentDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
      : currentDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Calendario</h3>
            <p className="text-sm text-muted-foreground">
              Gestiona tus citas y reuniones
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => openCreateDialog()}
        >
          <Plus className="h-4 w-4" />
          Nueva Cita
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-foreground">{stats.totalThisMonth}</p>
            <p className="text-[10px] text-muted-foreground">Total este mes</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-emerald-600">{stats.completedThisMonth}</p>
            <p className="text-[10px] text-muted-foreground">Completadas</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-amber-600">{stats.pendingThisMonth}</p>
            <p className="text-[10px] text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-3">
            <p className="text-lg font-bold text-red-600">{stats.cancelledThisMonth}</p>
            <p className="text-[10px] text-muted-foreground">Canceladas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Calendar */}
        <div className="lg:col-span-3 space-y-4">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday} className="text-xs">
                Hoy
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold ml-2 capitalize">{headerLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Type filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-auto text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="call">📞 Llamada</SelectItem>
                  <SelectItem value="meeting">👥 Reunión</SelectItem>
                  <SelectItem value="followup">🔄 Seguimiento</SelectItem>
                  <SelectItem value="task">✅ Tarea</SelectItem>
                </SelectContent>
              </Select>
              {/* View mode */}
              <div className="flex rounded-lg border border-border/60 overflow-hidden">
                {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      viewMode === mode ? 'bg-emerald-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Día'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded" />
              ))}
            </div>
          ) : viewMode === 'month' ? renderMonthView() : viewMode === 'week' ? renderWeekView() : renderDayView()}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Upcoming */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-600" />
                Próximas Citas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin citas próximas</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {upcoming.map((apt) => {
                    const aptDate = new Date(apt.date)
                    return (
                      <div
                        key={apt.id}
                        className="p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openEditDialog(apt)}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className={cn('p-1 rounded', typeConfig[apt.type]?.bg)}>
                            {typeConfig[apt.type]?.icon}
                          </div>
                          <span className="text-xs font-medium text-foreground truncate flex-1">{apt.title}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground ml-6">
                          {aptDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ·{' '}
                          {aptDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {apt.contact && <span> · {apt.contact.firstName}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold">Tipos de Cita</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {Object.entries(typeConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={cn('p-1 rounded', cfg.bg)}>{cfg.icon}</div>
                    <span className="text-xs text-muted-foreground">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nueva Cita
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input
                placeholder="Ej: Llamada con Carlos"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Fecha y Hora *</Label>
                <Input
                  type="datetime-local"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Duración (min)</Label>
                <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">📞 Llamada</SelectItem>
                    <SelectItem value="meeting">👥 Reunión</SelectItem>
                    <SelectItem value="followup">🔄 Seguimiento</SelectItem>
                    <SelectItem value="task">✅ Tarea</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Contacto</Label>
                <Select value={formData.contactId} onValueChange={(v) => setFormData({ ...formData, contactId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin contacto</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName || ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Notas opcionales..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreate}
                disabled={!formData.title.trim() || !formData.date || isSaving}
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Crear Cita
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Editar Cita
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Título *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Fecha y Hora *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Duración (min)</Label>
                  <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">📞 Llamada</SelectItem>
                      <SelectItem value="meeting">👥 Reunión</SelectItem>
                      <SelectItem value="followup">🔄 Seguimiento</SelectItem>
                      <SelectItem value="task">✅ Tarea</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Contacto</Label>
                  <Select value={formData.contactId} onValueChange={(v) => setFormData({ ...formData, contactId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin contacto</SelectItem>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.firstName} {c.lastName || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notas</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              {/* Status toggles */}
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Estado</Label>
                <div className="flex gap-2">
                  {selectedAppointment.status !== 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => toggleStatus(selectedAppointment, 'completed')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completar
                    </Button>
                  )}
                  {selectedAppointment.status !== 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => toggleStatus(selectedAppointment, 'pending')}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Pendiente
                    </Button>
                  )}
                  {selectedAppointment.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => toggleStatus(selectedAppointment, 'cancelled')}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Eliminar
                </Button>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleUpdate}
                    disabled={isSaving}
                  >
                    {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Guardar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cita?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar &quot;{selectedAppointment?.title}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
