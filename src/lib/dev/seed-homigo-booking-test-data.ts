import type { SupabaseClient } from "@supabase/supabase-js";
import { createRateCard, getActiveRateCardForService } from "@/lib/rate-cards/queries";
import { buildWorkerInsertFields } from "@/lib/workers/import-fields";
import { importWorkerWithServices } from "@/lib/workers/queries";
import { matchWorkersForServiceRequest } from "@/lib/workers/matching";
import {
  buildWorkerServiceInsertPayload,
  fetchServiceCatalog,
  resolveServiceIdsByName,
} from "@/lib/workers/service-resolver";
import type { ImportWorkerInput } from "@/lib/workers/types";
import {
  HOMIGO_BOOKING_SERVICE_NAMES,
  HOMIGO_SERVICE_BASE_PRICE,
} from "@/lib/whatsapp/homigo-services";

/** Shared test geography for WhatsApp mobile matching. */
export const HOMIGO_TEST_AREA = "Panvel";
export const HOMIGO_TEST_PINCODE = "410221";
export const HOMIGO_TEST_SLOT = "20:00-22:00";

const SEED_NOTE = "Homigo WhatsApp booking test seed — safe to delete";

/** Rate card: base + lead = ₹1000 customer-facing amount. */
const RATE_CARD_BASE = 950;
const RATE_CARD_LEAD = 50;
const RATE_CARD_COMMISSION = 100;
const RATE_CARD_WORKER_EARNING = 850;

export interface HomigoSeedWorkerSpec {
  key: string;
  serviceName: (typeof HOMIGO_BOOKING_SERVICE_NAMES)[number];
  fullName: string;
  mobile: string;
  workerCode: string;
}

const SERVICE_CODE_PREFIX: Record<
  (typeof HOMIGO_BOOKING_SERVICE_NAMES)[number],
  string
> = {
  "AC Technician": "AC",
  Electrician: "ELECTRIC",
  Plumber: "PLUMB",
  Carpenter: "CARPENTER",
  "Motor Technician": "MOTOR",
};

function workerSpecs(): HomigoSeedWorkerSpec[] {
  const specs: HomigoSeedWorkerSpec[] = [];
  let mobileSuffix = 10;

  for (const serviceName of HOMIGO_BOOKING_SERVICE_NAMES) {
    const prefix = SERVICE_CODE_PREFIX[serviceName];
    for (let n = 1; n <= 6; n += 1) {
      const num = String(n).padStart(2, "0");
      specs.push({
        key: `${prefix}-${num}`,
        serviceName,
        fullName: `Dev ${serviceName} ${num}`,
        mobile: `9198765430${String(mobileSuffix).padStart(2, "0")}`,
        workerCode: `HW-TEST-${prefix}-${num}`,
      });
      mobileSuffix += 1;
    }
  }

  return specs;
}

export const HOMIGO_BOOKING_SEED_WORKERS = workerSpecs();

