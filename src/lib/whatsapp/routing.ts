import type { WhatsappConversationState } from "./types";
import type { ConversationContext } from "./conversation";
import type { WhatsappConversation } from "./types";

/** States where inbound "1"/"2"/"3" are menu choices — not language selection. */
const NUMERIC_MENU_STATES: WhatsappConversationState[] = [
  "date_selection",
  "slot_selection",
  "rate_card_confirmation",
  "service_completion",
  "payment_pending",
];

export function customerStateUsesNumericMenu(
  state: WhatsappConversationState,
  ctx: ConversationContext,
): boolean {
  if (NUMERIC_MENU_STATES.includes(state)) return true;
  if (state === "booking_confirmed" && ctx.phase === "payment_selection") {
    return true;
  }
  return false;
}

/**
 * Returning customers may have phase=ready while state=language_selection (stale row).
 * Numeric replies must still be parsed as language during fresh onboarding.
 */
export function shouldSkipLanguageForReturningCustomer(
  conversation: WhatsappConversation,
  ctx: ConversationContext,
  text: string,
  parseLanguage: (value: string) => "en" | "mr" | "hi" | null,
): boolean {
  if (conversation.state !== "language_selection") return false;
  if (ctx.phase !== "ready") return false;
  if (ctx.whatsapp_onboarding_started) return false;
  if (parseLanguage(text)) return false;
  return true;
}
