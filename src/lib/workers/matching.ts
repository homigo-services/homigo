import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchServiceCatalog } from "./service-resolver";
import type { Worker } from "./types";

import { WORKER_BATCH_SIZE } from "@/lib/whatsapp/homigo-services";

export const MAX_MATCHED_WORKERS = WORKER_BATCH_SIZE;
export const OFFER_BATCH_TTL_MINUTES = 30;

export type WorkerMatchRank = "pincode" | "area" | "other";

export interface MatchedWorker {
  id: string;
  name: string;
  mobile: string;
  area: string | null;
  pincode: string | null;
  rank: WorkerMatchRank;
}

export interface MatchWorkersInput {
  serviceId?: string;
  serviceType?: string;
  area: string;
  pincode: string;
  excludeWorkerIds?: string[];
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function workerName(row: Record<string, unknown>): string {
  const full = row["Full name"];
  return typeof full === "string" && full.trim() ? full.trim() : "Worker";
}

export async function resolveServiceId(
  supabase: SupabaseClient,
  input: { serviceId?: string; serviceType?: string },
): Promise<{ serviceId: string | null; error: string | null }> {
  if (input.serviceId) {
    return { serviceId: input.serviceId, error: null };
  }

  const name = input.serviceType?.trim();
  if (!name) {
    return { serviceId: null, error: "Service id or service type required" };
  }

  const { data: catalog, error } = await fetchServiceCatalog(supabase);
  if (error) {
    return { serviceId: null, error };
  }

  const target = normalize(name);
  const exact = catalog.find((row) => normalize(row.name) === target);

  if (!exact?.id) {
    return { serviceId: null, error: `Unknown service: ${name}` };
  }

  return { serviceId: exact.id, error: null };
}

/**
 * Deterministic worker ranking for a service request location.
 * Priority: exact pincode → area → remaining eligible workers.
 */
export async function matchWorkersForServiceRequest(
  supabase: SupabaseClient,
  input: MatchWorkersInput,
): Promise<{
  workers: MatchedWorker[];
  serviceId: string | null;
  error: string | null;
}> {
  const resolved = await resolveServiceId(supabase, input);
  if (resolved.error || !resolved.serviceId) {
    return { workers: [], serviceId: null, error: resolved.error };
  }

  const serviceId = resolved.serviceId;

  const { data: workerServiceRows, error: wsError } = await supabase
    .from("worker_services")
    .select("worker_id")
    .eq("service_id", serviceId)
    .eq("is_active", true);

  if (wsError) {
    return { workers: [], serviceId, error: wsError.message };
  }

  const workerIds = [
    ...new Set((workerServiceRows ?? []).map((r) => String(r.worker_id))),
  ];

  if (workerIds.length === 0) {
    return { workers: [], serviceId, error: null };
  }

  const { data: workers, error: workerError } = await supabase
    .from("workers")
    .select('id, "Full name", mobile_number, area, pincode, status, is_verified, is_available, deleted_at')
    .in("id", workerIds)
    .eq("status", "active")
    .eq("is_verified", true)
    .eq("is_available", true)
    .is("deleted_at", null);

  if (workerError) {
    return { workers: [], serviceId, error: workerError.message };
  }

  const targetPincode = normalize(input.pincode);
  const targetArea = normalize(input.area);

  const ranked: MatchedWorker[] = [];
  const seen = new Set<string>();

  const addWorkers = (rows: Record<string, unknown>[], rank: WorkerMatchRank) => {
    for (const row of rows) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      ranked.push({
        id,
        name: workerName(row),
        mobile: String(row.mobile_number ?? ""),
        area: row.area ? String(row.area) : null,
        pincode: row.pincode ? String(row.pincode) : null,
        rank,
      });
    }
  };

  const all = (workers ?? []).filter(
    (w) => !input.excludeWorkerIds?.includes(String(w.id)),
  ) as Record<string, unknown>[];

