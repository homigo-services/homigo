import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import type { PaymentMode } from "@/lib/bookings/types";
import { sendWhatsAppText } from "./client";
import { type ConversationContext, updateConversation } from "./conversation";
import type { WhatsappConversation } from "./types";

export type StoredPaymentMode = "cash" | "upi";

export interface PaymentModeHandleResult {
  handled: boolean;
  replied: boolean;
  error?: string;
}

function bookingRefFromId(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function paymentModeMenu(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: `Please choose your payment mode:

1. Cash
2. UPI

Reply with 1 or 2.`,
    mr: `कृपया payment mode निवडा:

1. Cash
2. UPI

1 किंवा 2 पाठवा.`,
    hi: `कृपया payment mode चुनें:

1. Cash
2. UPI

1 या 2 भेजें.`,
  };
  return templates[lang];
}

export function invalidPaymentModeReply(lang: CustomerPreferredLanguage): string {
  const templates = {
    en: "Invalid choice. Please reply with 1 for Cash or 2 for UPI.",
    mr: "चुकीची निवड. Cash साठी 1 किंवा UPI साठी 2 पाठवा.",
    hi: "गलत choice. Cash के लिए 1 या UPI के लिए 2 भेजें.",
  };
  return `${templates[lang]}\n\n${paymentModeMenu(lang)}`;
}

function paymentModeLabel(mode: StoredPaymentMode, lang: CustomerPreferredLanguage): string {
  if (mode === "cash") {
    return { en: "Cash", mr: "Cash", hi: "Cash" }[lang];
  }
  return { en: "UPI", mr: "UPI", hi: "UPI" }[lang];
}

export function paymentModeSavedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: StoredPaymentMode },
): string {
  const label = paymentModeLabel(input.mode, lang);
  const templates = {
    en: `✅ Payment mode saved: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending

We will update you before service begins.`,
    mr: `✅ Payment mode save झाला: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending

Service सुरू होण्यापूर्वी आम्ही update करू.`,
    hi: `✅ Payment mode save हो गया: ${label}

📋 Ref: ${input.bookingRef}
Payment status: Pending

Service शुरू होने से पहले हम update करेंगे.`,
  };
  return templates[lang];
}

export function paymentModeAlreadySelectedMessage(
  lang: CustomerPreferredLanguage,
  input: { bookingRef: string; mode: StoredPaymentMode },
): string {
  const label = paymentModeLabel(input.mode, lang);
  const templates = {
    en: `Payment mode is already set to ${label} for booking ${input.bookingRef}.

Payment status: Pending`,
    mr: `Booking ${input.bookingRef} साठी payment mode आधीच ${label} आहे.

Payment status: Pending`,
    hi: `Booking ${input.bookingRef} के लिए payment mode पहले से ${label} है.

Payment status: Pending`,
  };
  return templates[lang];
}

export function parsePaymentModeSelection(text: string): StoredPaymentMode | null {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "cash") return "cash";
  if (t === "2" || t === "upi") return "upi";
  return null;
}

async function loadBookingForConversation(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
): Promise<{
  booking: {
    id: string;
    Payment_mode: string | null;
    payment_status: string | null;
    payment_received_at: string | null;
    customer_id: string;
  } | null;
  error: string | null;
}> {
  const bookingId =
    conversation.booking_id ??
    ((conversation.context as ConversationContext).booking_id as string | undefined);

  if (!bookingId) {
    return { booking: null, error: "No booking linked to conversation" };
  }

  const { data, error } = await supabase
    .from("booking")
    .select("id, Payment_mode, payment_status, payment_received_at, customer_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) {
    return { booking: null, error: error?.message ?? "Booking not found" };
  }

  if (
    conversation.customer_id &&
    String(data.customer_id) !== String(conversation.customer_id)
  ) {
    return { booking: null, error: "Booking does not belong to customer" };
  }

  return { booking: data, error: null };
}

