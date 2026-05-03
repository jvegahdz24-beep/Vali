import { describe, it, expect } from 'vitest'
import { ApiError, getClientIp } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

// Helper to create a mock NextRequest with specific headers
function mockRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  } as unknown as NextRequest
}

// Test API auth helpers (pure functions, no DB needed)
describe('API Auth Helpers', () => {
  describe('ApiError', () => {
    it('should create an ApiError with correct statusCode and message', () => {
      const error = new ApiError(401, 'No autenticado')
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(401)
      expect(error.message).toBe('No autenticado')
      expect(error.name).toBe('ApiError')
    })

    it('should create an ApiError with optional code', () => {
      const error = new ApiError(429, 'Rate limited', 'RATE_LIMITED')
      expect(error.statusCode).toBe(429)
      expect(error.code).toBe('RATE_LIMITED')
    })

    it('should default code to ERROR when not provided', () => {
      const error = new ApiError(500, 'Server error')
      const json = error.toJSON()
      expect(json.code).toBe('ERROR')
    })

    it('should serialize to JSON correctly', () => {
      const error = new ApiError(403, 'No tienes acceso', 'FORBIDDEN')
      const json = error.toJSON()
      expect(json).toEqual({
        error: 'No tienes acceso',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    })

    it('should handle all common HTTP status codes', () => {
      const codes = [400, 401, 403, 404, 429, 500, 503]
      codes.forEach(code => {
        const error = new ApiError(code, `Error ${code}`)
        expect(error.statusCode).toBe(code)
        expect(error.toJSON().statusCode).toBe(code)
      })
    })
  })

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const ip = getClientIp(mockRequest({ 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 10.0.0.1' }))
      expect(ip).toBe('203.0.113.50')
    })

    it('should extract IP from x-real-ip header when x-forwarded-for is absent', () => {
      const ip = getClientIp(mockRequest({ 'x-real-ip': '198.51.100.42' }))
      expect(ip).toBe('198.51.100.42')
    })

    it('should return "unknown" when no IP headers are present', () => {
      const ip = getClientIp(mockRequest({}))
      expect(ip).toBe('unknown')
    })

    it('should handle single IP in x-forwarded-for', () => {
      const ip = getClientIp(mockRequest({ 'x-forwarded-for': '192.168.1.100' }))
      expect(ip).toBe('192.168.1.100')
    })

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const ip = getClientIp(mockRequest({ 'x-forwarded-for': '10.0.0.1', 'x-real-ip': '10.0.0.2' }))
      expect(ip).toBe('10.0.0.1')
    })
  })
})
