import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveRateCard } from "@/lib/bookings/rate-card";
import { resolveServiceId } from "./matching";
import { findOfferByTokenHash } from "./offers";
import { hashOfferAcceptToken } from "./offer-tokens";

export type AcceptOfferErrorCode =
  | "invalid_token"
  | "offer_not_pending"
  | "offer_expired"
  | "already_accepted"
  | "worker_already_assigned"
  | "rate_card_not_accepted"
  | "service_request_not_found"
  | "rate_card_missing"
  | "rpc_failed"
  | "unknown";

export interface AcceptWorkerOfferResult {
  ok: boolean;
  error?: AcceptOfferErrorCode;
  message?: string;
  bookingId?: string;
  workerId?: string;
  serviceRequestId?: string;
  offerId?: string;
}

interface RpcAcceptResult {
  ok?: boolean;
  error?: string;
  booking_id?: string;
  worker_id?: string;
  service_request_id?: string;
  offer_id?: string;
}

export async function acceptWorkerOfferByToken(
  supabase: SupabaseClient,
  rawToken: string,
): Promise<AcceptWorkerOfferResult> {
  const tokenHash = hashOfferAcceptToken(rawToken.trim());
  const offerLookup = await findOfferByTokenHash(supabase, tokenHash);

  if (offerLookup.error) {
    return { ok: false, error: "rpc_failed", message: offerLookup.error };
  }

  if (!offerLookup.data) {
    return { ok: false, error: "invalid_token" };
  }

  const offer = offerLookup.data;
  const offerContext = {
    serviceRequestId: String(offer.service_request_id),
    workerId: String(offer.worker_id),
    offerId: offer.id,
  };

  const { data: sr, error: srError } = await supabase
    .from("service-request")
    .select("*")
    .eq("id", offer.service_request_id)
    .maybeSingle();

  if (srError || !sr) {
    return { ok: false, error: "service_request_not_found", ...offerContext };
  }

  if (!sr.rate_card_accepted) {
    return { ok: false, error: "rate_card_not_accepted", ...offerContext };
  }

  const resolved = await resolveServiceId(supabase, {
    serviceType: String(sr.service_type),
  });

  if (!resolved.serviceId) {
    return {
      ok: false,
      error: "rate_card_missing",
      message: resolved.error ?? undefined,
      ...offerContext,
    };
  }

  const rate = await getActiveRateCard(
    supabase,
    resolved.serviceId,
    String(sr.service_date),
  );

  if (!rate.card || !rate.amounts) {
    return { ok: false, error: "rate_card_missing", ...offerContext };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "accept_worker_service_offer",
    {
      p_offer_id: offer.id,
      p_token_hash: tokenHash,
      p_customer_id: sr.customer_id,
      p_service_date: sr.service_date,
      p_service_time_slot: sr.preferred_time_slot,
      p_base_amount: rate.amounts.base_amount,
      p_lead_charge: rate.amounts.lead_charge,
      p_platform_commission: rate.amounts.platform_commission,
      p_worker_earning: rate.amounts.worker_earning,
      p_final_amount: rate.amounts.final_amount,
    },
  );

  if (rpcError) {
    console.error("[worker-offer] rpc error:", rpcError.message);
    return {
      ok: false,
      error: "rpc_failed",
      message: rpcError.message,
      ...offerContext,
    };
  }

  const result = rpcData as RpcAcceptResult;

  if (!result?.ok) {
    const code = (result?.error ?? "unknown") as AcceptOfferErrorCode;
    return {
      ok: false,
      error: code,
      message: result?.error,
      serviceRequestId: String(offer.service_request_id),
      workerId: String(offer.worker_id),
      offerId: offer.id,
    };
  }

  return {
    ok: true,
    bookingId: result.booking_id ? String(result.booking_id) : undefined,
    workerId: result.worker_id ? String(result.worker_id) : undefined,
    serviceRequestId: result.service_request_id
      ? String(result.service_request_id)
      : undefined,
    offerId: result.offer_id ? String(result.offer_id) : offer.id,
  };
}
