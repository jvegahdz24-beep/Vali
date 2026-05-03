// ═══════════════════════════════════════════════════════════════
// Tests — Login API Route
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()
const mockCreateSessionToken = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    },
    workspaceMember: {
      findMany: (...args: any[]) => mockFindMany(...args),
    },
    workspace: {
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}))

vi.mock('@/lib/auth-edge', () => ({
  createSessionToken: (...args: any[]) => mockCreateSessionToken(...args),
  SESSION_COOKIE_NAME: 'valiflow-session',
}))

vi.mock('@/lib/validations', () => ({
  validateBody: (schema: any, body: any) => {
    // Simple mock validation
    if (schema?._def?.typeName === 'LoginSchema' || !body?.email || !body?.password) {
      if (!body?.email || !body?.password) {
        return { success: false, error: 'Email y contraseña requeridos' }
      }
    }
    return { success: true, data: body }
  },
  loginSchema: { _def: { typeName: 'LoginSchema' } },
}))

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock bcryptjs
    vi.doMock('bcryptjs', () => ({
      default: {
        compareSync: vi.fn().mockReturnValue(true),
        hashSync: vi.fn(),
      },
    }))
  })

  it('rechaza credenciales inválidas (usuario no existe)', async () => {
    mockFindUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noexiste@test.com', password: 'wrong' }),
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBeTruthy()
  })

  it('acepta credenciales correctas', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'owner',
      password: '$2a$12$hash',
    })

    mockFindMany.mockResolvedValue([
      {
        userId: 'user_1',
        workspaceId: 'ws_1',
        role: 'owner',
        workspace: { id: 'ws_1', isActive: true },
      },
    ])

    mockCreateSessionToken.mockResolvedValue('jwt_token_123')

    const { POST } = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.email).toBe('test@test.com')
    expect(mockCreateSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        email: 'test@test.com',
        role: 'owner',
        workspaceId: 'ws_1',
      })
    )
  })

  it('auto-reactiva workspace inactivo', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'owner',
      password: '$2a$12$hash',
    })

    mockFindMany.mockResolvedValue([
      {
        userId: 'user_1',
        workspaceId: 'ws_1',
        role: 'owner',
        workspace: { id: 'ws_1', isActive: false },
      },
    ])

    mockUpdate.mockResolvedValue({})
    mockCreateSessionToken.mockResolvedValue('jwt_token_456')

    const { POST } = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
    })

    const response = await POST(req as any)
    expect(response.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws_1' },
        data: { isActive: true },
      })
    )
  })

  it('setea cookie de sesión', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@test.com',
      name: 'Test',
      role: 'member',
      password: '$2a$12$hash',
    })

    mockFindMany.mockResolvedValue([])

    mockCreateSessionToken.mockResolvedValue('jwt_abc')

    const { POST } = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'pass' }),
    })

    const response = await POST(req as any)
    const cookies = response.cookies.getAll?.() || []
    const sessionCookie = response.cookies.get?.('valiflow-session')

    // Cookie should be set
    expect(sessionCookie?.value || cookies.find((c: any) => c.name === 'valiflow-session')?.value).toBeTruthy()
  })
})
