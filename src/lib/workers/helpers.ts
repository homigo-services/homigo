import type {
  Worker,
  WorkerDisplayStatus,
  WorkerDocumentField,
} from "./types";
import {
  getDocumentUrlFromWorker,
  getWorkerDocumentSlots,
  WORKER_DOCUMENT_DISPLAY_ORDER,
  WORKER_DOCUMENT_LABELS,
} from "./documents";
import {
  getWorkerRegistrationFormUrl as getFormUrlFromConfig,
  isWorkerRegistrationFormConfigured,
} from "./config";
import { getServiceDisplayName } from "./service-resolver";

export function getWorkerName(worker: Pick<Worker, "Full name">): string {
  return worker["Full name"]?.trim() || "Unnamed Worker";
}

export function getWorkerDisplayStatus(
  worker: Pick<Worker, "status" | "is_verified">,
): WorkerDisplayStatus {
  if (worker.status === "rejected") return "Rejected";
  if (worker.status === "inactive") return "Inactive";
  if (!worker.is_verified || worker.status === "pending") return "Pending";
  return "Active";
}

/** Whether lifecycle is Active — availability is shown only in this state. */
export function shouldShowWorkerAvailability(
  worker: Pick<Worker, "status" | "is_verified">,
): boolean {
  return getWorkerDisplayStatus(worker) === "Active";
}

export function getWorkerAvailabilityLabel(
  worker: Pick<Worker, "is_available">,
): "Available" | "Unavailable" {
  return worker.is_available ? "Available" : "Unavailable";
}

export function formatWorkerStatusLine(
  worker: Pick<Worker, "status" | "is_verified" | "is_available">,
): string {
  const lifecycle = getWorkerDisplayStatus(worker);
  if (shouldShowWorkerAvailability(worker)) {
    return `${lifecycle} · ${getWorkerAvailabilityLabel(worker)}`;
  }
  return lifecycle;
}

export function getStatusBadgeClass(status: WorkerDisplayStatus): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-700";
    case "Pending":
      return "bg-yellow-100 text-yellow-700";
    case "Rejected":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function getWorkerServices(worker: Worker): string[] {
  return (
    worker.worker_services
      ?.map((s) => getServiceDisplayName(s))
      .filter(Boolean) ?? []
  );
}

export function formatServicesLabel(services: string[]): string {
  if (services.length === 0) return "—";
  return services.join(", ");
}

export function matchesServiceFilter(
  worker: Worker,
  serviceFilter: string,
): boolean {
  if (serviceFilter === "All Services") return true;
  const services = getWorkerServices(worker);
  return services.some(
    (s) => s.toLowerCase() === serviceFilter.toLowerCase(),
  );
}

export function parseServicesInput(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getWorkerDocumentFields(worker: Worker): WorkerDocumentField[] {
  return getWorkerDocumentSlots(worker)
    .filter((slot) => Boolean(slot.url))
    .map((slot) => ({
      label: slot.label,
      url: slot.url!,
      documentType: slot.documentType,
      documentId: slot.document?.id,
      verificationStatus: slot.verificationStatus,
      rejectionReason: slot.rejectionReason,
      verifiedAt: slot.verifiedAt,
      verifiedBy: slot.verifiedBy,
    }));
}

export function matchesWorkerSearch(
  worker: Pick<Worker, "Full name" | "mobile_number" | "worker_code">,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const name = getWorkerName(worker).toLowerCase();
  const mobile = worker.mobile_number?.toLowerCase() ?? "";
  const code = worker.worker_code?.toLowerCase() ?? "";

  return (
    name.includes(normalized) ||
    mobile.includes(normalized) ||
    code.includes(normalized)
  );
}

export function getWorkerPhotoUrl(
  worker: Pick<
    Worker,
    | "photo_url"
    | "worker_documents"
    | "aadhaar_url"
    | "address_proof_url"
    | "police_verification_url"
    | "certificate_url"
  >,
): string | null {
  return getDocumentUrlFromWorker(worker, "photo");
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  return url.trim();
}

/** Convert Google Drive share links to embeddable preview URLs. */
export function toPreviewUrl(url: string): string {
  const normalized = url.trim();

  const fileMatch = normalized.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (fileMatch) {
    return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  }

  const openMatch = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch && normalized.includes("drive.google.com")) {
    return `https://drive.google.com/file/d/${openMatch[1]}/preview`;
  }

  const ucMatch = normalized.match(
    /drive\.google\.com\/uc\?(?:export=view&)?id=([a-zA-Z0-9_-]+)/,
  );
  if (ucMatch) {
    return `https://drive.google.com/file/d/${ucMatch[1]}/preview`;
  }

  return normalized;
}

export function isImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  const preview = toPreviewUrl(url);
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(preview) ||
    preview.includes("drive.google.com/file/d/")
  );
}

export function isPdfUrl(url: string): boolean {
  if (url.startsWith("data:application/pdf")) return true;
  const preview = toPreviewUrl(url);
  return /\.pdf(\?|$)/i.test(preview) || preview.includes("drive.google.com");
}

export function getWorkerRegistrationFormUrl(): string {
  const url = getFormUrlFromConfig();
  if (url) return url;
  return "https://docs.google.com/forms";
}

export { isWorkerRegistrationFormConfigured };

export function capitalizeServiceName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function dedupeServices(services: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const service of services) {
    const normalized = capitalizeServiceName(service);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}
