'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Send,
  Loader2,
  Zap,
  Heart,
  Shuffle,
  ChevronDown,
  ChevronUp,
  Activity,
  MessageSquare,
  Bot,
  User,
  Sparkles,
  Clock,
  Cpu,
  RotateCcw,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Shield,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  orchestratorData?: {
    mode: string
    intent: string
    confidence: number
    reasoning: string
    valiautoflowAgent?: string
    valiautoflowStage?: string
    model: string
    tokensUsed: number
    latencyMs: number
    events: OrchEvent[]
  }
}

interface OrchEvent {
  type: string
  timestamp: string
  data: Record<string, unknown>
}

type ForceMode = 'auto' | 'valiautoflow' | 'nexus' | 'blended'

// ─── Quick message suggestions ──────────────────────────────

const QUICK_MESSAGES = [
  { text: 'Hola, buenos días', mode: 'auto' as ForceMode, icon: '👋', category: 'Greeting' },
  { text: 'Me siento muy estresado con mi negocio últimamente', mode: 'auto' as ForceMode, icon: '😰', category: 'Emotional' },
  { text: '¿Cuánto cuesta el plan premium?', mode: 'auto' as ForceMode, icon: '💰', category: 'Commercial' },
  { text: 'Quiero agendar una demo para ver cómo funciona', mode: 'auto' as ForceMode, icon: '📅', category: 'Commercial' },
  { text: 'Mi esposa está embarazada y necesito algo que me dé tranquilidad financiera', mode: 'auto' as ForceMode, icon: '👶', category: 'Mixed' },
  { text: 'Tengo una agencia automotriz y perdemos como 30 leads al mes', mode: 'auto' as ForceMode, icon: '🚗', category: 'Commercial' },
  { text: '¿Cómo puedo mejorar mi proceso de ventas?', mode: 'auto' as ForceMode, icon: '📊', category: 'Commercial' },
  { text: 'No tengo presupuesto ahora mismo, pero me interesa', mode: 'auto' as ForceMode, icon: '🤔', category: 'Mixed' },
]

// ─── Mode colors and labels ─────────────────────────────────

const MODE_CONFIG = {
  valiautoflow: {
    label: 'ValiAutoFlow',
    icon: Zap,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    gradient: 'from-amber-500 to-orange-500',
  },
  nexus: {
    label: 'NEXUS',
    icon: Heart,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    gradient: 'from-emerald-500 to-teal-500',
  },
  blended: {
    label: 'Blended',
    icon: Shuffle,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-800',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
    gradient: 'from-violet-500 to-purple-500',
  },
} as const

const INTENT_CONFIG = {
  commercial: { label: 'Commercial', color: 'text-amber-600' },
  emotional: { label: 'Emotional', color: 'text-emerald-600' },
  mixed: { label: 'Mixed', color: 'text-violet-600' },
} as const

const STAGE_LABELS: Record<string, string> = {
  exploration: 'Exploration',
  interest: 'Interest',
  intention: 'Intention',
}

