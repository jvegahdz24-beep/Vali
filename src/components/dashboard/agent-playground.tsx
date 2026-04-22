'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bot,
  Send,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Zap,
  Brain,
  Clock,
  Coins,
  Sparkles,
  AlertCircle,
  MessageSquare,
  Settings2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

// ── Types ──

interface Agent {
  id: string
  name: string
  type: string
  model: string
  modelName: string
  temperature: number
  personality: string
  description?: string
  systemPrompt?: string
  isActive?: boolean
  _count?: { logs: number; memories: number; followUpRules: number }
}

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
  agentName?: string
  agentModel?: string
  latencyMs?: number
  tokenCount?: number
  analysis?: {
    action?: string
    strategy?: string
    agentRouting?: string
    followUpTasks?: string[]
    crmUpdates?: string[]
  }
}

interface AgentPlaygroundProps {
  workspaceId: string
}

const presetMessages = [
  { label: 'Consulta general', text: 'Hola, quiero información sobre sus servicios' },
  { label: 'Consulta de precio', text: '¿Cuánto cuesta?' },
  { label: 'Objeción', text: 'Ya no me interesa, es muy caro' },
  { label: 'Agendar cita', text: 'Quiero agendar una cita para revisar las opciones' },
]

export function AgentPlayground({ workspaceId }: AgentPlaygroundProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [analyzeOpen, setAnalyzeOpen] = useState(true)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch agents
  useEffect(() => {
    if (!workspaceId) return
    const fetchAgents = async () => {
      try {
        setLoadingAgents(true)
        const res = await fetch(`/api/agents?workspaceId=${workspaceId}&includeInactive=true`)
        if (!res.ok) throw new Error('Error al cargar agentes')
        const data = await res.json()
        const agentList = data.items || []
        setAgents(agentList)
        if (agentList.length > 0) {
          setSelectedAgentId(agentList[0].id)
          setSelectedAgent(agentList[0])
        }
      } catch {
        toast.error('Error al cargar agentes')
      } finally {
        setLoadingAgents(false)
      }
    }
    fetchAgents()
  }, [workspaceId])

  // Update selected agent when ID changes
  useEffect(() => {
    const agent = agents.find(a => a.id === selectedAgentId)
    setSelectedAgent(agent || null)
  }, [selectedAgentId, agents])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !selectedAgent || isLoading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          agentId: selectedAgent.id,
          workspaceId,
          channel: 'webchat',
          conversationId,
        }),
      })

      if (!res.ok) throw new Error('Error en la respuesta del agente')

      const data = await res.json()

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId)
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: data.response || 'Sin respuesta',
        timestamp: new Date(),
        agentName: selectedAgent.name,
        agentModel: selectedAgent.modelName || selectedAgent.model,
        latencyMs: data.latencyMs,
        tokenCount: data.analysis ? Math.ceil((data.response || '').length / 4) : undefined,
        analysis: data.analysis || undefined,
      }

      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'ai',
        content: 'Lo siento, ocurrió un error al procesar tu mensaje. Inténtalo de nuevo.',
        timestamp: new Date(),
        agentName: selectedAgent.name,
      }
      setMessages(prev => [...prev, errorMsg])
      toast.error('Error al enviar mensaje')
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [selectedAgent, isLoading, workspaceId, conversationId])

  const handleSend = () => {
    sendMessage(inputValue)
  }

  const handlePresetClick = (text: string) => {
    sendMessage(text)
  }

  const clearChat = () => {
    setMessages([])
    setConversationId(undefined)
  }

  // Get the last AI message with analysis for the panel
  const lastAnalysis = [...messages].reverse().find(m => m.role === 'ai' && m.analysis)?.analysis

  return (
    <div className="flex h-full gap-0">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 lg:p-6 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-500" />
                Playground IA
              </h3>
              <p className="text-sm text-muted-foreground">
                Prueba y evalúa tus agentes IA en tiempo real
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:hidden"
                onClick={() => setAnalyzeOpen(!analyzeOpen)}
              >
                {analyzeOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Agent Selector + Config */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              {loadingAgents ? (
                <Skeleton className="h-9 w-full" />
              ) : agents.length === 0 ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  No hay agentes configurados. Crea uno primero.
                </div>
              ) : (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-9">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-emerald-500" />
                      <SelectValue placeholder="Seleccionar agente" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <span>{agent.name}</span>
                          <Badge variant="secondary" className="text-[9px] bg-muted border-0">{agent.type}</Badge>
                          {!agent.isActive && (
                            <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-700 border-0">Inactivo</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={clearChat} disabled={messages.length === 0}>
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 hidden lg:flex"
                onClick={() => setAnalyzeOpen(!analyzeOpen)}
              >
                {analyzeOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                Análisis
              </Button>
            </div>
          </div>

          {/* Agent Config Display */}
          {selectedAgent && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                <Settings2 className="h-3 w-3" />
                {selectedAgent.modelName || selectedAgent.model}
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Zap className="h-3 w-3" />
                Temp: {selectedAgent.temperature}
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Brain className="h-3 w-3" />
                {selectedAgent.personality}
              </Badge>
              {selectedAgent._count && (
                <span className="text-[10px] text-muted-foreground">
                  {selectedAgent._count.logs} conversaciones previas
                </span>
              )}
            </div>
          )}
        </div>

        {/* Preset Messages */}
        {messages.length === 0 && (
          <div className="px-4 lg:px-6 pt-4">
            <div className="flex flex-wrap gap-2">
              {presetMessages.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset.text)}
                  disabled={!selectedAgent || isLoading}
                  className="text-xs px-3 py-2 rounded-full border border-border hover:bg-muted/50 hover:border-emerald-300 dark:hover:border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                <MessageSquare className="h-10 w-10 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Conversación vacía</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecciona un agente y envía un mensaje para comenzar
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'ai' && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">
                        {getInitials(msg.agentName || 'IA')}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn('max-w-[75%] space-y-1.5', msg.role === 'user' ? 'items-end' : 'items-start')}>
                    <div className={cn(
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-muted dark:bg-slate-800 text-foreground rounded-bl-md'
                    )}>
                      {msg.content}
                    </div>
                    {/* AI Metadata */}
                    {msg.role === 'ai' && (msg.agentName || msg.latencyMs) && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                        {msg.agentName && <span className="font-medium">{msg.agentName}</span>}
                        {msg.agentModel && <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-muted border-0">{msg.agentModel}</Badge>}
                        {msg.latencyMs && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {(msg.latencyMs / 1000).toFixed(1)}s
                          </span>
                        )}
                        {msg.tokenCount && (
                          <span className="flex items-center gap-0.5">
                            <Coins className="h-2.5 w-2.5" />
                            ~{msg.tokenCount} tokens
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-semibold dark:bg-violet-500/20 dark:text-violet-400">
                        TÚ
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-8 w-8 shrink-0 mt-1">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold dark:bg-emerald-500/20 dark:text-emerald-400">
                      {getInitials(selectedAgent?.name || 'IA')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Pensando...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 lg:px-6 border-t border-border">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <Input
              ref={inputRef}
              placeholder={selectedAgent ? `Mensaje para ${selectedAgent.name}...` : 'Selecciona un agente primero...'}
              className="flex-1 h-11"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={!selectedAgent || isLoading}
            />
            <Button
              className="h-11 w-11 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSend}
              disabled={!inputValue.trim() || !selectedAgent || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 max-w-3xl mx-auto">
            <span className="text-[10px] text-muted-foreground">
              {messages.length > 0 && `${messages.length} mensaje${messages.length !== 1 ? 's' : ''} · ${conversationId ? 'Conversación activa' : 'Nueva conversación'}`}
            </span>
            {messages.length > 0 && (
              <div className="flex gap-2">
                {presetMessages.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset.text)}
                    disabled={isLoading}
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analysis Panel */}
      {analyzeOpen && (
        <div className="hidden lg:flex flex-col w-[320px] border-l border-border bg-muted/30 dark:bg-slate-950/50 shrink-0">
          <div className="p-4 border-b border-border">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-emerald-500" />
              Panel de Análisis
            </h4>
            <p className="text-[10px] text-muted-foreground mt-0.5">Revenue Engine en acción</p>
          </div>

          <ScrollArea className="flex-1 p-4">
            {lastAnalysis ? (
              <div className="space-y-4">
                {/* Action */}
                {lastAnalysis.action && (
                  <Card className="border-border/60">
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-emerald-500" />
                        Acción Detectada
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-500/20 dark:text-emerald-400">
                        {lastAnalysis.action}
                      </Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Strategy */}
                {lastAnalysis.strategy && (
                  <Card className="border-border/60">
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Brain className="h-3 w-3 text-violet-500" />
                        Estrategia
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs text-muted-foreground leading-relaxed">{lastAnalysis.strategy}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Agent Routing */}
                {lastAnalysis.agentRouting && (
                  <Card className="border-border/60">
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Bot className="h-3 w-3 text-blue-500" />
                        Enrutamiento de Agente
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs text-muted-foreground">{lastAnalysis.agentRouting}</p>
                    </CardContent>
                  </Card>
                )}

                {/* CRM Updates */}
                {lastAnalysis.crmUpdates && lastAnalysis.crmUpdates.length > 0 && (
                  <Card className="border-border/60">
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Settings2 className="h-3 w-3 text-orange-500" />
                        Actualizaciones CRM
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1.5">
                      {lastAnalysis.crmUpdates.map((update, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <p className="text-[11px] text-muted-foreground">{update}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Follow-up Tasks */}
                {lastAnalysis.followUpTasks && lastAnalysis.followUpTasks.length > 0 && (
                  <Card className="border-border/60">
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-amber-500" />
                        Tareas de Seguimiento
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1.5">
                      {lastAnalysis.followUpTasks.map((task, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <p className="text-[11px] text-muted-foreground">{task}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <div className="p-3 rounded-xl bg-muted dark:bg-slate-800">
                  <Brain className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-muted-foreground">Sin análisis aún</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Envía un mensaje para ver el análisis del Revenue Engine
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
