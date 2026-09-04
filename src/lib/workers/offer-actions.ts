import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveRateCard } from "@/lib/bookings/rate-card";
import { HOMIGO_SERVICE_BASE_PRICE } from "@/lib/whatsapp/homigo-services";
import { resolveServiceId } from "./matching";
import { findOfferByTokenHash } from "./offers";
import { hashOfferAcceptToken } from "./offer-tokens";
import { workerLog } from "./worker-log";

export type WorkerOfferChannel = "app" | "whatsapp" | "sms" | "token_link";

export type AcceptOfferErrorCode =
  | "invalid_token"
  | "offer_not_found"
  | "worker_mismatch"
  | "offer_not_pending"
  | "offer_expired"
  | "already_accepted"
  | "worker_already_assigned"
  | "rate_card_not_accepted"
  | "service_request_not_found"
  | "rate_card_missing"
  | "rpc_failed"
  | "unknown";

export type RejectOfferErrorCode =
  | "offer_not_found"
  | "worker_mismatch"
  | "offer_not_pending"
  | "offer_expired"
  | "already_accepted"
  | "worker_already_assigned"
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
  channel?: WorkerOfferChannel;
}

export interface RejectWorkerOfferResult {
  ok: boolean;
  error?: RejectOfferErrorCode;
  message?: string;
  offerId?: string;
  workerId?: string;
  serviceRequestId?: string;
  channel?: WorkerOfferChannel;
}

interface RpcAcceptResult {
  ok?: boolean;
  error?: string;
  booking_id?: string;
  worker_id?: string;
  service_request_id?: string;
  offer_id?: string;
}

interface OfferRow {
  id: string;
  service_request_id: string;
  worker_id: string;
  status: string;
  expires_at: string;
  batch_number?: number;
}

async function loadOfferById(
  supabase: SupabaseClient,
  offerId: string,
): Promise<{ data: OfferRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("worker_service_offers")
    .select("id, service_request_id, worker_id, status, expires_at, batch_number")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }

  return {
    data: {
      id: String(data.id),
      service_request_id: String(data.service_request_id),
      worker_id: String(data.worker_id),
      status: String(data.status),
      expires_at: String(data.expires_at),
      batch_number: data.batch_number ? Number(data.batch_number) : undefined,
    },
    error: null,
  };
}

async function buildAcceptRpcParams(
  supabase: SupabaseClient,
  offer: OfferRow,
): Promise<{
  params: Record<string, unknown> | null;
  error: AcceptOfferErrorCode | null;
  message?: string;
}> {
  const { data: sr, error: srError } = await supabase
    .from("service-request")
    .select("*")
    .eq("id", offer.service_request_id)
    .maybeSingle();

  if (srError || !sr) {
    return { params: null, error: "service_request_not_found" };
  }

  if (!sr.rate_card_accepted) {
    return { params: null, error: "rate_card_not_accepted" };
  }

  const resolved = await resolveServiceId(supabase, {
    serviceType: String(sr.service_type),
  });

  if (!resolved.serviceId) {
    return {
      params: null,
      error: "rate_card_missing",
      message: resolved.error ?? undefined,
    };
  }

  const rate = await getActiveRateCard(
    supabase,
    resolved.serviceId,
    String(sr.service_date),
  );

  if (!rate.card || !rate.amounts) {
    return { params: null, error: "rate_card_missing" };
  }

  return {
    params: {
      p_offer_id: offer.id,
      p_customer_id: sr.customer_id,
      p_service_date: sr.service_date,
      p_service_time_slot: sr.preferred_time_slot,
      p_base_amount: rate.amounts.base_amount,
      p_lead_charge: rate.amounts.lead_charge,
      p_platform_commission: rate.amounts.platform_commission,
      p_worker_earning: rate.amounts.worker_earning,
      p_final_amount: HOMIGO_SERVICE_BASE_PRICE,
    },
    error: null,
  };
}

function mapRpcAcceptResult(
  result: RpcAcceptResult | null,
  offer: OfferRow,
  channel: WorkerOfferChannel,
): AcceptWorkerOfferResult {
  if (!result?.ok) {
    const code = (result?.error ?? "unknown") as AcceptOfferErrorCode;
    workerLog("WORKER-OFFER-ACCEPT", {
      serviceRequestId: offer.service_request_id,
      offerId: offer.id,
      workerId: offer.worker_id,
      batchNumber: offer.batch_number,
      channel,
      status: "failed",
      result: code,
    });
    return {
      ok: false,
      error: code,
      message: result?.error,
      serviceRequestId: offer.service_request_id,
      workerId: offer.worker_id,
      offerId: offer.id,
      channel,
    };
  }

  workerLog("WORKER-OFFER-ACCEPT", {
    serviceRequestId: offer.service_request_id,
    offerId: offer.id,
    workerId: offer.worker_id,
    batchNumber: offer.batch_number,
    channel,
    status: "accepted",
    result: result.booking_id ? "booking_created" : "ok",
  });

  return {
    ok: true,
    bookingId: result.booking_id ? String(result.booking_id) : undefined,
    workerId: result.worker_id ? String(result.worker_id) : offer.worker_id,
    serviceRequestId: result.service_request_id
      ? String(result.service_request_id)
      : offer.service_request_id,
    offerId: result.offer_id ? String(result.offer_id) : offer.id,
    channel,
  };
}

