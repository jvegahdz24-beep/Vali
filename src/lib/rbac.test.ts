import { describe, it, expect } from 'vitest'
import {
  canViewModule,
  hasCapability,
  canViewAllData,
  normalizeRole,
  isWorkspaceRole,
} from './rbac'

describe('rbac · module visibility', () => {
  it('owner & admin see admin modules; member & viewer do not', () => {
    for (const mod of ['settings', 'team', 'agents', 'automations', 'valiguard']) {
      expect(canViewModule('owner', mod)).toBe(true)
      expect(canViewModule('admin', mod)).toBe(true)
      expect(canViewModule('member', mod)).toBe(false)
      expect(canViewModule('viewer', mod)).toBe(false)
    }
  })

  it('everyone sees core CRM modules', () => {
    for (const mod of ['dashboard', 'inbox', 'pipeline', 'inventory', 'contacts', 'calendar']) {
      for (const role of ['owner', 'admin', 'member', 'viewer']) {
        expect(canViewModule(role, mod)).toBe(true)
      }
    }
  })

  it('viewer sees analytics/reports but member does not', () => {
    for (const mod of ['analytics', 'reports']) {
      expect(canViewModule('viewer', mod)).toBe(true)
      expect(canViewModule('member', mod)).toBe(false)
    }
  })

  it('developer/admin platform views are superadmin-only', () => {
    expect(canViewModule('owner', 'developer')).toBe(false)
    expect(canViewModule('owner', 'admin')).toBe(false)
    expect(canViewModule('member', 'developer', { isSuperAdmin: true })).toBe(true)
  })

  it('unknown views are denied by default', () => {
    expect(canViewModule('owner', 'totally-made-up')).toBe(false)
  })
})

describe('rbac · capabilities', () => {
  it('billing is owner-only', () => {
    expect(hasCapability('owner', 'billing.manage')).toBe(true)
    expect(hasCapability('admin', 'billing.manage')).toBe(false)
    expect(hasCapability('member', 'billing.manage')).toBe(false)
  })

  it('advanced panel is owner-only', () => {
    expect(hasCapability('owner', 'settings.advanced')).toBe(true)
    expect(hasCapability('admin', 'settings.advanced')).toBe(false)
  })

  it('team/settings managed by owner+admin', () => {
    for (const cap of ['team.manage', 'settings.manage', 'agents.manage'] as const) {
      expect(hasCapability('owner', cap)).toBe(true)
      expect(hasCapability('admin', cap)).toBe(true)
      expect(hasCapability('member', cap)).toBe(false)
      expect(hasCapability('viewer', cap)).toBe(false)
    }
  })

  it('member can write CRM but viewer cannot', () => {
    expect(hasCapability('member', 'crm.write')).toBe(true)
    expect(hasCapability('viewer', 'crm.write')).toBe(false)
  })

  it('member is scoped to own data; others see all', () => {
    expect(canViewAllData('member')).toBe(false)
    expect(canViewAllData('owner')).toBe(true)
    expect(canViewAllData('admin')).toBe(true)
    expect(canViewAllData('viewer')).toBe(true)
  })
})

describe('rbac · helpers', () => {
  it('normalizeRole falls back to the most restrictive role', () => {
    expect(normalizeRole('owner')).toBe('owner')
    expect(normalizeRole('garbage')).toBe('viewer')
    expect(normalizeRole(undefined)).toBe('viewer')
  })

  it('isWorkspaceRole validates known roles', () => {
    expect(isWorkspaceRole('admin')).toBe(true)
    expect(isWorkspaceRole('superadmin')).toBe(false)
  })
})
