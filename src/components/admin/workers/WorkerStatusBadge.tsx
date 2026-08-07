import type { Worker } from "@/lib/workers/types";
import {
  getWorkerAvailabilityLabel,
  getWorkerDisplayStatus,
  getStatusBadgeClass,
  shouldShowWorkerAvailability,
} from "@/lib/workers/helpers";
import type { WorkerDisplayStatus } from "@/lib/workers/types";

interface WorkerStatusBadgeProps {
  status: WorkerDisplayStatus;
}

export function WorkerStatusBadge({ status }: WorkerStatusBadgeProps) {
  return (
    <span
      className={`rounded-full px-4 py-2 text-xs font-semibold ${getStatusBadgeClass(status)}`}
    >
      {status}
    </span>
  );
}

function availabilityBadgeClass(isAvailable: boolean): string {
  return isAvailable
    ? "bg-emerald-100 text-emerald-800"
    : "bg-orange-100 text-orange-800";
}

interface WorkerStatusDisplayProps {
  worker: Pick<Worker, "status" | "is_verified" | "is_available">;
  layout?: "badges" | "inline";
}

/** Lifecycle status plus availability (when lifecycle is Active). */
export function WorkerStatusDisplay({
  worker,
  layout = "badges",
}: WorkerStatusDisplayProps) {
  const lifecycle = getWorkerDisplayStatus(worker);
  const showAvailability = shouldShowWorkerAvailability(worker);

  if (layout === "inline") {
    return (
      <span className="text-sm font-medium text-slate-700">
        {showAvailability
          ? `${lifecycle} · ${getWorkerAvailabilityLabel(worker)}`
          : lifecycle}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <WorkerStatusBadge status={lifecycle} />
      {showAvailability && (
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${availabilityBadgeClass(worker.is_available)}`}
        >
          {getWorkerAvailabilityLabel(worker)}
        </span>
      )}
    </div>
  );
}
