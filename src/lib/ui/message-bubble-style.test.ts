// ═══════════════════════════════════════════════════════════════
// TEST: getMessageBubbleStyle — pure function contract
//
// Pins the visual contract that protects against the original
// operator-send bug coming back as a UI regression. If a future
// refactor of inbox.tsx swaps justify-start with justify-end, or
// removes the contact avatar on inbound, or changes outbound
// bubble color away from emerald, these tests fail.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  getMessageBubbleStyle,
  isOperatorMessage,
  type MessageDirection,
} from '@/lib/ui/message-bubble-style'

describe('getMessageBubbleStyle', () => {
  it('renders an INBOUND bubble on the LEFT (justify-start) with a contact avatar', () => {
    const style = getMessageBubbleStyle('inbound', false)

    expect(style.align).toBe('justify-start')
    expect(style.variant).toBe('inbound')
    expect(style.hasContactAvatar).toBe(true)
    expect(style.hasAiAvatar).toBe(false)
    expect(style.isOutbound).toBe(false)
    // Inbound uses the page background, not emerald
    expect(style.bgClass).toContain('bg-background')
    expect(style.bgClass).not.toContain('emerald')
  })

  it('renders an OUTBOUND/HUMAN bubble on the RIGHT (justify-end) with NO contact avatar and EMERALD bg', () => {
    const style = getMessageBubbleStyle('outbound', false)

    expect(style.align).toBe('justify-end')
    expect(style.variant).toBe('outbound')
    expect(style.hasContactAvatar).toBe(false)
    expect(style.hasAiAvatar).toBe(false)
    expect(style.isOutbound).toBe(true)
    // The signature visual: outbound = bg-emerald-600 text-white
    expect(style.bgClass).toContain('emerald')
    expect(style.textClass).toContain('white')
  })

  it('renders an OUTBOUND/AI bubble with the bot avatar on the right', () => {
    const style = getMessageBubbleStyle('outbound', true)

    expect(style.align).toBe('justify-end')
    expect(style.hasContactAvatar).toBe(false)
    expect(style.hasAiAvatar).toBe(true) // <-- key: AI shows the Bot avatar
    expect(style.isOutbound).toBe(true)
    expect(style.bgClass).toContain('emerald')
  })

  it('inbound and outbound alignments are EXACTLY OPPOSITE (regression guard)', () => {
    const inbound = getMessageBubbleStyle('inbound', false)
    const outbound = getMessageBubbleStyle('outbound', false)

    expect(inbound.align).not.toBe(outbound.align)
    expect([inbound.align, outbound.align].sort()).toEqual(['justify-end', 'justify-start'])
  })

  it('corner classes are distinct (the "chat-bubble" effect requires a blunted corner on the speaker side)', () => {
    const inbound = getMessageBubbleStyle('inbound', false)
    const outbound = getMessageBubbleStyle('outbound', false)

    // Inbound: blunted bottom-left (rounded-bl-md)
    expect(inbound.cornerClass).toContain('rounded-bl-md')
    // Outbound: blunted bottom-right (rounded-br-md)
    expect(outbound.cornerClass).toContain('rounded-br-md')
  })

  it('avatars are exclusive — never both at the same time', () => {
    const cases: Array<[MessageDirection, boolean]> = [
      ['inbound', false],
      ['inbound', true], // isAiGenerated is ignored for inbound
      ['outbound', false],
      ['outbound', true],
    ]
    for (const [direction, isAiGenerated] of cases) {
      const style = getMessageBubbleStyle(direction, isAiGenerated)
      // hasContactAvatar and hasAiAvatar are mutually exclusive
      const both = style.hasContactAvatar && style.hasAiAvatar
      expect(both, `both avatars shown for ${direction}/${isAiGenerated}`).toBe(false)
    }
  })

  it('isAiGenerated is ignored when direction is inbound (no AI bot avatar on inbound)', () => {
    // Defense against a regression where someone "fixes" inbound
    // alignment by adding the AI bot avatar.
    const styleWithAi = getMessageBubbleStyle('inbound', true)
    expect(styleWithAi.hasAiAvatar).toBe(false)
    expect(styleWithAi.hasContactAvatar).toBe(true)
  })
})

describe('isOperatorMessage', () => {
  it('returns true for direction=outbound + senderType=human', () => {
    expect(isOperatorMessage('outbound', 'human')).toBe(true)
  })

  it('returns false for direction=inbound (the original bug signature)', () => {
    // The original bug persisted operator text as inbound+contact.
    // This is the single most important regression guard.
    expect(isOperatorMessage('inbound', 'contact')).toBe(false)
  })

  it('returns false for direction=outbound but senderType=agent (AI reply, not human)', () => {
    expect(isOperatorMessage('outbound', 'agent')).toBe(false)
  })

  it('returns false for direction=outbound but senderType=system', () => {
    expect(isOperatorMessage('outbound', 'system')).toBe(false)
  })

  it('returns false for direction=outbound but senderType=contact (defensive)', () => {
    // A direction=outbound + senderType=contact row would be a
    // bizarre data state, but it must NOT be classified as the
    // operator's message.
    expect(isOperatorMessage('outbound', 'contact')).toBe(false)
  })
})
