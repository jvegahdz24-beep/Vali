/* eslint-disable @next/next/no-img-element */
// ═══════════════════════════════════════════════════════════════
// OVERLAYS de video (PNG transparentes 1080×1920) que se montan SOBRE las
// fotos reales del auto. Cuatro estilos de anuncio (impacto, premium,
// dinamico, ficha) × cuatro momentos (hook, spec, price, cta) siguiendo la
// anatomía de los ads que convierten: hook <2s, un mensaje por toma, texto
// gigante en zona segura (centro 80%), precio protagonista y CTA claro.
// Sin emojis (Satori no los rasteriza); formas y color hacen el trabajo.
// ═══════════════════════════════════════════════════════════════

import type { ReactElement } from 'react'
import type { CarCreative } from './creative'
import { money } from './creative'

export const VIDEO_STYLES = ['impacto', 'premium', 'dinamico', 'ficha'] as const
export type VideoStyle = (typeof VIDEO_STYLES)[number]
export type OverlayKind = 'brand' | 'hook' | 'spec' | 'price' | 'cta'

export const isVideoStyle = (s: string): s is VideoStyle => (VIDEO_STYLES as readonly string[]).includes(s)

// ── Bancos de frases (variabilidad real entre corridas vía seed) ──
const HOOKS: Record<VideoStyle, string[]> = {
  impacto: ['¿BUSCAS AUTO?\nDETENTE AQUÍ', 'ESTA OPORTUNIDAD\nNO SE REPITE', 'LLEGÓ HOY…\nY VUELA MAÑANA', 'EL PRECIO QUE\nESTABAS ESPERANDO'],
  premium: [], // usa el nombre del auto
  dinamico: ['TU PRÓXIMO\nNIVEL', 'ESTRENA SIN\nPRETEXTOS', 'EL AUTO QUE\nMERECES', 'SUBE DE NIVEL\nHOY MISMO'],
  ficha: ['RECIÉN LLEGADO', 'DISPONIBLE AHORA', 'NUEVO INGRESO', 'UNIDAD SELECCIONADA'],
}
const FEATURES_CAR = ['CALIDAD VERIFICADA', 'LISTO PARA ESTRENAR', 'GARANTÍA DE AGENCIA', 'ÚNICO DUEÑO', 'IMPECABLE POR DENTRO Y FUERA', 'SERVICIOS AL DÍA']
const FEATURES_GENERIC = ['CALIDAD GARANTIZADA', 'ENTREGA INMEDIATA', 'DISPONIBLE HOY', 'ATENCIÓN PERSONALIZADA', 'HECHO PARA TI', 'PREGUNTA SIN COMPROMISO']
const CTA_LINES: Record<VideoStyle, { top: string; urgency: string }> = {
  impacto: { top: 'ESCRÍBENOS AHORA', urgency: 'Unidad disponible · No durará' },
  premium: { top: 'AGENDA TU PRUEBA DE MANEJO', urgency: 'Atención personalizada' },
  dinamico: { top: 'MÁNDANOS UN WHATS', urgency: 'Respuesta inmediata' },
  ficha: { top: 'PREGUNTA POR ESTA UNIDAD', urgency: 'Financiamiento disponible' },
}

export const pickFrom = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length]

// Valores que delatan que el item NO es un vehículo (ej. planes SaaS migrados
// con metadata de auto) — jamás mostrar "TRANSMISIÓN SaaS" en un anuncio.
const NON_CAR_VALUE = /saas|software|digital|licencia|plan|suscripci/i

/** Specs reales del auto como pares [label, value] — SOLO las que existen y tienen sentido. */
export function carSpecPairs(c: CarCreative): { label: string; value: string }[] {
  const pairs: { label: string; value: string }[] = []
  const add = (label: string, value?: string | null) => { if (value && !NON_CAR_VALUE.test(String(value))) pairs.push({ label, value: String(value) }) }
  add('AÑO', c.year)
  add('KILOMETRAJE', c.km)
  add('TRANSMISIÓN', c.transmision)
  add('MOTOR', c.combustible)
  add('CARROCERÍA', c.carroceria)
  add('CONDICIÓN', c.condicion)
  return pairs
}
/** ¿El item parece un AUTO (vs producto genérico)? Evita chips absurdas. */
export const looksLikeCar = (c: CarCreative): boolean => {
  const carBrandish = !!(c.brand || c.model)
  const nonCar = [c.transmision, c.combustible, c.category, c.title].some((v) => v && NON_CAR_VALUE.test(String(v)))
  return carBrandish && !nonCar ? true : carBrandish ? false : !!(c.year && c.km && !nonCar)
}

