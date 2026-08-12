import { NextResponse } from "next/server";
import { confirmCashPayment } from "@/lib/bookings/cash-payment-completion";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
  resolveWorkerIdFromOfferToken,
} from "@/lib/workers/booking-worker-auth";
import {
  unauthorizedImportResponse,
  verifyWorkersImportSecret,
} from "@/lib/workers/api-auth";

interface RouteContext {
  params: Promise<{ bookingId: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  booking_not_found: "Booking not found.",
  worker_not_assigned: "You are not assigned to this booking.",
  invalid_payment_mode: "This booking is not awaiting cash payment.",
  payment_not_pending: "Payment is not pending.",
  otp_not_verified: "Service completion OTP must be verified first.",
  already_completed: "Payment is already completed.",
  update_failed: "Unable to confirm cash payment.",
  invalid_worker_token: "Invalid or expired worker token.",
  offer_not_accepted: "Worker offer is not accepted.",
};

async function resolveWorkerId(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  bookingId: string,
  request: Request,
  body: { worker_token?: string },
): Promise<{ workerId: string | null; error?: string; status?: number }> {
  if (body.worker_token?.trim()) {
    const resolved = await resolveWorkerIdFromOfferToken(supabase, {
      bookingId,
      rawToken: body.worker_token.trim(),
    });
    if (!resolved.workerId) {
      return {
        workerId: null,
        error: ERROR_MESSAGES[resolved.error ?? "invalid_worker_token"],
        status: 400,
      };
    }
    return { workerId: resolved.workerId };
  }

  if (!verifyWorkersImportSecret(request)) {
    return { workerId: null, error: "Unauthorized", status: 401 };
  }

  const { data: booking } = await supabase
    .from("booking")
    .select("worker_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking?.worker_id) {
    return {
      workerId: null,
      error: ERROR_MESSAGES.booking_not_found,
      status: 404,
    };
  }

  return { workerId: String(booking.worker_id) };
}

/** Assigned worker confirms cash payment received. */
export async function POST(request: Request, context: RouteContext) {
  const { bookingId } = await context.params;

  let body: { worker_token?: string };
  try {
    body = (await request.json()) as { worker_token?: string };
  } catch {
    body = {};
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Server error",
      },
      { status: 500 },
    );
  }

  const worker = await resolveWorkerId(supabase, bookingId, request, body);
  if (!worker.workerId) {
    if (worker.status === 401) {
      return unauthorizedImportResponse();
    }
    return NextResponse.json(
      { success: false, message: worker.error ?? "Unauthorized" },
      { status: worker.status ?? 400 },
    );
  }

  const result = await confirmCashPayment(supabase, {
    bookingId,
    workerId: worker.workerId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        message: ERROR_MESSAGES[result.error ?? ""] ?? "Confirmation failed",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
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
