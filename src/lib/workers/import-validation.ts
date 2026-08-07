import type { ImportWorkerInput } from "./types";

export type ImportWorkerFieldKey =
  | "fullName"
  | "gender"
  | "mobile"
  | "services"
  | "qualifications"
  | "experienceYears"
  | "area"
  | "pincode"
  | "preferredTimings"
  | "address"
  | "catalog";

export interface ImportWorkerValidationIssue {
  field: ImportWorkerFieldKey;
  label: string;
  message: string;
}

export function getImportWorkerValidationIssues(
  input: ImportWorkerInput,
  options?: {
    loadingCatalog?: boolean;
    catalogCount?: number;
  },
): ImportWorkerValidationIssue[] {
  const issues: ImportWorkerValidationIssue[] = [];

  if (options?.loadingCatalog) {
    issues.push({
      field: "catalog",
      label: "Service Type",
      message: "Services are still loading. Please wait.",
    });
    return issues;
  }

  if ((options?.catalogCount ?? 0) === 0) {
    issues.push({
      field: "catalog",
      label: "Service Type",
      message: "No services available. Add services to the catalog first.",
    });
  }

  if (!input.fullName.trim()) {
    issues.push({
      field: "fullName",
      label: "Full Name",
      message: "Required — enter full name.",
    });
  }

  if (!input.gender?.trim()) {
    issues.push({
      field: "gender",
      label: "Gender",
      message: "Required — select gender.",
    });
  }

  const mobile = input.mobile.trim();
  if (!mobile) {
    issues.push({
      field: "mobile",
      label: "Mobile Number",
      message: "Required — enter mobile number.",
    });
  } else if (!/^\d{10}$/.test(mobile)) {
    issues.push({
      field: "mobile",
      label: "Mobile Number",
      message: "Mobile number must be exactly 10 digits.",
    });
  }

  if (input.alternateMobile?.trim()) {
    const alt = input.alternateMobile.trim();
    if (!/^\d{10}$/.test(alt)) {
      issues.push({
        field: "mobile",
        label: "Alternate Mobile",
        message: "Alternate mobile must be exactly 10 digits.",
      });
    }
  }

  if ((options?.catalogCount ?? 0) > 0 && input.services.length === 0) {
    issues.push({
      field: "services",
      label: "Service Type",
      message: "Required — select at least one service.",
    });
  }

  if (input.qualifications.length === 0) {
    issues.push({
      field: "qualifications",
      label: "Qualification",
      message: "Required — select at least one qualification.",
    });
  }

  const experience = input.experienceYears;
  if (
    experience === undefined ||
    experience === null ||
    !Number.isFinite(experience) ||
    experience < 0
  ) {
    issues.push({
      field: "experienceYears",
      label: "Experience Years",
      message: "Required — enter valid experience years (0 or more).",
    });
  }

  if (!input.area?.trim()) {
    issues.push({
      field: "area",
      label: "Area",
      message: "Required — enter area.",
    });
  }

  const pincode = input.pincode?.trim() ?? "";
  if (!pincode) {
    issues.push({
      field: "pincode",
      label: "Pincode",
      message: "Required — enter pincode.",
    });
  } else if (!/^\d{6}$/.test(pincode)) {
    issues.push({
      field: "pincode",
      label: "Pincode",
      message: "Pincode must be exactly 6 digits.",
    });
  }

  if (input.preferredTimings.length === 0) {
    issues.push({
      field: "preferredTimings",
      label: "Preferred Timing",
      message: "Required — select at least one preferred timing.",
    });
  }

  if (!input.address?.trim()) {
    issues.push({
      field: "address",
      label: "Full Address",
      message: "Required — enter full address.",
    });
  }

  return issues;
}

export function validateImportWorkerInput(input: ImportWorkerInput): {
  ok: true;
} | {
  ok: false;
  message: string;
} {
  const issues = getImportWorkerValidationIssues(input, { catalogCount: 1 });
  if (issues.length === 0) {
    return { ok: true };
  }
  return { ok: false, message: issues[0].message };
}

export function isImportWorkerInputValid(
  input: ImportWorkerInput,
  options?: {
    loadingCatalog?: boolean;
    catalogCount?: number;
  },
): boolean {
  return (
    getImportWorkerValidationIssues(input, options).length === 0
  );
}

export function formatImportWorkerValidationSummary(
  issues: ImportWorkerValidationIssue[],
): string {
  if (issues.length === 0) return "";
  const labels = [...new Set(issues.map((issue) => issue.label))];
  return `Complete required fields: ${labels.join(", ")}.`;
}
