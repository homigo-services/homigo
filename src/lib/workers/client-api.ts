import { supabase } from "@/lib/supabase";
import { mapWorkerError } from "./errors";
import { documentUrlsFromImportInput } from "./documents";
import { dedupeServices } from "./helpers";
import { buildWorkerInsertFields } from "./import-fields";
import { validateImportWorkerInput } from "./import-validation";
import {
  fetchWorkerByIdWithRelations,
  fetchWorkersWithRelations,
  importWorkerWithServices,
  softDeleteWorker,
  syncWorkerServices,
} from "./queries";
import { syncWorkerDocuments } from "./documents";
import type {
  ImportWorkerInput,
  ImportWorkerResult,
  Worker,
  WorkerDocumentInput,
} from "./types";
import type { WorkerPatchAction } from "./validation";

export async function getWorkersClient(): Promise<{
  data: Worker[] | null;
  error: string | null;
}> {
  const result = await fetchWorkersWithRelations(supabase);
  return {
    data: result.data,
    error: result.error ? mapWorkerError(result.error) : null,
  };
}

export async function getWorkerClient(id: string): Promise<{
  data: Worker | null;
  error: string | null;
  notFound: boolean;
}> {
  const result = await fetchWorkerByIdWithRelations(supabase, id);
  return {
    ...result,
    error: result.error ? mapWorkerError(result.error) : null,
  };
}

export async function patchWorkerClient(
  id: string,
  input: {
    action?: WorkerPatchAction;
    note?: string;
    services?: string[];
    worker?: Record<string, unknown>;
    documents?: WorkerDocumentInput[];
  },
): Promise<{ data: Worker | null; error: string | null; message?: string | null }> {
  const response = await fetch(`/api/workers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = (await response.json()) as {
    success: boolean;
    message?: string;
    worker?: Worker;
  };

  if (!response.ok || !json.success) {
    return {
      data: null,
      error: mapWorkerError(json.message ?? "Could not update worker"),
    };
  }

  return {
    data: json.worker ?? null,
    error: null,
    message: json.message ?? null,
  };
}

export async function updateWorkerServicesClient(
  id: string,
  services: string[],
): Promise<{ data: Worker | null; error: string | null }> {
  const response = await fetch(`/api/workers/${id}/services`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services: dedupeServices(services) }),
  });

  const json = (await response.json()) as {
    success: boolean;
    message?: string;
    worker?: Worker;
  };

  if (!response.ok || !json.success) {
    return {
      data: null,
      error: mapWorkerError(json.message ?? "Could not update services"),
    };
  }

  return { data: json.worker ?? null, error: null };
}

export async function archiveWorkerClient(
  id: string,
): Promise<{ error: string | null }> {
  const response = await fetch(`/api/workers/${id}`, { method: "DELETE" });
  const json = (await response.json()) as {
    success: boolean;
    message?: string;
  };

  if (!response.ok || !json.success) {
    return {
      error: mapWorkerError(json.message ?? "Could not delete worker"),
    };
  }

  return { error: null };
}

export async function importWorkerClient(
  input: ImportWorkerInput,
): Promise<{ result: ImportWorkerResult | null; error: string | null }> {
  const validation = validateImportWorkerInput(input);
  if (!validation.ok) {
    return { result: null, error: validation.message };
  }

  const response = await fetch("/api/workers/import/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = (await response.json()) as {
    success: boolean;
    message?: string;
    worker_id?: string;
    worker_code?: string;
    worker_name?: string;
    services_count?: number;
    documents_count?: number;
    verification_status?: string;
    documents_pending_review?: number;
  };

  if (!response.ok || !json.success || !json.worker_id) {
    return {
      result: null,
      error: mapWorkerError(json.message ?? "Failed to import worker"),
    };
  }

  return {
    result: {
      workerId: json.worker_id,
      workerCode: json.worker_code ?? "",
      workerName: json.worker_name ?? input.fullName.trim(),
      servicesCount: json.services_count ?? 0,
      documentsCount: json.documents_count ?? 0,
      verificationStatus:
        json.verification_status ?? "Pending Verification",
      documentsPendingReview: json.documents_pending_review ?? 0,
    },
    error: null,
  };
}

/** Legacy direct Supabase import — kept for scripts/tests. */
export async function importWorkerDirect(
  input: ImportWorkerInput,
): Promise<{ workerId: string | null; error: string | null }> {
  const validation = validateImportWorkerInput(input);
  if (!validation.ok) {
    return { workerId: null, error: validation.message };
  }

  const workerFields = buildWorkerInsertFields(input);
  const documents = documentUrlsFromImportInput(input);

  const { workerId, error } = await importWorkerWithServices(
    supabase,
    workerFields,
    dedupeServices(input.services),
    documents,
  );

  return { workerId, error: error ? mapWorkerError(error) : null };
}
