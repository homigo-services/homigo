import { quickActions } from "@/lib/admin-data";

export function QuickActionsPanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 md:p-6">
      <h2 className="text-base font-bold text-homigo-primary sm:text-lg">
        Quick Actions
      </h2>
      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
        Common admin tasks at a glance
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="group min-h-11 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-homigo-secondary/30 hover:bg-white hover:shadow-md"
          >
            <p className="text-sm font-semibold text-homigo-primary transition-colors group-hover:text-homigo-secondary sm:text-base">
              {action.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {action.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
