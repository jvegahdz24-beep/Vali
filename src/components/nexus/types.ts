// ═══════════════════════════════════════════════════════════════
// NEXUS AI — TypeScript Types
// ═══════════════════════════════════════════════════════════════

export interface Conversation {
  id: string
  title: string
  agentType: string
  status: string
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
  messages?: Message[]
  messages_preview?: { content: string; createdAt: string }[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  tokens?: number
  model?: string
  latencyMs?: number
}

export interface Memory {
  id: string
  category: string
  key: string
  value: string
  importance: number
  source: string
  accessCount: number
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  name: string
  type: string
  description?: string
  personality: string
  capabilities: string // JSON array string
  isActive: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  source: string
  dueDate?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Insight {
  id: string
  type: 'pattern' | 'suggestion' | 'learning' | 'anomaly'
  title: string
  content: string
  confidence: number
  isRead: boolean
  createdAt: string
}

export interface User {
  id: string
  email: string
  name: string
  role: string
  image?: string
  workspaceId?: string
  workspaceName?: string
}

export type ViewType = 'chat' | 'contacts' | 'agents' | 'tasks' | 'memories' | 'insights' | 'profile'
export type AgentType = 'nexus' | 'coder' | 'analyst' | 'writer'

export interface AgentConfig {
  type: AgentType
  name: string
  color: string
  bgLight: string
  bgDark: string
  borderLight: string
  borderDark: string
  textLight: string
  textDark: string
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  nexus: {
    type: 'nexus',
    name: 'NEXUS',
    color: 'emerald',
    bgLight: 'bg-emerald-500',
    bgDark: 'bg-emerald-600',
    borderLight: 'border-emerald-500',
    borderDark: 'border-emerald-400',
    textLight: 'text-emerald-600',
    textDark: 'text-emerald-400',
  },
  coder: {
    type: 'coder',
    name: 'CODEX',
    color: 'violet',
    bgLight: 'bg-violet-500',
    bgDark: 'bg-violet-600',
    borderLight: 'border-violet-500',
    borderDark: 'border-violet-400',
    textLight: 'text-violet-600',
    textDark: 'text-violet-400',
  },
  analyst: {
    type: 'analyst',
    name: 'ANALYTICA',
    color: 'amber',
    bgLight: 'bg-amber-500',
    bgDark: 'bg-amber-600',
    borderLight: 'border-amber-500',
    borderDark: 'border-amber-400',
    textLight: 'text-amber-600',
    textDark: 'text-amber-400',
  },
  writer: {
    type: 'writer',
    name: 'ESCRITOR',
    color: 'rose',
    bgLight: 'bg-rose-500',
    bgDark: 'bg-rose-600',
    borderLight: 'border-rose-500',
    borderDark: 'border-rose-400',
    textLight: 'text-rose-600',
    textDark: 'text-rose-400',
  },
}

export interface UserProfile {
  userId: string
  age?: number
  gender?: string
  occupation?: string
  company?: string
  workSchedule: string // JSON string
  children: number
  relationshipStatus?: string
  education?: string
  location?: string
  whatsappPhone?: string
  interests: string // JSON array string
  goals: string // JSON array string
  bio?: string
  coachMode: boolean
  summaryEnabled: boolean
  summaryInterval: number
  temperature: number
  tempUpdatedAt?: string
  lastSummarySent?: string
  vacationMode: boolean
  googleCalendarConnected: boolean
  googleCalendarSyncEnabled: boolean
  vacationStartAt?: string
  vacationEndAt?: string
  createdAt: string
  updatedAt: string
}

export interface TemperatureLog {
  id: string
  userId: string
  value: number
  label?: string
  source: string
  metadata: string
  createdAt: string
}

export interface WhatsAppLog {
  id: string
  userId: string
  phone: string
  message: string
  type: string
  status: string
  sentAt?: string
  error?: string
  createdAt: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  description?: string
  link?: string
}

export interface NexusContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  relation: string
  company: string | null
  role: string | null
  birthday: string | null
  notes: string | null
  isFavorite: boolean
  tags: string
  createdAt: string
  updatedAt: string
}

export const QUICK_ACTIONS = [
  { label: 'Escríbeme un email', agent: 'writer' as AgentType },
  { label: 'Analiza estos datos', agent: 'analyst' as AgentType },
  { label: 'Genera un reporte', agent: 'analyst' as AgentType },
  { label: 'Ayúdame con código', agent: 'coder' as AgentType },
  { label: 'Crea una tarea', agent: 'nexus' as AgentType },
]
