import type { SupabaseClient } from "@supabase/supabase-js";
import { capitalizeServiceName } from "./helpers";
import { mapWorkerError } from "./errors";
import {
  attachWorkerDocuments,
  insertWorkerDocuments,
} from "./documents";
import {
  buildWorkerServiceInsertPayload,
  hydrateWorkerServiceNames,
  resolveServiceIdsByName,
} from "./service-resolver";
import type { Worker, WorkerDocumentInput, WorkerService } from "./types";

const WORKER_SERVICE_SELECT = `
  id,
  worker_id,
  service_id,
  is_active,
  experience_years,
  services ( id, name )
`;

const WORKER_SELECT_WITH_SERVICES = `
  *,
  worker_services ( ${WORKER_SERVICE_SELECT} )
`;

function normalizeWorkerService(row: Record<string, unknown>): WorkerService {
  const rawServices = row.services;
  let services: WorkerService["services"] = null;

  if (rawServices && typeof rawServices === "object" && !Array.isArray(rawServices)) {
    const s = rawServices as Record<string, unknown>;
    services = {
      id: String(s.id),
      name: String(s.name ?? s.service_name ?? "Unknown Service"),
    };
  } else if (Array.isArray(rawServices) && rawServices[0]) {
    const s = rawServices[0] as Record<string, unknown>;
    services = {
      id: String(s.id),
      name: String(s.name ?? s.service_name ?? "Unknown Service"),
    };
  }

  return {
    id: String(row.id),
    worker_id: String(row.worker_id),
    service_id: String(row.service_id),
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    experience_years:
      row.experience_years === undefined || row.experience_years === null
        ? null
        : Number(row.experience_years),
    services,
  };
}

function isMissingRelationError(message: string): boolean {
  return (
    message.includes("worker_services") ||
    message.includes("services") ||
    message.includes("relationship") ||
    message.includes("schema cache")
  );
}

async function attachWorkerServices(
  supabase: SupabaseClient,
  workers: Worker[],
): Promise<Worker[]> {
  if (workers.length === 0) return workers;

  const ids = workers.map((w) => w.id);

  const withJoin = await supabase
    .from("worker_services")
    .select(WORKER_SERVICE_SELECT)
    .in("worker_id", ids);

  if (!withJoin.error) {
    const byWorker = new Map<string, WorkerService[]>();
    for (const row of withJoin.data ?? []) {
      const service = normalizeWorkerService(row as Record<string, unknown>);
      const list = byWorker.get(service.worker_id) ?? [];
      list.push(service);
      byWorker.set(service.worker_id, list);
    }

    const hydrated = await Promise.all(
      workers.map(async (worker) => {
        const services = await hydrateWorkerServiceNames(
          supabase,
          byWorker.get(worker.id) ?? [],
        );
        return { ...worker, worker_services: services };
      }),
    );

    return hydrated;
  }

  const plain = await supabase
    .from("worker_services")
    .select("id, worker_id, service_id, is_active, experience_years")
    .in("worker_id", ids);

  const byWorker = new Map<string, WorkerService[]>();
  for (const service of (plain.data as WorkerService[]) ?? []) {
    const list = byWorker.get(service.worker_id) ?? [];
    list.push(service);
    byWorker.set(service.worker_id, list);
  }

  const hydrated = await Promise.all(
    workers.map(async (worker) => {
      const services = await hydrateWorkerServiceNames(
        supabase,
        byWorker.get(worker.id) ?? [],
      );
      return { ...worker, worker_services: services };
    }),
  );

  return hydrated;
}

async function attachWorkerDocumentsToWorkers(
  supabase: SupabaseClient,
  workers: Worker[],
): Promise<Worker[]> {
  if (workers.length === 0) return workers;

  const docMap = await attachWorkerDocuments(
    supabase,
    workers.map((w) => w.id),
  );

  return workers.map((worker) => ({
    ...worker,
    worker_documents: docMap.get(worker.id) ?? [],
  }));
}

