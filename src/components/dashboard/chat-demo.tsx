'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Bot,
  Zap,
  Target,
  ArrowRight,
  Loader2,
  Sparkles,
  RotateCcw,
  MessageSquare,
} from 'lucide-react'
import { cn, timeAgo, getInitials } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface ChatMessage {
  id: string
  content: string
  direction: 'user' | 'ai'
  time: Date
  analysis?: {
    score?: number
    intent?: string
    action?: string
    stage?: string
    strategy?: string
    agentRouting?: {
      agentType?: string
      confidence?: number
    }
    followUpTasks?: Array<{ task: string; priority?: string }>
    crmUpdates?: Array<{ type: string; value: string[] }>
  }
  isLoading?: boolean
}

interface AnalysisResult {
  action?: string
  strategy?: string
  agentRouting?: {
    agentType?: string
    confidence?: number
  }
  followUpTasks?: Array<{ task: string; priority?: string }>
  crmUpdates?: Array<{ type: string; value: string[] }>
}

interface ChatDemoProps {
  workspaceId: string
}

const SUGGESTED_PROMPTS = [
  'Hola, busco información sobre sus servicios',
  '¿Cuánto cuesta el plan con financiamiento?',
  'Tengo un presupuesto definido, ¿qué opciones tienen?',
  '¿Tienen disponibilidad inmediata?',
]

function getActionLabel(action?: string): string {
  const labels: Record<string, string> = {
    qualify: 'Calificar',
    educate: 'Educar',
    close: 'Cerrar',
    follow_up: 'Seguimiento',
    handle_objection: 'Manejar objeción',
    question: 'Preguntar',
    schedule: 'Agendar',
    nurture: 'Nutrir',
  }
  return labels[action || ''] || action || '—'
}

function getIntentLabel(intent?: string): string {
  const labels: Record<string, string> = {
    greeting: 'Saludo',
    question: 'Pregunta',
    buy_signal: 'Señal de compra',
    objection: 'Objeción',
    appointment: 'Cita',
    price_inquiry: 'Consulta precio',
    vehicle_inquiry: 'Consulta producto',
    financing: 'Financiamiento',
  }
  return labels[intent || ''] || intent || '—'
}

function getStageLabel(stage?: string): string {
  const labels: Record<string, string> = {
    new: 'Lead Nuevo',
    contacted: 'Contactado',
    qualified: 'Cualificado',
    proposal: 'Propuesta',
    negotiation: 'Negociación',
    won: 'Cerrado Ganado',
  }
  return labels[stage || ''] || stage || '—'
}

function getActionColor(action?: string): string {
  if (action === 'close') return 'bg-red-100 text-red-700'
  if (action === 'qualify') return 'bg-emerald-100 text-emerald-700'
  if (action === 'educate') return 'bg-blue-100 text-blue-700'
  if (action === 'follow_up') return 'bg-yellow-100 text-yellow-700'
  if (action === 'handle_objection') return 'bg-orange-100 text-orange-700'
  return 'bg-zinc-100 text-zinc-700'
}

