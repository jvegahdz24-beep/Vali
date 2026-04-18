// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Complete TypeScript Type Definitions
// ═══════════════════════════════════════════════════════════════

// ─── Enums & Union Types ──────────────────────────────────────

export type AgentType = 'qualifier' | 'sales' | 'followup' | 'coach' | 'custom'
export type AIProvider = 'groq' | 'deepseek' | 'gemini' | 'openai'
export type Channel = 'whatsapp' | 'telegram' | 'instagram' | 'webchat'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'interactive'
export type SenderType = 'contact' | 'agent' | 'human' | 'system'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'
export type DealStatus = 'active' | 'won' | 'lost' | 'paused'
export type ConversationStatus = 'active' | 'closed' | 'pending' | 'bot'
export type PlanType = 'free' | 'starter' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing'
export type ContactStatus = 'active' | 'inactive' | 'archived' | 'blocked'
export type FollowUpStatus = 'pending' | 'sent' | 'failed' | 'cancelled'
export type FollowUpTriggerType = 'inactivity' | 'scheduled' | 'event-based' | 'deal-stage-change'
export type AutomationTriggerType = 'webhook' | 'schedule' | 'event' | 'message_received' | 'deal_stage_change'
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'
export type PersonalityName = 'JHON' | 'professional' | 'friendly' | 'aggressive'
export type IntentType =
  | 'greeting'
  | 'question'
  | 'objection'
  | 'buy_signal'
  | 'followup'
  | 'complaint'
  | 'appointment'
  | 'price_inquiry'
  | 'vehicle_inquiry'
  | 'test_drive'
  | 'financing'
  | 'unknown'

// ─── Pipeline Types ───────────────────────────────────────────

export interface PipelineStageType {
  name: string
  color: string
  probability: number
  isWon: boolean
  isLost: boolean
}

// ─── Agent Config ─────────────────────────────────────────────

export interface AgentHook {
  type: 'observer' | 'interceptor' | 'approver' | 'pre_process' | 'post_process' | 'on_error' | 'on_fallback'
  priority: number
  enabled: boolean
  action: string
  config?: Record<string, unknown>
}

export interface SteeringRule {
  condition: string
  injectMessage: string
  priority: number
}

export interface AgentSteering {
  maxQuestionsPerTurn: number
  maxTurnsWithoutProgress: number
  preferredLanguage: string
  urgencyLevel: 'low' | 'medium' | 'high'
  autoQualifyAfter: number
  escalateAfter: number
}

export interface AgentConfig {
  hooks: AgentHook[]
  steering: SteeringRule[] | AgentSteering
  fallbackBehavior: 'default_response' | 'transfer_human' | 'queue'
  fallbackMessage?: string
  handoffConditions?: string[]
  maxTurns?: number
  inactivityTimeoutMinutes?: number
}