  addWorkers(
    all.filter((w) => normalize(String(w.pincode ?? "")) === targetPincode),
    "pincode",
  );

  addWorkers(
    all.filter(
      (w) =>
        !seen.has(String(w.id)) &&
        normalize(String(w.area ?? "")) === targetArea,
    ),
    "area",
  );

  addWorkers(
    all.filter((w) => !seen.has(String(w.id))),
    "other",
  );

  return {
    workers: ranked.slice(0, MAX_MATCHED_WORKERS),
    serviceId,
    error: null,
  };
}

export type BatchMatchingStatus =
  | "not_started"
  | "offers_pending"
  | "accepted"
  | "expired"
  | "no_workers";

export interface BatchStatusSummary {
  batchNumber: number;
  status: BatchMatchingStatus;
  offerCount: number;
  pendingCount: number;
  acceptedWorkerId: string | null;
  earliestExpiry: string | null;
  bookingId: string | null;
}

/** Inspect batch 1 offer state for a service request. */
export async function getBatchStatus(
  supabase: SupabaseClient,
  serviceRequestId: string,
  batchNumber = 1,
): Promise<{ data: BatchStatusSummary; error: string | null }> {
  const { data: offers, error } = await supabase
    .from("worker_service_offers")
    .select("id, worker_id, status, expires_at, batch_number")
    .eq("service_request_id", serviceRequestId)
    .eq("batch_number", batchNumber)
    .order("offered_at", { ascending: true });

  if (error) {
    return {
      data: {
        batchNumber,
        status: "not_started",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      error: error.message,
    };
  }

  const rows = offers ?? [];
  if (rows.length === 0) {
    return {
      data: {
        batchNumber,
        status: "not_started",
        offerCount: 0,
        pendingCount: 0,
        acceptedWorkerId: null,
        earliestExpiry: null,
        bookingId: null,
      },
      error: null,
    };
  }

  const accepted = rows.find((r) => r.status === "accepted");
  const pending = rows.filter((r) => r.status === "pending");
  const now = Date.now();

  let status: BatchMatchingStatus = "offers_pending";
  if (accepted) {
    status = "accepted";
  } else if (
    pending.length === 0 &&
    rows.every((r) => r.status === "expired" || r.status === "cancelled")
  ) {
    status = "expired";
  } else if (pending.length === 0) {
    status = "expired";
  } else if (pending.every((r) => new Date(String(r.expires_at)).getTime() <= now)) {
    status = "expired";
  }

  const { data: booking } = await supabase
    .from("booking")
    .select("id")
    .eq("sevice_request_id", serviceRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: {
      batchNumber,
      status,
      offerCount: rows.length,
      pendingCount: pending.filter(
        (r) => new Date(String(r.expires_at)).getTime() > now,
      ).length,
      acceptedWorkerId: accepted ? String(accepted.worker_id) : null,
      earliestExpiry: pending[0]?.expires_at ? String(pending[0].expires_at) : null,
      bookingId: booking?.id ? String(booking.id) : null,
    },
    error: null,
  };
}

/** Reusable hook for a future batch 2 — not invoked automatically in Phase 4B. */
export async function canCreateNextBatch(
  supabase: SupabaseClient,
  serviceRequestId: string,
  currentBatch: number,
): Promise<{ allowed: boolean; reason: string | null }> {
  const summary = await getBatchStatus(supabase, serviceRequestId, currentBatch);
  if (summary.error) {
    return { allowed: false, reason: summary.error };
  }

  if (summary.data.status === "accepted") {
    return { allowed: false, reason: "Worker already assigned" };
  }

  if (summary.data.status !== "expired") {
    return { allowed: false, reason: "Current batch still pending" };
  }

  const nextExists = await getBatchStatus(supabase, serviceRequestId, currentBatch + 1);
  if ((nextExists.data.offerCount ?? 0) > 0) {
    return { allowed: false, reason: "Next batch already exists" };
  }

  return { allowed: true, reason: null };
}