function getScoreColor(score?: number): string {
  if (!score) return 'bg-zinc-100 text-zinc-700'
  if (score >= 80) return 'bg-emerald-100 text-emerald-700'
  if (score >= 60) return 'bg-yellow-100 text-yellow-700'
  if (score >= 40) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

export function ChatDemo({ workspaceId }: ChatDemoProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return

    setError(null)
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      content: content.trim(),
      direction: 'user',
      time: new Date(),
    }

    const loadingMsg: ChatMessage = {
      id: `msg-${Date.now()}-loading`,
      content: 'Pensando...',
      direction: 'ai',
      time: new Date(),
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          message: content.trim(),
          channel: 'whatsapp',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Error del servidor')
      }

      // Build AI response text
      const response = data.response
      let responseText = ''
      if (response) {
        const parts = [response.insight, response.direction, response.question].filter(Boolean)
        responseText = parts.join('\n\n')
      }

      if (!responseText) {
        responseText = 'No se pudo generar una respuesta. Intenta de nuevo.'
      }

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        content: responseText,
        direction: 'ai',
        time: new Date(),
        analysis: {
          action: data.analysis?.action,
          strategy: data.analysis?.strategy,
          agentRouting: data.analysis?.agentRouting,
          followUpTasks: data.analysis?.followUpTasks,
        },
      }

      setMessages((prev) => prev.filter((m) => !m.isLoading).concat(aiMsg))
      setAnalysis(data.analysis || null)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido'
      setError(errMsg)
      setMessages((prev) => prev.filter((m) => !m.isLoading))
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleReset = () => {
    setMessages([])
    setAnalysis(null)
    setError(null)
    inputRef.current?.focus()
  }

  const lastAnalysis = messages.length > 0 && !messages[messages.length - 1].isLoading
    ? messages[messages.length - 1].analysis
    : analysis

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-4rem)] flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10">
            <Zap className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Chat IA en Vivo</h2>
            <p className="text-xs text-muted-foreground">
              Revenue Engine · Pipeline 9 pasos · Personalidad JHON
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-6 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
            <Sparkles className="h-3 w-3" />
            Datos reales
          </Badge>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleReset}>
            <RotateCcw className="h-3 w-3" />
            Limpiar
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Chat Panel */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden border-border/60">
          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 mb-4">
                    <MessageSquare className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    Demo del Revenue Engine
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    Envía un mensaje y observa cómo JHON procesa la solicitud a través del pipeline de 9 pasos:
                    análisis → trigger → decisión → objeto → generación → seguimiento → CRM → routing → entrega.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="text-xs px-3 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 transition-colors text-left"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2.5',
                    msg.direction === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.direction === 'ai' && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px]">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn('max-w-[80%]')}>
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line',
                        msg.direction === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-md'
                          : 'bg-muted rounded-bl-md border border-border/60'
                      )}
                    >
                      {msg.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Procesando con Revenue Engine...</span>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    <div className={cn(
                      'flex items-center gap-2 mt-1 px-1',
                      msg.direction === 'user' ? 'justify-end' : 'justify-start'
                    )}>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(msg.time)}
                      </span>
                      {msg.direction === 'ai' && !msg.isLoading && (
                        <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-emerald-50 text-emerald-600 border-0 gap-0.5">
                          <Bot className="h-2.5 w-2.5" />
                          JHON
                        </Badge>
                      )}
                    </div>
                  </div>
                  {msg.direction === 'user' && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[10px] font-semibold">
                        TÚ
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Error */}
          {error && (
            <div className="px-4 pb-2">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <span className="font-medium">Error:</span> {error}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-border shrink-0">
            <div className="max-w-2xl mx-auto flex items-end gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  placeholder="Escribe un mensaje como prospecto..."
                  className="h-11 rounded-xl bg-muted/50 border-0 focus-visible:ring-1 pr-12"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(input)
                    }
                  }}
                  disabled={isLoading}
                />
              </div>
              <Button
                size="icon"
                className="h-11 w-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 disabled:opacity-50"
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Analysis Panel */}
        <Card className="flex flex-col overflow-hidden border-border/60">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-600" />
              Análisis del Revenue Engine
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="space-y-3">
              {lastAnalysis ? (
                <>
                  {/* Action */}
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                      Acción determinada
                    </p>
                    <Badge className={cn('text-xs', getActionColor(lastAnalysis.action))}>
                      <ArrowRight className="h-3 w-3 mr-1" />
                      {getActionLabel(lastAnalysis.action)}
                    </Badge>
                  </div>

                  {/* Strategy */}
                  {lastAnalysis.strategy && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                        Estrategia
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">
                        {lastAnalysis.strategy}
                      </p>
                    </div>
                  )}

                  {/* Agent Routing */}
                  {lastAnalysis.agentRouting && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                        Agente asignado
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-0">
                          {getIntentLabel(lastAnalysis.agentRouting.agentType as string)}
                        </Badge>
                        {lastAnalysis.agentRouting.confidence && (
                          <Badge className={cn('text-[10px]', getScoreColor(lastAnalysis.agentRouting.confidence * 100))}>
                            {Math.round(lastAnalysis.agentRouting.confidence * 100)}% confianza
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Tasks */}
                  {lastAnalysis.followUpTasks && lastAnalysis.followUpTasks.length > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                        Tareas de seguimiento
                      </p>
                      <div className="space-y-1.5">
                        {lastAnalysis.followUpTasks.map((task, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground">
                            <span className="text-emerald-500 mt-0.5">•</span>
                            <span>{task.task}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CRM Updates */}
                  {lastAnalysis.crmUpdates && lastAnalysis.crmUpdates.length > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                        Actualizaciones CRM
                      </p>
                      <div className="space-y-1.5">
                        {lastAnalysis.crmUpdates.map((update, i) => (
                          <div key={i} className="text-xs text-foreground">
                            <span className="font-medium">{update.type}:</span>{' '}
                            <span className="text-muted-foreground">
                              {Array.isArray(update.value) ? update.value.join(', ') : update.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Pipeline Steps Info */}
                  <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                    <p className="text-[10px] text-emerald-600 uppercase font-semibold mb-2">
                      Pipeline de 9 pasos ejecutado
                    </p>
                    <div className="space-y-1">
                      {[
                        '1. Analizar mensaje entrante',
                        '2. Detectar trigger',
                        '3. Decidir acción',
                        '4. Generar objetivo',
                        '5. Crear respuesta (JHON)',
                        '6. Planificar seguimiento',
                        '7. Actualizar CRM',
                        '8. Routing de agente',
                        '9. Entregar respuesta',
                      ].map((step) => (
                        <div key={step} className="text-[10px] text-emerald-700 flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-emerald-500" />
                          {step.replace(/^\d+\.\s/, '')}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Envía un mensaje para ver el análisis del Revenue Engine en tiempo real
                  </p>
                </div>
              )}
            </CardContent>
          </ScrollArea>
        </Card>
      </div>
    </div>
  )
}
