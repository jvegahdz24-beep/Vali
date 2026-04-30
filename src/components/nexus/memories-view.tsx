'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Plus,
  Trash2,
  Tag,
  BookOpen,
  Settings,
  Info,
  Lightbulb,
  Search,
  Star,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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
import { Memory } from './types'

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  preference: { label: 'Preferencias', icon: <Settings className="w-3.5 h-3.5" />, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  fact: { label: 'Hechos', icon: <Info className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  instruction: { label: 'Instrucciones', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  context: { label: 'Contexto', icon: <Lightbulb className="w-3.5 h-3.5" />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  skill: { label: 'Habilidades', icon: <Star className="w-3.5 h-3.5" />, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  general: { label: 'General', icon: <Tag className="w-3.5 h-3.5" />, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
}

interface MemoriesViewProps {
  memories: Memory[]
  onLoadMemories: () => Promise<void>
  onCreateMemory: (data: { key: string; value: string; category: string; importance: number }) => Promise<void>
  onDeleteMemory: (key: string) => Promise<void>
}

export function MemoriesView({ memories, onLoadMemories, onCreateMemory, onDeleteMemory }: MemoriesViewProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [newMemory, setNewMemory] = useState({
    key: '',
    value: '',
    category: 'general',
    importance: 5,
  })

  const categories = useMemo(() => {
    const cats = new Set(memories.map((m) => m.category))
    return Array.from(cats)
  }, [memories])

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const matchesSearch = !search ||
        m.key.toLowerCase().includes(search.toLowerCase()) ||
        m.value.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [memories, search, categoryFilter])

  // Group memories by category
  const grouped = useMemo(() => {
    const groups: Record<string, Memory[]> = {}
    filteredMemories.forEach((m) => {
      if (!groups[m.category]) groups[m.category] = []
      groups[m.category].push(m)
    })
    return groups
  }, [filteredMemories])

  const handleCreate = async () => {
    if (!newMemory.key.trim() || !newMemory.value.trim()) return
    setIsCreating(true)
    try {
      await onCreateMemory(newMemory)
      setShowCreate(false)
      setNewMemory({ key: '', value: '', category: 'general', importance: 5 })
      await onLoadMemories()
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (key: string) => {
    await onDeleteMemory(key)
    await onLoadMemories()
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Memoria</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Lo que NEXUS recuerda sobre ti ({memories.length} memorias)
            </p>
          </div>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Memoria
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Agregar Memoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Clave (identificador)</Label>
                  <Input
                    placeholder="Ej: nombre, empresa, idioma_preferido"
                    value={newMemory.key}
                    onChange={(e) => setNewMemory({ ...newMemory, key: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Textarea
                    placeholder="El dato a recordar..."
                    value={newMemory.value}
                    onChange={(e) => setNewMemory({ ...newMemory, value: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Select value={newMemory.category} onValueChange={(v) => setNewMemory({ ...newMemory, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preference">Preferencias</SelectItem>
                        <SelectItem value="fact">Hechos</SelectItem>
                        <SelectItem value="instruction">Instrucciones</SelectItem>
                        <SelectItem value="context">Contexto</SelectItem>
                        <SelectItem value="skill">Habilidades</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Importancia: {newMemory.importance}/10</Label>
                    <Input
                      type="range"
                      min={1}
                      max={10}
                      value={newMemory.importance}
                      onChange={(e) => setNewMemory({ ...newMemory, importance: parseInt(e.target.value) })}
                      className="h-9 px-0 cursor-pointer"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!newMemory.key.trim() || !newMemory.value.trim() || isCreating}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  {isCreating ? 'Guardando...' : 'Guardar Memoria'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar memorias..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_CONFIG[cat]?.label || cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Memory groups */}
        <AnimatePresence>
          {Object.keys(grouped).length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || categoryFilter !== 'all' ? 'No se encontraron memorias' : 'No hay memorias guardadas'}
              </p>
            </motion.div>
          ) : (
            Object.entries(grouped).map(([category, mems], groupIndex) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.05 }}
                  className="mb-6"
                >
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={`${config.color} gap-1.5 text-xs font-medium`}>
                      {config.icon}
                      {config.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{mems.length} memorias</span>
                  </div>

                  {/* Memory cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mems.map((memory) => (
                      <motion.div
                        key={memory.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Card className="border-border/40 hover:border-border/60 transition-all group">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-medium text-foreground truncate">
                                    {memory.key}
                                  </h3>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 flex-shrink-0"
                                  >
                                    {memory.source}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                  {memory.value}
                                </p>
                                {/* Importance bar */}
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={memory.importance * 10}
                                    className="h-1 flex-1"
                                  />
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {memory.importance}/10
                                  </span>
                                </div>
                              </div>

                              {/* Delete button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(memory.key)
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
