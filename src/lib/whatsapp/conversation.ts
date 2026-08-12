import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import type {
  WhatsappConversation,
  WhatsappConversationState,
} from "./types";
import { normalizeWhatsAppMobile } from "./parser";

const TABLE = "whatsapp_conversations";

/** Context flag: language onboarding complete; awaiting service selection (Phase 4). */
export const CONVERSATION_PHASE_READY = "ready";

export interface ConversationContext {
  phase?: typeof CONVERSATION_PHASE_READY | string;
  language_confirmed_at?: string;
  /** True once we've sent the language menu during WhatsApp onboarding. */
  whatsapp_onboarding_started?: boolean;
  /** Cached numbered service menu entries for selection parsing. */
  service_menu?: Array<{ index: number; id: string; name: string }>;
  service_id?: string;
  service_name?: string;
  collecting_field?: "area" | "pincode" | "address_line";
  original_message?: string;
  service_date?: string;
  preferred_time_slot?: string;
  service_request_id?: string;
  rate_card_id?: string;
  confirmation_sent_at?: string;
  booking_ref?: string;
  final_amount?: number;
  assigned_worker_id?: string;
  matching_status?: string;
  booking_id?: string;
  payment_mode?: string;
  payment_mode_selected_at?: string;
  [key: string]: unknown;
}

function normalize(row: Record<string, unknown>): WhatsappConversation {
  return row as unknown as WhatsappConversation;
}

export function isConversationReady(
  conversation: WhatsappConversation,
): boolean {
  const ctx = conversation.context as ConversationContext;
  return ctx.phase === CONVERSATION_PHASE_READY;
}

export async function getConversationByMobile(
  supabase: SupabaseClient,
  rawMobile: string,
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  const mobile = normalizeWhatsAppMobile(rawMobile);
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("whatsapp_mobile", mobile)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: data ? normalize(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function ensureConversation(
  supabase: SupabaseClient,
  rawMobile: string,
  customerId: string,
  preferredLanguage: CustomerPreferredLanguage,
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  const mobile = normalizeWhatsAppMobile(rawMobile);
  const existing = await getConversationByMobile(supabase, mobile);

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (existing.data) {
    return existing;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      whatsapp_mobile: mobile,
      customer_id: customerId,
      preferred_language: preferredLanguage,
      state: "language_selection" satisfies WhatsappConversationState,
      context: {},
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalize(data as Record<string, unknown>),
    error: null,
  };
}

export async function updateConversation(
  supabase: SupabaseClient,
  conversationId: string,
  patch: {
    state?: WhatsappConversationState;
    preferred_language?: CustomerPreferredLanguage;
    context?: ConversationContext;
    last_message_id?: string;
    last_message_at?: string;
    customer_id?: string;
    service_request_id?: string | null;
    booking_id?: string | null;
  },
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.state !== undefined) payload.state = patch.state;
  if (patch.preferred_language !== undefined)
    payload.preferred_language = patch.preferred_language;
  if (patch.context !== undefined) payload.context = patch.context;
  if (patch.last_message_id !== undefined)
    payload.last_message_id = patch.last_message_id;
  if (patch.last_message_at !== undefined)
    payload.last_message_at = patch.last_message_at;
  if (patch.customer_id !== undefined) payload.customer_id = patch.customer_id;
  if (patch.service_request_id !== undefined)
    payload.service_request_id = patch.service_request_id;
  if (patch.booking_id !== undefined) payload.booking_id = patch.booking_id;

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", conversationId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: normalize(data as Record<string, unknown>),
    error: null,
  };
}

export async function markConversationReady(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  language: CustomerPreferredLanguage,
  messageId: string,
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  return updateConversation(supabase, conversation.id, {
    state: "service_selection",
    preferred_language: language,
    context: {
      ...(conversation.context as ConversationContext),
      phase: CONVERSATION_PHASE_READY,
      language_confirmed_at: new Date().toISOString(),
    },
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });
}

export async function markLanguageSelectionPending(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  messageId: string,
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  return updateConversation(supabase, conversation.id, {
    state: "language_selection",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });
}

/** Reset a finished booking conversation so a greeting starts fresh onboarding. */
export async function resetConversationForNewBooking(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  messageId: string,
): Promise<{ data: WhatsappConversation | null; error: string | null }> {
  return updateConversation(supabase, conversation.id, {
    state: "language_selection",
    service_request_id: null,
    booking_id: null,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      whatsapp_onboarding_started: true,
    },
  });
}

/** Idempotency ledger for inbound webhook events. */
export async function tryClaimWebhookEvent(
  supabase: SupabaseClient,
  input: {
    messageId: string;
    eventType?: string;
    whatsappMobile?: string;
    payloadHash?: string;
  },
): Promise<{ claimed: boolean; duplicate: boolean; error: string | null }> {
  if (!input.messageId) {
    return { claimed: false, duplicate: false, error: "Missing message ID" };
  }

  const { error } = await supabase.from("whatsapp_processed_events").insert({
    message_id: input.messageId,
    event_type: input.eventType ?? "message",
    whatsapp_mobile: input.whatsappMobile ?? null,
    processed_at: new Date().toISOString(),
    status: "processed",
    payload_hash: input.payloadHash ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { claimed: false, duplicate: true, error: null };
    }
    return { claimed: false, duplicate: false, error: error.message };
  }

  return { claimed: true, duplicate: false, error: null };
}

export async function markWebhookEventFailed(
  supabase: SupabaseClient,
  messageId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from("whatsapp_processed_events")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq("message_id", messageId);
}
