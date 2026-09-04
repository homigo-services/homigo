import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { markBookingPaymentCompleted } from "@/lib/payments/upi-payment";
import { isRazorpayMockModeEnabled, isWhatsappMockSendEnabled } from "@/lib/env/runtime";

function isMockPayAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return isRazorpayMockModeEnabled() || isWhatsappMockSendEnabled();
}

/** Dev-only mock UPI completion — never available in production. */
export async function GET(request: Request) {
  if (!isMockPayAllowed()) {
    return NextResponse.json({ ok: false, error: "mock_disabled" }, { status: 403 });
  }

  const ref = new URL(request.url).searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ ok: false, error: "ref required" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: booking } = await supabase
    .from("booking")
    .select("final_amount, otp_verified")
    .eq("id", ref)
    .maybeSingle();

  const amountInr = Number(booking?.final_amount) || 990;
  const result = await markBookingPaymentCompleted(supabase, {
    bookingId: ref,
    providerPaymentId: `pay_mock_${Date.now()}`,
    webhookEventId: `mock_${Date.now()}`,
    amountPaise: Math.round(amountInr * 100),
    currency: "INR",
  });

  return NextResponse.json({
    ok: result.ok,
    booking_id: ref,
    already: result.alreadyCompleted,
    error: result.error,
  });
}
