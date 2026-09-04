import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsappConversation } from "./types";
import {
  freshOnboardingContext,
  updateConversation,
  type ConversationContext,
} from "./conversation";

/** Customer booking conversation inactivity window (24 hours). */
export const CONVERSATION_INACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * Authoritative last customer activity timestamp for inactivity checks.
 * Uses persisted `last_message_at` (updated on each inbound customer message).
 * Falls back to `created_at` when no inbound message has been recorded yet.
 */
export function getLastCustomerActivityAt(conversation: WhatsappConversation): Date {
  const raw =
    conversation.last_message_at ??
    conversation.created_at ??
    conversation.updated_at;
  return new Date(raw);
}

/**
 * Boundary: <= 24h continues; > 24h expires.
 * Exactly 24h after last activity is NOT expired (continues existing flow).
 */
export function isConversationInactiveExpired(
  lastActivityAt: Date,
  nowMs: number = Date.now(),
): boolean {
  const elapsed = nowMs - lastActivityAt.getTime();
  return elapsed > CONVERSATION_INACTIVITY_MS;
}

export function conversationHasStaleBookingContext(ctx: ConversationContext): boolean {
  return Boolean(
    ctx.service_id ||
      ctx.service_name ||
      ctx.service_date ||
      ctx.preferred_time_slot ||
      ctx.rate_card_id ||
      ctx.booking_id ||
      ctx.service_request_id ||
      ctx.collecting_field ||
      ctx.saved_area ||
      ctx.saved_pincode ||
      ctx.saved_address_line ||
      ctx.payment_mode ||
      ctx.otp_verified_at,
  );
}

/**
 * Reset conversational FSM after inactivity. Does not modify booking/service-request rows.
 * Idempotent per inbound message via `inactivity_reset_message_id`.
 */
export async function resetConversationForInactivity(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  messageId: string,
): Promise<{ data: WhatsappConversation | null; didReset: boolean; error: string | null }> {
  const ctx = conversation.context as ConversationContext;

  if (ctx.inactivity_reset_message_id === messageId) {
    return { data: conversation, didReset: false, error: null };
  }

  const preservedLanguage = conversation.preferred_language;
  const result = await updateConversation(supabase, conversation.id, {
    state: "language_selection",
    service_request_id: null,
    booking_id: null,
    preferred_language: preservedLanguage,
    last_message_id: messageId,
    context: freshOnboardingContext({
      whatsapp_onboarding_started: false,
      inactivity_reset_at: new Date().toISOString(),
      inactivity_reset_message_id: messageId,
    }),
  });

  return {
    data: result.data,
    didReset: true,
    error: result.error,
  };
}

export interface ApplyInactivityResult {
  conversation: WhatsappConversation;
  didReset: boolean;
}

/**
 * Apply 24h inactivity reset before customer FSM routing.
 * Skips registered worker mobiles (worker/customer actor separation).
 */
export async function applyConversationInactivityIfNeeded(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  _mobile: string,
  messageId: string,
): Promise<ApplyInactivityResult> {
  const ctx = conversation.context as ConversationContext;
  if (ctx.inactivity_reset_message_id === messageId) {
    return { conversation, didReset: false };
  }

  const lastActivity = getLastCustomerActivityAt(conversation);
  if (!isConversationInactiveExpired(lastActivity)) {
    return { conversation, didReset: false };
  }

  const reset = await resetConversationForInactivity(supabase, conversation, messageId);
  if (reset.error) {
    console.error("[whatsapp] inactivity reset failed:", reset.error);
    return { conversation, didReset: false };
  }

  return {
    conversation: reset.data ?? conversation,
    didReset: reset.didReset,
  };
}
