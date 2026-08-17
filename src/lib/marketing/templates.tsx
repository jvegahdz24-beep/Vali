/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// ═══════════════════════════════════════════════════════════════
// Plantillas de creativos (Satori / next-og) para autos del inventario.
// Componen la FOTO REAL del auto con overlays profesionales: precio,
// specs, logo, CTA. Feed 1080×1080 y Story 1080×1920. Solo flexbox
// (restricción de Satori); sin emojis (requieren red para renderizar).
// ═══════════════════════════════════════════════════════════════

import type { ReactElement } from 'react'
import type { CarCreative } from './creative'
import { money } from './creative'

const FONT = 'Montserrat'
const DARK = '#0a0e14'

export const FEED_TEMPLATES = ['clasica', 'ficha', 'oferta'] as const
export const STORY_TEMPLATES = ['historia', 'cobertura', 'editorial'] as const
export type FeedTemplate = (typeof FEED_TEMPLATES)[number]
export type StoryTemplate = (typeof STORY_TEMPLATES)[number]

function specsOf(c: CarCreative): { k: string; v: string }[] {
  return [
    c.year && { k: 'AÑO', v: String(c.year) },
    c.km && { k: 'KM', v: c.km.replace(/\s*km$/i, '') },
    c.transmision && { k: 'TRANS.', v: c.transmision },
    c.combustible && { k: 'COMBUST.', v: c.combustible },
    c.carroceria && { k: 'TIPO', v: c.carroceria },
    c.ubicacion && { k: 'UBIC.', v: c.ubicacion },
  ].filter(Boolean) as { k: string; v: string }[]
}

const subtitle = (c: CarCreative) =>
  [c.brand, c.model, c.version].filter(Boolean).join(' · ') || c.condicion || ''

const photoOrPlaceholder = (c: CarCreative, style: React.CSSProperties): ReactElement =>
  c.photo
    ? <img src={c.photo} style={{ ...style, objectFit: 'cover' }} />
    : <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1f2937,#0b1220)', color: '#475569', fontSize: 120, fontWeight: 800, fontFamily: FONT }}>{(c.brand || c.dealerName || 'AUTO').slice(0, 2).toUpperCase()}</div>

function DealerTag({ c, dark = false }: { c: CarCreative; dark?: boolean }): ReactElement {
  if (c.hideBrand) return <div style={{ display: 'flex' }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '12px 22px 12px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
      {c.logo
        ? <img src={c.logo} width={44} height={44} style={{ borderRadius: 999, objectFit: 'cover', marginRight: 12 }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 999, background: c.accent, color: '#fff', fontSize: 22, fontWeight: 800, fontFamily: FONT, marginRight: 12 }}>{c.dealerName.slice(0, 1).toUpperCase()}</div>}
      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, color: dark ? '#fff' : DARK }}>{c.dealerName}</span>
    </div>
  )
}

function Badge({ text, accent }: { text: string; accent: string }): ReactElement {
  return <div style={{ display: 'flex', background: accent, color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 26, letterSpacing: 1, padding: '12px 24px', borderRadius: 12, textTransform: 'uppercase', boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}>{text}</div>
}

function Chips({ specs, max = 4, light = true }: { specs: { k: string; v: string }[]; max?: number; light?: boolean }): ReactElement {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      {specs.slice(0, max).map((s, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', background: light ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)', border: light ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '12px 18px', marginRight: 12, marginTop: 12 }}>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18, letterSpacing: 1, color: light ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)' }}>{s.k}</span>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: light ? '#fff' : DARK }}>{s.v}</span>
        </div>
      ))}
    </div>
  )
}

const scrimBottom = (h = 0.62): React.CSSProperties => ({ position: 'absolute', left: 0, bottom: 0, width: '100%', height: `${Math.round(h * 100)}%`, display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 100%)' })
const scrimTop = (): React.CSSProperties => ({ position: 'absolute', left: 0, top: 0, width: '100%', height: '28%', display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)' })

// ─── FEED 1080×1080 ───────────────────────────────────────────
function feedClasica(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', position: 'relative', background: DARK, fontFamily: FONT }}>
      {photoOrPlaceholder(c, { position: 'absolute', left: 0, top: 0, width: 1080, height: 1080 })}
      <div style={scrimTop()} />
      <div style={scrimBottom(0.7)} />
      <div style={{ position: 'absolute', top: 40, left: 40, width: 1000, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <DealerTag c={c} dark />
        {c.badge && <Badge text={c.badge} accent={c.accent} />}
      </div>
      <div style={{ position: 'absolute', left: 48, bottom: 48, width: 984, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 64, color: '#fff', lineHeight: 1.05, textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 30, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{subtitle(c)}</span>}
        <Chips specs={specsOf(c)} max={4} light />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: c.accent, borderRadius: 18, padding: '14px 30px' }}>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>PRECIO</span>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 50, color: '#fff' }}>{money(c.price, c.currency)}</span>
          </div>
          {c.phone && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: '#fff', marginLeft: 26 }}>{c.phone}</span>}
        </div>
      </div>
    </div>
  )
}

