'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Briefcase,
  MapPin,
  Phone,
  GraduationCap,
  Heart,
  Target,
  Bot,
  MessageCircle,
  Clock,
  X,
  Plus,
  Save,
  Check,
  Loader2,
  Calendar,
  Link2,
  ExternalLink,
  Plug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TemperatureBar } from './temperature-bar'
import { WhatsAppPanel } from './whatsapp-panel'
import type { UserProfile, WhatsAppLog, CalendarEvent } from './types'

// ─── Props ───
interface ProfileViewProps {
  profile: UserProfile | null
  onSave: (data: Record<string, unknown>) => Promise<void>
  onRefreshTemperature: () => Promise<void>
}

// ─── Work schedule days ───
const DAYS = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mié' },
  { key: 'thu', label: 'Jue' },
  { key: 'fri', label: 'Vie' },
  { key: 'sat', label: 'Sáb' },
  { key: 'sun', label: 'Dom' },
]

// ─── Section animation config ───
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

// ─── Component ───
export function ProfileView({ profile, onSave, onRefreshTemperature }: ProfileViewProps) {
  // Local form state
  const [age, setAge] = useState<string>(profile?.age?.toString() ?? '')
  const [gender, setGender] = useState(profile?.gender ?? '')
  const [relationshipStatus, setRelationshipStatus] = useState(profile?.relationshipStatus ?? '')
  const [children, setChildren] = useState<string>(profile?.children?.toString() ?? '0')
  const [education, setEducation] = useState(profile?.education ?? '')
  const [occupation, setOccupation] = useState(profile?.occupation ?? '')
  const [company, setCompany] = useState(profile?.company ?? '')
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('18:00')
  const [workDays, setWorkDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [location, setLocation] = useState(profile?.location ?? '')
  const [whatsappPhone, setWhatsappPhone] = useState(profile?.whatsappPhone ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [interests, setInterests] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [coachMode, setCoachMode] = useState(profile?.coachMode ?? false)
  const [summaryEnabled, setSummaryEnabled] = useState(profile?.summaryEnabled ?? false)
  const [summaryInterval, setSummaryInterval] = useState(profile?.summaryInterval ?? 30)

  // UI state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [interestInput, setInterestInput] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [waLogs, setWaLogs] = useState<WhatsAppLog[]>([])
  const [waConnected, setWaConnected] = useState(true)

  // Vacation state
  const [vacationEnabled, setVacationEnabled] = useState(profile?.vacationMode ?? false)
  const [vacationStart, setVacationStart] = useState(profile?.vacationStartAt ? profile.vacationStartAt.slice(0, 10) : '')
  const [vacationEnd, setVacationEnd] = useState(profile?.vacationEndAt ? profile.vacationEndAt.slice(0, 10) : '')
  const [vacationSaving, setVacationSaving] = useState(false)

  // Calendar state
  const [calendarConnected, setCalendarConnected] = useState(profile?.googleCalendarConnected ?? false)
  const [calendarSync, setCalendarSync] = useState(profile?.googleCalendarSyncEnabled ?? false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [googleCredsConfigured, setGoogleCredsConfigured] = useState(true)
  const [calendarLoading, setCalendarLoading] = useState(false)

  // Parse saved data on profile change
  useEffect(() => {
    if (!profile) return
    setAge(profile.age?.toString() ?? '')
    setGender(profile.gender ?? '')
    setRelationshipStatus(profile.relationshipStatus ?? '')
    setChildren(profile.children?.toString() ?? '0')
    setEducation(profile.education ?? '')
    setOccupation(profile.occupation ?? '')
    setCompany(profile.company ?? '')
    setLocation(profile.location ?? '')
    setWhatsappPhone(profile.whatsappPhone ?? '')
    setBio(profile.bio ?? '')
    setCoachMode(profile.coachMode)
    setSummaryEnabled(profile.summaryEnabled)
    setSummaryInterval(profile.summaryInterval ?? 30)

    try {
      const sched = profile.workSchedule ? JSON.parse(profile.workSchedule) : {}
      setWorkStart(sched.start || '09:00')
      setWorkEnd(sched.end || '18:00')
      setWorkDays(sched.days || ['mon', 'tue', 'wed', 'thu', 'fri'])
    } catch { /* ignore */ }

    setVacationEnabled(profile.vacationMode)
    setVacationStart(profile.vacationStartAt ? profile.vacationStartAt.slice(0, 10) : '')
    setVacationEnd(profile.vacationEndAt ? profile.vacationEndAt.slice(0, 10) : '')
    setCalendarConnected(profile.googleCalendarConnected)
    setCalendarSync(profile.googleCalendarSyncEnabled)

    try {
      setInterests(profile.interests ? JSON.parse(profile.interests) : [])
    } catch { setInterests([]) }

    try {
      setGoals(profile.goals ? JSON.parse(profile.goals) : [])
    } catch { setGoals([]) }
  }, [profile])

  // ─── Chip add/remove helpers ───
  const addChip = useCallback((list: string[], setList: (v: string[]) => void, value: string) => {
    const trimmed = value.trim()
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed])
    }
  }, [])

  const removeChip = useCallback((list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.filter((i) => i !== value))
  }, [])

  // ─── Toggle work day ───
  const toggleWorkDay = useCallback((day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }, [])

  // ─── Save handler ───
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    try {
      const data: Record<string, unknown> = {
        age: age ? parseInt(age, 10) : null,
        gender: gender || null,
        relationshipStatus: relationshipStatus || null,
        children: parseInt(children, 10) || 0,
        education: education || null,
        occupation: occupation || null,
        company: company || null,
        workSchedule: JSON.stringify({ start: workStart, end: workEnd, days: workDays }),
        location: location || null,
        whatsappPhone: whatsappPhone || null,
        bio: bio || null,
        interests: JSON.stringify(interests),
        goals: JSON.stringify(goals),
        coachMode,
        summaryEnabled,
        summaryInterval,
      }
      await onSave(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [age, gender, relationshipStatus, children, education, occupation, company, workStart, workEnd, workDays, location, whatsappPhone, bio, interests, goals, coachMode, summaryEnabled, summaryInterval, onSave])

  // ─── Vacation toggle ───
  const handleVacationToggle = useCallback(async (enabled: boolean) => {
    setVacationSaving(true)
    try {
      const res = await fetch('/api/nexus/vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          startDate: enabled ? vacationStart || undefined : undefined,
          endDate: enabled ? vacationEnd || undefined : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.profile) {
          setVacationEnabled(data.profile.vacationMode)
          setVacationStart(data.profile.vacationStartAt ? data.profile.vacationStartAt.slice(0, 10) : '')
          setVacationEnd(data.profile.vacationEndAt ? data.profile.vacationEndAt.slice(0, 10) : '')
          // Update parent profile via onSave
          onSave({
            vacationMode: data.profile.vacationMode,
            vacationStartAt: data.profile.vacationStartAt,
            vacationEndAt: data.profile.vacationEndAt,
          })
        }
      }
    } catch (err) {
      console.error('Vacation toggle failed:', err)
    } finally {
      setVacationSaving(false)
    }
  }, [vacationStart, vacationEnd, onSave])

  // ─── Google Calendar connect ───
  const handleConnectCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/calendar/connect')
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          window.open(data.url, '_blank', 'width=500,height=600')
        }
      }
      if (res.status === 400) {
        setGoogleCredsConfigured(false)
      }
    } catch (err) {
      console.error('Calendar connect failed:', err)
    }
  }, [])

  // ─── Google Calendar disconnect ───
  const handleDisconnectCalendar = useCallback(async () => {
    try {
      await fetch('/api/nexus/calendar/disconnect', { method: 'POST' })
      setCalendarConnected(false)
      setCalendarEvents([])
      onSave({ googleCalendarConnected: false, googleCalendarSyncEnabled: false })
    } catch (err) {
      console.error('Calendar disconnect failed:', err)
    }
  }, [onSave])

  // ─── Load calendar events ───
  const loadCalendarEvents = useCallback(async () => {
    if (!calendarConnected) return
    setCalendarLoading(true)
    try {
      const res = await fetch('/api/nexus/calendar/events')
      if (res.ok) {
        const data = await res.json()
        setCalendarEvents(data.events || [])
        setCalendarConnected(data.connected)
      }
    } catch { /* ignore */ } finally {
      setCalendarLoading(false)
    }
  }, [calendarConnected])

  useEffect(() => {
    if (calendarConnected) {
      loadCalendarEvents()
    }
  }, [calendarConnected, loadCalendarEvents])

  // ─── WhatsApp Real Link ───
  const whatsappRealLink = whatsappPhone
    ? `https://wa.me/52${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola NEXUS, quiero iniciar sesión')}`
    : null

  // ─── WhatsApp send now ───
  const handleSendSummaryNow = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/whatsapp/send', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setWaLogs((prev) => [data.log, ...prev].slice(0, 10))
      }
    } catch (err) {
      console.error('Failed to send summary:', err)
    }
  }, [])

  // Load WhatsApp logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const res = await fetch('/api/nexus/whatsapp/logs')
        if (res.ok) {
          const data = await res.json()
          setWaLogs(data.logs || [])
          if (data.connected !== undefined) setWaConnected(data.connected)
        }
      } catch { /* ignore */ }
    }
    loadLogs()
  }, [])

  let sectionIndex = 0

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-24 space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Perfil</h2>
            <p className="text-xs text-muted-foreground">Configuración de Coach de Vida</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 cursor-pointer"
            size="sm"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
          </Button>
        </motion.div>

        {/* Temperature overview */}
        {profile && (
          <motion.div
            custom={sectionIndex++}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
          >
            <TemperatureBar
              value={profile.temperature ?? 50}
              size="lg"
              showValue
              animated
              onClick={onRefreshTemperature}
            />
          </motion.div>
        )}

        {/* ═══ Section 1: Datos Personales ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <User className="w-4 h-4 text-emerald-500" />
                Datos Personales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Edad */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Edad</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Ej: 28"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Sexo/Género */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Sexo / Género</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="femenino">Femenino</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                      <SelectItem value="no_especificar">No especificar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Estado civil */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Estado civil</Label>
                  <Select value={relationshipStatus} onValueChange={setRelationshipStatus}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soltero">Soltero/a</SelectItem>
                      <SelectItem value="casado">Casado/a</SelectItem>
                      <SelectItem value="divorciado">Divorciado/a</SelectItem>
                      <SelectItem value="union_libre">Unión libre</SelectItem>
                      <SelectItem value="viudo">Viudo/a</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hijos */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Hijos</Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={children}
                    onChange={(e) => setChildren(e.target.value)}
                    placeholder="0"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Educación */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Educación</Label>
                  <Select value={education} onValueChange={setEducation}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="secundaria">Secundaria</SelectItem>
                      <SelectItem value="preparatoria">Preparatoria</SelectItem>
                      <SelectItem value="licenciatura">Licenciatura</SelectItem>
                      <SelectItem value="maestria">Maestría</SelectItem>
                      <SelectItem value="doctorado">Doctorado</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Section 2: Trabajo ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                Trabajo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ocupación */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Ocupación</Label>
                  <Input
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="Ej: Desarrollador de software"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Empresa */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Empresa</Label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Ej: TechCorp"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Horario */}
              <div className="space-y-2">
                <Label className="text-xs">Horario de trabajo</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="h-9 text-sm w-[120px]"
                    />
                    <span className="text-xs text-muted-foreground">a</span>
                    <Input
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="h-9 text-sm w-[120px]"
                    />
                  </div>
                </div>

                {/* Day selector */}
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((day) => (
                    <button
                      key={day.key}
                      onClick={() => toggleWorkDay(day.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                        workDays.includes(day.key)
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Section 3: Contacto & Vida ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="w-4 h-4 text-emerald-500" />
                Contacto & Vida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Ubicación */}
              <div className="space-y-1.5">
                <Label className="text-xs">Ubicación</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Ciudad de México, México"
                  className="h-9 text-sm"
                />
              </div>

              {/* WhatsApp */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Phone className="w-3 h-3" />
                  WhatsApp
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    +52
                  </span>
                  <Input
                    type="tel"
                    value={whatsappPhone?.replace(/^\+?52/, '') ?? ''}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="55 1234 5678"
                    className="h-9 text-sm pl-12"
                  />
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <Label className="text-xs">Biografía</Label>
                <Textarea
                  value={bio}
                  onChange={(e) => {
                    if (e.target.value.split('\n').length <= 3) {
                      setBio(e.target.value)
                    }
                  }}
                  placeholder="Cuéntanos un poco sobre ti..."
                  rows={3}
                  className="text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {bio.length}/200
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Section 4: Metas & Intereses ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Target className="w-4 h-4 text-emerald-500" />
                Metas & Intereses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Intereses */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Heart className="w-3 h-3 text-rose-400" />
                  Intereses
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addChip(interests, setInterests, interestInput)
                        setInterestInput('')
                      }
                    }}
                    placeholder="Agregar interés..."
                    className="h-9 text-sm flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0 cursor-pointer"
                    onClick={() => {
                      addChip(interests, setInterests, interestInput)
                      setInterestInput('')
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {interests.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="text-xs gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 pr-1"
                      >
                        {item}
                        <button
                          onClick={() => removeChip(interests, setInterests, item)}
                          className="ml-0.5 rounded-full hover:bg-emerald-200 dark:hover:bg-emerald-800/50 p-0.5 cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Metas */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Target className="w-3 h-3 text-amber-400" />
                  Metas de vida
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addChip(goals, setGoals, goalInput)
                        setGoalInput('')
                      }
                    }}
                    placeholder="Agregar meta..."
                    className="h-9 text-sm flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0 cursor-pointer"
                    onClick={() => {
                      addChip(goals, setGoals, goalInput)
                      setGoalInput('')
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {goals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {goals.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="text-xs gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 pr-1"
                      >
                        {item}
                        <button
                          onClick={() => removeChip(goals, setGoals, item)}
                          className="ml-0.5 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800/50 p-0.5 cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Section 5: Coach de Vida ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="w-4 h-4 text-emerald-500" />
                Coach de Vida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Coach mode */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Modo Coach</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Activa la personalidad de coach de vida en NEXUS
                  </p>
                </div>
                <Switch
                  checked={coachMode}
                  onCheckedChange={setCoachMode}
                />
              </div>

              <Separator className="opacity-50" />

              {/* WhatsApp auto-summary */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5" />
                      Resumen automático WhatsApp
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Recibe resúmenes de tu progreso por WhatsApp
                    </p>
                  </div>
                  <Switch
                    checked={summaryEnabled}
                    onCheckedChange={setSummaryEnabled}
                  />
                </div>

                {summaryEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pl-1"
                  >
                    {/* Interval */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Intervalo de resumen</Label>
                      <Select value={String(summaryInterval)} onValueChange={(v) => setSummaryInterval(Number(v))}>
                        <SelectTrigger className="h-9 text-sm w-full sm:w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                          <SelectItem value="120">2 horas</SelectItem>
                          <SelectItem value="240">4 horas</SelectItem>
                          <SelectItem value="480">8 horas</SelectItem>
                          <SelectItem value="720">12 horas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* WhatsApp number display */}
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Número: {whatsappPhone ? `+52 ${whatsappPhone}` : 'No configurado'}
                      </span>
                    </div>

                    {/* Next summary preview */}
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Clock className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        {profile?.lastSummarySent
                          ? `Último resumen: ${new Date(profile.lastSummarySent).toLocaleString('es-MX')}`
                          : 'El primer resumen se enviará próximamente'}
                      </span>
                    </div>

                    <Separator className="opacity-50" />

                    {/* WhatsApp panel */}
                    <WhatsAppPanel
                      isConnected={waConnected}
                      whatsappPhone={whatsappPhone}
                      summaryInterval={summaryInterval}
                      lastSummarySent={profile?.lastSummarySent}
                      logs={waLogs}
                      onSendNow={handleSendSummaryNow}
                    />
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Section 6: Conexiones ═══ */}
        <motion.div custom={sectionIndex++} variants={sectionVariants} initial="hidden" animate="visible">
          <Card className="border-l-2 border-l-emerald-500 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Plug className="w-4 h-4 text-emerald-500" />
                Conexiones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* ─── Vacation Mode ─── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏖️</span>
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">Modo Vacaciones</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Pausa notificaciones y resúmenes automáticos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${vacationEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-[10px] text-muted-foreground">
                      {vacationEnabled ? 'Activo' : 'Inactivo'}
                    </span>
                    <Switch
                      checked={vacationEnabled}
                      disabled={vacationSaving}
                      onCheckedChange={(checked) => handleVacationToggle(checked)}
                    />
                  </div>
                </div>

                {vacationEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pl-1"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Fecha inicio</Label>
                        <Input
                          type="date"
                          value={vacationStart}
                          onChange={(e) => setVacationStart(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Fecha fin</Label>
                        <Input
                          type="date"
                          value={vacationEnd}
                          onChange={(e) => setVacationEnd(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    {(vacationStart || vacationEnd) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVacationToggle(true)}
                        disabled={vacationSaving}
                        className="h-8 text-xs cursor-pointer"
                      >
                        {vacationSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                        Guardar fechas
                      </Button>
                    )}
                  </motion.div>
                )}
              </div>

              <Separator className="opacity-50" />

              {/* ─── Google Calendar ─── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  <Label className="text-sm font-semibold">Google Calendar</Label>
                  {calendarConnected && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Conectado
                    </span>
                  )}
                </div>

                {!calendarConnected ? (
                  <div className="space-y-2">
                    <Button
                      onClick={handleConnectCalendar}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-9 text-sm cursor-pointer"
                      size="sm"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Conectar Google Calendar
                    </Button>
                    {!googleCredsConfigured && (
                      <p className="text-[10px] text-amber-500">
                        Configura las credenciales de Google en .env
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Sync toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Sincronizar eventos</Label>
                      <Switch
                        checked={calendarSync}
                        onCheckedChange={(checked) => {
                          setCalendarSync(checked)
                          onSave({ googleCalendarSyncEnabled: checked })
                        }}
                      />
                    </div>

                    {/* Upcoming events */}
                    {calendarLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Cargando eventos...
                      </div>
                    )}
                    {!calendarLoading && calendarEvents.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Próximos eventos
                        </p>
                        {calendarEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className="flex items-start gap-2 p-2 rounded-lg bg-muted/50"
                          >
                            <Calendar className="w-3 h-3 mt-0.5 text-emerald-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{event.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(event.start).toLocaleString('es-MX', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnectCalendar}
                      className="text-xs text-destructive hover:text-destructive h-8 cursor-pointer"
                    >
                      Desconectar
                    </Button>
                  </div>
                )}
              </div>

              <Separator className="opacity-50" />

              {/* ─── WhatsApp Real Link ─── */}
              {whatsappRealLink && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-emerald-500" />
                    <Label className="text-sm font-semibold">WhatsApp Directo</Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Abre WhatsApp con un mensaje pre-llenado para NEXUS
                  </p>
                  <a
                    href={whatsappRealLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-2 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir WhatsApp
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Bottom save button (mobile sticky) */}
        <motion.div
          custom={sectionIndex++}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="sm:hidden"
        >
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 cursor-pointer"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'}
          </Button>
        </motion.div>
      </div>
    </ScrollArea>
  )
}
