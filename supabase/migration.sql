-- ═══════════════════════════════════════════════════════════════
-- ValiAutoFlow — Complete Database Migration to Supabase (PostgreSQL)
-- 27 tables, all indexes, constraints, and relations
-- ═══════════════════════════════════════════════════════════════

-- 1. AUTH & MULTI-TENANCY

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  "password" TEXT,
  "image" TEXT,
  "role" TEXT NOT NULL DEFAULT 'member',
  "phone" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  "locale" TEXT NOT NULL DEFAULT 'es-MX',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId")
);
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expires" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
);

-- 2. WORKSPACE

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "logo" TEXT,
  "industry" TEXT NOT NULL DEFAULT 'automotive',
  "plan" TEXT NOT NULL DEFAULT 'free',
  "whatsappPhoneId" TEXT,
  "whatsappToken" TEXT,
  "telegramBotToken" TEXT,
  "instagramToken" TEXT,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "mercadoPagoCustomerId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "settings" TEXT NOT NULL DEFAULT '{}',
  "maxContacts" INTEGER NOT NULL DEFAULT 100,
  "maxAgents" INTEGER NOT NULL DEFAULT 2,
  "maxConversations" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX IF NOT EXISTS "Workspace_slug_idx" ON "Workspace"("slug");

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "WorkspaceMember_userId_workspaceId_key" UNIQUE ("userId", "workspaceId")
);
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- 3. CRM: CONTACTS

CREATE TABLE IF NOT EXISTS "Contact" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "avatar" TEXT,
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "tags" TEXT NOT NULL DEFAULT '[]',
  "customFields" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active',
  "leadScore" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "lastMessageAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "contact_workspace_phone_key" UNIQUE ("workspaceId", "phone")
);
CREATE INDEX IF NOT EXISTS "Contact_workspaceId_idx" ON "Contact"("workspaceId");
CREATE INDEX IF NOT EXISTS "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX IF NOT EXISTS "Contact_status_idx" ON "Contact"("status");
CREATE INDEX IF NOT EXISTS "Contact_lastMessageAt_idx" ON "Contact"("lastMessageAt");

-- 4. CONVERSATIONS & MESSAGES

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE SET NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "externalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "assignedTo" TEXT,
  "assignedAgentId" TEXT,
  "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastMessagePreview" TEXT,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Conversation_workspaceId_idx" ON "Conversation"("workspaceId");
CREATE INDEX IF NOT EXISTS "Conversation_contactId_idx" ON "Conversation"("contactId");
CREATE INDEX IF NOT EXISTS "Conversation_channel_idx" ON "Conversation"("channel");
CREATE INDEX IF NOT EXISTS "Conversation_status_idx" ON "Conversation"("status");
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "direction" TEXT NOT NULL DEFAULT 'inbound',
  "senderType" TEXT NOT NULL DEFAULT 'contact',
  "senderId" TEXT,
  "externalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "agentId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
CREATE INDEX IF NOT EXISTS "Message_direction_idx" ON "Message"("direction");

-- 5. AI AGENT SYSTEM

CREATE TABLE IF NOT EXISTS "Agent" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'qualifier',
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "model" TEXT NOT NULL DEFAULT 'groq',
  "modelName" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "maxTokens" INTEGER NOT NULL DEFAULT 4096,
  "systemPrompt" TEXT NOT NULL DEFAULT '',
  "personality" TEXT NOT NULL DEFAULT 'JHON',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "config" TEXT NOT NULL DEFAULT '{}',
  "webhookUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Agent_workspaceId_idx" ON "Agent"("workspaceId");
CREATE INDEX IF NOT EXISTS "Agent_type_idx" ON "Agent"("type");
CREATE INDEX IF NOT EXISTS "Agent_isActive_idx" ON "Agent"("isActive");

