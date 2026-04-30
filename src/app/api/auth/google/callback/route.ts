// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Google OAuth Callback Endpoint
// GET /api/auth/google/callback — Handle Google OAuth callback,
// exchange code for tokens, find/create user, create session.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import {
  exchangeCodeForTokens,
  getGoogleUser,
  GOOGLE_STATE_COOKIE_NAME,
} from '@/lib/google-oauth'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const returnedState = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors (user denied, etc.)
    if (error) {
      console.error('[Google OAuth Callback Error]', error)
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('error', 'google_oauth_cancelled')
      return NextResponse.redirect(loginUrl)
    }

    if (!code) {
      console.error('[Google OAuth Callback] Missing authorization code')
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('error', 'missing_code')
      return NextResponse.redirect(loginUrl)
    }

    // ─── Verify CSRF state ──────────────────────────────────
    const cookieState = req.cookies.get(GOOGLE_STATE_COOKIE_NAME)?.value

    if (!cookieState || cookieState !== returnedState) {
      console.error('[Google OAuth Callback] State mismatch — possible CSRF attack')
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('error', 'invalid_state')
      return NextResponse.redirect(loginUrl)
    }

    // ─── Exchange code for tokens ───────────────────────────
    const tokens = await exchangeCodeForTokens(code)

    // ─── Fetch Google user profile ──────────────────────────
    const googleUser = await getGoogleUser(tokens.access_token)

    if (!googleUser.email) {
      console.error('[Google OAuth Callback] Google account has no email')
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('error', 'no_email')
      return NextResponse.redirect(loginUrl)
    }

    // ─── Find or create user ────────────────────────────────
    const normalizedEmail = googleUser.email.trim().toLowerCase()

    // Check for existing user by email (may have email/password account)
    let user = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user) {
      // ─── Create new user from Google data ────────────────
      const baseSlug = (googleUser.name || normalizedEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      user = await db.user.create({
        data: {
          name: googleUser.name || googleUser.given_name || 'Google User',
          email: normalizedEmail,
          emailVerified: googleUser.verified_email ? new Date() : null,
          image: googleUser.picture || null,
          role: 'owner',
          timezone: 'America/Mexico_City',
          locale: googleUser.locale || 'es-MX',
          // No password — user authenticates via Google OAuth
          accounts: {
            create: {
              type: 'oauth',
              provider: 'google',
              providerAccountId: googleUser.id,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token || null,
              expires_at: tokens.expires_in
                ? Math.floor(Date.now() / 1000) + tokens.expires_in
                : null,
              token_type: tokens.token_type,
              scope: tokens.scope,
              id_token: tokens.id_token || null,
            },
          },
        },
      })

      // Create workspace separately (user.id is needed for member creation)
      const workspace = await db.workspace.create({
        data: {
          name: `${googleUser.name || 'Google'}'s Workspace`,
          slug: `${baseSlug}-workspace`,
          ownerId: user.id,
          industry: 'services',
          plan: 'free',
          maxContacts: 100,
          maxAgents: 1,
          maxConversations: 50,
          settings: JSON.stringify({
            businessHours: 'Lun-Sab 9:00-19:00',
            timezone: 'America/Mexico_City',
            currency: 'MXN',
            defaultPersonality: 'JHON',
          }),
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
        },
      })
      if (workspace) {
        await db.pipeline.create({
          data: {
            workspaceId: workspace.id,
            name: 'Pipeline de Ventas',
            description: 'Pipeline principal de ventas',
            order: 0,
            stages: {
              create: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
                name: stage.name,
                color: stage.color,
                order: index,
                probability: stage.probability,
                isWon: stage.name.toLowerCase().includes('ganado'),
                isLost: stage.name.toLowerCase().includes('perdido'),
              })),
            },
          },
        })

        // Create default subscription (free plan)
        await db.subscription.create({
          data: {
            workspaceId: workspace.id,
            plan: 'free',
            status: 'active',
            provider: 'stripe',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            amount: 0,
            currency: 'MXN',
            interval: 'monthly',
          },
        })
      }
    } else {
      // ─── Existing user — update profile and link account ──
      const updateData: Record<string, unknown> = {
        emailVerified: googleUser.verified_email ? new Date() : user.emailVerified,
      }

      // Update image if user doesn't have one
      if (!user.image && googleUser.picture) {
        updateData.image = googleUser.picture
      }

      // Update name if it's currently empty
      if (!user.name && googleUser.name) {
        updateData.name = googleUser.name
      }

      if (Object.keys(updateData).length > 0) {
        await db.user.update({
          where: { id: user.id },
          data: updateData,
        })
      }

      // Link the Google account if not already linked
      const existingAccount = await db.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googleUser.id,
          },
        },
      })

      if (!existingAccount) {
        await db.account.create({
          data: {
            userId: user.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId: googleUser.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: tokens.expires_in
              ? Math.floor(Date.now() / 1000) + tokens.expires_in
              : null,
            token_type: tokens.token_type,
            scope: tokens.scope,
            id_token: tokens.id_token || null,
          },
        })
      } else {
        // Update existing account tokens
        await db.account.update({
          where: { id: existingAccount.id },
          data: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || existingAccount.refresh_token,
            expires_at: tokens.expires_in
              ? Math.floor(Date.now() / 1000) + tokens.expires_in
              : existingAccount.expires_at,
            token_type: tokens.token_type,
            scope: tokens.scope,
            id_token: tokens.id_token || existingAccount.id_token,
          },
        })
      }

      // Ensure user has a workspace (edge case: existing user without workspace)
      const existingMember = await db.workspaceMember.findFirst({
        where: { userId: user.id },
        select: { workspaceId: true },
      })

      if (!existingMember) {
        const baseSlug = (user.name || user.email.split('@')[0])
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        const workspace = await db.workspace.create({
          data: {
            name: `${user.name || 'Usuario'}'s Workspace`,
            slug: `${baseSlug}-workspace`,
            ownerId: user.id,
            industry: 'services',
            plan: 'free',
            maxContacts: 100,
            maxAgents: 1,
            maxConversations: 50,
            settings: JSON.stringify({
              businessHours: 'Lun-Sab 9:00-19:00',
              timezone: 'America/Mexico_City',
              currency: 'MXN',
              defaultPersonality: 'JHON',
            }),
            members: {
              create: {
                userId: user.id,
                role: 'owner',
              },
            },
          },
        })

        await db.pipeline.create({
          data: {
            workspaceId: workspace.id,
            name: 'Pipeline de Ventas',
            description: 'Pipeline principal de ventas',
            order: 0,
            stages: {
              create: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
                name: stage.name,
                color: stage.color,
                order: index,
                probability: stage.probability,
                isWon: stage.name.toLowerCase().includes('ganado'),
                isLost: stage.name.toLowerCase().includes('perdido'),
              })),
            },
          },
        })

        await db.subscription.create({
          data: {
            workspaceId: workspace.id,
            plan: 'free',
            status: 'active',
            provider: 'stripe',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            amount: 0,
            currency: 'MXN',
            interval: 'monthly',
          },
        })
      }
    }

    // ─── Get workspace ID for the session token ─────────────
    const member = await db.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    })

    // ─── Create JWT session token ───────────────────────────
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      workspaceId: member?.workspaceId,
    })

    // ─── Set session cookie and redirect to dashboard ───────
    const response = NextResponse.redirect(new URL('/', req.url))

    // Clear the state cookie
    response.cookies.set(GOOGLE_STATE_COOKIE_NAME, '', {
      httpOnly: true,
      secure: false, // Behind Caddy reverse proxy
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })

    // Set the session cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: false, // Behind Caddy reverse proxy
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Google OAuth Callback Error]', error)
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', 'oauth_failed')
    return NextResponse.redirect(loginUrl)
  }
}
