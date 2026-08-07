import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWorkerDocumentMaxSizeMb,
  getWorkerStorageBucket,
  WORKER_DOCUMENT_EXTENSIONS,
} from "./config";

const MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const DOCUMENT_STORAGE_FOLDERS: Record<string, string> = {
  aadhaar: "aadhaar",
  address_proof: "address-proof",
  "address-proof": "address-proof",
  photo: "photo",
  police_verification: "police",
  "police-verification": "police",
  certificate: "certificate",
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validateWorkerDocumentUpload(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): string | null {
  const ext = getExtension(fileName);
  if (!MIME_TYPES.has(mimeType) && !WORKER_DOCUMENT_EXTENSIONS.includes(ext)) {
    return "Please upload a PDF, JPG, JPEG, or PNG file.";
  }

  const maxBytes = getWorkerDocumentMaxSizeMb() * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return `File must be ${getWorkerDocumentMaxSizeMb()} MB or smaller.`;
  }

  return null;
}

export function buildWorkerDocumentStoragePath(
  documentKey: string,
  fileName: string,
): string {
  const folder =
    DOCUMENT_STORAGE_FOLDERS[documentKey] ??
    documentKey.replace(/[^a-z0-9_-]/gi, "_");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
  return `${folder}/${Date.now()}-${safeName}`;
}

export async function uploadWorkerDocumentToStorage(
  supabase: SupabaseClient,
  fileBytes: ArrayBuffer,
  fileName: string,
  mimeType: string,
  documentKey: string,
): Promise<{ url: string | null; error: string | null }> {
  const validationError = validateWorkerDocumentUpload(
    fileName,
    mimeType,
    fileBytes.byteLength,
  );
  if (validationError) {
    return { url: null, error: validationError };
  }

  const bucket = getWorkerStorageBucket();
  const path = buildWorkerDocumentStoragePath(documentKey, fileName);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, fileBytes, {
      upsert: true,
      contentType: mimeType || undefined,
    });

  if (uploadError) {
    return {
      url: null,
      error: `File upload failed: ${uploadError.message}`,
    };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
