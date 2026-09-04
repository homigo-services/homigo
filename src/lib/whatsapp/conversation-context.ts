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
  saved_area?: string;
  saved_pincode?: string;
  saved_address_line?: string;
  awaiting_custom_date?: boolean;
  processing_lock?: string;
  processing_lock_at?: string;
  /** Set when conversational FSM was reset after 24h customer inactivity. */
  inactivity_reset_at?: string;
  /** Idempotency marker — inbound message that triggered inactivity reset. */
  inactivity_reset_message_id?: string;
  [key: string]: unknown;
}
