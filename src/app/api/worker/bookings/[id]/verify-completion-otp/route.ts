import { NextResponse } from "next/server";
import { executeWorkerCompletionOtpVerification } from "@/lib/bookings/completion-otp-verify";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  booking_not_found: "Booking not found.",
  worker_not_assigned: "You are not assigned to this booking.",
  worker_mismatch: "You are not assigned to this booking.",
  no_otp_pending: "No completion OTP is pending. Request OTP first.",
  already_verified: "Completion already verified.",
  expired: "OTP has expired. Request a new OTP.",
  too_many_attempts: "Too many incorrect attempts. Request a new OTP.",
  invalid_otp: "Incorrect OTP.",
  update_failed: "Unable to verify OTP.",
};

/** Worker submits customer-provided completion OTP. */
export async function POST(request: Request, context: RouteContext) {
  const { id: bookingId } = await context.params;

  let body: { otp?: string };
  try {
    body = (await request.json()) as { otp?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const otp = body.otp?.trim();
  if (!otp) {
    return NextResponse.json({ ok: false, error: "otp_required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const workerId = await getWorkerSessionFromRequest(supabase, request);
    if (!workerId) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const { data: booking } = await supabase
      .from("booking")
      .select("worker_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking || String(booking.worker_id) !== workerId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const result = await executeWorkerCompletionOtpVerification(supabase, {
      bookingId,
      workerId,
      rawOtp: otp,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: ERROR_MESSAGES[result.error ?? ""] ?? "Verification failed",
          attempts_remaining: result.attemptsRemaining,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      already_verified: result.alreadyVerified ?? false,
      payment_unlocked: result.paymentUnlocked ?? true,
      customer_notified: result.customerNotified ?? false,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