CREATE TABLE IF NOT EXISTS "AgentPersona" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "systemPrompt" TEXT NOT NULL,
  "tone" TEXT NOT NULL DEFAULT 'professional',
  "language" TEXT NOT NULL DEFAULT 'es',
  "hooks" TEXT NOT NULL DEFAULT '[]',
  "steering" TEXT NOT NULL DEFAULT '{}',
  "revenueRules" TEXT NOT NULL DEFAULT '[]',
  "closingRules" TEXT NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AgentPersona_workspaceId_slug_key" UNIQUE ("workspaceId", "slug")
);
CREATE INDEX IF NOT EXISTS "AgentPersona_workspaceId_idx" ON "AgentPersona"("workspaceId");

CREATE TABLE IF NOT EXISTS "AgentLog" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "inputMessage" TEXT NOT NULL,
  "outputMessage" TEXT,
  "model" TEXT,
  "tokensUsed" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "intent" TEXT,
  "action" TEXT,
  "error" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AgentLog_agentId_idx" ON "AgentLog"("agentId");
CREATE INDEX IF NOT EXISTS "AgentLog_conversationId_idx" ON "AgentLog"("conversationId");
CREATE INDEX IF NOT EXISTS "AgentLog_createdAt_idx" ON "AgentLog"("createdAt");

CREATE TABLE IF NOT EXISTS "AgentMemory" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'conversation',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AgentMemory_agentId_contactId_key_key" UNIQUE ("agentId", "contactId", "key")
);
CREATE INDEX IF NOT EXISTS "AgentMemory_agentId_idx" ON "AgentMemory"("agentId");
CREATE INDEX IF NOT EXISTS "AgentMemory_contactId_idx" ON "AgentMemory"("contactId");

-- 6. PIPELINE & DEALS

CREATE TABLE IF NOT EXISTS "Pipeline" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Pipeline_workspaceId_idx" ON "Pipeline"("workspaceId");

CREATE TABLE IF NOT EXISTS "PipelineStage" (
  "id" TEXT PRIMARY KEY,
  "pipelineId" TEXT NOT NULL REFERENCES "Pipeline"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "order" INTEGER NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 0,
  "isWon" BOOLEAN NOT NULL DEFAULT false,
  "isLost" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PipelineStage_pipelineId_order_key" UNIQUE ("pipelineId", "order")
);
CREATE INDEX IF NOT EXISTS "PipelineStage_pipelineId_idx" ON "PipelineStage"("pipelineId");

CREATE TABLE IF NOT EXISTS "Deal" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "pipelineId" TEXT NOT NULL REFERENCES "Pipeline"("id") ON DELETE CASCADE,
  "stageId" TEXT NOT NULL REFERENCES "PipelineStage"("id"),
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE SET NULL,
  "assignedTo" TEXT,
  "title" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'MXN',
  "description" TEXT,
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "status" TEXT NOT NULL DEFAULT 'active',
  "wonAt" TIMESTAMPTZ,
  "lostAt" TIMESTAMPTZ,
  "lostReason" TEXT,
  "closedBy" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "order" INTEGER NOT NULL DEFAULT 0,
  "expectedCloseDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Deal_workspaceId_idx" ON "Deal"("workspaceId");
CREATE INDEX IF NOT EXISTS "Deal_pipelineId_idx" ON "Deal"("pipelineId");
CREATE INDEX IF NOT EXISTS "Deal_stageId_idx" ON "Deal"("stageId");
CREATE INDEX IF NOT EXISTS "Deal_contactId_idx" ON "Deal"("contactId");
CREATE INDEX IF NOT EXISTS "Deal_status_idx" ON "Deal"("status");

-- 7. FOLLOW-UP AUTOMATION

CREATE TABLE IF NOT EXISTS "FollowUpRule" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "agentId" TEXT REFERENCES "Agent"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'inactivity',
  "triggerConfig" TEXT NOT NULL DEFAULT '{}',
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "messageTemplate" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "cooldownHours" INTEGER NOT NULL DEFAULT 24,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "FollowUpRule_workspaceId_idx" ON "FollowUpRule"("workspaceId");

