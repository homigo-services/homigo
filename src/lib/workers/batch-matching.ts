import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKER_BATCH_SIZE } from "@/lib/whatsapp/homigo-services";
import {
  canCreateNextBatch,
  getBatchStatus,
  matchWorkersForServiceRequest,
  type BatchStatusSummary,
} from "./matching";
import {
  createWorkerOffersForBatch,
  type CreatedOfferRecord,
  type DevOfferAcceptLink,
} from "./offers";
import { notifyWorkersForOffers } from "./notify-offer";
import { workerLog } from "./worker-log";

export interface BatchMatchingResult {
  batch: BatchStatusSummary;
  offers: CreatedOfferRecord[];
  devAcceptLinks: DevOfferAcceptLink[];
  serviceId: string | null;
  error: string | null;
  noMoreWorkers?: boolean;
}

/** Workers who must not receive another offer for this service request. */
export async function getExcludedWorkerIds(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("worker_service_offers")
    .select("worker_id, status")
    .eq("service_request_id", serviceRequestId);

  if (error || !data) return [];

  const excluded = new Set<string>();
  for (const row of data) {
    const status = String(row.status);
    if (
      status === "pending" ||
      status === "accepted" ||
      status === "rejected" ||
      status === "expired" ||
      status === "cancelled"
    ) {
      excluded.add(String(row.worker_id));
    }
  }
  return [...excluded];
}

