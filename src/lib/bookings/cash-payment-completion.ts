import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPreferredLanguage } from "@/lib/customers/types";
import { getConversationByMobile, updateConversation } from "@/lib/whatsapp/conversation";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { cashPaymentCompletedMessage } from "@/lib/whatsapp/completion-messages";

export type ConfirmCashPaymentError =
  | "booking_not_found"
  | "worker_not_assigned"
  | "invalid_payment_mode"
  | "payment_not_pending"
  | "otp_not_verified"
  | "already_completed"
  | "update_failed"
  | "customer_not_found";

export interface ConfirmCashPaymentResult {
  ok: boolean;
  error?: ConfirmCashPaymentError;
  alreadyCompleted?: boolean;
  bookingId?: string;
  paymentStatus?: string;
  paymentReceivedAt?: string | null;
  bookingStatus?: string;
  serviceRequestId?: string;
  messageSent?: boolean;
}

interface BookingCashRow {
  id: string;
  worker_id: string;
  customer_id: string;
  sevice_request_id: string;
  Payment_mode: string | null;
  payment_status: string | null;
  payment_received_at: string | null;
  booking_status: string | null;
  otp_verified: boolean | null;
  final_amount: number | null;
}

function bookingRefFromId(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function isCashCompleted(row: BookingCashRow): boolean {
  return (
    String(row.payment_status ?? "") === "completed" &&
    String(row.booking_status ?? "") === "completed" &&
    row.payment_received_at != null
  );
}

async function loadBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingCashRow | null> {
  const { data, error } = await supabase
    .from("booking")
    .select(
      "id, worker_id, customer_id, sevice_request_id, Payment_mode, payment_status, payment_received_at, booking_status, otp_verified, final_amount",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) return null;
  return data as BookingCashRow;
}

async function notifyCustomerCashCompleted(
  supabase: SupabaseClient,
  input: {
    booking: BookingCashRow;
    workerName: string;
    serviceType: string;
    bookingRef: string;
  },
): Promise<boolean> {
  const { data: customer } = await supabase
    .from("customers")
    .select("mobile, preferred_language")
    .eq("id", input.booking.customer_id)
    .maybeSingle();

  if (!customer?.mobile) return false;

  const lang =
    customer.preferred_language === "en" ||
    customer.preferred_language === "mr" ||
    customer.preferred_language === "hi"
      ? customer.preferred_language
      : "mr";

  const conv = await getConversationByMobile(supabase, String(customer.mobile));
  const ctx = (conv.data?.context as Record<string, unknown> | undefined) ?? {};

  if (ctx.cash_completion_sent_at) {
    return false;
  }

  const body = cashPaymentCompletedMessage(lang, {
    bookingRef: input.bookingRef,
    serviceType: input.serviceType,
    finalAmount: Number(input.booking.final_amount ?? 0),
    workerName: input.workerName,
  });

  const send = await sendWhatsAppText(String(customer.mobile), body);
  const now = new Date().toISOString();

  if (conv.data) {
    await updateConversation(supabase, conv.data.id, {
      state: "completed",
      booking_id: input.booking.id,
      service_request_id: input.booking.sevice_request_id,
      context: {
        ...ctx,
        phase: "completed",
        booking_id: input.booking.id,
        service_request_id: input.booking.sevice_request_id,
        cash_completion_sent_at: now,
        payment_completed_at: now,
        final_amount: input.booking.final_amount ?? undefined,
        payment_mode: "cash",
        payment_status: "completed",
        booking_ref: input.bookingRef,
      },
    });
  }

  return send.ok;
}

/** Worker confirms cash received — idempotent, conditional update for concurrency safety. */
export async function confirmCashPayment(
  supabase: SupabaseClient,
  input: { bookingId: string; workerId: string },
): Promise<ConfirmCashPaymentResult> {
  const booking = await loadBooking(supabase, input.bookingId);

  if (!booking) {
    return { ok: false, error: "booking_not_found" };
  }

  if (String(booking.worker_id) !== String(input.workerId)) {
    return { ok: false, error: "worker_not_assigned" };
  }

  if (isCashCompleted(booking)) {
    return {
      ok: true,
      alreadyCompleted: true,
      bookingId: booking.id,
      paymentStatus: String(booking.payment_status),
      paymentReceivedAt: booking.payment_received_at,
      bookingStatus: String(booking.booking_status),
      serviceRequestId: String(booking.sevice_request_id),
      messageSent: false,
    };
  }

  if (String(booking.Payment_mode ?? "").toLowerCase() !== "cash") {
    return { ok: false, error: "invalid_payment_mode" };
  }

  if (String(booking.payment_status ?? "") !== "pending") {
    return { ok: false, error: "payment_not_pending" };
  }

  if (!booking.otp_verified) {
    return { ok: false, error: "otp_not_verified" };
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("booking")
    .update({
      payment_status: "completed",
      payment_received_at: now,
      booking_status: "completed",
      updated_at: now,
    })
    .eq("id", input.bookingId)
    .eq("worker_id", input.workerId)
    .eq("Payment_mode", "cash")
    .eq("payment_status", "pending")
    .eq("otp_verified", true)
    .select(
      "id, worker_id, customer_id, sevice_request_id, payment_status, payment_received_at, booking_status, final_amount",
    )
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: "update_failed" };
  }

  if (!updated) {
    const refreshed = await loadBooking(supabase, input.bookingId);
    if (refreshed && isCashCompleted(refreshed)) {
      return {
        ok: true,
        alreadyCompleted: true,
        bookingId: refreshed.id,
        paymentStatus: String(refreshed.payment_status),
        paymentReceivedAt: refreshed.payment_received_at,
        bookingStatus: String(refreshed.booking_status),
        serviceRequestId: String(refreshed.sevice_request_id),
        messageSent: false,
      };
    }
    return { ok: false, error: "update_failed" };
  }

  const { error: srError } = await supabase
    .from("service-request")
    .update({ status: "completed" })
    .eq("id", updated.sevice_request_id)
    .neq("status", "completed");

  if (srError) {
    console.error("[cash-completion] service-request update failed:", srError.message);
  }

  const { data: sr } = await supabase
    .from("service-request")
    .select("service_type")
    .eq("id", updated.sevice_request_id)
    .maybeSingle();

  const { data: worker } = await supabase
    .from("workers")
    .select('"Full name"')
    .eq("id", updated.worker_id)
    .maybeSingle();

  const bookingRef = bookingRefFromId(String(updated.id));
  const messageSent = await notifyCustomerCashCompleted(supabase, {
    booking: updated as BookingCashRow,
    workerName: String(worker?.["Full name"] ?? "Worker"),
    serviceType: String(sr?.service_type ?? "Service"),
    bookingRef,
  });

  return {
    ok: true,
    alreadyCompleted: false,
    bookingId: String(updated.id),
    paymentStatus: String(updated.payment_status),
    paymentReceivedAt: updated.payment_received_at,
    bookingStatus: String(updated.booking_status),
    serviceRequestId: String(updated.sevice_request_id),
    messageSent,
  };
}
