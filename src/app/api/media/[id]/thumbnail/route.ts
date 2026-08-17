// ═══════════════════════════════════════════════════════════════
// GET /api/media/[id]/thumbnail — sirve la miniatura de una imagen.
// Reutiliza el handler del padre (que detecta "/thumbnail" por el pathname y
// devuelve la miniatura). Antes esta ruta NO existía → daba 404 y en el inbox
// las imágenes salían "Imagen no disponible" (audio/video sí, porque usan la
// URL directa sin miniatura).
// ═══════════════════════════════════════════════════════════════

export { GET } from '../route'
export const runtime = 'nodejs'
