import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { confirmCashPayment } from "@/lib/bookings/cash-payment-completion";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { assertWorkerAssignedToBooking } from "@/lib/workers/booking-worker-auth";

/** Dev-only: worker confirms cash received (simulator/tests). */
export async function POST(request: Request) {
  const blocked = devOnlyJsonResponse();
  if (blocked) return blocked;

  let body: { bookingId?: string; workerId?: string };
  try {
    body = (await request.json()) as { bookingId?: string; workerId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bookingId = body.bookingId?.trim();
  if (!bookingId) {
    return Response.json({ error: "bookingId is required" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Supabase unavailable" },
      { status: 500 },
    );
  }

  let workerId = body.workerId?.trim();
  if (!workerId) {
    const { data: booking } = await supabase
      .from("booking")
      .select("worker_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking?.worker_id) {
      return Response.json({ success: false, error: "booking_not_found" }, { status: 400 });
    }
    workerId = String(booking.worker_id);
  } else {
    const assigned = await assertWorkerAssignedToBooking(supabase, bookingId, workerId);
    if (!assigned.ok) {
      return Response.json(
        { success: false, error: assigned.error ?? "worker_not_assigned" },
        { status: 400 },
      );
    }
  }

  const result = await confirmCashPayment(supabase, { bookingId, workerId });

  if (!result.ok) {
    return Response.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  }

  return Response.json({
    success: true,
    already_completed: result.alreadyCompleted ?? false,
    booking_id: result.bookingId,
    payment_status: result.paymentStatus,
    payment_received_at: result.paymentReceivedAt,
    booking_status: result.bookingStatus,
    service_request_id: result.serviceRequestId,
    message_sent: result.messageSent ?? false,
  });
}
