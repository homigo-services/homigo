import type { WorkerService } from "@/lib/workers/types";
import { getServiceDisplayName } from "@/lib/workers/service-resolver";

interface WorkerServicesListProps {
  services: WorkerService[];
  experienceYears?: number;
}

export function WorkerServicesList({
  services,
  experienceYears,
}: WorkerServicesListProps) {
  if (services.length === 0) {
    return (
      <p className="text-sm text-slate-500">No services registered yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {services.map((service) => {
        const years =
          service.experience_years ?? experienceYears ?? null;
        const active = service.is_active !== false;

        return (
          <div
            key={service.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800">
                {getServiceDisplayName(service)}
              </span>
              {years !== null && years !== undefined && (
                <span className="text-sm text-slate-600">
                  {years} yr{years === 1 ? "" : "s"} experience
                </span>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                active
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {active ? "Active" : "Inactive"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
