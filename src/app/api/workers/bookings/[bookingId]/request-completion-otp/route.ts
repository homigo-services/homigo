import { NextResponse } from "next/server";
import { executeCompletionOtpRequest } from "@/lib/bookings/completion-otp-request";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
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
  invalid_booking_state: "Booking is not in a state that allows completion OTP.",
  already_verified: "Service completion is already verified.",
  customer_not_found: "Customer contact not found.",
  update_failed: "Unable to generate completion OTP.",
};

/** Assigned worker requests service-completion OTP for customer verification. */
export async function POST(request: Request, context: RouteContext) {
  if (!verifyWorkersImportSecret(request)) {
    return unauthorizedImportResponse();
  }

  const { bookingId } = await context.params;

  let body: { worker_id?: string };
  try {
    body = (await request.json()) as { worker_id?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const workerId = body.worker_id?.trim();
  if (!workerId) {
    return NextResponse.json(
      { success: false, message: "worker_id is required" },
      { status: 400 },
    );
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

  const result = await executeCompletionOtpRequest(supabase, {
    bookingId,
    workerId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        message: ERROR_MESSAGES[result.error ?? ""] ?? "Request failed",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    booking_id: result.bookingId,
    already_sent: result.alreadySent ?? false,
    message_sent: result.messageSent ?? false,
  });
}
