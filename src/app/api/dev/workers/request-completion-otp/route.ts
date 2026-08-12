import { devOnlyJsonResponse } from "@/lib/dev/guard";
import { executeCompletionOtpRequest } from "@/lib/bookings/completion-otp-request";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

/** Dev-only: trigger worker completion OTP request for simulator/tests. */
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
  const workerId = body.workerId?.trim();

  if (!bookingId || !workerId) {
    return Response.json(
      { error: "bookingId and workerId are required" },
      { status: 400 },
    );
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

  const result = await executeCompletionOtpRequest(supabase, { bookingId, workerId });

  if (!result.ok) {
    return Response.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  }

  return Response.json({
    success: true,
    booking_id: result.bookingId,
    already_sent: result.alreadySent ?? false,
    message_sent: result.messageSent ?? false,
    ...(process.env.WHATSAPP_MOCK_SEND === "true" && result.devOtp
      ? { dev_otp: result.devOtp }
      : {}),
  });
}