async function finalizeWorkerRelations(
  supabase: SupabaseClient,
  workers: Worker[],
): Promise<Worker[]> {
  const withServices = await attachWorkerServices(supabase, workers);
  return attachWorkerDocumentsToWorkers(supabase, withServices);
}

export async function fetchWorkersWithRelations(
  supabase: SupabaseClient,
): Promise<{ data: Worker[] | null; error: string | null }> {
  const full = await supabase
    .from("workers")
    .select(WORKER_SELECT_WITH_SERVICES)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!full.error) {
    const workers = ((full.data as Worker[]) ?? []).map((worker) => ({
      ...worker,
      worker_services: (worker.worker_services ?? []).map((row) =>
        normalizeWorkerService(row as unknown as Record<string, unknown>),
      ),
    }));

    const withServices = await Promise.all(
      workers.map(async (worker) => ({
        ...worker,
        worker_services: await hydrateWorkerServiceNames(
          supabase,
          worker.worker_services ?? [],
        ),
      })),
    );

    const withDocuments = await attachWorkerDocumentsToWorkers(
      supabase,
      withServices,
    );
    return { data: withDocuments, error: null };
  }

  if (!isMissingRelationError(full.error.message)) {
    return { data: null, error: full.error.message };
  }

  const base = await supabase
    .from("workers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (base.error) {
    return { data: null, error: base.error.message };
  }

  const workers = await finalizeWorkerRelations(
    supabase,
    (base.data as Worker[]) ?? [],
  );
  return { data: workers, error: null };
}

export async function fetchWorkerByIdWithRelations(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: Worker | null; error: string | null; notFound: boolean }> {
  const full = await supabase
    .from("workers")
    .select(WORKER_SELECT_WITH_SERVICES)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!full.error) {
    const worker = full.data as Worker;
    const normalizedServices = (worker.worker_services ?? []).map((row) =>
      normalizeWorkerService(row as unknown as Record<string, unknown>),
    );
    const services = await hydrateWorkerServiceNames(supabase, normalizedServices);
    const [withDocuments] = await attachWorkerDocumentsToWorkers(supabase, [
      { ...worker, worker_services: services },
    ]);
    return {
      data: withDocuments,
      error: null,
      notFound: false,
    };
  }

  if (full.error.code === "PGRST116") {
    return { data: null, error: full.error.message, notFound: true };
  }

  if (!isMissingRelationError(full.error.message)) {
    return { data: null, error: full.error.message, notFound: false };
  }

  const base = await supabase
    .from("workers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (base.error) {
    return {
      data: null,
      error: base.error.message,
      notFound: base.error.code === "PGRST116",
    };
  }

  const [worker] = await finalizeWorkerRelations(supabase, [
    base.data as Worker,
  ]);
  return { data: worker ?? null, error: null, notFound: false };
}

async function rollbackWorkerImport(
  supabase: SupabaseClient,
  workerId: string,
): Promise<void> {
  await supabase.from("worker_documents").delete().eq("worker_id", workerId);
  await supabase.from("worker_services").delete().eq("worker_id", workerId);
  await supabase.from("workers").delete().eq("id", workerId);
}

