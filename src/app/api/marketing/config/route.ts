// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Marketing API Configuration
// GET  /api/marketing/config?workspaceId=xxx  → read config
// PUT  /api/marketing/config                  → save config
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export interface MarketingApiConfig {
  meta: {
    accessToken: string
    businessId: string
    pixelId: string
    adAccountId: string
    pageId: string
  }
  instagram: {
    accessToken: string
    businessAccountId: string
  }
  tiktok: {
    clientKey?: string
    clientSecret?: string
    openId?: string
    accessToken: string
    advertiserId: string
  }
  google: {
    customerId: string
    developerToken: string
    loginCustomerId: string
  }
  connectedAt?: string
}

const EMPTY_CONFIG: MarketingApiConfig = {
  meta: { accessToken: '', businessId: '', pixelId: '', adAccountId: '', pageId: '' },
  instagram: { accessToken: '', businessAccountId: '' },
  tiktok: { clientKey: '', clientSecret: '', accessToken: '', advertiserId: '' },
  google: { customerId: '', developerToken: '', loginCustomerId: '' },
}

function mergeConfig(existing: Partial<MarketingApiConfig>, incoming: Partial<MarketingApiConfig>): MarketingApiConfig {
  return {
    // Preserva claves fuera de las 4 plataformas (ej. marketing.ads, tokens
    // OAuth de TikTok) — antes se borraban al guardar cualquier tarjeta.
    ...(existing as Record<string, unknown>),
    meta: { ...EMPTY_CONFIG.meta, ...(existing.meta || {}), ...(incoming.meta || {}) },
    instagram: { ...EMPTY_CONFIG.instagram, ...(existing.instagram || {}), ...(incoming.instagram || {}) },
    tiktok: { ...EMPTY_CONFIG.tiktok, ...(existing.tiktok || {}), ...(incoming.tiktok || {}) },
    google: { ...EMPTY_CONFIG.google, ...(existing.google || {}), ...(incoming.google || {}) },
  } as MarketingApiConfig
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) return Response.json({ error: 'Workspace no encontrado' }, { status: 404 })

    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(workspace.settings || '{}') } catch { /* empty */ }

    const config: MarketingApiConfig = mergeConfig(EMPTY_CONFIG, (settings.marketing as Partial<MarketingApiConfig>) || {})

    // Mask tokens for security — only return whether they're set, not the actual value
    const masked = {
      meta: {
        accessToken: config.meta.accessToken ? '•'.repeat(20) : '',
        businessId: config.meta.businessId,
        pixelId: config.meta.pixelId,
        adAccountId: config.meta.adAccountId,
        pageId: config.meta.pageId,
      },
      instagram: {
        accessToken: config.instagram.accessToken ? '•'.repeat(20) : '',
        businessAccountId: config.instagram.businessAccountId,
      },
      tiktok: {
        clientKey: config.tiktok.clientKey ? '•'.repeat(20) : '',
        clientSecret: config.tiktok.clientSecret ? '•'.repeat(20) : '',
        accessToken: config.tiktok.accessToken ? '•'.repeat(20) : '',
        advertiserId: config.tiktok.advertiserId || '',
      },
      google: {
        customerId: config.google.customerId,
        developerToken: config.google.developerToken ? '•'.repeat(20) : '',
        loginCustomerId: config.google.loginCustomerId,
      },
    }

    // "Conectado" = REALMENTE puede publicar (no depende de campos de Ads).
    // FB publica con accessToken + pageId; IG con (su token o el de Meta) +
    // businessAccountId. Antes exigía businessId (campo de Ads, fuera del
    // contrato) → mostraba "No configurado" aunque SÍ estuviera publicando
    // (reporte de Jhon 2026-08-02).
    const connected = {
      meta: !!(config.meta.accessToken && config.meta.pageId),
      instagram: !!((config.instagram.accessToken || config.meta.accessToken) && config.instagram.businessAccountId),
      // TikTok "Conectado" = el tenant AUTORIZÓ su cuenta (OAuth: accessToken +
      // openId), NO solo que existan las llaves de la app. Antes salía siempre
      // conectado porque las llaves son de plataforma (env) — reporte de Jhon.
      tiktok: !!(config.tiktok.accessToken && config.tiktok.openId),
      google: !!(config.google.customerId && config.google.developerToken),
    }

    // Estado "pendiente de aprobación" (contrato §Pantalla 6): conexión EMPEZADA
    // pero aún NO utilizable — token puesto pero falta el dato para publicar, o
    // la app de TikTok configurada pero sin autorizar la cuenta. Solo aplica
    // cuando NO está conectada. Refleja el proceso de aprobación de Meta/TikTok
    // (puede tardar 1-4 semanas) sin inventar estados.
    const pending = {
      meta: !connected.meta && !!(config.meta.accessToken && !config.meta.pageId),
      instagram: !connected.instagram && !!((config.instagram.accessToken || config.meta.accessToken) && !config.instagram.businessAccountId),
      tiktok: !connected.tiktok && !!(config.tiktok.clientKey && config.tiktok.clientSecret),
      google: !connected.google && !!(config.google.customerId || config.google.developerToken),
    }

    return Response.json({ config: masked, connected, pending, connectedAt: (settings.marketing as MarketingApiConfig)?.connectedAt })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/marketing/config?workspaceId=xxx&platform=tiktok
// Desconecta una plataforma: borra sus credenciales y tokens OAuth. El resto de
// la config de marketing (otras plataformas, canales) se conserva intacto.
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const platform = searchParams.get('platform') || ''

    const validPlatforms = ['meta', 'instagram', 'tiktok', 'google']
    if (!workspaceId || !validPlatforms.includes(platform)) {
      return Response.json({ error: 'workspaceId y una plataforma válida son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) return Response.json({ error: 'Workspace no encontrado' }, { status: 404 })

    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(workspace.settings || '{}') } catch { /* empty */ }

    const marketing = (settings.marketing as Record<string, unknown>) || {}
    // Vaciar la plataforma → quedan sin accessToken/openId/etc. → "No configurado".
    marketing[platform] = {}
    settings.marketing = marketing

    await db.workspace.update({
      where: { id: workspaceId },
      data: { settings: JSON.stringify(settings) },
    })

    return Response.json({ success: true, platform })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, platform, data } = body as {
      workspaceId: string
      platform: keyof Omit<MarketingApiConfig, 'connectedAt'>
      data: Record<string, string>
    }

    if (!workspaceId || !platform || !data) {
      return Response.json({ error: 'workspaceId, platform y data son requeridos' }, { status: 400 })
    }

    const validPlatforms = ['meta', 'instagram', 'tiktok', 'google']
    if (!validPlatforms.includes(platform)) {
      return Response.json({ error: `Plataforma inválida: ${platform}` }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) return Response.json({ error: 'Workspace no encontrado' }, { status: 404 })

    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(workspace.settings || '{}') } catch { /* empty */ }

    const existing = (settings.marketing as Partial<MarketingApiConfig>) || {}

    // Sanitize: reject obviously invalid token values (dots from masking)
    const sanitized: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && !value.startsWith('•')) {
        sanitized[key] = value.trim()
      }
    }

    const updated: MarketingApiConfig = mergeConfig(existing, {
      [platform]: sanitized,
    } as Partial<MarketingApiConfig>)
    updated.connectedAt = new Date().toISOString()

    settings.marketing = updated

    await db.workspace.update({
      where: { id: workspaceId },
      data: { settings: JSON.stringify(settings) },
    })

    return Response.json({ success: true, platform })
  } catch (error) {
    return errorResponse(error)
  }
}
