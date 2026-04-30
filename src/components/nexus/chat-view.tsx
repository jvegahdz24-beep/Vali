'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Brain,
  Code2,
  BarChart3,
  PenTool,
  Sparkles,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AgentType,
  AGENT_CONFIGS,
  QUICK_ACTIONS,
  Message,
  Agent,
  type Conversation,
} from './types'

// ─── Simple markdown renderer ───
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent = ''
  let codeLang = ''
  let blockIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Toggle code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${blockIndex++}`} className="my-3 rounded-lg overflow-hidden border border-border/50">
            {codeLang && (
              <div className="bg-muted/80 px-4 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50">
                {codeLang}
              </div>
            )}
            <pre className="bg-muted/40 p-4 overflow-x-auto">
              <code className="text-sm font-mono leading-relaxed">{codeContent.trim()}</code>
            </pre>
          </div>
        )
        codeContent = ''
        codeLang = ''
        inCodeBlock = false
      } else {
        codeLang = line.trim().slice(3).trim()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += line + '\n'
      continue
    }

    // Skip if empty line
    if (!line.trim()) {
      elements.push(<div key={`empty-${i}`} className="h-2" />)
      continue
    }

    // Process inline formatting
    const processed = processInlineFormatting(line)

    // Check for bullet lists
    if (/^[\s]*[-•]\s/.test(line)) {
      const bulletText = line.replace(/^[\s]*[-•]\s/, '')
      elements.push(
        <div key={`li-${i}`} className="flex gap-2 ml-2">
          <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
          <span>{processInlineFormatting(bulletText)}</span>
        </div>
      )
      continue
    }

    // Check for numbered lists
    if (/^[\s]*\d+\.\s/.test(line)) {
      elements.push(
        <div key={`ol-${i}`} className="ml-2">
          {processInlineFormatting(line)}
        </div>
      )
      continue
    }

    elements.push(<div key={`p-${i}`}>{processed}</div>)
  }

  // Close unclosed code block
  if (inCodeBlock) {
    elements.push(
      <pre key="code-unclosed" className="my-3 rounded-lg bg-muted/40 p-4 overflow-x-auto border border-border/50">
        <code className="text-sm font-mono">{codeContent.trim()}</code>
      </pre>
    )
  }

  return elements
}

function processInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Bold: **text**
  const boldRegex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match

  while ((match = boldRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{processInlineSimple(remaining.slice(lastIndex, match.index))}</span>
      )
    }
    parts.push(
      <strong key={key++} className="font-semibold">
        {match[1]}
      </strong>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{processInlineSimple(remaining.slice(lastIndex))}</span>)
  }

  return parts.length > 0 ? <>{parts}</> : processInlineSimple(text)
}

function processInlineSimple(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Inline code: `text`
  const codeRegex = /`([^`]+)`/g
  let lastIndex = 0
  let match

  while ((match = codeRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{processItalic(remaining.slice(lastIndex, match.index))}</span>
      )
    }
    parts.push(
      <code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
        {match[1]}
      </code>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{processItalic(remaining.slice(lastIndex))}</span>)
  }

  return parts.length > 0 ? <>{parts}</> : processItalic(text)
}

function processItalic(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Italic: *text*
  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g
  let lastIndex = 0
  let match

  while ((match = italicRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>)
    }
    parts.push(<em key={key++}>{match[1]}</em>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? <>{parts}</> : text
}

// ─── Agent icon helper ───
function AgentIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'coder': return <Code2 className={className} />
    case 'analyst': return <BarChart3 className={className} />
    case 'writer': return <PenTool className={className} />
    default: return <Brain className={className} />
  }
}

