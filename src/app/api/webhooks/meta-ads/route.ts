// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta (Facebook/Instagram) Lead Ads Webhook
// POST /api/webhooks/meta-ads — Receives leads from Meta
//
// Two payload formats supported:
//   1. Lead Ads (leadgen) — form submissions from Facebook/IG ads
//   2. Messaging — direct page inbox messages
//
// FLOW:
//   1. Verify Meta signature (HMAC-SHA256) if META_APP_SECRET set
//   2. Parse payload → extract lead data
//   3. Find/create Contact in DB (atomic upsert when phone available)
//   4. Create Conversation with channel='facebook'
//   5. Save inbound message
//   6. If lead has phone → fire-and-forget AI pipeline via processMessageCore
//   7. If email only → create contact, skip AI
//   8. Log analytics event
//
// Security:
//   - HMAC-SHA256 signature verification (timing-safe)
//   - In-memory rate limiting: 100 req/min per IP
//   - Verification token check on GET
//
// IMPORTANT: Returns 200 immediately. AI processing is fire-and-forget.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { processMessageCore } from '@/lib/ai/message-processor'
import { normalizePhone } from '@/lib/utils'
import { parseMetaLeadEntry, verifyMetaSignature, type ParsedLead } from '@/lib/meta/lead-parser'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
// Rate Limiter (in-memory, per-IP)
// ═══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number
  resetAt: number
}

const _rateLimitStore = new Map<string, RateLimitEntry>()
const META_RATE_LIMIT = 100 // max 100 requests per minute
const META_RATE_WINDOW_MS = 60_000 // 1 minute

/**
 * Check if the given IP has exceeded the rate limit.
 * Returns true if the request is ALLOWED, false if rate-limited.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = _rateLimitStore.get(ip)

  if (!entry || now >= entry.resetAt) {
    // New window — reset counter
    _rateLimitStore.set(ip, { count: 1, resetAt: now + META_RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= META_RATE_LIMIT) {
    return false // rate limited
  }

  entry.count++
  return true
}

/**
 * Periodically clean up expired rate limit entries to prevent memory leaks.
 * Runs every ~5 minutes worth of calls (simple size check).
 */
