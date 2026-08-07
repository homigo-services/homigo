import type { GoogleFormWorkerPayload, ImportWorkerInput } from "./types";
import { dedupeServices, normalizeMediaUrl } from "./helpers";

function pick(payload: GoogleFormWorkerPayload, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = payload[key];
    if (Array.isArray(val) && val.length > 0) {
      return val
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .join(", ");
    }
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

function pickUrl(payload: GoogleFormWorkerPayload, ...keys: string[]): string | undefined {
  return normalizeMediaUrl(pick(payload, ...keys)) ?? undefined;
}

/** Map Google Form payload → ImportWorkerInput (same shape as Admin Import). */
export function googleFormPayloadToImportInput(
  payload: GoogleFormWorkerPayload,
): ImportWorkerInput {
  const experienceRaw = pick(
    payload,
    "Experience Years",
    "experience_years",
    "Experience",
  );
  const experienceYears = experienceRaw
    ? Number.parseInt(experienceRaw, 10)
    : 0;

  return {
    fullName: pick(payload, "Full Name", "Full name", "full_name", "Name") ?? "",
    mobile:
      pick(
        payload,
        "Mobile Number",
        "Mobile number",
        "mobile_number",
        "Mobile",
      ) ?? "",
    alternateMobile:
      pick(
        payload,
        "Alternate Mobile",
        "Alternate mobile",
        "alternatr_mobile",
      ) ?? undefined,
    gender: pick(payload, "Gender", "gender") ?? "",
    qualifications: parseMultiSelectInput(
      payload.Qualification ?? payload.qualification,
    ),
    preferredTimings: parseMultiSelectInput(
      payload["Preferred Timing"] ??
        payload["Preferred timing"] ??
        payload.preferred_timing,
    ),
    services: dedupeServices(
      parseMultiSelectInput(
        payload["Service Type"] ?? payload.Services ?? payload.services,
      ),
    ),
    experienceYears: Number.isFinite(experienceYears) ? experienceYears : 0,
    area: pick(payload, "Area", "area") ?? "",
    pincode: pick(payload, "Pincode", "pincode") ?? "",
    address:
      pick(
        payload,
        "Full Address",
        "Address line",
        "address_line",
        "Address",
      ) ?? "",
    aadhaarUrl: pickUrl(
      payload,
      "Aadhaar Upload",
      "Aadhaar Upload URL",
      "Aadhaar URL",
      "Aadhar URL",
    ),
    addressProofUrl: pickUrl(
      payload,
      "Address Proof Upload",
      "Address Proof Upload URL",
      "Address Proof URL",
    ),
    photoUrl: pickUrl(
      payload,
      "Photo Upload",
      "Photo Upload URL",
      "Photo URL",
      "Photo",
    ),
    policeVerificationUrl: pickUrl(
      payload,
      "Police Verification Upload",
      "Police Verification Upload URL",
      "Police Verification URL",
    ),
    certificateUrl: pickUrl(
      payload,
      "Certificate Document Upload",
      "Certificate Document Upload URL",
      "Certificate Upload URL",
      "Certificate URL",
    ),
  };
}

/** Generate unique worker_code for new imports — shared by Admin + Google Form. */
export function generateWorkerCode(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  const tail = digits.slice(-4).padStart(4, "0");
  const unique = Date.now().toString(36).toUpperCase();
  return `HW-${tail}${unique}`;
}

/** Build workers row fields — shared by Admin Import and Google Form import. */
export function buildWorkerInsertFields(
  input: ImportWorkerInput,
): Record<string, unknown> {
  return {
    worker_code: generateWorkerCode(input.mobile.trim()),
    "Full name": input.fullName.trim(),
    mobile_number: input.mobile.trim(),
    alternatr_mobile: input.alternateMobile?.trim() || null,
    gender: input.gender.trim(),
    qualification: joinMultiSelectValues(input.qualifications),
    preferred_timing: joinMultiSelectValues(input.preferredTimings),
    experience_years: input.experienceYears,
    area: input.area.trim(),
    pincode: input.pincode.trim(),
    address_line: input.address.trim(),
    last_login_at: null,
    status: "pending",
    is_verified: false,
    is_available: false,
    rating: 0,
    total_jobs_completed: 0,
    wallet_due_amount: 0,
  };
}

export function joinMultiSelectValues(values: string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

export function parseMultiSelectInput(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => v.trim()).filter(Boolean);
  }
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitStoredMultiSelect(
  value: string | null | undefined,
): string[] {
  if (!value?.trim()) return [];
  return parseMultiSelectInput(value);
}