const W = 1080, H = 1920
const font = 'Montserrat'

// Contenedor raíz transparente
const Root = ({ children }: { children: React.ReactNode }): ReactElement => (
  <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: 'transparent', fontFamily: font, position: 'relative' }}>
    {children}
  </div>
)

// Scrim de legibilidad (gradiente transparente→oscuro)
const Scrim = ({ direction = 'bottom', strength = 0.85 }: { direction?: 'bottom' | 'top' | 'full'; strength?: number }): ReactElement => (
  <div style={{
    position: 'absolute', left: 0, right: 0,
    ...(direction === 'bottom' ? { bottom: 0, height: H * 0.55, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,${strength}))` } :
      direction === 'top' ? { top: 0, height: H * 0.4, backgroundImage: `linear-gradient(to top, rgba(0,0,0,0), rgba(0,0,0,${strength}))` } :
        { top: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${strength * 0.6})` }),
    display: 'flex',
  }} />
)

const DealerTag = ({ c, light = true }: { c: CarCreative; light?: boolean }): ReactElement => (
  <div style={{ position: 'absolute', top: 54, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, backgroundColor: light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '12px 28px' }}>
      {c.logo ? <img src={c.logo} width={44} height={44} style={{ borderRadius: 999 }} /> : <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 999, backgroundColor: c.accent }} />}
      <span style={{ fontSize: 30, fontWeight: 700, color: light ? '#fff' : '#111', letterSpacing: 1 }}>{c.dealerName}</span>
    </div>
  </div>
)

// ════════════════ ESTILO: IMPACTO (oferta agresiva) ════════════════
const ACC_IMPACT = { red: '#e11d2e', yellow: '#ffd400' }

function impactoHook(c: CarCreative, seed: number): ReactElement {
  const hook = pickFrom(HOOKS.impacto, seed)
  return (
    <Root>
      <Scrim direction="bottom" strength={0.9} />
      <DealerTag c={c} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
        <div style={{ display: 'flex', backgroundColor: ACC_IMPACT.red, transform: 'rotate(-3deg)', padding: '14px 38px', borderRadius: 14 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: 4 }}>ATENCIÓN</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {hook.split('\n').map((line, i) => (
            <span key={i} style={{ fontSize: 104, fontWeight: 800, color: i % 2 ? ACC_IMPACT.yellow : '#fff', lineHeight: 1.06, textShadow: '0 8px 0 rgba(0,0,0,0.45)', textAlign: 'center' }}>{line}</span>
          ))}
        </div>
        <span style={{ fontSize: 42, fontWeight: 700, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px 30px', borderRadius: 999 }}>{c.title}</span>
      </div>
    </Root>
  )
}

function impactoSpec(c: CarCreative, label: string, value: string): ReactElement {
  return (
    <Root>
      <Scrim direction="bottom" strength={0.85} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.17, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: ACC_IMPACT.yellow, letterSpacing: 8 }}>{label}</span>
        <span style={{ fontSize: 132, fontWeight: 800, color: '#fff', lineHeight: 1, textShadow: '0 10px 0 rgba(225,29,46,0.55)', textAlign: 'center' }}>{value}</span>
        <div style={{ display: 'flex', width: 240, height: 10, backgroundColor: ACC_IMPACT.red, borderRadius: 999 }} />
      </div>
    </Root>
  )
}

function impactoPrice(c: CarCreative): ReactElement {
  return (
    <Root>
      <Scrim direction="full" strength={1} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex', backgroundColor: '#fff', transform: 'rotate(-2deg)', padding: '12px 40px', borderRadius: 12 }}>
          <span style={{ fontSize: 46, fontWeight: 800, color: '#111', letterSpacing: 3 }}>LLÉVATELO POR</span>
        </div>
        <span style={{ fontSize: c.price != null && c.price >= 1000000 ? 126 : 152, fontWeight: 800, color: ACC_IMPACT.yellow, lineHeight: 1, textShadow: '0 12px 0 rgba(225,29,46,0.7)', textAlign: 'center' }}>
          {c.price != null ? `$${Number(c.price).toLocaleString('es-MX')}` : 'PRECIO ESPECIAL'}
        </span>
        {c.price != null && <span style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: 3, textAlign: 'center', maxWidth: 940 }}>{c.currency} · PREGUNTA POR FINANCIAMIENTO</span>}
        <div style={{ display: 'flex', backgroundColor: ACC_IMPACT.red, padding: '14px 42px', borderRadius: 999, marginTop: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>SOLO ESTA SEMANA</span>
        </div>
      </div>
    </Root>
  )
}

