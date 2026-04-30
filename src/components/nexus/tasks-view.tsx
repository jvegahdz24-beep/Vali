'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Loader2,
  Trash2,
  ListTodo,
  Filter,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Task } from './types'

type TaskStatus = Task['status']
type TaskPriority = Task['priority']
type FilterType = 'all' | TaskStatus

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <Circle className="w-3.5 h-3.5" /> },
  in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Loader2 className="w-3.5 h-3.5" /> },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: 'Fallida', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400', icon: <Trash2 className="w-3.5 h-3.5" /> },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Baja', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

interface TasksViewProps {
  tasks: Task[]
  onToggleTask: (id: string, status: TaskStatus) => Promise<void>
  onCreateTask: (data: { title: string; description: string; priority: TaskPriority; dueDate: string }) => Promise<void>
  onLoadTasks: () => Promise<void>
}

export function TasksView({ tasks, onToggleTask, onCreateTask, onLoadTasks }: TasksViewProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    dueDate: '',
  })

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)
  const pendingCount = tasks.filter((t) => t.status === 'pending').length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const completedCount = tasks.filter((t) => t.status === 'completed').length

  const handleCreate = async () => {
    if (!newTask.title.trim()) return
    setIsCreating(true)
    try {
      await onCreateTask(newTask)
      setShowCreate(false)
      setNewTask({ title: '', description: '', priority: 'medium', dueDate: '' })
      await onLoadTasks()
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggle = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed'
    await onToggleTask(task.id, newStatus)
    await onLoadTasks()
  }

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'Todas', count: tasks.length },
    { key: 'pending', label: 'Pendientes', count: pendingCount },
    { key: 'in_progress', label: 'En Progreso', count: inProgressCount },
    { key: 'completed', label: 'Completadas', count: completedCount },
  ]

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Tareas</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gestiona tus tareas y seguimientos
            </p>
          </div>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Nueva Tarea</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    placeholder="¿Qué necesitas hacer?"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Textarea
                    placeholder="Detalles de la tarea..."
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prioridad</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v as TaskPriority })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="critical">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha límite</Label>
                    <Input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!newTask.title.trim() || isCreating}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  {isCreating ? 'Creando...' : 'Crear Tarea'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
              className={`text-xs whitespace-nowrap cursor-pointer ${
                filter === f.key ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
              }`}
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 min-w-4 px-1 flex items-center justify-center">
                {f.count}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredTasks.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <ListTodo className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'all' ? 'No hay tareas todavía' : `No hay tareas ${filters.find((f) => f.key === filter)?.label.toLowerCase()}`}
                </p>
              </motion.div>
            ) : (
              filteredTasks.map((task, index) => {
                const statusConfig = STATUS_CONFIG[task.status]
                const priorityConfig = PRIORITY_CONFIG[task.priority]
                const isCompleted = task.status === 'completed'

                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <Card
                      className={`group transition-all hover:shadow-md cursor-pointer ${
                        isCompleted ? 'opacity-60' : ''
                      } border-border/40`}
                      onClick={() => handleToggle(task)}
                    >
                      <CardContent className="flex items-start gap-3 p-4">
                        {/* Checkbox */}
                        <button className="mt-0.5 flex-shrink-0 cursor-pointer">
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`text-sm font-medium truncate ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                              {task.title}
                            </h3>
                          </div>

                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] px-2 py-0 font-medium ${statusConfig.color}`}>
                              {statusConfig.label}
                            </Badge>
                            <Badge className={`text-[10px] px-2 py-0 font-medium ${priorityConfig.color}`}>
                              {priorityConfig.label}
                            </Badge>
                            {task.dueDate && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(task.dueDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