const AGENT_LABELS: Record<string, string> = {
  diagnostico: 'Diagnosis Agent',
  estratega: 'Strategy Agent',
  cerrador: 'Closing Agent',
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function OrchestratorDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [forceMode, setForceMode] = useState<ForceMode>('auto')
  const [selectedEventMsg, setSelectedEventMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Send message
  const sendMessage = useCallback(async (text: string, mode: ForceMode = forceMode) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const body: Record<string, unknown> = {
        message: text.trim(),
        conversationHistory,
      }
      if (mode !== 'auto') body.forceMode = mode

      const res = await fetch('/api/orchestrator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        orchestratorData: {
          mode: data.mode,
          intent: data.intent,
          confidence: data.confidence,
          reasoning: data.reasoning,
          valiautoflowAgent: data.valiautoflowAgent,
          valiautoflowStage: data.valiautoflowStage,
          model: data.model,
          tokensUsed: data.tokensUsed,
          latencyMs: data.latencyMs,
          events: data.events || [],
        },
      }

      setMessages(prev => [...prev, assistantMsg])
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: text.trim() },
        { role: 'assistant', content: data.response },
      ])
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [forceMode, conversationHistory, isLoading])

  const clearConversation = useCallback(() => {
    setMessages([])
    setConversationHistory([])
    setSelectedEventMsg(null)
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }, [input, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }, [input, sendMessage])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-violet-500 to-emerald-500 flex items-center justify-center shadow-sm">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Dual Agent Orchestrator</h1>
              <p className="text-[11px] text-muted-foreground">ValiAutoFlow + NEXUS Core Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Force mode selector */}
            <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              {(['auto', 'valiautoflow', 'nexus', 'blended'] as ForceMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setForceMode(mode)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
                    forceMode === mode
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {mode === 'auto' ? 'Auto' : MODE_CONFIG[mode as keyof typeof MODE_CONFIG]?.label || mode}
                </button>
              ))}
            </div>

            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <Button variant="ghost" size="sm" onClick={clearConversation} className="text-muted-foreground hover:text-foreground cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 via-violet-500/10 to-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Dual Agent Orchestrator</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    AI-classified routing between ValiAutoFlow (commercial) and NEXUS (emotional) modes. Try a message to see it in action.
                  </p>

                  {/* Quick messages */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {QUICK_MESSAGES.map((msg, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => sendMessage(msg.text, msg.mode)}
                        disabled={isLoading}
                        className="text-left px-3 py-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-card hover:border-border transition-all group cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base flex-shrink-0">{msg.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs text-foreground leading-relaxed line-clamp-2">{msg.text}</p>
                            <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 h-4">
                              {msg.category}
                            </Badge>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-4 pb-4">
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {msg.role === 'user' && (
                      <div className="flex gap-3 justify-end">
                        <div className="max-w-[80%]">
                          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 text-right">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-auto">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.orchestratorData && (
                      <div className="flex gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-auto"
                          style={{
                            background: msg.orchestratorData.mode === 'valiautoflow'
                              ? 'linear-gradient(135deg, #f59e0b, #f97316)'
                              : msg.orchestratorData.mode === 'nexus'
                                ? 'linear-gradient(135deg, #10b981, #14b8a6)'
                                : 'linear-gradient(135deg, #8b5cf6, #a855f7)',
                          }}
                        >
                          {msg.orchestratorData.mode === 'valiautoflow' ? (
                            <Zap className="w-4 h-4 text-white" />
                          ) : msg.orchestratorData.mode === 'nexus' ? (
                            <Heart className="w-4 h-4 text-white" />
                          ) : (
                            <Shuffle className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div className="max-w-[80%] flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge className={cn('text-[10px] font-medium', MODE_CONFIG[msg.orchestratorData.mode as keyof typeof MODE_CONFIG]?.badge)}>
                              {(() => {
                                const MIcon = MODE_CONFIG[msg.orchestratorData.mode as keyof typeof MODE_CONFIG]?.icon
                                return MIcon ? <MIcon className="w-2.5 h-2.5 mr-1" /> : null
                              })()}
                              {MODE_CONFIG[msg.orchestratorData.mode as keyof typeof MODE_CONFIG]?.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {INTENT_CONFIG[msg.orchestratorData.intent as keyof typeof INTENT_CONFIG]?.label}
                              {' '}· {Math.round(msg.orchestratorData.confidence * 100)}%
                            </span>
                          </div>

                          <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{msg.orchestratorData.latencyMs}ms</span>
                            <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" />{msg.orchestratorData.tokensUsed} tokens</span>
                            <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5" />{msg.orchestratorData.model}</span>
                            {msg.orchestratorData.valiautoflowAgent && (
                              <>
                                <Separator orientation="vertical" className="h-3" />
                                <span className="flex items-center gap-1 text-amber-600/70">
                                  <Bot className="w-2.5 h-2.5" />
                                  {AGENT_LABELS[msg.orchestratorData.valiautoflowAgent] || msg.orchestratorData.valiautoflowAgent}
                                </span>
                                <span className="text-amber-600/70">({STAGE_LABELS[msg.orchestratorData.valiautoflowStage || ''] || msg.orchestratorData.valiautoflowStage})</span>
                              </>
                            )}
                          </div>

                          <button
                            onClick={() => setSelectedEventMsg(selectedEventMsg === msg.id ? null : msg.id)}
                            className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                          >
                            {selectedEventMsg === msg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {selectedEventMsg === msg.id ? 'Hide' : 'Show'} trace
                          </button>

                          <AnimatePresence>
                            {selectedEventMsg === msg.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 bg-muted/30 rounded-lg border border-border/30 p-3 space-y-2">
                                  <div className="flex items-start gap-2">
                                    <Lightbulb className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{msg.orchestratorData.reasoning}</p>
                                  </div>
                                  {msg.orchestratorData.events.length > 0 && (
                                    <div className="border-t border-border/20 pt-2">
                                      <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">Events</p>
                                      <div className="space-y-1">
                                        {msg.orchestratorData.events.map((event, i) => (
                                          <div key={i} className="flex items-center gap-2 text-[10px]">
                                            <span className={cn(
                                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                              event.type.includes('classif') ? 'bg-violet-400' :
                                              event.type.includes('mode') ? 'bg-blue-400' :
                                              event.type.includes('valiautoflow') ? 'bg-amber-400' :
                                              event.type.includes('nexus') ? 'bg-emerald-400' :
                                              event.type.includes('blend') ? 'bg-purple-400' :
                                              'bg-muted-foreground/40'
                                            )} />
                                            <span className="text-muted-foreground/70 font-mono">{event.type}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {msg.role === 'assistant' && !msg.orchestratorData && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 mt-auto">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        </div>
                        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl rounded-tl-sm px-4 py-2.5">
                          <p className="text-sm text-destructive">{msg.content}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {isLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 via-violet-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">Classifying intent & generating response...</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-border/40 bg-card/80 backdrop-blur-sm px-4 sm:px-6 py-3">
            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={forceMode !== 'auto' ? `Message (forced: ${forceMode})...` : 'Type a message... (Enter to send)'}
                    disabled={isLoading}
                    rows={1}
                    className="resize-none min-h-[40px] max-h-[120px] pr-10 text-sm"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = 'auto'
                      target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                    }}
                  />
                  {forceMode !== 'auto' && (
                    <Badge className="absolute top-1.5 right-2 text-[9px] h-4 px-1.5" variant="outline">{forceMode}</Badge>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="h-[40px] w-[40px] bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-600 hover:to-emerald-600 text-white shadow-sm cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <p className="text-[10px] text-muted-foreground/50">Shift+Enter for newline</p>
                <p className="text-[10px] text-muted-foreground/50">
                  {messages.length > 0 && <>{messages.length} messages · {conversationHistory.length} turns</>}
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Right panel */}
        <div className="hidden lg:block w-80 border-l border-border/40 bg-card/30 overflow-y-auto">
          <div className="p-4 space-y-4">
            <Card className="border-border/40">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-violet-500" />
                  System Architecture
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-2.5">
                  <div className={cn('p-2.5 rounded-lg border', MODE_CONFIG.valiautoflow.border, MODE_CONFIG.valiautoflow.bg)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn('w-5 h-5 rounded-md bg-gradient-to-br flex items-center justify-center', MODE_CONFIG.valiautoflow.gradient)}>
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold">ValiAutoFlow</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Commercial pipeline: Diagnosis → Strategy → Closing. Activates on buying signals, product inquiries, and business needs.
                    </p>
                    <div className="flex gap-1 mt-1.5">
                      {['diagnostico', 'estratega', 'cerrador'].map(agent => (
                        <Badge key={agent} variant="outline" className="text-[8px] h-4 px-1 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                          {AGENT_LABELS[agent]?.replace(' Agent', '') || agent}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className={cn('p-2.5 rounded-lg border', MODE_CONFIG.nexus.border, MODE_CONFIG.nexus.bg)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn('w-5 h-5 rounded-md bg-gradient-to-br flex items-center justify-center', MODE_CONFIG.nexus.gradient)}>
                        <Heart className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold">NEXUS</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Emotional presence: empathy, rapport building, personal support. Activates on greetings, feelings, and non-commercial conversations.
                    </p>
                  </div>

                  <div className={cn('p-2.5 rounded-lg border', MODE_CONFIG.blended.border, MODE_CONFIG.blended.bg)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn('w-5 h-5 rounded-md bg-gradient-to-br flex items-center justify-center', MODE_CONFIG.blended.gradient)}>
                        <Shuffle className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold">Blended</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Combines empathy with commercial awareness. Activates when both emotional and commercial signals are present.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-2">
                  {[
                    { icon: BookOpen, label: 'Load Context', desc: 'Memories + profile', color: 'text-blue-500' },
                    { icon: Shield, label: 'AI Classify', desc: 'Commercial / Emotional / Mixed', color: 'text-violet-500' },
                    { icon: TrendingUp, label: 'Determine Mode', desc: 'With hysteresis', color: 'text-amber-500' },
                    { icon: MessageSquare, label: 'Route & Respond', desc: 'Generate via AI', color: 'text-emerald-500' },
                    { icon: Activity, label: 'Emit Events', desc: 'Event bus trace', color: 'text-rose-500' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <step.icon className={cn('w-3.5 h-3.5 flex-shrink-0', step.color)} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium">{step.label}</p>
                        <p className="text-[9px] text-muted-foreground">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {messages.length > 0 && (
              <Card className="border-border/40">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    Session Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="space-y-2">
                    {(() => {
                      const aMsgs = messages.filter(m => m.orchestratorData)
                      const mc = { valiautoflow: 0, nexus: 0, blended: 0 }
                      aMsgs.forEach(m => { if (m.orchestratorData) mc[m.orchestratorData.mode as keyof typeof mc]++ })
                      const total = aMsgs.length || 1
                      return (
                        <>
                          {(['valiautoflow', 'nexus', 'blended'] as const).map(mode => (
                            <div key={mode} className="flex items-center gap-2">
                              <div className={cn('w-2 h-2 rounded-full', `bg-gradient-to-br ${MODE_CONFIG[mode].gradient}`)} />
                              <span className="text-[10px] flex-1">{MODE_CONFIG[mode].label}</span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full bg-gradient-to-r', MODE_CONFIG[mode].gradient)} style={{ width: `${(mc[mode] / total) * 100}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-4 text-right">{mc[mode]}</span>
                            </div>
                          ))}
                        </>
                      )
                    })()}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Total responses</span>
                      <span>{messages.filter(m => m.orchestratorData).length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
