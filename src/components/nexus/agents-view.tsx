'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Code2,
  BarChart3,
  PenTool,
  Plus,
  Sparkles,
  Zap,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import { Agent, AgentType, AGENT_CONFIGS } from './types'

// Agent icon helper
function AgentIconFull({ type, className = 'w-5 h-5' }: { type: string; className?: string }) {
  switch (type) {
    case 'coder': return <Code2 className={className} />
    case 'analyst': return <BarChart3 className={className} />
    case 'writer': return <PenTool className={className} />
    default: return <Brain className={className} />
  }
}

const DEFAULT_CAPABILITIES: Record<string, string[]> = {
  nexus: ['chat', 'razonamiento', 'memoria', 'tareas', 'búsqueda'],
  coder: ['código', 'debug', 'revisión', 'arquitectura', 'documentación'],
  analyst: ['datos', 'visualización', 'reportes', 'forecasting', 'insights'],
  writer: ['escritura', 'edición', 'traducción', 'resúmenes', 'brainstorming'],
  custom: ['personalizado'],
}

interface AgentsViewProps {
  agents: Agent[]
  selectedAgent: AgentType
  onSelectAgent: (agent: AgentType) => void
  onCreateAgent: (data: { name: string; type: string; description: string; personality: string; capabilities: string[] }) => Promise<void>
}

export function AgentsView({ agents, selectedAgent, onSelectAgent, onCreateAgent }: AgentsViewProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newAgent, setNewAgent] = useState({
    name: '',
    type: 'custom',
    description: '',
    personality: 'professional',
    capabilities: [] as string[],
  })
  const [customCap, setCustomCap] = useState('')

  const handleCreate = async () => {
    if (!newAgent.name.trim()) return
    setIsCreating(true)
    try {
      await onCreateAgent(newAgent)
      setShowCreate(false)
      setNewAgent({ name: '', type: 'custom', description: '', personality: 'professional', capabilities: [] })
    } finally {
      setIsCreating(false)
    }
  }

  const addCapability = () => {
    const cap = customCap.trim()
    if (cap && !newAgent.capabilities.includes(cap)) {
      setNewAgent({ ...newAgent, capabilities: [...newAgent.capabilities, cap] })
      setCustomCap('')
    }
  }

  const removeCapability = (cap: string) => {
    setNewAgent({ ...newAgent, capabilities: newAgent.capabilities.filter((c) => c !== cap) })
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Agentes IA</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gestiona tus asistentes especializados
            </p>
          </div>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Agente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Agente Personalizado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    placeholder="Nombre del agente"
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo base</Label>
                  <Select value={newAgent.type} onValueChange={(v) => setNewAgent({ ...newAgent, type: v, capabilities: DEFAULT_CAPABILITIES[v] || [] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nexus">General (NEXUS)</SelectItem>
                      <SelectItem value="coder">Código (CODEX)</SelectItem>
                      <SelectItem value="analyst">Datos (ANALYTICA)</SelectItem>
                      <SelectItem value="writer">Escritura (ESCRITOR)</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    placeholder="Describe qué hace este agente..."
                    value={newAgent.description}
                    onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Personalidad</Label>
                  <Select value={newAgent.personality} onValueChange={(v) => setNewAgent({ ...newAgent, personality: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Profesional</SelectItem>
                      <SelectItem value="creative">Creativo</SelectItem>
                      <SelectItem value="analytical">Analítico</SelectItem>
                      <SelectItem value="friendly">Amigable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacidades</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {newAgent.capabilities.map((cap) => (
                      <Badge key={cap} variant="secondary" className="gap-1">
                        {cap}
                        <button onClick={() => removeCapability(cap)} className="ml-0.5 hover:text-destructive cursor-pointer">×</button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Agregar capacidad..."
                      value={customCap}
                      onChange={(e) => setCustomCap(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCapability())}
                    />
                    <Button size="sm" variant="outline" onClick={addCapability} type="button" className="cursor-pointer">
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!newAgent.name.trim() || isCreating}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  {isCreating ? 'Creando...' : 'Crear Agente'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Agent cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {agents.map((agent, index) => {
              const config = AGENT_CONFIGS[agent.type as AgentType] || AGENT_CONFIGS.nexus
              const capabilities = JSON.parse(agent.capabilities || '[]') as string[]
              const isSelected = agent.type === selectedAgent

              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card
                    className={`group relative overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
                      isSelected
                        ? 'border-2 border-emerald-500/60 shadow-md shadow-emerald-500/10'
                        : 'border-border/50 hover:border-border'
                    }`}
                    onClick={() => onSelectAgent(agent.type as AgentType)}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3 z-10">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                    )}

                    <CardContent className="p-5">
                      {/* Agent avatar */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl ${config.bgLight} dark:${config.bgDark} flex items-center justify-center shadow-sm`}>
                          <AgentIconFull type={agent.type} className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{agent.name}</h3>
                          <p className="text-xs text-muted-foreground capitalize">{agent.personality}</p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {agent.description || 'Sin descripción'}
                      </p>

                      {/* Capabilities */}
                      <div className="flex flex-wrap gap-1.5">
                        {capabilities.slice(0, 4).map((cap) => (
                          <Badge key={cap} variant="outline" className="text-[10px] px-2 py-0 font-normal">
                            {cap}
                          </Badge>
                        ))}
                        {capabilities.length > 4 && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 font-normal">
                            +{capabilities.length - 4}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {agents.length === 0 && (
          <div className="text-center py-12">
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay agentes disponibles</p>
          </div>
        )}
      </div>
    </div>
  )
}
