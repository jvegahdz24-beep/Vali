// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta Templates API
// GET  /api/whatsapp/meta/templates  → Fetch templates from Meta
// POST /api/whatsapp/meta/templates  → Send template to a contact
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { getMetaTemplates, sendMetaTemplateMessage, createMetaTemplate, deleteMetaTemplate, type MetaTemplateComponent } from '@/lib/whatsapp/meta-api'

// ─── GET — Fetch templates from Meta API ─────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  const config = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { businessId: true, accessToken: true, isActive: true },
  })

  if (!config?.isActive || !config.businessId) {
    return NextResponse.json({ templates: [], message: 'Meta API not configured or businessId missing' })
  }

  const templates = await getMetaTemplates(config.businessId, config.accessToken)

  // Cache templates in DB for offline reference
  await Promise.all(
    templates.map(t =>
      db.metaMessageTemplate.upsert({
        where: {
          // unique by workspaceId+name via custom index (use id fallback)
          // We use metaId as unique key per workspace
          id: `${workspaceId}_${t.name}_${t.language}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        },
        create: {
          id: `${workspaceId}_${t.name}_${t.language}`.replace(/[^a-zA-Z0-9_]/g, '_'),
          workspaceId,
          metaId: t.id,
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          components: JSON.stringify(t.components ?? []),
        },
        update: {
          metaId: t.id,
          category: t.category,
          status: t.status,
          components: JSON.stringify(t.components ?? []),
        },
      })
    )
  )

  return NextResponse.json({ templates })
}

// ─── POST — Send a template message ──────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: {
    workspaceId: string
    to: string
    templateName: string
    language: string
    components?: MetaTemplateComponent[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { workspaceId, to, templateName, language, components } = body
  if (!workspaceId || !to || !templateName || !language) {
    return NextResponse.json(
      { error: 'workspaceId, to, templateName, and language are required' },
      { status: 400 }
    )
  }

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  const config = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { phoneNumberId: true, accessToken: true, isActive: true },
  })
  if (!config?.isActive) {
    return NextResponse.json({ error: 'Meta API not configured or inactive' }, { status: 400 })
  }

  const result = await sendMetaTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    to,
    templateName,
    language,
    components
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true, messageId: result.messageId })
}

// ─── PUT — Crear plantilla y enviarla a revisión de Meta ──────
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: {
    workspaceId: string; name: string; category?: string; language?: string
    headerText?: string; bodyText: string; footerText?: string
    bodyExample?: string[]; buttons?: string[]
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { workspaceId } = body
  if (!workspaceId || !body.name || !body.bodyText) {
    return NextResponse.json({ error: 'workspaceId, name y bodyText son requeridos' }, { status: 400 })
  }
  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  // Nombre válido para Meta: minúsculas, números y guiones bajos.
  const name = body.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').slice(0, 512)
  const category = ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(String(body.category)) ? String(body.category) : 'MARKETING'
  const language = body.language || 'es_MX'

  const config = await db.metaApiConfig.findUnique({ where: { workspaceId }, select: { businessId: true, accessToken: true, isActive: true } })
  if (!config?.isActive || !config.businessId) {
    return NextResponse.json({ error: 'Conecta WhatsApp Business API (Meta) con Business Account ID antes de crear plantillas' }, { status: 400 })
  }

  // Componentes en el formato de CREACIÓN de Meta (tipos en MAYÚSCULAS).
  const components: Record<string, unknown>[] = []
  if (body.headerText?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: body.headerText.trim().slice(0, 60) })
  const varCount = (body.bodyText.match(/\{\{\s*\d+\s*\}\}/g) || []).length
  const bodyComp: Record<string, unknown> = { type: 'BODY', text: body.bodyText.trim() }
  if (varCount > 0) {
    const ex = (body.bodyExample || []).slice(0, varCount)
    while (ex.length < varCount) ex.push('ejemplo')
    bodyComp.example = { body_text: [ex] }
  }
  components.push(bodyComp)
  if (body.footerText?.trim()) components.push({ type: 'FOOTER', text: body.footerText.trim().slice(0, 60) })
  const btns = (body.buttons || []).map(b => b.trim()).filter(Boolean).slice(0, 3)
  if (btns.length) components.push({ type: 'BUTTONS', buttons: btns.map(text => ({ type: 'QUICK_REPLY', text: text.slice(0, 25) })) })

  const created = await createMetaTemplate(config.businessId, config.accessToken, { name, category, language, components })
  if (!created.success) return NextResponse.json({ error: created.error }, { status: 422 })

  // Cachear localmente
  await db.metaMessageTemplate.upsert({
    where: { id: `${workspaceId}_${name}_${language}`.replace(/[^a-zA-Z0-9_]/g, '_') },
    create: { id: `${workspaceId}_${name}_${language}`.replace(/[^a-zA-Z0-9_]/g, '_'), workspaceId, metaId: created.id ?? null, name, category, language, status: created.status || 'PENDING', components: JSON.stringify(components) },
    update: { metaId: created.id ?? null, category, status: created.status || 'PENDING', components: JSON.stringify(components) },
  }).catch(() => {})

  return NextResponse.json({ success: true, name, status: created.status || 'PENDING' })
}

// ─── DELETE — Eliminar plantilla en Meta y en local ──────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
  const name = req.nextUrl.searchParams.get('name') || ''
  const metaId = req.nextUrl.searchParams.get('metaId') || undefined
  if (!workspaceId || !name) return NextResponse.json({ error: 'workspaceId y name requeridos' }, { status: 400 })

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  const config = await db.metaApiConfig.findUnique({ where: { workspaceId }, select: { businessId: true, accessToken: true } })
  if (config?.businessId && config.accessToken) {
    const r = await deleteMetaTemplate(config.businessId, config.accessToken, name, metaId)
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 422 })
  }
  await db.metaMessageTemplate.deleteMany({ where: { workspaceId, name } }).catch(() => {})
  return NextResponse.json({ success: true })
}
