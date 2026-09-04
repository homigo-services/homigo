import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import {
  CONVERSATION_PHASE_READY,
  type ConversationContext,
} from "./conversation-context";
import type { ServiceMenuEntry } from "./service-menu";

/** Keys that must not survive onboarding reset or new-booking start. */
export const BOOKING_CONTEXT_KEYS = [
  "service_menu",
  "service_id",
  "service_name",
  "collecting_field",
  "original_message",
  "service_date",
  "preferred_time_slot",
  "service_request_id",
  "rate_card_id",
  "confirmation_sent_at",
  "booking_ref",
  "final_amount",
  "assigned_worker_id",
  "matching_status",
  "booking_id",
  "payment_mode",
  "payment_mode_selected_at",
  "matching_batch",
  "offer_count",
  "dev_accept_links",
  "otp_verified_at",
  "cash_completion_sent_at",
  "payment_status",
  "saved_area",
  "saved_pincode",
  "saved_address_line",
  "awaiting_custom_date",
  "processing_lock",
  "processing_lock_at",
] as const;

export function stripBookingContextFields(
  ctx: ConversationContext,
): ConversationContext {
  const next: ConversationContext = { ...ctx };
  for (const key of BOOKING_CONTEXT_KEYS) {
    delete next[key];
  }
  return next;
}

/** Clean onboarding — no booking fields. */
export function buildFreshOnboardingContext(
  overrides: Partial<ConversationContext> = {},
): ConversationContext {
  return stripBookingContextFields({
    whatsapp_onboarding_started: true,
    ...overrides,
  });
}

/** After language confirmed — ready for service menu only. */
export function buildLanguageSelectedContext(
  language: CustomerPreferredLanguage,
  whatsappOnboardingStarted = true,
): ConversationContext {
  return {
    whatsapp_onboarding_started: whatsappOnboardingStarted,
    language_confirmed_at: new Date().toISOString(),
    phase: CONVERSATION_PHASE_READY,
  };
}

/** Service chosen — start profile collection for this booking. */
export function buildServiceSelectedContext(input: {
  serviceId: string;
  serviceName: string;
  originalMessage: string;
  languageConfirmedAt?: string;
  whatsappOnboardingStarted?: boolean;
}): ConversationContext {
  return {
    whatsapp_onboarding_started: input.whatsappOnboardingStarted ?? true,
    language_confirmed_at: input.languageConfirmedAt,
    phase: "booking",
    service_id: input.serviceId,
    service_name: input.serviceName,
    original_message: input.originalMessage,
  };
}

/** Collecting a profile field during booking. */
export function buildDetailsCollectionContext(input: {
  base: ConversationContext;
  collectingField: "area" | "pincode" | "address_line";
}): ConversationContext {
  return {
    ...stripBookingContextFields(input.base),
    phase: "booking",
    service_id: input.base.service_id,
    service_name: input.base.service_name,
    original_message: input.base.original_message,
    language_confirmed_at: input.base.language_confirmed_at,
    whatsapp_onboarding_started: input.base.whatsapp_onboarding_started,
    collecting_field: input.collectingField,
  };
}

/** Saved address confirmation step. */
export function buildAddressConfirmationContext(input: {
  base: ConversationContext;
  area: string;
  pincode: string;
  addressLine: string;
}): ConversationContext {
  return {
    ...stripBookingContextFields(input.base),
    phase: "confirm_saved_address",
    service_id: input.base.service_id,
    service_name: input.base.service_name,
    original_message: input.base.original_message,
    language_confirmed_at: input.base.language_confirmed_at,
    whatsapp_onboarding_started: input.base.whatsapp_onboarding_started,
    saved_area: input.area,
    saved_pincode: input.pincode,
    saved_address_line: input.addressLine,
  };
}

/** Entering date selection with validated service context. */
export function buildDateSelectionContext(base: ConversationContext): ConversationContext {
  return {
    ...stripBookingContextFields(base),
    phase: "date_selection",
    service_id: base.service_id,
    service_name: base.service_name,
    original_message: base.original_message,
    language_confirmed_at: base.language_confirmed_at,
    whatsapp_onboarding_started: base.whatsapp_onboarding_started,
    collecting_field: undefined,
    awaiting_custom_date: false,
  };
}

/** Customer chose "Another date" — awaiting DD-MM-YYYY input. */
export function buildAwaitingCustomDateContext(
  base: ConversationContext,
): ConversationContext {
  return {
    ...buildDateSelectionContext(base),
    awaiting_custom_date: true,
  };
}

/** Date chosen — slot selection. */
export function buildSlotSelectionContext(
  base: ConversationContext,
  serviceDate: string,
): ConversationContext {
  return {
    ...stripBookingContextFields(base),
    phase: "slot_selection",
    service_id: base.service_id,
    service_name: base.service_name,
    original_message: base.original_message,
    language_confirmed_at: base.language_confirmed_at,
    whatsapp_onboarding_started: base.whatsapp_onboarding_started,
    service_date: serviceDate,
    awaiting_custom_date: false,
  };
}

/** Service menu attached after language. */
export function buildServiceMenuContext(
  language: CustomerPreferredLanguage,
  menu: ServiceMenuEntry[],
  whatsappOnboardingStarted?: boolean,
): ConversationContext {
  return {
    ...buildLanguageSelectedContext(language, whatsappOnboardingStarted ?? true),
    service_menu: menu,
  };
}

/** Rate card reject — back to service selection with clean booking fields. */
export function buildRateRejectContext(base: ConversationContext): ConversationContext {
  return {
    phase: CONVERSATION_PHASE_READY,
    whatsapp_onboarding_started: base.whatsapp_onboarding_started,
    language_confirmed_at: base.language_confirmed_at,
  };
}

export function hasValidBookingServiceContext(ctx: ConversationContext): boolean {
  return Boolean(ctx.service_id && ctx.service_name);
}
