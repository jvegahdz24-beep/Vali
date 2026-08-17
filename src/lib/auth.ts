// ValiAutoFlow — Auth compatibility barrel
// Keep the edge session contract used by middleware and API auth while exposing
// the Node/Redis refresh-token helpers used by the refresh route.

export { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from './auth-edge'
export type { SessionPayload } from './auth-edge'

export {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  revokeAccessToken,
  createTokenPair,
  revokeSession,
  REFRESH_COOKIE_NAME,
} from './auth/index'

export type { TokenPair } from './auth/index'
