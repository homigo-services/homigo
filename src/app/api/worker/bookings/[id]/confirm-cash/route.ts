import { NextResponse } from "next/server";
import { confirmCashPayment } from "@/lib/bookings/cash-payment-completion";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  booking_not_found: "Booking not found.",
  worker_not_assigned: "You are not assigned to this booking.",
  invalid_payment_mode: "Customer has not selected Cash payment.",
  payment_not_pending: "Payment is not pending.",
  otp_not_verified: "Completion OTP must be verified first.",
  already_completed: "Payment is already completed.",
  update_failed: "Unable to confirm cash payment.",
};

/** Worker confirms cash payment received (₹1000). */
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

    const result = await confirmCashPayment(supabase, { bookingId, workerId });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: ERROR_MESSAGES[result.error ?? ""] ?? "Confirmation failed",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      already_completed: result.alreadyCompleted ?? false,
      booking_id: result.bookingId,
      payment_status: result.paymentStatus,
      booking_status: result.bookingStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
