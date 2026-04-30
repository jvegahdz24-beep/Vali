'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus,
  Search,
  Star,
  Phone,
  Mail,
  Building2,
  Users,
  Heart,
  Briefcase,
  GraduationCap,
  Trash2,
  Edit3,
  X,
  Plus,
  Check,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { NexusContact } from './types'

// ─── Types ───
interface ContactFormData {
  name: string
  phone?: string
  email?: string
  relation: string
  company?: string
  role?: string
  birthday?: string
  notes?: string
}

interface ContactsViewProps {
  contacts: NexusContact[]
  onCreateContact: (data: ContactFormData) => Promise<void>
  onDeleteContact: (id: string) => Promise<void>
  onLoadContacts: () => Promise<void>
}

// ─── Relation config ───
const RELATION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  familiar: { label: 'Familia', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800', icon: <Heart className="w-3.5 h-3.5" /> },
  amigo: { label: 'Amigo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800', icon: <Users className="w-3.5 h-3.5" /> },
  companero: { label: 'Compañero', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', icon: <Briefcase className="w-3.5 h-3.5" /> },
  colega: { label: 'Colega', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800', icon: <GraduationCap className="w-3.5 h-3.5" /> },
  jefo: { label: 'Jefe', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800', icon: <Briefcase className="w-3.5 h-3.5" /> },
  otro: { label: 'Otro', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800', icon: <Users className="w-3.5 h-3.5" /> },
}

const FILTER_TABS = [
  { key: 'all', label: 'Todos', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'familiar', label: 'Familia', icon: <Heart className="w-3.5 h-3.5" /> },
  { key: 'amigo', label: 'Amigos', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'companero', label: 'Compañeros', icon: <Briefcase className="w-3.5 h-3.5" /> },
  { key: 'otro', label: 'Otros', icon: <Users className="w-3.5 h-3.5" /> },
]

// ═══════════════════════════════════════════════════════════════
// CONTACTS VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════
export function ContactsView({ contacts, onCreateContact, onDeleteContact }: ContactsViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    phone: '',
    email: '',
    relation: 'amigo',
    company: '',
    role: '',
    birthday: '',
    notes: '',
  })

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = activeFilter === 'all' || c.relation === activeFilter
    return matchesSearch && matchesFilter
  })

  // Handle create
  const handleCreate = async () => {
    if (!formData.name.trim()) return
    setIsCreating(true)
    try {
      await onCreateContact(formData)
      setFormData({ name: '', phone: '', email: '', relation: 'amigo', company: '', role: '', birthday: '', notes: '' })
      setIsCreateOpen(false)
    } finally {
      setIsCreating(false)
    }
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    await onDeleteContact(id)
    setDeleteConfirm(null)
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Personas</h2>
          <Badge variant="secondary" className="text-[10px] h-5 min-w-5 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {contacts.length}
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <Input
          placeholder="Buscar personas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm bg-muted/40 border-border/60"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeFilter === tab.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveFilter(tab.key)}
            className={`flex-shrink-0 gap-1.5 h-8 text-xs cursor-pointer ${
              activeFilter === tab.key
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Contact list */}
      <ScrollArea className="flex-1 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="space-y-2 pb-4">
          <AnimatePresence>
            {filteredContacts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {searchQuery || activeFilter !== 'all'
                    ? 'No se encontraron personas'
                    : 'Aún no tienes personas guardadas'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {searchQuery || activeFilter !== 'all'
                    ? 'Intenta con otro filtro o búsqueda'
                    : 'Agrega a las personas importantes de tu vida'}
                </p>
              </motion.div>
            ) : (
              filteredContacts.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15, delay: index * 0.03 }}
                >
                  <Card className="border-border/50 hover:border-emerald-500/30 transition-colors group">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        {/* Avatar initial */}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate">{contact.name}</h3>
                            {RELATION_CONFIG[contact.relation] && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-5 px-1.5 flex-shrink-0 ${RELATION_CONFIG[contact.relation].color}`}
                              >
                                {RELATION_CONFIG[contact.relation].label}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {contact.phone}
                              </span>
                            )}
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </span>
                            )}
                            {contact.company && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {contact.company}{contact.role ? ` · ${contact.role}` : ''}
                              </span>
                            )}
                            {contact.birthday && (
                              <span className="flex items-center gap-1 text-rose-500">
                                <Heart className="w-3 h-3" />
                                {contact.birthday}
                              </span>
                            )}
                          </div>

                          {contact.notes && (
                            <p className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-1">{contact.notes}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {/* Favorite */}
                          <button
                            onClick={() => {
                              // Optimistic — would need PATCH for full impl
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                contact.isFavorite
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-muted-foreground/40'
                              }`}
                            />
                          </button>

                          {/* Delete */}
                          {deleteConfirm === contact.id ? (
                            <div className="flex items-center gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer"
                                onClick={() => handleDelete(contact.id)}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 cursor-pointer"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(contact.id)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground/40 hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Floating add button */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 cursor-pointer"
            size="icon"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Nueva persona</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                placeholder="Nombre completo"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {/* Relation */}
            <div className="space-y-1.5">
              <Label className="text-xs">Relación</Label>
              <Select value={formData.relation} onValueChange={(v) => setFormData({ ...formData, relation: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="familiar">Familia</SelectItem>
                  <SelectItem value="amigo">Amigo</SelectItem>
                  <SelectItem value="companero">Compañero</SelectItem>
                  <SelectItem value="colega">Colega</SelectItem>
                  <SelectItem value="jefo">Jefe</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Teléfono</Label>
                <Input
                  placeholder="+52 55 1234"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  placeholder="correo@ejemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Company + Role */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Input
                  placeholder="Nombre"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Puesto</Label>
                <Input
                  placeholder="Rol"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Birthday */}
            <div className="space-y-1.5">
              <Label className="text-xs">Cumpleaños</Label>
              <Input
                type="date"
                value={formData.birthday || ''}
                onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Input
                placeholder="Notas opcionales..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleCreate}
              disabled={!formData.name.trim() || isCreating}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              size="sm"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Agregar persona
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
