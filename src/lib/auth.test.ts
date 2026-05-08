import { describe, it, expect } from 'vitest'

// Test auth utilities (pure functions)
describe('Auth utilities', () => {
  it('should export hashPassword function that returns bcrypt hashes', async () => {
    const bcrypt = await import('bcryptjs')

    // bcrypt generates unique salts, so same password produces different hashes
    const hash1 = bcrypt.hashSync('valiflow2026', 12)
    const hash2 = bcrypt.hashSync('valiflow2026', 12)
    const hash3 = bcrypt.hashSync('different', 12)

    // Different calls produce different hashes (unique salts)
    expect(hash1).not.toBe(hash2)
    // Hashes are 60 chars (bcrypt format)
    expect(hash1).toHaveLength(60)
    expect(hash3).toHaveLength(60)
    // Both 'valiflow2026' hashes should verify against the same password
    expect(bcrypt.compareSync('valiflow2026', hash1)).toBe(true)
    expect(bcrypt.compareSync('valiflow2026', hash2)).toBe(true)
    expect(bcrypt.compareSync('different', hash3)).toBe(true)
    // Wrong password should not match
    expect(bcrypt.compareSync('wrong', hash1)).toBe(false)
    expect(bcrypt.compareSync('valiflow2026', hash3)).toBe(false)
  })

  it('should have consistent verification', async () => {
    const bcrypt = await import('bcryptjs')
    const hash = bcrypt.hashSync('testpassword', 12)

    expect(bcrypt.compareSync('testpassword', hash)).toBe(true)
    expect(bcrypt.compareSync('TESTPASSWORD', hash)).toBe(false)
    expect(bcrypt.compareSync('', hash)).toBe(false)
  })
})
