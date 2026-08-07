import type { SupabaseClient } from "@supabase/supabase-js";
import { capitalizeServiceName } from "./helpers";
import type { Service, WorkerService, WorkerServiceInsertRow } from "./types";

type ServiceRow = {
  id: string;
  name?: string;
  service_name?: string;
  title?: string;
};

function normalizeServiceRow(row: ServiceRow): Service {
  const name =
    (typeof row.name === "string" && row.name) ||
    (typeof row.service_name === "string" && row.service_name) ||
    (typeof row.title === "string" && row.title) ||
    "Unknown Service";

  return { id: String(row.id), name };
}

export async function fetchServiceCatalog(
  supabase: SupabaseClient,
): Promise<{ data: Service[]; error: string | null }> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name")
    .order("name");

  if (!error && data) {
    return {
      data: (data as ServiceRow[]).map(normalizeServiceRow),
      error: null,
    };
  }

  const fallback = await supabase
    .from("services")
    .select("id, service_name")
    .order("service_name");

  if (fallback.error) {
    return { data: [], error: fallback.error.message };
  }

  return {
    data: (fallback.data as ServiceRow[]).map(normalizeServiceRow),
    error: null,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getServiceDisplayName(
  workerService: Pick<WorkerService, "service_id" | "services">,
): string {
  const joinedName = workerService.services?.name?.trim();
  if (joinedName && !UUID_PATTERN.test(joinedName)) {
    return joinedName;
  }

  return "Unknown Service";
}

/** Resolve service names when PostgREST join is unavailable. */
export async function hydrateWorkerServiceNames(
  supabase: SupabaseClient,
  workerServices: WorkerService[],
): Promise<WorkerService[]> {
  if (workerServices.length === 0) return workerServices;

  const needsHydration = workerServices.some((ws) => {
    const name = ws.services?.name?.trim();
    return !name || name === ws.service_id || UUID_PATTERN.test(name);
  });

  if (!needsHydration) return workerServices;

  const { data: catalog } = await fetchServiceCatalog(supabase);
  const byId = new Map(catalog.map((service) => [service.id, service.name]));

  return workerServices.map((ws) => {
    const joinedName = ws.services?.name?.trim();
    if (joinedName && joinedName !== ws.service_id && !UUID_PATTERN.test(joinedName)) {
      return ws;
    }

    const resolved = byId.get(ws.service_id);
    return {
      ...ws,
      services: {
        id: ws.service_id,
        name: resolved ?? "Unknown Service",
      },
    };
  });
}

export async function resolveServiceIdsByName(
  supabase: SupabaseClient,
  serviceNames: string[],
): Promise<{ ids: string[]; error: string | null }> {
  const normalizedNames = serviceNames.map((n) => capitalizeServiceName(n));
  if (normalizedNames.length === 0) {
    return { ids: [], error: null };
  }

  const { data: catalog, error } = await fetchServiceCatalog(supabase);
  if (error) {
    return { ids: [], error };
  }

  const byName = new Map(
    catalog.map((service) => [service.name.toLowerCase(), service.id]),
  );

  const ids: string[] = [];
  const missing: string[] = [];

  for (const name of normalizedNames) {
    const id = byName.get(name.toLowerCase());
    if (id) ids.push(id);
    else missing.push(name);
  }

  if (missing.length > 0) {
    return {
      ids: [],
      error: `Unknown services (add them to public.services first): ${missing.join(", ")}`,
    };
  }

  return { ids, error: null };
}

export function buildWorkerServiceInsertPayload(
  workerId: string,
  serviceIds: string[],
  experienceYears: number,
): WorkerServiceInsertRow[] {
  const years =
    Number.isFinite(experienceYears) && experienceYears >= 0 ? experienceYears : 0;

  return serviceIds.map((service_id) => ({
    worker_id: workerId,
    service_id,
    is_active: true,
    experience_years: years,
  }));
}
