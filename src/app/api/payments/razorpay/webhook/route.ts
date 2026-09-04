import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  getRazorpayConfig,
  verifyRazorpayWebhookSignature,
} from "@/lib/payments/razorpay";
import { markBookingPaymentCompleted } from "@/lib/payments/upi-payment";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { upiPaymentCompletedMessage } from "@/lib/whatsapp/completion-messages";
import { HOMIGO_UPI_PAYMENT_AMOUNT } from "@/lib/whatsapp/homigo-services";

type RazorpayWebhookPayload = {
  event?: string;
  id?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        status?: string;
        amount?: number;
        currency?: string;
        notes?: { booking_id?: string };
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        status?: string;
        amount?: number;
        currency?: string;
        reference_id?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const config = getRazorpayConfig();

  if (!config) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  if (!config.mockMode || process.env.NODE_ENV === "production") {
    if (!config.webhookSecret) {
      return NextResponse.json({ ok: false, error: "webhook_secret_missing" }, { status: 503 });
    }
    if (!verifyRazorpayWebhookSignature(rawBody, signature, config.webhookSecret)) {
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventId = payload.id ?? `evt_${Date.now()}`;
  const supabase = createSupabaseServiceClient();

  const { error: dedupeError } = await supabase.from("payment_webhook_events").insert({
    provider: "razorpay",
    event_id: eventId,
    payload: payload as unknown as Record<string, unknown>,
  });

  if (dedupeError?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = payload.event ?? "";
  let bookingId: string | undefined;
  let paymentId: string | undefined;
  let amountPaise: number | undefined;
  let currency: string | undefined;

  if (event === "payment.captured") {
    const entity = payload.payload?.payment?.entity;
    paymentId = entity?.id;
    bookingId = entity?.notes?.booking_id;
    amountPaise = entity?.amount;
    currency = entity?.currency;
    if (entity?.status && entity.status !== "captured") {
      return NextResponse.json({ ok: true, ignored: true, reason: "not_captured" });
    }
  } else if (event === "payment_link.paid") {
    const entity = payload.payload?.payment_link?.entity;
    bookingId = entity?.reference_id;
    amountPaise = entity?.amount;
    currency = entity?.currency;
    paymentId = payload.payload?.payment?.entity?.id;
  }

  if (!bookingId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await markBookingPaymentCompleted(supabase, {
    bookingId,
    providerPaymentId: paymentId,
    webhookEventId: eventId,
    amountPaise,
    currency,
  });

  if (!result.ok && !result.alreadyCompleted) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "payment_completion_failed" },
      { status: result.error === "amount_mismatch" || result.error === "currency_mismatch" ? 422 : 400 },
    );
  }

  if (result.ok && !result.alreadyCompleted) {
    const { data: booking } = await supabase
      .from("booking")
      .select("customer_id, final_amount")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking?.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("mobile, preferred_language")
        .eq("id", booking.customer_id)
        .maybeSingle();

      if (customer?.mobile) {
        const lang = (customer.preferred_language ?? "mr") as "mr" | "hi" | "en";
        const ref = bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
        await sendWhatsAppText(
          String(customer.mobile),
          upiPaymentCompletedMessage(
            lang,
            ref,
            Number(booking.final_amount) || HOMIGO_UPI_PAYMENT_AMOUNT,
          ),
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    booking_id: bookingId,
    already: result.alreadyCompleted ?? false,
  });
}
