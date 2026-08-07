import {
  getDocumentVerificationStatus,
  getWorkerDocumentSlots,
  WORKER_DOCUMENT_DISPLAY_ORDER,
  WORKER_DOCUMENT_LABELS,
} from "./documents";
import type { Worker, WorkerVerificationSummary } from "./types";

/** Document types required before admin can approve a worker. Empty = none required. */
export const REQUIRED_VERIFICATION_DOCUMENT_TYPES: string[] = [];

export function isDocumentRequiredForVerification(documentType: string): boolean {
  return REQUIRED_VERIFICATION_DOCUMENT_TYPES.includes(documentType);
}

export function getRequiredVerificationDocumentLabels(): string[] {
  return REQUIRED_VERIFICATION_DOCUMENT_TYPES.map(
    (type) => WORKER_DOCUMENT_LABELS[type] ?? type,
  );
}

export function getWorkerApprovalBlockers(worker: Worker): string[] {
  const blockers: string[] = [];

  for (const documentType of REQUIRED_VERIFICATION_DOCUMENT_TYPES) {
    const slot = getWorkerDocumentSlots(worker).find(
      (entry) => entry.documentType === documentType,
    );

    if (!slot?.url) {
      blockers.push(`${slot?.label ?? documentType} is required but not uploaded.`);
      continue;
    }

    const status = getDocumentVerificationStatus(slot.document);
    if (status !== "verified") {
      blockers.push(
        `${slot.label} must be verified before approval (current: ${status.replace(/_/g, " ")}).`,
      );
    }
  }

  return blockers;
}

export function canApproveWorker(worker: Worker): {
  ok: boolean;
  blockers: string[];
} {
  const blockers = getWorkerApprovalBlockers(worker);
  return { ok: blockers.length === 0, blockers };
}

export function getVerificationSummary(worker: Worker): WorkerVerificationSummary {
  const slots = getWorkerDocumentSlots(worker);
  const uploaded = slots.filter((slot) => Boolean(slot.url));
  const verified = uploaded.filter((slot) => slot.verificationStatus === "verified");
  const rejected = uploaded.filter((slot) => slot.verificationStatus === "rejected");
  const pending = uploaded.filter((slot) => slot.verificationStatus === "pending_review");

  const missingTypes = slots
    .filter((slot) => !slot.url)
    .map((slot) => slot.label);

  const approval = canApproveWorker(worker);

  let workerVerificationStatus: WorkerVerificationSummary["workerVerificationStatus"] =
    "Pending Verification";
  if (worker.status === "rejected") {
    workerVerificationStatus = "Rejected";
  } else if (worker.is_verified) {
    workerVerificationStatus = "Verified";
  }

  return {
    totalSlots: WORKER_DOCUMENT_DISPLAY_ORDER.length,
    uploadedCount: uploaded.length,
    verifiedCount: verified.length,
    rejectedCount: rejected.length,
    pendingCount: pending.length,
    missingTypes,
    canApprove: approval.ok,
    blockers: approval.blockers,
    workerVerificationStatus,
  };
}