async function ensureServiceRow(
  supabase: SupabaseClient,
  serviceName: string,
): Promise<{ id: string; created: boolean }> {
  const { data: catalog } = await fetchServiceCatalog(supabase);
  const existing = catalog.find((s) => s.name.toLowerCase() === serviceName.toLowerCase());
  if (existing) return { id: existing.id, created: false };

  const codeMap: Record<string, string> = {
    "AC Technician": "ACT",
    Electrician: "ELE",
    Plumber: "PLM",
    Carpenter: "CRP",
    "Motor Technician": "MTR",
  };

  const payload = {
    service_name: serviceName,
    service_code: codeMap[serviceName] ?? serviceName.slice(0, 3).toUpperCase(),
    customer_rate: 0,
    lead_charges: 30,
    commission_type: "percentage",
    commission_value: 20,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("services")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Could not create service "${serviceName}": ${error?.message ?? "unknown error"}`,
    );
  }

  return { id: String(data.id), created: true };
}

async function ensureRateCard(
  supabase: SupabaseClient,
  serviceId: string,
  serviceName: string,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await getActiveRateCardForService(supabase, serviceId);
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await createRateCard(supabase, {
    service_id: serviceId,
    base_amount: RATE_CARD_BASE,
    lead_charge: RATE_CARD_LEAD,
    platform_commission: RATE_CARD_COMMISSION,
    worker_earning: RATE_CARD_WORKER_EARNING,
    is_active: true,
    notes: `${SEED_NOTE} — ${serviceName} @ ₹${HOMIGO_SERVICE_BASE_PRICE}`,
  });

  if (error || !data) {
    throw new Error(`Rate card for ${serviceName} failed: ${error ?? "unknown"}`);
  }

  return { id: data.id, created: true };
}

function buildSeedImportInput(spec: HomigoSeedWorkerSpec): ImportWorkerInput {
  return {
    fullName: spec.fullName,
    mobile: spec.mobile,
    gender: "Male",
    qualifications: ["ITI"],
    preferredTimings: [HOMIGO_TEST_SLOT, "18:00-20:00"],
    area: HOMIGO_TEST_AREA,
    pincode: HOMIGO_TEST_PINCODE,
    address: `${spec.fullName}, ${HOMIGO_TEST_AREA} Dev Seed`,
    services: [spec.serviceName],
    experienceYears: 5,
  };
}

async function ensureServiceLink(
  supabase: SupabaseClient,
  workerId: string,
  serviceId: string,
  experienceYears: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from("worker_services")
    .select("id, is_active")
    .eq("worker_id", workerId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.is_active) {
      const { error } = await supabase
        .from("worker_services")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase
    .from("worker_services")
    .insert(buildWorkerServiceInsertPayload(workerId, [serviceId], experienceYears));

  if (error) throw new Error(`worker_services link failed: ${error.message}`);
}

async function ensureSeedWorker(
  supabase: SupabaseClient,
  spec: HomigoSeedWorkerSpec,
  serviceId: string,
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
      area: HOMIGO_TEST_AREA,
      pincode: HOMIGO_TEST_PINCODE,
      address_line: `${spec.fullName}, ${HOMIGO_TEST_AREA} Dev Seed`,
      preferred_timing: HOMIGO_TEST_SLOT,
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

  await ensureServiceLink(supabase, workerId, serviceId, 5);

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

export interface HomigoBookingSeedResult {
  services: Array<{
    name: string;
    id: string;
    created: boolean;
    rateCardId: string;
    rateCardCreated: boolean;
  }>;
  workers: Array<{
    key: string;
    serviceName: string;
    id: string;
    workerCode: string;
    mobile: string;
    created: boolean;
  }>;
  matchPreview: Record<
    string,
    {
      count: number;
      error: string | null;
    }
  >;
}

/**
 * Idempotent dev seed:
 * - 5 Homigo services (if missing)
 * - Active rate cards @ ₹1000 each
 * - 6 test workers per service (30 total)
 */
export async function seedHomigoBookingTestData(
  supabase: SupabaseClient,
): Promise<HomigoBookingSeedResult> {
  const serviceResults: HomigoBookingSeedResult["services"] = [];

  for (const serviceName of HOMIGO_BOOKING_SERVICE_NAMES) {
    const service = await ensureServiceRow(supabase, serviceName);
    const rateCard = await ensureRateCard(supabase, service.id, serviceName);
    serviceResults.push({
      name: serviceName,
      id: service.id,
      created: service.created,
      rateCardId: rateCard.id,
      rateCardCreated: rateCard.created,
    });
  }

  const serviceIdByName = new Map(serviceResults.map((s) => [s.name, s.id]));
  const workers: HomigoBookingSeedResult["workers"] = [];

  for (const spec of HOMIGO_BOOKING_SEED_WORKERS) {
    const serviceId = serviceIdByName.get(spec.serviceName);
    if (!serviceId) {
      throw new Error(`Missing service id for ${spec.serviceName}`);
    }

    const ensured = await ensureSeedWorker(supabase, spec, serviceId);
    workers.push({
      key: spec.key,
      serviceName: spec.serviceName,
      id: ensured.id,
      workerCode: ensured.workerCode,
      mobile: spec.mobile,
      created: ensured.created,
    });
  }

  const matchPreview: HomigoBookingSeedResult["matchPreview"] = {};

  for (const serviceName of HOMIGO_BOOKING_SERVICE_NAMES) {
    const match = await matchWorkersForServiceRequest(supabase, {
      serviceType: serviceName,
      area: HOMIGO_TEST_AREA,
      pincode: HOMIGO_TEST_PINCODE,
    });
    matchPreview[serviceName] = {
      count: match.workers.length,
      error: match.error,
    };
  }

  return { services: serviceResults, workers, matchPreview };
}

/** Verify all 5 services resolve in catalog (used by scripts). */
export async function verifyHomigoServicesExist(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; missing: string[] }> {
  const { ids, error } = await resolveServiceIdsByName(
    supabase,
    [...HOMIGO_BOOKING_SERVICE_NAMES],
  );
  if (error) {
    return { ok: false, missing: [...HOMIGO_BOOKING_SERVICE_NAMES] };
  }
  return {
    ok: ids.length === HOMIGO_BOOKING_SERVICE_NAMES.length,
    missing: [],
  };
}