// ════════════════ ESTILO: PREMIUM (lujo sobrio) ════════════════
const GOLD = '#d4af37'

function premiumHook(c: CarCreative): ReactElement {
  const name = [c.brand, c.model].filter(Boolean).join(' ') || c.title
  return (
    <Root>
      <Scrim direction="bottom" strength={0.8} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', width: 120, height: 3, backgroundColor: GOLD }} />
        <span style={{ fontSize: 34, fontWeight: 400, color: GOLD, letterSpacing: 14 }}>PRESENTAMOS</span>
        <span style={{ fontSize: 96, fontWeight: 700, color: '#fff', letterSpacing: 6, textAlign: 'center', lineHeight: 1.08 }}>{name.toUpperCase()}</span>
        {c.year && <span style={{ fontSize: 44, fontWeight: 400, color: 'rgba(255,255,255,0.85)', letterSpacing: 10 }}>{c.year}{c.version ? ` · ${c.version.toUpperCase()}` : ''}</span>}
        <div style={{ display: 'flex', width: 120, height: 3, backgroundColor: GOLD }} />
      </div>
    </Root>
  )
}

function premiumSpec(_c: CarCreative, label: string, value: string, index = 0): ReactElement {
  return (
    <Root>
      <Scrim direction="bottom" strength={0.75} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ fontSize: 44, fontWeight: 400, color: 'rgba(212,175,55,0.85)', letterSpacing: 6 }}>{String(index + 1).padStart(2, '0')}</span>
        <div style={{ display: 'flex', width: 2, height: 130, backgroundColor: 'rgba(212,175,55,0.5)', marginTop: 14, marginLeft: 20 }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <span style={{ fontSize: 32, fontWeight: 400, color: GOLD, letterSpacing: 12 }}>{label}</span>
        <span style={{ fontSize: 108, fontWeight: 600, color: '#fff', letterSpacing: 3, textAlign: 'center', lineHeight: 1.05 }}>{value.toUpperCase()}</span>
        <div style={{ display: 'flex', width: 90, height: 2, backgroundColor: 'rgba(255,255,255,0.6)' }} />
      </div>
    </Root>
  )
}

function premiumPrice(c: CarCreative): ReactElement {
  const priceTxt = c.price != null ? `$${Number(c.price).toLocaleString('es-MX')}` : 'A CONSULTAR'
  const big = c.price != null && c.price >= 1000000 ? 96 : 112
  return (
    <Root>
      <Scrim direction="full" strength={0.95} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, border: `3px solid ${GOLD}`, borderRadius: 6, padding: '56px 64px', maxWidth: 920 }}>
          <span style={{ fontSize: 32, fontWeight: 400, color: GOLD, letterSpacing: 14 }}>INVERSIÓN</span>
          <span style={{ fontSize: big, fontWeight: 700, color: '#fff', lineHeight: 1, textAlign: 'center' }}>{priceTxt}</span>
          <span style={{ fontSize: 26, fontWeight: 400, color: 'rgba(255,255,255,0.8)', letterSpacing: 4, textAlign: 'center' }}>{c.price != null ? `${c.currency} · ` : ''}FINANCIAMIENTO A TU MEDIDA</span>
        </div>
      </div>
    </Root>
  )
}

// ════════════════ ESTILO: DINAMICO (lifestyle urbano) ════════════════
const GRAD_A = '#7c3aed', GRAD_B = '#06b6d4'

