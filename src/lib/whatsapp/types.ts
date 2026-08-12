import type { CustomerPreferredLanguage } from "@/lib/customers/types";

/** Allowed `whatsapp_conversations.state` values (migration 012). */
export type WhatsappConversationState =
  | "language_selection"
  | "alternate_mobile_confirmation"
  | "service_selection"
  | "rate_card_confirmation"
  | "date_selection"
  | "slot_selection"
  | "address_collection"
  | "pincode_collection"
  | "booking_confirmation"
  | "worker_assignment"
  | "booking_confirmed"
  | "service_in_progress"
  | "service_completion"
  | "payment_pending"
  | "completed"
  | "cancelled"
  | "reschedule";

/** Matches `public.whatsapp_conversations` (migration 012). */
export interface WhatsappConversation {
  id: string;
  customer_id: string | null;
  whatsapp_mobile: string;
  preferred_language: CustomerPreferredLanguage;
  state: WhatsappConversationState;
  service_request_id: string | null;
  booking_id: string | null;
  context: Record<string, unknown>;
  last_message_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches `public.whatsapp_processed_events` (migration 013). */
export type WhatsappProcessedEventStatus = "processed" | "failed";

export interface WhatsappProcessedEvent {
  message_id: string;
  event_type: string | null;
  whatsapp_mobile: string | null;
  received_at: string;
  processed_at: string | null;
  status: WhatsappProcessedEventStatus;
  payload_hash: string | null;
  error_message: string | null;
}
