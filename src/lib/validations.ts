import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

export const createContactSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId requerido'),
  firstName: z.string().min(1, 'El nombre es requerido').max(100),
  lastName: z.string().max(100).optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  source: z.string().default('manual'),
  tags: z.array(z.string()).default([]),
})

export const updateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  leadScore: z.number().min(0).max(100).optional(),
  status: z.enum(['active', 'inactive', 'archived', 'blocked']).optional(),
})

export const createDealSchema = z.object({
  workspaceId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  title: z.string().min(1, 'El título es requerido').max(200),
  value: z.number().min(0).default(0),
  currency: z.string().default('MXN'),
  contactId: z.string().optional(),
  description: z.string().max(2000).optional(),
  source: z.string().default('manual'),
})

export const createAgentSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  type: z.enum(['qualifier', 'sales', 'followup', 'coach', 'custom']).default('qualifier'),
  personality: z.string().default('JHON'),
  model: z.string().default('llama-3.3-70b-versatile'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(8000).default(4096),
  systemPrompt: z.string().max(5000).default(''),
  isActive: z.boolean().default(true),
})

export const createAutomationSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().max(500).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'event', 'message_received', 'deal_stage_change']),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  isActive: z.boolean().default(true),
})

export const aiChatSchema = z.object({
  workspaceId: z.string().min(1),
  message: z.string().min(1, 'El mensaje es requerido').max(4000),
  conversationId: z.string().optional(),
  contactId: z.string().optional(),
  agentId: z.string().optional(),
})

export const whatsappSendSchema = z.object({
  phone: z.string().min(10, 'Número de teléfono inválido'),
  message: z.string().min(1, 'El mensaje es requerido').max(4096),
  workspaceId: z.string().optional(),
  conversationId: z.string().optional(),
  contactId: z.string().optional(),
})

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
})

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Token inválido'),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

export function validateBody<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body)
  if (!result.success) {
    const errors = result.error.issues.map(i => i.message).join('. ')
    return { success: false as const, error: errors }
  }
  return { success: true as const, data: result.data }
}
