// ═══════════════════════════════════════════════════════════════
// Generación de VIDEO comercial (reel 1080×1920) para un auto — v2.
// Anatomía de anuncio que convierte: HOOK (<2s) → 1 mensaje por toma
// (specs sobre FOTOS REALES a pantalla completa con Ken Burns variado) →
// PRECIO protagonista → CTA con WhatsApp. Cuatro estilos (impacto,
// premium, dinamico, ficha) con ritmo, música, transiciones y narración
// propios para que ningún video se sienta igual a otro.
// Fallback: sin fotos reales usa las tarjetas (motor v1). FFmpeg estático.
// ═══════════════════════════════════════════════════════════════

import ffmpegStatic from 'ffmpeg-static'
import { spawn } from 'child_process'
import { writeFile, mkdir, rm, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'
import { db } from '@/lib/db'
import { musicPath } from './music'
import { synthesize, ttsAvailable } from './tts'
import { buildCarCreative, absoluteUrl, type CarCreative } from './creative'
import { VIDEO_STYLES, isVideoStyle, specForShot, type VideoStyle } from './video-overlays'

const W = 1080, H = 1920, FPS = 30

function ffmpegBin(): string {
  const fromPkg = (ffmpegStatic as unknown as string) || ''
  if (fromPkg && !fromPkg.includes('ROOT') && existsSync(fromPkg)) return fromPkg
  const guess = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (existsSync(guess)) return guess
  return fromPkg || 'ffmpeg'
}

function ff(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), args)
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-500)}`)))
  })
}

// Duración (segundos) de un archivo de audio, leída del stderr de ffmpeg.
// Se usa para ENCADENAR las frases de narración y que NUNCA se sobrepongan
// (bug 2026-07-22: dos voces hablaban a la vez cuando una frase duraba más
// que su toma). Devuelve 0 si no se puede medir.
function audioDur(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegBin(), ['-i', file])
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', () => resolve(0))
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0)
    })
  })
}

export interface ReelOpts {
  workspaceId: string
  carId: string
  base: string
  estilo?: string // impacto | premium | dinamico | ficha | aleatorio (default)
  scenes?: string[] // (legacy tarjetas) se respeta si el item no tiene fotos
  perScene?: number
  transition?: string
  kenBurns?: 'in' | 'out' | 'alternate' | 'none'
  music?: string | null
  musicVolume?: number
  accent?: string
  watermark?: boolean
  narrationText?: string
  voiceId?: string
  voiceSpeed?: number
  /** Genera el guión INTERNAMENTE con la duración real del video (tono por estilo). */
  autoNarration?: boolean
  fileName?: string
}

export interface ReelResult { url: string; file: string; durationSec: number; hasVoice: boolean; hasMusic: boolean; style?: string; shots?: number }

// ── Parámetros de ritmo/look por estilo (lo que hace que se SIENTA distinto) ──
// grade = color grading cinematográfico (contraste + saturación + balance
// teal&orange en sombras/altas, el look estándar de los comerciales de autos)
// + unsharp para que el coche "reviente" + viñeta para foco.
const STYLE_CFG: Record<VideoStyle, {
  hookScene: number; specScenes: number[]; priceScene: number; ctaScene: number
  transDur: number; transitions: string[]
  music: string; tone: string; voice: string; emotion: 'happy' | 'neutral' | 'surprised'; voiceSpeed: number
  grade: string
  sfx: 'full' | 'soft'
}> = {
  impacto: {
    hookScene: 2.1, specScenes: [1.35, 1.1, 1.35], priceScene: 2.5, ctaScene: 2.7,
    transDur: 0.24, transitions: ['fadewhite', 'slideleft', 'fadewhite', 'wiperight'],
    music: 'urbana.mp3', tone: 'urgente', voice: 'Spanish_ConfidentWoman', emotion: 'happy', voiceSpeed: 1.06,
    grade: 'unsharp=5:5:0.7,eq=contrast=1.13:saturation=1.30:brightness=0.012,colorbalance=bs=0.10:bh=-0.06:rh=0.04,vignette=PI/4.4',
    sfx: 'full',
  },
  premium: {
    hookScene: 3.0, specScenes: [2.4, 2.0, 2.4], priceScene: 3.0, ctaScene: 3.0,
    transDur: 0.55, transitions: ['fadeblack', 'dissolve', 'fade'],
    music: 'lujo.mp3', tone: 'lujo', voice: 'Spanish_SensibleManager', emotion: 'neutral', voiceSpeed: 0.97,
    grade: 'unsharp=5:5:0.55,eq=contrast=1.15:saturation=0.88:brightness=-0.004,colorbalance=bs=0.12:bm=0.02:bh=-0.08:rh=0.03,vignette=PI/4.1',
    sfx: 'soft',
  },
  dinamico: {
    hookScene: 2.3, specScenes: [1.5, 1.2, 1.5], priceScene: 2.6, ctaScene: 2.7,
    transDur: 0.3, transitions: ['fadewhite', 'smoothup', 'circleopen'],
    music: 'urbana.mp3', tone: 'energico', voice: 'Spanish_ConfidentWoman', emotion: 'happy', voiceSpeed: 1.04,
    grade: 'unsharp=5:5:0.65,eq=contrast=1.10:saturation=1.36,colorbalance=bs=0.14:bh=-0.05:rh=0.05,vignette=PI/4.3',
    sfx: 'full',
  },
  ficha: {
    hookScene: 2.5, specScenes: [1.9, 1.6, 1.9], priceScene: 2.6, ctaScene: 2.8,
    transDur: 0.38, transitions: ['fade', 'smoothup'],
    music: 'energica.mp3', tone: 'profesional', voice: 'Spanish_ConfidentWoman', emotion: 'neutral', voiceSpeed: 1,
    grade: 'unsharp=5:5:0.5,eq=contrast=1.07:saturation=1.12,vignette=PI/4.8',
    sfx: 'soft',
  },
}

// ── Guión comercial SINCRONIZADO: una frase por momento del video, dicha
// exactamente cuando su toma entra en pantalla (menciona las MISMAS specs
// que se ven). Plantillas de locutor comercial con variación por seed. ──
function priceSpoken(price: number | null | undefined): string {
  if (price == null) return ''
  if (price >= 1000 && price % 1000 === 0) {
    const miles = price / 1000
    return miles >= 1000 ? `${(miles / 1000).toLocaleString('es-MX')} millones ${miles % 1000 ? `${miles % 1000} mil ` : ''}de pesos` : `${miles} mil pesos`
  }
  return `${price.toLocaleString('es-MX')} pesos`
}

function syncedScript(c: CarCreative, style: VideoStyle, seed: number, specs: { label: string; value: string }[]): { hook: string; specs: string; price: string; cta: string } {
  const nombre = [c.brand, c.model].filter(Boolean).join(' ') || c.title.replace(/DemoVid\s*/i, '')
  const s1 = specs[0]?.value || '', s2 = specs[1]?.value || ''
  const dos = s1 && s2 ? `${s1.toLowerCase()} y ${s2.toLowerCase()}` : (s1 || s2).toLowerCase()
  const precio = priceSpoken(c.price)
  const pick = <T,>(arr: T[]): T => arr[Math.abs(seed) % arr.length]
  const T: Record<VideoStyle, { hook: string[]; specs: string[]; price: string[]; cta: string[] }> = {
    impacto: {
      hook: [`¡Atención! Este ${nombre} acaba de llegar.`, `¡Detente! Tienes que ver este ${nombre}.`],
      specs: dos ? [`Con ${dos}. Listo para ti.`, `${dos[0].toUpperCase()}${dos.slice(1)}. Impecable.`] : ['Equipado y listo para estrenar.'],
      price: precio ? [`Llévatelo por solo ${precio}.`, `Hoy, por ${precio}.`] : ['Pregunta por el precio especial de esta semana.'],
      cta: [`Escríbenos ahora. No va a durar.`, `Mándanos mensaje hoy mismo. Vuela.`],
    },
    premium: {
      hook: [`Presentamos: ${nombre}.`, `Conoce el ${nombre}.`],
      specs: dos ? [`${dos[0].toUpperCase()}${dos.slice(1)}. Una pieza excepcional.`] : ['Elegancia en cada detalle.'],
      price: precio ? [`Una inversión de ${precio}.`] : ['Inversión a su medida.'],
      cta: [`Agenda tu prueba de manejo. Te esperamos.`],
    },
    dinamico: {
      hook: [`¿Listo para subir de nivel? Este es el ${nombre}.`, `Tu próximo nivel se llama ${nombre}.`],
      specs: dos ? [`${dos[0].toUpperCase()}${dos.slice(1)}. Nada le falta.`, `Trae ${dos}. Puro nivel.`] : ['Viene completo. Nada le falta.'],
      price: precio ? [`Estrénalo por ${precio}.`, `Es tuyo por ${precio}.`] : ['El precio te va a sorprender.'],
      cta: [`Mándanos un WhatsApp y arreglamos todo.`, `Escríbenos y estrénalo esta semana.`],
    },
    ficha: {
      hook: [`Recién llegado: ${nombre}.`, `Disponible ahora: ${nombre}.`],
      specs: dos ? [`Cuenta con ${dos}.`] : ['Unidad verificada y lista.'],
      price: precio ? [`Precio: ${precio}, con financiamiento disponible.`] : ['Precio a consultar, con financiamiento disponible.'],
      cta: [`Pregunta por esta unidad. Con gusto te atendemos.`],
    },
  }
  const t = T[style]
  return { hook: pick(t.hook), specs: pick(t.specs), price: pick(t.price), cta: pick(t.cta) }
}

// ── SFX sintetizados con ffmpeg (whoosh en cortes, impacto grave en el precio) ──
async function makeSfx(tmp: string): Promise<{ whoosh: string; impact: string }> {
  const whoosh = path.join(tmp, 'whoosh.wav')
  const impact = path.join(tmp, 'impact.wav')
  await ff(['-y', '-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=pink:a=0.9',
    '-af', 'highpass=f=250,lowpass=f=3800,afade=t=in:st=0:d=0.22,afade=t=out:st=0.24:d=0.26,volume=1.1', whoosh])
  await ff(['-y', '-f', 'lavfi', '-i', 'sine=frequency=52:duration=0.9', '-f', 'lavfi', '-i', 'anoisesrc=d=0.09:c=brown:a=1',
    '-filter_complex', '[0:a]afade=t=out:st=0.08:d=0.8,volume=2.6[s];[1:a]afade=t=out:st=0:d=0.09,volume=1.4[n];[s][n]amix=inputs=2:normalize=0,alimiter=limit=0.9', impact])
  return { whoosh, impact }
}

// Ken Burns variado por toma: el hook entra con "punch" y el resto alterna.
function kenBurnsExpr(variant: number, frames: number): { z: string; x: string; y: string } {
  const cx = 'iw/2-(iw/zoom/2)', cy = 'ih/2-(ih/zoom/2)'
  switch (variant % 5) {
    case 0: return { z: 'max(1.06,1.30-0.024*on)', x: cx, y: cy } // punch-in (hook)
    case 1: return { z: 'min(1.04+0.0022*on,1.26)', x: cx, y: cy } // zoom in
    case 2: return { z: 'max(1.04,1.26-0.0022*on)', x: cx, y: cy } // zoom out
    case 3: return { z: '1.17', x: `(iw-iw/zoom)*on/${frames}`, y: cy } // pan →
    default: return { z: '1.17', x: `(iw-iw/zoom)*(1-on/${frames})`, y: cy } // pan ←
  }
}

/** Fotos reales del item (URLs absolutas), hasta `max`. */
function itemPhotos(item: { imageUrl?: string | null; metadata?: string | null }, base: string, max = 6): string[] {
  let m: Record<string, unknown> = {}
  try { m = JSON.parse(item.metadata || '{}') } catch { /* */ }
  const arr = Array.isArray(m.images) ? (m.images as string[]) : []
  const all = [...arr, ...(item.imageUrl ? [item.imageUrl] : [])]
  const urls = all.map((u) => absoluteUrl(u, base)).filter((u): u is string => !!u)
  return [...new Set(urls)].slice(0, max)
}

export async function buildCarReel(opts: ReelOpts): Promise<ReelResult> {
  const { workspaceId, carId } = opts
  const localBase = `http://127.0.0.1:${process.env.PORT || 3105}`
  const tmp = path.join(os.tmpdir(), `reel-${carId}-${Date.now()}`)
  await mkdir(tmp, { recursive: true })

  try {
    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) throw new Error('Auto o workspace no encontrado')
    const creative = buildCarCreative(item, ws, localBase)
    const photos = itemPhotos(item, localBase)

    // Estilo: explícito o aleatorio real (varía entre corridas)
    const style: VideoStyle = isVideoStyle(String(opts.estilo || '')) ? (opts.estilo as VideoStyle)
      : VIDEO_STYLES[Math.floor(Math.random() * VIDEO_STYLES.length)]
    const cfg = STYLE_CFG[style]
    const seed = Math.floor(Math.random() * 1000)

    // ── Sin fotos reales → motor v1 (tarjetas) para no romper nada ──
    if (!photos.length) return await buildCardReel(opts, tmp)

    // ── Plan de tomas: INTRO de marca → hook → specs → precio → CTA ──
    const nSpecs = Math.max(1, Math.min(3, photos.length - 1))
    const shots: { kind: 'brand' | 'hook' | 'spec' | 'price' | 'cta'; photo: string; i: number }[] = [
      { kind: 'brand', photo: '', i: 0 },
      { kind: 'hook', photo: photos[0], i: 0 },
      ...Array.from({ length: nSpecs }, (_, k) => ({ kind: 'spec' as const, photo: photos[(k + 1) % photos.length], i: k })),
      { kind: 'price', photo: photos[photos.length >= 3 ? photos.length - 1 : 0], i: 0 },
      { kind: 'cta', photo: photos[Math.min(1, photos.length - 1)], i: 0 },
    ]

    // ── Descargar fotos y overlays ──
    const dl = async (url: string, out: string) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`No pude descargar ${url} (${r.status})`)
      await writeFile(out, Buffer.from(await r.arrayBuffer()))
    }
    const photoFiles = new Map<string, string>()
    for (const [idx, u] of [...new Set(shots.map((s) => s.photo).filter(Boolean))].entries()) {
      const f = path.join(tmp, `photo${idx}.img`)
      await dl(u, f)
      photoFiles.set(u, f)
    }
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i]
      const url = `${localBase}/api/marketing/render-overlay?workspaceId=${workspaceId}&carId=${carId}&kind=${s.kind}&estilo=${style}&seed=${seed}&i=${s.i}`
      await dl(url, path.join(tmp, `ov${i}.png`))
    }

    // ── Clip por toma: foto cover + Ken Burns + GRADING cinematográfico +
    //    overlay que entra deslizándose (slide-up + fade) ──
    const clips: string[] = []
    const durs: number[] = []
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i]
      const dur = s.kind === 'brand' ? 0.85
        : s.kind === 'hook' ? cfg.hookScene
        : s.kind === 'cta' ? cfg.ctaScene
        : s.kind === 'price' ? cfg.priceScene
        : cfg.specScenes[s.i % cfg.specScenes.length]
      const frames = Math.round(dur * FPS)
      const out = path.join(tmp, `c${i}.mp4`)

      // Intro de marca: el PNG del overlay ES el fondo (sólido) con zoom sutil
      if (s.kind === 'brand') {
        await ff([
          '-y', '-loop', '1', '-i', path.join(tmp, `ov${i}.png`),
          '-vf', `scale=${W * 2}:${H * 2},zoompan=z='min(1.02+0.0018*on,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.18,format=yuv420p,setsar=1`,
          '-t', dur.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', out,
        ])
        clips.push(out); durs.push(dur); continue
      }

      // hook = punch (+micro-vibración handheld en estilos enérgicos)
      const kb = kenBurnsExpr(s.kind === 'hook' ? 0 : 1 + ((i + seed) % 4), frames)
      const jitter = s.kind === 'hook' && cfg.sfx === 'full' ? `(${kb.x})+2.5*sin(on/1.5)` : kb.x
      await ff([
        '-y',
        '-loop', '1', '-i', photoFiles.get(s.photo)!,
        '-loop', '1', '-i', path.join(tmp, `ov${i}.png`),
        '-filter_complex',
        `[0:v]scale=${Math.round(W * 1.35)}:${Math.round(H * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.35)}:${Math.round(H * 1.35)},` +
        `zoompan=z='${kb.z}':d=${frames}:x='${jitter}':y='${kb.y}':s=${W}x${H}:fps=${FPS},${cfg.grade}[bg];` +
        `[1:v]format=argb,fade=t=in:st=0.10:d=0.30:alpha=1[ov];` +
        `[bg][ov]overlay=x=0:y='70*max(0,1-t/0.45)':format=auto,format=yuv420p,setsar=1[v]`,
        '-map', '[v]', '-t', dur.toFixed(2),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', out,
      ])
      clips.push(out)
      durs.push(dur)
    }

    // ── Concat con transiciones del estilo + barra de progreso tipo reel ──
    const D = cfg.transDur
    const totalDur = durs.reduce((a, b) => a + b, 0) - (clips.length - 1) * D
    const sfxTimes: { whooshAt: number[]; impactAt: number } = { whooshAt: [], impactAt: 0 }
    const silentOut = path.join(tmp, 'silent.mp4')
    {
      const inputs = clips.flatMap((c) => ['-i', c])
      const barIdx = clips.length
      let prev = '0:v', filter = ''
      let offset = 0
      const priceIdx = shots.findIndex((s) => s.kind === 'price')
      for (let k = 1; k < clips.length; k++) {
        offset += durs[k - 1] - D
        const tr = cfg.transitions[(k - 1 + seed) % cfg.transitions.length]
        filter += `[${prev}][${k}:v]xfade=transition=${tr}:duration=${D}:offset=${offset.toFixed(2)}[x${k}];`
        prev = `x${k}`
        sfxTimes.whooshAt.push(Math.max(0, offset - 0.16))
        if (k === priceIdx) sfxTimes.impactAt = offset + D * 0.4
      }
      // barra de progreso (arriba, estilo stories) que recorre todo el video
      filter += `[${prev}][${barIdx}:v]overlay=x='-${W}+${W}*t/${totalDur.toFixed(2)}':y=14:shortest=1[vout]`
      await ff([
        '-y', ...inputs,
        '-f', 'lavfi', '-t', totalDur.toFixed(2), '-i', `color=c=white@0.85:s=${W}x7:r=${FPS}`,
        '-filter_complex', filter, '-map', '[vout]',
        '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', silentOut,
      ])
    }

    // ── Narración SINCRONIZADA: 4 frases (hook/specs/precio/CTA), cada una
    // sintetizada por separado y colocada EXACTAMENTE cuando entra su toma.
    // El guión menciona las mismas specs que se ven en pantalla. ──
    const startOf = (shotIdx: number) => Math.max(0, durs.slice(0, shotIdx).reduce((a, b) => a + b, 0) - shotIdx * D)
    const voices: { file: string; at: number }[] = []
    let hasVoice = false
    if (opts.narrationText?.trim() && ttsAvailable()) {
      // Texto libre del usuario: una sola pista desde el hook
      try {
        const f = path.join(tmp, 'voice.mp3')
        await synthesize(opts.narrationText.trim(), opts.voiceId || cfg.voice, opts.voiceSpeed ?? cfg.voiceSpeed, f, cfg.emotion)
        voices.push({ file: f, at: startOf(1) + 0.2 }); hasVoice = true
      } catch { /* sin voz */ }
    } else if (opts.autoNarration && ttsAvailable()) {
      const specShots = shots.filter((s) => s.kind === 'spec')
      const specTexts = specShots.map((s) => specForShot(creative, s.i, seed))
      const lines = syncedScript(creative, style, seed, specTexts)
      const hookIdx = shots.findIndex((s) => s.kind === 'hook')
      const firstSpecIdx = shots.findIndex((s) => s.kind === 'spec')
      const priceIdx2 = shots.findIndex((s) => s.kind === 'price')
      const ctaIdx = shots.findIndex((s) => s.kind === 'cta')
      const plan: { text: string; at: number }[] = [
        { text: lines.hook, at: startOf(hookIdx) + 0.25 },
        { text: lines.specs, at: startOf(firstSpecIdx) + 0.15 },
        { text: lines.price, at: startOf(priceIdx2) + 0.25 },
        { text: lines.cta, at: startOf(ctaIdx) + 0.15 },
      ]
      // ANTI-TRASLAPE: cada frase arranca en el tiempo de su toma, PERO si la
      // anterior aún no termina, se pospone hasta que acabe (+0.12s de respiro).
      // Sin esto, dos voces se encimaban cuando una frase duraba más que su toma.
      let prevEnd = 0
      for (let k = 0; k < plan.length; k++) {
        try {
          const f = path.join(tmp, `voice${k}.mp3`)
          await synthesize(plan[k].text, opts.voiceId || cfg.voice, opts.voiceSpeed ?? cfg.voiceSpeed, f, cfg.emotion)
          const at = Math.max(plan[k].at, prevEnd)
          const dur = await audioDur(f)
          const overlap = plan[k].at < prevEnd
          console.log(`[Video:Narración] frase ${k} deseada@${plan[k].at.toFixed(2)}s → real@${at.toFixed(2)}s dur=${dur.toFixed(2)}s${overlap ? ' (pospuesta para NO encimar)' : ''}`)
          prevEnd = at + (dur > 0 ? dur : 2.5) + 0.12
          voices.push({ file: f, at }); hasVoice = true
        } catch { /* segmento sin voz */ }
      }
    }

    // ── SFX (whoosh en cortes + impacto grave al revelar el precio) ──
    let sfx: { whoosh: string; impact: string } | null = null
    try { sfx = await makeSfx(tmp) } catch { sfx = null }
    const sfxPlan = sfx ? {
      whoosh: sfx.whoosh, impact: sfx.impact,
      whooshAt: cfg.sfx === 'full' ? sfxTimes.whooshAt : sfxTimes.whooshAt.slice(0, 2),
      impactAt: sfxTimes.impactAt,
      gain: cfg.sfx === 'full' ? 0.45 : 0.28, // sutiles: se sienten SIN tapar la música
    } : null

    // ── Audio final (música fade-in + voz sincronizada + SFX) ──
    const outDir = path.join(process.cwd(), 'public', 'marketing', 'videos')
    await mkdir(outDir, { recursive: true })
    const fileName = opts.fileName || `${carId}-${Date.now()}.mp4`
    const finalOut = path.join(outDir, fileName)
    const music = musicPath(opts.music === undefined ? cfg.music : opts.music)
    const mVol = Math.max(0, Math.min(1, opts.musicVolume ?? 0.45))
    await muxAudio(silentOut, finalOut, totalDur, music, mVol, voices, sfxPlan)

    return { url: `/api/marketing/media/${fileName}`, file: finalOut, durationSec: Math.round(totalDur), hasVoice, hasMusic: !!music, style, shots: shots.length }
  } finally {
    rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

interface SfxPlan { whoosh: string; impact: string; whooshAt: number[]; impactAt: number; gain: number }

async function muxAudio(silentIn: string, finalOut: string, totalDur: number, music: string | null, mVol: number, voices: { file: string; at: number }[], sfxPlan?: SfxPlan | null): Promise<void> {
  const FAST = ['-movflags', '+faststart'] // reproduce al instante en web/WhatsApp
  const fadeOut = `afade=t=out:st=${Math.max(0, totalDur - 0.8).toFixed(2)}:d=0.8`

  const inputs: string[] = ['-i', silentIn]
  let idx = 1
  let chain = ''

  // Voz = N segmentos colocados en su tiempo exacto (adelay) y unidos en [voiceAll]
  let voiceAll = ''
  if (voices.length) {
    const labels: string[] = []
    for (let k = 0; k < voices.length; k++) {
      inputs.push('-i', voices[k].file)
      const ms = Math.round(Math.max(0, voices[k].at) * 1000)
      chain += `[${idx}:a]adelay=${ms}|${ms},volume=1.5[sv${k}];`
      labels.push(`[sv${k}]`); idx += 1
    }
    if (labels.length > 1) { chain += `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[voiceAll];`; voiceAll = '[voiceAll]' }
    else voiceAll = labels[0]
  }

  // Bed: música con fade-in; si hay voz, ducking SUAVE (la música respira sin
  // desaparecer). OJO: sidechaincompress solo emite la música — la voz se
  // mezcla aparte con asplit (antes la voz nunca llegaba al mix: bug histórico).
  let hasBed = false
  if (music && voiceAll) {
    inputs.push('-stream_loop', '-1', '-i', music)
    chain += `[${idx}:a]volume=${mVol},afade=t=in:st=0:d=0.6[mu];` +
      `${voiceAll}asplit=2[voKey][voMix];` +
      `[mu][voKey]sidechaincompress=threshold=0.06:ratio=4:attack=20:release=500[duck];` +
      `[duck][voMix]amix=inputs=2:duration=first:normalize=0[bed];`
    idx += 1; hasBed = true
  } else if (voiceAll) {
    chain += `${voiceAll}anull[bed];`
    hasBed = true
  } else if (music) {
    inputs.push('-stream_loop', '-1', '-i', music)
    chain += `[${idx}:a]volume=${mVol},afade=t=in:st=0:d=0.6[bed];`
    idx += 1; hasBed = true
  }

  // SFX en el timeline — volúmenes bajos: acompañan, NO disparan el limitador
  // (el "bajón" de música en los cortes venía del loudnorm dinámico: eliminado).
  const sfxLabels: string[] = []
  if (sfxPlan) {
    for (let k = 0; k < sfxPlan.whooshAt.length; k++) {
      inputs.push('-i', sfxPlan.whoosh)
      const ms = Math.round(sfxPlan.whooshAt[k] * 1000)
      chain += `[${idx}:a]adelay=${ms}|${ms},volume=${sfxPlan.gain}[w${k}];`
      sfxLabels.push(`[w${k}]`); idx += 1
    }
    if (sfxPlan.impactAt > 0) {
      inputs.push('-i', sfxPlan.impact)
      const ms = Math.round(sfxPlan.impactAt * 1000)
      chain += `[${idx}:a]adelay=${ms}|${ms},volume=${(sfxPlan.gain + 0.15).toFixed(2)}[imp];`
      sfxLabels.push('[imp]'); idx += 1
    }
  }

  const mixIns = (hasBed ? ['[bed]'] : []).concat(sfxLabels)
  if (!mixIns.length) { await copyFile(silentIn, finalOut); return }
  // Máster SIN normalizador dinámico (causaba "pumping"): ganancia fija + techo
  const master = `volume=1.9,alimiter=limit=0.92:level=false,${fadeOut}`
  const fc = mixIns.length > 1
    ? `${chain}${mixIns.join('')}amix=inputs=${mixIns.length}:duration=first:normalize=0,${master}[a]`
    : `${chain}${mixIns[0]}${master}[a]`

  await ff([
    '-y', ...inputs,
    '-filter_complex', fc,
    '-map', '0:v', '-map', '[a]', '-t', totalDur.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', ...FAST, finalOut,
  ])
}

// ═══════════ Motor v1 (tarjetas) — fallback cuando el item no tiene fotos ═══════════
const TRANSITIONS = ['fade', 'slideleft', 'smoothup', 'circleopen', 'dissolve', 'wiperight']

async function buildCardReel(opts: ReelOpts, tmp: string): Promise<ReelResult> {
  const { workspaceId, carId } = opts
  const scenes = opts.scenes?.length ? opts.scenes : ['historia', 'cobertura', 'editorial']
  const perScene = Math.max(2, Math.min(8, opts.perScene ?? 3))
  const kb = opts.kenBurns ?? 'alternate'
  const D = 0.5
  const localBase = `http://127.0.0.1:${process.env.PORT || 3105}`

  const q: string[] = []
  if (opts.accent) q.push(`accent=${encodeURIComponent(opts.accent.replace('#', ''))}`)
  if (opts.watermark === false) q.push('wm=0')
  const extra = q.length ? `&${q.join('&')}` : ''
  const pngs: string[] = []
  for (let i = 0; i < scenes.length; i++) {
    const r = await fetch(`${localBase}/api/marketing/render?workspaceId=${workspaceId}&carId=${carId}&format=story&template=${scenes[i]}${extra}`)
    if (!r.ok) continue
    const p = path.join(tmp, `s${i}.png`)
    await writeFile(p, Buffer.from(await r.arrayBuffer()))
    pngs.push(p)
  }
  if (!pngs.length) throw new Error('No se pudieron renderizar las escenas')

  const clips: string[] = []
  for (let i = 0; i < pngs.length; i++) {
    const out = path.join(tmp, `c${i}.mp4`)
    const frames = Math.round(perScene * FPS)
    const zoomIn = kb === 'in' || (kb === 'alternate' && i % 2 === 0)
    const z = kb === 'none' ? `'1'` : zoomIn ? `'min(zoom+0.0010,1.20)'` : `'if(eq(on,0),1.20,max(1.001,zoom-0.0010))'`
    await ff([
      '-y', '-loop', '1', '-i', pngs[i], '-t', String(perScene),
      '-vf', `scale=${W * 2}:${H * 2},zoompan=z=${z}:d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out,
    ])
    clips.push(out)
  }

  const totalDur = clips.length * perScene - (clips.length - 1) * D
  const silentOut = path.join(tmp, 'silent.mp4')
  if (clips.length === 1) {
    await copyFile(clips[0], silentOut)
  } else {
    const inputs = clips.flatMap((c) => ['-i', c])
    let prev = '0:v', filter = ''
    for (let k = 1; k < clips.length; k++) {
      const off = (k * (perScene - D)).toFixed(2)
      const tr = opts.transition && opts.transition !== 'random' && TRANSITIONS.includes(opts.transition) ? opts.transition : TRANSITIONS[(k - 1) % TRANSITIONS.length]
      filter += `[${prev}][${k}:v]xfade=transition=${tr}:duration=${D}:offset=${off}[x${k}];`
      prev = `x${k}`
    }
    filter = filter.replace(/;$/, '')
    await ff(['-y', ...inputs, '-filter_complex', filter, '-map', `[${prev}]`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', silentOut])
  }

  let narration = (opts.narrationText || '').trim()
  if (!narration && opts.autoNarration) {
    try {
      const [item, ws] = await Promise.all([
        db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
        db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
      ])
      if (item && ws) {
        const { generateScript } = await import('./script')
        narration = await generateScript(buildCarCreative(item, ws, localBase), { tone: 'profesional', durationSec: Math.max(8, Math.round(totalDur - 1.5)) })
      }
    } catch { narration = '' }
  }
  const voices: { file: string; at: number }[] = []
  if (narration && ttsAvailable()) {
    try { const f = path.join(tmp, 'voice.mp3'); await synthesize(narration, opts.voiceId || 'Spanish_ConfidentWoman', opts.voiceSpeed ?? 1, f); voices.push({ file: f, at: 0.3 }) } catch { /* sin voz */ }
  }

  const outDir = path.join(process.cwd(), 'public', 'marketing', 'videos')
  await mkdir(outDir, { recursive: true })
  const fileName = opts.fileName || `${carId}-${Date.now()}.mp4`
  const finalOut = path.join(outDir, fileName)
  const music = musicPath(opts.music === undefined ? 'energica.mp3' : opts.music)
  const mVol = Math.max(0, Math.min(1, opts.musicVolume ?? 0.5))
  await muxAudio(silentOut, finalOut, totalDur, music, mVol, voices)

  return { url: `/api/marketing/media/${fileName}`, file: finalOut, durationSec: Math.round(totalDur), hasVoice: voices.length > 0, hasMusic: !!music, style: 'tarjetas', shots: pngs.length }
}