/** Canonical worker offer acceptance — all channels must call this. */
export async function acceptWorkerOffer(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    workerId: string;
    channel: WorkerOfferChannel;
    tokenHash?: string;
  },
): Promise<AcceptWorkerOfferResult> {
  const offerLookup = await loadOfferById(supabase, input.offerId);
  if (offerLookup.error) {
    return { ok: false, error: "rpc_failed", message: offerLookup.error, channel: input.channel };
  }
  if (!offerLookup.data) {
    return { ok: false, error: "offer_not_found", channel: input.channel };
  }

  const offer = offerLookup.data;
  if (offer.worker_id !== input.workerId) {
    return {
      ok: false,
      error: "worker_mismatch",
      offerId: offer.id,
      workerId: input.workerId,
      serviceRequestId: offer.service_request_id,
      channel: input.channel,
    };
  }

  const rpcContext = await buildAcceptRpcParams(supabase, offer);
  if (!rpcContext.params || rpcContext.error) {
    return {
      ok: false,
      error: rpcContext.error ?? "unknown",
      message: rpcContext.message,
      offerId: offer.id,
      workerId: offer.worker_id,
      serviceRequestId: offer.service_request_id,
      channel: input.channel,
    };
  }

  const rpcName =
    input.channel === "token_link" && input.tokenHash
      ? "accept_worker_service_offer"
      : "accept_worker_service_offer_by_id";

  const rpcArgs =
    rpcName === "accept_worker_service_offer"
      ? { ...rpcContext.params, p_token_hash: input.tokenHash }
      : { ...rpcContext.params, p_worker_id: input.workerId, p_channel: input.channel };

  const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, rpcArgs);

  if (rpcError) {
    workerLog("WORKER-OFFER-ACCEPT", {
      serviceRequestId: offer.service_request_id,
      offerId: offer.id,
      workerId: offer.worker_id,
      batchNumber: offer.batch_number,
      channel: input.channel,
      status: "failed",
      result: "rpc_failed",
      error: rpcError.message,
    });
    return {
      ok: false,
      error: "rpc_failed",
      message: rpcError.message,
      offerId: offer.id,
      workerId: offer.worker_id,
      serviceRequestId: offer.service_request_id,
      channel: input.channel,
    };
  }

  return mapRpcAcceptResult(rpcData as RpcAcceptResult, offer, input.channel);
}

/** Token-link adapter — resolves token hash then calls canonical accept. */
export async function acceptWorkerOfferByToken(
  supabase: SupabaseClient,
  rawToken: string,
): Promise<AcceptWorkerOfferResult> {
  const tokenHash = hashOfferAcceptToken(rawToken.trim());
  const offerLookup = await findOfferByTokenHash(supabase, tokenHash);

  if (offerLookup.error) {
    return { ok: false, error: "rpc_failed", message: offerLookup.error, channel: "token_link" };
  }

  if (!offerLookup.data) {
    return { ok: false, error: "invalid_token", channel: "token_link" };
  }

  return acceptWorkerOffer(supabase, {
    offerId: offerLookup.data.id,
    workerId: offerLookup.data.worker_id,
    channel: "token_link",
    tokenHash,
  });
}

/** Finalize customer confirmation after any channel accept. */
export async function finalizeWorkerOfferAcceptance(
  supabase: SupabaseClient,
  result: AcceptWorkerOfferResult,
): Promise<void> {
  if (!result.ok) {
    if (
      result.error === "already_accepted" ||
      result.error === "worker_already_assigned"
    ) {
      const { tryFinalizeExistingAssignment } = await import(
        "@/lib/whatsapp/booking-confirmation"
      );
      if (result.serviceRequestId) {
        await tryFinalizeExistingAssignment(supabase, result.serviceRequestId);
      }
    }
    return;
  }

  if (result.serviceRequestId && result.bookingId && result.workerId) {
    const { finalizeBookingAfterWorkerAccept } = await import(
      "@/lib/whatsapp/booking-confirmation"
    );
    await finalizeBookingAfterWorkerAccept(supabase, {
      serviceRequestId: result.serviceRequestId,
      bookingId: result.bookingId,
      workerId: result.workerId,
    });
  }
}

/** Canonical worker offer rejection — all channels must call this. */
export async function rejectWorkerOffer(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    workerId: string;
    channel: WorkerOfferChannel;
  },
): Promise<RejectWorkerOfferResult> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "reject_worker_service_offer",
    {
      p_offer_id: input.offerId,
      p_worker_id: input.workerId,
      p_channel: input.channel,
    },
  );

  if (rpcError) {
    workerLog("WORKER-OFFER-REJECT", {
      offerId: input.offerId,
      workerId: input.workerId,
      channel: input.channel,
      status: "failed",
      result: "rpc_failed",
      error: rpcError.message,
    });
    return {
      ok: false,
      error: "rpc_failed",
      message: rpcError.message,
      offerId: input.offerId,
      workerId: input.workerId,
      channel: input.channel,
    };
  }

  const result = rpcData as { ok?: boolean; error?: string; service_request_id?: string };
  if (!result?.ok) {
    const code = (result?.error ?? "unknown") as RejectOfferErrorCode;
    workerLog("WORKER-OFFER-REJECT", {
      offerId: input.offerId,
      workerId: input.workerId,
      channel: input.channel,
      status: "failed",
      result: code,
    });
    return {
      ok: false,
      error: code,
      message: result?.error,
      offerId: input.offerId,
      workerId: input.workerId,
      serviceRequestId: result.service_request_id
        ? String(result.service_request_id)
        : undefined,
      channel: input.channel,
    };
  }

  workerLog("WORKER-OFFER-REJECT", {
    offerId: input.offerId,
    workerId: input.workerId,
    serviceRequestId: result.service_request_id
      ? String(result.service_request_id)
      : undefined,
    channel: input.channel,
    status: "rejected",
    result: "ok",
  });

  return {
    ok: true,
    offerId: input.offerId,
    workerId: input.workerId,
    serviceRequestId: result.service_request_id
      ? String(result.service_request_id)
      : undefined,
    channel: input.channel,
  };
}