CREATE TABLE IF NOT EXISTS "FollowUpTask" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "sentAt" TIMESTAMPTZ,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "FollowUpTask_workspaceId_idx" ON "FollowUpTask"("workspaceId");
CREATE INDEX IF NOT EXISTS "FollowUpTask_status_idx" ON "FollowUpTask"("status");

-- 8. AUTOMATIONS

CREATE TABLE IF NOT EXISTS "Automation" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT NOT NULL,
  "triggerConfig" TEXT NOT NULL DEFAULT '{}',
  "actions" TEXT NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "runCount" INTEGER NOT NULL DEFAULT 0,
  "lastRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Automation_workspaceId_idx" ON "Automation"("workspaceId");

-- 9. BILLING & SUBSCRIPTIONS

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL UNIQUE REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "status" TEXT NOT NULL DEFAULT 'active',
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "providerPlanId" TEXT,
  "currentPeriodStart" TIMESTAMPTZ NOT NULL,
  "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
  "trialEnd" TIMESTAMPTZ,
  "cancelAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'MXN',
  "interval" TEXT NOT NULL DEFAULT 'monthly',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT
);

-- 10. ANALYTICS & EVENTS

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "eventData" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_workspaceId_idx" ON "AnalyticsEvent"("workspaceId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");

-- 11. WEBHOOK CONFIGS

CREATE TABLE IF NOT EXISTS "WebhookConfig" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "channel" TEXT NOT NULL,
  "webhookUrl" TEXT,
  "secret" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. MEDIA FILES

CREATE TABLE IF NOT EXISTS "MediaFile" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT,
  "messageId" TEXT REFERENCES "Message"("id") ON DELETE SET NULL,
  "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE SET NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "filePath" TEXT NOT NULL,
  "thumbnailPath" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "durationSeconds" INTEGER,
  "caption" TEXT,
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "externalId" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. DIB: LEAD PROFILE

CREATE TABLE IF NOT EXISTS "LeadProfile" (
  "id" TEXT PRIMARY KEY,
  "contactId" TEXT NOT NULL UNIQUE REFERENCES "Contact"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "archetype" TEXT NOT NULL DEFAULT 'desconocido',
  "archetypeConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "temperature" TEXT NOT NULL DEFAULT 'cold',
  "score" INTEGER NOT NULL DEFAULT 0,
  "totalMessages" INTEGER NOT NULL DEFAULT 0,
  "avgResponseTimeMs" INTEGER NOT NULL DEFAULT 0,
  "lastActiveAt" TIMESTAMPTZ,
  "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reactivateCount" INTEGER NOT NULL DEFAULT 0,
  "lastReactivateAt" TIMESTAMPTZ,
  "lastAngleUsed" TEXT,
  "reactivationCycle" INTEGER NOT NULL DEFAULT 0,
  "isReactivable" BOOLEAN NOT NULL DEFAULT true,
  "budget" TEXT,
  "preferredProduct" TEXT,
  "mainObjection" TEXT,
  "decisionMaker" TEXT,
  "timeline" TEXT,
  "communicationStyle" TEXT NOT NULL DEFAULT 'neutral',
  "painPoints" TEXT NOT NULL DEFAULT '[]',
  "interests" TEXT NOT NULL DEFAULT '[]',
  "buyingMotivation" TEXT,
  "priceSensitivity" TEXT NOT NULL DEFAULT 'medium',
  "urgencyLevel" TEXT NOT NULL DEFAULT 'low',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "LeadProfile_contactId_idx" ON "LeadProfile"("contactId");
CREATE INDEX IF NOT EXISTS "LeadProfile_workspaceId_idx" ON "LeadProfile"("workspaceId");
CREATE INDEX IF NOT EXISTS "LeadProfile_temperature_idx" ON "LeadProfile"("temperature");

-- 14. WHATSAPP AUTH

CREATE TABLE IF NOT EXISTS "WhatsAppAuth" (
  "id" TEXT PRIMARY KEY,
  "workspace" TEXT NOT NULL UNIQUE,
  "authData" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS: Enable + Allow anon full access
-- ═══════════════════════════════════════════════════════════════

DO $$ DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "anon_all_access" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
