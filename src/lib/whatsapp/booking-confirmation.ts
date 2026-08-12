import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { sendWhatsAppText } from "./client";
import {
  type ConversationContext,
  getConversationByMobile,
  updateConversation,
} from "./conversation";
import { isGreeting } from "./parser";
import { formatDisplayDate } from "./slots";
import type { WhatsappConversation } from "./types";

export interface BookingConfirmedHandleResult {
  handled: boolean;
  replied: boolean;
  error?: string;
}

export interface BookingConfirmationDetails {
  bookingId: string;
  bookingRef: string;
  workerName: string;
  workerArea: string | null;
  serviceType: string;
  serviceDate: string;
  timeSlot: string;
  finalAmount: number;
}

function bookingRefFromId(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatAmount(amount: number, lang: CustomerPreferredLanguage): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0;
  if (lang === "en") return `₹${value}`;
  return `₹${value}`;
}

function formatTimeSlotForDisplay(
  preferredSlot: string | null | undefined,
  bookingSlot: string | null | undefined,
): string {
  const preferred = preferredSlot?.trim();
  if (preferred) return preferred;

  const raw = bookingSlot?.trim();
  if (!raw) return "—";

  // booking.service_time_slot may be TIME-only (e.g. 10:00:00)
  const match = raw.match(/^(\d{1,2}:\d{2})/);
  return match ? match[1] : raw;
}

export function bookingConfirmationMessage(
  lang: CustomerPreferredLanguage,
  input: BookingConfirmationDetails,
): string {
  const dateLabel = formatDisplayDate(input.serviceDate, lang);
  const amountLabel = formatAmount(input.finalAmount, lang);
  const areaLine = input.workerArea ? `\n📍 ${input.workerArea}` : "";

  const templates = {
    en: `✅ Booking confirmed!

📋 Ref: ${input.bookingRef}
👷 ${input.workerName}${areaLine}
🔧 ${input.serviceType}
📅 ${dateLabel}
⏰ ${input.timeSlot}
💰 ${amountLabel}

Your Homigo worker will contact you shortly.`,
    mr: `✅ Booking confirm झाली!

📋 Ref: ${input.bookingRef}
👷 ${input.workerName}${areaLine}
🔧 ${input.serviceType}
📅 ${dateLabel}
⏰ ${input.timeSlot}
💰 ${amountLabel}

Homigo worker लवकरच संपर्क करेल.`,
    hi: `✅ Booking confirm हो गई!

📋 Ref: ${input.bookingRef}
👷 ${input.workerName}${areaLine}
🔧 ${input.serviceType}
📅 ${dateLabel}
⏰ ${input.timeSlot}
💰 ${amountLabel}

Homigo worker जल्द ही contact करेगा।`,
  };

  return templates[lang];
}

/** Short reply when customer messages after confirmation (no duplicate full notification). */
export function bookingConfirmedStatusReply(
  lang: CustomerPreferredLanguage,
  input: BookingConfirmationDetails,
): string {
  const dateLabel = formatDisplayDate(input.serviceDate, lang);
  const amountLabel = formatAmount(input.finalAmount, lang);

  const templates = {
    en: `Your booking ${input.bookingRef} is confirmed.

👷 ${input.workerName}
🔧 ${input.serviceType} · ${dateLabel} · ${input.timeSlot}
💰 ${amountLabel}

We will notify you before the next steps.`,
    mr: `तुमची booking ${input.bookingRef} confirm आहे.

👷 ${input.workerName}
🔧 ${input.serviceType} · ${dateLabel} · ${input.timeSlot}
💰 ${amountLabel}`,
    hi: `आपकी booking ${input.bookingRef} confirm है.

👷 ${input.workerName}
🔧 ${input.serviceType} · ${dateLabel} · ${input.timeSlot}
💰 ${amountLabel}`,
  };

  return templates[lang];
}

async function loadConfirmationDetails(
  supabase: SupabaseClient,
  input: { serviceRequestId: string; bookingId: string; workerId: string },
): Promise<{ details: BookingConfirmationDetails | null; error: string | null }> {
  const { data: booking, error: bookingError } = await supabase
    .from("booking")
    .select("id, final_amount, service_time_slot, sevice_request_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return { details: null, error: bookingError?.message ?? "Booking not found" };
  }

  const { data: sr, error: srError } = await supabase
    .from("service-request")
    .select("service_type, preferred_time_slot, service_date, customer_mobile")
    .eq("id", input.serviceRequestId)
    .maybeSingle();

  if (srError || !sr) {
    return { details: null, error: srError?.message ?? "Service request not found" };
  }

  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select('id, "Full name", area')
    .eq("id", input.workerId)
    .maybeSingle();

  if (workerError || !worker) {
    return { details: null, error: workerError?.message ?? "Worker not found" };
  }

  const workerName = String(worker["Full name"] ?? "").trim();
  if (!workerName) {
    return { details: null, error: "Worker name missing" };
  }

  return {
    details: {
      bookingId: String(booking.id),
      bookingRef: bookingRefFromId(String(booking.id)),
      workerName,
      workerArea: worker.area ? String(worker.area) : null,
      serviceType: String(sr.service_type ?? ""),
      serviceDate: String(sr.service_date ?? ""),
      timeSlot: formatTimeSlotForDisplay(
        sr.preferred_time_slot ? String(sr.preferred_time_slot) : null,
        booking.service_time_slot ? String(booking.service_time_slot) : null,
      ),
      finalAmount: Number(booking.final_amount ?? 0),
    },
    error: null,
  };
}

export interface FinalizeBookingResult {
  ok: boolean;
  notified: boolean;
  alreadyConfirmed: boolean;
  error?: string;
}

