import type { SupabaseClient } from "@supabase/supabase-js";
import { createRazorpayPaymentLink } from "./razorpay";
import { HOMIGO_UPI_PAYMENT_AMOUNT } from "@/lib/whatsapp/homigo-services";

export type PaymentCompletionError =
  | "booking_not_found"
  | "otp_not_verified"
  | "wrong_payment_mode"
  | "amount_mismatch"
  | "currency_mismatch"
  | "already_completed";

export async function initiateUpiPaymentForBooking(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    customerMobile: string;
    amountInr: number;
  },
): Promise<{ ok: boolean; paymentLinkUrl?: string; error?: string }> {
  const { data: booking } = await supabase
    .from("booking")
    .select("id, otp_verified, Payment_mode, payment_status")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (!booking) {
    return { ok: false, error: "Booking not found" };
  }

  if (!booking.otp_verified) {
    return { ok: false, error: "Completion OTP must be verified before UPI payment" };
  }

  const expectedAmount = input.amountInr || HOMIGO_UPI_PAYMENT_AMOUNT;

  const { data: existing } = await supabase
    .from("booking_online_payments")
    .select("id, payment_status, payment_link_url, provider_payment_link_id, amount")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  if (existing?.payment_status === "completed") {
    return { ok: true, paymentLinkUrl: existing.payment_link_url ?? undefined };
  }

  if (existing?.payment_link_url) {
    return { ok: true, paymentLinkUrl: String(existing.payment_link_url) };
  }

  const link = await createRazorpayPaymentLink({
    amountInr: expectedAmount,
    description: `Homigo booking ${input.bookingId.slice(0, 8)}`,
    customerMobile: input.customerMobile,
    referenceId: input.bookingId,
  });

  if (!link.ok || !link.url) {
    return { ok: false, error: link.error ?? "Failed to create payment link" };
  }

  const now = new Date().toISOString();
  if (existing?.id) {
    await supabase
      .from("booking_online_payments")
      .update({
        amount: expectedAmount,
        payment_link_url: link.url,
        provider_payment_link_id: link.linkId ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("booking_online_payments").insert({
      booking_id: input.bookingId,
      payment_mode: "upi",
      payment_status: "pending",
      amount: expectedAmount,
      currency: "INR",
      provider: "razorpay",
      payment_link_url: link.url,
      provider_payment_link_id: link.linkId ?? null,
      updated_at: now,
    });
  }

  return { ok: true, paymentLinkUrl: link.url };
}

export async function markBookingPaymentCompleted(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    providerPaymentId?: string;
    webhookEventId?: string;
    amountPaise?: number;
    currency?: string;
  },
): Promise<{ ok: boolean; alreadyCompleted?: boolean; error?: PaymentCompletionError }> {
  const { data: booking } = await supabase
    .from("booking")
    .select(
      "id, payment_status, booking_status, sevice_request_id, otp_verified, Payment_mode, final_amount",
    )
    .eq("id", input.bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, error: "booking_not_found" };

  if (
    booking.payment_status === "completed" &&
    booking.booking_status === "completed"
  ) {
    return { ok: true, alreadyCompleted: true };
  }

  if (!booking.otp_verified) {
    return { ok: false, error: "otp_not_verified" };
  }

  const mode = String(booking.Payment_mode ?? "").toLowerCase();
  if (mode && mode !== "upi") {
    return { ok: false, error: "wrong_payment_mode" };
  }

  const { data: paymentRow } = await supabase
    .from("booking_online_payments")
    .select("id, amount, currency, payment_status")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  const expectedAmountInr = Number(
    paymentRow?.amount ?? booking.final_amount ?? HOMIGO_UPI_PAYMENT_AMOUNT,
  );
  const expectedCurrency = String(paymentRow?.currency ?? "INR").toUpperCase();

  if (input.currency && input.currency.toUpperCase() !== expectedCurrency) {
    return { ok: false, error: "currency_mismatch" };
  }

  if (input.amountPaise != null) {
    const receivedInr = input.amountPaise / 100;
    if (Math.abs(receivedInr - expectedAmountInr) > 0.01) {
      return { ok: false, error: "amount_mismatch" };
    }
  }

  const now = new Date().toISOString();

  const { data: updatedBooking } = await supabase
    .from("booking")
    .update({
      payment_status: "completed",
      booking_status: "completed",
      payment_received_at: now,
      final_amount: expectedAmountInr,
      updated_at: now,
    })
    .eq("id", input.bookingId)
    .eq("otp_verified", true)
    .neq("payment_status", "completed")
    .select("id")
    .maybeSingle();

  if (!updatedBooking) {
    const { data: current } = await supabase
      .from("booking")
      .select("payment_status, booking_status")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (
      current?.payment_status === "completed" &&
      current?.booking_status === "completed"
    ) {
      return { ok: true, alreadyCompleted: true };
    }
    return { ok: false, error: "otp_not_verified" };
  }

  if (paymentRow?.id) {
    await supabase
      .from("booking_online_payments")
      .update({
        payment_status: "completed",
        provider_payment_id: input.providerPaymentId ?? null,
        last_webhook_event_id: input.webhookEventId ?? null,
        paid_at: now,
        updated_at: now,
      })
      .eq("booking_id", input.bookingId);
  }

  if (booking.sevice_request_id) {
    await supabase
      .from("service-request")
      .update({ status: "completed", updated_at: now })
      .eq("id", booking.sevice_request_id);
  }

  return { ok: true };
}
