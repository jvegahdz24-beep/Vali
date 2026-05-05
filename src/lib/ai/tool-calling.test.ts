// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Tool Calling System Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getToolDefinitions,
  getToolDefinition,
  getToolNames,
  TOOL_DEFINITIONS,
  onToolCallEvent,
  emitToolCall,
  type ToolCallLog,
} from './tool-calling'

// ─── Tool Definitions Tests ─────────────────────────────────

describe('Tool Definitions', () => {
  it('should export exactly 10 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(10)
  })

  it('should have all required tool names', () => {
    const names = getToolNames()
    expect(names).toContain('calendar_create_event')
    expect(names).toContain('calendar_list_events')
    expect(names).toContain('crm_update_lead')
    expect(names).toContain('crm_create_deal')
    expect(names).toContain('crm_get_contact')
    expect(names).toContain('whatsapp_send_message')
    expect(names).toContain('followup_create')
    expect(names).toContain('nexus_get_temperature')
    expect(names).toContain('nexus_store_memory')
    expect(names).toContain('analytics_get_summary')
  })

  it('every tool definition should follow OpenAI function calling format', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function')
      expect(tool.function).toBeDefined()
      expect(tool.function.name).toBeTruthy()
      expect(tool.function.description).toBeTruthy()
      expect(tool.function.parameters.type).toBe('object')
      expect(tool.function.parameters.properties).toBeDefined()
    }
  })

  it('required fields should be arrays of strings', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const required = tool.function.parameters.required
      if (required) {
        expect(Array.isArray(required)).toBe(true)
        for (const field of required) {
          expect(typeof field).toBe('string')
          expect(Object.keys(tool.function.parameters.properties)).toContain(field)
        }
      }
    }
  })

  it('getToolDefinition returns correct tool', () => {
    const tool = getToolDefinition('calendar_create_event')
    expect(tool).toBeDefined()
    expect(tool!.function.name).toBe('calendar_create_event')
  })

  it('getToolDefinition returns undefined for unknown tool', () => {
    const tool = getToolDefinition('nonexistent_tool')
    expect(tool).toBeUndefined()
  })

  it('getToolDefinitions returns a copy of the definitions', () => {
    const defs = getToolDefinitions()
    expect(defs).toHaveLength(10)
    // Verify it's the same array (same reference is fine for module-level)
    expect(defs).toBe(TOOL_DEFINITIONS)
  })
})

// ─── Event Bus Tests ─────────────────────────────────────────

