import type { WhatsappConversationState } from "./types";
import type { ConversationContext } from "./conversation-context";
import { hasValidBookingServiceContext } from "./context-builders";

/** Booking states where greeting "hi" restarts onboarding (not worker_assignment). */
export const GREETING_RESET_BOOKING_STATES: WhatsappConversationState[] = [
  "service_selection",
  "address_collection",
  "pincode_collection",
  "date_selection",
  "slot_selection",
  "rate_card_confirmation",
];

/** DB states with no dedicated handler — recover to language onboarding. */
export const ORPHAN_CONVERSATION_STATES: WhatsappConversationState[] = [
  "alternate_mobile_confirmation",
  "booking_confirmation",
  "cancelled",
  "reschedule",
];

export function shouldResetOnboardingGreeting(
  state: WhatsappConversationState,
): boolean {
  return GREETING_RESET_BOOKING_STATES.includes(state);
}

export function isOrphanConversationState(state: WhatsappConversationState): boolean {
  return ORPHAN_CONVERSATION_STATES.includes(state);
}

/** Detect corrupted booking step — e.g. date_selection without service_id. */
export function conversationNeedsBookingHeal(
  state: WhatsappConversationState,
  ctx: ConversationContext,
): boolean {
  if (state === "date_selection" || state === "slot_selection") {
    return !hasValidBookingServiceContext(ctx) || (state === "slot_selection" && !ctx.service_date);
  }
  if (state === "rate_card_confirmation") {
    return !hasValidBookingServiceContext(ctx);
  }
  if (state === "language_selection") {
    return Boolean(
      ctx.service_id ||
        ctx.service_date ||
        ctx.service_request_id ||
        ctx.collecting_field ||
        ctx.rate_card_id,
    );
  }
  return false;
}
