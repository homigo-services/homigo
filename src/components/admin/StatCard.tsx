import { cn } from "@/lib/cn";
import type { DashboardStat } from "@/lib/admin-data";

export function StatCard({ label, value, change, trend }: DashboardStat) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-5 md:p-6">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-homigo-primary sm:mt-2 sm:text-2xl md:text-3xl">
        {value}
      </p>
      <p
        className={cn(
          "mt-1 text-xs font-medium sm:mt-2",
          trend === "up" && "text-homigo-accent",
          trend === "down" && "text-red-500",
          trend === "neutral" && "text-slate-400",
        )}
      >
        {change}
      </p>
    </div>
  );
}
