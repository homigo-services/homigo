import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { acceptWorkerOfferByToken } from "@/lib/workers/offer-acceptance";
import {
  finalizeBookingAfterWorkerAccept,
  tryFinalizeExistingAssignment,
} from "@/lib/whatsapp/booking-confirmation";

function htmlPage(title: string, body: string, ok: boolean): NextResponse {
  const color = ok ? "#059669" : "#dc2626";
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;max-width:32rem;margin:2rem auto;padding:1rem"><h1 style="color:${color}">${title}</h1><p>${body}</p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function finalizeAfterAccept(
  serviceRequestId: string,
  bookingId: string,
  workerId: string,
): Promise<void> {
  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch {
    return;
  }

  const result = await finalizeBookingAfterWorkerAccept(supabase, {
    serviceRequestId,
    bookingId,
    workerId,
  });

  if (!result.ok && result.error) {
    console.error("[worker-offer] finalize booking failed:", result.error);
  }
}

async function recoverFinalize(serviceRequestId: string | undefined): Promise<void> {
  if (!serviceRequestId) return;

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch {
    return;
  }

  await tryFinalizeExistingAssignment(supabase, serviceRequestId);
}

/** Worker offer acceptance — GET shows simple HTML; POST returns JSON. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch {
    return htmlPage("Error", "Server configuration error.", false);
  }

  const result = await acceptWorkerOfferByToken(supabase, decodeURIComponent(token));

  if (!result.ok) {
    if (
      result.error === "already_accepted" ||
      result.error === "worker_already_assigned"
    ) {
      await recoverFinalize(result.serviceRequestId);
    }

    const messages: Record<string, string> = {
      invalid_token: "This accept link is invalid.",
      offer_expired: "This offer has expired.",
      already_accepted: "This offer was already accepted.",
      worker_already_assigned: "Another worker has already been assigned.",
      offer_not_pending: "This offer is no longer available.",
      rate_card_not_accepted: "The customer has not accepted the rate card.",
      rate_card_missing: "Pricing is unavailable for this service.",
    };
    return htmlPage(
      "Offer not accepted",
      messages[result.error ?? "unknown"] ?? result.message ?? "Unable to accept offer.",
      false,
    );
  }

  if (result.serviceRequestId && result.bookingId && result.workerId) {
    await finalizeAfterAccept(
      result.serviceRequestId,
      result.bookingId,
      result.workerId,
    );
  }

  return htmlPage(
    "Job accepted",
    `Booking ${result.bookingId?.slice(0, 8).toUpperCase() ?? ""} created successfully. The customer has been notified.`,
    true,
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

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

  const result = await acceptWorkerOfferByToken(supabase, decodeURIComponent(token));

  if (!result.ok) {
    if (
      result.error === "already_accepted" ||
      result.error === "worker_already_assigned"
    ) {
      await recoverFinalize(result.serviceRequestId);
    }

    return NextResponse.json(
      { success: false, error: result.error, message: result.message },
      { status: 400 },
    );
  }

  if (result.serviceRequestId && result.bookingId && result.workerId) {
    await finalizeAfterAccept(
      result.serviceRequestId,
      result.bookingId,
      result.workerId,
    );
  }

  return NextResponse.json({
    success: true,
    booking_id: result.bookingId,
    worker_id: result.workerId,
    service_request_id: result.serviceRequestId,
    offer_id: result.offerId,
  });
}