function normalizeStoredMode(value: string | null | undefined): StoredPaymentMode | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "cash") return "cash";
  if (v === "upi") return "upi";
  return null;
}

async function savePaymentMode(
  supabase: SupabaseClient,
  bookingId: string,
  mode: StoredPaymentMode,
): Promise<string | null> {
  const { error } = await supabase
    .from("booking")
    .update({
      Payment_mode: mode satisfies PaymentMode,
      payment_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .is("payment_received_at", null);

  return error?.message ?? null;
}

/** booking_confirmed → prompt or accept payment mode selection. */
export async function handlePaymentModeInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
  text: string,
): Promise<PaymentModeHandleResult> {
  const ctx = conversation.context as ConversationContext;
  const loaded = await loadBookingForConversation(supabase, conversation);

  if (!loaded.booking) {
    const send = await sendWhatsAppText(customerMobile, paymentModeMenu(lang));
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok, error: loaded.error ?? undefined };
  }

  const booking = loaded.booking;
  const bookingRef = bookingRefFromId(booking.id);
  const existingMode = normalizeStoredMode(booking.Payment_mode);

  if (existingMode) {
    const body = paymentModeAlreadySelectedMessage(lang, {
      bookingRef,
      mode: existingMode,
    });
    const send = await sendWhatsAppText(customerMobile, body);
    await updateConversation(supabase, conversation.id, {
      state: "payment_pending",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: {
        ...ctx,
        phase: "payment_mode_selected",
        payment_mode: existingMode,
      },
    });
    return { handled: true, replied: send.ok };
  }

  const selected = parsePaymentModeSelection(text);

  if (!selected) {
    const body = text.trim().length > 0 ? invalidPaymentModeReply(lang) : paymentModeMenu(lang);
    const send = await sendWhatsAppText(customerMobile, body);
    await updateConversation(supabase, conversation.id, {
      state: "booking_confirmed",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
      context: {
        ...ctx,
        phase: "payment_mode_selection",
      },
    });
    return { handled: true, replied: send.ok };
  }

  const saveError = await savePaymentMode(supabase, booking.id, selected);
  if (saveError) {
    return { handled: false, replied: false, error: saveError };
  }

  const body = paymentModeSavedMessage(lang, { bookingRef, mode: selected });
  const send = await sendWhatsAppText(customerMobile, body);
  await updateConversation(supabase, conversation.id, {
    state: "payment_pending",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
    context: {
      ...ctx,
      phase: "payment_mode_selected",
      payment_mode: selected,
      payment_mode_selected_at: new Date().toISOString(),
    },
  });

  return { handled: true, replied: send.ok };
}

/** payment_pending — customer already chose a mode; stay stable on further messages. */
export async function handlePaymentPendingInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
): Promise<PaymentModeHandleResult> {
  const ctx = conversation.context as ConversationContext;
  const loaded = await loadBookingForConversation(supabase, conversation);

  if (!loaded.booking) {
    const send = await sendWhatsAppText(
      customerMobile,
      {
        en: "Your payment mode is recorded. Payment status: Pending.",
        mr: "तुमचा payment mode record झाला आहे. Payment status: Pending.",
        hi: "आपका payment mode record हो गया है. Payment status: Pending.",
      }[lang],
    );
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  const mode =
    normalizeStoredMode(loaded.booking.Payment_mode) ??
    normalizeStoredMode(ctx.payment_mode as string | undefined);

  if (mode) {
    const body = paymentModeAlreadySelectedMessage(lang, {
      bookingRef: bookingRefFromId(loaded.booking.id),
      mode,
    });
    const send = await sendWhatsAppText(customerMobile, body);
    await updateConversation(supabase, conversation.id, {
      state: "payment_pending",
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  return handlePaymentModeInbound(
    supabase,
    conversation,
    customerMobile,
    lang,
    messageId,
    "",
  );
}