function dinamicoHook(c: CarCreative, seed: number): ReactElement {
  const hook = pickFrom(HOOKS.dinamico, seed)
  return (
    <Root>
      <Scrim direction="bottom" strength={0.85} />
      <DealerTag c={c} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', transform: 'rotate(-2deg)' }}>
          {hook.split('\n').map((line, i) => (
            <div key={i} style={{ display: 'flex', backgroundImage: `linear-gradient(90deg, ${GRAD_A}, ${GRAD_B})`, padding: '8px 34px', borderRadius: 16, marginTop: i ? 14 : 0, marginLeft: i * 46 }}>
              <span style={{ fontSize: 96, fontWeight: 800, color: '#fff', lineHeight: 1.08 }}>{line}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 42, fontWeight: 700, color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)', padding: '10px 32px', borderRadius: 999, marginTop: 8 }}>{c.title}</span>
      </div>
    </Root>
  )
}

function dinamicoSpec(_c: CarCreative, label: string, value: string, index = 0): ReactElement {
  return (
    <Root>
      <Scrim direction="bottom" strength={0.8} />
      <div style={{ position: 'absolute', top: 60, right: 50, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', width: 40, height: 4, backgroundImage: `linear-gradient(90deg, ${GRAD_A}, ${GRAD_B})`, borderRadius: 4 }} />
        <span style={{ fontSize: 40, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', backgroundImage: `linear-gradient(90deg, ${GRAD_A}, ${GRAD_B})`, padding: '10px 34px', borderRadius: 999 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: 6 }}>{label}</span>
        </div>
        <span style={{ fontSize: 120, fontWeight: 800, color: '#fff', lineHeight: 1.02, textAlign: 'center', textShadow: '0 8px 40px rgba(124,58,237,0.9)' }}>{value}</span>
      </div>
    </Root>
  )
}

function dinamicoPrice(c: CarCreative): ReactElement {
  return (
    <Root>
      <Scrim direction="full" strength={1} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <span style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: 8 }}>ESTRÉNALO POR</span>
        <div style={{ display: 'flex', backgroundImage: `linear-gradient(90deg, ${GRAD_A}, ${GRAD_B})`, transform: 'rotate(-2deg)', padding: '26px 60px', borderRadius: 28 }}>
          <span style={{ fontSize: c.price != null && c.price >= 1000000 ? 116 : 140, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {c.price != null ? `$${Number(c.price).toLocaleString('es-MX')}` : 'PRECIO A TU MEDIDA'}
          </span>
        </div>
        {c.price != null && <span style={{ fontSize: 38, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: 4 }}>{c.currency} · FINANCIAMIENTO DISPONIBLE</span>}
      </div>
    </Root>
  )
}

// ════════════════ ESTILO: FICHA (informativo limpio) ════════════════
function fichaHook(c: CarCreative, seed: number): ReactElement {
  const tag = pickFrom(HOOKS.ficha, seed)
  return (
    <Root>
      <Scrim direction="bottom" strength={0.88} />
      <DealerTag c={c} light={false} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.15, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', backgroundColor: c.accent, padding: '12px 36px', borderRadius: 10 }}>
          <span style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: 5 }}>{tag}</span>
        </div>
        <span style={{ fontSize: 92, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.06 }}>{c.title}</span>
        {(c.year || c.km) && (
          <span style={{ fontSize: 40, fontWeight: 600, color: 'rgba(255,255,255,0.92)', letterSpacing: 2 }}>
            {[c.year, c.km, c.transmision].filter(Boolean).join('  ·  ')}
          </span>
        )}
      </div>
    </Root>
  )
}

function fichaSpec(c: CarCreative, label: string, value: string): ReactElement {
  return (
    <Root>
      <Scrim direction="bottom" strength={0.82} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.18, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 26, padding: '38px 70px', borderBottom: `14px solid ${c.accent}` }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: '#666', letterSpacing: 8 }}>{label}</span>
          <span style={{ fontSize: 104, fontWeight: 800, color: '#111', lineHeight: 1 }}>{value}</span>
        </div>
      </div>
    </Root>
  )
}

function fichaPrice(c: CarCreative): ReactElement {
  return (
    <Root>
      <Scrim direction="full" strength={0.92} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 30, padding: '64px 92px', borderTop: `16px solid ${c.accent}` }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#555', letterSpacing: 8 }}>PRECIO</span>
          <span style={{ fontSize: 126, fontWeight: 800, color: c.accent, lineHeight: 1 }}>{c.price != null ? `$${Number(c.price).toLocaleString('es-MX')}` : 'A CONSULTAR'}</span>
          {c.price != null && <span style={{ fontSize: 34, fontWeight: 600, color: '#333', letterSpacing: 3 }}>{c.currency} · Financiamiento disponible</span>}
          {c.ubicacion && <span style={{ fontSize: 30, fontWeight: 600, color: '#777' }}>{c.ubicacion}</span>}
        </div>
      </div>
    </Root>
  )
}

