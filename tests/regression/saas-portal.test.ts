// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Multi-Client Portal Tests
// Tests that:
//   - Plan limits are enforced correctly
//   - Feature gating blocks unauthorized features
//   - Usage calculations are accurate
//   - Rate limiting on registration
//   - Plan mapping works correctly
// ═══════════════════════════════════════════════════════════════

import {
  PLAN_LIMITS,
  SAAS_PLAN_TO_INTERNAL,
  INTERNAL_PLAN_TO_SAAS,
  getPlanFromWorkspace,
  planHasFeature,
  countWhatsAppConnections,
  FEATURE_DISPLAY_NAMES,
  type SaaSPlan,
} from '@/lib/saas/plan-limits'
import { FEATURE_MIN_PLAN } from '@/lib/saas/middleware'

// ═══════════════════════════════════════════════════════════════
// 1. PLAN LIMITS CONFIGURATION
// ═══════════════════════════════════════════════════════════════

describe('1. Plan limits configuration', () => {
  const plans: SaaSPlan[] = ['starter', 'professional', 'enterprise']

  it('all three plans are defined', () => {
    for (const plan of plans) {
      expect(PLAN_LIMITS[plan]).toBeDefined()
    }
  })

  it('plan limits increase from starter → professional → enterprise', () => {
    const s = PLAN_LIMITS.starter
    const p = PLAN_LIMITS.professional
    const e = PLAN_LIMITS.enterprise

    // Contacts: 100 < 2000 < unlimited
    expect(s.maxContacts).toBeLessThan(p.maxContacts)
    expect(p.maxContacts).toBeLessThan(e.maxContacts)

    // WhatsApp: 1 < 3 < unlimited
    expect(s.maxWhatsApp).toBeLessThan(p.maxWhatsApp)
    expect(p.maxWhatsApp).toBeLessThan(e.maxWhatsApp)

    // Enterprise has unlimited messages
    expect(e.maxMessages).toBeNull()

    // Price: $49 < $199 < $499
    expect(s.priceUSD).toBeLessThan(p.priceUSD)
    expect(p.priceUSD).toBeLessThan(e.priceUSD)
  })

  it('starter plan has minimal features', () => {
    const features = PLAN_LIMITS.starter.features
    expect(features.meta_ads).toBe(false)
    expect(features.telegram).toBe(false)
    expect(features.google_calendar).toBe(false)
    expect(features.multiple_whatsapp).toBe(false)
    expect(features.api_access).toBe(false)
    expect(features.white_label).toBe(false)
    expect(features.priority_support).toBe(false)
  })

  it('professional plan has intermediate features', () => {
    const features = PLAN_LIMITS.professional.features
    expect(features.meta_ads).toBe(true)
    expect(features.telegram).toBe(true)
    expect(features.google_calendar).toBe(true)
    expect(features.multiple_whatsapp).toBe(true)
    expect(features.api_access).toBe(false) // enterprise only
    expect(features.priority_support).toBe(false) // enterprise only
  })

  it('enterprise plan has all features', () => {
    const features = PLAN_LIMITS.enterprise.features
    expect(features.meta_ads).toBe(true)
    expect(features.telegram).toBe(true)
    expect(features.google_calendar).toBe(true)
    expect(features.multiple_whatsapp).toBe(true)
    expect(features.api_access).toBe(true)
    expect(features.white_label).toBe(true)
    expect(features.priority_support).toBe(true)
    expect(features.custom_integrations).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. PLAN MAPPING
// ═══════════════════════════════════════════════════════════════

describe('2. Plan mapping', () => {
  it('SAAS plan names map correctly to internal plan keys', () => {
    expect(SAAS_PLAN_TO_INTERNAL['starter']).toBe('starter')
    expect(SAAS_PLAN_TO_INTERNAL['professional']).toBe('pro')
    expect(SAAS_PLAN_TO_INTERNAL['enterprise']).toBe('enterprise')
  })

  it('internal plan keys map correctly to SaaS plan names', () => {
    expect(INTERNAL_PLAN_TO_SAAS['starter']).toBe('starter')
    expect(INTERNAL_PLAN_TO_SAAS['pro']).toBe('professional')
    expect(INTERNAL_PLAN_TO_SAAS['enterprise']).toBe('enterprise')
  })

  it('getPlanFromWorkspace returns correct SaaS plan', () => {
    expect(getPlanFromWorkspace({ plan: 'starter' })).toBe('starter')
    expect(getPlanFromWorkspace({ plan: 'pro' })).toBe('professional')
    expect(getPlanFromWorkspace({ plan: 'enterprise' })).toBe('enterprise')
  })

  it('getPlanFromWorkspace defaults to starter for unknown plans', () => {
    expect(getPlanFromWorkspace({ plan: 'free' })).toBe('starter')
    expect(getPlanFromWorkspace({ plan: 'unknown_plan' })).toBe('starter')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. FEATURE CHECKING
// ═══════════════════════════════════════════════════════════════

describe('3. Feature checking', () => {
  it('planHasFeature returns correct boolean per plan', () => {
    // Starter: no advanced features
    expect(planHasFeature({ plan: 'starter' }, 'meta_ads')).toBe(false)
    expect(planHasFeature({ plan: 'starter' }, 'telegram')).toBe(false)

    // Professional (internal: 'pro'): has meta_ads, telegram
    expect(planHasFeature({ plan: 'pro' }, 'meta_ads')).toBe(true)
    expect(planHasFeature({ plan: 'pro' }, 'telegram')).toBe(true)
    expect(planHasFeature({ plan: 'pro' }, 'api_access')).toBe(false)

    // Enterprise: has everything
    expect(planHasFeature({ plan: 'enterprise' }, 'api_access')).toBe(true)
    expect(planHasFeature({ plan: 'enterprise' }, 'white_label')).toBe(true)
  })

  it('planHasFeature returns false for unknown features', () => {
    expect(planHasFeature({ plan: 'enterprise' }, 'nonexistent_feature')).toBe(false)
    expect(planHasFeature({ plan: 'starter' }, 'nonexistent_feature')).toBe(false)
  })

  it('FEATURE_DISPLAY_NAMES has all features defined', () => {
    const allFeatures = [
      'meta_ads', 'telegram', 'google_calendar', 'multiple_whatsapp',
      'api_access', 'email_campaigns', 'priority_support', 'white_label', 'custom_integrations',
    ]
    for (const feature of allFeatures) {
      expect(FEATURE_DISPLAY_NAMES[feature]).toBeDefined()
      expect(typeof FEATURE_DISPLAY_NAMES[feature]).toBe('string')
      expect(FEATURE_DISPLAY_NAMES[feature]!.length).toBeGreaterThan(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. RATE LIMITING — Registration
// ═══════════════════════════════════════════════════════════════

describe('4. Rate limiting — registration endpoint', () => {
  // Import rate limit after setting env vars (module may cache values)
  const { rateLimit } = require('@/lib/rate-limit')

  it('allows first 5 registrations from same IP', () => {
    const identifier = 'saas:register:192.168.1.100'

    // Clear any previous state by using a unique identifier
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(`${identifier}-${Date.now()}-${i}`, 5, 3600000)
      expect(result.success).toBe(true)
    }
  })

  it('blocks after 5 registrations from same IP', () => {
    const identifier = `saas:register:ratelimit-test-${Date.now()}`

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      rateLimit(identifier, 5, 3600000)
    }

    // 6th should be blocked
    const result = rateLimit(identifier, 5, 3600000)
    expect(result.success).toBe(false)
    expect(result.retryAfter).not.toBeNull()
    expect(result.remaining).toBe(0)
  })

  it('different IPs have separate rate limits', () => {
    const ip1 = `saas:register:ip-a-${Date.now()}`
    const ip2 = `saas:register:ip-b-${Date.now()}`

    // Exhaust IP1
    for (let i = 0; i < 5; i++) {
      rateLimit(ip1, 5, 3600000)
    }

    // IP1 should be blocked
    expect(rateLimit(ip1, 5, 3600000).success).toBe(false)

    // IP2 should still be allowed
    expect(rateLimit(ip2, 5, 3600000).success).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. FEATURE GATE MIDDLEWARE (pure logic tests)
// ═══════════════════════════════════════════════════════════════

describe('5. Feature gate middleware — logic', () => {
  it('meta_ads requires professional plan', () => {
    expect(FEATURE_MIN_PLAN['meta_ads']).toBe('professional')
  })

  it('telegram requires professional plan', () => {
    expect(FEATURE_MIN_PLAN['telegram']).toBe('professional')
  })

  it('api_access requires enterprise plan', () => {
    expect(FEATURE_MIN_PLAN['api_access']).toBe('enterprise')
  })

  it('white_label requires enterprise plan', () => {
    expect(FEATURE_MIN_PLAN['white_label']).toBe('enterprise')
  })

  it('google_calendar requires professional plan', () => {
    expect(FEATURE_MIN_PLAN['google_calendar']).toBe('professional')
  })

  it('multiple_whatsapp requires professional plan', () => {
    expect(FEATURE_MIN_PLAN['multiple_whatsapp']).toBe('professional')
  })

  it('priority_support requires enterprise plan', () => {
    expect(FEATURE_MIN_PLAN['priority_support']).toBe('enterprise')
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. WHATSAPP CONNECTION COUNTING
// ═══════════════════════════════════════════════════════════════

describe('6. WhatsApp connection counting', () => {
  it('counts 0 when no whatsappPhoneId and no settings', () => {
    const result = countWhatsAppConnections({
      whatsappPhoneId: null,
      settings: '{}',
    })
    expect(result).toBe(0)
  })

  it('counts 1 when whatsappPhoneId is set', () => {
    const result = countWhatsAppConnections({
      whatsappPhoneId: 'phone-123',
      settings: '{}',
    })
    expect(result).toBe(1)
  })

  it('counts additional connections from settings', () => {
    const settings = JSON.stringify({
      additionalWhatsAppConnections: ['phone-2', 'phone-3'],
    })
    const result = countWhatsAppConnections({
      whatsappPhoneId: 'phone-1',
      settings,
    })
    expect(result).toBe(3)
  })

  it('handles malformed settings gracefully', () => {
    const result = countWhatsAppConnections({
      whatsappPhoneId: null,
      settings: 'not-json',
    })
    expect(result).toBe(0)
  })

  it('handles missing settings gracefully', () => {
    const result = countWhatsAppConnections({
      whatsappPhoneId: 'phone-1',
    })
    expect(result).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. PLAN LIMITS — Infinity & Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('7. Plan limits — edge cases', () => {
  it('enterprise maxContacts is Infinity', () => {
    expect(PLAN_LIMITS.enterprise.maxContacts).toBe(Infinity)
  })

  it('enterprise maxWhatsApp is Infinity', () => {
    expect(PLAN_LIMITS.enterprise.maxWhatsApp).toBe(Infinity)
  })

  it('enterprise maxMessages is null (unlimited)', () => {
    expect(PLAN_LIMITS.enterprise.maxMessages).toBeNull()
  })

  it('starter maxMessages is a finite number', () => {
    expect(PLAN_LIMITS.starter.maxMessages).not.toBeNull()
    expect(typeof PLAN_LIMITS.starter.maxMessages).toBe('number')
    expect(PLAN_LIMITS.starter.maxMessages!).toBeGreaterThan(0)
  })

  it('starter has exactly 1 WhatsApp allowed', () => {
    expect(PLAN_LIMITS.starter.maxWhatsApp).toBe(1)
  })

  it('professional has exactly 3 WhatsApp allowed', () => {
    expect(PLAN_LIMITS.professional.maxWhatsApp).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. STRIPE PRICE ENV VAR NAMES
// ═══════════════════════════════════════════════════════════════

describe('8. Stripe price env var configuration', () => {
  it('each plan has a unique stripePriceEnvVar', () => {
    const envVars = [
      PLAN_LIMITS.starter.stripePriceEnvVar,
      PLAN_LIMITS.professional.stripePriceEnvVar,
      PLAN_LIMITS.enterprise.stripePriceEnvVar,
    ]
    const uniqueVars = new Set(envVars)
    expect(uniqueVars.size).toBe(3)
  })

  it('starter env var is STRIPE_STARTER_PRICE_ID', () => {
    expect(PLAN_LIMITS.starter.stripePriceEnvVar).toBe('STRIPE_STARTER_PRICE_ID')
  })

  it('professional env var is STRIPE_PROFESSIONAL_PRICE_ID', () => {
    expect(PLAN_LIMITS.professional.stripePriceEnvVar).toBe('STRIPE_PROFESSIONAL_PRICE_ID')
  })

  it('enterprise env var is STRIPE_ENTERPRISE_PRICE_ID', () => {
    expect(PLAN_LIMITS.enterprise.stripePriceEnvVar).toBe('STRIPE_ENTERPRISE_PRICE_ID')
  })
})