/**
 * Idempotent post-accept side effects: conversation → booking_confirmed,
 * customer WhatsApp confirmation (once per booking).
 */
export async function finalizeBookingAfterWorkerAccept(
  supabase: SupabaseClient,
  input: { serviceRequestId: string; bookingId: string; workerId: string },
): Promise<FinalizeBookingResult> {
  const loaded = await loadConfirmationDetails(supabase, input);
  if (!loaded.details) {
    return { ok: false, notified: false, alreadyConfirmed: false, error: loaded.error ?? "Load failed" };
  }

  const { data: sr } = await supabase
    .from("service-request")
    .select("customer_mobile, customer_id")
    .eq("id", input.serviceRequestId)
    .maybeSingle();

  if (!sr?.customer_mobile) {
    return { ok: false, notified: false, alreadyConfirmed: false, error: "Customer mobile missing" };
  }

  const mobile = String(sr.customer_mobile);
  const conv = await getConversationByMobile(supabase, mobile);
  const ctx = (conv.data?.context ?? {}) as ConversationContext;

  const sameBooking =
    conv.data?.state === "booking_confirmed" &&
    conv.data.booking_id === input.bookingId;
  const alreadyNotified = Boolean(ctx.confirmation_sent_at);

  if (sameBooking && alreadyNotified) {
    return { ok: true, notified: false, alreadyConfirmed: true };
  }

  const nextContext: ConversationContext = {
    ...ctx,
    phase: "worker_assigned",
    booking_id: input.bookingId,
    assigned_worker_id: input.workerId,
    matching_status: "accepted",
    service_request_id: input.serviceRequestId,
    booking_ref: loaded.details.bookingRef,
    final_amount: loaded.details.finalAmount,
  };

  if (conv.data) {
    const patch = await updateConversation(supabase, conv.data.id, {
      state: "booking_confirmed",
      booking_id: input.bookingId,
      service_request_id: input.serviceRequestId,
      context: nextContext,
    });
    if (patch.error) {
      return { ok: false, notified: false, alreadyConfirmed: false, error: patch.error };
    }
  }

  if (alreadyNotified) {
    return { ok: true, notified: false, alreadyConfirmed: true };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("preferred_language")
    .eq("id", sr.customer_id)
    .maybeSingle();

  const lang =
    customer?.preferred_language === "en" ||
    customer?.preferred_language === "mr" ||
    customer?.preferred_language === "hi"
      ? customer.preferred_language
      : "mr";

  const body = bookingConfirmationMessage(lang, loaded.details);
  const send = await sendWhatsAppText(mobile, body);

  if (!send.ok) {
    return {
      ok: false,
      notified: false,
      alreadyConfirmed: false,
      error: send.error ?? "WhatsApp send failed",
    };
  }

  if (conv.data) {
    await updateConversation(supabase, conv.data.id, {
      context: {
        ...nextContext,
        confirmation_sent_at: new Date().toISOString(),
      },
    });
  }

  return { ok: true, notified: true, alreadyConfirmed: false };
}

/** Recover notification/conversation state when accept RPC already succeeded. */
export async function tryFinalizeExistingAssignment(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<FinalizeBookingResult> {
  const { data: booking } = await supabase
    .from("booking")
    .select("id, worker_id")
    .eq("sevice_request_id", serviceRequestId)
    .eq("booking_status", "assigned")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking?.id || !booking.worker_id) {
    return { ok: false, notified: false, alreadyConfirmed: false, error: "No assigned booking" };
  }

  return finalizeBookingAfterWorkerAccept(supabase, {
    serviceRequestId,
    bookingId: String(booking.id),
    workerId: String(booking.worker_id),
  });
}

export async function handleBookingConfirmedInbound(
  supabase: SupabaseClient,
  conversation: WhatsappConversation,
  customerMobile: string,
  lang: CustomerPreferredLanguage,
  messageId: string,
  text: string,
): Promise<BookingConfirmedHandleResult> {
  const ctx = conversation.context as ConversationContext;
  const bookingId = conversation.booking_id ?? (ctx.booking_id as string | undefined);

  if (!bookingId) {
    const reply = {
      en: "Your booking is confirmed. We will share details shortly.",
      mr: "तुमची booking confirm आहे. लवकरच details पाठवू.",
      hi: "आपकी booking confirm है. जल्द details भेजेंगे.",
    }[lang];
    const send = await sendWhatsAppText(customerMobile, reply);
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  const { data: booking } = await supabase
    .from("booking")
    .select("id, final_amount, service_time_slot, sevice_request_id, worker_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    const send = await sendWhatsAppText(
      customerMobile,
      {
        en: "Your booking is confirmed.",
        mr: "तुमची booking confirm आहे.",
        hi: "आपकी booking confirm है.",
      }[lang],
    );
    await updateConversation(supabase, conversation.id, {
      last_message_id: messageId,
      last_message_at: new Date().toISOString(),
    });
    return { handled: true, replied: send.ok };
  }

  const srId = String(booking.sevice_request_id);
  const loaded = await loadConfirmationDetails(supabase, {
    serviceRequestId: srId,
    bookingId: String(booking.id),
    workerId: String(booking.worker_id),
  });

  const body =
    loaded.details && (isGreeting(text) || text.length > 0)
      ? bookingConfirmedStatusReply(lang, loaded.details)
      : {
          en: "Your booking is confirmed.",
          mr: "तुमची booking confirm आहे.",
          hi: "आपकी booking confirm है.",
        }[lang];

  const send = await sendWhatsAppText(customerMobile, body);
  await updateConversation(supabase, conversation.id, {
    state: "booking_confirmed",
    last_message_id: messageId,
    last_message_at: new Date().toISOString(),
  });

  return { handled: true, replied: send.ok };
}
