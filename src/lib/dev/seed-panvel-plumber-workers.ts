import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkerInsertFields } from "@/lib/workers/import-fields";
import { importWorkerWithServices } from "@/lib/workers/queries";
import { matchWorkersForServiceRequest } from "@/lib/workers/matching";
import {
  buildWorkerServiceInsertPayload,
  resolveServiceIdsByName,
} from "@/lib/workers/service-resolver";
import type { ImportWorkerInput } from "@/lib/workers/types";

/** WhatsApp slot index 7 — used for Panvel dev/E2E matching tests. */
export const PANVEL_PLUMBER_TEST_SLOT = "20:00-22:00";

export const PANVEL_PLUMBER_TEST_AREA = "Panvel";
export const PANVEL_PLUMBER_TEST_PINCODE = "410221";
export const PANVEL_PLUMBER_SERVICE_NAME = "Plumber";

export interface PanvelSeedWorkerSpec {
  key: "W1" | "W2";
  fullName: string;
  mobile: string;
  workerCode: string;
}

export const PANVEL_PLUMBER_SEED_WORKERS: PanvelSeedWorkerSpec[] = [
  {
    key: "W1",
    fullName: "Dev Plumber Panvel W1",
    mobile: "919876543001",
    workerCode: "HW-PANVEL-W1",
  },
  {
    key: "W2",
    fullName: "Dev Plumber Panvel W2",
    mobile: "919876543002",
    workerCode: "HW-PANVEL-W2",
  },
];

function buildSeedImportInput(spec: PanvelSeedWorkerSpec): ImportWorkerInput {
  return {
    fullName: spec.fullName,
    mobile: spec.mobile,
    gender: "Male",
    qualifications: ["ITI"],
    preferredTimings: [PANVEL_PLUMBER_TEST_SLOT, "18:00-20:00"],
    area: PANVEL_PLUMBER_TEST_AREA,
    pincode: PANVEL_PLUMBER_TEST_PINCODE,
    address: `${spec.fullName}, Panvel Dev Seed`,
    services: [PANVEL_PLUMBER_SERVICE_NAME],
    experienceYears: 5,
  };
}

async function ensurePlumberServiceLink(
  supabase: SupabaseClient,
  workerId: string,
  experienceYears: number,
): Promise<void> {
  const { ids, error } = await resolveServiceIdsByName(supabase, [
    PANVEL_PLUMBER_SERVICE_NAME,
  ]);
  if (error || ids.length === 0) {
    throw new Error(error ?? "Plumber service not found in public.services");
  }

  const serviceId = ids[0];
  const { data: existing } = await supabase
    .from("worker_services")
    .select("id, is_active")
    .eq("worker_id", workerId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.is_active) {
      const { error: updateError } = await supabase
        .from("worker_services")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) throw new Error(updateError.message);
    }
    return;
  }

  const { error: insertError } = await supabase
    .from("worker_services")
    .insert(buildWorkerServiceInsertPayload(workerId, ids, experienceYears));

  if (insertError) {
    throw new Error(`worker_services link failed: ${insertError.message}`);
  }
}

async function ensurePanvelSeedWorker(
  supabase: SupabaseClient,
  spec: PanvelSeedWorkerSpec,
): Promise<{ id: string; workerCode: string; created: boolean }> {
  const { data: existing } = await supabase
    .from("workers")
    .select("id, worker_code")
    .eq("mobile_number", spec.mobile)
    .is("deleted_at", null)
    .maybeSingle();

  let workerId = existing?.id ? String(existing.id) : null;
  let created = false;

  if (!workerId) {
    const input = buildSeedImportInput(spec);
    const fields = buildWorkerInsertFields(input);
    fields.worker_code = spec.workerCode;

    const imported = await importWorkerWithServices(
      supabase,
      fields,
      input.services,
      [],
    );

    if (imported.error || !imported.workerId) {
      throw new Error(imported.error ?? `Failed to import ${spec.key}`);
    }

    workerId = imported.workerId;
    created = true;
  }

  const { error: updateError } = await supabase
    .from("workers")
    .update({
      worker_code: spec.workerCode,
      "Full name": spec.fullName,
      area: PANVEL_PLUMBER_TEST_AREA,
      pincode: PANVEL_PLUMBER_TEST_PINCODE,
      address_line: `${spec.fullName}, Panvel Dev Seed`,
      preferred_timing: PANVEL_PLUMBER_TEST_SLOT,
      status: "active",
      is_verified: true,
      is_available: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (updateError) {
    throw new Error(`worker update failed for ${spec.key}: ${updateError.message}`);
  }

  await ensurePlumberServiceLink(supabase, workerId, 5);

  const { data: row } = await supabase
    .from("workers")
    .select("worker_code")
    .eq("id", workerId)
    .maybeSingle();

  return {
    id: workerId,
    workerCode: String(row?.worker_code ?? spec.workerCode),
    created,
  };
}

export interface PanvelPlumberSeedResult {
  workers: Array<{
    key: "W1" | "W2";
    id: string;
    workerCode: string;
    mobile: string;
    created: boolean;
  }>;
  matchPreview: {
    serviceId: string | null;
    count: number;
    workers: Array<{ id: string; name: string; rank: string; pincode: string | null }>;
    error: string | null;
  };
}

/**
 * Idempotent dev seed: two active Plumber workers in Panvel / 410221.
 * Uses the same import path as Admin worker import (`importWorkerWithServices`).
 */
export async function seedPanvelPlumberWorkers(
  supabase: SupabaseClient,
): Promise<PanvelPlumberSeedResult> {
  const workers: PanvelPlumberSeedResult["workers"] = [];

  for (const spec of PANVEL_PLUMBER_SEED_WORKERS) {
    const ensured = await ensurePanvelSeedWorker(supabase, spec);
    workers.push({
      key: spec.key,
      id: ensured.id,
      workerCode: ensured.workerCode,
      mobile: spec.mobile,
      created: ensured.created,
    });
  }

  const match = await matchWorkersForServiceRequest(supabase, {
    serviceType: PANVEL_PLUMBER_SERVICE_NAME,
    area: PANVEL_PLUMBER_TEST_AREA,
    pincode: PANVEL_PLUMBER_TEST_PINCODE,
  });

  return {
    workers,
    matchPreview: {
      serviceId: match.serviceId,
      count: match.workers.length,
      workers: match.workers.map((w) => ({
        id: w.id,
        name: w.name,
        rank: w.rank,
        pincode: w.pincode,
      })),
      error: match.error,
    },
  };
}