async function loadServiceRequestContext(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<{
  serviceType?: string;
  area: string;
  pincode: string;
  serviceId?: string;
} | null> {
  const { data: sr } = await supabase
    .from("service-request")
    .select("service_type, area, pincode")
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (!sr) return null;

  return {
    serviceType: sr.service_type ? String(sr.service_type) : undefined,
    area: String(sr.area ?? ""),
    pincode: String(sr.pincode ?? ""),
  };
}

/** Start batch 1 — delegates to offers module then notifies. */
export async function startWorkerMatchingWithNotifications(
  supabase: SupabaseClient,
  input: {
    serviceRequestId: string;
    serviceId?: string;
    serviceType?: string;
    area: string;
    pincode: string;
  },
): Promise<BatchMatchingResult> {
  const { startWorkerMatchingBatch1 } = await import("./offers");
  const result = await startWorkerMatchingBatch1(supabase, input);

  return {
    batch: result.batch,
    offers: result.offers,
    devAcceptLinks: result.devAcceptLinks,
    serviceId: result.serviceId,
    error: result.error,
    noMoreWorkers: result.batch.status === "no_workers",
  };
}

/** Start the next batch (2, 3, …) after prior batch expired with no acceptance. */
export async function startNextWorkerMatchingBatch(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<BatchMatchingResult> {
  const { data: allOffers } = await supabase
    .from("worker_service_offers")
    .select("batch_number")
    .eq("service_request_id", serviceRequestId)
    .order("batch_number", { ascending: false })
    .limit(1);

  const currentBatch =
    allOffers && allOffers.length > 0 ? Number(allOffers[0].batch_number) : 0;

  if (currentBatch === 0) {
    const ctx = await loadServiceRequestContext(supabase, serviceRequestId);
    if (!ctx) {
      return {
        batch: {
          batchNumber: 1,
          status: "not_started",
          offerCount: 0,
          pendingCount: 0,
          acceptedWorkerId: null,
          earliestExpiry: null,
          bookingId: null,
        },
        offers: [],
        devAcceptLinks: [],
        serviceId: null,
        error: "service_request_not_found",
      };
    }
    return startWorkerMatchingWithNotifications(supabase, {
      serviceRequestId,
      serviceType: ctx.serviceType,
      area: ctx.area,
      pincode: ctx.pincode,
    });
  }

  const gate = await canCreateNextBatch(supabase, serviceRequestId, currentBatch);
  if (!gate.allowed) {
    const status = await getBatchStatus(supabase, serviceRequestId, currentBatch);
    return {
      batch: status.data,
      offers: [],
      devAcceptLinks: [],
      serviceId: null,
      error: gate.reason,
    };
  }

  const ctx = await loadServiceRequestContext(supabase, serviceRequestId);
  if (!ctx) {
    return {
      batch: {
        batchNumber: currentBatch + 1,
        status: "not_started",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      offers: [],
      devAcceptLinks: [],
      serviceId: null,
      error: "service_request_not_found",
    };
  }

  const excluded = await getExcludedWorkerIds(supabase, serviceRequestId);
  const matched = await matchWorkersForServiceRequest(supabase, {
    serviceType: ctx.serviceType,
    area: ctx.area,
    pincode: ctx.pincode,
    excludeWorkerIds: excluded,
  });

  if (matched.error) {
    return {
      batch: {
        batchNumber: currentBatch + 1,
        status: "not_started",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      offers: [],
      devAcceptLinks: [],
      serviceId: matched.serviceId,
      error: matched.error,
    };
  }

  if (matched.workers.length === 0) {
    await supabase
      .from("service-request")
      .update({ status: "worker_not_found", updated_at: new Date().toISOString() })
      .eq("id", serviceRequestId);

    workerLog("WORKER-MATCHING", {
      serviceRequestId,
      status: "worker_not_found",
      result: "no_eligible_workers",
    });

    return {
      batch: {
        batchNumber: currentBatch + 1,
        status: "no_workers",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      offers: [],
      devAcceptLinks: [],
      serviceId: matched.serviceId,
      error: null,
      noMoreWorkers: true,
    };
  }

  const nextBatch = currentBatch + 1;
  const nameMap = new Map(matched.workers.map((w) => [w.id, w.name]));
  const created = await createWorkerOffersForBatch(supabase, {
    serviceRequestId,
    workerIds: matched.workers.slice(0, WORKER_BATCH_SIZE).map((w) => w.id),
    workerNames: nameMap,
    batchNumber: nextBatch,
  });

  if (created.error) {
    return {
      batch: {
        batchNumber: nextBatch,
        status: "not_started",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      offers: created.offers,
      devAcceptLinks: created.devAcceptLinks,
      serviceId: matched.serviceId,
      error: created.error,
    };
  }

  if (created.offers.length > 0) {
    await notifyWorkersForOffers(supabase, {
      serviceRequestId,
      offers: created.offers,
    });
  }

  const batch = await getBatchStatus(supabase, serviceRequestId, nextBatch);

  workerLog("WORKER-BATCH-ADVANCE", {
    serviceRequestId,
    batchNumber: nextBatch,
    status: batch.data.status,
    result: `offers=${created.offers.length}`,
  });

  return {
    batch: batch.data,
    offers: created.offers,
    devAcceptLinks: created.devAcceptLinks,
    serviceId: matched.serviceId,
    error: null,
  };
}

/** Expire pending offers past TTL and advance batches where needed. Idempotent. */
export async function processExpiredWorkerOffers(
  supabase: SupabaseClient,
): Promise<{ processed: number; advanced: number; errors: string[] }> {
  const now = new Date().toISOString();
  const errors: string[] = [];
  let processed = 0;
  let advanced = 0;

  const { data: pendingExpired, error } = await supabase
    .from("worker_service_offers")
    .select("id, service_request_id, batch_number, status")
    .eq("status", "pending")
    .lte("expires_at", now);

  if (error) {
    return { processed: 0, advanced: 0, errors: [error.message] };
  }

  const serviceRequestIds = new Set<string>();
  for (const row of pendingExpired ?? []) {
    const { error: updErr } = await supabase
      .from("worker_service_offers")
      .update({ status: "expired", updated_at: now })
      .eq("id", row.id)
      .eq("status", "pending");

    if (updErr) {
      errors.push(updErr.message);
      continue;
    }

    processed += 1;
    serviceRequestIds.add(String(row.service_request_id));

    workerLog("WORKER-OFFER-EXPIRE", {
      offerId: String(row.id),
      serviceRequestId: String(row.service_request_id),
      batchNumber: Number(row.batch_number),
      status: "expired",
    });
  }

  for (const srId of serviceRequestIds) {
    const { data: accepted } = await supabase
      .from("worker_service_offers")
      .select("id")
      .eq("service_request_id", srId)
      .eq("status", "accepted")
      .maybeSingle();

    if (accepted) continue;

    const { data: stillPending } = await supabase
      .from("worker_service_offers")
      .select("id")
      .eq("service_request_id", srId)
      .eq("status", "pending")
      .limit(1);

    if (stillPending && stillPending.length > 0) continue;

    const result = await startNextWorkerMatchingBatch(supabase, srId);
    if (result.offers.length > 0 || result.noMoreWorkers) {
      advanced += 1;
    }
    if (result.error && result.error !== "Current batch still pending") {
      errors.push(`${srId}: ${result.error}`);
    }
  }

  return { processed, advanced, errors };
}
