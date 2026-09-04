import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import type { PaymentMode } from "@/lib/bookings/types";
import { sendWhatsAppText } from "./client";
import { type ConversationContext, updateConversation } from "./conversation";
import {
  bookingConfirmedAwaitOtpMessage,
  cashPaymentPendingMessage,
  customerAwaitingWorkerOtpMessage,
  invalidPaymentModeReply,
  noOtpPendingMessage,
  paymentModeAlreadySelectedMessage,
  paymentModeMenu,
  paymentModeSavedMessage,
  upiPaymentLinkMessage,
  upiPaymentPendingMessage,
} from "./completion-messages";
import {
  HOMIGO_CASH_PAYMENT_AMOUNT,
  HOMIGO_UPI_PAYMENT_AMOUNT,
} from "./homigo-services";
import type { WhatsappConversation } from "./types";

export interface ServiceFlowResult {
  handled: boolean;
  replied: boolean;
  error?: string;
}

export type StoredPaymentMode = "cash" | "upi";

function bookingRefFromId(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function paymentFinalAmount(mode: StoredPaymentMode): number {
  return mode === "cash" ? HOMIGO_CASH_PAYMENT_AMOUNT : HOMIGO_UPI_PAYMENT_AMOUNT;
}

async function loadBookingForConversation(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
) {
  const bookingId =
    conversation.booking_id ??
    ((conversation.context as ConversationContext).booking_id as string | undefined);

  if (!bookingId) return { booking: null, error: "No booking linked" };

  const { data, error } = await supabase
    .from("booking")
    .select(
      "id, Payment_mode, payment_status, payment_received_at, customer_id, otp_verified, completion_otp_hash, otp_expires_at, otp_attempts, final_amount",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) return { booking: null, error: error?.message ?? "Booking not found" };

  if (
    conversation.customer_id &&
    String(data.customer_id) !== String(conversation.customer_id)
  ) {
    return { booking: null, error: "Booking customer mismatch" };
  }

  return { booking: data, error: null };
}

function normalizePaymentMode(value: string | null | undefined): StoredPaymentMode | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "cash") return "cash";
  if (v === "upi") return "upi";
  return null;
}

export function parsePaymentModeSelection(text: string): StoredPaymentMode | null {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "cash") return "cash";
  if (t === "2" || t === "upi") return "upi";
  return null;
}

async function savePaymentMode(
  supabase: SupabaseClient,
  bookingId: string,
  mode: StoredPaymentMode,
): Promise<string | null> {
  const finalAmount = paymentFinalAmount(mode);
  const { error } = await supabase
    .from("booking")
    .update({
      Payment_mode: mode satisfies PaymentMode,
      final_amount: finalAmount,
      payment_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .is("payment_received_at", null)
    .eq("otp_verified", true);

  return error?.message ?? null;
}

/** booking_confirmed — wait for worker OTP; no payment menu. */
export async function handleBookingConfirmedInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
): Promise<ServiceFlowResult> {
  const send = await sendWhatsAppText(customerMobile, bookingConfirmedAwaitOtpMessage(lang));
  await updateConversation(supabase, conversation.id, {
    state: "booking_confirmed",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...(conversation.context as ConversationContext),
      phase: "awaiting_service_completion",
    },
  });
  return { handled: true, replied: send.ok };
}

/** service_in_progress — service ongoing. */
export async function handleServiceInProgressInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
  text: string,
): Promise<ServiceFlowResult> {
  const ctx = conversation.context as ConversationContext;
  if (ctx.phase === "otp_pending") {
    return handleServiceCompletionInbound(
      supabase,
      conversation,
      customerMobile,
      lang,
      messageId,
      text,
    );
  }
  const send = await sendWhatsAppText(customerMobile, bookingConfirmedAwaitOtpMessage(lang));
  await updateConversation(supabase, conversation.id, {
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });
  return { handled: true, replied: send.ok };
}

/** service_completion — customer waits for worker OTP verify; payment only after verify. */
export async function handleServiceCompletionInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
  text: string,
): Promise<ServiceFlowResult> {
  const ctx = conversation.context as ConversationContext;
  const loaded = await loadBookingForConversation(supabase, conversation);

  if (!loaded.booking) {
    const send = await sendWhatsAppText(customerMobile, noOtpPendingMessage(lang));
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  const booking = loaded.booking;

  if (booking.otp_verified || ctx.phase === "payment_selection") {
    return handlePaymentSelectionInbound(
      supabase,
      conversation,
      customerMobile,
      lang,
      messageId,
      text,
    );
  }

  // Customer must NOT enter OTP — worker verifies via authenticated flow.
  const body = customerAwaitingWorkerOtpMessage(lang);
  const send = await sendWhatsAppText(customerMobile, body);
  await updateConversation(supabase, conversation.id, {
    state: "service_completion",
    booking_id: booking.id,
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...ctx,
      phase: "otp_pending",
      booking_id: booking.id,
    },
  });
  return { handled: true, replied: send.ok };
}

