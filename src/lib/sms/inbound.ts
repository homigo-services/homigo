import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { findWorkerByMobile } from "@/lib/workers/auth";
import {
  acceptWorkerOffer,
  finalizeWorkerOfferAcceptance,
  rejectWorkerOffer,
} from "@/lib/workers/offer-actions";

function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function getActiveOfferForWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ id: string; service_request_id: string } | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("worker_service_offers")
    .select("id, service_request_id")
    .eq("worker_id", workerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: String(data.id), service_request_id: String(data.service_request_id) };
}

async function claimInboundEvent(
  supabase: SupabaseClient,
  provider: string,
  eventId: string,
  payload: unknown,
): Promise<boolean> {
  const row: Record<string, unknown> = {
    provider,
    provider_event_id: eventId,
    payload: payload as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("sms_inbound_events").insert(row);

  if (error?.code === "23505") {
    return false;
  }

  // Legacy schema may use event_id instead of provider_event_id
  if (error && String(error.message).includes("provider_event_id")) {
    const legacy = await supabase.from("sms_inbound_events").insert({
      provider,
      event_id: eventId,
      payload: payload as Record<string, unknown>,
      processed_at: new Date().toISOString(),
    });
    if (legacy.error?.code === "23505") return false;
    return !legacy.error;
  }

  return !error;
}

export async function processSmsInboundAction(input: {
  provider: string;
  eventId: string;
  fromMobile: string;
  body: string;
  payload?: unknown;
}): Promise<{ ok: boolean; action?: string; error?: string }> {
  const supabase = createSupabaseServiceClient();
  const claimed = await claimInboundEvent(
    supabase,
    input.provider,
    input.eventId,
    input.payload ?? { from: input.fromMobile, body: input.body },
  );
  if (!claimed) {
    return { ok: true, action: "duplicate_ignored" };
  }

  const worker = await findWorkerByMobile(supabase, normalizeMobile(input.fromMobile));
  if (!worker) {
    return { ok: false, error: "worker_not_found" };
  }

  const choice = input.body.trim();
  if (choice !== "1" && choice !== "2") {
    return { ok: false, error: "invalid_action" };
  }

  const offer = await getActiveOfferForWorker(supabase, worker.id);
  if (!offer) {
    return { ok: false, error: "no_active_offer" };
  }

  if (choice === "1") {
    const result = await acceptWorkerOffer(supabase, {
      offerId: offer.id,
      workerId: worker.id,
      channel: "sms",
    });
    await finalizeWorkerOfferAcceptance(supabase, result);
    if (!result.ok) {
      return { ok: false, error: result.error, action: "accept_failed" };
    }
    return { ok: true, action: "accepted" };
  }

  const result = await rejectWorkerOffer(supabase, {
    offerId: offer.id,
    workerId: worker.id,
    channel: "sms",
  });

  if (!result.ok) {
    return { ok: false, error: result.error, action: "reject_failed" };
  }

  return { ok: true, action: "rejected" };
}
