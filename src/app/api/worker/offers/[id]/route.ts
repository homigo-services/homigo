import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getWorkerSessionFromRequest } from "@/lib/workers/auth";
import {
  acceptWorkerOffer,
  finalizeWorkerOfferAcceptance,
  rejectWorkerOffer,
} from "@/lib/workers/offer-actions";

async function authorizeOffer(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  request: Request,
  offerId: string,
): Promise<{ workerId: string } | NextResponse> {
  const workerId = await getWorkerSessionFromRequest(supabase, request);
  if (!workerId) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { data: offer } = await supabase
    .from("worker_service_offers")
    .select("worker_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer || String(offer.worker_id) !== workerId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return { workerId };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: offerId } = await context.params;
  const supabase = createSupabaseServiceClient();
  const auth = await authorizeOffer(supabase, request, offerId);
  if (auth instanceof NextResponse) return auth;

  const result = await acceptWorkerOffer(supabase, {
    offerId,
    workerId: auth.workerId,
    channel: "app",
  });

  await finalizeWorkerOfferAcceptance(supabase, result);

  if (!result.ok) {
    const status =
      result.error === "offer_not_found" || result.error === "worker_mismatch"
        ? 403
        : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message:
          result.error === "worker_already_assigned" ||
          result.error === "already_accepted"
            ? "Request is no longer available."
            : result.message,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    booking_id: result.bookingId,
    offer_id: result.offerId,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: offerId } = await context.params;
  const supabase = createSupabaseServiceClient();
  const auth = await authorizeOffer(supabase, request, offerId);
  if (auth instanceof NextResponse) return auth;

  const result = await rejectWorkerOffer(supabase, {
    offerId,
    workerId: auth.workerId,
    channel: "app",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