function feedFicha(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', flexDirection: 'column', background: DARK, fontFamily: FONT }}>
      <div style={{ position: 'relative', display: 'flex', width: 1080, height: 648 }}>
        {photoOrPlaceholder(c, { position: 'absolute', left: 0, top: 0, width: 1080, height: 648 })}
        <div style={scrimTop()} />
        <div style={{ position: 'absolute', top: 36, left: 40, width: 1000, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DealerTag c={c} dark />
          {c.badge && <Badge text={c.badge} accent={c.accent} />}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '34px 48px', background: `linear-gradient(135deg, ${DARK}, #131c2b)` }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 56, color: '#fff', lineHeight: 1.04 }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 26, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{subtitle(c)}</span>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <Chips specs={specsOf(c)} max={4} light />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 22, color: c.accent, letterSpacing: 1 }}>PRECIO</span>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 58, color: '#fff' }}>{money(c.price, c.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function feedOferta(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', position: 'relative', background: DARK, fontFamily: FONT }}>
      {photoOrPlaceholder(c, { position: 'absolute', left: 0, top: 0, width: 1080, height: 1080 })}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.2) 62%, rgba(0,0,0,0.85) 100%)' }} />
      <div style={{ position: 'absolute', top: 44, left: 48, width: 984, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DealerTag c={c} dark />
          <Badge text={c.badge || 'OFERTA'} accent={c.accent} />
        </div>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 60, color: '#fff', marginTop: 26, lineHeight: 1.04 }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 28, color: 'rgba(255,255,255,0.82)', marginTop: 4 }}>{subtitle(c)}</span>}
      </div>
      <div style={{ position: 'absolute', left: 48, bottom: 48, width: 984, display: 'flex', flexDirection: 'column' }}>
        <Chips specs={specsOf(c)} max={4} light />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: c.accent, borderRadius: 20, padding: '16px 36px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 22, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>TU PRECIO</span>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 60, color: '#fff' }}>{money(c.price, c.currency)}</span>
          </div>
          {c.phone && <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 30 }}><span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 22, color: 'rgba(255,255,255,0.75)' }}>LLÁMANOS</span><span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 36, color: '#fff' }}>{c.phone}</span></div>}
        </div>
      </div>
    </div>
  )
}

