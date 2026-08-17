// Helper compartido del OAuth de Meta (connect + callback): firma/verifica el
// `state` con HMAC para que el callback confíe en el workspaceId.
import crypto from 'crypto'

export function signState(workspaceId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'dev'
  const sig = crypto.createHmac('sha256', secret).update(workspaceId).digest('hex').slice(0, 24)
  return `${workspaceId}.${sig}`
}

export function verifyState(state: string): string | null {
  const workspaceId = (state || '').split('.')[0]
  if (!workspaceId || signState(workspaceId) !== state) return null
  return workspaceId
}
