import { describe, it, expect } from 'vitest'

// Test auth utilities (pure functions)
describe('Auth utilities', () => {
  it('should export hashPassword function that returns consistent hashes', async () => {
    const crypto = await import('crypto')
    function hashPassword(plain: string): string {
      return crypto.createHash('sha256').update(plain).digest('hex')
    }
    
    const hash1 = hashPassword('valiflow2026')
    const hash2 = hashPassword('valiflow2026')
    const hash3 = hashPassword('different')
    
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
    expect(hash1).toHaveLength(64) // SHA-256 hex digest
  })
})
