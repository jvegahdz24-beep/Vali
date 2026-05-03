import { describe, it, expect } from 'vitest'
import {
  validateBody,
  loginSchema,
  registerSchema,
  createContactSchema,
  createDealSchema,
  whatsappSendSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from '@/lib/validations'

// Test all validation schemas
describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = validateBody(loginSchema, { email: 'test@example.com', password: 'pass123' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('test@example.com')
        expect(result.data.password).toBe('pass123')
      }
    })

    it('should reject invalid email', () => {
      const result = validateBody(loginSchema, { email: 'not-an-email', password: 'pass123' })
      expect(result.success).toBe(false)
    })

    it('should reject missing password', () => {
      const result = validateBody(loginSchema, { email: 'test@example.com' })
      expect(result.success).toBe(false)
    })

    it('should reject empty body', () => {
      const result = validateBody(loginSchema, {})
      expect(result.success).toBe(false)
    })
  })

  describe('registerSchema', () => {
    it('should accept valid registration data', () => {
      const result = validateBody(registerSchema, {
        name: 'Juan',
        email: 'juan@example.com',
        password: 'Password1!',
        confirmPassword: 'Password1!',
      })
      expect(result.success).toBe(true)
    })

    it('should reject short password (< 8 chars)', () => {
      const result = validateBody(registerSchema, {
        name: 'Juan',
        email: 'juan@example.com',
        password: 'Pass1!',
        confirmPassword: 'Pass1!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject password without uppercase', () => {
      const result = validateBody(registerSchema, {
        name: 'Juan',
        email: 'juan@example.com',
        password: 'password1!',
        confirmPassword: 'password1!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject password without number', () => {
      const result = validateBody(registerSchema, {
        name: 'Juan',
        email: 'juan@example.com',
        password: 'Password!',
        confirmPassword: 'Password!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mismatched passwords', () => {
      const result = validateBody(registerSchema, {
        name: 'Juan',
        email: 'juan@example.com',
        password: 'Password1!',
        confirmPassword: 'Different1!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject short name (< 2 chars)', () => {
      const result = validateBody(registerSchema, {
        name: 'J',
        email: 'juan@example.com',
        password: 'Password1!',
        confirmPassword: 'Password1!',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('createContactSchema', () => {
    it('should accept valid contact data', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
        firstName: 'Maria',
        lastName: 'Garcia',
        phone: '+525512345678',
        email: 'maria@example.com',
      })
      expect(result.success).toBe(true)
    })

    it('should accept contact with minimal data', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
        firstName: 'Juan',
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing workspaceId', () => {
      const result = validateBody(createContactSchema, {
        firstName: 'Juan',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing firstName', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty firstName', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
        firstName: '',
      })
      expect(result.success).toBe(false)
    })

    it('should accept empty string as email (treated as no email)', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
        firstName: 'Test',
        email: '',
      })
      expect(result.success).toBe(true)
    })

    it('should apply default values', () => {
      const result = validateBody(createContactSchema, {
        workspaceId: 'ws-123',
        firstName: 'Test',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('manual')
        expect(result.data.tags).toEqual([])
      }
    })
  })

  describe('createDealSchema', () => {
    it('should accept valid deal data', () => {
      const result = validateBody(createDealSchema, {
        workspaceId: 'ws-123',
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
        title: 'Nuevo deal',
        value: 50000,
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing title', () => {
      const result = validateBody(createDealSchema, {
        workspaceId: 'ws-123',
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
      })
      expect(result.success).toBe(false)
    })

    it('should reject negative value', () => {
      const result = validateBody(createDealSchema, {
        workspaceId: 'ws-123',
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
        title: 'Deal',
        value: -100,
      })
      expect(result.success).toBe(false)
    })

    it('should apply defaults for currency and value', () => {
      const result = validateBody(createDealSchema, {
        workspaceId: 'ws-123',
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
        title: 'Deal',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currency).toBe('MXN')
        expect(result.data.value).toBe(0)
        expect(result.data.source).toBe('manual')
      }
    })
  })

  describe('whatsappSendSchema', () => {
    it('should accept valid message data', () => {
      const result = validateBody(whatsappSendSchema, {
        phone: '+525512345678',
        message: 'Hola, como estas?',
      })
      expect(result.success).toBe(true)
    })

    it('should reject short phone number', () => {
      const result = validateBody(whatsappSendSchema, {
        phone: '12345',
        message: 'Test',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty message', () => {
      const result = validateBody(whatsappSendSchema, {
        phone: '+525512345678',
        message: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('passwordResetRequestSchema', () => {
    it('should accept valid email', () => {
      const result = validateBody(passwordResetRequestSchema, { email: 'test@example.com' })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = validateBody(passwordResetRequestSchema, { email: 'not-email' })
      expect(result.success).toBe(false)
    })
  })

  describe('passwordResetSchema', () => {
    it('should accept valid reset data', () => {
      const result = validateBody(passwordResetSchema, {
        token: 'abc123def456',
        password: 'NewPassword1!',
        confirmPassword: 'NewPassword1!',
      })
      expect(result.success).toBe(true)
    })

    it('should reject mismatched passwords', () => {
      const result = validateBody(passwordResetSchema, {
        token: 'abc123',
        password: 'NewPassword1!',
        confirmPassword: 'DifferentPass1!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject weak password (no uppercase)', () => {
      const result = validateBody(passwordResetSchema, {
        token: 'abc123',
        password: 'newpassword1!',
        confirmPassword: 'newpassword1!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty token', () => {
      const result = validateBody(passwordResetSchema, {
        token: '',
        password: 'NewPassword1!',
        confirmPassword: 'NewPassword1!',
      })
      expect(result.success).toBe(false)
    })
  })
})
