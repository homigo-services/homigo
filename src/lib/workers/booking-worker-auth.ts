import type { SupabaseClient } from "@supabase/supabase-js";
import { findOfferByTokenHash } from "./offers";
import { hashOfferAcceptToken } from "./offer-tokens";

export type ResolveBookingWorkerError =
  | "booking_not_found"
  | "invalid_worker_token"
  | "worker_not_assigned"
  | "offer_not_accepted";

/** Resolve worker identity from offer token — never trust client-supplied worker IDs. */
export async function resolveWorkerIdFromOfferToken(
  supabase: SupabaseClient,
  input: { bookingId: string; rawToken: string },
): Promise<{
  workerId: string | null;
  error?: ResolveBookingWorkerError;
}> {
  const tokenHash = hashOfferAcceptToken(input.rawToken.trim());
  const offerLookup = await findOfferByTokenHash(supabase, tokenHash);

  if (offerLookup.error || !offerLookup.data) {
    return { workerId: null, error: "invalid_worker_token" };
  }

  const offer = offerLookup.data;
  if (offer.status !== "accepted") {
    return { workerId: null, error: "offer_not_accepted" };
  }

  const { data: booking, error } = await supabase
    .from("booking")
    .select("id, worker_id, sevice_request_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { workerId: null, error: "booking_not_found" };
  }

  if (String(booking.worker_id) !== String(offer.worker_id)) {
    return { workerId: null, error: "worker_not_assigned" };
  }

  if (String(booking.sevice_request_id) !== String(offer.service_request_id)) {
    return { workerId: null, error: "worker_not_assigned" };
  }

  return { workerId: String(offer.worker_id) };
}

/** Dev/tests: validate explicit worker against booking assignment. */
export async function assertWorkerAssignedToBooking(
  supabase: SupabaseClient,
  bookingId: string,
  workerId: string,
): Promise<{ ok: boolean; error?: ResolveBookingWorkerError }> {
  const { data: booking } = await supabase
    .from("booking")
    .select("worker_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return { ok: false, error: "booking_not_found" };
  }

  if (String(booking.worker_id) !== String(workerId)) {
    return { ok: false, error: "worker_not_assigned" };
  }

  return { ok: true };
}
