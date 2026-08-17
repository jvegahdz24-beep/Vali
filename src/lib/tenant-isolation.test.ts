// ═══════════════════════════════════════════════════════════════
// Tests de AISLAMIENTO MULTI-TENANT (contrato A.2.2 §8).
// Verifican que un usuario no pueda acceder a datos de otro tenant y que el
// scoping por rol (vendedor = solo lo asignado) esté vigente.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Setea secretos requeridos ANTES de que se evalúen los módulos importados
// (auth-edge exige NEXTAUTH_SECRET al cargar).
vi.hoisted(() => { process.env.NEXTAUTH_SECRET ||= 'test-secret'; process.env.NODE_ENV = 'test' })

// Mock de la BD ANTES de importar el módulo bajo prueba.
const memberFindUnique = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { workspaceMember: { findUnique: (...args: unknown[]) => memberFindUnique(...args) } },
}))

import { requireWorkspace, requirePermission, ApiError } from './api-auth'
import { canViewAllData } from './rbac'

describe('multi-tenant · requireWorkspace (bloqueo cross-tenant)', () => {
  beforeEach(() => memberFindUnique.mockReset())

  it('RECHAZA (403) a un usuario que NO es miembro del workspace ajeno', async () => {
    memberFindUnique.mockResolvedValue(null) // userA no pertenece a workspaceB
    await expect(requireWorkspace('workspaceB', 'userA')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('PERMITE a un miembro activo y devuelve su rol', async () => {
    memberFindUnique.mockResolvedValue({ userId: 'userA', workspaceId: 'workspaceA', role: 'member', workspace: { isActive: true } })
    const m = await requireWorkspace('workspaceA', 'userA')
    expect(m.role).toBe('member')
  })

  it('BLOQUEA (402) un workspace suspendido', async () => {
    memberFindUnique.mockResolvedValue({ role: 'owner', workspace: { isActive: false } })
    await expect(requireWorkspace('ws', 'u')).rejects.toMatchObject({ statusCode: 402 })
  })

  it('EXIGE workspaceId (400)', async () => {
    await expect(requireWorkspace('', 'u')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('multi-tenant · scoping por rol (vendedor solo lo asignado)', () => {
  it('solo el member (vendedor) está scopeado; owner/admin/viewer ven todo', () => {
    expect(canViewAllData('member')).toBe(false)
    expect(canViewAllData('owner')).toBe(true)
    expect(canViewAllData('admin')).toBe(true)
    expect(canViewAllData('viewer')).toBe(true)
  })

  it('requirePermission bloquea a un member en capacidades de admin', () => {
    expect(() => requirePermission('member', 'team.manage')).toThrow()
    expect(() => requirePermission('owner', 'team.manage')).not.toThrow()
  })
})
