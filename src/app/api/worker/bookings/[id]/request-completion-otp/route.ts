import { NextResponse } from "next/server";
import { canExposeDevOtpInApi, isWhatsappMockSendEnabled } from "@/lib/env/runtime";
import { executeCompletionOtpRequest } from "@/lib/bookings/completion-otp-request";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  booking_not_found: "Booking not found.",
  worker_not_assigned: "You are not assigned to this booking.",
  invalid_booking_state: "Booking is not ready for completion OTP.",
  already_verified: "Service completion is already verified.",
  customer_not_found: "Customer contact not found.",
  update_failed: "Unable to generate completion OTP.",
};

/** Assigned worker requests completion OTP (sent to customer WhatsApp/SMS). */
export async function POST(_request: Request, context: RouteContext) {
  const { id: bookingId } = await context.params;

  try {
    const supabase = createSupabaseServiceClient();
    const workerId = await getWorkerSessionFromRequest(supabase, _request);
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

    const result = await executeCompletionOtpRequest(supabase, {
      bookingId,
      workerId,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: ERROR_MESSAGES[result.error ?? ""] ?? "Request failed",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      booking_id: result.bookingId,
      already_sent: result.alreadySent ?? false,
      message_sent: result.messageSent ?? false,
      ...(canExposeDevOtpInApi() && isWhatsappMockSendEnabled() && result.devOtp
        ? { dev_otp: result.devOtp }
        : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