// ─── STORY 1080×1920 ──────────────────────────────────────────
function storyHistoria(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1920, display: 'flex', flexDirection: 'column', background: DARK, fontFamily: FONT }}>
      <div style={{ position: 'relative', display: 'flex', width: 1080, height: 1180 }}>
        {photoOrPlaceholder(c, { position: 'absolute', left: 0, top: 0, width: 1080, height: 1180 })}
        <div style={scrimTop()} />
        <div style={{ position: 'absolute', top: 60, left: 48, width: 984, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DealerTag c={c} dark />
          {c.badge && <Badge text={c.badge} accent={c.accent} />}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '48px 56px', background: `linear-gradient(180deg, #0b1220, ${DARK})` }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: '#fff', lineHeight: 1.04 }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: 'rgba(255,255,255,0.72)', marginTop: 8 }}>{subtitle(c)}</span>}
        <Chips specs={specsOf(c)} max={6} light />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 26, color: c.accent, letterSpacing: 1 }}>PRECIO</span>
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 76, color: '#fff' }}>{money(c.price, c.currency)}</span>
          <div style={{ display: 'flex', justifyContent: 'center', background: c.accent, borderRadius: 18, padding: '22px 0', marginTop: 24 }}>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 36, color: '#fff', letterSpacing: 1 }}>{c.phone ? `ESCRÍBENOS: ${c.phone}` : 'ENVÍANOS MENSAJE'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function storyCobertura(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1920, display: 'flex', position: 'relative', background: DARK, fontFamily: FONT }}>
      {photoOrPlaceholder(c, { position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 })}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.92) 100%)' }} />
      <div style={{ position: 'absolute', top: 64, left: 48, width: 984, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <DealerTag c={c} dark />
        {c.badge && <Badge text={c.badge} accent={c.accent} />}
      </div>
      <div style={{ position: 'absolute', left: 56, bottom: 90, width: 968, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 78, color: '#fff', lineHeight: 1.03, textShadow: '0 3px 16px rgba(0,0,0,0.55)' }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>{subtitle(c)}</span>}
        <Chips specs={specsOf(c)} max={4} light />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: c.accent, borderRadius: 20, padding: '18px 40px' }}>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 24, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>PRECIO</span>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 64, color: '#fff' }}>{money(c.price, c.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function storyEditorial(c: CarCreative): ReactElement {
  return (
    <div style={{ width: 1080, height: 1920, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'linear-gradient(160deg, #0f172a, #020617)', fontFamily: FONT, padding: 56 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 968, marginBottom: 30 }}>
        <DealerTag c={c} />
        {c.badge && <Badge text={c.badge} accent={c.accent} />}
      </div>
      <div style={{ display: 'flex', width: 968, height: 1020, borderRadius: 28, overflow: 'hidden', border: `6px solid ${c.accent}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        {photoOrPlaceholder(c, { width: 956, height: 1008 })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 968, marginTop: 34 }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: '#fff', textAlign: 'center', lineHeight: 1.05 }}>{c.title}</span>
        {subtitle(c) && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 32, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>{subtitle(c)}</span>}
        <div style={{ display: 'flex', justifyContent: 'center' }}><Chips specs={specsOf(c)} max={4} light /></div>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 82, color: c.accent, marginTop: 26 }}>{money(c.price, c.currency)}</span>
        {c.phone && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, color: '#fff', marginTop: 6 }}>{c.phone}</span>}
      </div>
    </div>
  )
}

const FEED: Record<FeedTemplate, (c: CarCreative) => ReactElement> = { clasica: feedClasica, ficha: feedFicha, oferta: feedOferta }
const STORY: Record<StoryTemplate, (c: CarCreative) => ReactElement> = { historia: storyHistoria, cobertura: storyCobertura, editorial: storyEditorial }

export function renderCreative(format: 'feed' | 'story', template: string, c: CarCreative): { element: ReactElement; width: number; height: number } {
  if (format === 'story') {
    const t = (STORY_TEMPLATES.includes(template as StoryTemplate) ? template : 'historia') as StoryTemplate
    return { element: STORY[t](c), width: 1080, height: 1920 }
  }
  const t = (FEED_TEMPLATES.includes(template as FeedTemplate) ? template : 'clasica') as FeedTemplate
  return { element: FEED[t](c), width: 1080, height: 1080 }
}

// ── TESTIMONIO / PRUEBA SOCIAL (F10, 2026-07-22) ──
// Creativo de reseña de cliente feliz. No depende de la foto de un auto:
// usa la marca del negocio (logo/nombre/color) + la cita + el autor.
export interface TestimonialInput { dealerName: string; logo?: string | null; accent?: string; quote: string; author: string; rating?: number }
export function testimonialCreative(t: TestimonialInput): { element: ReactElement; width: number; height: number } {
  const accent = t.accent || '#7c3aed'
  const rating = Math.max(1, Math.min(5, t.rating || 5))
  const element = (
    <div style={{ width: 1080, height: 1080, display: 'flex', flexDirection: 'column', background: DARK, fontFamily: FONT, padding: 72, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 10, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {t.logo
            ? <img src={t.logo} width={72} height={72} style={{ borderRadius: 999, objectFit: 'cover', marginRight: 18 }} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 999, background: accent, color: '#fff', fontSize: 34, fontWeight: 800, fontFamily: FONT, marginRight: 18 }}>{t.dealerName.slice(0, 1).toUpperCase()}</div>}
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 34, color: '#fff' }}>{t.dealerName}</span>
        </div>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 26, color: accent, letterSpacing: 2 }}>CLIENTE FELIZ</span>
      </div>
      <div style={{ display: 'flex', marginTop: 70 }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 160, color: accent, lineHeight: 0.8 }}>“</span>
      </div>
      <div style={{ display: 'flex', flex: 1 }}>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, color: '#fff', lineHeight: 1.25 }}>{t.quote.slice(0, 240)}</span>
      </div>
      <div style={{ display: 'flex', marginTop: 20 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ width: 46, height: 46, borderRadius: 10, marginRight: 12, background: i < rating ? '#f5b301' : 'rgba(255,255,255,0.15)', display: 'flex' }} />
        ))}
      </div>
      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 34, color: 'rgba(255,255,255,0.85)', marginTop: 26 }}>— {t.author}</span>
    </div>
  )
  return { element, width: 1080, height: 1080 }
}