/** Payment selection — only when otp_verified. */
export async function handlePaymentSelectionInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
  text: string,
): Promise<ServiceFlowResult> {
  const ctx = conversation.context as ConversationContext;
  const loaded = await loadBookingForConversation(supabase, conversation);

  if (!loaded.booking?.otp_verified) {
    const send = await sendWhatsAppText(customerMobile, customerAwaitingWorkerOtpMessage(lang));
    await updateConversation(supabase, conversation.id, {
      state: "service_completion",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, phase: "otp_pending" },
    });
    return { handled: true, replied: send.ok };
  }

  const booking = loaded.booking;
  const bookingRef = bookingRefFromId(booking.id);
  const existingMode = normalizePaymentMode(booking.Payment_mode);

  if (existingMode) {
    const amount = paymentFinalAmount(existingMode);
    const body = paymentModeAlreadySelectedMessage(lang, {
      bookingRef,
      mode: existingMode,
      amount,
    });
    const send = await sendWhatsAppText(customerMobile, body);
    const phase =
      existingMode === "cash" ? "cash_payment_pending" : "upi_payment_pending";
    await updateConversation(supabase, conversation.id, {
      state: "payment_pending",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, phase, payment_mode: existingMode, final_amount: amount },
    });
    return { handled: true, replied: send.ok };
  }

  const selected = parsePaymentModeSelection(text);
  if (!selected) {
    const body = text.trim().length > 0 ? invalidPaymentModeReply(lang) : paymentModeMenu(lang);
    const send = await sendWhatsAppText(customerMobile, body);
    await updateConversation(supabase, conversation.id, {
      state: "service_completion",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: { ...ctx, phase: "payment_selection" },
    });
    return { handled: true, replied: send.ok };
  }

  const saveError = await savePaymentMode(supabase, booking.id, selected);
  if (saveError) return { handled: false, replied: false, error: saveError };

  const amount = paymentFinalAmount(selected);
  let body = paymentModeSavedMessage(lang, { bookingRef, mode: selected, amount });

  if (selected === "upi") {
    const { data: customer } = await supabase
      .from("customers")
      .select("mobile")
      .eq("id", booking.customer_id)
      .maybeSingle();

    const { initiateUpiPaymentForBooking } = await import("@/lib/payments/upi-payment");
    const upi = await initiateUpiPaymentForBooking(supabase, {
      bookingId: booking.id,
      customerMobile: String(customer?.mobile ?? customerMobile),
      amountInr: amount,
    });

    if (upi.ok && upi.paymentLinkUrl) {
      body = upiPaymentLinkMessage(lang, { bookingRef, amount, url: upi.paymentLinkUrl });
    } else if (upi.error) {
      body = `${body}\n\n(UPI link unavailable: ${upi.error})`;
    }
  }

  const send = await sendWhatsAppText(customerMobile, body);
  const phase = selected === "cash" ? "cash_payment_pending" : "upi_payment_pending";
  await updateConversation(supabase, conversation.id, {
    state: "payment_pending",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...ctx,
      phase,
      payment_mode: selected,
      final_amount: amount,
      payment_mode_selected_at: new Date().toISOString(),
    },
  });
  return { handled: true, replied: send.ok };
}

/** payment_pending — cash/upi pending; stable replies. */
export async function handlePaymentPendingInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
): Promise<ServiceFlowResult> {
  const ctx = conversation.context as ConversationContext;
  const loaded = await loadBookingForConversation(supabase, conversation);

  if (!loaded.booking) {
    const send = await sendWhatsAppText(
      customerMobile,
      {
        en: "Payment status: Pending.",
        mr: "Payment status: Pending.",
        hi: "Payment status: Pending.",
      }[lang],
    );
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  const mode =
    normalizePaymentMode(loaded.booking.Payment_mode) ??
    normalizePaymentMode(ctx.payment_mode as string | undefined);
  const bookingRef = bookingRefFromId(loaded.booking.id);

  if (!loaded.booking.otp_verified) {
    return handleServiceCompletionInbound(
      supabase,
      conversation,
      customerMobile,
      lang,
      messageId,
      "",
    );
  }

  if (mode) {
    const amount =
      Number(ctx.final_amount) || paymentFinalAmount(mode);
    const body =
      mode === "cash"
        ? cashPaymentPendingMessage(lang, bookingRef, amount)
        : upiPaymentPendingMessage(lang, bookingRef, amount);
    const send = await sendWhatsAppText(customerMobile, body);
    await updateConversation(supabase, conversation.id, {
      state: "payment_pending",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  return handlePaymentSelectionInbound(
    supabase,
    conversation,
    customerMobile,
    lang,
    messageId,
    "",
  );
}
