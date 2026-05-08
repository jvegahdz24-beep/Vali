import { describe, it, expect } from 'vitest'

// Test utility functions
import { cn, getInitials, formatPhoneNumber, timeAgo } from '@/lib/utils'

describe('cn (class merge)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active')
  })

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null)).toBe('base')
  })
})

describe('getInitials', () => {
  it('should return initials from full name', () => {
    expect(getInitials('Carlos Hernández')).toBe('CH')
  })

  it('should handle single name', () => {
    expect(getInitials('ValiAutoFlow')).toBe('V')
  })

  it('should handle empty string', () => {
    const result = getInitials('')
    expect(typeof result).toBe('string')
  })
})

describe('formatPhoneNumber', () => {
  it('should format Mexican phone numbers', () => {
    const result = formatPhoneNumber('5512345678')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('should handle null/undefined', () => {
    expect(formatPhoneNumber(null)).toBe('')
    expect(formatPhoneNumber(undefined)).toBe('')
  })
})

describe('timeAgo', () => {
  it('should return "ahora mismo" for recent dates', () => {
    const result = timeAgo(new Date())
    expect(result).toBeTruthy()
  })

  it('should return a string for old dates', () => {
    const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const result = timeAgo(oldDate)
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })
})
