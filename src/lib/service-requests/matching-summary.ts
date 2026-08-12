import type { SupabaseClient } from "@supabase/supabase-js";
import { getBatchStatus } from "@/lib/workers/matching";
import { listOffersForServiceRequest } from "@/lib/workers/offers";

export interface ServiceRequestMatchingSummary {
  matching_status: string;
  batch_number: number;
  offer_count: number;
  pending_offers: number;
  accepted_worker_id: string | null;
  accepted_worker_name: string | null;
  offer_expires_at: string | null;
  booking_id: string | null;
  offers: Array<{
    id: string;
    worker_id: string;
    worker_name: string;
    status: string;
    expires_at: string;
    batch_number: number;
  }>;
}

export async function getServiceRequestMatchingSummary(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<{ data: ServiceRequestMatchingSummary; error: string | null }> {
  const batch = await getBatchStatus(supabase, serviceRequestId, 1);
  const offers = await listOffersForServiceRequest(supabase, serviceRequestId);

  if (batch.error || offers.error) {
    return {
      data: {
        matching_status: "unknown",
        batch_number: 1,
        offer_count: 0,
        pending_offers: 0,
        accepted_worker_id: null,
        accepted_worker_name: null,
        offer_expires_at: null,
        booking_id: null,
        offers: [],
      },
      error: batch.error ?? offers.error,
    };
  }

  const acceptedOffer = offers.data.find((o) => o.status === "accepted");

  return {
    data: {
      matching_status: batch.data.status,
      batch_number: batch.data.batchNumber,
      offer_count: batch.data.offerCount,
      pending_offers: batch.data.pendingCount,
      accepted_worker_id: batch.data.acceptedWorkerId,
      accepted_worker_name: acceptedOffer?.worker_name ?? null,
      offer_expires_at: batch.data.earliestExpiry,
      booking_id: batch.data.bookingId,
      offers: offers.data,
    },
    error: null,
  };
}
