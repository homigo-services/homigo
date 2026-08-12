import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevEnvironment } from "@/lib/dev/guard";
import {
  getBatchStatus,
  matchWorkersForServiceRequest,
  OFFER_BATCH_TTL_MINUTES,
  type BatchStatusSummary,
} from "./matching";
import {
  buildWorkerOfferAcceptPath,
  generateOfferAcceptToken,
  hashOfferAcceptToken,
} from "./offer-tokens";

export interface CreatedOfferRecord {
  id: string;
  worker_id: string;
  expires_at: string;
  batch_number: number;
}

/** Dev-only — raw token returned once for simulator accept links. Never stored. */
export interface DevOfferAcceptLink {
  offerId: string;
  workerId: string;
  workerName: string;
  acceptPath: string;
  expiresAt: string;
}

export interface StartWorkerMatchingResult {
  batch: BatchStatusSummary;
  offers: CreatedOfferRecord[];
  devAcceptLinks: DevOfferAcceptLink[];
  serviceId: string | null;
  error: string | null;
}

export async function createWorkerOffersForBatch(
  supabase: SupabaseClient,
  input: {
    serviceRequestId: string;
    workerIds: string[];
    workerNames?: Map<string, string>;
    batchNumber?: number;
  },
): Promise<{
  offers: CreatedOfferRecord[];
  devAcceptLinks: DevOfferAcceptLink[];
  error: string | null;
}> {
  const batchNumber = input.batchNumber ?? 1;
  const now = Date.now();
  const expiresAt = new Date(
    now + OFFER_BATCH_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  const offers: CreatedOfferRecord[] = [];
  const devAcceptLinks: DevOfferAcceptLink[] = [];

  for (const workerId of input.workerIds) {
    const rawToken = generateOfferAcceptToken();
    const tokenHash = hashOfferAcceptToken(rawToken);

    const { data, error } = await supabase
      .from("worker_service_offers")
      .insert({
        service_request_id: input.serviceRequestId,
        worker_id: workerId,
        batch_number: batchNumber,
        expires_at: expiresAt,
        status: "pending",
        accept_token_hash: tokenHash,
        updated_at: new Date().toISOString(),
      })
      .select("id, worker_id, expires_at, batch_number")
      .single();

    if (error) {
      return { offers, devAcceptLinks, error: error.message };
    }

    offers.push({
      id: String(data.id),
      worker_id: String(data.worker_id),
      expires_at: String(data.expires_at),
      batch_number: Number(data.batch_number),
    });

    if (isDevEnvironment()) {
      devAcceptLinks.push({
        offerId: String(data.id),
        workerId,
        workerName: input.workerNames?.get(workerId) ?? workerId.slice(0, 8),
        acceptPath: buildWorkerOfferAcceptPath(rawToken),
        expiresAt: String(data.expires_at),
      });
    }
  }

  return { offers, devAcceptLinks, error: null };
}

/** Start batch 1 worker matching after rate-card acceptance. */
export async function startWorkerMatchingBatch1(
  supabase: SupabaseClient,
  input: {
    serviceRequestId: string;
    serviceId?: string;
    serviceType?: string;
    area: string;
    pincode: string;
  },
): Promise<StartWorkerMatchingResult> {
  const existing = await getBatchStatus(supabase, input.serviceRequestId, 1);
  if (existing.error) {
    return {
      batch: existing.data,
      offers: [],
      devAcceptLinks: [],
      serviceId: null,
      error: existing.error,
    };
  }

  if (existing.data.offerCount > 0 || existing.data.status === "accepted") {
    return {
      batch: existing.data,
      offers: [],
      devAcceptLinks: [],
      serviceId: null,
      error: null,
    };
  }

  const matched = await matchWorkersForServiceRequest(supabase, {
    serviceId: input.serviceId,
    serviceType: input.serviceType,
    area: input.area,
    pincode: input.pincode,
  });

  if (matched.error) {
    return {
      batch: existing.data,
      offers: [],
      devAcceptLinks: [],
      serviceId: matched.serviceId,
      error: matched.error,
    };
  }

  if (matched.workers.length === 0) {
    return {
      batch: {
        batchNumber: 1,
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
    };
  }

  const nameMap = new Map(matched.workers.map((w) => [w.id, w.name]));
  const created = await createWorkerOffersForBatch(supabase, {
    serviceRequestId: input.serviceRequestId,
    workerIds: matched.workers.map((w) => w.id),
    workerNames: nameMap,
    batchNumber: 1,
  });

  if (created.error) {
    return {
      batch: existing.data,
      offers: created.offers,
      devAcceptLinks: created.devAcceptLinks,
      serviceId: matched.serviceId,
      error: created.error,
    };
  }

  const batch = await getBatchStatus(supabase, input.serviceRequestId, 1);

  return {
    batch: batch.data,
    offers: created.offers,
    devAcceptLinks: created.devAcceptLinks,
    serviceId: matched.serviceId,
    error: null,
  };
}

export async function findOfferByTokenHash(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<{
  data: {
    id: string;
    service_request_id: string;
    worker_id: string;
    status: string;
    expires_at: string;
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("worker_service_offers")
    .select("id, service_request_id, worker_id, status, expires_at")
    .eq("accept_token_hash", tokenHash)
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
    },
    error: null,
  };
}

export async function listOffersForServiceRequest(
  supabase: SupabaseClient,
  serviceRequestId: string,
): Promise<{
  data: Array<{
    id: string;
    worker_id: string;
    batch_number: number;
    status: string;
    expires_at: string;
    accepted_at: string | null;
    worker_name: string;
  }>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("worker_service_offers")
    .select("id, worker_id, batch_number, status, expires_at, accepted_at")
    .eq("service_request_id", serviceRequestId)
    .order("batch_number")
    .order("offered_at");

  if (error) {
    return { data: [], error: error.message };
  }

  const workerIds = [...new Set((data ?? []).map((r) => String(r.worker_id)))];
  const { data: workers } = await supabase
    .from("workers")
    .select('id, "Full name"')
    .in("id", workerIds);

  const nameMap = new Map(
    (workers ?? []).map((w) => [
      String(w.id),
      String(w["Full name"] ?? "Worker"),
    ]),
  );

  return {
    data: (data ?? []).map((row) => ({
      id: String(row.id),
      worker_id: String(row.worker_id),
      batch_number: Number(row.batch_number),
      status: String(row.status),
      expires_at: String(row.expires_at),
      accepted_at: row.accepted_at ? String(row.accepted_at) : null,
      worker_name: nameMap.get(String(row.worker_id)) ?? "Worker",
    })),
    error: null,
  };
}