export async function importWorkerWithServices(
  supabase: SupabaseClient,
  workerFields: Record<string, unknown>,
  serviceNames: string[],
  documents: WorkerDocumentInput[] = [],
): Promise<{
  workerId: string | null;
  error: string | null;
  servicesCount: number;
  documentsCount: number;
  workerCode: string | null;
}> {
  const fullName = String(workerFields["Full name"] ?? "").trim();
  const mobile = String(workerFields.mobile_number ?? "").trim();
  const workerCode = String(workerFields.worker_code ?? "").trim() || null;

  if (!fullName || !mobile) {
    return {
      workerId: null,
      error: "Full name and mobile number are required",
      servicesCount: 0,
      documentsCount: 0,
      workerCode: null,
    };
  }

  if (serviceNames.length === 0) {
    return {
      workerId: null,
      error: "At least one service is required",
      servicesCount: 0,
      documentsCount: 0,
      workerCode: null,
    };
  }

  const { data: existing } = await supabase
    .from("workers")
    .select("id")
    .eq("mobile_number", mobile)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    return {
      workerId: null,
      error: "Duplicate mobile number.",
      servicesCount: 0,
      documentsCount: 0,
      workerCode: null,
    };
  }

  const normalizedServices = serviceNames.map((name) => capitalizeServiceName(name));
  const { ids: serviceIds, error: resolveError } = await resolveServiceIdsByName(
    supabase,
    normalizedServices,
  );

  if (resolveError) {
    return {
      workerId: null,
      error: mapWorkerError(resolveError),
      servicesCount: 0,
      documentsCount: 0,
      workerCode: null,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("workers")
    .insert(workerFields)
    .select("id, worker_code")
    .single();

  if (insertError || !inserted) {
    return {
      workerId: null,
      error: mapWorkerError(insertError?.message ?? "Failed to create worker"),
      servicesCount: 0,
      documentsCount: 0,
      workerCode: null,
    };
  }

  const workerId = inserted.id as string;
  const resolvedWorkerCode =
    String(inserted.worker_code ?? workerCode ?? "").trim() || null;
  const experienceYears = Number(workerFields.experience_years ?? 0);

  if (serviceIds.length > 0) {
    const { error: servicesError } = await supabase
      .from("worker_services")
      .insert(
        buildWorkerServiceInsertPayload(workerId, serviceIds, experienceYears),
      );

    if (servicesError) {
      await rollbackWorkerImport(supabase, workerId);
      return {
        workerId: null,
        error: mapWorkerError(
          `Service linking failed: ${servicesError.message}`,
        ),
        servicesCount: 0,
        documentsCount: 0,
        workerCode: null,
      };
    }
  }

  let documentsCount = 0;
  if (documents.length > 0) {
    const { count, error: documentsError } = await insertWorkerDocuments(
      supabase,
      workerId,
      documents,
    );

    if (documentsError) {
      await rollbackWorkerImport(supabase, workerId);
      return {
        workerId: null,
        error: mapWorkerError(
          `Document was uploaded but could not be linked to the worker: ${documentsError}`,
        ),
        servicesCount: 0,
        documentsCount: 0,
        workerCode: null,
      };
    }

    documentsCount = count;
  }

  return {
    workerId,
    error: null,
    servicesCount: serviceIds.length,
    documentsCount,
    workerCode: resolvedWorkerCode,
  };
}

export async function syncWorkerServices(
  supabase: SupabaseClient,
  workerId: string,
  serviceNames: string[],
): Promise<{ error: string | null }> {
  const normalized = serviceNames.map((name) => capitalizeServiceName(name));

  const { ids, error: resolveError } = await resolveServiceIdsByName(
    supabase,
    normalized,
  );

  if (resolveError) {
    return { error: resolveError };
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from("worker_services")
    .select("worker_id, service_id, is_active, experience_years")
    .eq("worker_id", workerId);

  if (fetchError) {
    return { error: fetchError.message };
  }

  const { error: deleteError } = await supabase
    .from("worker_services")
    .delete()
    .eq("worker_id", workerId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (ids.length === 0) {
    return { error: null };
  }

  const { data: workerRow } = await supabase
    .from("workers")
    .select("experience_years")
    .eq("id", workerId)
    .maybeSingle();

  const experienceYears = Number(workerRow?.experience_years ?? 0);

  const rows = buildWorkerServiceInsertPayload(workerId, ids, experienceYears);
  const { error: insertError } = await supabase
    .from("worker_services")
    .insert(rows);

  if (insertError) {
    if ((existingRows ?? []).length > 0) {
      await supabase.from("worker_services").insert(existingRows);
    }
    return { error: insertError.message };
  }

  return { error: null };
}

export async function softDeleteWorker(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("workers")
    .update({
      deleted_at: new Date().toISOString(),
      is_available: false,
      status: "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  return { error: error?.message ?? null };
}
