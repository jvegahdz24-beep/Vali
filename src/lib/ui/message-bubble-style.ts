// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Message Bubble Style Contract
//
// Single source of truth for "given a Message.direction, what classes
// / variants / avatars does the Inbox render?". The inbox.tsx render
// code (src/components/dashboard/inbox.tsx) imports this and the
// Vitest tests pin the contract.
//
// Why this file exists:
//
//   The original operator-send bug surfaced as a visual regression:
//   the operator's text was being rendered on the LEFT (with the
//   customer's "AG" avatar) because it was being persisted as
//   direction='inbound' / senderType='contact' by processMessageCore.
//   That bug was fixed at the persistence layer (operator-send helper
//   saves outbound/human; processMessageCore is told operatorInitiated
//   = true so it does NOT double-save the operator text).
//
//   But if a future refactor flips the render order, swaps
//   justify-start with justify-end, or removes the contact avatar on
//   inbound, the bug would come back visually. By centralising the
//   direction→style mapping in this pure function we can pin the
//   visual contract with a unit test that doesn't need jsdom or
//   @testing-library/react.
//
// If you change the visual treatment of a message bubble, update
// the test first, then the inbox.tsx render, then ship.
// ═══════════════════════════════════════════════════════════════

export type MessageDirection = 'inbound' | 'outbound'

/**
 * Layout alignment of the message row.
 * - 'justify-start' (LEFT)  → the OTHER party spoke (customer)
 * - 'justify-end'   (RIGHT) → the OPERATOR / assistant spoke
 */
export type MessageAlign = 'justify-start' | 'justify-end'

/**
 * Bubble visual variant. We use a string tag rather than the raw
 * class name so the test does not couple to the project's Tailwind
 * config (which can rename `bg-emerald-600` etc.).
 */
export type BubbleVariant = 'inbound' | 'outbound'

/**
 * The visual style of a single message bubble, in a structured shape
 * that the inbox renderer can splat into className strings.
 */
export interface MessageBubbleStyle {
  /** Layout alignment of the row (inbox.tsx wraps the bubble with this) */
  align: MessageAlign
  /** Bubble variant tag */
  variant: BubbleVariant
  /** Tailwind background class */
  bgClass: string
  /** Tailwind text color class */
  textClass: string
  /** Tailwind class for the "blunted" corner that makes it look like a chat bubble */
  cornerClass: string
  /** Whether the contact avatar is shown on the LEFT (inbound) */
  hasContactAvatar: boolean
  /** Whether the AI bot avatar is shown on the RIGHT (outbound+ai) */
  hasAiAvatar: boolean
  /** Whether the message is delivered to the customer (controls Check / CheckCheck rendering) */
  isOutbound: boolean
}

/**
 * Compute the bubble style for a message.
 *
 * @param direction  'inbound' (from the customer) or 'outbound' (to the customer)
 * @param isAiGenerated  Only relevant for outbound — true means the
 *                       message was produced by the AI assistant and
 *                       should show the bot avatar
 */
export function getMessageBubbleStyle(
  direction: MessageDirection,
  isAiGenerated: boolean = false,
): MessageBubbleStyle {
  if (direction === 'inbound') {
    return {
      align: 'justify-start',
      variant: 'inbound',
      bgClass: 'bg-background',
      textClass: 'text-foreground',
      cornerClass: 'rounded-bl-md border border-border/60',
      hasContactAvatar: true,
      hasAiAvatar: false,
      isOutbound: false,
    }
  }

  // Outbound
  return {
    align: 'justify-end',
    variant: 'outbound',
    bgClass: 'bg-emerald-600',
    textClass: 'text-white',
    cornerClass: 'rounded-br-md',
    hasContactAvatar: false,
    hasAiAvatar: isAiGenerated,
    isOutbound: true,
  }
}

/**
 * True when the operator-typed text should render as outbound
 * (RIGHT, emerald). Used by the regression test as a sanity gate.
 */
export function isOperatorMessage(direction: MessageDirection, senderType: string): boolean {
  return direction === 'outbound' && senderType === 'human'
}