// ─── Typing indicator ───
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-emerald-500"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// ─── Chat message component ───
function ChatMessage({ message, agentType }: { message: Message; agentType: string }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-2"
      >
        <div className="px-4 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground">
          {message.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isUser && (
        <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
          <AvatarFallback className={`${AGENT_CONFIGS[agentType as AgentType]?.bgLight || 'bg-emerald-500'} text-white text-xs`}>
            <AgentIcon type={agentType} className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message bubble */}
      <div className={`max-w-[80%] sm:max-w-[70%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-emerald-600 text-white rounded-br-md'
              : 'bg-card border border-border/50 rounded-bl-md'
          }`}
        >
          {isUser ? message.content : renderMarkdown(message.content)}
        </div>

        {/* Meta info */}
        <div className={`flex items-center gap-2 mt-1 px-1 text-[10px] text-muted-foreground ${isUser ? 'justify-end' : 'justify-start'}`}>
          {message.latencyMs && !isUser && (
            <span>{(message.latencyMs / 1000).toFixed(1)}s</span>
          )}
          {message.tokens && !isUser && (
            <span>{message.tokens} tokens</span>
          )}
          {message.createdAt && (
            <span>
              {new Date(message.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main Chat View ───
interface ChatViewProps {
  conversations: Conversation[]
  selectedConversation: string | null
  selectedAgent: AgentType
  agents: Agent[]
  onSelectConversation: (id: string | null) => void
  onNewChat: () => void
  onSelectAgent: (agent: AgentType) => void
  onSendMessage: (message: string, conversationId: string | null, agentType: string) => Promise<void>
}

export function ChatView({
  conversations,
  selectedConversation,
  selectedAgent,
  agents,
  onSelectConversation,
  onNewChat,
  onSelectAgent,
  onSendMessage,
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Get current conversation and messages
  const currentConversation = conversations.find((c) => c.id === selectedConversation)
  const messages = currentConversation?.messages || []

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages.length, scrollToBottom])

  // Handle scroll to show/hide scroll button
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100
    setShowScrollBtn(!isNearBottom)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  // Send message
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    setInput('')
    setIsSending(true)

    try {
      await onSendMessage(trimmed, selectedConversation, selectedAgent)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Quick action click
  const handleQuickAction = (label: string, agent: AgentType) => {
    onSelectAgent(agent)
    setInput(label)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages area */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6"
      >
        {messages.length === 0 ? (
          /* Empty state — welcome message */
          <div className="flex flex-col items-center justify-center h-full py-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-md"
            >
              <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <AgentIcon type={selectedAgent} className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {agents.find((a) => a.type === selectedAgent)?.name || AGENT_CONFIGS[selectedAgent].name}
              </h2>
              <p className="text-sm text-muted-foreground mb-8">
                {agents.find((a) => a.type === selectedAgent)?.description || 'Asistente general autónomo'}
              </p>

              {/* Quick actions */}
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <motion.button
                    key={action.label}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleQuickAction(action.label, action.agent)}
                    className="px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted text-sm text-muted-foreground hover:text-foreground border border-border/40 hover:border-border transition-all cursor-pointer"
                  >
                    {action.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-3xl mx-auto py-6 space-y-6">
            <AnimatePresence>
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  agentType={currentConversation?.agentType || selectedAgent}
                />
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {isSending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
                  <AvatarFallback className={`${AGENT_CONFIGS[selectedAgent]?.bgLight || 'bg-emerald-500'} text-white text-xs`}>
                    <AgentIcon type={selectedAgent} className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md">
                  <TypingIndicator />
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10"
          >
            <Button
              size="icon"
              variant="outline"
              onClick={scrollToBottom}
              className="rounded-full shadow-lg h-8 w-8 bg-card border-border/60"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message input */}
      <div className="border-t border-border/40 bg-background/80 backdrop-blur-sm p-3 sm:p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-card/50 p-2 focus-within:border-emerald-500/40 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
            {/* Agent selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full flex-shrink-0 hover:bg-muted"
                >
                  <AgentIcon type={selectedAgent} className="w-4 h-4 text-emerald-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {Object.entries(AGENT_CONFIGS).map(([type, config]) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => onSelectAgent(type as AgentType)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <AgentIcon type={type} className={`w-4 h-4 ${config.textLight} dark:${config.textDark}`} />
                    <div>
                      <div className="font-medium text-sm">{config.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {type === 'nexus' ? 'General' : type === 'coder' ? 'Código' : type === 'analyst' ? 'Datos' : 'Escritura'}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Textarea */}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Mensaje a ${AGENT_CONFIGS[selectedAgent].name}...`}
              className="flex-1 min-h-[40px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm p-1 placeholder:text-muted-foreground/60"
              rows={1}
              disabled={isSending}
            />

            {/* Send button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0 shadow-sm disabled:opacity-30"
              >
                {isSending ? (
                  <Sparkles className="w-4 h-4 animate-pulse" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </motion.div>
          </div>

          {/* Bottom hint */}
          <div className="flex items-center justify-between mt-2 px-2">
            <p className="text-[10px] text-muted-foreground/60">
              Enter para enviar · Shift+Enter nueva línea
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40 text-muted-foreground/60">
              {AGENT_CONFIGS[selectedAgent].name}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