export interface AIModelConfig {
  provider: AIProvider
  model: string
  temperature: number
  maxTokens: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ─── JHON Personality ─────────────────────────────────────────

export interface JHONPersonalityConfig {
  name: string
  tone: string
  language: string
  traits: string[]
  prohibitedPhrases: string[]
  keyBehaviors: string[]
}

// ─── Revenue Engine ───────────────────────────────────────────

export interface LeadAnalysis {
  score: number
  stage: 'new' | 'engaged' | 'qualified' | 'proposal' | 'negotiation'
  temperature: 'cold' | 'warm' | 'hot'
  intent: string
  buyingSignals: string[]
  objections: string[]
  tags: string[]
  estimatedValue: number
  nextAction: 'close' | 'handle_objection' | 'educate' | 'question' | 'follow_up'
  confidence: number
}

export interface RevenueEngineConfig {
  enabled: boolean
  scoringWeights: {
    buyingSignals: number
    engagement: number
    qualification: number
    timing: number
    budget: number
  }
  autoScoreThreshold: number
  dealValueEstimation: boolean
}

export interface LeadScore {
  total: number
  breakdown: {
    buyingSignals: number
    engagement: number
    qualification: number
    timing: number
    budget: number
  }
  signals: string[]
  recommendation: string
}

export interface RevenueSignal {
  type: 'buying' | 'objection' | 'timing' | 'budget' | 'authority' | 'engagement'
  strength: number
  description: string
  detectedAt: Date
}

export interface RevenueEngineDecision {
  action: 'close' | 'handle_objection' | 'educate' | 'question' | 'follow_up'
  strategy: string
  response: JHONResponse
  followUpTasks: FollowUpTaskConfig[]
  crmUpdates: CRMUpdate[]
  agentRouting: AgentRoutingDecision
}

export interface JHONResponse {
  insight: string
  direction: string
  question: string
  rawResponse: string
  tone: 'confident' | 'empathetic' | 'urgent' | 'educational'
  isClosingAttempt: boolean
  suggestedReplies: string[]
  urgencyBoost?: string
}

export interface FollowUpTaskConfig {
  delayHours: number
  channel: Channel
  template: string
  priority: number
}

export interface CRMUpdate {
  type: 'score' | 'stage' | 'tags' | 'notes' | 'persona'
  value: string | number | string[]
}

export interface AgentRoutingDecision {
  agentType: AgentType
  confidence: number
  reasoning: string
}

// ─── Closing Engine ───────────────────────────────────────────

export interface ClosingAssessment {
  closabilityScore: number
  recommendedTechnique: string
  suggestedMessage: string
  progress: {
    qualificationDone: boolean
    priceDiscussed: boolean
    objectionHandled: boolean
    urgencyCreated: boolean
    followUpActive: boolean
  }
}

export interface ClosingEngineConfig {
  enabled: boolean
  techniques: ClosingTechnique[]
  autoSuggestThreshold: number
}

export interface ClosingTechnique {
  id: string
  name: string
  description: string
  condition: string
  messageTemplate: string
}

export interface DealClosability {
  score: number
  confidence: number
  strengths: string[]
  risks: string[]
  recommendedTechnique: string
  recommendedMessage: string
  progressPercentage: number
  stagesCompleted: string[]
  stagesRemaining: string[]
}

// ─── Plan Configuration ───────────────────────────────────────

export interface PlanLimits {
  maxContacts: number
  maxAgents: number
  maxConversations: number
  maxPipelines: number
  maxAutomations: number
  maxMembers: number
  aiProviders: number
  whatsappEnabled: boolean
  telegramEnabled: boolean
  instagramEnabled: boolean
  whiteLabel: boolean
  apiAccess: boolean
}

export interface PlanConfig {
  id: PlanType
  name: string
  price: number
  currency: string
  interval: 'monthly' | 'yearly'
  limits: PlanLimits
  features: string[]
}

// ─── API Types ────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AgentRouteResult {
  agentId: string
  agentType: AgentType
  confidence: number
  reasoning: string
  intent: IntentType
}

// ─── Dashboard / Analytics ────────────────────────────────────

export interface DashboardStats {
  totalContacts: number
  activeConversations: number
  dealsWon: number
  dealsLost: number
  totalRevenue: number
  conversionRate: number
  avgResponseTime: number
  messagesToday: number
  aiMessagesSent: number
  topAgent: string
  pipelineValue: number
  openDeals?: number
  activeAgents?: number
}

export interface ChartDataPoint {
  label: string
  value: number
  secondaryValue?: number
}

// ─── Contact / Conversation DTOs ─────────────────────────────

export interface ContactDTO {
  id: string
  firstName: string
  lastName?: string
  phone?: string
  email?: string
  avatar?: string
  source: string
  tags: string[]
  status: ContactStatus
  leadScore: number
  lastMessageAt?: Date
}

export interface ConversationDTO {
  id: string
  channel: Channel
  status: ConversationStatus
  contact?: ContactDTO
  lastMessageAt: Date
  lastMessagePreview?: string
  unreadCount: number
  assignedTo?: string
  assignedAgentId?: string
}

export interface MessageDTO {
  id: string
  content: string
  type: MessageType
  direction: MessageDirection
  senderType: SenderType
  senderId?: string
  status: MessageStatus
  isAiGenerated: boolean
  createdAt: Date
}

// ─── Auth Types ───────────────────────────────────────────────

export interface AuthUser {
  id: string
  name?: string
  email: string
  role: UserRole
  image?: string
}

export interface WorkspaceContext {
  workspaceId: string
  workspaceName: string
  role: UserRole
  plan: PlanType
  industry: string
}

// ─── Webhook Types ────────────────────────────────────────────

export interface WebhookPayload {
  event: string
  timestamp: string
  data: Record<string, unknown>
  signature?: string
}

export interface WhatsAppWebhookEntry {
  id: string
  changes: WhatsAppWebhookChange[]
}

export interface WhatsAppWebhookChange {
  field: string
  value: {
    messaging_product: string
    metadata?: {
      display_phone_number: string
      phone_number_id: string
    }
    contacts?: Array<{ wa_id: string; profile?: { name: string } }>
    messages?: Array<{
      id: string
      from: string
      text?: { body: string }
      type: string
      timestamp: string
    }>
    statuses?: Array<{
      id: string
      status: string
      timestamp: string
      recipient_id: string
    }>
  }
}