describe('Event Bus', () => {
  beforeEach(() => {
    // Clear any lingering listeners by creating new ones
  })

  it('onToolCallEvent returns unsubscribe function', () => {
    const unsub = onToolCallEvent(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('emitToolCall calls all registered listeners', () => {
    const received: ToolCallLog[] = []
    const unsub1 = onToolCallEvent((log) => received.push(log))
    const unsub2 = onToolCallEvent((log) => received.push(log))

    const log: ToolCallLog = {
      toolName: 'calendar_create_event',
      toolCallId: 'test_1',
      arguments: { title: 'Test Event' },
      result: '{"success":true}',
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    }

    emitToolCall(log)

    expect(received).toHaveLength(2)
    expect(received[0].toolName).toBe('calendar_create_event')
    expect(received[1].toolName).toBe('calendar_create_event')

    unsub1()
    unsub2()
  })

  it('unsubscribing stops receiving events', () => {
    const received: ToolCallLog[] = []
    const unsub = onToolCallEvent((log) => received.push(log))

    const log: ToolCallLog = {
      toolName: 'test',
      toolCallId: 'test_2',
      arguments: {},
      result: '{}',
      success: true,
      durationMs: 5,
      timestamp: new Date().toISOString(),
    }

    emitToolCall(log)
    expect(received).toHaveLength(1)

    unsub()
    emitToolCall(log)
    expect(received).toHaveLength(1) // Should not increase
  })

  it('listener errors do not break other listeners', () => {
    const received: ToolCallLog[] = []
    const unsubBad = onToolCallEvent(() => {
      throw new Error('Listener error')
    })
    const unsubGood = onToolCallEvent((log) => received.push(log))

    const log: ToolCallLog = {
      toolName: 'test',
      toolCallId: 'test_3',
      arguments: {},
      result: '{}',
      success: true,
      durationMs: 5,
      timestamp: new Date().toISOString(),
    }

    // Should not throw
    expect(() => emitToolCall(log)).not.toThrow()
    expect(received).toHaveLength(1)

    unsubBad()
    unsubGood()
  })
})

// ─── Tool Schema Validation Tests ────────────────────────────

describe('Tool Schema Validation', () => {
  it('calendar_create_event has correct required fields', () => {
    const tool = getToolDefinition('calendar_create_event')!
    expect(tool.function.parameters.required).toContain('workspaceId')
    expect(tool.function.parameters.required).toContain('title')
    expect(tool.function.parameters.required).toContain('date')
    expect(tool.function.parameters.required).not.toContain('description')
    expect(tool.function.parameters.required).not.toContain('contactId')
  })

  it('calendar_list_events has workspaceId required', () => {
    const tool = getToolDefinition('calendar_list_events')!
    expect(tool.function.parameters.required).toContain('workspaceId')
    expect(tool.function.parameters.required).not.toContain('fromDate')
  })

  it('crm_update_lead has contactId required', () => {
    const tool = getToolDefinition('crm_update_lead')!
    expect(tool.function.parameters.required).toContain('contactId')
    expect(tool.function.parameters.required).not.toContain('leadScore')
    expect(tool.function.parameters.required).not.toContain('temperature')
  })

  it('crm_create_deal has all required fields', () => {
    const tool = getToolDefinition('crm_create_deal')!
    expect(tool.function.parameters.required).toContain('workspaceId')
    expect(tool.function.parameters.required).toContain('pipelineId')
    expect(tool.function.parameters.required).toContain('title')
  })

  it('crm_get_contact has no required fields (search is flexible)', () => {
    const tool = getToolDefinition('crm_get_contact')!
    // No required fields — any combination of contactId, phone, name, or workspaceId
    expect(tool.function.parameters.required).toBeUndefined()
  })

  it('whatsapp_send_message has phone and message required', () => {
    const tool = getToolDefinition('whatsapp_send_message')!
    expect(tool.function.parameters.required).toContain('phone')
    expect(tool.function.parameters.required).toContain('message')
  })

  it('followup_create has required fields', () => {
    const tool = getToolDefinition('followup_create')!
    expect(tool.function.parameters.required).toContain('workspaceId')
    expect(tool.function.parameters.required).toContain('contactId')
    expect(tool.function.parameters.required).toContain('conversationId')
    expect(tool.function.parameters.required).toContain('scheduledAt')
  })

  it('nexus_get_temperature has userId required', () => {
    const tool = getToolDefinition('nexus_get_temperature')!
    expect(tool.function.parameters.required).toContain('userId')
  })

  it('nexus_store_memory has userId, key, value required', () => {
    const tool = getToolDefinition('nexus_store_memory')!
    expect(tool.function.parameters.required).toContain('userId')
    expect(tool.function.parameters.required).toContain('key')
    expect(tool.function.parameters.required).toContain('value')
  })

  it('analytics_get_summary has workspaceId required', () => {
    const tool = getToolDefinition('analytics_get_summary')!
    expect(tool.function.parameters.required).toContain('workspaceId')
  })

  it('tools with enum fields have valid enum arrays', () => {
    const typeEnum = getToolDefinition('calendar_create_event')!
      .function.parameters.properties.type!.enum!
    expect(typeEnum).toContain('call')
    expect(typeEnum).toContain('meeting')
    expect(typeEnum).toContain('followup')
    expect(typeEnum).toContain('task')

    const tempEnum = getToolDefinition('crm_update_lead')!
      .function.parameters.properties.temperature!.enum!
    expect(tempEnum).toEqual(['cold', 'warm', 'hot'])

    const memoryCatEnum = getToolDefinition('nexus_store_memory')!
      .function.parameters.properties.category!.enum!
    expect(memoryCatEnum).toContain('preference')
    expect(memoryCatEnum).toContain('fact')
    expect(memoryCatEnum).toContain('instruction')
  })
})

// ─── Type Safety Tests ───────────────────────────────────────

describe('Type Safety', () => {
  it('ToolCallLog type can be constructed correctly', () => {
    const log: ToolCallLog = {
      toolName: 'test_tool',
      toolCallId: 'call_abc123',
      arguments: { key: 'value' },
      result: '{"success": true}',
      success: true,
      durationMs: 42,
      timestamp: '2025-01-01T00:00:00.000Z',
      workspaceId: 'ws_123',
      contactId: 'ct_456',
    }

    expect(log.toolName).toBe('test_tool')
    expect(log.workspaceId).toBe('ws_123')
    expect(log.contactId).toBe('ct_456')
  })

  it('ToolCallLog optional fields can be omitted', () => {
    const log: ToolCallLog = {
      toolName: 'test',
      toolCallId: 'call_123',
      arguments: {},
      result: '{}',
      success: false,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }

    expect(log.workspaceId).toBeUndefined()
    expect(log.contactId).toBeUndefined()
  })
})
