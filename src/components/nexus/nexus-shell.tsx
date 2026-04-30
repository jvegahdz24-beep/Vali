'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Code2,
  BarChart3,
  PenTool,
  MessageSquare,
  Users,
  ListTodo,
  Database,
  Lightbulb,
  QrCode,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Trash2,
  Settings,
  Moon,
  Sun,
  Loader2,
  LogOut,
  Thermometer,
  Plane,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from 'next-themes'

import { LoginScreen } from './login-screen'
import { ChatView } from './chat-view'
import { ContactsView } from './contacts-view'
import { AgentsView } from './agents-view'
import { TasksView } from './tasks-view'
import { MemoriesView } from './memories-view'
import { InsightsView } from './insights-view'
import { ProfileView } from './profile-view'
import { TemperatureBar } from './temperature-bar'
import { ConnectionsView } from './connections-view'
import {
  AgentType,
  AGENT_CONFIGS,
  ViewType,
  Conversation,
  Message,
  Agent,
  Task,
  Memory,
  Insight,
  User,
  UserProfile,
  type NexusContact,
  type TemperatureLog,
  type WhatsAppLog,
} from './types'

// ─── Agent icon for sidebar ───
function AgentIconSmall({ type, className = 'w-3.5 h-3.5' }: { type: string; className?: string }) {
  switch (type) {
    case 'coder': return <Code2 className={className} />
    case 'analyst': return <BarChart3 className={className} />
    case 'writer': return <PenTool className={className} />
    default: return <Brain className={className} />
  }
}

// ─── Navigation items ───
const NAV_ITEMS: { key: ViewType; label: string; icon: React.ReactNode }[] = [
  { key: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'contacts', label: 'Personas', icon: <Users className="w-4 h-4" /> },
  { key: 'agents', label: 'Agentes', icon: <Users className="w-4 h-4" /> },
  { key: 'tasks', label: 'Tareas', icon: <ListTodo className="w-4 h-4" /> },
  { key: 'memories', label: 'Memoria', icon: <Database className="w-4 h-4" /> },
  { key: 'insights', label: 'Insights', icon: <Lightbulb className="w-4 h-4" /> },
  { key: 'connections', label: 'Conexiones', icon: <QrCode className="w-4 h-4" /> },
  { key: 'profile', label: 'Perfil', icon: <Thermometer className="w-4 h-4" /> },
]

// ─── Helper: group conversations by date ───
function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: 'Anteriores', items: [] },
  ]

  conversations.forEach((c) => {
    const date = new Date(c.updatedAt)
    if (date >= today) {
      groups[0].items.push(c)
    } else if (date >= yesterday) {
      groups[1].items.push(c)
    } else {
      groups[2].items.push(c)
    }
  })

  return groups.filter((g) => g.items.length > 0)
}

