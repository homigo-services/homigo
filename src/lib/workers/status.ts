import type { Worker, WorkerDisplayStatus } from "./types";
import { getWorkerDisplayStatus } from "./helpers";

/**
 * Worker lifecycle (single source of truth):
 *
 * PENDING — imported, not admin-approved (`status=pending`, `is_verified=false`)
 * ACTIVE  — admin approved (`status=active`, `is_verified=true`, typically available)
 * INACTIVE — admin deactivated an approved worker (`status=inactive`)
 * REJECTED — admin rejected application (`status=rejected`, `is_verified=false`)
 *
 * Active is NEVER inferred from documents alone; admin must explicitly approve.
 */

export function getWorkerStats(workers: Worker[]) {
  const counts = {
    total: workers.length,
    active: 0,
    pending: 0,
    inactive: 0,
    rejected: 0,
  };

  for (const worker of workers) {
    switch (getWorkerDisplayStatus(worker)) {
      case "Active":
        counts.active += 1;
        break;
      case "Pending":
        counts.pending += 1;
        break;
      case "Inactive":
        counts.inactive += 1;
        break;
      case "Rejected":
        counts.rejected += 1;
        break;
    }
  }

  return counts;
}

export function countWorkersByDisplayStatus(
  workers: Worker[],
  status: WorkerDisplayStatus,
): number {
  return workers.filter((w) => getWorkerDisplayStatus(w) === status).length;
}

export function getWorkerLifecycleLabel(worker: Worker): string {
  const display = getWorkerDisplayStatus(worker);
  switch (display) {
    case "Pending":
      return "Awaiting admin verification";
    case "Active":
      return worker.is_available
        ? "Verified and available for jobs"
        : "Verified but currently unavailable";
    case "Inactive":
      return "Deactivated by admin";
    case "Rejected":
      return "Application rejected by admin";
    default:
      return display;
  }
}