// ════════════════ BRAND (intro de marca 0.8s — fondo SÓLIDO, abre el video) ════════════════
function brandOverlay(c: CarCreative, style: VideoStyle): ReactElement {
  const accent = style === 'impacto' ? ACC_IMPACT.red : style === 'premium' ? GOLD : style === 'dinamico' ? GRAD_A : c.accent
  const bg = style === 'premium' ? '#050505' : '#0a0a0c'
  return (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: bg, fontFamily: font, gap: 30 }}>
      {c.logo
        ? <img src={c.logo} width={190} height={190} style={{ borderRadius: 999 }} />
        : <div style={{ display: 'flex', width: 190, height: 190, borderRadius: 999, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 88, fontWeight: 800, color: '#fff' }}>{c.dealerName.slice(0, 1).toUpperCase()}</span>
          </div>}
      <span style={{ fontSize: 58, fontWeight: style === 'premium' ? 400 : 800, color: '#fff', letterSpacing: style === 'premium' ? 10 : 2, textAlign: 'center', maxWidth: 940 }}>
        {style === 'premium' ? c.dealerName.toUpperCase() : c.dealerName}
      </span>
      {style === 'dinamico'
        ? <div style={{ display: 'flex', width: 170, height: 8, backgroundImage: `linear-gradient(90deg, ${GRAD_A}, ${GRAD_B})`, borderRadius: 8 }} />
        : <div style={{ display: 'flex', width: 170, height: style === 'premium' ? 3 : 8, backgroundColor: accent, borderRadius: 8 }} />}
      <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: 12 }}>PRESENTA</span>
    </div>
  )
}

// ════════════════ CTA (compartido con acento por estilo) ════════════════
function ctaOverlay(c: CarCreative, style: VideoStyle): ReactElement {
  const lines = CTA_LINES[style]
  const btn = style === 'impacto' ? ACC_IMPACT.red : style === 'premium' ? GOLD : style === 'dinamico' ? GRAD_A : c.accent
  const phone = (c.phone || '').replace(/\D/g, '')
  return (
    <Root>
      <Scrim direction="full" strength={1} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        {c.logo ? <img src={c.logo} width={130} height={130} style={{ borderRadius: 999 }} /> : null}
        <span style={{ fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: 6 }}>{c.dealerName.toUpperCase()}</span>
        <span style={{ fontSize: style === 'premium' ? 62 : 74, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.12, maxWidth: 930 }}>{lines.top}</span>
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, backgroundColor: '#22c55e', borderRadius: 999, padding: '24px 54px' }}>
            <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 999, backgroundColor: '#fff' }} />
            <span style={{ fontSize: 56, fontWeight: 800, color: '#fff' }}>{phone}</span>
          </div>
        )}
        <div style={{ display: 'flex', backgroundColor: btn === GOLD ? 'transparent' : btn, border: btn === GOLD ? `3px solid ${GOLD}` : 'none', padding: '14px 40px', borderRadius: 999 }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: btn === GOLD ? GOLD : '#fff', letterSpacing: 3 }}>{lines.urgency.toUpperCase()}</span>
        </div>
        <span style={{ fontSize: 38, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{c.title}{c.price != null ? ` · ${money(c.price, c.currency)}` : ''}</span>
      </div>
    </Root>
  )
}

// ════════════════ API ════════════════
export interface OverlaySpecText { label: string; value: string }

/** Texto de la toma i (specs reales del auto o frases de venta). */
export function specForShot(c: CarCreative, i: number, seed: number): OverlaySpecText {
  const isCar = looksLikeCar(c)
  const pairs = carSpecPairs(c)
  if (isCar && pairs.length) return pairs[(seed + i) % pairs.length]
  const bank = isCar ? FEATURES_CAR : FEATURES_GENERIC
  const f = bank[(seed + i) % bank.length]
  return { label: (c.category && !NON_CAR_VALUE.test(c.category) ? c.category.toUpperCase() : 'DESTACADO'), value: f }
}

export function renderVideoOverlay(kind: OverlayKind, style: VideoStyle, c: CarCreative, opts: { seed?: number; spec?: OverlaySpecText; index?: number } = {}): { element: ReactElement; width: number; height: number } {
  const seed = opts.seed ?? 0
  const index = opts.index ?? 0
  const spec = opts.spec || specForShot(c, 0, seed)
  let element: ReactElement
  if (kind === 'brand') element = brandOverlay(c, style)
  else if (kind === 'cta') element = ctaOverlay(c, style)
  else if (style === 'impacto') element = kind === 'hook' ? impactoHook(c, seed) : kind === 'spec' ? impactoSpec(c, spec.label, spec.value) : impactoPrice(c)
  else if (style === 'premium') element = kind === 'hook' ? premiumHook(c) : kind === 'spec' ? premiumSpec(c, spec.label, spec.value, index) : premiumPrice(c)
  else if (style === 'dinamico') element = kind === 'hook' ? dinamicoHook(c, seed) : kind === 'spec' ? dinamicoSpec(c, spec.label, spec.value, index) : dinamicoPrice(c)
  else element = kind === 'hook' ? fichaHook(c, seed) : kind === 'spec' ? fichaSpec(c, spec.label, spec.value) : fichaPrice(c)
  return { element, width: W, height: H }
}
