import type { WorkerStatus } from "./types";

export type WorkerPatchAction =
  | "approve"
  | "reject"
  | "deactivate"
  | "activate"
  | "restore"
  | "set_available"
  | "set_unavailable"
  | "update";

export interface WorkerPatchBody {
  action?: WorkerPatchAction;
  note?: string;
  services?: string[];
  worker?: Partial<{
    "Full name": string;
    mobile_number: string;
    alternatr_mobile: string | null;
    address_line: string | null;
    area: string | null;
    pincode: string | null;
    gender: string | null;
    qualification: string | null;
    preferred_language: string | null;
    preferred_timing: string | null;
    photo_url: string | null;
    experience_years: number;
    aadhaar_url: string | null;
    certificate_url: string | null;
    address_proof_url: string | null;
    police_verification_url: string | null;
    note: string | null;
    is_available: boolean;
  }>;
}

const VALID_ACTIONS: WorkerPatchAction[] = [
  "approve",
  "reject",
  "deactivate",
  "activate",
  "restore",
  "set_available",
  "set_unavailable",
  "update",
];

export function parseWorkerPatchBody(body: unknown): {
  ok: true;
  data: WorkerPatchBody;
} | {
  ok: false;
  message: string;
} {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body" };
  }

  const input = body as WorkerPatchBody;

  if (input.action && !VALID_ACTIONS.includes(input.action)) {
    return {
      ok: false,
      message: `action must be one of: ${VALID_ACTIONS.join(", ")}`,
    };
  }

  if (input.services !== undefined) {
    if (!Array.isArray(input.services)) {
      return { ok: false, message: "services must be an array of strings" };
    }
    for (const service of input.services) {
      if (typeof service !== "string" || !service.trim()) {
        return { ok: false, message: "each service must be a non-empty string" };
      }
    }
  }

  return { ok: true, data: input };
}

export function getStatusUpdatesForAction(
  action: WorkerPatchAction,
  note?: string,
): Record<string, unknown> {
  const base = {
    updated_at: new Date().toISOString(),
    ...(note !== undefined ? { note: note || null } : {}),
  };

  switch (action) {
    case "approve":
      return {
        ...base,
        is_verified: true,
        is_available: true,
        status: "active" satisfies WorkerStatus,
        deleted_at: null,
      };
    case "reject":
      return {
        ...base,
        is_verified: false,
        is_available: false,
        status: "rejected" satisfies WorkerStatus,
      };
    case "deactivate":
      return {
        ...base,
        is_available: false,
        status: "inactive" satisfies WorkerStatus,
      };
    case "activate":
      return {
        ...base,
        is_available: true,
        status: "active" satisfies WorkerStatus,
      };
    case "set_available":
      return {
        ...base,
        is_available: true,
      };
    case "set_unavailable":
      return {
        ...base,
        is_available: false,
      };
    case "restore":
      return {
        ...base,
        deleted_at: null,
        status: "pending" satisfies WorkerStatus,
        is_verified: false,
        is_available: false,
      };
    default:
      return base;
  }
}