function cleanupRateLimits(): void {
  if (_rateLimitStore.size < 500) return
  const now = Date.now()
  for (const [key, entry] of _rateLimitStore) {
    if (now >= entry.resetAt) {
      _rateLimitStore.delete(key)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// GET Handler — Meta Webhook Verification
// ═══════════════════════════════════════════════════════════════
// Meta sends a GET request with hub.mode, hub.verify_token, hub.challenge
// when you first register the webhook. We must echo back the challenge.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // ── Verify subscription request ──
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Meta Webhook] ✅ Verification successful')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // ── Invalid verification ──
  console.warn('[Meta Webhook] ❌ Verification failed', { mode, tokenPresent: !!token })
  return NextResponse.json(
    { error: 'Forbidden — invalid or missing verification token' },
    { status: 403 },
  )
}

// ═══════════════════════════════════════════════════════════════
// POST Handler — Lead Ingestion
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  // ── 0. Rate limiting ──
  cleanupRateLimits()
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 60 },
      { status: 429 },
    )
  }

  try {
    // ── 1. Read raw body for signature verification ──
    const rawBody = await req.text()

    // ── 2. Verify HMAC-SHA256 signature (REQUIRED in production) ──
    // FIX HIGH: Reject unverified requests in production to prevent webhook forgery
    const appSecret = process.env.META_APP_SECRET
    if (process.env.NODE_ENV === 'production' && !appSecret) {
      console.error('[Meta Webhook] ❌ META_APP_SECRET not configured in production')
      return NextResponse.json(
        { error: 'Webhook not configured — missing META_APP_SECRET' },
        { status: 500 },
      )
    }
    if (appSecret) {
      const signature = req.headers.get('x-hub-signature-256') || ''
      if (!verifyMetaSignature(rawBody, signature, appSecret)) {
        console.warn('[Meta Webhook] ❌ Invalid signature')
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 403 },
        )
      }
    }

    // ── 3. Parse JSON body ──
    let body: { object?: string; entry?: Array<Record<string, unknown>> }
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.warn('[Meta Webhook] ❌ Invalid JSON body')
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 },
      )
    }

    // ── 4. Extract leads from all entries ──
    const entries = body.entry || []
    if (entries.length === 0) {
      return NextResponse.json({ received: true, leads: 0 })
    }

    const parsedLeads: ParsedLead[] = []
    for (const entry of entries) {
      const lead = parseMetaLeadEntry(entry as any)
      if (lead) {
        parsedLeads.push(lead)
      }
    }

    if (parsedLeads.length === 0) {
      return NextResponse.json({ received: true, leads: 0, skipped: 'no_parseable_leads' })
    }

    // ── 5. Process each lead (fire-and-forget) ──
    // Return 200 immediately, process leads asynchronously
    for (const lead of parsedLeads) {
      // Fire-and-forget: don't await — Meta expects fast 200
      processMetaLead(lead).catch((err) => {
        console.error('[Meta Webhook] Lead processing failed (non-fatal):',
          err instanceof Error ? err.message : err)
      })
    }

    return NextResponse.json({
      received: true,
      leads: parsedLeads.length,
      leadgenIds: parsedLeads.map((l) => l.leadgenId).filter(Boolean),
    })
  } catch (error) {
    console.error('[Meta Webhook] ❌ Unexpected error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// Lead Processing (fire-and-forget, non-blocking)
// ═══════════════════════════════════════════════════════════════

/**
 * Process a single parsed Meta lead:
 *   1. Find/create workspace
 *   2. Find/create Contact (atomic upsert by phone, or findFirst by email)
 *   3. Create Conversation with channel='facebook'
 *   4. Save inbound message
 *   5. If lead has phone → trigger AI via processMessageCore
 *   6. Log analytics event
 */
async function processMetaLead(lead: ParsedLead): Promise<void> {
  const startTime = Date.now()

  // ── 1. Find workspace ──
  const workspace = await db.workspace.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  // Fallback: reactivate first workspace if none active
  if (!workspace) {
    const anyWorkspace = await db.workspace.findFirst({
      orderBy: { createdAt: 'asc' },
    })
    if (anyWorkspace) {
      await db.workspace.update({
        where: { id: anyWorkspace.id },
        data: { isActive: true },
      })
      console.warn(`[Meta:Lead] Auto-reactivated workspace: ${anyWorkspace.name}`)
      // Continue with reactivated workspace (will re-fetch below)
    } else {
      console.error('[Meta:Lead] No workspace found — aborting')
      return
    }
  }

  const activeWorkspace = workspace || await db.workspace.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!activeWorkspace) {
    console.error('[Meta:Lead] No workspace found after reactivation — aborting')
    return
  }

  // ── 2. Find or create Contact ──
  const normalizedName = lead.name || 'Contacto Facebook'
  const nameParts = normalizedName.split(' ')
  const firstName = nameParts[0] || 'Contacto Facebook'
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
  const normalizedPhone = lead.phone ? normalizePhone(lead.phone) : null
  const channel = 'facebook'

  let contact

  if (normalizedPhone) {
    // ── Phone available: atomic upsert ──
    contact = await db.contact.upsert({
      where: {
        contact_workspace_phone_key: {
          workspaceId: activeWorkspace.id,
          phone: normalizedPhone,
        },
      },
      update: {
        lastMessageAt: new Date(),
        status: 'active',
        // Update name if we have a better one
        ...(lead.name && lead.name.length >= 2 && lead.name !== 'Contacto Facebook'
          ? { firstName, lastName }
          : {}),
        // Update email if we have one now
        ...(lead.email ? { email: lead.email } : {}),
      },
      create: {
        workspaceId: activeWorkspace.id,
        firstName,
        lastName,
        phone: normalizedPhone,
        email: lead.email || null,
        source: channel,
        tags: JSON.stringify(['facebook_incoming']),
      },
    })
  } else if (lead.email) {
    // ── Email only: find by email, or create ──
    contact = await db.contact.findFirst({
      where: {
        workspaceId: activeWorkspace.id,
        email: lead.email,
      },
    })

    if (!contact) {
      contact = await db.contact.create({
        data: {
          workspaceId: activeWorkspace.id,
          firstName,
          lastName,
          email: lead.email,
          source: channel,
          tags: JSON.stringify(['facebook_incoming']),
        },
      })
    } else {
      await db.contact.update({
        where: { id: contact.id },
        data: {
          lastMessageAt: new Date(),
          status: 'active',
          ...(lead.name && lead.name.length >= 2 ? { firstName, lastName } : {}),
        },
      })
    }
  } else {
    // ── No phone, no email — use FB user ID as identifier ──
    if (!lead.fbUserId) {
      console.warn('[Meta:Lead] No phone, email, or FB user ID — cannot create contact')
      return
    }

    const externalId = `fb_${lead.fbUserId}`
    contact = await db.contact.findFirst({
      where: {
        workspaceId: activeWorkspace.id,
        phone: externalId,
      },
    })

    if (!contact) {
      contact = await db.contact.create({
        data: {
          workspaceId: activeWorkspace.id,
          firstName: normalizedName,
          phone: externalId, // Store FB user ID as phone for dedup
          source: channel,
          tags: JSON.stringify(['facebook_incoming', 'fb_messaging']),
        },
      })
    }
  }

  if (!contact) {
    console.error('[Meta:Lead] Failed to create/find contact')
    return
  }

  // FIX MEDIUM: Deduplicate by leadgen_id — prevent re-processing Meta retries
  if (lead.leadgenId) {
    const existingMsg = await db.message.findFirst({
      where: {
        externalId: lead.leadgenId,
        conversationId: { in: (await db.conversation.findMany({
          where: { contactId: contact.id, workspaceId: activeWorkspace.id },
          select: { id: true },
        })).map(c => c.id) },
      },
    })
    if (existingMsg) {
      console.log(`[Meta:Lead] Duplicate leadgen_id ${lead.leadgenId} — skipping`)
      return
    }
  }

  console.log(`[Meta:Lead] ✅ Contact: ${contact.firstName} (${contact.phone || contact.email || contact.id})`)

  // ── 3. Find or create Conversation ──
  let conversation = await db.conversation.findFirst({
    where: {
      workspaceId: activeWorkspace.id,
      contactId: contact.id,
      channel,
      status: 'active',
    },
    orderBy: { lastMessageAt: 'desc' },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        workspaceId: activeWorkspace.id,
        contactId: contact.id,
        channel,
        status: 'active',
        externalId: lead.pageId || lead.fbUserId || lead.leadgenId || null,
        metadata: JSON.stringify({
          leadgenId: lead.leadgenId,
          adId: lead.adId,
          formId: lead.formId,
          pageId: lead.pageId,
          fbUserId: lead.fbUserId,
        }),
      },
    })
  }

  // ── 4. Save inbound message ──
  const messageText = lead.messageText
    || (lead.name && lead.phone ? `Nuevo lead: ${lead.name} (${lead.phone})` : null)
    || (lead.name ? `Nuevo lead: ${lead.name}` : null)
    || 'Nuevo lead de Facebook'

  if (messageText) {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        content: messageText,
        type: 'text',
        direction: 'inbound',
        senderType: 'contact',
        externalId: lead.leadgenId || null,
      },
    })

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: messageText.slice(0, 100),
      },
    })
  }

  // ── 5. Trigger AI pipeline if lead has a real phone number ──
  if (normalizedPhone && normalizedPhone.length >= 10 && messageText) {
    try {
      await processMessageCore({
        text: messageText,
        phone: normalizedPhone,
        pushName: lead.name || undefined,
        externalId: lead.leadgenId || undefined,
        channel,
        skipMessageSave: true, // Already saved above
      })
      console.log(`[Meta:Lead] 🤖 AI pipeline triggered for ${normalizedPhone}`)
    } catch (aiErr) {
      console.warn('[Meta:Lead] ⚠️ AI pipeline failed (non-fatal):',
        aiErr instanceof Error ? aiErr.message : aiErr)
    }
  }

  // ── 6. Log analytics event ──
  try {
    await db.analyticsEvent.create({
      data: {
        workspaceId: activeWorkspace.id,
        eventType: 'facebook_lead_received',
        eventData: JSON.stringify({
          channel,
          leadgenId: lead.leadgenId,
          adId: lead.adId,
          formId: lead.formId,
          hasPhone: !!normalizedPhone,
          hasEmail: !!lead.email,
          hasName: !!lead.name,
          aiProcessed: !!normalizedPhone && normalizedPhone.length >= 10,
          processingTimeMs: Date.now() - startTime,
        }),
      },
    })
  } catch (analyticsErr) {
    console.warn('[Meta:Lead] ⚠️ Analytics logging failed (non-critical):',
      analyticsErr instanceof Error ? analyticsErr.message : analyticsErr)
  }

  console.log(`[Meta:Lead] ✅ Processed in ${Date.now() - startTime}ms`)
}
