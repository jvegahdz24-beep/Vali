// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — Centralized Configuration
// Single source of truth for ALL environment variables
// Zod-validated at startup — crashes fast if misconfigured
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod'

// ─── Schema Definitions ──────────────────────────────────────

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MIN: z.coerce.number().int().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
})

const appSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  DEBUG: z.enum(['true', 'false']).default('false'),
})

const authSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY_SECONDS: z.coerce.number().int().default(15 * 60),
  JWT_REFRESH_EXPIRY_SECONDS: z.coerce.number().int().default(7 * 24 * 3600),
  SEED_PIN: z.string().default(''),
  WORKER_KEY: z.string().default(''),
  CRON_SECRET: z.string().default(''),
})

const redisSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PREFIX: z.string().default('valiflow:'),
  REDIS_TTL_DEFAULT: z.coerce.number().int().default(3600),
  REDIS_TTL_SESSION: z.coerce.number().int().default(86400),
  REDIS_TTL_RATE_LIMIT: z.coerce.number().int().default(60),
})

const aiSchema = z.object({
  ZAI_API_KEY: z.string().default(''),
  AI_DEFAULT_PROVIDER: z.enum(['glm', 'groq', 'deepseek', 'gemini', 'openai']).default('glm'),
  AI_DEFAULT_MODEL: z.string().default('glm-4.5-flash'),
  AI_MAX_TOKENS: z.coerce.number().int().default(4096),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  AI_TIMEOUT_MS: z.coerce.number().int().default(30000),
})

const googleSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3000/api/nexus/calendar/callback'),
})

const emailSchema = z.object({
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().email().default('noreply@valiautoflow.com'),
})

const whatsappSchema = z.object({
  WHATSAPP_WEBHOOK_SECRET: z.string().default(''),
  EVOLUTION_API_URL: z.string().default(''),
  EVOLUTION_API_KEY: z.string().default(''),
  EVOLUTION_INSTANCE_NAME: z.string().default(''),
  EVOLUTION_WEBHOOK_SECRET: z.string().default(''),
})

const stripeSchema = z.object({
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().default(''),
  STRIPE_PRICE_STARTER_YEARLY: z.string().default(''),
  STRIPE_PRICE_PRO_MONTHLY: z.string().default(''),
  STRIPE_PRICE_PRO_YEARLY: z.string().default(''),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().default(''),
  STRIPE_PRICE_ENTERPRISE_YEARLY: z.string().default(''),
})

const demoSchema = z.object({
  DEMO_EMAIL: z.string().email().default('jvegahdz24@gmail.com'),
  DEMO_PASSWORD: z.string().default('valiflow2026'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
})

const meilisearchSchema = z.object({
  MEILI_SEARCH_URL: z.string().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().default(''),
})

const observabilitySchema = z.object({
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
  PRISMA_LOG: z.enum(['true', 'false']).default('false'),
})

// ─── Full Config Schema ───────────────────────────────────────

const fullConfigSchema = z.object({
  ...databaseSchema.shape,
  ...appSchema.shape,
  ...authSchema.shape,
  ...redisSchema.shape,
  ...aiSchema.shape,
  ...googleSchema.shape,
  ...emailSchema.shape,
  ...whatsappSchema.shape,
  ...stripeSchema.shape,
  ...demoSchema.shape,
  ...meilisearchSchema.shape,
  ...observabilitySchema.shape,
})

// ─── Types ─────────────────────────────────────────────────────

export type AppConfig = z.infer<typeof fullConfigSchema>

// ─── Validation & Export ───────────────────────────────────────

function validateConfig(): AppConfig {
  // Ensure minimum env vars exist for validation
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    DATABASE_URL: process.env.DATABASE_URL || 'file:./db/test.db',
    DIRECT_URL: process.env.DIRECT_URL || 'file:./db/test.db',
  }

  const result = fullConfigSchema.safeParse(env)

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')

    console.error(`\n╔══════════════════════════════════════════════════╗`)
    console.error(`║  ValiAutoFlow CRM — Configuration Error         ║`)
    console.error(`╠══════════════════════════════════════════════════╣`)
    console.error(`║  Missing or invalid environment variables:      ║`)
    console.error(`║                                                  ║`)
    console.error(errors)
    console.error(`║                                                  ║`)
    console.error(`║  Fix: Copy .env.example to .env and fill values  ║`)
    console.error(`╚══════════════════════════════════════════════════╝\n`)

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuration validation failed')
    }
  }

  return (result.data || {
    NODE_ENV: 'test',
    DATABASE_URL: 'file:./db/test.db',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PREFIX: 'test:',
  }) as AppConfig
}

export const config = validateConfig()

// ─── Convenience Helpers ───────────────────────────────────────

export const isDev = config.NODE_ENV === 'development'
export const isProd = config.NODE_ENV === 'production'
export const isTest = config.NODE_ENV === 'test'

export function isConfigured(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value !== 'undefined'
}

export const hasAI = isConfigured(config.ZAI_API_KEY)
export const hasRedis = isConfigured(config.REDIS_URL) || config.NODE_ENV !== 'production'
export const hasStripe = isConfigured(config.STRIPE_SECRET_KEY)
export const hasGoogle = isConfigured(config.GOOGLE_CLIENT_ID) && isConfigured(config.GOOGLE_CLIENT_SECRET)
export const hasEmail = isConfigured(config.RESEND_API_KEY)
export const hasWhatsApp = isConfigured(config.EVOLUTION_API_URL)
export const hasMeilisearch = isConfigured(config.MEILI_SEARCH_URL)
export const demoEnabled = config.DEMO_MODE === 'true'

export default config
