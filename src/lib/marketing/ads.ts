// ═══════════════════════════════════════════════════════════════
// Meta Ads (campañas pagadas) v1 — SIEMPRE con freno humano:
//  - Todo se crea EN PAUSA (campaña+adset+creative+ad): $0 de gasto.
//  - La activación SOLO ocurre con aprobación explícita por Telegram
//    (botones ad:on:<campaignId> / ad:del:<campaignId> en el webhook).
// Credenciales: settings.marketing.ads = { accessToken (usuario de sistema
// con ads_management), adAccountId ("act_…") } — separadas del token de
// página que usa la publicación orgánica.
// Objetivo v1: tráfico a WhatsApp (link wa.me) con la imagen del auto.
// ═══════════════════════════════════════════════════════════════

const G = 'https://graph.facebook.com/v21.0'

export interface AdsCreds { token?: string; adAccountId?: string; pageId?: string }

export function readAdsCreds(settingsJson: string | null | undefined): AdsCreds {
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(settingsJson || '{}') } catch { /* */ }
  const mk = (s.marketing as Record<string, Record<string, string>>) || {}
  return {
    token: mk.ads?.accessToken || undefined,
    adAccountId: mk.ads?.adAccountId || undefined,
    pageId: mk.meta?.pageId || undefined,
  }
}
export const canRunAds = (c: AdsCreds) => !!(c.token && c.adAccountId && c.pageId)

async function gpost(path: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${G}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = (j as { error?: { error_user_msg?: string; message?: string } }).error
    throw new Error(e?.error_user_msg || e?.message || `Graph ${r.status}`)
  }
  return j as Record<string, unknown>
}

export interface DraftCampaignInput {
  creds: AdsCreds
  name: string
  dailyBudgetMXN: number   // presupuesto diario en pesos
  linkUrl: string          // destino (wa.me del negocio)
  message: string          // texto del anuncio
  imageUrl: string         // creativo (render del auto)
}

export interface DraftCampaignResult { campaignId: string; adsetId: string; adId: string }

/** Crea campaña+adset+creative+ad, TODO en PAUSED (no gasta nada). */
export async function createPausedCampaign(i: DraftCampaignInput): Promise<DraftCampaignResult> {
  const { creds } = i
  if (!canRunAds(creds)) throw new Error('Faltan credenciales de Ads (token de sistema + Ad Account + página)')
  const acct = creds.adAccountId!.startsWith('act_') ? creds.adAccountId! : `act_${creds.adAccountId}`
  const budgetCents = Math.max(5000, Math.round(i.dailyBudgetMXN * 100)) // mínimo $50 MXN/día

  const camp = await gpost(`${acct}/campaigns`, {
    name: i.name, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: '[]',
    // Requerido por Meta cuando el presupuesto vive en el adset (no en la campaña)
    is_adset_budget_sharing_enabled: 'false',
  }, creds.token!)

  const adset = await gpost(`${acct}/adsets`, {
    name: `${i.name} — conjunto`, campaign_id: String(camp.id), status: 'PAUSED',
    daily_budget: String(budgetCents), billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify({ geo_locations: { countries: ['MX'] } }),
  }, creds.token!)

  const creative = await gpost(`${acct}/adcreatives`, {
    name: `${i.name} — creativo`,
    object_story_spec: JSON.stringify({
      page_id: creds.pageId,
      link_data: { link: i.linkUrl, message: i.message, picture: i.imageUrl },
    }),
  }, creds.token!)

  const ad = await gpost(`${acct}/ads`, {
    name: `${i.name} — anuncio`, adset_id: String(adset.id), status: 'PAUSED',
    creative: JSON.stringify({ creative_id: String(creative.id) }),
  }, creds.token!)

  return { campaignId: String(camp.id), adsetId: String(adset.id), adId: String(ad.id) }
}

/** ACTIVA una campaña pausada (esto SÍ empieza a gastar). Solo tras aprobación. */
export async function activateCampaign(creds: AdsCreds, campaignId: string): Promise<void> {
  await gpost(campaignId, { status: 'ACTIVE' }, creds.token!)
}

/** Elimina una campaña (y sus adsets/ads en cascada). */
export async function deleteCampaign(creds: AdsCreds, campaignId: string): Promise<void> {
  await gpost(campaignId, { status: 'DELETED' }, creds.token!)
}