// ═══════════════════════════════════════════════════════════════
// MAIN NEXUS SHELL COMPONENT
// ═══════════════════════════════════════════════════════════════
export function NexusShell() {
  const { theme, setTheme } = useTheme()

  // Auth state
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null) // null = loading
  const [authError, setAuthError] = useState('')

  // App state
  const [currentView, setCurrentView] = useState<ViewType>('chat')
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('nexus')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Data state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [contacts, setContacts] = useState<NexusContact[]>([])

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [temperature, setTemperature] = useState<number>(50)
  const [tempLabel, setTempLabel] = useState('Estable')

  // Loading state
  const [isLoading, setIsLoading] = useState(false)

  // ─── Auth check on mount ───
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [])

  // ─── Seed and load data on auth ───
  const loadInitialData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Seed default agents
      await fetch('/api/nexus/seed', { method: 'POST' }).catch(() => {})

      // Load all data in parallel
      const [convRes, agentRes, taskRes, memRes, insightRes, profileRes, contRes] = await Promise.all([
        fetch('/api/nexus/chat'),
        fetch('/api/nexus/agents'),
        fetch('/api/nexus/tasks'),
        fetch('/api/nexus/memories'),
        fetch('/api/nexus/insights'),
        fetch('/api/nexus/profile'),
        fetch('/api/nexus/contacts'),
      ])

      if (convRes.ok) {
        const convData = await convRes.json()
        setConversations(convData.conversations || [])
        // Auto-select first conversation
        if (convData.conversations?.length > 0 && !selectedConversation) {
          const first = convData.conversations[0]
          setSelectedConversation(first.id)
          // Load messages for first conversation
          const msgRes = await fetch(`/api/nexus/conversations/${first.id}`)
          if (msgRes.ok) {
            const msgData = await msgRes.json()
            setConversations(prev => prev.map(c => c.id === first.id ? msgData.conversation : c))
          }
        }
      }

      if (agentRes.ok) {
        const data = await agentRes.json()
        setAgents(data.agents || [])
      }

      if (taskRes.ok) {
        const data = await taskRes.json()
        setTasks(data.tasks || [])
      }

      if (memRes.ok) {
        const data = await memRes.json()
        setMemories(data.memories || [])
      }

      if (insightRes.ok) {
        const data = await insightRes.json()
        setInsights(data.insights || [])
      }

      if (profileRes.ok) {
        const data = await profileRes.json()
        setProfile(data.profile)
        setTemperature(data.profile.temperature ?? 50)
      }

      if (contRes.ok) {
        const data = await contRes.json()
        setContacts(data.contacts || [])
      }
    } catch (err) {
      console.error('Failed to load initial data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated === true) {
      loadInitialData()
    }
  }, [isAuthenticated, loadInitialData])

  // ─── Handle login success ───
  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true)
  }, [])

  // ─── Send message ───
  const handleSendMessage = useCallback(async (message: string, conversationId: string | null, agentType: string) => {
    try {
      const res = await fetch('/api/nexus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId, agentType }),
      })

      if (res.ok) {
        const data = await res.json()

        if (data.conversationId && !conversationId) {
          // New conversation was created — select it
          setSelectedConversation(data.conversationId)
        }

        // Reload conversation messages
        const convId = conversationId || data.conversationId
        if (convId) {
          const msgRes = await fetch(`/api/nexus/conversations/${convId}`)
          if (msgRes.ok) {
            const msgData = await msgRes.json()
            setConversations(prev => {
              const exists = prev.find(c => c.id === convId)
              if (exists) {
                return prev.map(c => c.id === convId ? msgData.conversation : c)
              } else {
                return [msgData.conversation, ...prev]
              }
            })
          }
        }

        // Also reload conversations list for sidebar
        const convRes = await fetch('/api/nexus/chat')
        if (convRes.ok) {
          const convData = await convRes.json()
          setConversations(prev => {
            // Merge to keep message data loaded for current conversation
            const current = prev.find(c => c.id === selectedConversation)
            if (current) {
              return convData.conversations.map(c =>
                c.id === current.id ? current : c
              )
            }
            return convData.conversations || []
          })
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }, [selectedConversation])

  // ─── Select conversation ───
  const handleSelectConversation = useCallback(async (id: string) => {
    setSelectedConversation(id)
    setCurrentView('chat')
    setMobileSidebarOpen(false)

    // Load messages for this conversation
    const conv = conversations.find(c => c.id === id)
    if (!conv?.messages || conv.messages.length === 0) {
      try {
        const res = await fetch(`/api/nexus/conversations/${id}`)
        if (res.ok) {
          const data = await res.json()
          setConversations(prev => prev.map(c => c.id === id ? data.conversation : c))
          // Update selected agent based on conversation
          if (data.conversation?.agentType) {
            setSelectedAgent(data.conversation.agentType as AgentType)
          }
        }
      } catch (err) {
        console.error('Failed to load conversation:', err)
      }
    } else {
      if (conv.agentType) {
        setSelectedAgent(conv.agentType as AgentType)
      }
    }
  }, [conversations])

  // ─── New chat ───
  const handleNewChat = useCallback(() => {
    setSelectedConversation(null)
    setCurrentView('chat')
    setMobileSidebarOpen(false)
  }, [])

  // ─── Delete conversation ───
  const handleDeleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/nexus/conversations/${id}`, { method: 'DELETE' })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (selectedConversation === id) {
        setSelectedConversation(null)
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [selectedConversation])

  // ─── Create agent ───
  const handleCreateAgent = useCallback(async (data: { name: string; type: string; description: string; personality: string; capabilities: string[] }) => {
    try {
      const res = await fetch('/api/nexus/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        setAgents(prev => [...prev, result.agent])
      }
    } catch (err) {
      console.error('Failed to create agent:', err)
    }
  }, [])

  // ─── Task actions ───
  const handleToggleTask = useCallback(async (id: string, status: string) => {
    try {
      await fetch('/api/nexus/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }, [])

  const handleCreateTask = useCallback(async (data: { title: string; description: string; priority: string; dueDate: string }) => {
    try {
      const res = await fetch('/api/nexus/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        setTasks(prev => [result.task, ...prev])
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }, [])

  const handleLoadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/tasks')
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks || [])
      }
    } catch (err) {
      console.error('Failed to load tasks:', err)
    }
  }, [])

  // ─── Memory actions ───
  const handleCreateMemory = useCallback(async (data: { key: string; value: string; category: string; importance: number }) => {
    try {
      const res = await fetch('/api/nexus/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        setMemories(prev => {
          const exists = prev.findIndex(m => m.key === result.memory.key)
          if (exists >= 0) {
            return prev.map(m => m.key === result.memory.key ? result.memory : m)
          }
          return [result.memory, ...prev]
        })
      }
    } catch (err) {
      console.error('Failed to create memory:', err)
    }
  }, [])

  const handleDeleteMemory = useCallback(async (key: string) => {
    try {
      await fetch(`/api/nexus/memories?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      setMemories(prev => prev.filter(m => m.key !== key))
    } catch (err) {
      console.error('Failed to delete memory:', err)
    }
  }, [])

  const handleLoadMemories = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/memories')
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories || [])
      }
    } catch (err) {
      console.error('Failed to load memories:', err)
    }
  }, [])

  // ─── Insight actions ───
  const handleGenerateInsights = useCallback(async () => {
    try {
      await fetch('/api/nexus/insights', { method: 'POST' })
    } catch (err) {
      console.error('Failed to generate insights:', err)
    }
  }, [])

  const handleLoadInsights = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/insights')
      if (res.ok) {
        const data = await res.json()
        setInsights(data.insights || [])
      }
    } catch (err) {
      console.error('Failed to load insights:', err)
    }
  }, [])

  // ─── Contact actions ───
  const handleCreateContact = useCallback(async (data: { name: string; phone?: string; email?: string; relation: string; company?: string; role?: string; birthday?: string; notes?: string }) => {
    try {
      const res = await fetch('/api/nexus/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (res.ok) { const result = await res.json(); setContacts(prev => [result.contact, ...prev]) }
    } catch (err) { console.error('Failed to create contact:', err) }
  }, [])

  const handleDeleteContact = useCallback(async (id: string) => {
    try {
      await fetch(`/api/nexus/contacts?id=${id}`, { method: 'DELETE' })
      setContacts(prev => prev.filter(c => c.id !== id))
    } catch (err) { console.error('Failed to delete contact:', err) }
  }, [])

  const handleLoadContacts = useCallback(async () => {
    try { const res = await fetch('/api/nexus/contacts'); if (res.ok) { const data = await res.json(); setContacts(data.contacts || []) } }
    catch (err) { console.error('Failed to load contacts:', err) }
  }, [])

  // ─── Temperature refresh ───
  const handleRefreshTemperature = useCallback(async () => {
    try {
      const res = await fetch('/api/nexus/temperature', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setTemperature(data.temperature)
        setTempLabel(data.label || 'Estable')
      }
    } catch (err) {
      console.error('Failed to refresh temperature:', err)
    }
  }, [])

  // ─── Profile save ───
  const handleSaveProfile = useCallback(async (data: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/nexus/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        setProfile(result.profile)
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
    }
  }, [])

  // ─── Loading state ───
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  // ─── Login screen ───
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />
  }

  // ─── Get current conversation with messages ───
  const currentConv = conversations.find((c) => c.id === selectedConversation)
  const pendingTasksCount = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length
  const conversationGroups = groupConversations(conversations)

  // ─── Sidebar content (shared between desktop and mobile) ───
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight">
            NEXUS <span className="text-emerald-500">AI</span>
          </span>
        </div>
      </div>

      <Separator className="opacity-50" />

      {/* New chat button */}
      <div className="p-3">
        <Button
          onClick={handleNewChat}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm justify-start gap-2 cursor-pointer"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo chat
        </Button>
      </div>

      {/* Navigation */}
      <div className="px-3 pb-2">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.key}
              variant={currentView === item.key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setCurrentView(item.key)
                setMobileSidebarOpen(false)
              }}
              className={`w-full justify-start gap-2.5 text-sm h-9 cursor-pointer ${
                currentView === item.key
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.icon}
              {item.label}
              {item.key === 'tasks' && pendingTasksCount > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px] h-4 min-w-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {pendingTasksCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      <Separator className="opacity-50 mx-3" />

      {/* Agent selector */}
      <div className="p-3">
        <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">
          Agentes
        </p>
        <div className="space-y-1">
          {Object.entries(AGENT_CONFIGS).map(([type, config]) => (
            <button
              key={type}
              onClick={() => {
                setSelectedAgent(type as AgentType)
                setCurrentView('chat')
                setMobileSidebarOpen(false)
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all cursor-pointer ${
                selectedAgent === type
                  ? 'bg-emerald-500/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <div className={`w-6 h-6 rounded-md ${config.bgLight} dark:${config.bgDark} flex items-center justify-center flex-shrink-0`}>
                <AgentIconSmall type={type} className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-medium">{config.name}</span>
              {selectedAgent === type && (
                <ChevronRight className="w-3 h-3 ml-auto text-emerald-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      <Separator className="opacity-50 mx-3" />

      {/* Conversation history */}
      {currentView === 'chat' && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="p-3 pb-1">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1">
              Conversaciones
            </p>
          </div>
          <ScrollArea className="flex-1 px-1">
            <div className="space-y-0.5 pb-2">
              {conversationGroups.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-3 py-1">
                    {group.label}
                  </p>
                  {group.items.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all group cursor-pointer ${
                        selectedConversation === conv.id
                          ? 'bg-emerald-500/10 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <AgentIconSmall type={conv.agentType} className="w-3 h-3 flex-shrink-0 text-muted-foreground/60" />
                          <p className="text-xs font-medium truncate">{conv.title}</p>
                        </div>
                        {conv.messages_preview?.[0] && (
                          <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5 pl-[22px]">
                            {conv.messages_preview[0].content}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground/40 hover:text-destructive" />
                      </button>
                    </button>
                  ))}
                </div>
              ))}

              {conversations.length === 0 && (
                <div className="px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground/50">Sin conversaciones</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Bottom stats */}
      <Separator className="opacity-50 mx-3" />
      <div className="p-3">
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            {memories.length} memorias
          </span>
          <span className="flex items-center gap-1">
            <ListTodo className="w-3 h-3" />
            {pendingTasksCount} tareas
          </span>
          <span className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            {insights.length} insights
          </span>
        </div>
      </div>
    </div>
  )

  // ─── Main render ───
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="hidden md:flex flex-col border-r border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden flex-shrink-0"
          >
            <div className="w-[272px] h-full flex flex-col">
              {sidebarContent}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetTitle className="sr-only">NEXUS AI Menú</SheetTitle>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-14 border-b border-border/40 bg-card/50 backdrop-blur-sm flex items-center justify-between px-3 sm:px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 cursor-pointer">
                  <Settings className="w-4 h-4" />
                </Button>
              </SheetTrigger>
            </Sheet>

            {/* Desktop sidebar toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hidden md:flex h-8 w-8 cursor-pointer"
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="w-4 h-4" />
                  ) : (
                    <PanelLeftOpen className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
              </TooltipContent>
            </Tooltip>

            {/* Current agent indicator */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-md ${AGENT_CONFIGS[selectedAgent].bgLight} dark:${AGENT_CONFIGS[selectedAgent].bgDark} flex items-center justify-center`}>
                <AgentIconSmall type={selectedAgent} className="w-3 h-3 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold leading-none">
                  {currentView === 'chat'
                    ? (currentConv?.title || 'Nuevo chat')
                    : currentView === 'contacts'
                    ? 'Personas'
                    : currentView === 'agents'
                    ? 'Agentes IA'
                    : currentView === 'tasks'
                    ? 'Tareas'
                    : currentView === 'memories'
                    ? 'Memoria'
                    : currentView === 'profile'
                    ? 'Perfil'
                    : currentView === 'connections'
                    ? 'Conexiones'
                    : 'Insights'}
                </h1>
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  {AGENT_CONFIGS[selectedAgent].name} · {user?.name || user?.email || ''}
                </p>
              </div>
            </div>

            {/* Vacation mode indicator */}
            {profile?.vacationMode && (
              <Badge variant="outline" className="hidden sm:flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                <Plane className="w-3 h-3" />
                Vacaciones
              </Badge>
            )}

            {/* Temperature bar — always visible in header */}
            <motion.div whileTap={{ scale: 0.95 }} className="hidden sm:block cursor-pointer" onClick={handleRefreshTemperature}>
              <TemperatureBar value={temperature} label={tempLabel} size="sm" showValue animated />
            </motion.div>
          </div>

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-8 w-8 cursor-pointer"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </TooltipContent>
            </Tooltip>

            {/* User avatar */}
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 relative overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className="text-sm text-muted-foreground">Cargando NEXUS AI...</p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {currentView === 'chat' && (
                  <ChatView
                    conversations={conversations}
                    selectedConversation={selectedConversation}
                    selectedAgent={selectedAgent}
                    agents={agents}
                    onSelectConversation={setSelectedConversation}
                    onNewChat={handleNewChat}
                    onSelectAgent={setSelectedAgent}
                    onSendMessage={handleSendMessage}
                  />
                )}
                {currentView === 'contacts' && (
                  <ContactsView
                    contacts={contacts}
                    onCreateContact={handleCreateContact}
                    onDeleteContact={handleDeleteContact}
                    onLoadContacts={handleLoadContacts}
                  />
                )}
                {currentView === 'agents' && (
                  <AgentsView
                    agents={agents}
                    selectedAgent={selectedAgent}
                    onSelectAgent={setSelectedAgent}
                    onCreateAgent={handleCreateAgent}
                  />
                )}
                {currentView === 'tasks' && (
                  <TasksView
                    tasks={tasks}
                    onToggleTask={handleToggleTask}
                    onCreateTask={handleCreateTask}
                    onLoadTasks={handleLoadTasks}
                  />
                )}
                {currentView === 'memories' && (
                  <MemoriesView
                    memories={memories}
                    onLoadMemories={handleLoadMemories}
                    onCreateMemory={handleCreateMemory}
                    onDeleteMemory={handleDeleteMemory}
                  />
                )}
                {currentView === 'insights' && (
                  <InsightsView
                    insights={insights}
                    onGenerateInsights={handleGenerateInsights}
                    onLoadInsights={handleLoadInsights}
                  />
                )}
                {currentView === 'connections' && (
                  <ConnectionsView
                    whatsappPhone={profile?.whatsappPhone}
                    summaryInterval={profile?.summaryInterval}
                  />
                )}
                {currentView === 'profile' && (
                  <ProfileView
                    profile={profile}
                    onSave={handleSaveProfile}
                    onRefreshTemperature={handleRefreshTemperature}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  )
}
