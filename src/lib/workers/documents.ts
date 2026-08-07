import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkerDocumentMaxSizeMb, WORKER_DOCUMENT_EXTENSIONS } from "./config";
import { normalizeMediaUrl } from "./helpers";
import type {
  DocumentVerificationStatus,
  ImportWorkerInput,
  Worker,
  WorkerDocument,
  WorkerDocumentInput,
  WorkerDocumentSlot,
} from "./types";

const MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export const WORKER_DOCUMENT_LABELS: Record<string, string> = {
  aadhaar: "Aadhaar Upload",
  address_proof: "Address Proof Upload",
  photo: "Photo Upload",
  police_verification: "Police Verification Upload",
  certificate: "Certificate Document Upload",
};

/** Google Form field order for document previews. */
export const WORKER_DOCUMENT_DISPLAY_ORDER = [
  "aadhaar",
  "address_proof",
  "photo",
  "police_verification",
  "certificate",
] as const;

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validateWorkerDocumentFile(file: File): string | null {
  const ext = getExtension(file.name);
  if (!MIME_TYPES.has(file.type) && !WORKER_DOCUMENT_EXTENSIONS.includes(ext)) {
    return "Please upload a PDF, JPG, JPEG, or PNG file.";
  }

  const maxBytes = getWorkerDocumentMaxSizeMb() * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File must be ${getWorkerDocumentMaxSizeMb()} MB or smaller.`;
  }

  return null;
}

/** Read a local file into a data URL stored in worker_documents.file_url. */
export async function readWorkerDocumentFile(
  file: File,
): Promise<{ url: string; fileName: string; error: string | null }> {
  const validationError = validateWorkerDocumentFile(file);
  if (validationError) {
    return { url: "", fileName: file.name, error: validationError };
  }

  try {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string" || !result.trim()) {
          reject(new Error("Could not read file contents."));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => {
        reject(new Error(reader.error?.message ?? "Could not read file."));
      };
      reader.readAsDataURL(file);
    });

    return { url, fileName: file.name, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read file.";
    return { url: "", fileName: file.name, error: message };
  }
}

export function documentKeyToType(documentKey: string): string {
  switch (documentKey) {
    case "aadhaar":
      return "aadhaar";
    case "address-proof":
      return "address_proof";
    case "photo":
      return "photo";
    case "police-verification":
      return "police_verification";
    case "certificate":
      return "certificate";
    default:
      return documentKey.replace(/-/g, "_");
  }
}

export function documentUrlsFromImportInput(
  input: ImportWorkerInput,
): WorkerDocumentInput[] {
  const entries: [string, string | undefined][] = [
    ["aadhaar", input.aadhaarUrl],
    ["address_proof", input.addressProofUrl],
    ["photo", input.photoUrl],
    ["police_verification", input.policeVerificationUrl],
    ["certificate", input.certificateUrl],
  ];

  return entries
    .map(([documentType, url]) => ({
      documentType,
      fileUrl: normalizeMediaUrl(url) ?? "",
    }))
    .filter((row) => Boolean(row.fileUrl));
}

export function buildWorkerDocumentRows(
  workerId: string,
  documents: WorkerDocumentInput[],
): Array<{ worker_id: string; document_type: string; file_url: string }> {
  return documents.map((doc) => ({
    worker_id: workerId,
    document_type: doc.documentType,
    file_url: doc.fileUrl,
  }));
}

export async function insertWorkerDocuments(
  supabase: SupabaseClient,
  workerId: string,
  documents: WorkerDocumentInput[],
): Promise<{ count: number; error: string | null }> {
  if (documents.length === 0) {
    return { count: 0, error: null };
  }

  const rows = buildWorkerDocumentRows(workerId, documents);
  const { error } = await supabase.from("worker_documents").insert(rows);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: rows.length, error: null };
}

export async function syncWorkerDocuments(
  supabase: SupabaseClient,
  workerId: string,
  documents: WorkerDocumentInput[],
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from("worker_documents")
    .delete()
    .eq("worker_id", workerId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (documents.length === 0) {
    return { error: null };
  }

  const { error: insertError } = await supabase
    .from("worker_documents")
    .insert(buildWorkerDocumentRows(workerId, documents));

  return { error: insertError?.message ?? null };
}

const DOCUMENT_SELECT =
  "id, worker_id, document_type, file_url, created_at, verification_status, rejection_reason, verified_at, verified_by";

function normalizeVerificationStatus(
  value: unknown,
): DocumentVerificationStatus {
  if (
    value === "verified" ||
    value === "rejected" ||
    value === "pending_review" ||
    value === "not_uploaded"
  ) {
    return value;
  }
  return "pending_review";
}

function normalizeDocumentRow(row: Record<string, unknown>): WorkerDocument {
  return {
    id: String(row.id),
    worker_id: String(row.worker_id),
    document_type: String(row.document_type),
    file_url: String(row.file_url),
    created_at: String(row.created_at ?? ""),
    verification_status: normalizeVerificationStatus(row.verification_status),
    rejection_reason:
      row.rejection_reason === null || row.rejection_reason === undefined
        ? null
        : String(row.rejection_reason),
    verified_at:
      row.verified_at === null || row.verified_at === undefined
        ? null
        : String(row.verified_at),
    verified_by:
      row.verified_by === null || row.verified_by === undefined
        ? null
        : String(row.verified_by),
  };
}

/** Latest document per type (rows should be ordered created_at DESC). */
export function dedupeWorkerDocuments(documents: WorkerDocument[]): WorkerDocument[] {
  const byType = new Map<string, WorkerDocument>();
  for (const doc of documents) {
    if (!byType.has(doc.document_type)) {
      byType.set(doc.document_type, doc);
    }
  }
  return WORKER_DOCUMENT_DISPLAY_ORDER.map((type) => byType.get(type)).filter(
    (doc): doc is WorkerDocument => Boolean(doc),
  );
}

export async function attachWorkerDocuments(
  supabase: SupabaseClient,
  workerIds: string[],
): Promise<Map<string, WorkerDocument[]>> {
  const result = new Map<string, WorkerDocument[]>();
  if (workerIds.length === 0) return result;

  const { data, error } = await supabase
    .from("worker_documents")
    .select(DOCUMENT_SELECT)
    .in("worker_id", workerIds)
    .order("created_at", { ascending: false });

  let rows: Record<string, unknown>[] | null = data as Record<string, unknown>[] | null;
  if (error?.message.includes("verification_status")) {
    const fallback = await supabase
      .from("worker_documents")
      .select("id, worker_id, document_type, file_url, created_at")
      .in("worker_id", workerIds)
      .order("created_at", { ascending: false });
    if (fallback.error || !fallback.data) {
      return result;
    }
    rows = fallback.data as Record<string, unknown>[];
  } else if (error || !data) {
    return result;
  }

  if (!rows) {
    return result;
  }

  const grouped = new Map<string, WorkerDocument[]>();
  for (const row of rows) {
    const doc = normalizeDocumentRow(row as Record<string, unknown>);
    const list = grouped.get(doc.worker_id) ?? [];
    list.push(doc);
    grouped.set(doc.worker_id, list);
  }

  for (const [workerId, docs] of grouped) {
    result.set(workerId, dedupeWorkerDocuments(docs));
  }

  return result;
}

export function getDocumentUrlFromWorker(
  worker: {
    worker_documents?: WorkerDocument[];
    photo_url?: string | null;
    aadhaar_url?: string | null;
    address_proof_url?: string | null;
    police_verification_url?: string | null;
    certificate_url?: string | null;
  },
  documentType: string,
): string | null {
  const fromTable = worker.worker_documents?.find(
    (doc) => doc.document_type === documentType,
  )?.file_url;

  if (fromTable) {
    return normalizeMediaUrl(fromTable);
  }

  const legacyMap: Record<string, string | null | undefined> = {
    photo: worker.photo_url,
    aadhaar: worker.aadhaar_url,
    address_proof: worker.address_proof_url,
    police_verification: worker.police_verification_url,
    certificate: worker.certificate_url,
  };

  return normalizeMediaUrl(legacyMap[documentType]);
}

export function getDocumentVerificationStatus(
  document: WorkerDocument | null,
): DocumentVerificationStatus {
  if (!document?.file_url?.trim()) return "not_uploaded";
  return document.verification_status ?? "pending_review";
}

export function getWorkerDocumentSlots(worker: Worker): WorkerDocumentSlot[] {
  const byType = new Map<string, WorkerDocument>();
  for (const doc of worker.worker_documents ?? []) {
    if (!byType.has(doc.document_type)) {
      byType.set(doc.document_type, doc);
    }
  }

  return WORKER_DOCUMENT_DISPLAY_ORDER.map((documentType) => {
    const document = byType.get(documentType) ?? null;
    const url =
      document?.file_url?.trim() ||
      getDocumentUrlFromWorker(worker, documentType);

    return {
      documentType,
      label: WORKER_DOCUMENT_LABELS[documentType] ?? documentType,
      document,
      url,
      verificationStatus: url
        ? getDocumentVerificationStatus(document)
        : "not_uploaded",
      rejectionReason: document?.rejection_reason ?? null,
      verifiedAt: document?.verified_at ?? null,
      verifiedBy: document?.verified_by ?? null,
    };
  });
}
export async function ensureWorkerDocumentRecord(
  supabase: SupabaseClient,
  workerId: string,
  documentType: string,
  fileUrl: string,
): Promise<{ documentId: string | null; error: string | null }> {
  const url = normalizeMediaUrl(fileUrl);
  if (!url) {
    return { documentId: null, error: "Document URL is missing." };
  }

  const { data: existing } = await supabase
    .from("worker_documents")
    .select("id")
    .eq("worker_id", workerId)
    .eq("document_type", documentType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { documentId: String(existing.id), error: null };
  }

  const { data: inserted, error } = await supabase
    .from("worker_documents")
    .insert({
      worker_id: workerId,
      document_type: documentType,
      file_url: url,
      verification_status: "pending_review",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { documentId: null, error: error?.message ?? "Could not create document record." };
  }

  return { documentId: String(inserted.id), error: null };
}

export async function updateWorkerDocumentVerification(
  supabase: SupabaseClient,
  documentId: string,
  action: "verify" | "reject",
  options?: { rejectionReason?: string; verifiedBy?: string },
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const verifiedBy = options?.verifiedBy?.trim() || "admin";
  const updates: Record<string, unknown> =
    action === "verify"
      ? {
          verification_status: "verified",
          rejection_reason: null,
          verified_at: now,
          verified_by: verifiedBy,
        }
      : {
          verification_status: "rejected",
          rejection_reason: options?.rejectionReason?.trim() || "Rejected by admin",
          verified_at: now,
          verified_by: verifiedBy,
        };

  const { error } = await supabase
    .from("worker_documents")
    .update(updates)
    .eq("id", documentId);

  if (error?.message.includes("verification_status")) {
    return {
      error:
        "Document verification columns are not available. Run migration 006_worker_document_verification.sql.",
    };
  }

  return { error: error?.message ?? null };
}
