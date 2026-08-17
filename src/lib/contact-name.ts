// ═══════════════════════════════════════════════════════════════
// Saneador de nombres de contacto.
// WhatsApp/Meta mandan el profileName tal cual: con emojis, símbolos raros,
// o vacío. Esto lo normaliza para que el CRM se vea profesional. NO borra
// nombres legítimos en otros alfabetos (árabe, chino, cirílico): solo quita
// emojis/pictogramas/símbolos/caracteres de control. Devuelve null si tras
// limpiar no queda un nombre usable (→ el caller usa "Contacto WhatsApp").
// ═══════════════════════════════════════════════════════════════

export function sanitizeContactName(raw?: string | null): string | null {
  if (!raw) return null
  let s = String(raw)
    // zero-width, marcas de dirección y selectores de variación
    .replace(/[​-‏‪-‮⁠﻿︀-️]/g, '')
    // conserva SOLO letras (cualquier alfabeto), números, espacios y separadores
    // de nombre básicos; todo lo demás (emojis, ●, ☯, ⃝, etc.) → espacio
    .replace(/[^\p{L}\p{N}\s.'\-&]/gu, ' ')
    // marcas combinantes sueltas (acentos apilados raros)
    .replace(/[̀-ͯ⃐-⃿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // quita puntos/guiones/comillas sueltos al inicio/fin
  s = s.replace(/^[.\-'&\s]+|[.\-'&\s]+$/g, '').trim()
  if (s.length < 2) return null
  // capitaliza cada palabra (no afecta alfabetos sin mayúsculas)
  const cleaned = s
    .split(' ')
    .map((w) => (w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .slice(0, 60)
  return cleaned || null
}
