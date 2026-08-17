// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta API Config CRUD
// GET    /api/whatsapp/meta/config  → Get current config (masked)
// POST   /api/whatsapp/meta/config  → Create/update config
// DELETE /api/whatsapp/meta/config  → Remove config, reset to baileys
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, getPlanLimits } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { getMetaPhoneInfo } from '@/lib/whatsapp/meta-api'
import crypto from 'crypto'

// ─── GET — Fetch current config (masked token) ────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  const [config, workspace] = await Promise.all([
    db.metaApiConfig.findUnique({
      where: { workspaceId },
      select: {
        id: true,
        phoneNumberId: true,
        webhookSecret: true,
        businessId: true,
        displayPhone: true,
        qualityRating: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Never return full accessToken
      },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { waChannel: true },
    }),
  ])

  return NextResponse.json({
    config: config ? {
      ...config,
      accessToken: config ? '••••••••••••' : null,  // never expose token
    } : null,
    waChannel: workspace?.waChannel ?? 'baileys',
  })
}

// ─── POST — Create/update config ─────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: {
    workspaceId: string
    phoneNumberId: string
    accessToken: string
    businessId?: string
    activate?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { workspaceId, phoneNumberId, accessToken, businessId, activate } = body
  if (!workspaceId || !phoneNumberId || !accessToken) {
    return NextResponse.json({ error: 'workspaceId, phoneNumberId, and accessToken are required' }, { status: 400 })
  }

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  // Enforce plan channel gating: Meta WhatsApp requires at least Starter plan
  const { limits, planName } = await getPlanLimits(workspaceId)
  if (!limits.telegramEnabled && !limits.instagramEnabled) {
    // telegramEnabled=false AND instagramEnabled=false means free plan (only 1 channel = Baileys WA)
    return NextResponse.json(
      { error: `Tu plan ${planName} solo permite 1 canal (WhatsApp básico). Actualiza tu plan para conectar más canales.`, code: 'CHANNEL_LIMIT_REACHED' },
      { status: 403 }
    )
  }

  // Validate credentials by calling Meta Graph API
  const phoneInfo = await getMetaPhoneInfo(phoneNumberId, accessToken)
  if (!phoneInfo) {
    return NextResponse.json(
      { error: 'Could not validate credentials. Check phoneNumberId and accessToken.' },
      { status: 422 }
    )
  }

  // Generate a webhook secret if not already stored
  const existing = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { webhookSecret: true },
  })
  const webhookSecret = existing?.webhookSecret ?? crypto.randomBytes(24).toString('hex')

  const config = await db.metaApiConfig.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      phoneNumberId,
      accessToken,
      webhookSecret,
      businessId: businessId ?? null,
      displayPhone: phoneInfo.display_phone_number,
      qualityRating: phoneInfo.quality_rating,
      isActive: activate !== false,
    },
    update: {
      phoneNumberId,
      accessToken,
      businessId: businessId ?? null,
      displayPhone: phoneInfo.display_phone_number,
      qualityRating: phoneInfo.quality_rating,
      isActive: activate !== false,
    },
    select: {
      id: true,
      phoneNumberId: true,
      webhookSecret: true,
      businessId: true,
      displayPhone: true,
      qualityRating: true,
      isActive: true,
    },
  })

  // Switch workspace channel to meta if activating
  if (activate !== false) {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { waChannel: 'meta' },
    })
  }

  return NextResponse.json({ config: { ...config, accessToken: '••••••••••••' } })
}

// ─── DELETE — Remove config, revert to baileys ───────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  await db.$transaction([
    db.metaApiConfig.deleteMany({ where: { workspaceId } }),
    db.workspace.update({
      where: { id: workspaceId },
      data: { waChannel: 'baileys' },
    }),
  ])

  return NextResponse.json({ success: true })
}
