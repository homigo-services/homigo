/** Workers module environment configuration (server + client safe reads). */

export function getWorkersImportSecret(): string | undefined {
  return process.env.WORKERS_IMPORT_SECRET;
}

export function getWorkerRegistrationFormUrl(): string {
  const url = process.env.NEXT_PUBLIC_WORKER_REGISTRATION_FORM_URL?.trim();
  if (url) return url;
  return "";
}

export function isWorkerRegistrationFormConfigured(): boolean {
  return getWorkerRegistrationFormUrl().length > 0;
}

export function isWorkersImportConfigured(): boolean {
  return Boolean(getWorkersImportSecret());
}

export function getWorkerStorageBucket(): string {
  return (
    process.env.NEXT_PUBLIC_WORKER_STORAGE_BUCKET?.trim() || "worker-documents"
  );
}

/** Maximum document upload size in megabytes. */
export function getWorkerDocumentMaxSizeMb(): number {
  const raw = process.env.NEXT_PUBLIC_WORKER_DOCUMENT_MAX_MB;
  const parsed = raw ? Number.parseInt(raw, 10) : 5;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export const WORKER_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/jpg,image/png";

export const WORKER_DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
