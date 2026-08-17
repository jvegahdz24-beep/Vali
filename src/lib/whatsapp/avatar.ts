// ═══════════════════════════════════════════════════════════════
// Descarga la foto de perfil de WhatsApp (pps.whatsapp.net) en el
// SERVIDOR y la devuelve como data URI comprimido.
//
// ¿Por qué? Las URLs de pps.whatsapp.net están firmadas y protegidas
// contra hotlinking: cargan por fetch de servidor pero el navegador
// (que manda Referer de nuestro dominio) recibe un bloqueo → la <img>
// falla. Guardando un data URI, el <img> carga desde nuestros propios
// datos, sin depender del CDN de WhatsApp ni de que la URL expire.
// ═══════════════════════════════════════════════════════════════

export async function fetchAvatarDataUri(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal }).catch(() => null)
    clearTimeout(t)
    if (!res || !res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    // Redimensiona a 128px y comprime → data URI pequeño (~5-15KB) que cabe en TEXT.
    const { default: sharp } = await import('sharp')
    const out = await sharp(buf).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}
